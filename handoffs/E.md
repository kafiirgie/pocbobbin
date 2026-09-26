# Handoff — Lane E (Maps)

**Status:** repo map backend on its PR (E2, P2.1). Evidence map UI (E1) is on the web redesign branch.

## Works
- `app/repo_map.py` — `build(checkout, repo_root, repo, sha) -> RepoMap` (`map-0.1`, FINAL_PLAN §16.3):
  every source module with language + tier (from `AdapterSpec.tier`), file-level import edges
  (`from`/`to`/`kind`/`line`), unknown imports, and each module's last mainline commit
  (`git log --first-parent --diff-merges=first-parent`, one pass) with the PR number parsed from
  "Merge pull request #N" or a squash "(#N)" subject. No author names in the file.
- Imports come from the adapters, not a copy: `impact.import_graph(root)` (Python, records each
  import statement's line and `importlib.import_module`/`__import__`) and
  `impact_treesitter.import_graph(root, config)` (other languages). Dynamic, ambiguous and
  unresolved relative imports are unknowns; external packages and TS path aliases are left out
  and said so in `limits`.
- CLI `behavior-review map --ref HEAD --out repo_map.json` (reads the committed revision through
  `open_pair`, never the working tree). The Action uploads `repo_map.json` in the same artifact
  as `report.json`.

## Checks run
`pytest -q` → 124 passed. On this repository at `e784d08`: 53 modules (30 Python, 23 TypeScript),
106 import edges, 1 unknown (`tools/run_probe.py:20 importlib.import_module(module_path)`), every
module with a PR number; about 1 second.

## Next
- Web: "Repo map" tab reads `web/public/data/repo_map.json` from the Action artifact.
- `CHANGE_NOTES.md` template for D's Bob mode (§16.4).
