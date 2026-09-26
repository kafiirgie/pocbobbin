"""Whole-repository module map: files, their imports, and each file's last commit. Owner: E.

Drawn from the language adapters and git only, never by a model (FINAL_PLAN §16.3). An import the
adapters can't resolve is listed as unknown, not dropped. File level only: function calls belong to
the per-PR evidence map.
"""

from __future__ import annotations

import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from pydantic import ConfigDict, Field

from app.adapters.registry import get_adapter
from app.config import BehaviorConfig, load_config
from app.impact import import_graph as python_import_graph
from app.schemas import ImportRef, Model

SCHEMA_VERSION = "map-0.1"
# "Merge pull request #22 from …" (merge commits) or "… (#22)" (squash commits).
PR_NUMBER = re.compile(r"Merge pull request #(\d+)|\(#(\d+)\)\s*$")


class LastCommit(Model):
    sha: str
    date: str
    subject: str
    pr: int | None


class MapModule(Model):
    path: str
    language: str
    tier: str
    last_commit: LastCommit | None


class MapEdge(Model):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    source: str = Field(alias="from")
    target: str = Field(alias="to")
    kind: str = "import"
    line: int


class MapUnknown(Model):
    path: str
    line: int
    expression: str
    reason: str


class RepoMap(Model):
    schema_version: str = SCHEMA_VERSION
    repo: str
    sha: str
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    modules: list[MapModule]
    edges: list[MapEdge]
    unknowns: list[MapUnknown]
    limits: list[str]


def last_commits(repo_root: Path, sha: str) -> dict[str, LastCommit]:
    """The newest mainline commit touching each path, from one `git log` pass instead of one per file.

    First-parent history with merges diffed against their first parent attributes a file to the
    "Merge pull request #N" (or squash "(#N)") commit that brought it in, which carries the PR number.
    """
    out = subprocess.run(
        ["git", "-C", str(repo_root), "log", sha, "--first-parent", "--diff-merges=first-parent",
         "--format=%x1e%H%x09%cs%x09%s", "--name-only"],
        capture_output=True, text=True, encoding="utf-8", check=True,
    ).stdout
    commits: dict[str, LastCommit] = {}
    for chunk in out.split("\x1e")[1:]:
        header, *paths = chunk.strip("\n").split("\n")
        commit_sha, date, subject = header.split("\t", 2)
        match = PR_NUMBER.search(subject)
        commit = LastCommit(sha=commit_sha[:7], date=date, subject=subject,
                            pr=int(match.group(1) or match.group(2)) if match else None)
        for path in filter(None, paths):
            commits.setdefault(path, commit)
    return commits


def _language_imports(root: Path, config: BehaviorConfig, language: str) -> tuple[list[str], list[ImportRef]]:
    if language == "python":
        return python_import_graph(root)
    from app.impact_treesitter import import_graph  # Tree-sitter loads only when a repo needs it

    return import_graph(root, config.for_language(language))


def build(checkout: Path, repo_root: Path, repo: str, sha: str) -> RepoMap:
    config = load_config(checkout)
    commits = last_commits(repo_root, sha)
    modules: dict[str, MapModule] = {}
    refs: list[ImportRef] = []
    for language in config.languages:
        paths, found = _language_imports(checkout, config, language)
        tier = get_adapter(language).spec.tier
        for path in paths:
            modules.setdefault(path, MapModule(path=path, language=language, tier=tier, last_commit=commits.get(path)))
        refs += found

    lines: dict[tuple[str, str], int] = {}
    for ref in refs:
        if ref.target:
            key = (ref.source, ref.target)
            lines[key] = min(lines.get(key, ref.line), ref.line)
    return RepoMap(
        repo=repo,
        sha=sha,
        modules=sorted(modules.values(), key=lambda module: module.path),
        edges=[MapEdge(source=s, target=t, line=line) for (s, t), line in sorted(lines.items())],
        unknowns=[MapUnknown(path=r.source, line=r.line, expression=r.expression, reason=r.reason)
                  for r in refs if r.target is None],
        limits=[
            "File-level imports only; function calls are in the PR evidence map.",
            "Imports of packages outside this repository are not shown; neither are TypeScript path aliases "
            "(e.g. `@/`), which need the project's tsconfig to resolve.",
            "Imports the adapters cannot resolve (dynamic, ambiguous, unresolved relative) are listed as unknowns.",
            f"Last commit per module is taken from git history at {sha[:7]}.",
        ],
    )
