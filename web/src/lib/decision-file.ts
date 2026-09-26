import type { Comparison, Decision, Intent, Observation, ReviewReport } from "@/lib/review-report";

// Builds the same ledger record as app/decisions.py `validate_and_save`, so a downloaded file
// can be committed to behavior_decisions/ unchanged and read back by `lookup`.

/** validate_and_save rejects an "intended" decision with a shorter rationale. */
export const MIN_RATIONALE = 10;

async function decisionId(parts: string[]): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("Building the decision id needs a secure page (https or localhost).");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.map((part) => part.trim()).join(":")));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 12);
}

const observed = (observation: Observation) => observation.exception ?? observation.output;

export async function buildDecision(report: ReviewReport, comparison: Comparison, intent: Intent, rationale: string): Promise<Decision> {
  const { repo, revisions: { base_sha, head_sha } } = report;
  const { path, symbol } = comparison.probe.target;
  // Like validate_and_save: the last ledger record for this symbol, in ledger (id) order, is superseded.
  const earlier = report.prior_decisions.filter((d) => d.target.path === path && d.target.symbol === symbol);
  return {
    id: await decisionId([repo, symbol, base_sha, head_sha, comparison.probe.hash]),
    repo,
    target: { path, symbol },
    base_sha,
    head_sha,
    probe_hash: comparison.probe.hash,
    before: observed(comparison.base),
    after: observed(comparison.head),
    intent,
    rationale: rationale.trim() || null,
    requirement_ref: null,
    // Approval comes only from merging the file to main, never from this page.
    status: "proposed",
    supersedes: earlier.length ? earlier[earlier.length - 1].id : null,
  };
}

export function downloadDecision(decision: Decision) {
  const blob = new Blob([`${JSON.stringify(decision, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${decision.id}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}
