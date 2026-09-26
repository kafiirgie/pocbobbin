# Handoff — Lane A (Analysis)

**Status:** done and on `main` (PRs #1, #4, #5 and the lane A review follow-up).

## Works
- `app/schemas.py` — all shared models; `ReviewReport` is the one object every door consumes.
  `RevisionPair` is runtime-only (local checkout paths); only `repo` and `revisions` go into a report.
- `app/snapshot.py` — `open_pair(repo, base, head)`: detached `git worktree`s in a temp dir, removed
  afterwards. Working tree, index and current branch untouched.
- `app/impact.py` — `analyze(pair, max_hops=2)`:
  - Symbols: functions, methods (`Class.method`), module/class-level assigned names, `<module>`
    (other top-level code + imports). Docstring-only edits are not changes.
  - Edges: every load of a resolvable symbol (calls, callbacks, `X = helper()`), absolute and relative
    imports, `import pkg.mod` chains, `self.method`, star imports, package re-exports. Modules are
    named from their package root; a name claimed by two files is ambiguous and never guessed.
    A function's own parameters and assigned names are local and never count as references.
  - Paths: reverse callers up to `max_hops`, union of base+head edges, `outside_diff` / `is_test`.
  - Unknowns: unresolved references or `getattr(x, "name")` whose name matches a changed symbol;
    unparseable files.
- `app/cli.py` — `pipeline(repo, base, head, max_hops, run=False)`: impact, then prior decisions via
  D's `decisions.lookup` (matched on path + symbol, superseded ones relabeled), then with `run` B's
  `runner.compare(pair, impact=impact)`. CLI: `--base --head --max-hops --run --prior-report --json --markdown`
  (`--markdown` uses C's `report.render_markdown`).
- `contracts/report_scenario1.json` — generated from a real `--run` of scenario 1, labeled fixture.

## Checks run
`pytest -q` → 57 passed on Windows (whole suite, all lanes).
`behavior-review --base ref/base --head origin/scenario1-head --run` → tests 6/6 green on both sides,
`price_total` (invoice.py:25) outside the diff, `delta_observed` 100.0 → 99.99, cites decision
`951cc25e49ee`. On lane C's merge range, unknowns dropped from 35 to 7 after the local-name fix,
with identical paths and callers.

## Next
- Sync 2: tag a demo-ready commit once C's viewer shows a real report.
- After 14:00: check every technical claim in the video and statements against real runs.

## Blockers
None.
