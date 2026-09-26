# Behavior Review evidence viewer

Static Vite + React + TypeScript viewer for the review report. `public/data/report.json` is the
unmodified `report.json` artifact of a real `behavior-review` Action run (Scenario 1, demo PR #19),
stamped with the run's URL; the page links to that public log. `npm test` rejects a fixture, a
report without an Actions run link, or one containing local paths.

## Local commands

```bash
npm install
npm test          # checks public/data/report.json is real, linked CI evidence
npm run dev
npm run typecheck
npm run build
npm run preview
```

To refresh the data from a newer Action run:
`gh run download <run-id> --repo webdev-testa/pocbobbin --name behavior-review-report --dir public/data`

## Vercel

- Root Directory: `web`
- Build Command: `npm run build`
- Output Directory: `dist`
