"""Check inactive workflow safety, cycle monitoring and fixed local launchers."""
from datetime import datetime, timezone
from pathlib import Path
import re
import yaml

import pytest
from pea_collector.cadence import due, interval
from pea_collector.monitor import missing
from pea_collector import checks, qualify


@pytest.mark.parametrize("value", ["0", "1", "15", "30; unsafe", ""])
def test_frequency_is_bounded(value):
    """Only reviewed collection intervals may control scheduled execution."""
    with pytest.raises(ValueError):
        interval(value)


def test_configurable_frequency_does_not_pretend_to_be_market_calendar():
    """Cadence selects broad UTC slots without asserting exchange sessions."""
    now = datetime(2026, 11, 9, 8, 17, tzinfo=timezone.utc)
    assert all(due(now, interval(value)) for value in ["30", "60", "120"])
    assert due(now.replace(minute=47), 30) and not due(now.replace(minute=47), 60)
    assert not due(now.replace(day=8), 30)  # Sunday, collection window only


def test_missing_cycle_checker_rejects_skipped_or_synthetic_runs():
    """Only a recent successful live collector step satisfies cycle monitoring."""
    now = datetime(2026, 11, 9, 10, tzinfo=timezone.utc)
    run = {"id": 1, "display_title": "quotation-collector/live", "head_branch": "main", "conclusion": "success", "updated_at": "2026-11-09T09:30:00Z"}
    job = {"conclusion": "success", "steps": [{"name": "Run collector", "conclusion": "success"}]}
    def fetch(path):
        """Return synthetic workflow or job metadata for the requested API path."""
        return {"jobs": [job]} if path.endswith("/jobs") else {"workflow_runs": [run]}
    assert not missing(fetch, now, 30)
    job["steps"][0]["conclusion"] = "skipped"
    assert missing(fetch, now, 30)
    job["steps"][0]["conclusion"] = "success"; run["display_title"] = "quotation-collector/synthetic"
    assert missing(fetch, now, 30)
    assert not missing(lambda _: (_ for _ in ()).throw(AssertionError()), now.replace(day=8), 30)


def test_workflows_are_inactive_pinned_and_do_not_expose_secrets_to_untrusted_events():
    """Prepared workflows retain explicit activation, branch and permission gates."""
    root = Path(__file__).parents[2]
    # BaseLoader keeps YAML's 'on' key a string, as GitHub's YAML parser does.
    for name in ["quotation-collector.yml", "quotation-monitor.yml"]:
        text = (root / ".github/workflows" / name).read_text()
        workflow = yaml.load(text, Loader=yaml.BaseLoader)
        assert set(workflow["on"]) == {"workflow_dispatch"}
        assert workflow["permissions"]["contents"] == "read"
        assert workflow["concurrency"]["cancel-in-progress"] == "false"
        assert "pull_request_target" not in text and "upload-artifact" not in text
        for job in workflow["jobs"].values():
            assert "github.ref == 'refs/heads/main'" in job["if"]
            assert "github.repository == 'damienSavoldelli/pea-tracker'" in job["if"]
            assert 1 <= int(job["timeout-minutes"]) <= 20
            for step in job["steps"]:
                if "uses" in step:
                    assert re.fullmatch(r"actions/[a-z-]+@[a-f0-9]{40}", step["uses"])
        if name == "quotation-collector.yml":
            assert workflow["permissions"] == {"contents": "read"}
            assert "secrets." not in str(workflow["jobs"]["synthetic"])
            live = workflow["jobs"]["collect-live"]
            assert live["environment"] == "collector-live"
            for name in ["COLLECTOR_LIVE_ENABLED", "COLLECTOR_PROVIDER_APPROVED", "COLLECTOR_COVERAGE_APPROVED", "COLLECTOR_SECURITY_APPROVED"]:
                assert f"vars.{name} == 'true'" in live["if"]


def test_offline_qualification_never_calls_yahoo(monkeypatch, capsys):
    """Both default and explicit offline qualification avoid the live adapter."""
    monkeypatch.setattr(qualify.YFinanceProvider, "fetch", lambda *_: (_ for _ in ()).throw(AssertionError("Network must not be used")))
    qualify.main(["--offline", "--"])
    output = capsys.readouterr().out
    assert output.count('"offline": true') == 2
    qualify.main([])
    assert capsys.readouterr().out.count('"offline": true') == 2


@pytest.mark.parametrize("arguments", [["--li"], ["--offline", "--live"], ["--offline", "--", "--live"], ["--offline", "--url", "https://untrusted.invalid"]])
def test_qualification_rejects_ambiguous_or_appended_options(arguments):
    """Abbreviated or appended arguments cannot switch an offline command live."""
    with pytest.raises(SystemExit) as failure:
        qualify.main(arguments)
    assert failure.value.code == 2


def test_fixed_check_launcher_ignores_external_pytest_environment(monkeypatch):
    """The launcher fixes the test path and removes inherited plugin selection."""
    seen = []
    monkeypatch.setenv("PYTEST_ADDOPTS", "-p untrusted_plugin")
    monkeypatch.setenv("PYTEST_PLUGINS", "untrusted_plugin")
    monkeypatch.setenv("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "0")
    monkeypatch.setattr(pytest, "main", lambda args: seen.append(args) or 0)
    assert checks.main(["--"]) == 0
    import os
    assert "PYTEST_ADDOPTS" not in os.environ and "PYTEST_PLUGINS" not in os.environ
    assert os.environ["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] == "1"
    assert seen == [[str(Path(__file__).resolve().parent)]]


@pytest.mark.parametrize("arguments", [["-p", "untrusted_plugin"], ["--", "/tmp/unreviewed.py"], ["--", "--config=unreviewed"]])
def test_fixed_check_launcher_rejects_extra_options_and_paths(arguments):
    """Execution-rule prefixes cannot expand the launcher's pytest scope."""
    with pytest.raises(SystemExit) as failure:
        checks.main(arguments)
    assert failure.value.code == 2
