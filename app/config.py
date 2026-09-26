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


SUPPORTED_LANGUAGES = {
    "python",
    "typescript",
    "javascript",
    "java",
    "csharp",
    "go",
    "cpp",
    "c",
    "rust",
    "php",
    "kotlin",
    "ruby",
    "swift",
    "dart",
    "bash",
}

LANGUAGE_DEFAULTS: dict[str, dict[str, Any]] = {
    "python": {
        "extensions": (".py",),
        "tests_dir": "sample_project/tests",
        "test_command": ("python", "-m", "pytest", "-q", "--no-header"),
        "test_report": "pytest-text",
        "probe_runner": ("python", "tools/run_probe.py"),
        "test_file_patterns": ("test_*.py", "*_test.py", "conftest.py"),
        "append_tests": True,
    },
    "typescript": {
        "extensions": (".ts", ".tsx"),
        "tests_dir": "tests",
        "test_command": ("npx", "vitest", "run", "--reporter=json"),
        "test_report": "vitest-json",
        "probe_runner": ("npx", "tsx", "tools/run_probe.ts"),
        "test_file_patterns": ("*.test.ts", "*.spec.ts", "*.test.tsx", "*.spec.tsx"),
        "append_tests": True,
    },
    "javascript": {
        "extensions": (".js", ".jsx", ".mjs", ".cjs"),
        "tests_dir": "tests",
        "test_command": ("npx", "vitest", "run", "--reporter=json"),
        "test_report": "vitest-json",
        "probe_runner": ("node", "tools/run_probe.ts"),
        "test_file_patterns": ("*.test.js", "*.spec.js", "*.test.jsx", "*.spec.jsx"),
        "append_tests": True,
    },
    "java": {
        "extensions": (".java",),
        "tests_dir": "src/test",
        "test_command": ("mvn", "-q", "test"),
        "test_report": "junit-xml",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*Test.java", "*Tests.java"),
        "append_tests": False,
    },
    "csharp": {
        "extensions": (".cs",),
        "tests_dir": "tests",
        "test_command": ("dotnet", "test", "--logger", "trx;LogFileName=TestResults.trx"),
        "test_report": "trx-xml",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*Tests.cs", "*Test.cs"),
        "append_tests": False,
    },
    "go": {
        "extensions": (".go",),
        "tests_dir": ".",
        "test_command": ("go", "test", "-json", "./..."),
        "test_report": "go-test-json",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*_test.go",),
        "append_tests": False,
    },
    "cpp": {
        "extensions": (".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx"),
        "tests_dir": "tests",
        "test_command": ("ctest", "--test-dir", "build", "--output-on-failure"),
        "test_report": "ctest-text",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*.cpp", "*.cc", "*.cxx", "*_test.cpp", "*_test.cc"),
        "append_tests": False,
    },
    "c": {
        "extensions": (".c", ".h"),
        "tests_dir": "tests",
        "test_command": ("ctest", "--test-dir", "build", "--output-on-failure"),
        "test_report": "ctest-text",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*_test.c", "test_*.c"),
        "append_tests": False,
    },
    "rust": {
        "extensions": (".rs",),
        "tests_dir": "tests",
        "test_command": ("cargo", "test", "--quiet"),
        "test_report": "cargo-text",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*.rs",),
        "append_tests": False,
    },
    "php": {
        "extensions": (".php",),
        "tests_dir": "tests",
        "test_command": ("vendor/bin/phpunit", "--testdox"),
        "test_report": "phpunit-text",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*Test.php", "Test*.php"),
        "append_tests": False,
    },
    "kotlin": {
        "extensions": (".kt", ".kts"),
        "tests_dir": "src/test",
        "test_command": ("gradle", "test"),
        "test_report": "junit-xml",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*Test.kt", "*Tests.kt"),
        "append_tests": False,
    },
    "ruby": {
        "extensions": (".rb",),
        "tests_dir": "spec",
        "test_command": ("bundle", "exec", "rspec", "--format", "json"),
        "test_report": "rspec-json",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*_spec.rb", "test_*.rb"),
        "append_tests": False,
    },
    "swift": {
        "extensions": (".swift",),
        "tests_dir": "Tests",
        "test_command": ("swift", "test"),
        "test_report": "swift-text",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*Tests.swift", "*Test.swift"),
        "append_tests": False,
    },
    "dart": {
        "extensions": (".dart",),
        "tests_dir": "test",
        "test_command": ("dart", "test", "--reporter=json"),
        "test_report": "dart-json",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*_test.dart",),
        "append_tests": False,
    },
    "bash": {
        "extensions": (".sh", ".bash"),
        "tests_dir": "tests",
        "test_command": ("bash", "tests/run.sh"),
        "test_report": "shell-text",
        "probe_runner": ("python", "tools/run_command_probe.py"),
        "test_file_patterns": ("*.sh", "test_*.bash"),
        "append_tests": False,
    },
}

SUPPORTED_TEST_REPORTS = {
    "pytest-text",
    "vitest-json",
    "junit-xml",
    "trx-xml",
    "go-test-json",
    "ctest-text",
    "cargo-text",
    "phpunit-text",
    "rspec-json",
    "swift-text",
    "dart-json",
    "shell-text",
}


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
    append_tests: bool = True
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
        aliases.update({
            "cs": "csharp", "c#": "csharp", "c-sharp": "csharp", "c++": "cpp",
            "cxx": "cpp", "kt": "kotlin", "rb": "ruby", "sh": "bash", "shell": "bash",
        })
        language = aliases.get(language, language)
        if language not in SUPPORTED_LANGUAGES:
            raise ConfigError(f"unsupported behavior-review language '{language}'")

        defaults = LANGUAGE_DEFAULTS[language]
        extensions = tuple(
            extension if extension.startswith(".") else f".{extension}"
            for extension in strings("extensions", defaults["extensions"])
        )
        if not extensions:
            raise ConfigError("behavior.json field 'extensions' must not be empty")
        tests_dir = value.get("tests_dir", defaults["tests_dir"])
        if not isinstance(tests_dir, str) or not tests_dir.strip():
            raise ConfigError("behavior.json field 'tests_dir' must be a non-empty string")

        max_hops = value.get("max_hops", cls.max_hops)
        if not isinstance(max_hops, int) or isinstance(max_hops, bool) or max_hops < 1:
            raise ConfigError("behavior.json field 'max_hops' must be a positive integer")

        known = {
            "language", "extensions", "changed_file_filter", "tests_dir", "test_command",
            "test_report", "probe_runner", "test_file_patterns", "max_hops", "append_tests",
        }
        test_command = strings("test_command", defaults["test_command"])
        probe_runner = strings("probe_runner", defaults["probe_runner"])
        test_file_patterns = strings("test_file_patterns", defaults["test_file_patterns"])
        if not test_command or not probe_runner or not test_file_patterns:
            raise ConfigError("test_command, probe_runner, and test_file_patterns must not be empty")
        test_report = value.get("test_report", defaults["test_report"])
        if not isinstance(test_report, str) or test_report.strip().lower() not in SUPPORTED_TEST_REPORTS:
            allowed = ", ".join(sorted(SUPPORTED_TEST_REPORTS))
            raise ConfigError(f"behavior.json field 'test_report' must be one of: {allowed}")
        append_tests = value.get("append_tests", defaults["append_tests"])
        if not isinstance(append_tests, bool):
            raise ConfigError("behavior.json field 'append_tests' must be a boolean")
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
            append_tests=append_tests,
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
