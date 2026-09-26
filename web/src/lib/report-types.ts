export type Outcome =
  | "same_on_tested_cases"
  | "delta_observed"
  | "inconclusive";

export type DecisionDisposition = "unintended" | "intended" | "unresolved";

export type TestStatus =
  | "passed"
  | "failed"
  | "inconclusive"
  | "not_run"
  | "unknown";

export interface ReportRun {
  repo: string;
  baseSha: string;
  headSha: string;
  generatedAt: string;
  status: string;
}

export interface ChangedSymbol {
  id: string;
  path: string;
  symbol: string;
  line?: number;
  changeType?: string;
  tags: string[];
}

export interface ImpactNode {
  id: string;
  path?: string;
  symbol: string;
  line?: number;
  outsideDiff: boolean;
  role?: string;
}

export interface ImpactPath {
  id: string;
  label?: string;
  nodes: ImpactNode[];
}

export interface UnknownEdge {
  id: string;
  from?: string;
  to?: string;
  path?: string;
  line?: number;
  reason: string;
}

export interface OutputValue {
  value?: unknown;
  exception?: string;
  raw?: unknown;
}

export interface Observation {
  id: string;
  name: string;
  input: unknown;
  probeHash?: string;
  base: OutputValue;
  head: OutputValue;
  outcome: Outcome;
  details?: string;
  raw?: unknown;
}

export interface TestEvidence {
  status: TestStatus;
  label: string;
  details?: string;
}

export interface ReportDecision {
  id: string;
  observationId?: string;
  probeHash?: string;
  symbol?: string;
  path?: string;
  requirement?: string;
  disposition?: DecisionDisposition;
  rationale?: string;
  status?: string;
  verdict?: string;
}

export interface ReportLinks {
  actionRun?: string;
  artifact?: string;
}

export interface EvidenceReport {
  schemaVersion: string;
  fixture: boolean;
  run: ReportRun;
  changedSymbols: ChangedSymbol[];
  impactPaths: ImpactPath[];
  unknownEdges: UnknownEdge[];
  observations: Observation[];
  decisions: ReportDecision[];
  tests: TestEvidence;
  limits: string[];
  links: ReportLinks;
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  same_on_tested_cases: "Same on tested cases",
  delta_observed: "Delta observed",
  inconclusive: "Inconclusive",
};

export const DECISION_LABELS: Record<DecisionDisposition, string> = {
  unintended: "Unintended",
  intended: "Intended",
  unresolved: "Unresolved",
};
