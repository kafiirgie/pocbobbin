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
    # The one place a language's support tier lives (FINAL_PLAN §17, §19.1); the report,
    # limits text, maps and README all read it from here.
    tier: str


class LanguageAdapter:
    spec: AdapterSpec

    def analyze(self, pair: "RevisionPair", max_hops: int, config: "BehaviorConfig") -> "ImpactResult":
        raise NotImplementedError


class PythonAdapter(LanguageAdapter):
    def __init__(self) -> None:
        self.spec = AdapterSpec("python", None, "python-ast", "full")

    def analyze(self, pair, max_hops, config):
        # Lazy import avoids a module cycle: app.impact owns the historical
        # Python AST implementation and this registry owns dispatch.
        from app.impact import _analyze_python

        return _analyze_python(pair, max_hops)


class TreeSitterAdapter(LanguageAdapter):
    def __init__(self, language: str, grammar: str, tier: str) -> None:
        self.spec = AdapterSpec(language, grammar, "tree-sitter", tier)

    def analyze(self, pair, max_hops, config):
        from app.impact_treesitter import analyze

        return analyze(pair, max_hops, config)


TIERS = ("full", "static_probe", "static_cross_file", "experimental")

# Plain-language warning added to a report's limits for every tier below "full".
TIER_LIMITS = {
    "static_probe": "static cross-file impact plus a probe harness; no end-to-end behavior run is verified "
                    "for this language yet",
    "static_cross_file": "static cross-file impact only; test and probe results depend on the configured "
                         "toolchain and are not verified for this language",
    "experimental": "experimental: same-file callers only, and name-based matching can miss or invent edges",
}

ADAPTERS: dict[str, LanguageAdapter] = {
    "python": PythonAdapter(),
    **{
        language: TreeSitterAdapter(language, grammar, tier)
        for language, (grammar, tier) in {
            "typescript": ("typescript", "static_probe"),
            "javascript": ("javascript", "static_probe"),
            "java": ("java", "static_cross_file"),
            "csharp": ("csharp", "static_cross_file"),
            "go": ("go", "static_cross_file"),
            "cpp": ("cpp", "experimental"),
            "c": ("c", "experimental"),
            "rust": ("rust", "experimental"),
            "php": ("php", "experimental"),
            "kotlin": ("kotlin", "experimental"),
            "ruby": ("ruby", "experimental"),
            "swift": ("swift", "experimental"),
            "dart": ("dart", "experimental"),
            "bash": ("bash", "experimental"),
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


__all__ = ["ADAPTERS", "TIERS", "TIER_LIMITS", "AdapterSpec", "LanguageAdapter", "get_adapter", "registered_languages"]
