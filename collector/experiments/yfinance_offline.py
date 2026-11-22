"""Installed-yfinance experiment with mandatory mocked I/O in spawned workers."""
from contextlib import redirect_stderr, redirect_stdout
from copy import deepcopy
import logging
import multiprocessing
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import time

from pea_collector.model import CollectorError, ProviderError

FIELDS = ("symbol", "currency", "exchange", "exchangeTimezoneName", "quoteType",
          "regularMarketPrice", "regularMarketTime")


def _worker(connection, cache_directory):
    """Run only synthetic requests; block Python and native HTTP exit points."""
    with open(os.devnull, "w") as sink, redirect_stdout(sink), redirect_stderr(sink):
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)
        logging.disable(logging.CRITICAL)
        stats = {"requests": [], "blocked_network_attempts": 0}

        def denied(*args, **kwargs):
            stats["blocked_network_attempts"] += 1
            raise RuntimeError("offline_network_forbidden")

        try:
            import socket
            socket.socket.connect = socket.socket.connect_ex = denied
            socket.create_connection = socket.getaddrinfo = denied
            import curl_cffi
            curl_cffi.Curl.perform = denied
            curl_cffi.AsyncCurl.add_handle = denied
            import requests
            requests.sessions.Session.request = denied
            from curl_cffi import requests as curl_requests
            import importlib.metadata
            import json
            import signal
            from http.cookiejar import Cookie
            from urllib.parse import urlsplit
            import yfinance as yf
            from yfinance._http import HAS_CURL_CFFI
            from yfinance.config import YfConfig
            from yfinance.exceptions import YFRateLimitError

            stats["versions"] = {name: importlib.metadata.version(name) for name in ("yfinance", "curl_cffi")}
            if stats["versions"] != {"yfinance": "1.8.0", "curl_cffi": "0.17.0"} or not HAS_CURL_CFFI or YfConfig.network.retries != 0:
                raise RuntimeError("unsupported_offline_library")
            yf.set_tz_cache_location(cache_directory)
            active = {}

            def request(session, method, url, *args, **kwargs):
                parsed = urlsplit(url)
                path = parsed.path
                category = ("cookie" if parsed.hostname == "fc.yahoo.com" else
                            "crumb" if "getcrumb" in path else
                            "summary" if "/quoteSummary/" in path else
                            "quote" if path == "/v7/finance/quote" else
                            "fundamentals" if "fundamentals-timeseries" in path else
                            "consent" if parsed.hostname == "guce.yahoo.com" else None)
                if (method.upper() != "GET" or parsed.scheme != "https" or category is None
                        or parsed.hostname not in {"fc.yahoo.com", "query1.finance.yahoo.com", "query2.finance.yahoo.com", "guce.yahoo.com"}):
                    return denied()
                stats["requests"].append({"category": category, "symbol": active.get("symbol"),
                                           "session": id(session), "timeout": kwargs.get("timeout")})
                response = curl_requests.Response()
                response.url = url
                response.status_code = 200
                response.headers["Content-Type"] = "application/json"
                if category == "cookie":
                    session.cookies.jar.set_cookie(Cookie(0, "A3", "synthetic-cookie", None, False,
                        ".yahoo.com", True, True, "/", True, False, int(time.time()) + 3600,
                        False, None, None, {}))
                    data = {}
                elif category == "crumb":
                    response.content = b"synthetic-crumb"
                    return response
                elif category == "consent":
                    response.content = b"<html></html>"
                    return response
                else:
                    mode = active.get("mode")
                    if mode in {"block", "block_ignore_terminate"}:
                        if mode == "block_ignore_terminate":
                            signal.signal(signal.SIGTERM, signal.SIG_IGN)
                        connection.send(("blocked", None, None, stats))
                        while True:
                            signal.pause()
                    if mode == "probe_native":
                        return curl_cffi.Curl().perform()
                    if mode == "probe_socket":
                        return socket.socket().connect(("127.0.0.1", 9))
                    if mode == "timeout":
                        raise TimeoutError("synthetic timeout")
                    if mode in {"rate_limited", "http_error"}:
                        response.status_code = 429 if mode == "rate_limited" else 503
                        response.ok = False
                        response.reason = "Synthetic HTTP error"
                    raw = active.get("raw")
                    if category == "summary":
                        data = {"quoteSummary": {"result": [], "error": None}}
                    elif category == "quote":
                        data = {"quoteResponse": {"result": [raw] if raw else [], "error": None}}
                    else:
                        data = {"timeseries": {"result": [], "error": None}}
                response.content = json.dumps(data).encode()
                return response

            curl_requests.Session.request = request
            with curl_requests.Session(impersonate="chrome") as session:
                while True:
                    symbol, outcome = connection.recv()
                    active.clear()
                    active.update(symbol=symbol, raw=outcome if isinstance(outcome, dict) else None,
                                  mode=outcome if isinstance(outcome, str) else None)
                    try:
                        # Fresh Ticker per attempt; only the HTTP session is shared.
                        info = yf.Ticker(symbol, session=session).get_info()
                        result = ("success", {key: info.get(key) for key in FIELDS})
                    except YFRateLimitError:
                        result = ("error", "rate_limited")
                    except Exception:
                        result = ("error", "provider_unavailable")
                    if stats["blocked_network_attempts"]:
                        connection.send(("fatal", "offline_network_forbidden", None, stats))
                    else:
                        connection.send(("result", *result, stats))
        except EOFError:
            pass
        except Exception:
            try:
                connection.send(("fatal", "offline_worker_failed", None, stats))
            except (OSError, EOFError):
                pass
        finally:
            connection.close()


class OfflineYFinanceCycle:
    """Experiment-only provider: one terminable worker/session per cycle or attempt.

    Time budget includes spawn/import and the entire get_info call. Parent-owned
    scripts and existing runner-owned observations survive worker termination.
    No credentials, live mode or unmocked transport can be selected.
    """

    def __init__(self, script, *, shared=True, timeout=3):
        if not isinstance(timeout, (int, float)) or isinstance(timeout, bool) or not 0.1 <= timeout <= 10:
            raise ValueError("invalid_offline_timeout")
        self.script, self.shared, self.timeout = deepcopy(script), shared, timeout
        self.cache = TemporaryDirectory(prefix="pea-yfinance-offline-")
        self.process = self.connection = None
        self.attempts = self.generations = 0
        self.traces, self.reaped = {}, []
        self.closed = self.block_entered = False

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    def _stop(self):
        if self.process is None:
            return
        process, killed = self.process, False
        if process.is_alive():
            process.terminate()
        process.join(timeout=0.2)
        if process.is_alive():
            killed = True
            process.kill()
            process.join(timeout=0.2)
        if process.is_alive():
            raise CollectorError("offline_worker_cleanup_failed")
        self.reaped.append({"pid": process.pid, "exitcode": process.exitcode, "killed": killed})
        process.close()
        self.connection.close()
        self.process = self.connection = None

    def close(self):
        """Reap the worker before discarding every experiment-owned cache."""
        self._stop()
        self.cache.cleanup()
        self.closed = True

    def fetch(self, symbol: str) -> dict:
        """Match the existing provider interface; never refetch previous symbols."""
        if self.closed or not isinstance(symbol, str) or not symbol.startswith("SYNTHETIC-"):
            raise CollectorError("invalid_offline_request")
        self.attempts += 1
        deadline = time.monotonic() + self.timeout
        if self.process is None:
            context = multiprocessing.get_context("spawn")
            self.connection, child = context.Pipe()
            self.generations += 1
            directory = Path(self.cache.name) / str(self.generations)
            self.process = context.Process(target=_worker, args=(child, str(directory)))
            self.process.start()
            child.close()
        outcomes = self.script.get(symbol, [])
        outcome = outcomes.pop(0) if outcomes else None
        try:
            self.connection.send((symbol, outcome))
            while self.connection.poll(max(0, deadline - time.monotonic())):
                phase, status, raw, stats = self.connection.recv()
                self.traces[self.generations] = stats
                if phase == "blocked":
                    self.block_entered = True
                    continue
                if phase == "fatal":
                    self._stop()
                    raise CollectorError(status)
                if status != "success":
                    self._stop()
                    raise ProviderError(raw)
                if not self.shared:
                    self._stop()
                return raw
            self._stop()
            raise ProviderError("provider_unavailable")
        except (EOFError, OSError):
            self._stop()
            raise ProviderError("provider_unavailable") from None
