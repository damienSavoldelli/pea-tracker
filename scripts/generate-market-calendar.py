"""Generate the bounded, independently authored XPAR continuous-core reference.

Only Python's standard library is used. This tool neither downloads official
calendar files nor imports a market-calendar package. The reviewed profile
manifest records corroboration, official checks, permitted scope and exclusions.
Unknown years are explicitly emitted as unknown, including their weekends.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, time, timedelta, timezone
import json
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
PROFILES = ROOT / "src/adapters/calendar/profiles.json"
OUTPUT = ROOT / "src/adapters/calendar/sessions.generated.json"
GENERATOR = "pea-market-calendar/1"
CLOSED_RULES = {
    "new_year", "good_friday", "easter_monday", "labour_day", "christmas", "boxing_day",
}


def easter_sunday(year: int) -> date:
    """Calculate Gregorian Easter using integer calendar arithmetic."""
    cycle = year % 19
    century, year_in_century = divmod(year, 100)
    correction = (century + 8) // 25
    lunar = (19 * cycle + century - century // 4 - (century - correction + 1) // 3 + 15) % 30
    weekday = (32 + 2 * (century % 4) + 2 * (year_in_century // 4) - lunar - year_in_century % 4) % 7
    adjustment = (cycle + 11 * lunar + 22 * weekday) // 451
    month, remainder = divmod(lunar + weekday - 7 * adjustment + 114, 31)
    return date(year, month, remainder + 1)


def utc(value: datetime) -> str:
    """Serialize an aware bound as canonical millisecond UTC."""
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def load_profile(path: Path = PROFILES) -> dict:
    """Read the single reviewed profile, refusing unsupported rule changes."""
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("version") != 1 or len(manifest.get("profiles", [])) != 1:
        raise ValueError("unsupported_profile_manifest")
    profile = manifest["profiles"][0]
    years = profile.get("verified_years")
    if (profile.get("id") != "xpar-continuous-core-v1" or profile.get("mic") != "XPAR"
            or profile.get("timezone") != "Europe/Paris"
            or profile.get("regular_open") != "09:00" or profile.get("regular_close") != "17:30"
            or not isinstance(years, list) or not years
            or any(type(year) is not int or not 2000 <= year <= 9997 for year in years)
            or len(years) != len(set(years))
            or set(profile.get("closed_rules", [])) != CLOSED_RULES
            or profile.get("unknown_session_days") != ["12-24", "12-31"]):
        raise ValueError("unsupported_profile_rules")
    return profile


def state(day: date, profile: dict) -> str:
    """Classify only reviewed calendar years; half-day times remain unknown."""
    if day.year not in profile["verified_years"]:
        return "unknown"
    easter = easter_sunday(day.year)
    closed = {
        date(day.year, 1, 1), easter - timedelta(days=2), easter + timedelta(days=1),
        date(day.year, 5, 1), date(day.year, 12, 25), date(day.year, 12, 26),
    }
    if day.weekday() >= 5 or day in closed:
        return "closed"
    if day.strftime("%m-%d") in profile["unknown_session_days"]:
        return "unknown_session"
    return "regular"


def previous_session(start: date, profile: dict) -> str | None:
    """Find the established predecessor, stopping at the first unknown day."""
    day = start - timedelta(days=1)
    while True:
        kind = state(day, profile)
        if kind in {"regular", "unknown_session"}:
            return day.isoformat()
        if kind == "unknown":
            return None
        day -= timedelta(days=1)


def generate(year: int, profile: dict) -> dict:
    """Expand two local calendar years and retain the predecessor of each day.

    A half-day's existence/date is established, even when its intraday bounds
    are excluded. It is unknown throughout that date; after local midnight its
    known session date can become the predecessor. A wholly unknown day instead
    invalidates the predecessor until a later established session has completed.
    """
    if type(year) is not int or not 2000 <= year <= 9997:
        raise ValueError("invalid_generation_year")
    zone = ZoneInfo(profile["timezone"])
    start, end = date(year, 1, 1), date(year + 2, 1, 1)
    days = []
    predecessor = previous_session(start, profile)
    day = start
    while day < end:
        following = day + timedelta(days=1)
        kind = state(day, profile)
        lower = utc(datetime.combine(day, time.min, zone))
        upper = utc(datetime.combine(following, time.min, zone))
        opened = utc(datetime.combine(day, time(9), zone)) if kind == "regular" else None
        closed = utc(datetime.combine(day, time(17, 30), zone)) if kind == "regular" else None
        if kind == "unknown":
            predecessor = None
        days.append([day.isoformat(), lower, upper, kind, opened, closed, predecessor])
        if kind in {"regular", "unknown_session"}:
            predecessor = day.isoformat()
        day = following
    return {
        "version": 1,
        "generator": GENERATOR,
        "generated_for_year": year,
        "profiles": [{
            "id": profile["id"], "mic": profile["mic"], "timezone": profile["timezone"],
            "coverage_start": days[0][1], "coverage_end": days[-1][2], "days": days,
        }],
    }


def serialize(reference: dict) -> str:
    """Keep one compact daily tuple per line for deterministic review."""
    profile = reference["profiles"][0]
    lines = ["{", '  "version": 1,', f'  "generator": "{GENERATOR}",',
             f'  "generated_for_year": {reference["generated_for_year"]},', '  "profiles": [{']
    for key in ("id", "mic", "timezone", "coverage_start", "coverage_end"):
        lines.append(f'    "{key}": {json.dumps(profile[key])},')
    lines.append('    "days": [')
    for index, row in enumerate(profile["days"]):
        lines.append("      " + json.dumps(row, separators=(",", ":")) + ("," if index + 1 < len(profile["days"]) else ""))
    return "\n".join([*lines, "    ]", "  }]", "}", ""])


def main() -> None:
    """Generate locally; --check compares without writing the target."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, help="first local year; default is current Europe/Paris year")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--check", action="store_true")
    arguments = parser.parse_args()
    profile = load_profile()
    year = arguments.year if arguments.year is not None else datetime.now(ZoneInfo(profile["timezone"])).year
    content = serialize(generate(year, profile))
    if arguments.check:
        if not arguments.output.is_file() or arguments.output.read_text(encoding="utf-8") != content:
            raise SystemExit("calendar_reference_drift")
        print("calendar_reference_current")
        return
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(content, encoding="utf-8")
    print("calendar_reference_generated")


if __name__ == "__main__":
    main()
