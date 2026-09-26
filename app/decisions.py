"""Decision ledger management for Behavior Review.

Handles validation, saving, and historical lookup of behavior decisions.
Follows the Management of Change (MOC) principle:
- Propose during review on a PR branch (status: proposed).
- Approves automatically when merged into main (status: approved).
- Lookup surfaces prior decisions to provide context for subsequent reviews.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field, ValidationError

# Attempt import from app.schemas (Lane A). Fall back to canonical definition if schemas.py is not yet merged.
try:
    from app.schemas import Decision, DecisionMatch  # type: ignore
except ImportError:

    class Decision(BaseModel):
        id: str = Field(description="Deterministic 12-character SHA-256 hash")
        repo: str = Field(default="", description="Repository identifier")
        path: str = Field(description="Relative path of file containing the symbol")
        symbol: str = Field(description="Name of the affected function or symbol")
        base_sha: str = Field(default="", description="Base commit SHA")
        head_sha: str = Field(default="", description="Head commit SHA")
        probe_hash: str = Field(default="", description="Hash of probe used for observation")
        before_behavior: Any = Field(description="Output or behavior on base revision")
        after_behavior: Any = Field(description="Output or behavior on head revision")
        intent: Literal["unintended", "intended", "unresolved"] = Field(
            description="Author disposition: unintended, intended, or unresolved"
        )
        rationale: Optional[str] = Field(
            default=None,
            description="Mandatory justification if intent is intended (>= 10 characters)",
        )
        requirement_ref: Optional[str] = Field(
            default=None, description="Optional issue, ticket, or requirement reference"
        )
        status: Literal["proposed", "approved"] = Field(
            default="proposed",
            description="Proposed during branch review; approved once merged to main",
        )
        supersedes: Optional[str] = Field(
            default=None, description="ID of a prior decision that this decision supersedes"
        )
        timestamp: str = Field(
            default_factory=lambda: datetime.now(timezone.utc).isoformat(),
            description="UTC ISO timestamp of the decision record",
        )

    class DecisionMatch(BaseModel):
        symbol: str
        decision: Decision
        match_type: Literal["approved", "stale", "superseded"] = "approved"
        is_stale: bool = False
        reason: Optional[str] = None


def generate_decision_id(
    repo: str,
    symbol: str,
    base_sha: str,
    head_sha: str,
    probe_hash: str,
) -> str:
    """Generate a deterministic 12-char SHA-256 ID for a decision."""
    raw = f"{repo.strip()}:{symbol.strip()}:{base_sha.strip()}:{head_sha.strip()}:{probe_hash.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def validate_and_save(
    delta: Union[Dict[str, Any], Any],
    disposition: str,
    rationale: Optional[str] = None,
    *,
    repo_root: Optional[Union[Path, str]] = None,
    repo: str = "",
    base_sha: str = "",
    head_sha: str = "",
    requirement_ref: Optional[str] = None,
    supersedes: Optional[str] = None,
    status: Literal["proposed", "approved"] = "proposed",
) -> Decision:
    """Validate a behavior decision and record it into the behavior_decisions/ ledger.

    Args:
        delta: Dictionary or object containing observed difference metadata
               (symbol, path, probe_hash, before/after behavior).
        disposition: One of 'unintended', 'intended', or 'unresolved'.
        rationale: Human-written reason for change. Mandatory when disposition is 'intended'.
        repo_root: Root directory of repository. Defaults to cwd.
        repo: Repository identifier.
        base_sha: Base commit SHA.
        head_sha: Head commit SHA.
        requirement_ref: Optional requirement/issue reference.
        supersedes: Explicit ID of previous decision being superseded.
        status: 'proposed' (default) or 'approved'.

    Returns:
        The validated and persisted Decision instance.

    Raises:
        ValueError: If disposition is invalid, rationale is missing for intended changes,
                    or required symbol/path details are absent.
    """
    root_path = Path(repo_root) if repo_root else Path.cwd()
    ledger_dir = root_path / "behavior_decisions"
    ledger_dir.mkdir(parents=True, exist_ok=True)

    # Normalize disposition
    normalized_disp = disposition.strip().lower()
    if normalized_disp not in {"unintended", "intended", "unresolved"}:
        raise ValueError(
            f"Invalid disposition '{disposition}'. Must be one of: 'unintended', 'intended', 'unresolved'."
        )

    # Validate rationale for intended changes
    clean_rationale = rationale.strip() if rationale else None
    if normalized_disp == "intended":
        if not clean_rationale or len(clean_rationale) < 10:
            raise ValueError(
                "A rationale of at least 10 characters is strictly required for intended behavior changes."
            )

    # Extract delta properties
    if isinstance(delta, dict):
        symbol = delta.get("symbol") or delta.get("symbol_name") or ""
        path = delta.get("path") or delta.get("file_path") or ""
        probe_hash = delta.get("probe_hash") or ""
        before_behavior = delta.get("before") if "before" in delta else delta.get("before_behavior")
        after_behavior = delta.get("after") if "after" in delta else delta.get("after_behavior")
        if before_behavior is None and "base_output" in delta:
            before_behavior = delta.get("base_output")
        if after_behavior is None and "head_output" in delta:
            after_behavior = delta.get("head_output")
        repo = repo or delta.get("repo", "")
        base_sha = base_sha or delta.get("base_sha", "")
        head_sha = head_sha or delta.get("head_sha", "")
    else:
        symbol = getattr(delta, "symbol", getattr(delta, "symbol_name", ""))
        path = getattr(delta, "path", getattr(delta, "file_path", ""))
        probe_hash = getattr(delta, "probe_hash", "")
        before_behavior = getattr(delta, "before", getattr(delta, "before_behavior", getattr(delta, "base_output", None)))
        after_behavior = getattr(delta, "after", getattr(delta, "after_behavior", getattr(delta, "head_output", None)))
        repo = repo or getattr(delta, "repo", "")
        base_sha = base_sha or getattr(delta, "base_sha", "")
        head_sha = head_sha or getattr(delta, "head_sha", "")

    if not symbol:
        raise ValueError("Cannot record decision without an affected symbol.")
    if not path:
        raise ValueError("Cannot record decision without an affected file path.")

    # Check for automatic supersedes if not provided
    auto_supersedes = supersedes
    if auto_supersedes is None:
        prior_decisions = load_all_decisions(ledger_dir)
        matching = [
            d for d in prior_decisions
            if d.symbol == symbol and d.path == path
        ]
        if matching:
            # Sort by timestamp, grab most recent
            matching.sort(key=lambda d: d.timestamp, reverse=True)
            auto_supersedes = matching[0].id

    decision_id = generate_decision_id(repo, symbol, base_sha, head_sha, probe_hash)

    decision = Decision(
        id=decision_id,
        repo=repo,
        path=path,
        symbol=symbol,
        base_sha=base_sha,
        head_sha=head_sha,
        probe_hash=probe_hash,
        before_behavior=before_behavior,
        after_behavior=after_behavior,
        intent=normalized_disp,  # type: ignore
        rationale=clean_rationale,
        requirement_ref=requirement_ref,
        status=status,
        supersedes=auto_supersedes,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )

    # Persist decision JSON
    target_file = ledger_dir / f"{decision_id}.json"
    target_file.write_text(decision.model_dump_json(indent=2), encoding="utf-8")

    return decision


def load_all_decisions(directory: Union[Path, str]) -> List[Decision]:
    """Read all decision records from the ledger directory."""
    ledger_path = Path(directory)
    if not ledger_path.exists() or not ledger_path.is_dir():
        return []

    decisions: List[Decision] = []
    for file in sorted(ledger_path.glob("*.json")):
        try:
            content = file.read_text(encoding="utf-8")
            data = json.loads(content)
            decisions.append(Decision.model_validate(data))
        except Exception:
            continue
    return decisions


def load_decision_from_file(file_path: Union[Path, str]) -> Decision:
    """Load a specific decision JSON file."""
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Decision file not found: {path}")
    content = path.read_text(encoding="utf-8")
    return Decision.model_validate(json.loads(content))


def load_branch_decisions_via_git(
    repo_root: Union[Path, str],
    branch: str = "main",
) -> List[Decision]:
    """Read decisions from behavior_decisions/ on a git branch without checking it out."""
    root = Path(repo_root)
    decisions: List[Decision] = []

    try:
        # List files in behavior_decisions on branch
        cmd_ls = ["git", "ls-tree", "-r", "--name-only", branch, "behavior_decisions/"]
        res_ls = subprocess.run(
            cmd_ls, cwd=root, capture_output=True, text=True, check=True
        )
        files = [line.strip() for line in res_ls.stdout.splitlines() if line.strip().endswith(".json")]

        for rel_file in files:
            cmd_show = ["git", "show", f"{branch}:{rel_file}"]
            res_show = subprocess.run(
                cmd_show, cwd=root, capture_output=True, text=True, check=True
            )
            data = json.loads(res_show.stdout)
            decisions.append(Decision.model_validate(data))
    except Exception:
        # Fall back to local ledger files if git command is unavailable or branch does not exist yet
        pass

    return decisions


def lookup(
    symbols: List[str],
    *,
    approved_records: Optional[List[Decision]] = None,
    repo_root: Optional[Union[Path, str]] = None,
    branch: str = "main",
) -> List[DecisionMatch]:
    """Look up approved historical decisions for the given symbols.

    Returns matches indicating whether a previous decision exists,
    and whether it remains active or has been superseded/marked stale.

    Args:
        symbols: List of symbol names to search.
        approved_records: Pre-loaded list of approved Decision objects.
        repo_root: Repository root path (used to locate ledger or run git queries).
        branch: Target branch to read approved decisions from (default 'main').

    Returns:
        List of DecisionMatch records.
    """
    root_path = Path(repo_root) if repo_root else Path.cwd()

    records = approved_records
    if records is None:
        # Try loading via git from target branch first
        records = load_branch_decisions_via_git(root_path, branch)
        if not records:
            # Fall back to local directory records that are approved or present
            ledger_dir = root_path / "behavior_decisions"
            all_local = load_all_decisions(ledger_dir)
            records = [d for d in all_local if d.status == "approved"] or all_local

    # Build set of superseded IDs to detect superseded records
    superseded_ids = {d.supersedes for d in records if d.supersedes}

    matches: List[DecisionMatch] = []
    symbol_set = set(symbols)

    for record in records:
        if record.symbol in symbol_set:
            is_superseded = record.id in superseded_ids
            if is_superseded:
                matches.append(
                    DecisionMatch(
                        symbol=record.symbol,
                        decision=record,
                        match_type="superseded",
                        is_stale=True,
                        reason=f"Decision {record.id} was superseded by a later decision.",
                    )
                )
            else:
                matches.append(
                    DecisionMatch(
                        symbol=record.symbol,
                        decision=record,
                        match_type="approved" if record.status == "approved" else "stale",
                        is_stale=record.status != "approved",
                        reason=None if record.status == "approved" else "Decision is proposed but not yet approved on main.",
                    )
                )

    return matches


def approve_decision(
    decision_id: str,
    repo_root: Optional[Union[Path, str]] = None,
) -> Decision:
    """Mark a decision as approved (e.g. following PR merge)."""
    root_path = Path(repo_root) if repo_root else Path.cwd()
    file_path = root_path / "behavior_decisions" / f"{decision_id}.json"
    decision = load_decision_from_file(file_path)
    updated = decision.model_copy(update={"status": "approved"})
    file_path.write_text(updated.model_dump_json(indent=2), encoding="utf-8")
    return updated
