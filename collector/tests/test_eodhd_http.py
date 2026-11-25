"""Simulated HTTP only: no Yahoo, EODHD, socket or normalization calls."""
from io import BytesIO
from http.client import IncompleteRead
from types import SimpleNamespace
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import HTTPSHandler, ProxyHandler

import pytest

import pea_collector.eodhd_http as module
from pea_collector.http import NoRedirect, USER_AGENT
from pea_collector.model import CollectorError

TOKEN = "synthetic-not-a-real-api-token"


def client_with_response(monkeypatch, result, *, status=200, timeout=7):
    """Replace opening HTTP entirely while retaining real request construction."""
    calls, handlers, reads = [], [], []
    response = HTTPError("https://synthetic.invalid", status, "synthetic", {"Content-Type": "application/json"}, BytesIO(result)) if isinstance(result, bytes) else None
    if response is not None:
        original_read = response.read

        def read(size):
            reads.append(size)
            return original_read(size)

        response.read = read

    def open_request(request, *, timeout):
        calls.append((request, timeout))
        if isinstance(result, Exception):
            raise result
        if status >= 300:
            raise response
        return response

    def build(*supplied):
        handlers.extend(supplied)
        return SimpleNamespace(open=open_request)

    monkeypatch.setattr(module, "build_opener", build)
    client = module.EodhdHttpClient({"EODHD_API_TOKEN": TOKEN}, timeout=timeout)
    return client, calls, handlers, reads


@pytest.mark.parametrize("symbols", [["SYNTHETIC-A.PA"], ["SYNTHETIC-A.PA", "SYNTHETIC-B.PA", "SYNTHETIC-C.PA"]])
def test_single_and_grouped_request_preserve_raw_bytes(monkeypatch, symbols):
    """One GET retains exact numeric text, body shape and request order."""
    body = b' [ {"code":"SYNTHETIC-A.PA","close":12.3400,"timestamp":1794218400} ]\n'
    client, calls, handlers, reads = client_with_response(monkeypatch, body)
    response = client.get_quotes(symbols)
    assert response.status == 200 and response.is_success and response.body == body
    assert response.content_type == "application/json" and reads == [65537]
    assert len(calls) == 1
    request, timeout = calls[0]
    url = urlsplit(request.full_url)
    assert url.scheme == "https" and url.netloc == "eodhd.com"
    assert url.path == f"/api/real-time/{symbols[0]}"
    expected = {"api_token": [TOKEN], "fmt": ["json"]}
    if len(symbols) > 1:
        expected["s"] = [",".join(symbols[1:])]
    assert parse_qs(url.query) == expected and timeout == 7
    assert request.get_method() == "GET" and request.get_header("User-agent") == USER_AGENT
    assert any(isinstance(handler, HTTPSHandler) for handler in handlers)
    assert next(handler for handler in handlers if isinstance(handler, ProxyHandler)).proxies == {}
    redirect = next(handler for handler in handlers if isinstance(handler, NoRedirect))
    assert redirect.redirect_request(request, None, 302, "redirect", {}, "https://other.invalid") is None


@pytest.mark.parametrize("status", [301, 302, 400, 401, 403, 404, 429, 500, 503])
def test_http_errors_keep_bodies_without_retry_or_logging(monkeypatch, capsys, status):
    """HTTP refusals are explicit responses, distinct from transport failures."""
    body = f"private response containing {TOKEN}".encode()
    client, calls, _, _ = client_with_response(monkeypatch, body, status=status)
    response = client.get_quotes(["SYNTHETIC.PA"])
    assert response.status == status and not response.is_success and response.body == body
    assert len(calls) == 1
    assert TOKEN not in repr(response) and "private response" not in repr(response)
    assert capsys.readouterr() == ("", "")


@pytest.mark.parametrize("failure,code", [
    (TimeoutError(TOKEN), "eodhd_timeout"),
    (URLError(TimeoutError(TOKEN)), "eodhd_timeout"),
    (URLError(TOKEN), "eodhd_network_failure"),
    (OSError(TOKEN), "eodhd_network_failure"),
    (IncompleteRead(TOKEN.encode(), 100), "eodhd_network_failure"),
])
def test_transport_errors_are_sanitized_and_not_retried(monkeypatch, capsys, failure, code):
    """A failed connection is not represented as an empty supplier response."""
    client, calls, _, _ = client_with_response(monkeypatch, failure)
    with pytest.raises(CollectorError, match=f"^{code}$") as error:
        client.get_quotes(["SYNTHETIC.PA"])
    assert TOKEN not in str(error.value) and len(calls) == 1
    assert capsys.readouterr() == ("", "")


@pytest.mark.parametrize("body", [b"{invalid-json", b"[]", b'{"error":"denied"}', b'[{"code":"SYNTHETIC.PA","close":null}]'])
def test_malformed_partial_or_error_payload_is_not_reinterpreted(monkeypatch, body):
    """HTTP 200 never implies valid, complete or financially normalized data."""
    client, _, _, _ = client_with_response(monkeypatch, body)
    assert client.get_quotes(["SYNTHETIC.PA", "MISSING.PA"]).body == body


@pytest.mark.parametrize("status", [200, 429])
def test_response_limit_applies_to_success_and_error_bodies(monkeypatch, status):
    """Oversized evidence fails explicitly rather than returning truncated bytes."""
    client, calls, _, _ = client_with_response(monkeypatch, b"x" * 65537, status=status)
    with pytest.raises(CollectorError, match="^eodhd_response_too_large$"):
        client.get_quotes(["SYNTHETIC.PA"])
    assert len(calls) == 1


@pytest.mark.parametrize("symbols", [[], "SYNTHETIC.PA", [None], ["../unsafe"], ["A.PA?s=OTHER"], ["A.PA", "A.PA"], [f"S{i}.PA" for i in range(21)]])
def test_invalid_symbol_lists_fail_before_http(monkeypatch, symbols):
    """Reject ambiguous batches and URL injection without silently deduplicating."""
    client, calls, _, _ = client_with_response(monkeypatch, b"[]")
    with pytest.raises(CollectorError, match="^invalid_eodhd_symbols$"):
        client.get_quotes(symbols)
    assert not calls


@pytest.mark.parametrize("token", [None, "", "bad\ntoken", "bad token", "x" * 513])
def test_missing_or_unsafe_environment_key_is_not_exposed(token):
    """Configuration errors disclose no token value or remote request."""
    with pytest.raises(CollectorError, match="^invalid_eodhd_configuration$"):
        module.EodhdHttpClient({"EODHD_API_TOKEN": token})


@pytest.mark.parametrize("timeout", [0, 31, True, "10"])
def test_invalid_timeout_is_rejected(timeout):
    with pytest.raises(CollectorError, match="^invalid_http_timeout$"):
        module.EodhdHttpClient({"EODHD_API_TOKEN": TOKEN}, timeout=timeout)


def test_default_key_is_read_from_environment_without_logging(monkeypatch, capsys):
    """No secret file or hardcoded production credential is needed."""
    monkeypatch.setenv("EODHD_API_TOKEN", TOKEN)
    client = module.EodhdHttpClient()
    assert TOKEN not in repr(client)
    assert capsys.readouterr() == ("", "")
