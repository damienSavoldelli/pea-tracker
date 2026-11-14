"""Verify service-token transport and reject ambiguous machine configuration."""
import json
from pathlib import Path

import pytest

from pea_collector.__main__ import machine_client, main
from pea_collector.http import AccessServiceCredentials, IngestionClient
from pea_collector.model import CollectorError


CLIENT_ID = "synthetic-collector.access"
CLIENT_SECRET = "synthetic-access-secret-fixture"


class Transport:
    """Capture synthetic requests without opening a network connection."""

    def __init__(self, responses):
        """Retain a test-owned sequence of server outcomes."""
        self.responses = list(responses)
        self.calls = []

    def post(self, url, body, headers):
        """Record one request and return the next fixed response."""
        self.calls.append((url, body, headers))
        return self.responses.pop(0)


def environment(**overrides):
    """Build clearly synthetic Access configuration for local construction tests."""
    return {"COLLECTOR_API_ORIGIN": "https://synthetic-ingestion.invalid",
            "COLLECTOR_ACCESS_CLIENT_ID": CLIENT_ID,
            "COLLECTOR_ACCESS_CLIENT_SECRET": CLIENT_SECRET, **overrides}


def test_access_delivery_uses_only_service_pair_and_preserves_retry_inputs():
    """Retries cannot replace Access credentials with a bearer or change the batch."""
    transport = Transport([(503, b""), (201, b'{"accepted":1,"data":[{}]}')])
    credentials = AccessServiceCredentials(CLIENT_ID, CLIENT_SECRET)
    client = IngestionClient("https://synthetic-ingestion.invalid", credentials,
                             transport=transport, sleep=lambda _: None)
    assert client.deliver(b'{"observations":[{}]}', "synthetic-access-key", 1) == {"accepted": 1}
    assert transport.calls[0] == transport.calls[1]
    headers = transport.calls[0][2]
    assert headers["CF-Access-Client-Id"] == CLIENT_ID
    assert headers["CF-Access-Client-Secret"] == CLIENT_SECRET
    assert "Authorization" not in headers and "Cookie" not in headers
    assert set(headers) == {"CF-Access-Client-Id", "CF-Access-Client-Secret", "Idempotency-Key", "Content-Type", "Accept"}


def test_production_defaults_to_access_and_local_access_is_explicit():
    """Access needs no token endpoint; loopback support never selects a human identity."""
    assert machine_client(environment()).tokens.headers() == AccessServiceCredentials(CLIENT_ID, CLIENT_SECRET).headers()
    local = environment(COLLECTOR_API_ORIGIN="http://127.0.0.1:8788", COLLECTOR_AUTH_MODE="cloudflare_access")
    assert machine_client(local, local=True).tokens.headers() == AccessServiceCredentials(CLIENT_ID, CLIENT_SECRET).headers()
    with pytest.raises(CollectorError, match="invalid_endpoint"):
        machine_client(local)


@pytest.mark.parametrize("client_id,secret", [
    ("", CLIENT_SECRET), ("synthetic-without-suffix", CLIENT_SECRET),
    ("synthetic-client.access\n", CLIENT_SECRET), ("a" * 129 + ".access", CLIENT_SECRET),
    (CLIENT_ID, ""), (CLIENT_ID, "short"), (CLIENT_ID, "x" * 513),
    (CLIENT_ID, "synthetic secret with spaces"), (CLIENT_ID, "synthetic-secret\r\ninjected"),
])
def test_invalid_credentials_fail_without_echoing_values(client_id, secret):
    """Header injection and incomplete configuration produce only a fixed error."""
    with pytest.raises(CollectorError) as failure:
        AccessServiceCredentials(client_id, secret)
    assert str(failure.value) == "invalid_access_credentials"


@pytest.mark.parametrize("name", ["COLLECTOR_ACCESS_TOKEN", "COLLECTOR_TOKEN_URL", "COLLECTOR_CLIENT_ID", "COLLECTOR_CLIENT_SECRET", "COLLECTOR_AUDIENCE"])
def test_access_configuration_never_falls_back_to_legacy_or_interactive_credentials(name):
    """Mixed credential sources are refused before any HTTP request."""
    with pytest.raises(CollectorError, match="mixed_machine_configuration"):
        machine_client(environment(**{name: "synthetic-legacy-marker"}))


@pytest.mark.parametrize("mode", ["oauth_client_credentials", "synthetic_bearer", "", "unrecognized"])
def test_non_access_production_modes_are_rejected(mode):
    """Production cannot silently select the compatibility OAuth adapter."""
    with pytest.raises(CollectorError, match="invalid_machine_auth_mode"):
        machine_client(environment(COLLECTOR_AUTH_MODE=mode))


def test_missing_service_secret_never_uses_old_oauth_configuration():
    """Legacy values do not satisfy the selected Access credential requirement."""
    with pytest.raises(CollectorError, match="invalid_access_credentials"):
        machine_client(environment(COLLECTOR_ACCESS_CLIENT_SECRET=""))
    with pytest.raises(CollectorError, match="mixed_machine_configuration"):
        machine_client({"COLLECTOR_API_ORIGIN": "https://synthetic-ingestion.invalid", "COLLECTOR_TOKEN_URL": "https://synthetic-issuer.invalid/token"})


def test_credential_errors_are_sanitized_in_cli_output(tmp_path, monkeypatch, capsys):
    """An approved synthetic live-path fixture cannot leak credential markers."""
    from pea_collector import __main__ as cli
    monkeypatch.setattr(cli, "parse_mappings", lambda _: [])
    env = environment(COLLECTOR_PROVIDER_APPROVED="true", COLLECTOR_COVERAGE_APPROVED="true",
                      COLLECTOR_SECURITY_APPROVED="true", COLLECTOR_MAPPING_JSON="[]",
                      COLLECTOR_ACCESS_CLIENT_SECRET="synthetic-invalid-secret\nmarker")
    assert main(["--mode", "live", "--cycle-id", "synthetic-safe-errors", "--state", str(tmp_path / "journal")], env) == 1
    output = capsys.readouterr().out
    assert json.loads(output) == {"event": "cycle_failed", "code": "invalid_access_credentials"}
    assert CLIENT_ID not in output and "marker" not in output
    assert not (tmp_path / "journal").exists()


def test_live_workflow_injects_only_the_access_pair_for_authentication():
    """Prepared automation selects Access without an OAuth token exchange secret."""
    text = (Path(__file__).parents[2] / ".github/workflows/quotation-collector.yml").read_text()
    assert "COLLECTOR_AUTH_MODE: cloudflare_access" in text
    assert "secrets.COLLECTOR_ACCESS_CLIENT_ID" in text and "secrets.COLLECTOR_ACCESS_CLIENT_SECRET" in text
    for name in ["COLLECTOR_TOKEN_URL", "COLLECTOR_CLIENT_ID", "COLLECTOR_CLIENT_SECRET", "COLLECTOR_AUDIENCE", "COLLECTOR_ACCESS_TOKEN"]:
        assert "secrets." + name not in text


@pytest.mark.parametrize("raw", ["", ".wrangler/catalogue-live/mapping.private.json", "{synthetic-private-marker"])
def test_invalid_mapping_json_fails_before_provider_or_delivery(raw, tmp_path, monkeypatch, capsys):
    """Malformed secret mappings emit a fixed code before any external operation."""
    from pea_collector import __main__ as cli

    def forbidden(*args, **kwargs):
        pytest.fail("Provider and HTTP client must not be constructed")

    monkeypatch.setattr(cli, "YFinanceProvider", forbidden)
    monkeypatch.setattr(cli, "machine_client", forbidden)
    env = environment(COLLECTOR_PROVIDER_APPROVED="true", COLLECTOR_COVERAGE_APPROVED="true",
                      COLLECTOR_SECURITY_APPROVED="true", COLLECTOR_MAPPING_JSON=raw)
    state = tmp_path / "journal"
    assert main(["--mode", "live", "--cycle-id", "synthetic-invalid-mapping", "--state", str(state)], env) == 1
    assert json.loads(capsys.readouterr().out) == {"event": "cycle_failed", "code": "invalid_mapping_json"}
    assert not state.exists()
