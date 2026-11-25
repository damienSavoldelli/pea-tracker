"""Validate a Cloudflare slot without changing legacy/manual cadence behavior."""
from datetime import datetime, timezone
import os
import re
from zoneinfo import ZoneInfo


def paris_window(now: datetime) -> bool:
    local = now.astimezone(ZoneInfo("Europe/Paris"))
    return local.weekday() < 5 and 7 <= local.hour <= 19


def accepted(value: str, now: datetime, minutes: int) -> bool:
    if minutes not in {15, 30, 60, 120} or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z", value):
        return False
    try:
        slot = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    age = (now - slot).total_seconds()
    return (0 <= age <= 600 and paris_window(slot) and paris_window(now)
            and slot.minute in {2, 17, 32, 47}
            and (int(slot.timestamp() // 60) - 17) % minutes == 0)


if __name__ == "__main__":
    try:
        selected = accepted(os.environ.get("COLLECTOR_SCHEDULED_AT", ""), datetime.now(timezone.utc),
                            int(os.environ.get("COLLECTOR_INTERVAL_MINUTES", "30")))
    except ValueError:
        selected = False
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("run=" + str(selected).lower() + "\n")
