"""Bounded, opt-in Yahoo experiment. No ingestion client or active CLI import."""
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime, timezone
import argparse
import hashlib
import importlib.metadata
import json
import logging
import multiprocessing
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import time
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

from pea_collector.model import CollectorError, InstrumentMapping, normalize, utc
from pea_collector.runner import encoded, journal, read_journal, write_journal
from pea_collector.provider_mapping import ProviderMapping, parse_provider_mappings
from pea_collector.provider_shadow import FeedPolicy, select_shadow

FIELDS = ("symbol", "currency", "exchange", "exchangeTimezoneName", "quoteType",
          "regularMarketPrice", "regularMarketTime")
SAMPLES = (("AIR.PA", "EQUITY"), ("CW8.PA", "ETF"), ("WPEA.PA", "ETF"))
VERSIONS = {"yfinance": "1.8.0", "curl_cffi": "0.17.0"}


class CampaignStop(BaseException):
    """Do not let yfinance's broad Exception handlers swallow a hard stop."""


def category(url):
    """Allow only the inspected synchronous get_info endpoints; never log URLs."""
    try:
        parsed = urlsplit(url)
        if (parsed.scheme != "https" or parsed.username or parsed.password or
                parsed.port not in (None, 443) or parsed.fragment):
            raise ValueError()
        host, path = parsed.hostname, parsed.path
        if host == "fc.yahoo.com" and path in ("", "/"):
            return "cookie"
        if host in {"query1.finance.yahoo.com", "query2.finance.yahoo.com"}:
            if path == "/v1/test/getcrumb":
                return "crumb"
            if path == "/v7/finance/quote":
                return "quote"
            if path.startswith("/v10/finance/quoteSummary/"):
                return "summary"
            if path.startswith("/ws/fundamentals-timeseries/v1/finance/timeseries/"):
                return "fundamentals"
    except (ValueError, TypeError):
        pass
    raise CampaignStop("unexpected_endpoint")


class Budget:
    """One conservative parent-owned campaign budget, charged before I/O."""
    def __init__(self, save=lambda: None, *, http_limit=80, fetch_limit=12):
        if type(http_limit) is not int or not 1 <= http_limit <= 80 or type(fetch_limit) is not int or not 1 <= fetch_limit <= 12:
            raise CollectorError("invalid_capture_budget")
        self.http_limit, self.fetch_limit = http_limit, fetch_limit
        self.http = self.fetches = 0
        self.stop = None
        self.save = save

    def charge(self, kind):
        if self.stop:
            raise CollectorError(self.stop)
        attribute, limit = ("http", self.http_limit) if kind == "http" else ("fetches", self.fetch_limit)
        if kind not in {"http", "fetch"} or getattr(self, attribute) >= limit:
            self.stop = "capture_budget_exhausted"
            self.save()
            raise CollectorError(self.stop)
        setattr(self, attribute, getattr(self, attribute) + 1)
        self.save()  # A failed save never authorizes an outgoing request.


class TransportGuard:
    """Count native transfers AND pre-request reissues, not just Session calls.

    PREREQFUNCTION runs before each request on a connected/reused connection.
    The transfer is charged first (including DNS/connect failures); its first
    prereq uses that charge, additional prereqs require new parent permission.
    Redirects, proxies, async and alternate Python exits are disabled.
    """
    def __init__(self, permit):
        from curl_cffi import Curl, CurlOpt, CurlInfo, ffi, lib
        self.permit = permit
        self.CurlOpt, self.CurlInfo, self.ffi, self.lib = CurlOpt, CurlInfo, ffi, lib
        self.original_perform = Curl.perform
        self.active = None
        self.failure = None
        self.events = []
        self.prereq_calls = 0

    def fail(self, reason):
        self.failure = reason
        raise CampaignStop(reason)

    def perform(self, curl):
        if not self.active:
            self.fail("uncounted_transport_forbidden")
        self.permit()  # Includes a failed connection attempt, conservatively.
        first = True

        @self.ffi.callback("int(void *, char *, char *, int, int)")
        def prereq(_data, _remote, _local, _remote_port, _local_port):
            nonlocal first
            try:
                self.prereq_calls += 1
                if first:
                    first = False
                else:
                    self.permit()
                return 0
            except BaseException:
                self.failure = "capture_budget_or_parent_unavailable"
                return 1  # CURL_PREREQFUNC_ABORT, before the extra request.

        # curl_cffi 0.17.0 exposes ffi/lib but its Python setopt does not yet
        # adapt PREREQFUNCTION. Keep callback alive until perform returns.
        code = self.lib._curl_easy_setopt(curl._curl, self.CurlOpt.PREREQFUNCTION, prereq)
        if code:
            self.fail("native_budget_guard_unavailable")
        curl.setopt(self.CurlOpt.FOLLOWLOCATION, 0)
        curl.setopt(self.CurlOpt.MAXREDIRS, 0)
        curl.setopt(self.CurlOpt.PROXY, "")
        curl.setopt(self.CurlOpt.MAXFILESIZE_LARGE, 4194304)
        started = utc(datetime.now(timezone.utc))
        begin = time.monotonic()
        try:
            self.original_perform(curl)
            status = curl.getinfo(self.CurlInfo.RESPONSE_CODE)
            if status in (401, 403, 429) or 300 <= status < 400:
                self.fail("rate_limited" if status == 429 else "redirect_or_auth_required")
        finally:
            self.events.append({"category": self.active, "started_at": started,
                                "body_received_or_failed_at": utc(datetime.now(timezone.utc)),
                                "elapsed_seconds": time.monotonic() - begin})
            # Request reset follows in curl_cffi; clear pointer before Python
            # callback is released even if an exception interrupted the transfer.
            self.lib._curl_easy_setopt(curl._curl, self.CurlOpt.PREREQFUNCTION, self.ffi.NULL)
        if self.failure:
            self.fail(self.failure)

    def install(self):
        from curl_cffi import Curl, AsyncCurl
        from curl_cffi import requests as backend
        import requests
        import socket
        original_request = backend.Session.request
        guard = self

        def denied(*_args, **_kwargs):
            guard.fail("alternate_transport_forbidden")

        def request(session, method, url, *args, **kwargs):
            if guard.failure:
                guard.fail(guard.failure)
            if method.upper() != "GET" or args or kwargs.get("stream"):
                guard.fail("unexpected_request_mode")
            guard.active = category(url)
            kwargs.update(allow_redirects=False, max_redirects=0, stream=False,
                          proxies={}, proxy=None, verify=True)
            try:
                return original_request(session, method, url, **kwargs)
            finally:
                guard.active = None

        Curl.perform = lambda curl: guard.perform(curl)
        AsyncCurl.add_handle = denied
        backend.Session.request = request
        requests.sessions.Session.request = denied
        socket.socket.connect = socket.socket.connect_ex = denied
        socket.create_connection = socket.getaddrinfo = denied


def _worker(connection, directory):
    """Fresh Ticker per call, one Session/cache per worker; silent third-party I/O."""
    with open(os.devnull, "w") as sink, redirect_stdout(sink), redirect_stderr(sink):
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)
        logging.disable(logging.CRITICAL)
        try:
            if {name: importlib.metadata.version(name) for name in VERSIONS} != VERSIONS:
                raise CampaignStop("unsupported_capture_library")
            import yfinance as yf
            from yfinance._http import HAS_CURL_CFFI
            from yfinance.config import YfConfig
            from curl_cffi import requests as backend
            if not HAS_CURL_CFFI or YfConfig.network.retries != 0:
                raise CampaignStop("unsupported_capture_backend")
            yf.set_tz_cache_location(directory)

            def permit():
                connection.send(("http", None))
                if connection.recv() != "allow":
                    raise CampaignStop("capture_budget_exhausted")

            guard = TransportGuard(permit)
            guard.install()
            with backend.Session(impersonate="chrome", trust_env=False, retry=0,
                                 allow_redirects=False) as session:
                while True:
                    symbol = connection.recv()
                    try:
                        info = yf.Ticker(symbol, session=session).get_info()
                        result = {key: info.get(key) for key in FIELDS}
                        # IPC excludes profile/cookies and is bounded before send.
                        if len(encoded(result)) > 8192:
                            raise CampaignStop("capture_result_too_large")
                        connection.send(("result", {"raw": result, "events": guard.events}))
                        guard.events = []
                    except CampaignStop:
                        raise
                    except Exception:
                        connection.send(("unavailable", None))
        except EOFError:
            pass
        except BaseException as error:
            code = str(error) if isinstance(error, CampaignStop) else "capture_worker_failed"
            try:
                connection.send(("fatal", code))
            except (EOFError, OSError):
                pass
        finally:
            connection.close()


class SessionCapture:
    """Terminating process boundary; budget and prior results stay in the parent."""
    def __init__(self, budget, *, shared, timeout=15, target=_worker):
        if type(timeout) not in (int, float) or not 0.1 <= timeout <= 15 or type(shared) is not bool:
            raise CollectorError("invalid_capture_options")
        self.budget, self.shared, self.timeout, self.target = budget, shared, timeout, target
        self.process = self.connection = None
        self.cache = TemporaryDirectory(prefix="pea-yahoo-capture-")
        self.generation = 0
        self.reaped = []

    def close_worker(self):
        if self.process is None:
            return
        process = self.process
        if process.is_alive():
            process.terminate()
        process.join(timeout=0.2)
        if process.is_alive():
            process.kill()
            process.join(timeout=0.2)
        if process.is_alive():
            raise CollectorError("capture_worker_cleanup_failed")
        self.reaped.append(process.exitcode)
        process.close()
        self.connection.close()
        self.process = self.connection = None

    def close(self):
        self.close_worker()
        self.cache.cleanup()

    def fetch(self, symbol):
        if symbol not in {row[0] for row in SAMPLES}:
            raise CollectorError("invalid_capture_sample")
        self.budget.charge("fetch")
        deadline = time.monotonic() + self.timeout
        try:
            if self.process is None:
                context = multiprocessing.get_context("spawn")
                self.connection, child = context.Pipe()
                self.generation += 1
                directory = str(Path(self.cache.name) / str(self.generation))
                self.process = context.Process(target=self.target, args=(child, directory))
                self.process.start()
                child.close()
            self.connection.send(symbol)
            while self.connection.poll(max(0, deadline - time.monotonic())):
                phase, data = self.connection.recv()
                if phase == "http":
                    self.budget.charge("http")
                    self.connection.send("allow")
                elif phase == "result":
                    if not self.shared:
                        self.close_worker()
                    return data
                elif phase == "fatal":
                    raise CollectorError(data)
                else:
                    self.close_worker()
                    return None
            # A timeout can hide an in-flight attempt: retain its charge and stop.
            raise CollectorError("capture_attempt_timeout")
        except BaseException:
            self.close_worker()
            raise


def sample_mapping(index):
    symbol, kind = SAMPLES[index]
    return InstrumentMapping.parse({"instrument_id": f"00000000-0000-4000-8000-{index + 1:012d}",
        "symbol": symbol, "currency": "EUR", "reported_currency": "EUR", "price_unit": "currency_unit",
        "exchange": "PAR", "timezone": "Europe/Paris", "quote_type": kind})


def unique_yahoo_targets(requirements):
    """Union future portfolio demands, with D's identity-conflict validation."""
    unique = list(dict.fromkeys(requirements))
    mapped = parse_provider_mappings([{**vars(item), "provider": "yahoo", "data_kind": "last_trade",
                                      "adjustment": "unadjusted"} for item in unique])
    if len(mapped) > 20:
        raise CollectorError("invalid_capture_targets")
    return mapped


def evaluate_capture(state):
    """Safe offline comparison; use D selection, no second router or valuation."""
    rows = state["results"]
    summary = {"event": "yahoo_capture_review", "status": state["status"],
               "get_info_attempts": state["get_info_attempts"], "http_attempts": state["http_attempts"],
               "valid_observations": 0, "equal_time_conflicts": 0, "inconclusive_pairs": 0,
               "market_time_regressions": 0, "stale_observations": 0,
               "ingestion_writes": 0, "mode": "observation_only",
               "evaluation_clock": "parent_capture_received_at", "http_by_policy": {},
               "market_age_seconds": []}
    previous = {}
    for row in rows:
        observation = row["observation"]
        mode = "shared" if row["shared"] else "individual"
        summary["http_by_policy"][mode] = summary["http_by_policy"].get(mode, 0) + row.get("http_attempts", 0)
        if observation is None:
            continue
        summary["valid_observations"] += 1
        asof = datetime.fromisoformat(row["parent_received_at"])
        summary["market_age_seconds"].append(int((asof - datetime.fromisoformat(observation["market_timestamp"])).total_seconds()))
        mapping = ProviderMapping.parse({**vars(sample_mapping(row["sample"])), "provider": "yahoo",
                                         "data_kind": "last_trade", "adjustment": "unadjusted"})
        # Report-only age policy: no change to backend 45/60-minute policy.
        policy = FeedPolicy(mapping, True, True, True, 2700, 2700)
        decision = select_shadow([policy], [observation], asof, previous=previous.get(row["sample"]))
        reasons = [item["reason"] for item in decision["diagnostics"]]
        summary["market_time_regressions"] += "market_time_regression" in reasons
        summary["stale_observations"] += "stale" in reasons
        if decision["status"] == "selected":
            previous[row["sample"]] = observation
    for round_number in range(2):
        for sample in range(3):
            pair = [row for row in rows if row["round"] == round_number and row["sample"] == sample]
            if len(pair) != 2 or any(row["observation"] is None for row in pair):
                summary["inconclusive_pairs"] += 1
                continue
            first, second = pair
            gap = abs((datetime.fromisoformat(second["parent_received_at"]) -
                       datetime.fromisoformat(first["parent_received_at"])).total_seconds())
            left, right = first["observation"], second["observation"]
            if gap > 60 or left["market_timestamp"] != right["market_timestamp"]:
                summary["inconclusive_pairs"] += 1
            elif any(left[key] != right[key] for key in ("price", "currency", "price_unit", "instrument_id")):
                summary["equal_time_conflicts"] += 1
    summary["quality_gate"] = "requires_review"
    if summary["equal_time_conflicts"] or summary["market_time_regressions"]:
        summary["quality_gate"] = "no_go"
    return summary


def campaign(directory, session_date):
    """One private persistent claim: no resume or fresh-budget automatic retry."""
    now = datetime.now(timezone.utc)
    local = now.astimezone(ZoneInfo("Europe/Paris"))
    if (local.date().isoformat() != session_date or local.weekday() >= 5 or
            not (9, 30) <= (local.hour, local.minute) <= (16, 0)):
        raise CollectorError("capture_session_window_required")
    with journal(directory, "yahoo-session-campaign") as (path, _key):
        if path.exists():
            raise CollectorError("capture_already_started_inspect_receipt")
        state = {"version": 1, "status": "started", "started_at": utc(now),
                 "session_date": session_date, "results": []}
        budget = Budget()

        def save():
            state.update(http_attempts=budget.http, get_info_attempts=budget.fetches)
            write_journal(path, {"version": 1, "mapping": "yahoo-session-capture-v1",
                                "payload": state, "sha256": hashlib.sha256(encoded(state)).hexdigest()})

        budget.save = save
        save()
        deadline = time.monotonic() + 1200
        round_start = time.monotonic()
        try:
            for round_number in range(2):
                if round_number:
                    time.sleep(max(0, round_start + 900 - time.monotonic()))
                modes = [False, True] if round_number == 0 else [True, False]
                providers = {shared: SessionCapture(budget, shared=shared) for shared in modes}
                try:
                    for index in range(3):
                        for shared in modes:
                            if time.monotonic() >= deadline:
                                raise CollectorError("capture_campaign_timeout")
                            start = time.monotonic()
                            before = budget.http
                            response = providers[shared].fetch(SAMPLES[index][0])
                            received = datetime.now(timezone.utc)
                            row = {"round": round_number, "sample": index, "shared": shared,
                                   "parent_received_at": utc(received), "elapsed_seconds": time.monotonic() - start,
                                   "http_attempts": budget.http - before,
                                   "observation": None, "events": response["events"] if response else []}
                            if response:
                                try:
                                    row["observation"] = normalize(sample_mapping(index), response["raw"], received)
                                except CollectorError:
                                    row["reason"] = "invalid_provider_data"
                            else:
                                row["reason"] = "provider_unavailable"
                            state["results"].append(row)
                            save()
                finally:
                    for provider in providers.values():
                        provider.close()
            state["status"] = "captured_requires_review"
        except BaseException as error:
            state["status"] = "interrupted" if isinstance(error, KeyboardInterrupt) else "stopped"
            state["reason"] = str(error) if isinstance(error, CollectorError) else "capture_interrupted_or_failed"
            raise
        finally:
            save()
    return {"event": "yahoo_capture_saved", "status": state["status"],
            "http_attempts": budget.http, "get_info_attempts": budget.fetches,
            "ingestion_writes": 0, "automatic_retries": 0}


def main(argv=None):
    parser = argparse.ArgumentParser(allow_abbrev=False)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--execute", action="store_true")
    mode.add_argument("--report", action="store_true")
    parser.add_argument("--session-date")
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parents[2]
    directory = root / ".wrangler/yahoo-session-qualification"
    if args.report:
        try:
            with journal(directory, "yahoo-session-campaign") as (path, _key):
                print(json.dumps(evaluate_capture(read_journal(path)["payload"])))
                return 0
        except Exception:
            print('{"event":"yahoo_capture_review_unavailable"}')
            return 1
    if not args.execute:
        print(json.dumps({"event": "yahoo_capture_plan", "execute": False, "get_info_max": 12,
                          "http_attempts_max": 80, "ingestion_writes": 0, "automatic_retries": 0}))
        return 0
    try:
        # Fixed ignored location: cannot accidentally publish a capture elsewhere.
        result = campaign(directory, args.session_date)
        print(json.dumps(result))
        return 0
    except KeyboardInterrupt:
        print('{"event":"yahoo_capture_stopped","reason":"interrupted"}')
        return 130
    except BaseException as error:
        code = str(error) if isinstance(error, CollectorError) else "capture_failed_inspect_private_receipt"
        print(json.dumps({"event": "yahoo_capture_stopped", "reason": code}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
