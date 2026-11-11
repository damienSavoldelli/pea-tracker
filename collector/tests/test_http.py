"""Test machine authentication, bounded delivery retries and redirect rejection."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

import pytest
from pea_collector.http import ClientCredentials, HttpTransport, IngestionClient, StaticToken
from pea_collector.model import CollectorError


class Transport:
    """Return scripted transport outcomes while retaining calls for assertions."""

    def __init__(self, responses):
        """Copy the response sequence so each test owns its transport state."""
        self.responses = list(responses)
        self.calls = []

    def post(self, url, body, headers):
        """Capture one request, then return or raise the next scripted outcome."""
        self.calls.append((url, body, headers))
        result = self.responses.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def test_delivery_retries_identical_bytes_and_key_only_for_transient_failures():
    """Transient delivery failures preserve the exact payload and idempotency key."""
    transport = Transport([(503, b"do not log"), CollectorError("network_failure"), (201, b'{"accepted":1,"data":[{}]}')])
    client = IngestionClient("https://synthetic-ingestion.invalid", StaticToken("synthetic-machine-token"), transport=transport, sleep=lambda _: None)
    assert client.deliver(b'{"observations":[{}]}', "synthetic-key", 1) == {"accepted": 1}
    assert len(transport.calls) == 3
    assert transport.calls[0] == transport.calls[1] == transport.calls[2]


@pytest.mark.parametrize("status,code", [(401, "ingestion_unauthenticated"), (403, "ingestion_forbidden"), (409, "ingestion_conflict"), (429, "ingestion_rate_limited"), (422, "ingestion_rejected"), (302, "ingestion_rejected")])
def test_no_retry_of_auth_conflicts_or_bad_payloads(status, code):
    """Permanent refusals and rate limits stop without another request."""
    transport = Transport([(status, b"synthetic-sensitive-marker")])
    with pytest.raises(CollectorError, match=code):
        IngestionClient("https://synthetic-ingestion.invalid", StaticToken("synthetic-token"), transport=transport).deliver(b"{}", "key", 1)
    assert len(transport.calls) == 1


def test_retries_are_bounded_and_success_body_is_checked():
    """Delivery stops at its retry limit and rejects inconsistent acknowledgments."""
    for responses, code in [([(503, b"")] * 3, "ingestion_unavailable"), ([(201, b'{"accepted":99,"data":[]}')], "invalid_ingestion_response")]:
        with pytest.raises(CollectorError, match=code):
            IngestionClient("https://synthetic-ingestion.invalid", StaticToken("synthetic-token"), transport=Transport(responses), sleep=lambda _: None).deliver(b"{}", "key", 1)


def test_machine_client_credentials_request_only_ingestion_and_short_lived_access_token():
    """Machine authentication requests only ingestion scope and no refresh token."""
    transport = Transport([(200, json.dumps({"access_token": "synthetic-machine-token", "token_type": "Bearer", "scope": "quotes:ingest", "expires_in": 300}).encode())])
    tokens = ClientCredentials("https://synthetic-issuer.invalid/oauth/token", "synthetic-client", "synthetic-secret-fixture", "https://synthetic-ingestion.invalid/collector", transport)
    assert tokens.get() == "synthetic-machine-token"
    body = parse_qs(transport.calls[0][1].decode())
    assert body["scope"] == ["quotes:ingest"] and body["grant_type"] == ["client_credentials"]
    assert "refresh_token" not in body


@pytest.mark.parametrize("patch", [{"expires_in": 301}, {"expires_in": True}, {"scope": "portfolio:admin"}, {"token_type": "other"}, {"access_token": "bad\ntoken"}])
def test_refuses_invalid_token_response(patch):
    """Unsupported token lifetimes, scopes and bearer values are refused."""
    raw = {"access_token": "synthetic-token", "token_type": "Bearer", "expires_in": 300, **patch}
    with pytest.raises(CollectorError):
        ClientCredentials("https://synthetic-issuer.invalid/token", "synthetic-client", "synthetic-secret", "https://synthetic-api.invalid/collector", Transport([(200, json.dumps(raw).encode())])).get()


@pytest.mark.parametrize("url", ["http://external.invalid", "https://user:password@example.invalid", "https://example.invalid?token=no", "https://example.invalid/extra", "file:///tmp/unsafe"])
def test_endpoint_must_be_clean_https_origin(url):
    """Ingestion configuration cannot embed credentials or redirect the API path."""
    with pytest.raises(CollectorError):
        IngestionClient(url, StaticToken("synthetic-token"))


def test_http_never_follows_redirect_with_machine_credentials():
    """A real loopback redirect cannot cause credentials to reach a second path."""
    received = []

    class Handler(BaseHTTPRequestHandler):
        """Serve a redirect without writing HTTP request details to test output."""

        def log_message(self, *_):
            """Suppress the standard handler's request logging."""
            pass

        def do_POST(self):
            """Record the requested path and point to an unrequested second path."""
            received.append(self.path)
            self.send_response(302); self.send_header("Location", "/unexpected"); self.end_headers()

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    try:
        status, _ = HttpTransport().post(f"http://127.0.0.1:{server.server_port}/ingest", b"{}", {"Authorization": "Bearer synthetic-token"})
        assert status == 302 and received == ["/ingest"]
    finally:
        server.shutdown(); server.server_close(); thread.join()
