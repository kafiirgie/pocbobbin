import json
from pathlib import Path

from app.cli import main
from tests.conftest import git, write_files


def _repo(tmp_path: Path, files: dict[str, str], subject: str) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "main")
    write_files(repo, files)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", subject)
    return repo


def _map(repo: Path, tmp_path: Path) -> dict:
    out = tmp_path / "repo_map.json"
    assert main(["map", "--repo", str(repo), "--out", str(out)]) == 0
    return json.loads(out.read_text(encoding="utf-8"))


def test_python_modules_imports_unknowns_and_the_pr_that_last_touched_each_file(tmp_path: Path):
    repo = _repo(tmp_path, {
        "pkg/__init__.py": "",
        "pkg/core.py": "def f():\n    return 1\n",
        "pkg/use.py": "import importlib\nfrom pkg.core import f\n\n\ndef g(name):\n    return importlib.import_module(name), f()\n",
    }, "feat: first slice (#5)")
    git(repo, "checkout", "-q", "-b", "feature")
    write_files(repo, {"pkg/use.py": "from pkg.core import f\n\n\ndef g():\n    return f()\n"})
    git(repo, "commit", "-qam", "tweak use")
    git(repo, "checkout", "-q", "main")
    git(repo, "merge", "-q", "--no-ff", "feature", "-m", "Merge pull request #7 from someone/feature")

    repo_map = _map(repo, tmp_path)

    modules = {m["path"]: m for m in repo_map["modules"]}
    assert set(modules) == {"pkg/__init__.py", "pkg/core.py", "pkg/use.py"}
    assert {(m["language"], m["tier"]) for m in modules.values()} == {("python", "full")}
    assert modules["pkg/core.py"]["last_commit"]["pr"] == 5
    assert modules["pkg/use.py"]["last_commit"]["pr"] == 7  # the merge that brought the change in
    assert {"from": "pkg/use.py", "to": "pkg/core.py", "kind": "import", "line": 1} in repo_map["edges"]
    assert repo_map["unknowns"] == []  # the dynamic import was removed on the feature branch
    assert "test@example.com" not in json.dumps(repo_map)


def test_dynamic_import_is_unknown_not_dropped(tmp_path: Path):
    repo = _repo(tmp_path, {
        "pkg/__init__.py": "",
        "pkg/use.py": "import importlib\n\n\ndef load(name):\n    return importlib.import_module(name)\n",
    }, "init")

    repo_map = _map(repo, tmp_path)

    assert repo_map["unknowns"] == [{
        "path": "pkg/use.py", "line": 5, "expression": "importlib.import_module(name)", "reason": "dynamic import",
    }]
    assert repo_map["modules"][0]["last_commit"]["pr"] is None


def test_typescript_parent_relative_imports_resolve(tmp_path: Path):
    repo = _repo(tmp_path, {
        "src/lib/util.ts": "export function u(value: number) { return value; }\n",
        "src/components/view.ts": 'import { u } from "../lib/util";\nexport function view() { return u(1); }\n',
    }, "init")

    repo_map = _map(repo, tmp_path)

    assert {(m["path"], m["language"]) for m in repo_map["modules"]} == {
        ("src/lib/util.ts", "typescript"), ("src/components/view.ts", "typescript"),
    }
    assert {"from": "src/components/view.ts", "to": "src/lib/util.ts", "kind": "import", "line": 1} in repo_map["edges"]
