from pathlib import Path

import pytest

from app.config import BehaviorConfig, ConfigError, load_config


def test_missing_config_keeps_python_defaults(tmp_path: Path):
    config = load_config(tmp_path)
    assert config == BehaviorConfig()
    assert config.language == "python"
    assert config.test_command == ("python", "-m", "pytest", "-q", "--no-header")


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
