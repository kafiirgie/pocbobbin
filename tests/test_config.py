from pathlib import Path

import pytest

from app.adapters import get_adapter, registered_languages
from app.config import BehaviorConfig, ConfigError, load_config


def test_missing_config_keeps_python_defaults(tmp_path: Path):
    config = load_config(tmp_path)
    assert config == BehaviorConfig()
    assert config.language == "python"
    assert config.test_command == ("python", "-m", "pytest", "-q", "--no-header")


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
