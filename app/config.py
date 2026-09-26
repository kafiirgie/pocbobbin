"""Repository-level behavior-review configuration.

The defaults deliberately reproduce the current Python/pytest workflow. A
repository does not need a ``behavior.json`` file until it opts into another
language or a different test/probe toolchain.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


class ConfigError(ValueError):
    """Raised when behavior.json cannot be used safely."""


@dataclass(frozen=True)
class BehaviorConfig:
    language: str = "python"
    extensions: tuple[str, ...] = (".py",)
    changed_file_filter: tuple[str, ...] = ()
    tests_dir: str = "sample_project/tests"
    test_command: tuple[str, ...] = ("python", "-m", "pytest", "-q", "--no-header")
    test_report: str = "pytest-text"
    probe_runner: tuple[str, ...] = ("python", "tools/run_probe.py")
    test_file_patterns: tuple[str, ...] = ("test_*.py", "*_test.py", "conftest.py")
    max_hops: int = 2
    extra: dict[str, Any] = field(default_factory=dict, compare=False, repr=False)

    @classmethod
    def from_mapping(cls, value: dict[str, Any]) -> "BehaviorConfig":
        if not isinstance(value, dict):
            raise ConfigError("behavior.json must contain a JSON object")

        def strings(name: str, default: tuple[str, ...]) -> tuple[str, ...]:
            raw = value.get(name, default)
            if not isinstance(raw, (list, tuple)) or not all(isinstance(item, str) and item.strip() for item in raw):
                raise ConfigError(f"behavior.json field '{name}' must be a non-empty string array")
            return tuple(item.strip() for item in raw)

        language = value.get("language", cls.language)
        if not isinstance(language, str) or not language.strip():
            raise ConfigError("behavior.json field 'language' must be a non-empty string")
        language = language.strip().lower()
        aliases = {"ts": "typescript", "tsx": "typescript", "js": "javascript", "jsx": "javascript"}
        language = aliases.get(language, language)
        if language not in {"python", "typescript", "javascript"}:
            raise ConfigError(f"unsupported behavior-review language '{language}'")

        extensions = tuple(
            extension if extension.startswith(".") else f".{extension}"
            for extension in strings("extensions", cls.extensions)
        )
        if not extensions:
            raise ConfigError("behavior.json field 'extensions' must not be empty")
        tests_dir = value.get("tests_dir", cls.tests_dir)
        if not isinstance(tests_dir, str) or not tests_dir.strip():
            raise ConfigError("behavior.json field 'tests_dir' must be a non-empty string")

        max_hops = value.get("max_hops", cls.max_hops)
        if not isinstance(max_hops, int) or isinstance(max_hops, bool) or max_hops < 1:
            raise ConfigError("behavior.json field 'max_hops' must be a positive integer")

        known = {
            "language", "extensions", "changed_file_filter", "tests_dir", "test_command",
            "test_report", "probe_runner", "test_file_patterns", "max_hops",
        }
        test_command = strings("test_command", cls.test_command)
        probe_runner = strings("probe_runner", cls.probe_runner)
        test_file_patterns = strings("test_file_patterns", cls.test_file_patterns)
        if not test_command or not probe_runner or not test_file_patterns:
            raise ConfigError("test_command, probe_runner, and test_file_patterns must not be empty")
        test_report = value.get("test_report", cls.test_report)
        if not isinstance(test_report, str) or test_report.strip().lower() not in {"pytest-text", "vitest-json"}:
            raise ConfigError("behavior.json field 'test_report' must be 'pytest-text' or 'vitest-json'")
        return cls(
            language=language,
            extensions=extensions,
            changed_file_filter=strings("changed_file_filter", cls.changed_file_filter),
            tests_dir=tests_dir.strip().replace("\\", "/"),
            test_command=test_command,
            test_report=test_report.strip().lower(),
            probe_runner=probe_runner,
            test_file_patterns=test_file_patterns,
            max_hops=max_hops,
            extra={key: item for key, item in value.items() if key not in known},
        )


def load_config(repo: str | Path, filename: str = "behavior.json") -> BehaviorConfig:
    """Load optional configuration from a repository root.

    Missing configuration is intentionally equivalent to the current Python
    defaults. Malformed configuration fails before analysis rather than
    silently selecting a different execution toolchain.
    """

    path = Path(repo) / filename
    if not path.exists():
        return BehaviorConfig()
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ConfigError(f"cannot read {filename}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise ConfigError(f"invalid JSON in {filename}: {exc.msg} at line {exc.lineno}") from exc
    return BehaviorConfig.from_mapping(value)


__all__ = ["BehaviorConfig", "ConfigError", "load_config"]
