"""Offline exact-identity qualification; a ticker suffix never proves a MIC."""
from collections import Counter
import json
import re

from .model import CollectorError


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError()
        result[key] = value
    return result


def qualify_reference(body: bytes, catalogue: list[dict], *, venue_evidence: list[dict]) -> dict:
    """Match a private directory against exact ISIN/code/currency and venue proof.

    Catalogue keys: isin, candidate_eodhd_symbol, source_mic, currency. Venue proof
    keys: isin, symbol, mic, source. Evidence is trusted operator-reviewed input;
    this function cannot authenticate a document or infer missing metadata. Units,
    price semantics, rights and actual quote coverage remain separate gates.
    The returned private_rows must stay private; only summary may be logged.
    """
    try:
        if not isinstance(body, bytes) or len(body) > 4194304:
            raise ValueError()
        rows = json.loads(body, object_pairs_hook=_unique)
        if not isinstance(rows, list) or not isinstance(catalogue, list) or not 1 <= len(catalogue) <= 20:
            raise ValueError()
        if not isinstance(venue_evidence, list):
            raise ValueError()
        targets = set()
        for target in catalogue:
            if (not re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}[0-9]", target["isin"])
                    or not re.fullmatch(r"[A-Za-z0-9.^=_-]{1,64}\.PA", target["candidate_eodhd_symbol"])
                    or not re.fullmatch(r"[A-Z0-9]{4}", target["source_mic"])
                    or not re.fullmatch(r"[A-Z]{3}", target["currency"])):
                raise ValueError()
            key = (target["isin"], target["candidate_eodhd_symbol"])
            if key in targets:
                raise ValueError()
            targets.add(key)
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("Code"), str):
                raise ValueError()
        for proof in venue_evidence:
            if (set(proof) != {"isin", "symbol", "mic", "source"}
                    or not all(isinstance(value, str) and 0 < len(value) <= 512 for value in proof.values())
                    or any(ord(c) < 32 for value in proof.values() for c in value)):
                raise ValueError()
    except (ValueError, TypeError, KeyError, UnicodeError, RecursionError):
        raise CollectorError("invalid_reference_inputs") from None
    results = []
    for target in catalogue:
        symbol = target["candidate_eodhd_symbol"]
        matches = [r for r in rows if r["Code"] == symbol[:-3]]
        reason = "reference_absent"
        if len(matches) > 1:
            reason = "reference_ambiguous"
        elif matches:
            row = matches[0]
            if row.get("Isin") is None or row.get("Isin") == "":
                reason = "reference_isin_missing"
            elif row.get("Isin") != target["isin"]:
                reason = "reference_isin_mismatch"
            elif row.get("Currency") != target["currency"] or row.get("Exchange") != "PA":
                reason = "reference_currency_or_exchange_mismatch"
            else:
                proofs = [p for p in venue_evidence if p["isin"] == target["isin"] and p["symbol"] == symbol]
                reason = "reference_venue_pending"
                if proofs:
                    reason = "reference_identity_confirmed" if {p["mic"] for p in proofs} == {target["source_mic"]} else "reference_venue_conflict"
        results.append({"isin": target["isin"], "symbol": symbol, "reason": reason,
                        "identity_confirmed": reason == "reference_identity_confirmed"})
    return {"private_rows": results, "summary": {"event": "reference_qualification_completed",
            "targets": len(results), "reasons": dict(Counter(r["reason"] for r in results))}}
