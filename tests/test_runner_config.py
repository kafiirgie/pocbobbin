import json
import sys
from pathlib import Path

from app.config import BehaviorConfig
from app.runner import run_probe_configured, run_suite
from app.schemas import RunStatus


def test_run_suite_parses_vitest_json_counts(tmp_path: Path):
    (tmp_path / "tests").mkdir()
    (tmp_path / "emit_results.py").write_text(
        "import json; print(json.dumps({'numPassedTests': 2, 'numFailedTests': 1, 'numRuntimeErrorTestSuites': 0}))",
        encoding="utf-8",
    )
    config = BehaviorConfig(test_command=("python", "emit_results.py"), test_report="vitest-json")
    result = run_suite(tmp_path, "tests", "suite-hash", sys.executable, "base", "sha", config)
    assert result.status == RunStatus.OK
    assert (result.passed, result.failed, result.errors) == (2, 1, 0)


def test_configured_probe_uses_frozen_runner_and_probe_bytes(tmp_path: Path):
    (tmp_path / "sample.py").write_text("def value(number):\n    return number + 1\n", encoding="utf-8")
    probe = tmp_path / "probe.json"
    probe.write_text(json.dumps({"id": "value", "target": "sample:value", "args": [4]}), encoding="utf-8")
    runner = Path(__file__).parents[1] / "tools" / "run_probe.py"
    result = run_probe_configured(tmp_path, ("python", "{runner}"), runner, probe, sys.executable)
    assert result[0] == RunStatus.OK
    assert result[1] == 5


def test_javascript_probe_harness_returns_value(tmp_path: Path):
    import subprocess

    (tmp_path / "sample.mjs").write_text("export function value(number) { return number + 2; }\n", encoding="utf-8")
    probe = tmp_path / "probe.json"
    probe.write_text(json.dumps({"id": "value", "target": {"path": "sample.mjs", "symbol": "value"}, "args": [4]}), encoding="utf-8")
    harness = Path(__file__).parents[1] / "tools" / "run_probe.ts"
    completed = subprocess.run(
        ["node", "--experimental-strip-types", str(harness), str(probe)],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(completed.stdout)
    assert payload == {"probe": "value", "outcome": "value", "value": 6}
