"""Small bounded HTTPS transport. Never log URLs, headers, bodies or exceptions."""
import json
import re
import ssl
import time
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, ProxyHandler, Request, build_opener

from .model import CollectorError

USER_AGENT = "pea-tracker-collector/0.1.0"
APPLICATION_ERROR_CODES = frozenset({
    "invalid_token", "access_denied", "ingestion_disabled", "ingestion_unavailable",
    "authentication_unavailable", "unauthenticated", "forbidden", "invalid_request",
    "invalid_quotation", "unknown_instrument", "invalid_quotation_timestamps",
    "quotation_unit_mismatch", "duplicate_batch_observation",
    "quotation_ingestion_not_allowed", "idempotency_conflict",
    "quotation_observation_conflict", "internal_error", "unsupported_media_type",
    "not_acceptable", "method_not_allowed", "origin_forbidden", "payload_too_large",
})


@dataclass(frozen=True)
class HttpDiagnostic:
    """Safe response summary containing no bodies, claims or arbitrary messages."""

    status: int
    content_type: str
    origin: str
    code: str
    ray_id: str
    accepted: int | None = None


def classify_http_response(status: int, body: bytes, content_type: str,
                           ray_id: str = "", challenged: bool = False) -> HttpDiagnostic:
    """Project bounded JSON onto fixed codes; never forward upstream prose.

    Cloudflare 1010 requires its documented boolean marker, numeric code and
    matching HTTP status. An opaque denial remains unattributed.
    """
    media = content_type.split(";", 1)[0].strip().lower()
    media = media if media in {"application/json", "application/problem+json", "text/html",
                              "text/plain", "application/octet-stream"} else "other" if media else "missing"
    ray = ray_id if re.fullmatch(r"[a-fA-F0-9]{16,32}(?:-[A-Z]{3})?", ray_id) else "unavailable"

    def result(origin, code, accepted=None):
        return HttpDiagnostic(status, media, origin, code, ray, accepted)

    if challenged:
        return result("cloudflare_challenge", "challenge_response")
    if len(body) > 65536 or media not in {"application/json", "application/problem+json"}:
        return result("undetermined", "access_or_unknown_rejection")
    try:
        parsed = json.loads(body)
    except (ValueError, UnicodeError, RecursionError):
        return result("undetermined", "invalid_json_response")
    if not isinstance(parsed, dict):
        return result("undetermined", "unexpected_response_shape")
    if (status == 403 and parsed.get("status") == 403 and parsed.get("cloudflare_error") is True
            and type(parsed.get("error_code")) is int and parsed["error_code"] == 1010):
        return result("cloudflare_edge", "browser_integrity_1010")
    code = parsed.get("code")
    if (parsed.get("type") == "about:blank" and parsed.get("status") == status
            and isinstance(code, str) and code in APPLICATION_ERROR_CODES):
        return result("worker_contract", code)
    if status == 201:
        accepted, records = parsed.get("accepted"), parsed.get("data")
        if type(accepted) is int and 1 <= accepted <= 50 and isinstance(records, list) and len(records) == accepted:
            return result("worker_contract", "ingestion_accepted", accepted)
        return result("worker_contract", "unexpected_ingestion_response")
    return result("undetermined", "unrecognized_error_response")


def checked_url(value: str, local: bool = False) -> str:
    """Require a clean HTTPS URL, permitting HTTP loopback only when explicit."""
    try:
        parsed = urlsplit(value)
        valid = parsed.scheme == "https" and bool(parsed.hostname)
        if local and parsed.scheme == "http" and parsed.hostname == "127.0.0.1":
            valid = True
        if not valid or parsed.username or parsed.password or parsed.query or parsed.fragment or len(value) > 2048:
            raise ValueError()
        parsed.port
        return value
    except (ValueError, TypeError):
        raise CollectorError("invalid_endpoint") from None


class NoRedirect(HTTPRedirectHandler):
    """Prevent credentials from being forwarded through HTTP redirects."""

    def redirect_request(self, request, fp, code, msg, headers, newurl):
        """Decline every redirect instead of creating a follow-up request."""
        return None


class HttpTransport:
    """POST with a socket timeout, bounded responses and sanitized failures."""

    def __init__(self, timeout: int = 10, *, ssl_context: ssl.SSLContext | None = None):
        """Disable proxies and redirects, optionally selecting a verified CA context.

        Explicit contexts must retain certificate and hostname verification;
        the default continues to use the interpreter's system trust settings.
        """
        if not 1 <= timeout <= 30:
            raise ValueError("invalid_http_timeout")
        if ssl_context is not None and (ssl_context.verify_mode != ssl.CERT_REQUIRED or not ssl_context.check_hostname):
            raise ValueError("invalid_tls_context")
        self.timeout = timeout
        self.opener = build_opener(ProxyHandler({}), HTTPSHandler(context=ssl_context), NoRedirect())

    def post(self, url: str, body: bytes, headers: dict) -> tuple[int, bytes]:
        """Preserve the delivery API; expose only the fixed 1010 failure code."""
        status, data, content_type, ray, challenged = self._request(url, body, headers)
        if status == 403 and classify_http_response(status, data, content_type, ray, challenged).code == "browser_integrity_1010":
            raise CollectorError("browser_integrity_1010")
        return status, data if 200 <= status < 300 else b""

    def post_diagnostic(self, url: str, body: bytes, headers: dict) -> HttpDiagnostic:
        """Send once and return only safe metadata, using the same transport."""
        return classify_http_response(*self._request(url, body, headers))

    def _request(self, url: str, body: bytes, headers: dict) -> tuple[int, bytes, str, str, bool]:
        """Share TLS, authentication headers and limits without adding retries."""
        try:
            request = Request(url, data=body, headers=headers, method="POST")
            request.add_header("User-Agent", USER_AGENT)
            try:
                response = self.opener.open(request, timeout=self.timeout)
            except HTTPError as error:
                response = error
            with response:
                status = response.code
                content_type = response.headers.get("Content-Type", "")
                ray = response.headers.get("CF-Ray", "")
                challenged = response.headers.get("cf-mitigated", "") == "challenge"
                if not 200 <= status < 300 and content_type.split(";", 1)[0].strip().lower() not in {"application/json", "application/problem+json"}:
                    return status, b"", content_type, ray, challenged
                data = response.read(65537)
                if len(data) > 65536:
                    raise CollectorError("response_too_large")
                return status, data, content_type, ray, challenged
        except (URLError, TimeoutError, OSError):
            raise CollectorError("network_failure") from None


class StaticToken:
    """Local tests/operator-supplied short-lived machine access token only."""
    def __init__(self, value: str):
        """Reject empty, oversized or whitespace-containing bearer values."""
        if not value or len(value) > 8192 or any(c.isspace() for c in value):
            raise CollectorError("invalid_machine_token")
        self.value = value

    def get(self) -> str:
        """Return the injected token without performing authentication requests."""
        return self.value

    def headers(self) -> dict[str, str]:
        """Build the bearer header used only by explicit synthetic/legacy callers."""
        return {"Authorization": "Bearer " + self.get()}


class AccessServiceCredentials:
    """Present a dedicated Cloudflare Access service token on every ingestion request."""

    def __init__(self, client_id: str, client_secret: str):
        """Reject incomplete or unsafe header values without exposing credentials."""
        if not isinstance(client_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}\.access", client_id):
            raise CollectorError("invalid_access_credentials")
        if not isinstance(client_secret, str) or not 16 <= len(client_secret) <= 512 or not re.fullmatch(r"[\x21-\x7e]+", client_secret):
            raise CollectorError("invalid_access_credentials")
        self.client_id, self.client_secret = client_id, client_secret

    def headers(self) -> dict[str, str]:
        """Return the Access pair without an OAuth bearer, cookie or token request."""
        return {"CF-Access-Client-Id": self.client_id, "CF-Access-Client-Secret": self.client_secret}


class ClientCredentials:
    """Retain the legacy OAuth adapter for explicitly constructed compatibility clients."""

    def __init__(self, url: str, client_id: str, secret: str, audience: str, transport=None):
        """Validate private client configuration for an approved token issuer."""
        self.url = checked_url(url)
        self.audience = checked_url(audience)
        if not client_id or not secret or len(client_id) > 256 or len(secret) > 4096:
            raise CollectorError("invalid_machine_configuration")
        self.client_id, self.secret = client_id, secret
        self.transport = transport or HttpTransport()

    def get(self) -> str:
        """Request only quotes:ingest and validate the token response envelope.

        Cryptographic token verification remains the backend's responsibility.
        This adapter neither requests refresh tokens nor reuses the MCP identity.
        """
        body = urlencode({"grant_type": "client_credentials", "client_id": self.client_id,
                          "client_secret": self.secret, "audience": self.audience, "scope": "quotes:ingest"}).encode()
        status, data = self.transport.post(self.url, body, {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"})
        if status != 200:
            raise CollectorError("machine_authentication_failed")
        try:
            token = json.loads(data)
            if token.get("token_type", "").lower() != "bearer" or type(token.get("expires_in")) is not int or not 1 <= token["expires_in"] <= 300:
                raise ValueError()
            if "scope" in token and token["scope"] != "quotes:ingest":
                raise ValueError()
            return StaticToken(token["access_token"]).get()
        except (ValueError, TypeError, KeyError, AttributeError):
            raise CollectorError("invalid_machine_response") from None

    def headers(self) -> dict[str, str]:
        """Request a legacy token only when this adapter was explicitly selected."""
        return {"Authorization": "Bearer " + self.get()}


class IngestionClient:
    """Deliver immutable batches to the existing protected REST ingestion route."""

    def __init__(self, origin: str, tokens, *, allow_loopback: bool = False, transport=None, sleep=time.sleep):
        """Fix the ingestion path under a validated origin and inject test seams."""
        checked_url(origin, allow_loopback)
        if urlsplit(origin).path not in {"", "/"}:
            raise CollectorError("invalid_endpoint")
        self.url = origin.rstrip("/") + "/api/v1/quotation-batches"
        self.tokens, self.transport, self.sleep = tokens, transport or HttpTransport(), sleep

    def deliver(self, body: bytes, key: str, expected: int) -> dict:
        """Retry transient delivery failures with identical bytes and key.

        Authentication, authorization, conflicts and rate limits stop immediately.
        Successful responses must acknowledge the expected observation count.
        """
        if len(body) > 128 * 1024 or not 1 <= expected <= 20:
            raise CollectorError("invalid_batch")
        # Prepare credentials after collection and preserve them with the payload
        # across delivery attempts. Access validates the service pair on each request.
        authentication = self.tokens.headers()
        for attempt in range(3):
            try:
                status, data = self.transport.post(self.url, body, {"Content-Type": "application/json", "Accept": "application/json",
                                                               "Idempotency-Key": key, **authentication})
            except CollectorError as error:
                if str(error) != "network_failure":
                    raise
                status, data = 503, b""
            if status == 201:
                try:
                    result = json.loads(data)
                    if result["accepted"] != expected or type(result["accepted"]) is not int or len(result["data"]) != expected:
                        raise ValueError()
                    return {"accepted": expected}
                except (ValueError, TypeError, KeyError):
                    raise CollectorError("invalid_ingestion_response") from None
            if status == 401:
                raise CollectorError("ingestion_unauthenticated")
            if status == 403:
                raise CollectorError("ingestion_forbidden")
            if status == 409:
                raise CollectorError("ingestion_conflict")
            if status == 429:
                raise CollectorError("ingestion_rate_limited")
            if status not in {408, 500, 502, 503, 504}:
                raise CollectorError("ingestion_rejected")
            if attempt < 2:
                self.sleep(2 ** attempt)
        raise CollectorError("ingestion_unavailable")
