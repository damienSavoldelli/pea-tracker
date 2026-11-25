"""New quota-adapter evidence only: private files, processes, no vendor I/O."""
from datetime import timedelta
import multiprocessing
import os

import pytest

from pea_collector.model import CollectorError
from pea_collector.provider_quota import PrivateQuotaLedger, UsageSnapshot


def usage(now, used=0, minute=0):
    return UsageSnapshot(now.date().isoformat(), used, minute, now)


def test_reference_and_group_are_18_units_persisted_across_instances(tmp_path, now):
    path = tmp_path / "private"
    store = PrivateQuotaLedger(path)
    first = store.reserve("reference", 1, usage(now), now)
    assert first["charged_upper_bound"] == 1
    store.begin("reference", now)
    store.finish("reference", "response_received")
    second = PrivateQuotaLedger(path).reserve("quotes", 17, usage(now, used=1), now)
    assert second["charged_upper_bound"] == 18 and second["campaign_remaining"] == 0
    assert path.stat().st_mode & 0o777 == 0o700
    assert all(p.stat().st_mode & 0o777 == 0o600 for p in path.iterdir())
    with pytest.raises(CollectorError, match="quota_daily_exhausted_or_reserved"):
        store.reserve("extra", 1, usage(now), now)


@pytest.mark.parametrize("outcome", [None, "failed", "response_received"])
def test_interruption_failure_and_success_never_refetch_same_operation(tmp_path, now, outcome):
    store = PrivateQuotaLedger(tmp_path / "private")
    store.reserve("once", 17, usage(now), now)
    store.begin("once", now)
    if outcome:
        store.finish("once", outcome)
    with pytest.raises(CollectorError, match="already_claimed"):
        PrivateQuotaLedger(store.directory).reserve("once", 17, usage(now), now)
    with pytest.raises(CollectorError, match="daily_exhausted"):
        store.reserve("new-retry-id", 17, usage(now), now)


@pytest.mark.parametrize("used,minute", [(19, 0), (20, 0), (0, 20)])
def test_free_limits_do_not_consider_500_extra_units(tmp_path, now, used, minute):
    with pytest.raises(CollectorError, match="quota_"):
        PrivateQuotaLedger(tmp_path / "private").reserve("once", 1, usage(now, used, minute), now)


@pytest.mark.parametrize("delta", [-1, 301, 86400])
def test_unknown_or_old_usage_cannot_reset_the_day(tmp_path, now, delta):
    with pytest.raises(CollectorError, match="unknown_or_stale"):
        PrivateQuotaLedger(tmp_path / "private").reserve("once", 1, usage(now), now + timedelta(seconds=delta))


def test_rollover_needs_new_evidence_and_preserves_campaign_claims(tmp_path, now):
    store = PrivateQuotaLedger(tmp_path / "private")
    store.reserve("first-day", 17, usage(now), now)
    tomorrow = now + timedelta(days=1)
    result = store.reserve("next-day", 1, usage(tomorrow), tomorrow)
    assert result["charged_upper_bound"] == 1 and result["campaign_remaining"] == 0
    with pytest.raises(CollectorError, match="campaign_exhausted"):
        store.reserve("third", 1, usage(tomorrow), tomorrow)
    with pytest.raises(CollectorError, match="already_claimed"):
        store.reserve("first-day", 1, usage(tomorrow), tomorrow)


def test_reference_fetched_before_ledger_bootstrap_counts_in_campaign(tmp_path, now):
    store = PrivateQuotaLedger(tmp_path / "private")
    assert store.reserve("quotes", 17, usage(now, used=1), now)["campaign_remaining"] == 0
    tomorrow = now + timedelta(days=1)
    with pytest.raises(CollectorError, match="campaign_exhausted"):
        store.reserve("extra", 1, usage(tomorrow), tomorrow)


def test_reservation_cannot_start_twice_or_after_day_boundary(tmp_path, now):
    late = now.replace(hour=23, minute=59, second=59)
    store = PrivateQuotaLedger(tmp_path / "private")
    store.reserve("old", 1, usage(late), late)
    next_day = late + timedelta(seconds=2)
    store.reserve("new", 1, usage(next_day), next_day)
    with pytest.raises(CollectorError, match="not_startable"):
        store.begin("old", next_day)
    store.begin("new", next_day)
    with pytest.raises(CollectorError, match="not_startable"):
        store.begin("new", next_day)


def test_expired_reservation_and_lower_counter_never_release_units(tmp_path, now):
    store = PrivateQuotaLedger(tmp_path / "private")
    store.reserve("old", 17, usage(now), now)
    later = now + timedelta(seconds=6)
    with pytest.raises(CollectorError, match="not_startable"):
        store.begin("old", later)
    assert store.reserve("remaining", 1, usage(later), later)["charged_upper_bound"] == 18


def test_bad_usage_and_unsafe_directory_fail_closed(tmp_path, now):
    path = tmp_path / "public"
    path.mkdir(mode=0o755)
    with pytest.raises(CollectorError, match="unsafe_journal_directory"):
        PrivateQuotaLedger(path).reserve("once", 1, usage(now), now)
    with pytest.raises(CollectorError, match="unknown_or_stale"):
        PrivateQuotaLedger(tmp_path / "private").reserve("once", 1, usage(now, used=True), now)


def test_corrupt_persisted_state_stops_before_reserving(tmp_path, now):
    path = tmp_path / "private"
    store = PrivateQuotaLedger(path)
    store.reserve("once", 1, usage(now), now)
    next(path.glob("*.json")).write_text("{}")
    with pytest.raises(CollectorError, match="invalid_journal"):
        store.reserve("next", 1, usage(now), now)


def _compete(path, now, barrier, queue):
    barrier.wait(timeout=5)
    try:
        PrivateQuotaLedger(path).reserve(str(os.getpid()), 17, usage(now), now)
        queue.put("reserved")
    except CollectorError:
        queue.put("stopped")


def _interrupted(path, now):
    store = PrivateQuotaLedger(path)
    store.reserve("interrupted", 17, usage(now), now)
    store.begin("interrupted", now)
    os._exit(0)


def test_real_process_exit_preserves_started_claim_and_releases_lock(tmp_path, now):
    path = tmp_path / "private"
    process = multiprocessing.get_context("fork").Process(target=_interrupted, args=(path, now))
    process.start()
    process.join(timeout=5)
    if process.is_alive():
        process.terminate()
        process.join()
    assert process.exitcode == 0
    with pytest.raises(CollectorError, match="already_claimed"):
        PrivateQuotaLedger(path).reserve("interrupted", 17, usage(now), now)


def test_two_processes_cannot_both_reserve_one_remaining_batch(tmp_path, now):
    ctx = multiprocessing.get_context("fork")
    barrier, queue = ctx.Barrier(2), ctx.Queue()
    processes = [ctx.Process(target=_compete, args=(tmp_path / "private", now, barrier, queue)) for _ in range(2)]
    for process in processes:
        process.start()
    try:
        assert sorted(queue.get(timeout=8) for _ in processes) == ["reserved", "stopped"]
    finally:
        for process in processes:
            process.join(timeout=5)
            if process.is_alive():
                process.terminate()
                process.join()
    assert all(p.exitcode == 0 for p in processes)
