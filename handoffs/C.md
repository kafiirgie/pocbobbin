# Handoff — Lane C (Demo UI & report rendering)

**Status:** viewer and renderer on `main` (PR #12), wired to real engine reports in the lane A
review follow-up. Detailed design notes: `PERSON_C_PLAN.md`.

## Works
- `app/report.py` — `render_markdown(report)` (PR-comment Markdown) and `to_web_data(report)`.
  Accepts a `ReviewReport` or a plain dict, redacts local paths and secrets, never labels a delta
  a bug or a same-on-tested-cases result safe. Renders impact `hops` as
  `caller (file:line) → changed (file:line)`, per-revision suite counts, prior ledger decisions and
  `needs_bob_action`. Exposed by the CLI as `behavior-review ... --markdown report.md`.
- `web/` — Vite + React + TypeScript + Tailwind evidence viewer. `src/lib/report-adapter.ts` reads
  the engine's `ReviewReport` directly (revisions, `impact.changed_symbols`, `hops`, nested `probe`,
  suite runs, `prior_decisions`) and still tolerates the older shapes in `tests/fixtures/`.
- `web/public/data/report.json` — a real `--run` of `ref/base` vs `origin/scenario1-head`
  (`fixture: false`). `npm test` (`scripts/check-report.mjs`) fails if it is a fixture, lacks real
  SHAs, a non-test caller outside the diff or probe comparisons, or contains a local path.

## Commands
```bash
cd web && npm install && npm test && npm run typecheck && npm run build
behavior-review --base ref/base --head origin/scenario1-head --run --json web/public/data/report.json
```
Vercel: root `web`, build `npm run build`, output `dist`.

## Checks run
`pytest -q` → 57 passed (includes `tests/test_report.py`). `npm test`, `npm run typecheck`,
`npm run build` pass. Viewer checked in a browser with the real scenario 1 report: 1 caller
outside the diff (`price_total`, invoice.py:25), 2 deltas (100.0 → 99.99), tests green on both
sides, the approved Scenario 2 decision shown.

## Next
- Deploy to Vercel and test the URL from a fresh browser.
- Link the page to a public Actions run (`links.action_run`) once one exists for a scenario PR.

## Open question for the team
`PERSON_C_PLAN.md` scopes out the video, slides and presentation, but `FINAL_PLAN.md` §10 gives
lane C the video, slides and both 500-word statements. Someone needs to own them before 14:00.
