# Handoff — Lane A (Analysis)

**Branch / SHA:** not committed yet (repo had no commits at start).

## Works
- `app/schemas.py` — all shared models (`ReviewReport` is the single object every door consumes).
  `RevisionPair` is runtime-only: `repo` slug, local `root`/`base_path`/`head_path`, plus
  `revisions` (refs, SHAs, changed files) — only `repo` and `revisions` go into a report.
  `Comparison` embeds its `Probe`; `Decision` uses `target: SymbolRef`.
- `app/snapshot.py` — `open_pair(repo, base, head)` context manager: detached `git worktree`s in a temp
  dir, removed afterwards. Working tree, index and current branch untouched (tested).
- `app/impact.py` — `analyze(pair, max_hops=2)`:
  - Symbols: functions, methods (`Class.method`), module/class-level assigned names, and `<module>`
    (remaining top-level code + imports). Tags: added / removed / signature_changed / body_changed /
    decorators_changed / imports_changed. Docstring-only edits are not changes.
  - Edges: every load of a resolvable symbol (calls, callback references, `X = helper()`), absolute +
    relative imports, `import pkg.mod` chains, `self.method`, star imports, package re-exports.
    Modules are named from their package root (`sample_project/pricing/discount.py` → `pricing.discount`);
    a name claimed by two files is ambiguous and never guessed.
  - Paths: reverse callers up to `max_hops`, union of base+head edges; `outside_diff`, `is_test` flags;
    non-test callers outside the diff sort first.
  - Unknowns: any unresolved reference or `getattr(x, "name")` whose name matches a changed symbol;
    unparseable files.
- `app/cli.py` — the single engine entry: `pipeline(repo, base, head, max_hops, run=False)`.
  With `run` (CLI `--run`) it also calls B's `runner.compare(pair, impact=impact)` inside the same
  `open_pair` block and fills `tests`, `comparisons`, `needs_bob_action` and honest limits.
- `contracts/report_scenario1.json` — generated from a real `--run` of `origin/base` vs
  `origin/scenario1-head`, then labeled `"fixture": true` with one example `unintended` decision.
  Validated by `tests/test_contracts.py`.

## Checks run
`pytest -q` → 37 passed, 1 failed on Windows only (B's `test_needs_bob_action_when_a_caller_has_no_probe`
creates a branch named `head`, which collides with `HEAD` on a case-insensitive filesystem; passes on Linux).
`behavior-review --base origin/base --head origin/scenario<N>-head --run` on Windows:
scenario 1 suite 6/6 green both sides, both probes `delta_observed` 100.0 → 99.99, caller
`price_total → apply_discount` (invoice.py:25) outside the diff; scenario 3 `same_on_tested_cases`;
scenario 4 `inconclusive`.

## Next
- `--format markdown` once C's `report.render` exists, so the Action posts C's rendering instead of its inline JS.
- Sync 2: merge and tag a demo-ready commit.

## Blockers
- No push access to `webdev-testa/pocbobbin` yet; PRs go through the `kafiirgie` fork.