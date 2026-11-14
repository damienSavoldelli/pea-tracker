"""Verify application identity and safe edge/API diagnostics without live services."""
import io
import json
import ssl
import threading
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import Mock
from urllib.error import HTTPError, URLError

import pytest

from pea_collector.http import (AccessServiceCredentials, HttpTransport, IngestionClient,
                                USER_AGENT, classify_http_response)
from pea_collector.model import CollectorError


@pytest.mark.parametrize("diagnostic", [False, True])
def test_actual_urllib_wire_headers_and_single_request(diagnostic):
    """Use real loopback HTTP to verify headers, exact bytes and no transport retry."""
    received = []
    credentials = AccessServiceCredentials("synthetic-collector.access", "synthetic-secret-fixture")
    body = b'{"observations":[{}]}'

    class Handler(BaseHTTPRequestHandler):
        """Capture one synthetic request without standard HTTP logging."""

        def log_message(self, *_):
            """Prevent request metadata from reaching test output."""

        def do_POST(self):
            """Acknowledge the request with one synthetic observation."""
            received.append((dict(self.headers), self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(201)
            self.send_header("Content-Type", "application/json")
            self.send_header("CF-Ray", "a000000000000001-FRA")
            self.end_headers()
            self.wfile.write(b'{"accepted":1,"data":[{}]}')

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        transport = HttpTransport()
        headers = {**credentials.headers(), "Content-Type": "application/json", "Idempotency-Key": "synthetic-key"}
        url = f"http://127.0.0.1:{server.server_port}/ingest"
        if diagnostic:
            result = transport.post_diagnostic(url, body, headers)
            assert result.status == 201 and result.accepted == 1 and result.code == "ingestion_accepted"
        else:
            assert transport.post(url, body, headers)[0] == 201
        assert len(received) == 1
        actual_headers, actual_body = received[0]
        actual_headers = {key.lower(): value for key, value in actual_headers.items()}
        assert actual_headers["user-agent"] == USER_AGENT == "pea-tracker-collector/0.1.0"
        assert actual_headers["cf-access-client-id"] == credentials.client_id
        assert actual_headers["cf-access-client-secret"] == credentials.client_secret
        assert actual_headers["idempotency-key"] == "synthetic-key" and actual_body == body
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize("media", ["application/json", "application/problem+json; charset=utf-8"])
def test_only_documented_cloudflare_1010_is_classified(media):
    """Cloudflare's marker and numeric code identify the edge without prose."""
    raw = {"cloudflare_error": True, "error_code": 1010, "status": 403,
           "error_name": "synthetic-private-marker", "detail": "synthetic-private-marker",
           "access_token": "synthetic-private-marker"}
    result = classify_http_response(403, json.dumps(raw).encode(), media, "a000000000000001-FRA")
    assert result.origin == "cloudflare_edge" and result.code == "browser_integrity_1010"
    assert "synthetic-private-marker" not in repr(asdict(result))


@pytest.mark.parametrize("patch", [
    {"cloudflare_error": False}, {"cloudflare_error": "true"}, {"error_code": "1010"},
    {"error_code": True}, {"error_code": 1020}, {"status": 401}, {"status": None},
])
def test_malformed_or_other_errors_never_claim_browser_integrity(patch):
    """A lookalike error cannot inherit the fixed 1010 diagnosis."""
    raw = {"cloudflare_error": True, "error_code": 1010, "status": 403, **patch}
    result = classify_http_response(403, json.dumps(raw).encode(), "application/json")
    assert result.origin == "undetermined" and result.code != "browser_integrity_1010"


@pytest.mark.parametrize("code,status", [
    ("access_denied", 403), ("forbidden", 403), ("origin_forbidden", 403),
    ("quotation_ingestion_not_allowed", 403), ("invalid_token", 401),
    ("quotation_unit_mismatch", 422), ("idempotency_conflict", 409),
    ("ingestion_disabled", 503), ("ingestion_unavailable", 503),
])
@pytest.mark.parametrize("media", ["application/json", "application/problem+json"])
def test_application_codes_survive_both_json_media_types(code, status, media):
    """Keep the API allowlist while excluding upstream details from diagnostics."""
    body = json.dumps({"type": "about:blank", "status": status, "code": code,
                       "detail": "synthetic-private-marker"}).encode()
    result = classify_http_response(status, body, media)
    assert result.origin == "worker_contract" and result.code == code
    assert "synthetic-private-marker" not in repr(result)


@pytest.mark.parametrize("body,media", [
    (b"<html>synthetic-private-marker</html>", "text/html"),
    (b"not-json", "application/json"), (b"[]", "application/json"),
    (b'{"type":"about:blank","status":403,"code":"synthetic_private_marker"}', "application/json"),
    (b"x" * 65537, "application/json"),
    (b"[" * 2000 + b"]" * 2000, "application/json"),
])
def test_untrusted_response_content_is_not_exposed(body, media):
    """Unknown bodies and malformed Ray IDs cannot enter the diagnostic summary."""
    result = classify_http_response(403, body, media, "synthetic-private-marker\n")
    assert result.origin == "undetermined" and result.ray_id == "unavailable"
    assert "synthetic-private-marker" not in repr(asdict(result))


def test_challenge_requires_explicit_signal_and_does_not_claim_1010():
    """A challenge indicator establishes its category but not an error number."""
    result = classify_http_response(403, b"private", "text/html", challenged=True)
    assert result.origin == "cloudflare_challenge" and result.code == "challenge_response"


def test_transport_classifies_1010_without_retry_or_secret_output(capsys):
    """Normal ingestion surfaces the fixed error and stops after one request."""
    body = json.dumps({"cloudflare_error": True, "error_code": 1010, "status": 403,
                       "detail": "synthetic-private-marker"}).encode()
    transport = HttpTransport()
    transport.opener = Mock()
    transport.opener.open.side_effect = HTTPError("https://synthetic.invalid", 403,
        "synthetic-private-marker", {"Content-Type": "application/json"}, io.BytesIO(body))
    credentials = AccessServiceCredentials("synthetic-collector.access", "synthetic-secret-fixture")
    with pytest.raises(CollectorError, match="^browser_integrity_1010$"):
        IngestionClient("https://synthetic.invalid", credentials, transport=transport).deliver(b"{}", "synthetic-key", 1)
    assert transport.opener.open.call_count == 1
    assert capsys.readouterr() == ("", "")


def test_regular_transport_discards_error_bodies_and_diagnostics_are_bounded():
    """Retain the existing delivery interface and enforce limits on JSON errors."""
    transport = HttpTransport()
    transport.opener = Mock()
    transport.opener.open.side_effect = HTTPError("https://synthetic.invalid", 403, "private",
        {"Content-Type": "application/json"}, io.BytesIO(b'{"message":"synthetic-private-marker"}'))
    assert transport.post("https://synthetic.invalid", b"{}", {}) == (403, b"")
    stream = io.BytesIO(b"x" * 65537)
    transport.opener.open.side_effect = HTTPError("https://synthetic.invalid", 403, "private",
        {"Content-Type": "application/json"}, stream)
    with pytest.raises(CollectorError, match="^response_too_large$"):
        transport.post_diagnostic("https://synthetic.invalid", b"{}", {})
    assert stream.closed


def test_tls_validation_is_mandatory_and_network_errors_stay_sanitized():
    """Explicit trust stores may change, but verification must stay enabled."""
    context = ssl.create_default_context()
    transport = HttpTransport(ssl_context=context)
    https = next(handler for handler in transport.opener.handlers if hasattr(handler, "_context"))
    assert https._context is context and context.check_hostname and context.verify_mode == ssl.CERT_REQUIRED
    context.check_hostname = False
    with pytest.raises(ValueError, match="^invalid_tls_context$"):
        HttpTransport(ssl_context=context)
    context.verify_mode = ssl.CERT_NONE
    with pytest.raises(ValueError, match="^invalid_tls_context$"):
        HttpTransport(ssl_context=context)
    transport.opener = Mock()
    transport.opener.open.side_effect = URLError("synthetic-private-marker")
    with pytest.raises(CollectorError, match="^network_failure$"):
        transport.post_diagnostic("https://synthetic.invalid", b"{}", {})
