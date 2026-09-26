from pathlib import Path

import pytest

from app.adapters import get_adapter, registered_languages
from app.config import BehaviorConfig, ConfigError, load_config


def test_missing_config_keeps_python_defaults(tmp_path: Path):
    config = load_config(tmp_path)
    assert config == BehaviorConfig()
    assert config.language == "python"
    assert config.test_command == ("python", "-m", "pytest", "-q", "--no-header")


def test_missing_config_auto_detects_typescript_defaults(tmp_path: Path):
    (tmp_path / "package.json").write_text("{}", encoding="utf-8")
    (tmp_path / "tsconfig.json").write_text("{}", encoding="utf-8")
    (tmp_path / "src").mkdir()
    (tmp_path / "src/app.ts").write_text("export const app = 1;", encoding="utf-8")

    config = load_config(tmp_path)

    assert config.language == "typescript"
    assert config.languages == ("typescript",)
    assert config.extensions == (".ts", ".tsx")
    assert config.test_report == "vitest-json"


def test_missing_config_detects_multiple_languages(tmp_path: Path):
    (tmp_path / "package.json").write_text("{}", encoding="utf-8")
    (tmp_path / "tsconfig.json").write_text("{}", encoding="utf-8")
    (tmp_path / "frontend.ts").write_text("export const frontend = 1;", encoding="utf-8")
    (tmp_path / "worker.py").write_text("def worker(): return 1", encoding="utf-8")

    config = load_config(tmp_path)

    assert config.language == "typescript"
    assert config.languages == ("typescript", "python")
    assert set(config.extensions) == {".ts", ".tsx", ".py"}


def test_explicit_config_wins_over_auto_detection(tmp_path: Path):
    (tmp_path / "package.json").write_text("{}", encoding="utf-8")
    (tmp_path / "tsconfig.json").write_text("{}", encoding="utf-8")
    (tmp_path / "app.ts").write_text("export const app = 1;", encoding="utf-8")
    (tmp_path / "behavior.json").write_text('{"language":"python"}', encoding="utf-8")

    config = load_config(tmp_path)

    assert config.language == "python"
    assert config.languages == ("python",)


def test_explicit_config_can_select_multiple_languages(tmp_path: Path):
    config = BehaviorConfig.from_mapping({"languages": ["typescript", "py"]})

    assert config.language == "typescript"
    assert config.languages == ("typescript", "python")
    assert set(config.extensions) == {".ts", ".tsx", ".py"}


def test_every_configured_language_has_an_explicit_adapter():
    expected = {
        "python", "typescript", "javascript", "java", "csharp", "go", "cpp", "c", "rust", "php",
        "kotlin", "ruby", "swift", "dart", "bash",
    }
    assert set(registered_languages()) == expected
    assert get_adapter("python").spec.kind == "python-ast"
    assert get_adapter("java").spec.grammar == "java"


def test_config_normalizes_aliases_and_extensions(tmp_path: Path):
    (tmp_path / "behavior.json").write_text(
        '{"language":"ts","extensions":["ts",".tsx"],"max_hops":3}',
        encoding="utf-8",
    )
    config = load_config(tmp_path)
    assert config.language == "typescript"
    assert config.extensions == (".ts", ".tsx")
    assert config.max_hops == 3


@pytest.mark.parametrize(
    "language, extension, report",
    [
        ("java", ".java", "junit-xml"),
        ("c#", ".cs", "trx-xml"),
        ("go", ".go", "go-test-json"),
        ("c++", ".cpp", "ctest-text"),
        ("c", ".c", "ctest-text"),
        ("rust", ".rs", "cargo-text"),
        ("php", ".php", "phpunit-text"),
        ("kotlin", ".kt", "junit-xml"),
        ("ruby", ".rb", "rspec-json"),
        ("swift", ".swift", "swift-text"),
        ("dart", ".dart", "dart-json"),
        ("shell", ".sh", "shell-text"),
    ],
)
def test_group_two_and_three_languages_have_safe_defaults(tmp_path: Path, language: str, extension: str, report: str):
    (tmp_path / "behavior.json").write_text(f'{{"language":"{language}"}}', encoding="utf-8")
    config = load_config(tmp_path)
    assert config.extensions[0] == extension
    assert config.test_report == report
    assert config.append_tests is False


@pytest.mark.parametrize(
    "payload, message",
    [
        ('{"language":"brainfuck"}', "unsupported"),
        ('{"max_hops":0}', "positive integer"),
        ('{"test_command":"pytest"}', "string array"),
        ('{"language":', "invalid JSON"),
    ],
)
def test_invalid_config_fails_clearly(tmp_path: Path, payload: str, message: str):
    (tmp_path / "behavior.json").write_text(payload, encoding="utf-8")
    with pytest.raises(ConfigError, match=message):
        load_config(tmp_path)
