from pathlib import Path

import pytest

from app.schemas import ReviewReport

CONTRACTS = sorted((Path(__file__).parent.parent / "contracts").glob("report_*.json"))


@pytest.mark.parametrize("path", CONTRACTS, ids=lambda p: p.name)
def test_fixture_matches_schema_and_is_labeled(path: Path):
    report = ReviewReport.model_validate_json(path.read_text(encoding="utf-8"))
    assert report.fixture is True


DISPLAY_NAMES = {
    "python": "Python", "typescript": "TypeScript", "javascript": "JavaScript", "java": "Java", "csharp": "C#",
    "go": "Go", "cpp": "C++", "c": "C", "rust": "Rust", "php": "PHP", "kotlin": "Kotlin", "ruby": "Ruby",
    "swift": "Swift", "dart": "Dart", "bash": "Bash",
}


def test_readme_tier_table_matches_the_registry():
    """The README must never claim more (or less) than app/adapters/registry.py declares."""
    from app.adapters.registry import ADAPTERS, TIERS

    readme = (Path(__file__).parent.parent / "README.md").read_text(encoding="utf-8")
    documented = {}
    for line in readme.splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) == 3 and cells[0].strip("`") in TIERS:
            documented[cells[0].strip("`")] = {name.strip() for name in cells[1].split(",")}
    declared = {tier: {DISPLAY_NAMES[lang] for lang, a in ADAPTERS.items() if a.spec.tier == tier} for tier in TIERS}
    assert documented == declared