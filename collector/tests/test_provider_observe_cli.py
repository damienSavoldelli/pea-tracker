"""New offline replay entrypoint, using private synthetic files only."""
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from pea_collector.provider_observe import main
from test_provider_observation import feeds, raw, primary


def inputs(tmp_path, feeds, now):
    response = raw(feeds, now)
    values = {"policies": json.dumps([asdict(p) for p in feeds]).encode(),
              "body": response.body,
              "receipt": json.dumps({"state": "response_saved", "body_sha256": hashlib.sha256(response.body).hexdigest(),
                  "http_status": 200, "content_type": "application/json", "body_received_at": now.isoformat()}).encode(),
              "existing": json.dumps([primary(feeds, now)]).encode()}
    paths = {}
    for key, value in values.items():
        path = tmp_path / (key + ".json")
        with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as output:
            output.write(value)
        paths[key] = path
    args = [part for key, path in paths.items() for part in ("--" + key, str(path))]
    return paths, args


def test_offline_cli_exercises_full_capture_to_summary(feeds, now, tmp_path, capsys):
    _, args = inputs(tmp_path, feeds, now)
    assert main(args) == 0
    text = capsys.readouterr().out
    result = json.loads(text)
    assert result["decisions"] == {"primary_eligible": 1}
    assert feeds[0].mapping.instrument_id not in text and feeds[0].mapping.symbol not in text
    assert str(tmp_path) not in text and "12.340000" not in text


def test_capture_tampering_is_refused_without_echo(feeds, now, tmp_path, capsys):
    paths, args = inputs(tmp_path, feeds, now)
    paths["body"].write_text("SYNTHETIC-SENSITIVE-CONTENT")
    assert main(args) == 1
    text = capsys.readouterr().out
    assert "provider_shadow_rejected" in text and "SYNTHETIC-SENSITIVE-CONTENT" not in text


def test_world_readable_input_is_refused(feeds, now, tmp_path, capsys):
    paths, args = inputs(tmp_path, feeds, now)
    paths["policies"].chmod(0o644)
    assert main(args) == 1
    assert str(tmp_path) not in capsys.readouterr().out


def test_unknown_receipt_clock_is_never_inferred_from_filename(feeds, now, tmp_path, capsys):
    paths, args = inputs(tmp_path, feeds, now)
    receipt = json.loads(paths["receipt"].read_bytes())
    receipt["body_received_at"] = "2026-11-10"
    paths["receipt"].write_text(json.dumps(receipt))
    assert main(args) == 1
    assert "provider_shadow_rejected" in capsys.readouterr().out


def test_installed_module_cli_process_replays_only_private_synthetic_files(feeds, now, tmp_path):
    _, args = inputs(tmp_path, feeds, now)
    result = subprocess.run([sys.executable, "-m", "pea_collector.provider_observe", *args],
        cwd=Path(__file__).parents[1], capture_output=True, text=True, timeout=10)
    assert result.returncode == 0 and result.stderr == ""
    report = json.loads(result.stdout)
    assert report["mode"] == "observation_only"
    assert report["evaluation_clock"] == "capture_body_received_at"
    assert report["as_of"].startswith("2026-11-10")
