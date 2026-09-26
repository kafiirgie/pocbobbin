"""Paired execution: identical bytes on both revisions. Owner: B.

Implements A's contract `runner.compare(pair, bundle) -> tests, comparisons,
needs_bob_action`; `app.cli.pipeline(..., run=True)` calls it inside
`with open_pair(...)` and builds the one `ReviewReport` every door consumes.

Rules this file must keep (FINAL_PLAN.md section 5):
  * the frozen BASE test suite runs on both revisions, same bytes;
  * probe bytes and the probe runner come from BASE and are never edited to
    make a difference disappear;
  * import error / timeout / unparsable output are `inconclusive`, never "bug";
  * no intent is decided here; that is a human decision (owner D).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from app.config import BehaviorConfig, load_config

# A's shared schema is the source of truth. Import it when it is on the path;
# fall back to plain dicts so this module stays usable standalone.
try:  # pragma: no cover - exercised by whichever entry point runs first
    from app.impact import analyze
    from app.schemas import (
        Comparison,
        Observation,
        Outcome,
        Probe,
        ProbeBundle,
        Revision,
        RunStatus,
        SuiteRun,
        SymbolRef,
    )

    HAS_SCHEMA = True
except ImportError:  # pragma: no cover
    HAS_SCHEMA = False

TIMEOUT_S = 300
TESTS_DIR = "sample_project/tests"
PROBES_DIR = "probes"


# --- process plumbing ---------------------------------------------------------


def _run(cmd: list[str], cwd: Path, timeout: int | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def _sha8(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _hash_files(root: Path, pattern: str) -> str:
    payload = b"".join(sorted(p.read_bytes() for p in root.rglob(pattern)))
    return hashlib.sha256(payload).hexdigest()[:16]


def _hash_extensions(root: Path, extensions: tuple[str, ...]) -> str:
    payload = b"".join(
        sorted(path.read_bytes() for path in root.rglob("*") if path.is_file() and path.suffix in extensions)
    )
    return hashlib.sha256(payload).hexdigest()[:16]


def _resolve_command(template: tuple[str, ...], python: str) -> list[str]:
    """Expand the configured argv without invoking a shell."""

    return [python if token in {"python", "python3", "{python}"} else token for token in template]


def _pytest_counts(stdout: str) -> tuple[int, int, int]:
    tail = stdout.strip().splitlines()[-1] if stdout.strip() else ""
    match = lambda word: int(re.search(rf"(\d+)\s+{word}", tail).group(1)) if re.search(rf"(\d+)\s+{word}", tail) else 0
    return match("passed"), match("failed"), match("error")


def _vitest_counts(stdout: str) -> tuple[int, int, int]:
    try:
        payload = json.loads(stdout)
    except json.JSONDecodeError:
        return 0, 0, 0
    passed = int(payload.get("numPassedTests", 0) or 0)
    failed = int(payload.get("numFailedTests", 0) or 0)
    errors = int(payload.get("numRuntimeErrorTestSuites", 0) or 0)
    if not (passed or failed or errors):
        for result in payload.get("testResults", []) if isinstance(payload, dict) else []:
            for assertion in result.get("assertionResults", []) if isinstance(result, dict) else []:
                status = assertion.get("status")
                if status == "passed":
                    passed += 1
                elif status == "failed":
                    failed += 1
    return passed, failed, errors


# --- the two things we execute ------------------------------------------------


def run_suite(checkout: Path, tests_rel: str, suite_hash: str, python: str, revision: str, sha: str,
              config: BehaviorConfig | None = None):
    """Run the frozen test suite and parse the configured reporter."""
    settings = config or BehaviorConfig()
    command = _resolve_command(settings.test_command, python)
    if tests_rel not in command:
        command.append(tests_rel)
    try:
        proc = _run(command, checkout, timeout=TIMEOUT_S)
    except FileNotFoundError:
        counts = dict(status=RunStatus.ERROR, passed=0, failed=0, errors=1)
        return _suite_run(revision, sha, suite_hash, **counts)
    except subprocess.TimeoutExpired:
        counts = dict(status=RunStatus.TIMEOUT, passed=0, failed=0, errors=0)
        return _suite_run(revision, sha, suite_hash, **counts)
    passed, failed, errors = (
        _vitest_counts(proc.stdout) if settings.test_report == "vitest-json" else _pytest_counts(proc.stdout)
    )
    status = RunStatus.OK if proc.returncode == 0 else RunStatus.ERROR
    return _suite_run(revision, sha, suite_hash, status, passed, failed, errors)


def _suite_run(revision, sha, suite_hash, status, passed, failed, errors):
    if HAS_SCHEMA:
        return SuiteRun(revision=Revision(revision), sha=sha, status=status,
                        passed=passed, failed=failed, errors=errors, suite_hash=suite_hash)
    return dict(revision=revision, sha=sha, status=str(status), passed=passed,
                failed=failed, errors=errors, suite_hash=suite_hash)


def run_probe_once(checkout: Path, python: str, runner: Path, probe_file: Path):
    """Execute one probe against one checkout. Returns (status, output, exception, duration_ms)."""
    started = datetime.now(timezone.utc)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / "run_probe.py"
            shutil.copy2(runner, local)
            proc = _run([python, str(local), str(probe_file)], checkout, timeout=TIMEOUT_S)
    except FileNotFoundError:
        return RunStatus.ERROR, None, "probe runner was not found", _ms(started)
    except subprocess.TimeoutExpired:
        return RunStatus.TIMEOUT, None, "probe exceeded the time limit", _ms(started)
    if proc.returncode != 0:
        return RunStatus.ERROR, None, proc.stdout.strip()[-400:] or "runner failed", _ms(started)
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return RunStatus.ERROR, None, f"unparsable probe output: {proc.stdout.strip()[-200:]}", _ms(started)
    if payload.get("outcome") == "exception":
        return RunStatus.EXCEPTION, None, f"{payload.get('error_type')}: {payload.get('error')}", _ms(started)
    if payload.get("outcome") in {"error", "inconclusive"}:
        return RunStatus.ERROR, None, "probe reported an execution/setup error", _ms(started)
    return RunStatus.OK, payload.get("value"), None, _ms(started)


def run_probe_configured(checkout: Path, command_template: tuple[str, ...], runner: Path,
                         probe_file: Path, python: str):
    """Run one frozen probe using a configured argv template."""
    started = datetime.now(timezone.utc)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / runner.name
            shutil.copy2(runner, local)
            command = _resolve_command(command_template, python)
            has_probe = False
            for index, token in enumerate(command):
                if token in {"{runner}", "${RUNNER}"} or Path(token).name == runner.name:
                    command[index] = str(local)
                elif token in {"{probe}", "${PROBE}"}:
                    command[index] = str(probe_file)
                    has_probe = True
            if not has_probe:
                command.append(str(probe_file))
            proc = _run(command, checkout, timeout=TIMEOUT_S)
    except FileNotFoundError:
        return RunStatus.ERROR, None, "probe runner was not found", _ms(started)
    except subprocess.TimeoutExpired:
        return RunStatus.TIMEOUT, None, "probe exceeded the time limit", _ms(started)
    if proc.returncode != 0:
        return RunStatus.ERROR, None, proc.stdout.strip()[-400:] or proc.stderr.strip()[-400:] or "runner failed", _ms(started)
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return RunStatus.ERROR, None, f"unparsable probe output: {proc.stdout.strip()[-200:]}", _ms(started)
    if payload.get("outcome") == "exception":
        return RunStatus.EXCEPTION, None, f"{payload.get('error_type')}: {payload.get('error')}", _ms(started)
    if payload.get("outcome") in {"error", "inconclusive"}:
        return RunStatus.ERROR, None, "probe reported an execution/setup error", _ms(started)
    return RunStatus.OK, payload.get("value"), None, _ms(started)


def _ms(started: datetime) -> int:
    return int((datetime.now(timezone.utc) - started).total_seconds() * 1000)


def classify(base, head) -> str:
    """Setup failures are inconclusive; only real execution differences are deltas."""
    b_status, b_out, _, _ = base
    h_status, h_out, _, _ = head
    if RunStatus.ERROR == b_status or RunStatus.ERROR == h_status:
        return Outcome.INCONCLUSIVE
    if RunStatus.TIMEOUT in (b_status, h_status):
        return Outcome.INCONCLUSIVE
    if b_status != h_status:
        return Outcome.DELTA_OBSERVED
    if b_status == RunStatus.EXCEPTION:
        return Outcome.SAME_ON_TESTED_CASES if b_out == h_out else Outcome.DELTA_OBSERVED
    return Outcome.SAME_ON_TESTED_CASES if _canon(b_out) == _canon(h_out) else Outcome.DELTA_OBSERVED


def _canon(value) -> str:
    return json.dumps(value, sort_keys=True, default=str)


# --- the contract -------------------------------------------------------------


def compare(pair, bundle=None, python: str | None = None, probes_dir: str = PROBES_DIR,
            tests_rel: str = TESTS_DIR, impact=None, config: BehaviorConfig | None = None):
    """A's contract: RevisionPair + ProbeBundle -> (suite runs, comparisons, needs_bob_action).

    `bundle` is accepted for A's signature; the probes actually executed are the
    committed files, so the Action and the IDE cannot diverge on which bytes ran.

    Sources: the frozen test suite always comes from BASE. The probe runner and the
    probe files come from BASE when they exist there, else from HEAD (a PR that adds
    the harness itself), and the report says which revision supplied them.
    """
    python = python or sys.executable
    settings = config or load_config(pair.root)
    if tests_rel == TESTS_DIR:
        tests_rel = settings.tests_dir
    base_wt, head_wt = Path(pair.base_path), Path(pair.head_path)
    notes: list[str] = []

    def source_of(rel: str) -> Path:
        """BASE is authoritative; fall back to HEAD and record why."""
        if (base_wt / rel).exists():
            return base_wt / rel
        if (head_wt / rel).exists():
            notes.append(
                f"'{rel}' does not exist on the base revision; the head revision supplied it, "
                "so both sides ran the head copy of that file."
            )
            return head_wt / rel
        raise FileNotFoundError(f"neither revision contains '{rel}'")

    # Freeze the base test suite and the probe runner before touching any checkout.
    with tempfile.TemporaryDirectory(prefix="behavior-review-frozen-") as tmp:
        frozen = Path(tmp)
        shutil.copytree(base_wt / tests_rel, frozen / "tests")
        suite_hash = _hash_extensions(frozen / "tests", settings.extensions)
        runner_rel = next(
            (token for token in settings.probe_runner if token.endswith((".py", ".ts", ".tsx", ".js", ".mjs"))),
            "tools/run_probe.py",
        )
        runner_src = source_of(runner_rel)
        frozen_runner = frozen / runner_src.name
        shutil.copy2(runner_src, frozen_runner)
        probes_src = source_of(probes_dir)
        shutil.copytree(probes_src, frozen / "probes")
        if not sorted((frozen / "probes").glob("*.json")):
            notes.append("no committed probes were found; no behavior claim is made from execution.")

        suites = []
        for revision, wt, sha in (("base", base_wt, pair.revisions.base_sha),
                                  ("head", head_wt, pair.revisions.head_sha)):
            dest = wt / tests_rel
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(frozen / "tests", dest)
            suites.append(run_suite(wt, tests_rel, suite_hash, python, revision, sha, settings))

        comparisons, probed = [], set()
        for probe_file in sorted((frozen / "probes").glob("*.json")):
            spec = json.loads(probe_file.read_text())
            b = run_probe_configured(base_wt, settings.probe_runner, frozen_runner, probe_file, python)
            h = run_probe_configured(head_wt, settings.probe_runner, frozen_runner, probe_file, python)
            outcome = classify(b, h)
            comparisons.append(
                _comparison(probe_file, spec, pair, b, h, outcome, settings)
            )
            target_path, target_symbol = _target_ref(spec, settings)
            probed.add((target_path, target_symbol))

    resolved_impact = impact or analyze(pair, settings.max_hops, settings)
    return suites, comparisons, needs_bob_action(resolved_impact, probed), notes


def _target_ref(spec: dict, config: BehaviorConfig) -> tuple[str, str]:
    target = spec["target"]
    if isinstance(target, dict):
        return str(target["path"]).replace("\\", "/"), str(target["symbol"])
    path, _, symbol = str(target).partition(":")
    if "/" in path or path.endswith(config.extensions):
        if not path.endswith(config.extensions):
            path += config.extensions[0]
        return path, symbol
    return path.replace(".", "/") + ".py", symbol


def _comparison(probe_file: Path, spec: dict, pair, b, h, outcome, config: BehaviorConfig | None = None):
    b_status, b_out, b_exc, b_ms = b
    h_status, h_out, h_exc, h_ms = h
    if not HAS_SCHEMA:
        return dict(probe=spec["id"], outcome=str(outcome), base=b_out, head=h_out)
    settings = config or BehaviorConfig()
    target_path, target_symbol = _target_ref(spec, settings)
    return Comparison(
        probe=Probe(
            id=spec["id"],
            target=SymbolRef(path=target_path, symbol=target_symbol),
            input=spec.get("input", {"args": spec.get("args", [])}),
            hash="sha256:" + _sha8(probe_file.read_text()),
            authored_by=spec.get("authored_by", "human"),
        ),
        base=Observation(revision=Revision.BASE, sha=pair.revisions.base_sha, status=b_status,
                         output=b_out, exception=b_exc, duration_ms=b_ms),
        head=Observation(revision=Revision.HEAD, sha=pair.revisions.head_sha, status=h_status,
                         output=h_out, exception=h_exc, duration_ms=h_ms),
        outcome=Outcome(outcome),
        ran_at=datetime.now(timezone.utc),
    )


def needs_bob_action(impact, probed):
    """Impacted non-test callers outside the diff that no committed probe covers."""
    if not HAS_SCHEMA:
        return []
    covered = set(probed)
    missing = []
    for path in impact.paths:
        first = path.hops[0]
        if not path.outside_diff or path.is_test:
            continue
        if (first.path, first.symbol) not in covered:
            ref = SymbolRef(path=first.path, symbol=first.symbol)
            if ref.key not in {m.key for m in missing}:
                missing.append(ref)
    return missing
