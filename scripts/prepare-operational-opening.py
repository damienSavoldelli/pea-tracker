"""Prepare a PRIVATE broker XLSX opening/import. No network, database or credential access.

Uses only stdlib, supports Strict/Transitional OOXML and preserves declared decimal
text via Decimal. Inputs/outputs contain private data and must never enter Git.
"""
import argparse
import hashlib
import json
import re
import uuid
import zipfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree as ET


def local(node):
    return node.tag.rsplit("}", 1)[-1]


def decimal_text(value):
    number = Decimal(value.replace("\u202f", "").replace("\xa0", "").replace(" ", "").replace(",", "."))
    if not number.is_finite() or number < 0:
        raise ValueError("Invalid nonnegative broker decimal")
    return format(number, "f").rstrip("0").rstrip(".") if "." in format(number, "f") else format(number, "f")


def read_positions(path, catalogue):
    with zipfile.ZipFile(path) as archive:
        shared = ET.fromstring(archive.read("xl/sharedStrings.xml")) if "xl/sharedStrings.xml" in archive.namelist() else []
        strings = ["".join(t.text or "" for t in n.iter() if local(t) == "t") for n in shared]
        root = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        rows = []
        for row in root.iter():
            if local(row) != "row":
                continue
            values = {}
            for cell in row:
                if local(cell) != "c":
                    continue
                value = next((n for n in cell if local(n) == "v"), None)
                raw = value.text if value is not None else ""
                if cell.get("t") == "s":
                    raw = strings[int(raw)]
                elif cell.get("t") == "inlineStr":
                    raw = "".join(n.text or "" for n in cell.iter() if local(n) == "t")
                values[re.sub("[0-9]", "", cell.get("r", ""))] = raw
            rows.append(values)
    header = rows[0]
    columns = {value: key for key, value in header.items()}
    required = ["ISIN", "Quantité", "PRU (EUR)", "Devise"]
    if any(name not in columns for name in required):
        raise ValueError("Unexpected broker export columns")
    by_isin = {}
    for instrument in catalogue:
        isin = instrument.get("isin")
        if isin in by_isin:
            raise ValueError("Ambiguous catalogue ISIN")
        by_isin[isin] = instrument
    positions = []
    for row in rows[1:]:
        isin = row.get(columns["ISIN"], "").strip()
        if not isin:
            continue
        if isin not in by_isin:
            raise ValueError("Export instrument missing from verified catalogue")
        if row.get(columns["Devise"]) != "EUR":
            raise ValueError("Unsupported broker currency")
        instrument_id = by_isin[isin]["instrument_id"]
        quantity = decimal_text(row[columns["Quantité"]])
        if quantity == "0":
            raise ValueError("Unexpected zero position")
        positions.append({"instrument_id": instrument_id, "quantity": quantity,
                          "declared_pru": decimal_text(row[columns["PRU (EUR)"]]), "currency": "EUR"})
    if len(positions) != len({p["instrument_id"] for p in positions}):
        raise ValueError("Duplicate broker position")
    return sorted(positions, key=lambda p: p["instrument_id"])


def prepare(args):
    config = json.loads(Path(args.config).read_text())
    variables = config["vars"]
    uuid.UUID(variables["FINANCIAL_PORTFOLIO_ID"])
    source = Path(args.xlsx)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    positions = read_positions(source, json.loads(Path(args.catalogue).read_text()))
    if len(positions) != args.expected_positions:
        raise ValueError("Unexpected position count")
    provenance = {"source": "Official broker positions export; opening declarations, not reconstructed transactions", "reference": "sha256:" + digest}
    for position in positions:
        position["provenance"] = dict(provenance)
    effective = datetime.fromisoformat(args.effective_at.replace("Z", "+00:00"))
    recorded = datetime.now(timezone.utc)
    if effective.tzinfo is None or effective >= recorded:
        raise ValueError("Invalid reference date")
    cash = decimal_text(args.cash)
    if len(cash.split(".")[-1]) > 2 and "." in cash:
        raise ValueError("Cash has more than two decimals")
    output = Path(args.output)
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = output / "reference.private.json"
    if target.exists():
        reference = json.loads(target.read_text())
        opening_id = reference["opening"]["id"]
        recorded_at = reference["opening"]["recorded_at"]
    else:
        opening_id = str(uuid.uuid4())
        recorded_at = recorded.isoformat(timespec="milliseconds").replace("+00:00", "Z")
    reference = {"portfolio_id": variables["FINANCIAL_PORTFOLIO_ID"], "owner_subject": variables["FINANCIAL_OWNER_ID"],
                 "historical_opening_id": variables["FINANCIAL_OPENING_ID"], "historical_opening_revision": int(variables["FINANCIAL_OPENING_REVISION"]),
                 "opening": {"id": opening_id, "revision": 1, "recorded_at": recorded_at,
                             "effective_at": effective.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
                             "provenance": provenance, "positions": positions,
                             "cash": {"currency": "EUR", "amount": cash}, "correction_reason": None},
                 "cash_provenance": {"source": args.cash_source, "reference": None},
                 "reason": "Owner-authorized operational restart; intermediate history deliberately not reconstructed"}
    if target.exists() and json.loads(target.read_text()) != reference:
        raise ValueError("Existing private reference differs; review before replacing")
    target.write_text(json.dumps(reference, indent=2, ensure_ascii=False) + "\n")
    target.chmod(0o600)
    sql_text = lambda value: "'" + str(value).replace("'", "''") + "'"
    values = [reference["portfolio_id"], opening_id, reference["owner_subject"], reference["historical_opening_id"],
              reference["historical_opening_revision"], json.dumps(reference, ensure_ascii=False, separators=(",", ":"))]
    sql = "INSERT INTO portfolio_operational_openings (portfolio_id,id,owner_subject,historical_opening_id,historical_opening_revision,reference_json) VALUES (" + ",".join(sql_text(v) for v in values) + ");\n"
    (output / "import.private.sql").write_text(sql)
    (output / "import.private.sql").chmod(0o600)
    print(json.dumps({"prepared": True, "positions": len(positions), "private_outputs": True, "remote_operations": False}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("xlsx", "catalogue", "config", "output", "cash", "cash-source", "effective-at"):
        parser.add_argument("--" + option, required=True)
    parser.add_argument("--expected-positions", type=int, default=20)
    prepare(parser.parse_args())
