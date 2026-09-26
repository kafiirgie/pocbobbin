# AGENTS.md

This repository implements Behavior Review before and after a PR. `FINAL_PLAN.md` is authoritative.

## Non-negotiable rules

- AI proposes, algorithms verify, humans decide.
- Only real process output counts as evidence.
- Unknown edge is not no impact.
- Setup/import error, timeout, or nondeterminism is `inconclusive`, never a bug.
- Never edit a probe to make a difference disappear; fixes rerun the unchanged probe.
- Fixtures use `"fixture": true` and must not appear as final demo evidence.
- Do not publish local absolute paths or secrets.
- Edit only your lane's files. Shared schema changes go through A.

## Shared contracts

- `snapshot.open_pair` / `resolve_pair`: A
- `impact.analyze`: A
- `runner.compare`: B
- `decisions.validate_and_save` / `lookup`: D
- `report.render`: C

The authoritative schema is `app/schemas.py`. The example report is `contracts/report_scenario1.json`.

## Person C branch focus

The current working branch is `person-c`. Before editing, run:

```bash
git branch --show-current
```

Person C owns:

- `app/report.py`
- `web/`
- C-owned renderer/UI tests and handoff documentation

Person C is building a React + TypeScript + Vite + Tailwind + shadcn evidence viewer. The UI must show run metadata, changed symbols, impact paths, unknowns, probe inputs, base/head outputs, outcomes, human dispositions, limits, and Action/artifact links. Visitor decisions are session-only and never approvals.

Do not modify A/B/D-owned engine, probe, decision, Bob, or workflow files without agreement:

- A: `app/schemas.py`, `app/snapshot.py`, `app/impact.py`, `app/cli.py`, `pyproject.toml`, `contracts/`
- B: `app/runner.py`, `probes/`, `sample_project/`
- D: `app/decisions.py`, `behavior_decisions/`, `.bob/`, `.github/workflows/`

## C visual direction

Use a restrained IBM/Carbon-informed evidence dossier:

- neutral surfaces and one primary blue accent
- clear hierarchy for evidence, paths, hashes, and outputs
- minimal decoration and no fake terminal/dashboard screenshots
- responsive layout, accessible contrast, visible focus
- light/dark support and reduced-motion support

`tasteskill.dev` is a visual reference only, not a runtime dependency.

## Commands

Engine from repository root:

```bash
python -m venv .venv
python -m pytest -q
```

Frontend from `web/`:

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run preview
```

Vercel configuration:

```text
Root Directory: web
Build Command: npm run build
Output Directory: dist
```

## Branch and handoff rules

- Keep Person C work on `person-c`; never push it to `main`.
- Keep commits focused and include actual test results.
- Update the C handoff with files, commands, results, assumptions, blockers, and next steps.
