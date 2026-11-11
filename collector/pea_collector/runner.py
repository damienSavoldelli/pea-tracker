"""Fetch declarations and journal the original payload before any ingestion."""
from contextlib import contextmanager
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time

from .model import CollectorError, ProviderError, normalize, unavailable


def encoded(value) -> bytes:
    """Encode stable JSON bytes for delivery and journal integrity checks."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


@contextmanager
def journal(directory: Path, cycle_id: str):
    """Lock one cycle in an owner-private directory and derive its stable key."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", cycle_id):
        raise CollectorError("invalid_cycle")
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) & 0o077 or info.st_uid != os.getuid():
        raise CollectorError("unsafe_journal_directory")
    key = "yf-" + hashlib.sha256(cycle_id.encode()).hexdigest()
    path = directory / (key + ".json")
    lock = os.open(directory / (key + ".lock"), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        if stat.S_IMODE(os.fstat(lock).st_mode) & 0o077:
            raise CollectorError("unsafe_journal_file")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise CollectorError("cycle_in_progress") from None
        yield path, key
    finally:
        os.close(lock)


def read_journal(path: Path) -> dict:
    """Read a private bounded journal and verify its version and payload digest."""
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as file:
        if stat.S_IMODE(os.fstat(file.fileno()).st_mode) & 0o077:
            raise CollectorError("unsafe_journal_file")
        raw = file.read(131073)
    try:
        data = json.loads(raw)
        if len(raw) > 131072 or set(data) != {"version", "mapping", "payload", "sha256"} or data["version"] != 1:
            raise ValueError()
        if hashlib.sha256(encoded(data["payload"])).hexdigest() != data["sha256"]:
            raise ValueError()
        return data
    except (ValueError, TypeError, KeyError):
        raise CollectorError("invalid_journal") from None


def write_journal(path: Path, data: dict):
    """Persist a private journal atomically before any ingestion can begin."""
    temporary = path.with_suffix(".pending")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, "wb") as file:
            file.write(encoded(data)); file.flush(); os.fsync(file.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if temporary.exists():
            temporary.unlink()


def collect(mappings, provider, *, clock=lambda: datetime.now(timezone.utc), sleep=time.sleep) -> dict:
    """Fetch sequentially with bounded retries and explicit failure declarations.

    Only provider unavailability is retried. Invalid data and rate limits produce
    a failed observation immediately; they never produce a substitute price.
    """
    observations = []
    for mapping in mappings:
        for attempt in range(2):
            try:
                raw = provider.fetch(mapping.symbol)
                observations.append(normalize(mapping, raw, clock()))
                break
            except ProviderError as error:
                reason = str(error) if str(error) in {"provider_unavailable", "rate_limited", "invalid_provider_data"} else "provider_unavailable"
                if reason != "provider_unavailable" or attempt == 1:
                    observations.append(unavailable(mapping, clock(), reason))
                    break
                sleep(1)
    return {"observations": observations}


def run(mappings, provider, client, directory: Path, cycle_id: str, *, require_existing: bool = False, **options) -> dict:
    """Create or replay a cycle's original payload before optional delivery.

    Mapping changes or missing required journals fail closed. Replays preserve
    observation timestamps and the idempotency key without calling the provider.
    """
    digest = hashlib.sha256(encoded([vars(mapping) for mapping in mappings])).hexdigest()
    with journal(directory, cycle_id) as (path, key):
        if path.exists():
            saved = read_journal(path)
            if saved["mapping"] != digest:
                raise CollectorError("cycle_mapping_changed")
            payload = saved["payload"]
        else:
            if require_existing:
                raise CollectorError("retry_journal_missing")
            payload = collect(mappings, provider, **options)
            write_journal(path, {"version": 1, "mapping": digest, "payload": payload, "sha256": hashlib.sha256(encoded(payload)).hexdigest()})
        body = encoded(payload)
        failures = sum(row["outcome"] == "unavailable" for row in payload["observations"])
        if client:
            client.deliver(body, key, len(payload["observations"]))
        return {"event": "cycle_complete", "observations": len(payload["observations"]), "unavailable": failures, "delivered": client is not None}
