"""Offline slot validation and monitoring compatibility; no provider access."""
from datetime import datetime, timezone
from pathlib import Path

import pytest
import yaml

from pea_collector.cloudflare_cadence import accepted
from pea_collector.monitor import missing


@pytest.mark.parametrize("value,expected", [
    ("2026-01-12T06:17:00.000Z", True),
    ("2026-07-13T05:17:00.000Z", True),
    ("2026-07-13T17:47:00.000Z", True),
    ("2026-07-13T18:17:00.000Z", False),
    ("2026-11-21T06:17:00.000Z", False),
    ("2026-11-18T06:18:00.000Z", False),
])
def test_paris_slot(value, expected):
    now = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert accepted(value, now, 30) == expected


def test_rejects_late_future_malformed_and_off_cadence_slots():
    now = datetime(2026, 11, 18, 6, 27, tzinfo=timezone.utc)
    value = "2026-11-18T06:17:00.000Z"
    assert accepted(value, now, 30)
    assert not accepted(value, now.replace(second=1), 30)
    assert not accepted(value, now.replace(minute=16), 30)
    for invalid in ["", "invalid", "2026-02-30T06:17:00.000Z", "2026-11-18T06:17:00+00:00"]:
        assert not accepted(invalid, now, 30)
    assert not accepted(value, now, 15)
    assert accepted(value, now, 60) and accepted(value, now, 120)
    off = "2026-11-18T06:47:00.000Z"
    assert not accepted(off, now.replace(minute=47), 60)


def test_monitor_recognizes_cloudflare_slot_but_not_skipped_collection():
    now = datetime(2026, 7, 13, 6, 9, tzinfo=timezone.utc)  # 08:09 Paris
    run = {"id": 1, "display_title": "quotation-collector/live/2026-07-13T05:47:00.000Z",
           "head_branch": "main", "conclusion": "success", "updated_at": "2026-07-13T05:48:00Z"}
    job = {"conclusion": "success", "steps": [{"name": "Run collector", "conclusion": "success"}]}

    def fetch(path):
        return {"jobs": [job]} if path.endswith("/jobs") else {"workflow_runs": [run]}

    assert not missing(fetch, now, 30, paris=True)
    job["steps"][0]["conclusion"] = "skipped"
    assert missing(fetch, now, 30, paris=True)
    assert missing(fetch, now.replace(hour=8), 30, paris=True)


def test_monitor_paris_grace_and_weekend_do_not_call_github():
    def fetch(_):
        raise AssertionError("No API call outside coverage")
    assert not missing(fetch, datetime(2026, 7, 13, 5, 9, tzinfo=timezone.utc), 30, paris=True)
    assert not missing(fetch, datetime(2026, 11, 21, 9, 9, tzinfo=timezone.utc), 30, paris=True)


@pytest.mark.parametrize("day,utc_hour", [("2026-01-12", 18), ("2026-07-13", 17)])
@pytest.mark.parametrize("minutes", [30, 60, 120])
def test_closing_monitor_requires_each_final_due_slot(day, utc_hour, minutes):
    now = datetime.fromisoformat(f"{day}T{utc_hour + 1:02}:09:00+00:00")
    runs = []
    for hour in range(utc_hour, utc_hour - 2, -1):
        for minute in (17, 47):
            slot = f"{day}T{hour:02}:{minute:02}:00.000Z"
            time = datetime.fromisoformat(slot.replace("Z", "+00:00"))
            if accepted(slot, time, minutes):
                runs.append({"id": minute, "display_title": f"quotation-collector/live/{slot}",
                             "head_branch": "main", "conclusion": "success",
                             "updated_at": f"{day}T{hour:02}:{minute + 1:02}:00Z"})
        if runs:
            break
    jobs = {"jobs": [{"conclusion": "success", "steps": [{"name": "Run collector", "conclusion": "success"}]}]}

    def fetch(path):
        return jobs if path.endswith("/jobs") else {"workflow_runs": runs}

    assert runs
    assert not missing(fetch, now, minutes, paris=True)
    removed = runs.pop()
    assert missing(fetch, now, minutes, paris=True)  # One recent success cannot hide a missing final slot.
    runs.append({**removed, "display_title": "quotation-collector/live"})
    assert missing(fetch, now, minutes, paris=True)  # A manual run cannot replace the scheduled slot.
    runs[-1] = removed
    jobs["jobs"][0]["steps"][0]["conclusion"] = "skipped"
    assert missing(fetch, now, minutes, paris=True)


def test_closing_monitor_keeps_weekends_and_later_hours_outside_coverage():
    def fetch(_):
        raise AssertionError("No API call outside coverage")
    assert not missing(fetch, datetime(2026, 11, 21, 19, 9, tzinfo=timezone.utc), 30, paris=True)
    assert not missing(fetch, datetime(2026, 11, 19, 20, 9, tzinfo=timezone.utc), 30, paris=True)


def test_prepared_workflows_keep_existing_protections_and_exclusive_automation_source():
    root = Path(__file__).parents[2]
    for name, cron in [("quotation-collector.yml", "17,47 6-18 * * 1-5"),
                       ("quotation-monitor.yml", "9 * * * 1-5")]:
        prepared = yaml.load((root / "ops/cloudflare-scheduler" / name).read_text(), Loader=yaml.BaseLoader)
        current = yaml.load((root / ".github/workflows" / name).read_text(), Loader=yaml.BaseLoader)
        assert prepared["on"]["schedule"] == [{"cron": cron}]  # no pending minute shifts
        assert prepared["permissions"] == current["permissions"]
        assert prepared["concurrency"] == current["concurrency"]
        assert prepared["on"]["workflow_dispatch"]["inputs"]["trigger"]["default"] == "manual"
        job = prepared["jobs"]["collect-live" if "collector" in name else "monitor"]
        assert "vars.COLLECTOR_AUTOMATION_SOURCE == 'cloudflare'" in job["if"]
        assert "github.event_name == 'schedule'" not in current["jobs"]["collect-live" if "collector" in name else "monitor"]["if"]
        assert set(current["on"]) == {"workflow_dispatch"}
        assert "github.ref == 'refs/heads/main'" in job["if"]
        assert "vars.COLLECTOR_LIVE_ENABLED == 'true'" in job["if"]
        if "collector" in name:
            assert job["environment"] == "collector-live"
            for gate in ["PROVIDER", "COVERAGE", "SECURITY"]:
                assert f"vars.COLLECTOR_{gate}_APPROVED == 'true'" in job["if"]
            cadence = next(step for step in job["steps"] if step.get("id") == "cadence")
            assert "cloudflare_cadence.py" in cadence["run"] and "collector/pea_collector/cadence.py" in cadence["run"]
            assert "${{" not in cadence["run"]  # inputs enter shell only through env
            collector = next(step for step in job["steps"] if step.get("name") == "Run collector")
            original = next(step for step in current["jobs"]["collect-live"]["steps"] if step.get("name") == "Run collector")
            assert collector == original


def test_scheduler_config_is_explicitly_enabled_and_has_no_financial_binding():
    import json
    path = Path(__file__).parents[2] / "wrangler.scheduler.jsonc"
    config = json.loads("\n".join(line for line in path.read_text().splitlines() if not line.lstrip().startswith("//")))
    assert config["vars"]["SCHEDULER_ENABLED"] == "true"
    assert config["triggers"]["crons"] == ["17,47 * * * *", "9 * * * *"]
    assert config["workers_dev"] is False and config["preview_urls"] is False
    assert "d1_databases" not in config and "services" not in config
    assert config["secrets"]["required"] == ["GITHUB_DISPATCH_TOKEN"]
    assert config["migrations"][0]["new_sqlite_classes"] == ["SchedulerLedger"]
