"""Isolated yfinance adapter; no network call on import or in synthetic tests."""
import logging
import multiprocessing
import os
from tempfile import TemporaryDirectory
from contextlib import redirect_stderr, redirect_stdout

from .model import ProviderError


def _fetch(symbol: str, connection, cache_directory: str):
    """Fetch selected Yahoo fields in a child with isolated cache and silent I/O."""
    # Third-party error text can include responses, URLs and symbols. None of it
    # may reach public Actions logs, including from native dependencies.
    with open(os.devnull, "w") as sink, redirect_stdout(sink), redirect_stderr(sink):
        os.dup2(sink.fileno(), 1)
        os.dup2(sink.fileno(), 2)
        logging.disable(logging.CRITICAL)
        try:
            import yfinance as yf
            yf.set_tz_cache_location(cache_directory)
            from yfinance.exceptions import YFRateLimitError
            try:
                raw = yf.Ticker(symbol).get_info()
                # Send only bounded fields used by normalization; no profile/news.
                fields = ["symbol", "currency", "exchange", "exchangeTimezoneName", "quoteType", "regularMarketPrice", "regularMarketTime"]
                result = {key: raw.get(key) for key in fields}
                connection.send(("success", result))
            except YFRateLimitError:
                connection.send(("error", "rate_limited"))
            except Exception:
                connection.send(("error", "provider_unavailable"))
        except Exception:
            connection.send(("error", "provider_unavailable"))
        finally:
            connection.close()


class YFinanceProvider:
    """Isolate yfinance retrievals behind a terminable process and private cache."""

    def __init__(self, timeout: int = 15, target=_fetch):
        """Set a bounded retrieval deadline and an injectable child target."""
        if not 1 <= timeout <= 30:
            raise ValueError("invalid_provider_timeout")
        self.timeout = timeout
        self.target = target

    def fetch(self, symbol: str) -> dict:
        """Return provider fields or a sanitized failure, then dispose child state.

        The parent terminates a stalled child rather than relying on yfinance's
        internal network timeouts. Temporary cookies and caches are not retained.
        """
        context = multiprocessing.get_context("spawn")
        receive, send = context.Pipe(duplex=False)
        cache = TemporaryDirectory(prefix="pea-yfinance-")
        process = context.Process(target=self.target, args=(symbol, send, cache.name))
        try:
            process.start()
            send.close()
            if not receive.poll(self.timeout):
                raise ProviderError("provider_unavailable")
            status, value = receive.recv()
            if status != "success":
                raise ProviderError(value)
            return value
        except (EOFError, OSError):
            raise ProviderError("provider_unavailable") from None
        finally:
            send.close()
            receive.close()
            if process.pid:
                if process.is_alive():
                    process.terminate()
                process.join(timeout=2)
                if process.is_alive():
                    process.kill()
                    process.join(timeout=2)
            cache.cleanup()
