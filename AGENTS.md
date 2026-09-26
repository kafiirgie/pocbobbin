# Person C Branch Instructions

This branch is the dedicated working area for Person C's code lane.

## Branch rule

- Work on `person-c` only.
- Before editing, verify with `git branch --show-current`.
- Do not switch to `main` or another lane branch unless the team explicitly asks.
- Keep Person C commits focused and small.

## Read first

- `FINAL_PLAN.md` is the authoritative team plan.
- This file defines the Person C scope for this branch.

## Person C scope

Own and improve:

- `web/`: React + TypeScript + Vite + Tailwind + shadcn/ui evidence viewer
- `app/report.py`: Markdown PR-comment rendering and web-data transformation
- C-owned tests and fixtures needed to verify the renderer and UI
- C handoff documentation

The web page is a technical evidence viewer, not a generic marketing dashboard. It must show real report evidence clearly:

- run metadata and base/head commits
- changed symbols
- callers outside the diff
- impact paths and unknown edges
- probe inputs and before/after outputs
- `same_on_tested_cases`, `delta_observed`, and `inconclusive` outcomes
- human dispositions and rationale requirements
- limitations and Action/artifact links

Visitor decisions are session-only. They must not be saved as approvals or written to the repository.

## Do not own or modify without agreement

- `app/schemas.py`
- `app/snapshot.py`
- `app/impact.py`
- `app/runner.py`
- `app/cli.py`
- `probes/`
- `sample_project/`
- `decisions.py`
- `behavior_decisions/`
- `.bob/`
- `.github/workflows/`

A owns the shared report schema. B owns execution evidence. D owns decisions, Bob integration, and GitHub Actions. Ask the owner before changing their files.

## Grounding rules

- Use fixture data only while the engine is unavailable, and label it with `"fixture": true`.
- Replace fixtures with real reports before final demo use.
- Never present AI text as execution evidence.
- Unknown edges are not safe edges.
- Setup failures, import errors, timeouts, and malformed probes are `inconclusive`.
- Do not invent outputs, commit SHAs, Action URLs, or probe hashes.
- Do not publish local absolute paths or secrets.

## Visual direction

Use a restrained IBM/Carbon-informed evidence-dossier style:

- neutral surfaces with one primary blue accent
- strong hierarchy for evidence, paths, hashes, and outputs
- minimal decoration, gradients, and shadows
- consistent geometry and accessible contrast
- responsive desktop and mobile layouts
- light/dark support and reduced-motion support
- no fake terminal or dashboard screenshots

Use `tasteskill.dev` only as design reference. Do not copy its assets or make it a runtime dependency.

## Local commands

From `web/`:

```bash
npm install
npm run dev
npm run build
npm run preview
```

The Vercel deployment should use:

```text
Root Directory: web
Build Command: npm run build
Output Directory: dist
```

## Completion checklist

Before handing work to the team:

1. Confirm the current branch is `person-c`.
2. Run the relevant Python and frontend checks.
3. Verify fixture labels are not mistaken for real evidence.
4. Test loading, error, empty, delta, same, and inconclusive states.
5. Check keyboard access, mobile layout, contrast, and reduced motion.
6. Update the C handoff with files changed, commands run, results, blockers, and next steps.
7. Commit and push only Person C changes to `person-c`.
