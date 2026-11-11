"""Small bounded HTTPS transport. Never log URLs, headers, bodies or exceptions."""
import json
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, ProxyHandler, Request, build_opener

from .model import CollectorError


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

    def __init__(self, timeout: int = 10):
        """Disable environment proxies and redirects for the trusted destination."""
        if not 1 <= timeout <= 30:
            raise ValueError("invalid_http_timeout")
        self.timeout = timeout
        self.opener = build_opener(ProxyHandler({}), HTTPSHandler(), NoRedirect())

    def post(self, url: str, body: bytes, headers: dict) -> tuple[int, bytes]:
        """Return status and a bounded success body; discard upstream error text."""
        try:
            with self.opener.open(Request(url, data=body, headers=headers, method="POST"), timeout=self.timeout) as response:
                data = response.read(65537)
                if len(data) > 65536:
                    raise CollectorError("response_too_large")
                return response.status, data
        except HTTPError as error:
            # Never consume or expose untrusted error bodies (possibly HTML/login).
            status = error.code
            error.close()
            return status, b""
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
