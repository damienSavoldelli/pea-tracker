"""Isolated raw EODHD HTTP transport; no financial interpretation or activation."""
from dataclasses import dataclass, field
from http.client import HTTPException
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPSHandler, ProxyHandler, Request, build_opener

from .http import NoRedirect, USER_AGENT
from .model import CollectorError


@dataclass(frozen=True)
class RawEodhdResponse:
    """Keep complete bounded response bytes, including HTTP errors, out of repr."""

    status: int
    body: bytes = field(repr=False)
    content_type: str = field(repr=False)

    @property
    def is_success(self) -> bool:
        """Report HTTP success only, never quote validity or financial freshness."""
        return 200 <= self.status < 300


class EodhdHttpClient:
    """GET raw snapshots once, without retries, JSON parsing or provider routing.

    The fixed origin, disabled proxies/redirects and byte/socket limits follow the
    existing transport conventions. The API token is never included in errors or
    logs. Callers must also keep request URLs and raw responses private.
    """

    def __init__(self, environment=None, *, timeout: int = 10):
        environment = os.environ if environment is None else environment
        token = environment.get("EODHD_API_TOKEN")
        if not isinstance(token, str) or not re.fullmatch(r"[\x21-\x7e]{1,512}", token):
            raise CollectorError("invalid_eodhd_configuration")
        if type(timeout) is not int or not 1 <= timeout <= 30:
            raise CollectorError("invalid_http_timeout")
        self._token, self.timeout = token, timeout
        self._opener = build_opener(ProxyHandler({}), HTTPSHandler(), NoRedirect())

    def get_quotes(self, symbols: list[str]) -> RawEodhdResponse:
        """Use one path symbol plus optional `s` symbols, returning untouched bytes.

        Twenty symbols is a local request bound, not a proven supplier entitlement.
        Missing symbols, partial results and even malformed JSON remain raw evidence;
        this layer never manufactures observations or fills absent fields.
        """
        if (not isinstance(symbols, list) or not 1 <= len(symbols) <= 20
                or any(not isinstance(symbol, str) or not re.fullmatch(r"[A-Za-z0-9.^=_-]{1,64}", symbol) for symbol in symbols)
                or len(set(symbols)) != len(symbols)):
            raise CollectorError("invalid_eodhd_symbols")
        parameters = {"api_token": self._token, "fmt": "json"}
        if len(symbols) > 1:
            parameters["s"] = ",".join(symbols[1:])
        url = "https://eodhd.com/api/real-time/" + quote(symbols[0], safe="") + "?" + urlencode(parameters)
        try:
            request = Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT}, method="GET")
            try:
                response = self._opener.open(request, timeout=self.timeout)
            except HTTPError as error:
                response = error
            with response:
                body = response.read(65537)
                if len(body) > 65536:
                    raise CollectorError("eodhd_response_too_large")
                return RawEodhdResponse(response.code, body, response.headers.get("Content-Type", ""))
        except TimeoutError:
            raise CollectorError("eodhd_timeout") from None
        except URLError as error:
            code = "eodhd_timeout" if isinstance(error.reason, TimeoutError) else "eodhd_network_failure"
            raise CollectorError(code) from None
        except (OSError, HTTPException):
            raise CollectorError("eodhd_network_failure") from None
