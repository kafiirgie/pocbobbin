# Behavior Review evidence viewer

Static Vite + React + TypeScript viewer built with shadcn/ui and React Flow. It renders any
`ReviewReport` (`public/data/report.json`) and, when present, a repo map (`public/data/repo_map.json`),
in two tabs:

- **PR review:** summary with language/tier and verdict counts, the evidence map (callers → changed
  code, nested by folder and file, colored by what execution showed), behavior differences, items
  that need attention, a session-only decision form with prior ledger decisions, tests and limits.
- **Repo map:** every file grouped by folder with its imports and last commit/PR; it opens on the
  files the PR changed.

The shipped data is the unmodified artifact of a real `behavior-review` Action run (Scenario 1, demo
PR #19), stamped with the run's URL, and the page links to that public log. `npm test` rejects a
fixture, a report without an Actions run link, or one containing local paths.

## Local commands

```bash
npm install
npm test          # checks public/data/report.json is real, linked CI evidence
npm run dev
npm run typecheck
npm run build
npm run preview
```

To refresh both files from a newer Action run:
`gh run download <run-id> --repo webdev-testa/pocbobbin --name behavior-review-report --dir public/data`

To view another repository, generate its files and pick them with **Open report…** in the header:

```bash
behavior-review --base main --head HEAD --json report.json   # add --run to execute tests and probes
behavior-review map --ref HEAD --out repo_map.json            # optional; must be the report's head commit
```

The files are read in the browser and never uploaded; reloading returns to the shipped report. To
make them the default instead, put them in `public/data/` and rebuild (`npm test` then applies to
them too).

Libraries and licenses: `THIRD_PARTY.md`.

## Vercel

- Root Directory: `web`
- Build Command: `npm run build`
- Output Directory: `dist`
