"""Read-only Actions missing-cycle checker. No secrets, prices or mappings in output."""
from datetime import datetime, timezone
import json
import os
import re
import sys
from urllib.request import Request, build_opener, ProxyHandler

from .cadence import in_window, interval
from .http import NoRedirect
from .cloudflare_cadence import paris_window
from zoneinfo import ZoneInfo

REPOSITORY = "damienSavoldelli/pea-tracker"


def missing(fetch, now: datetime, minutes: int, *, paris: bool = False) -> bool:
    """Detect overdue successful live executions within the collection window.

    Workflow success alone is insufficient: a skipped job or step must not count
    as a completed collection cycle. This is not an exchange-calendar check.
    """
    local = now.astimezone(ZoneInfo("Europe/Paris")) if paris else now.astimezone(timezone.utc)
    if not (paris_window(now) if paris else in_window(now)) or local.hour == (7 if paris else 6):
        return False  # startup grace at beginning of the collection window
    runs = fetch(f"/repos/{REPOSITORY}/actions/workflows/quotation-collector.yml/runs?branch=main&per_page=20")["workflow_runs"]
    for run in runs:
        title = run.get("display_title", "")
        live = title == "quotation-collector/live" or re.fullmatch(r"quotation-collector/live/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z", title)
        if not live or run.get("head_branch") != "main" or run.get("conclusion") != "success":
            continue
        ended = datetime.fromisoformat(run["updated_at"].replace("Z", "+00:00"))
        age = (now - ended).total_seconds()
        if not 0 <= age <= max(90, minutes * 2) * 60:
            continue
        # A skipped live job/cadence step can leave a successful workflow. Count
        # only actual successful collector executions, not synthetic tests/skips.
        jobs = fetch(f"/repos/{REPOSITORY}/actions/runs/{int(run['id'])}/jobs")["jobs"]
        if any(job.get("conclusion") == "success" and any(step.get("name") == "Run collector" and step.get("conclusion") == "success" for step in job.get("steps", [])) for job in jobs):
            return False
    return True


def main() -> int:
    """Read Actions status with a read-only token and emit only monitor outcomes."""
    try:
        opener = build_opener(ProxyHandler({}), NoRedirect())
        token = os.environ["GH_TOKEN"]

        def fetch(path):
            """Read a bounded GitHub API response without exposing credentials."""
            with opener.open(Request("https://api.github.com" + path, headers={"Authorization": "Bearer " + token,
                             "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}), timeout=10) as response:
                body = response.read(524289)
                if len(body) > 524288:
                    raise ValueError()
                return json.loads(body)

        zone = os.environ.get("COLLECTOR_SCHEDULE_TIMEZONE", "UTC")
        if zone not in {"UTC", "Europe/Paris"}:
            raise ValueError()
        stale = missing(fetch, datetime.now(timezone.utc), interval(os.environ.get("COLLECTOR_INTERVAL_MINUTES", "30")), paris=zone == "Europe/Paris")
        print(json.dumps({"event": "collector_cycle_missing" if stale else "collector_monitor_ok"}))
        return int(stale)
    except Exception:
        print('{"event":"collector_monitor_unavailable"}')
        return 1


if __name__ == "__main__":
    sys.exit(main())
