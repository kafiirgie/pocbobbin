import { symbolKey, type Comparison, type Decision, type ReviewReport, type SymbolRef } from "@/lib/review-report";

// Evidence states, strongest first (FINAL_PLAN §16.2). A node shows the strongest as its status
// and the rest as badges. Nothing here is inferred beyond what the report states.
export const STATUS_PRIORITY = [
  "behavior_differs",
  "inconclusive",
  "needs_probe",
  "pre_existing_failure",
  "same",
  "changed",
  "outside_diff",
] as const;

export type EvidenceStatus = (typeof STATUS_PRIORITY)[number] | "unknown_edge";

export const OUTCOME_STATUS: Record<Comparison["outcome"], EvidenceStatus> = {
  delta_observed: "behavior_differs",
  inconclusive: "inconclusive",
  pre_existing_failure: "pre_existing_failure",
  same_on_tested_cases: "same",
};

export interface VerdictCounts {
  behavior_differs: number;
  same: number;
  inconclusive: number;
  needs_probe: number;
  unknown_edge: number;
}

export function verdictCounts(report: ReviewReport): VerdictCounts {
  const count = (outcome: Comparison["outcome"]) => report.comparisons.filter((c) => c.outcome === outcome).length;
  return {
    behavior_differs: count("delta_observed"),
    same: count("same_on_tested_cases"),
    inconclusive: count("inconclusive"),
    needs_probe: report.needs_bob_action.length,
    unknown_edge: report.impact.unknowns.length,
  };
}

export interface CallSite {
  caller: SymbolRef;
  callee: SymbolRef;
  /** Line of the call in the caller's file. */
  line: number;
}

export interface EvidenceNode {
  key: string;
  ref: SymbolRef;
  line: number | null;
  status: EvidenceStatus;
  statuses: EvidenceStatus[];
  isTest: boolean;
  comparisons: Comparison[];
  decisions: Decision[];
  calledBy: CallSite[];
  calls: CallSite[];
}

function strongest(statuses: EvidenceStatus[]): EvidenceStatus {
  return STATUS_PRIORITY.find((status) => statuses.includes(status)) ?? "outside_diff";
}

/** Every symbol on an impact path, plus changed symbols and symbols holding unknown references. */
export function evidenceNodes(report: ReviewReport): Map<string, EvidenceNode> {
  const nodes = new Map<string, EvidenceNode>();
  const touch = (ref: SymbolRef, line: number | null) => {
    const key = symbolKey(ref);
    const node = nodes.get(key);
    if (node) {
      node.line ??= line;
      return node;
    }
    const created: EvidenceNode = {
      key, ref: { path: ref.path, symbol: ref.symbol }, line, status: "outside_diff", statuses: [],
      isTest: false, comparisons: [], decisions: [], calledBy: [], calls: [],
    };
    nodes.set(key, created);
    return created;
  };

  report.impact.changed_symbols.forEach((c) => touch(c, c.head_line ?? c.base_line));
  report.impact.paths.forEach((path) =>
    path.hops.forEach((hop, index) => {
      const node = touch(hop, hop.line);
      if (index === 0 && path.is_test) node.isTest = true;
    }),
  );
  report.impact.unknowns.forEach((u) => touch({ path: u.path, symbol: u.symbol }, u.line));

  const changed = new Set(report.impact.changed_symbols.map(symbolKey));
  const changedFiles = new Set(report.revisions.changed_files);
  const needsProbe = new Set(report.needs_bob_action.map(symbolKey));
  for (const edge of report.impact.edges) {
    const site: CallSite = { caller: edge.caller, callee: edge.callee, line: edge.line };
    nodes.get(symbolKey(edge.caller))?.calls.push(site);
    nodes.get(symbolKey(edge.callee))?.calledBy.push(site);
  }
  for (const node of nodes.values()) {
    node.comparisons = report.comparisons.filter((c) => symbolKey(c.probe.target) === node.key);
    node.decisions = [...report.decisions, ...report.prior_decisions].filter((d) => symbolKey(d.target) === node.key);
    const statuses: EvidenceStatus[] = node.comparisons.map((c) => OUTCOME_STATUS[c.outcome]);
    if (needsProbe.has(node.key)) statuses.push("needs_probe");
    if (changed.has(node.key)) statuses.push("changed");
    if (!changedFiles.has(node.ref.path)) statuses.push("outside_diff");
    node.statuses = STATUS_PRIORITY.filter((status) => statuses.includes(status));
    node.status = strongest(node.statuses);
  }
  return nodes;
}

/** The report's own limit sentence for a language below "full" tier, if any. */
export function tierLimit(report: ReviewReport, language: string): string | undefined {
  return report.limits.find((limit) => limit.includes(`'${language}'`) && limit.includes("supported at tier"));
}

export function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
