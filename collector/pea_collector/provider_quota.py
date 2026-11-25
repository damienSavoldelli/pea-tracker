"""EODHD base-quota claims on a shared private filesystem, never a cloud ledger."""
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from pathlib import Path
from typing import Protocol
import re

from .model import CollectorError, utc
from .runner import encoded, journal, read_journal, write_journal


@dataclass(frozen=True)
class UsageSnapshot:
    """Trusted dashboard/account evidence; no inferred reset or bonus allowance."""
    day: str
    used: int
    requests_last_minute: int
    observed_at: datetime


class QuotaStore(Protocol):
    """Executor port: reserve before I/O; ambiguous attempts are never refunded."""
    def reserve(self, operation: str, units: int, usage: UsageSnapshot, now: datetime) -> dict: ...
    def begin(self, operation: str, now: datetime) -> None: ...
    def finish(self, operation: str, state: str) -> None: ...


class PrivateQuotaLedger:
    """One account directory, global lock and immutable bounded operation claims.

    All consumers must share this directory and include external spend in trusted
    snapshots. The adapter stops at 256 claims; no automatic cleanup/replay/reset.
    Ephemeral Actions runners cannot use separate copies as shared authority.
    """
    def __init__(self, directory: Path):
        self.directory = directory

    def _load(self, path):
        if not path.exists():
            return {"day": None, "charged": 0, "observed_at": None, "external_units": 0, "claims": {}}
        saved = read_journal(path)
        data = saved["payload"]
        try:
            if (saved["mapping"] != "eodhd-quota-v1"
                    or set(data) != {"day", "charged", "observed_at", "external_units", "claims"}
                    or type(data["charged"]) is not int or not 0 <= data["charged"] <= 20
                    or type(data["external_units"]) is not int or not 0 <= data["external_units"] <= 20
                    or not isinstance(data["claims"], dict) or len(data["claims"]) > 256):
                raise ValueError()
            observed = datetime.fromisoformat(data["observed_at"])
            if observed.tzinfo is None or data["day"] != observed.astimezone(timezone.utc).date().isoformat():
                raise ValueError()
            for claim in data["claims"].values():
                if (set(claim) != {"units", "at", "state"}
                        or type(claim["units"]) is not int or not 1 <= claim["units"] <= 18
                        or claim["state"] not in {"reserved", "started", "response_received", "failed"}):
                    raise ValueError()
                stamp = datetime.fromisoformat(claim["at"])
                if stamp.tzinfo is None:
                    raise ValueError()
        except (ValueError, TypeError, KeyError):
            raise CollectorError("invalid_quota_journal") from None
        return data

    def _save(self, path, payload):
        write_journal(path, {"version": 1, "mapping": "eodhd-quota-v1", "payload": payload,
                             "sha256": hashlib.sha256(encoded(payload)).hexdigest()})

    def reserve(self, operation: str, units: int, usage: UsageSnapshot, now: datetime) -> dict:
        """Atomically charge recurring daily units and the fixed 18-unit campaign.

        Claim IDs are private stable executor inputs, never fresh retry IDs. Usage
        refresh can increase the conservative charge but cannot erase reservations.
        UTC rollover needs new current-day evidence; old claims still block replay.
        """
        utc(now)
        if (not isinstance(operation, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", operation)
                or type(units) is not int or not 1 <= units <= 18):
            raise CollectorError("invalid_quota_claim")
        day = now.astimezone(timezone.utc).date().isoformat()
        if (not isinstance(usage, UsageSnapshot) or not isinstance(usage.observed_at, datetime)
                or usage.observed_at.tzinfo is None
                or usage.day != day or usage.observed_at.astimezone(timezone.utc).date().isoformat() != day
                or not 0 <= (now - usage.observed_at).total_seconds() <= 300
                or type(usage.used) is not int or not 0 <= usage.used <= 20
                or type(usage.requests_last_minute) is not int or not 0 <= usage.requests_last_minute <= 20):
            raise CollectorError("quota_usage_unknown_or_stale")
        with journal(self.directory, "eodhd-account-quota") as (path, _):
            data = self._load(path)
            if operation in data["claims"]:
                raise CollectorError("quota_operation_already_claimed")
            if len(data["claims"]) >= 256:
                raise CollectorError("quota_journal_capacity")
            previous_time = datetime.fromisoformat(data["observed_at"]) if data["observed_at"] else None
            if (previous_time and usage.observed_at < previous_time
                    or any(datetime.fromisoformat(c["at"]) > now for c in data["claims"].values())):
                raise CollectorError("quota_usage_regression")
            charged = max(data["charged"], usage.used) if data["day"] == day else usage.used
            # Include any already performed reference/manual use at bootstrap.
            # This may conservatively count unrelated calls; never overspend to
            # distinguish them. Other consumers must remain stopped afterwards.
            if data["day"] is None:
                data["external_units"] = usage.used
            # Reserve two of the recurring 20; never authorize spending extras.
            if charged + units > 18:
                raise CollectorError("quota_daily_exhausted_or_reserved")
            spent = data["external_units"] + sum(c["units"] for c in data["claims"].values())
            if spent + units > 18:
                raise CollectorError("quota_campaign_exhausted")
            recent = sum(0 <= (now - datetime.fromisoformat(c["at"])).total_seconds() < 60
                         for c in data["claims"].values())
            if usage.requests_last_minute + recent >= 20:
                raise CollectorError("quota_http_exhausted")
            data.update(day=day, charged=charged + units, observed_at=utc(usage.observed_at))
            data["claims"][operation] = {"units": units, "at": utc(now), "state": "reserved"}
            self._save(path, data)
        return {"event": "quota_reserved", "units": units, "charged_upper_bound": charged + units,
                "campaign_remaining": 18 - spent - units}

    def begin(self, operation: str, now: datetime) -> None:
        """One-way transition immediately before I/O, refusing delayed/replayed claims."""
        utc(now)
        with journal(self.directory, "eodhd-account-quota") as (path, _):
            data = self._load(path)
            claim = data["claims"].get(operation)
            if (not claim or claim["state"] != "reserved"
                    or data["day"] != now.astimezone(timezone.utc).date().isoformat()
                    or datetime.fromisoformat(claim["at"]).astimezone(timezone.utc).date().isoformat() != data["day"]
                    or not 0 <= (now - datetime.fromisoformat(claim["at"])).total_seconds() <= 5):
                raise CollectorError("quota_attempt_not_startable")
            claim["state"] = "started"
            self._save(path, data)

    def finish(self, operation: str, state: str) -> None:
        """Mark a known result without releasing any reserved units."""
        if state not in {"response_received", "failed"}:
            raise CollectorError("invalid_quota_outcome")
        with journal(self.directory, "eodhd-account-quota") as (path, _):
            data = self._load(path)
            claim = data["claims"].get(operation)
            if not claim or claim["state"] != "started":
                raise CollectorError("quota_attempt_not_started")
            claim["state"] = state
            self._save(path, data)
