"""Collection window, deliberately NOT an exchange calendar or freshness authority."""
from datetime import datetime, timezone
import os


def interval(value: str) -> int:
    """Accept only the supported collection intervals, expressed in minutes."""
    if value not in {"30", "60", "120"}:
        raise ValueError("invalid_collection_interval")
    return int(value)


def in_window(now: datetime) -> bool:
    """Check the broad weekday UTC collection window, without inferring sessions."""
    now = now.astimezone(timezone.utc)
    return now.weekday() < 5 and 6 <= now.hour <= 18


def due(now: datetime, minutes: int) -> bool:
    """Select a half-hour slot at a previously validated collection interval."""
    return in_window(now) and int(now.timestamp() // 1800) % (minutes // 30) == 0


if __name__ == "__main__":
    minutes = interval(os.environ.get("COLLECTOR_INTERVAL_MINUTES", "30"))
    selected = os.environ.get("COLLECTOR_EVENT") == "workflow_dispatch" or due(datetime.now(timezone.utc), minutes)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("run=" + str(selected).lower() + "\n")
