"""Only new D4/D5/D2/D6 composition behavior, with synthetic transports."""
from dataclasses import replace
from datetime import timedelta
import json

import pytest

from pea_collector.eodhd_http import RawEodhdResponse
from pea_collector.eodhd_http import EodhdHttpClient
from pea_collector.model import CollectorError
from pea_collector.provider_mapping import ProviderMapping
from pea_collector.provider_observation import capture_shadow, observe_response
from pea_collector.provider_quota import PrivateQuotaLedger, UsageSnapshot
from pea_collector.provider_shadow import FeedPolicy


@pytest.fixture
def feeds(mappings):
    base = {**vars(mappings[0]), "data_kind": "last_trade", "adjustment": "unadjusted"}
    return [FeedPolicy(ProviderMapping.parse({**base, "provider": provider}), True, True, True,
                       120 if provider == "yahoo" else 1200, 120, provider == "eodhd")
            for provider in ("yahoo", "eodhd")]


def raw(feeds, now, **updates):
    row = {"code": feeds[1].mapping.symbol, "close": "12.340000", "timestamp": int((now - timedelta(seconds=900)).timestamp())}
    return RawEodhdResponse(200, json.dumps([{**row, **updates}]).encode(), "application/json")


def primary(feeds, now, age=60):
    return {"instrument_id": feeds[0].mapping.instrument_id, "provider": "yahoo", "price_kind": "last_trade",
            "adjustment": "unadjusted", "outcome": "success", "price": "12.35", "currency": feeds[0].mapping.currency,
            "price_unit": feeds[0].mapping.price_unit, "market_timestamp": (now - timedelta(seconds=age)).isoformat(),
            "fetched_at": now.isoformat(), "session_date": now.date().isoformat(), "provider_delay_seconds": None,
            "provenance": {"source": "synthetic", "reference": None}}


class Transport:
    def __init__(self, response):
        self.response, self.calls = response, []

    def get_quotes(self, symbols):
        self.calls.append(list(symbols))
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def execution(feeds, now, tmp_path, response=None, **kwargs):
    transport = Transport(response or raw(feeds, now))
    saved = []
    result = capture_shadow(feeds, transport, PrivateQuotaLedger(tmp_path / "private"),
        UsageSnapshot(now.date().isoformat(), 1, 0, now), "quotes", existing=[], clock=lambda: now,
        save_response=lambda body, receipt: saved.append((body, receipt)), **kwargs)
    return result, transport, saved


def test_parser_normalization_and_selection_are_connected_exactly(feeds, now):
    result = observe_response(feeds, raw(feeds, now), now, existing=[primary(feeds, now)])
    row = result["private_observations"][0]
    assert row["price"] == "12.340000" and row["provider_delay_seconds"] is None
    assert row["market_timestamp"] != row["fetched_at"]
    assert result["summary"]["decisions"] == {"primary_eligible": 1}
    assert result["private_decisions"][0]["provider"] == "yahoo"


def test_older_secondary_cannot_replace_previous_even_when_primary_missing(feeds, now):
    previous = {feeds[0].mapping.instrument_id: primary(feeds, now)}
    result = observe_response(feeds, raw(feeds, now), now, existing=[], previous=previous)
    assert result["summary"]["decisions"] == {"retain_previous": 1}
    assert result["private_decisions"][0]["diagnostics"][1]["reason"] == "market_time_regression"


def test_delayed_secondary_is_only_a_hypothetical_choice(feeds, now):
    result = observe_response(feeds, raw(feeds, now), now, existing=[])
    assert result["summary"]["decisions"] == {"delayed_secondary_eligible": 1}
    assert result["mode"] == "observation_only"
    assert not {"journal", "ingestion", "valuation"}.intersection(result)


def test_partial_batch_preserves_absent_symbol_and_per_row_failure(feeds, now):
    third = replace(feeds[1], mapping=replace(feeds[1].mapping,
        instrument_id="00000000-0000-4000-8000-000000000009", symbol="SYNTHETIC-MISSING.PA"))
    result = observe_response(feeds + [third], raw(feeds, now), now, existing=[])
    assert result["summary"]["successes"] == 1
    assert result["summary"]["failures"] == {"provider_unavailable": 1}
    assert result["private_observations"][1]["price"] is None


@pytest.mark.parametrize("response,reason", [
    (RawEodhdResponse(429, b"SYNTHETIC-SECRET", "text/plain"), "rate_limited"),
    (RawEodhdResponse(503, b"SYNTHETIC-SECRET", "text/plain"), "provider_unavailable"),
    (RawEodhdResponse(200, b"{", "application/json"), "invalid_provider_data")])
def test_batch_failures_keep_yahoo_and_never_echo_bodies(feeds, now, response, reason):
    result = observe_response(feeds, response, now, existing=[primary(feeds, now)])
    assert result["summary"]["failures"] == {reason: 1}
    assert result["summary"]["decisions"] == {"primary_eligible": 1}
    assert "SYNTHETIC-SECRET" not in json.dumps(result)


def test_invalid_one_row_does_not_relabel_it_as_current(feeds, now):
    result = observe_response(feeds, raw(feeds, now, timestamp=0), now, existing=[])
    assert result["summary"]["failures"] == {"invalid_provider_data": 1}
    assert result["private_observations"][0]["market_timestamp"] is None


def test_summary_omits_private_identity_prices_and_provenance(feeds, now):
    row = primary(feeds, now)
    row["provenance"]["source"] = "SYNTHETIC-PRIVATE-TEXT"
    result = observe_response(feeds, raw(feeds, now), now, existing=[row])
    text = json.dumps(result["summary"])
    for value in (feeds[0].mapping.instrument_id, feeds[0].mapping.symbol, "12.340000", "SYNTHETIC-PRIVATE-TEXT"):
        assert value not in text


def test_default_plan_neither_reserves_nor_fetches(feeds, now, tmp_path):
    result, transport, saved = execution(feeds, now, tmp_path)
    assert result["execute"] is False and result["max_units"] == 1
    assert transport.calls == [] and saved == [] and not (tmp_path / "private").exists()


def test_one_call_is_charged_saved_and_then_observed(feeds, now, tmp_path):
    result, transport, saved = execution(feeds, now, tmp_path, execute=True)
    assert transport.calls == [[feeds[1].mapping.symbol]] and len(saved) == 1
    assert saved[0][1]["reserved_units"] == 1
    assert result["summary"]["quota"]["charged_upper_bound"] == 2
    with pytest.raises(CollectorError, match="already_claimed"):
        execution(feeds, now, tmp_path, execute=True)


@pytest.mark.parametrize("field", ["coverage", "rights", "semantics", "allow_delayed"])
def test_unqualified_feed_stops_before_any_reservation_or_call(feeds, now, tmp_path, field):
    feeds[1] = replace(feeds[1], **{field: False})
    with pytest.raises(CollectorError, match="qualification_required"):
        execution(feeds, now, tmp_path, execute=True)
    assert not (tmp_path / "private").exists()


def test_transport_exception_is_sanitized_charged_and_not_retried(feeds, now, tmp_path):
    transport = Transport(RuntimeError("SYNTHETIC-SECRET"))
    quota = PrivateQuotaLedger(tmp_path / "private")
    arguments = dict(execute=True, existing=[], clock=lambda: now, save_response=lambda *args: None)
    with pytest.raises(CollectorError, match="^observation_transport_failed$"):
        capture_shadow(feeds, transport, quota, UsageSnapshot(now.date().isoformat(), 0, 0, now), "once", **arguments)
    assert len(transport.calls) == 1
    with pytest.raises(CollectorError, match="already_claimed"):
        capture_shadow(feeds, transport, quota, UsageSnapshot(now.date().isoformat(), 0, 0, now), "once", **arguments)
    assert len(transport.calls) == 1


def test_known_timeout_remains_diagnostic_without_echoing_raw_exception(feeds, now, tmp_path):
    with pytest.raises(CollectorError, match="^eodhd_timeout$"):
        execution(feeds, now, tmp_path, response=CollectorError("eodhd_timeout"), execute=True)


def test_capture_persistence_failure_keeps_claim_without_refetch(feeds, now, tmp_path):
    transport = Transport(raw(feeds, now))
    quota = PrivateQuotaLedger(tmp_path / "private")
    def fail(*args):
        raise OSError("SYNTHETIC-PRIVATE-PATH")
    arguments = dict(execute=True, existing=[], clock=lambda: now, save_response=fail)
    for expected in ("observation_capture_not_saved", "already_claimed"):
        with pytest.raises(CollectorError, match=expected):
            capture_shadow(feeds, transport, quota, UsageSnapshot(now.date().isoformat(), 0, 0, now), "once", **arguments)
    assert len(transport.calls) == 1


def test_http_failure_has_one_reserved_attempt_and_remains_observable(feeds, now, tmp_path):
    result, transport, saved = execution(feeds, now, tmp_path,
        response=RawEodhdResponse(429, b"{}", "application/json"), execute=True)
    assert len(transport.calls) == len(saved) == 1
    assert result["summary"]["failures"] == {"rate_limited": 1}


def test_real_http_adapter_wires_through_quota_parser_and_shadow_without_socket(feeds, now, tmp_path):
    from email.message import Message
    from io import BytesIO
    from urllib.parse import parse_qs, urlsplit

    class Response(BytesIO):
        code = 200
        headers = Message()
    Response.headers["Content-Type"] = "application/json"

    class Opener:
        calls = []
        def open(self, request, timeout):
            self.calls.append(request.full_url)
            assert timeout == 10
            return Response(raw(feeds, now).body)

    client = EodhdHttpClient({"EODHD_API_TOKEN": "synthetic-test-only"})
    client._opener = Opener()
    result = capture_shadow(feeds, client, PrivateQuotaLedger(tmp_path / "private"),
        UsageSnapshot(now.date().isoformat(), 1, 0, now), "once", execute=True,
        existing=[primary(feeds, now)], save_response=lambda *args: None, clock=lambda: now)
    assert len(client._opener.calls) == 1
    parsed = urlsplit(client._opener.calls[0])
    assert parsed.path.endswith(feeds[1].mapping.symbol)
    assert parse_qs(parsed.query)["api_token"] == ["synthetic-test-only"]
    assert result["summary"]["decisions"] == {"primary_eligible": 1}
    assert "synthetic-test-only" not in json.dumps(result)
