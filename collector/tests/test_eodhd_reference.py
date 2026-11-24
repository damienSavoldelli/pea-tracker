"""Offline synthetic reference shapes; no replay of acquired quote tests."""
import json

import pytest

from pea_collector.eodhd_reference import qualify_reference
from pea_collector.model import CollectorError


TARGET = {"isin": "FR0000000001", "candidate_eodhd_symbol": "SYNTHETIC.PA", "source_mic": "ALXP", "currency": "EUR"}
ROW = {"Code": "SYNTHETIC", "Name": "Invented issuer", "Exchange": "PA", "Currency": "EUR", "Isin": "FR0000000001"}
PROOF = {"isin": "FR0000000001", "symbol": "SYNTHETIC.PA", "mic": "ALXP", "source": "Synthetic exact listing evidence"}


def qualify(rows, proofs=None):
    return qualify_reference(json.dumps(rows).encode(), [TARGET], venue_evidence=proofs or [])


def test_exact_isin_and_ticker_without_mic_proof_never_qualify_alxp():
    result = qualify([ROW])
    assert result["private_rows"][0]["reason"] == "reference_venue_pending"
    assert not result["private_rows"][0]["identity_confirmed"]
    assert qualify([ROW], [PROOF])["private_rows"][0]["identity_confirmed"]


@pytest.mark.parametrize("rows,reason", [([], "reference_absent"), ([ROW, ROW], "reference_ambiguous"),
    ([{**ROW, "Isin": None}], "reference_isin_missing"),
    ([{**ROW, "Isin": "FR0000000002"}], "reference_isin_mismatch"),
    ([{**ROW, "Currency": "USD"}], "reference_currency_or_exchange_mismatch"),
    ([{**ROW, "Exchange": "OTHER"}], "reference_currency_or_exchange_mismatch")])
def test_missing_ambiguous_or_wrong_identifiers_remain_explicit(rows, reason):
    assert qualify(rows)["private_rows"][0]["reason"] == reason


def test_conflicting_venue_proof_does_not_fall_back_to_suffix_or_name():
    wrong = {**PROOF, "mic": "XPAR"}
    assert qualify([ROW], [PROOF, wrong])["private_rows"][0]["reason"] == "reference_venue_conflict"


def test_summary_does_not_include_instrument_or_upstream_name():
    result = qualify([ROW], [PROOF])
    text = json.dumps(result["summary"])
    assert TARGET["isin"] not in text and "SYNTHETIC.PA" not in text and "Invented issuer" not in text


@pytest.mark.parametrize("body", [b'{}', b'[{"Code":"A","Code":"B"}]', b'[null]'])
def test_unusable_reference_structures_fail_closed(body):
    with pytest.raises(CollectorError, match="invalid_reference_inputs"):
        qualify_reference(body, [TARGET], venue_evidence=[])
