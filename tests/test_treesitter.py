from pathlib import Path

from app.cli import pipeline
from app.impact import analyze
from app.snapshot import open_pair


def git(repo: Path, *args: str) -> str:
    import subprocess

    result = subprocess.run(
        ["git", "-c", "user.name=test", "-c", "user.email=test@example.com", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def write_files(root: Path, files: dict[str, str | None]) -> None:
    for rel, content in files.items():
        path = root / rel
        if content is None:
            path.unlink()
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def make_typescript_repo(tmp_path: Path) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-q", "-b", "base")
    write_files(
        repo,
        {
            "behavior.json": '{"language":"typescript","extensions":[".ts"],"tests_dir":"tests","test_file_patterns":["*.test.ts"]}',
            "src/discount.ts": "export function applyDiscount(value: number) { return value; }\n",
            "src/invoice.ts": 'import { applyDiscount } from "./discount";\nexport function priceTotal(value: number) { return applyDiscount(value); }\n',
            "src/legacy.ts": "export function legacy(value: number) { return applyDiscount(value); }\n",
            "tests/discount.test.ts": 'import { applyDiscount } from "../src/discount";\ntest("discount", () => applyDiscount(1));\n',
        },
    )
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "base")
    git(repo, "checkout", "-q", "-b", "head")
    write_files(repo, {"src/discount.ts": "export function applyDiscount(value: number) { return Math.round(value * 100) / 100; }\n"})
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "head")
    return repo


def test_typescript_adapter_finds_changed_symbol_and_caller(tmp_path: Path):
    repo = make_typescript_repo(tmp_path)
    with open_pair(repo, "base", "head") as pair:
        impact = analyze(pair)
    assert [(item.path, item.symbol) for item in impact.changed_symbols] == [("src/discount.ts", "applyDiscount")]
    assert any(path.render() == "priceTotal → applyDiscount" and path.outside_diff for path in impact.paths)


def test_typescript_adapter_emits_unknown_for_unresolved_changed_reference(tmp_path: Path):
    repo = make_typescript_repo(tmp_path)
    with open_pair(repo, "base", "head") as pair:
        impact = analyze(pair)
    assert any(unknown.path == "src/legacy.ts" and unknown.reason == "unresolved reference" for unknown in impact.unknowns)


def test_cli_pipeline_uses_repository_language_config(tmp_path: Path):
    repo = make_typescript_repo(tmp_path)
    report = pipeline(repo, "base", "head")
    assert report.impact.changed_symbols[0].symbol == "applyDiscount"
    assert report.impact.paths[0].render() == "priceTotal → applyDiscount"
