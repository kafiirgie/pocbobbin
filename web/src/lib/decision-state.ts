import type { DecisionDisposition } from "./report-types";

export interface SessionDecision {
  disposition: DecisionDisposition;
  rationale: string;
}

export function canSubmitDecision(
  disposition: DecisionDisposition | null,
  rationale: string,
): boolean {
  if (!disposition) return false;
  return disposition !== "intended" || rationale.trim().length > 0;
}

export function decisionNeedsRationale(
  disposition: DecisionDisposition | null,
): boolean {
  return disposition === "intended";
}
