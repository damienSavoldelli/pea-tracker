"""Validate the real standard-library calendar generator without provider access."""

from copy import deepcopy
from datetime import datetime
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/generate-market-calendar.py"
SPEC = importlib.util.spec_from_file_location("market_calendar_generation", SCRIPT)
GENERATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GENERATOR)


def generated(year=2026, profile=None):
    """Produce a reference from the reviewed profile or a synthetic variant."""
    return GENERATOR.generate(year, profile or GENERATOR.load_profile())


def rows(reference):
    """Index explicit day records by their local date for semantic assertions."""
    return {row[0]: row for row in reference["profiles"][0]["days"]}


@pytest.mark.parametrize("year, expected", [(2025, "2025-04-20"), (2026, "2026-04-05"), (2027, "2027-03-28")])
def test_gregorian_easter_reference_dates(year, expected):
    """Keep movable holidays anchored to independently checked Gregorian dates."""
    assert GENERATOR.easter_sunday(year).isoformat() == expected


def test_known_full_closures_and_ordinary_session():
    """Distinguish actual Paris closures from unrelated civil holidays."""
    days = rows(generated())
    for day in ("2026-01-01", "2026-04-03", "2026-04-06", "2026-05-01", "2026-12-25", "2026-12-26"):
        assert days[day][3:6] == ["closed", None, None]
    for day in ("2026-07-14", "2026-05-14", "2026-05-25", "2026-11-11"):
        assert days[day][3] == "regular"
    assert days["2026-11-09"][4:6] == ["2026-11-09T08:00:00.000Z", "2026-11-09T16:30:00.000Z"]


def test_half_days_never_invent_intraday_bounds():
    """Know that a half-day is a session without claiming its auction times."""
    days = rows(generated())
    for day in ("2026-12-24", "2026-12-31", "2027-12-24", "2027-12-31"):
        assert days[day][3:6] == ["unknown_session", None, None]
    assert days["2026-12-25"][6] == "2026-12-24"
    assert days["2027-01-01"][6] == "2026-12-31"


def test_seed_predecessor_covers_start_of_reference_and_weekends():
    """Retain an established trading date before the first generated year."""
    days = rows(generated())
    assert days["2026-01-01"][6] == "2025-12-31"
    assert days["2026-01-02"][6] == "2025-12-31"
    assert days["2026-01-03"][3] == "closed"
    assert days["2026-01-03"][6] == "2026-01-02"
    assert days["2026-04-07"][6] == "2026-04-02"


def test_dst_bounds_cover_23_and_25_hour_days_without_fixed_offset():
    """UTC intervals follow Europe/Paris daylight saving transitions."""
    days = rows(generated())
    for day, hours in (("2026-03-29", 23), ("2026-10-25", 25)):
        row = days[day]
        start, end = (datetime.fromisoformat(value.replace("Z", "+00:00")) for value in row[1:3])
        assert (end - start).total_seconds() == hours * 3600
    assert days["2026-03-27"][4] == "2026-03-27T08:00:00.000Z"
    assert days["2026-03-30"][4] == "2026-03-30T07:00:00.000Z"
    assert days["2026-10-23"][4] == "2026-10-23T07:00:00.000Z"
    assert days["2026-10-26"][4] == "2026-10-26T08:00:00.000Z"


def test_every_day_is_explicit_and_bounds_are_contiguous():
    """No omitted date can be misinterpreted as a closed market."""
    reference = generated()
    profile = reference["profiles"][0]
    days = profile["days"]
    assert len(days) == 730
    assert len({row[0] for row in days}) == 730
    assert profile["coverage_start"] == days[0][1] == "2025-12-31T23:00:00.000Z"
    assert profile["coverage_end"] == days[-1][2] == "2027-12-31T23:00:00.000Z"
    assert all(left[2] == right[1] for left, right in zip(days, days[1:]))
    assert all(row[6] is None or row[6] < row[0] for row in days)


def test_rollover_does_not_extrapolate_unreviewed_years():
    """A new two-year range still marks every unreviewed date unknown."""
    reference = generated(2027)
    days = rows(reference)
    assert reference["generated_for_year"] == 2027
    assert days["2027-11-09"][3] == "regular"
    assert days["2028-01-01"][3] == "unknown"
    assert days["2028-01-01"][6] is None
    assert days["2028-01-02"][3] == "unknown"  # even a weekend is not inferred covered
    assert days["2028-01-02"][6] is None
    assert list(days)[-1] == "2028-12-31"


def test_unknown_days_break_predecessor_chain():
    """Never search across unreviewed time for an apparently valid predecessor."""
    profile = deepcopy(GENERATOR.load_profile())
    profile["verified_years"] = [2025, 2027]
    days = rows(generated(2026, profile))
    assert days["2026-01-01"][6] is None
    assert days["2026-01-02"][6] is None
    assert days["2027-01-01"][6] is None
    assert days["2027-01-04"][6] is None
    assert days["2027-01-05"][6] == "2027-01-04"
    assert GENERATOR.previous_session(GENERATOR.date(2029, 1, 1), profile) is None


def test_checked_in_artifact_is_deterministic_and_has_no_private_mapping():
    """Read back the actual shipped reference rather than a mirrored fixture."""
    first = GENERATOR.serialize(generated())
    assert first == GENERATOR.serialize(generated())
    assert first == GENERATOR.OUTPUT.read_text(encoding="utf-8")
    reference = json.loads(first)
    assert set(reference) == {"version", "generator", "generated_for_year", "profiles"}
    assert [profile["mic"] for profile in reference["profiles"]] == ["XPAR"]
    assert "instrument_id" not in first


def test_cli_writes_only_explicit_output_and_check_is_read_only(tmp_path):
    """Exercise real CLI generation and drift detection in a disposable directory."""
    output = tmp_path / "sessions.json"
    command = [sys.executable, str(SCRIPT), "--year", "2026", "--output", str(output)]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    assert result.stdout.strip() == "calendar_reference_generated"
    content = output.read_bytes()
    assert subprocess.run([*command, "--check"], capture_output=True, text=True, check=True).stdout.strip() == "calendar_reference_current"
    assert output.read_bytes() == content
    output.write_text("{}", encoding="utf-8")
    failed = subprocess.run([*command, "--check"], capture_output=True, text=True)
    assert failed.returncode != 0
    assert "calendar_reference_drift" in failed.stderr
    assert output.read_text(encoding="utf-8") == "{}"


@pytest.mark.parametrize("year", [True, 1999, 9998, "2026"])
def test_invalid_generation_year_is_rejected(year):
    """Keep generation bounded before time-zone/date expansion."""
    with pytest.raises(ValueError, match="invalid_generation_year"):
        generated(year)


def test_unsupported_profile_manifest_is_rejected(tmp_path):
    """Refuse a modified profile instead of silently extending supported rules."""
    manifest = json.loads(GENERATOR.PROFILES.read_text(encoding="utf-8"))
    manifest["profiles"][0]["mic"] = "ALXP"
    path = tmp_path / "profiles.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="unsupported_profile_rules"):
        GENERATOR.load_profile(path)
