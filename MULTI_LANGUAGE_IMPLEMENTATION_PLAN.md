# Multi-language Behavior Review — Implementation Plan

Status: engine slices 0–4 implemented and verified on this branch. Report/viewer integration remains dependent on the final report consumer being present on the target branch; release/demo evidence is intentionally not claimed yet.

Branch: `feat/multi-language-support`

Baseline: `main` at `33295f9`.

The goal is to add a verified second language without changing the existing Python behavior-review contract or weakening the evidence rules.

Current progress:

- [x] Slice 0 — dependency baseline established; scenario tests are blocked only by missing remote fixture refs in this checkout.
- [x] Slice 1 — `behavior.json` loader with Python defaults.
- [x] Slice 2 — behavior-preserving analyzer dispatch seam.
- [x] Slice 3 — TypeScript/JavaScript Tree-sitter adapter with unknown-edge coverage.
- [x] Slice 4 — configured test reporter and probe execution support.
- [ ] Slice 5 — report/viewer integration on a branch containing the C report consumer.
- [ ] Slice 6 — final release documentation and demo evidence; README/configuration notes are updated, but final demo evidence still needs the report consumer.

## Goal and non-goals

### Goal

Analyze a TypeScript/JavaScript repository through the same pipeline used for Python:

```text
revision pair → changed symbols → impact paths → frozen tests/probes → report
```

The output must preserve the existing concepts:

- changed symbols
- callers outside the diff
- resolved impact paths
- unknown edges
- paired base/head observations
- inconclusive setup, import, timeout, and nondeterministic results
- human decisions separate from machine evidence

### Non-goals for the first delivery

- Supporting every programming language.
- Replacing Python AST analysis.
- Inferring behavior from source text without running a real process.
- Treating unresolved references as safe.
- Building a polyglot repository graph.
- Adding a database, service, webhook server, or autonomous fix loop.

TypeScript/JavaScript is the first additional target. Other languages remain future adapters.

## Current repository condition

- Python remains the default analysis language and keeps its existing `ast` implementation.
- TypeScript/JavaScript analysis is available through the optional Tree-sitter adapter in `app/impact_treesitter.py`.
- `app/runner.py` accepts configured argv commands and supports pytest text plus Vitest JSON counts, while preserving paired evidence semantics.
- `app/schemas.py` is the cross-lane contract and must remain authoritative.
- `multi-language-1.md` is the source design draft and remains unchanged.
- The project `.venv` has the editable project, pytest, and optional Tree-sitter dependencies installed for verification.
- Focused verification passes; the scenario suite cannot resolve `origin/base` because that remote fixture ref is absent from this checkout.
- The React `web/` directory is not tracked on `main`; it is leftover workspace state and is not part of this engine plan.

## Ownership rules

Work must stay within the repository lanes from `AGENTS.md`.

| Work | Owner | Files or area |
|---|---|---|
| Config, analyzer seam, schemas, optional dependencies | A | `app/`, `pyproject.toml`, contracts |
| Test/probe execution and language runners | B | `app/runner.py`, `probes/`, harnesses, fixtures |
| Report rendering and evidence viewer | C | `app/report.py`, `web/`, C tests/docs |
| Decisions, Bob mode, Action, workflow | D | `app/decisions.py`, `.bob/`, `.github/` |

Shared schema changes go through A and require affected-lane notification.

## Ordered implementation slices

### Slice 0 — Establish the baseline

Before changing code:

1. Create or activate the project virtual environment.
2. Install `pip install -e ".[dev]"`.
3. Run `python -m pytest -q`.
4. Run `python -m app.cli --help`.
5. Run one real Python review with `--json` and, separately, with `--run`.
6. Record the results and report shape.

Acceptance gate:

- Existing tests pass.
- The Python CLI runs.
- A failed baseline is understood before refactoring begins.

### Slice 1 — Add repository configuration

Add an optional root `behavior.json` loader with Python defaults. A repository without this file must behave exactly as it does today.

Initial fields:

```json
{
  "language": "python",
  "extensions": [".py"],
  "changed_file_filter": [],
  "tests_dir": "sample_project/tests",
  "test_command": ["python", "-m", "pytest", "-q", "--no-header"],
  "test_report": "pytest-text",
  "probe_runner": ["python", "tools/run_probe.py"],
  "test_file_patterns": ["test_*.py", "*_test.py", "conftest.py"],
  "max_hops": 2
}
```

Acceptance gate:

- Missing config loads Python defaults.
- Valid config overrides one field at a time.
- Invalid config fails clearly before analysis.
- Commands are argument lists, never shell strings.

### Slice 2 — Introduce the analyzer seam

Refactor the current analyzer behind a dispatch function while keeping the Python implementation behavior-preserving.

Target shape:

```text
app/impact/
  __init__.py       dispatches by configured language
  python_ast.py     existing Python analyzer moved with minimal changes
  tree_sitter.py    adapter entry point for later TypeScript work
```

This is a structural refactor, not the TypeScript feature itself.

Acceptance gate:

- Existing impact tests pass unchanged.
- Python changed symbols, paths, unknowns, and `is_test` values remain equivalent.
- No second language is claimed yet.

### Slice 3 — Implement TypeScript/JavaScript static analysis

Use the maintained `tree-sitter-language-pack` behind an optional dependency. Do not use the obsolete `tree-sitter-languages` package.

The adapter must identify enough structure for the shared models:

- function and method definitions
- module-level symbols as `<module>` where applicable
- imports, exports, and local bindings
- direct call sites
- reverse caller paths
- test-file classification from configuration
- unresolved references as `Unknown`

Start with `.ts`, `.tsx`, and `.js`. Add `.jsx` only when its parser behavior is covered by tests.

Required fixture:

```text
src/discount.ts:applyDiscount
src/invoice.ts:priceTotal → applyDiscount
```

Required unknown case:

- An unresolved or dynamic reference appears under `impact.unknowns` with a reason.
- It must not disappear and must not be treated as no impact.

Acceptance gate:

- TypeScript fixture produces the expected changed symbol and caller path.
- Unknown references are visible.
- Existing Python fixture remains green.
- Missing optional Tree-sitter dependencies produce a clear setup error, not a false result.

### Slice 4 — Make execution configuration-driven

Update runner design without changing the evidence semantics:

- execute configured test commands as argv arrays
- support reporter parsers such as `pytest-text` and `vitest-json`
- preserve frozen test-suite bytes
- hash probes and frozen inputs
- run the same probe bytes against base and head
- preserve base/head commit identifiers
- keep import errors, setup errors, timeouts, and unparsable output inconclusive

For TypeScript, add a small explicit harness only after the extensionless-import behavior is tested. The harness must not silently resolve a different module than the repository’s configured toolchain.

Acceptance gate:

- A TypeScript probe returns a real value comparison.
- A TypeScript probe can return an exception comparison.
- Test counts come from structured reporter output.
- A setup or timeout failure cannot become `delta_observed` or `same_on_tested_cases`.

### Slice 5 — Report and viewer integration

Only after the shared report shape is stable:

- update `app/report.py` if needed
- update the C adapter to consume canonical `ReviewReport` data
- show language, adapter, refs, hashes, paths, unknowns, probes, outputs, outcomes, decisions, and limits
- preserve fixture labeling
- keep visitor decisions session-only

Markdown is a presentation format. It is not an analyzer. Use ordinary Markdown links for GitHub-facing docs; WikiLinks are optional for editors that support them.

Acceptance gate:

- A real non-fixture report renders without code changes to the engine.
- Unknown and inconclusive states remain visible.
- No local absolute paths or secrets leak into the report.

### Slice 6 — Documentation and release decision

Document:

- supported languages and versions
- repository configuration
- probe and test command requirements
- extensionless TypeScript import limitations
- dynamic dispatch and reflection limitations
- unsupported languages
- what counts as evidence
- what remains unknown or inconclusive

Release only what has real fixtures and process output. If TypeScript is incomplete, ship the adapter boundary and describe TypeScript as planned rather than supported.

## Verification matrix

Every slice must keep these checks in view:

| Scenario | Expected result |
|---|---|
| Python unchanged behavior | Existing outputs and tests remain valid |
| TypeScript direct caller | Resolved impact path |
| Dynamic or unresolved call | Visible `Unknown` edge |
| Same base/head output | `same_on_tested_cases` |
| Different base/head output | `delta_observed` |
| Import/setup failure | `inconclusive` |
| Timeout | `inconclusive` |
| Nondeterministic rerun | `inconclusive` or unresolved according to runner evidence, never a bug verdict |
| Missing committed probe | `needs_bob_action`, not an inferred safety claim |
| Fixture report | Clearly marked `fixture: true` and excluded from final evidence |

## Risks and controls

### Risk: analyzer refactor changes Python results

Control: Slice 2 must pass the existing tests before Tree-sitter work begins.

### Risk: parser silently misses calls

Control: emit `Unknown` for unresolved edges and add a fixture that asserts it.

### Risk: test runner reports false green

Control: parse structured reporter output and treat parser/setup failures as inconclusive.

### Risk: TypeScript imports resolve differently in the harness

Control: test extensionless imports explicitly and use the repository’s configured resolver.

### Risk: optional dependency makes Python installation heavy or fragile

Control: keep Tree-sitter behind a `multilang` optional extra; Python remains the default install.

### Risk: cross-lane edits conflict

Control: A owns analyzer/config/schema work, B owns runners, C consumes the finalized report contract, and D owns workflow integration.

## Next handoff

1. On a branch containing the canonical C report consumer, wire language/adapter metadata and the new evidence fields into `app/report.py` and the viewer.
2. Add a real non-fixture TypeScript scenario with committed probe output and render it through the canonical report path.
3. Restore or provide the expected `origin/base` and scenario refs, then rerun the full suite and record the result before release.
