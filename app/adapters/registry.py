"""Language adapter registry.

The registry is intentionally explicit: configuration chooses a language, then
the impact pipeline chooses exactly one adapter. Tree-sitter is an implementation
detail of the non-Python adapters, not the public contract.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.config import BehaviorConfig
    from app.schemas import ImpactResult, RevisionPair


@dataclass(frozen=True)
class AdapterSpec:
    language: str
    grammar: str | None
    kind: str


class LanguageAdapter:
    spec: AdapterSpec

    def analyze(self, pair: "RevisionPair", max_hops: int, config: "BehaviorConfig") -> "ImpactResult":
        raise NotImplementedError


class PythonAdapter(LanguageAdapter):
    def __init__(self) -> None:
        self.spec = AdapterSpec("python", None, "python-ast")

    def analyze(self, pair, max_hops, config):
        # Lazy import avoids a module cycle: app.impact owns the historical
        # Python AST implementation and this registry owns dispatch.
        from app.impact import _analyze_python

        return _analyze_python(pair, max_hops)


class TreeSitterAdapter(LanguageAdapter):
    def __init__(self, language: str, grammar: str) -> None:
        self.spec = AdapterSpec(language, grammar, "tree-sitter")

    def analyze(self, pair, max_hops, config):
        from app.impact_treesitter import analyze

        return analyze(pair, max_hops, config)


ADAPTERS: dict[str, LanguageAdapter] = {
    "python": PythonAdapter(),
    **{
        language: TreeSitterAdapter(language, grammar)
        for language, grammar in {
            "typescript": "typescript",
            "javascript": "javascript",
            "java": "java",
            "csharp": "csharp",
            "go": "go",
            "cpp": "cpp",
            "c": "c",
            "rust": "rust",
            "php": "php",
            "kotlin": "kotlin",
            "ruby": "ruby",
            "swift": "swift",
            "dart": "dart",
            "bash": "bash",
        }.items()
    },
}


def get_adapter(language: str) -> LanguageAdapter:
    try:
        return ADAPTERS[language]
    except KeyError as exc:
        raise ValueError(f"no adapter registered for '{language}'") from exc


def registered_languages() -> tuple[str, ...]:
    return tuple(sorted(ADAPTERS))


__all__ = ["ADAPTERS", "AdapterSpec", "LanguageAdapter", "get_adapter", "registered_languages"]
