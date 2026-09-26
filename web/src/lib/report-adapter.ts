import type {
  ChangedSymbol,
  DecisionDisposition,
  EvidenceReport,
  ImpactNode,
  ImpactPath,
  Observation,
  OutputValue,
  ReportDecision,
  ReportLinks,
  TestEvidence,
  TestStatus,
  UnknownEdge,
} from "./report-types";

export class ReportAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportAdapterError";
  }
}

type UnknownRecord = Record<string, unknown>;

const DEFAULT_LIMITS = [
  "Impact analysis is bounded; unresolved edges remain unknown.",
  "Tested inputs are examples, not proof over every possible input.",
  "Setup failures, import errors, and timeouts are inconclusive.",
  "A human disposition does not override failed or inconclusive execution.",
];

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

// The lookbehind keeps the "s:/" inside "https://" from reading as a Windows drive letter.
const LOCAL_PATH_PATTERN = /(?:(?<![A-Za-z])[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|private|tmp|var|workspace|mnt)\/)[^\s<>\"'`]+/g;

function redactLocalPaths(value: string): string {
  return value.replace(LOCAL_PATH_PATTERN, "[local path redacted]");
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactLocalPaths(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  const record = asRecord(value);
  if (record) {
    return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, redactValue(item)]));
  }
  return value;
}

function firstArray(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? redactLocalPaths(value.trim()) : fallback;
}

function optionalString(value: unknown): string | undefined {
  const result = stringValue(value);
  return result || undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readFirst(record: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function readFirstPresent(record: UnknownRecord, ...keys: string[]): { present: boolean; value: unknown } {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return { present: true, value: record[key] };
    }
  }
  return { present: false, value: undefined };
}

function firstCollection(...values: unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) return value;
    if (value !== undefined && value !== null) return [value];
  }
  return [];
}

function makeId(prefix: string, index: number, value: unknown): string {
  const record = asRecord(value);
  const id = record && readFirst(record, "id", "key", "name");
  return `${prefix}-${stringValue(id, String(index + 1))}`;
}

interface NormalizedOutcome {
  outcome: Observation["outcome"];
  detail?: string;
}

function normalizeOutcome(value: unknown): NormalizedOutcome {
  const normalized = stringValue(value).toLowerCase();
  if (
    normalized === "same_on_tested_cases" ||
    normalized === "same" ||
    normalized === "unchanged" ||
    normalized === "no_delta"
  ) {
    return { outcome: "same_on_tested_cases" };
  }
  if (
    normalized === "delta_observed" ||
    normalized === "delta" ||
    normalized === "different" ||
    normalized === "changed"
  ) {
    return { outcome: "delta_observed" };
  }
  if (normalized === "inconclusive" || normalized === "unknown" || normalized === "error") {
    return { outcome: "inconclusive" };
  }

  if (normalized) {
    return {
      outcome: "inconclusive",
      detail: `Behavior outcome “${normalized}” is not recognized; this observation is shown as inconclusive.`,
    };
  }
  return {
    outcome: "inconclusive",
    detail: "No behavior outcome was reported; this observation is shown as inconclusive.",
  };
}

function normalizeNode(value: unknown, index: number): ImpactNode {
  if (typeof value === "string") {
    const parts = value.split("::");
    return {
      id: `node-${index + 1}`,
      path: parts.length > 1 ? stringValue(parts[0]) : undefined,
      symbol: parts.length > 1 ? parts.slice(1).join("::") : value,
      outsideDiff: false,
    };
  }

  const record = asRecord(value) ?? {};
  const role = optionalString(readFirst(record, "role", "kind", "relationship"));
  const explicitOutside = booleanValue(
    readFirst(record, "outside_diff", "outsideDiff", "caller_outside_diff", "external"),
  );
  const inDiff = booleanValue(readFirst(record, "in_diff", "inDiff"));
  const outsideDiff =
    explicitOutside ??
    (inDiff === undefined ? /outside|external|caller/i.test(role ?? "") : !inDiff);

  return {
    id: makeId("node", index, value),
    path: optionalString(readFirst(record, "path", "file", "relative_path")),
    symbol: stringValue(readFirst(record, "symbol", "name", "label"), "Unknown symbol"),
    line: numberValue(readFirst(record, "line", "line_number", "line_start")),
    outsideDiff,
    role,
  };
}

// The engine's ReviewReport path: `hops` run caller first, changed symbol last, and a
// hop is outside the diff when its file is not in `revisions.changed_files`.
function normalizeHops(record: UnknownRecord, hops: unknown[], changedFiles: Set<string>): ImpactNode[] {
  const isTest = record.is_test === true;
  return hops.map((hop, index) => {
    const node = normalizeNode(hop, index);
    const role =
      index === hops.length - 1
        ? "changed symbol"
        : index === 0
          ? isTest ? "test caller" : "caller"
          : "intermediate caller";
    return { ...node, outsideDiff: node.path !== undefined && !changedFiles.has(node.path), role };
  });
}

function normalizeImpactPaths(raw: UnknownRecord): ImpactPath[] {
  const impact = asRecord(raw.impact) ?? asRecord(raw.impact_analysis) ?? {};
  const changedFiles = new Set(
    firstArray(asRecord(raw.revisions)?.changed_files).map((file) => stringValue(file)),
  );
  const values = firstArray(
    impact.paths,
    impact.impact_paths,
    impact.impactPaths,
    raw.impact_paths,
    raw.impactPaths,
    raw.paths,
  );

  return values
    .map((value, index) => {
      if (Array.isArray(value)) {
        return {
          id: `path-${index + 1}`,
          nodes: value.map((node, nodeIndex) => normalizeNode(node, nodeIndex)),
        };
      }

      const record = asRecord(value) ?? {};
      if (Array.isArray(record.hops)) {
        return { id: makeId("path", index, value), nodes: normalizeHops(record, record.hops, changedFiles) };
      }
      const nodeValues = firstArray(
        record.nodes,
        record.path,
        record.chain,
        record.call_chain,
        record.callers,
      );
      const nodes = nodeValues.length
        ? nodeValues.map((node, nodeIndex) => normalizeNode(node, nodeIndex))
        : [normalizeNode(value, 0)];

      return {
        id: makeId("path", index, value),
        label: optionalString(readFirst(record, "label", "name")),
        nodes,
      };
    })
    .filter((path) => path.nodes.length > 0);
}

function normalizeUnknownEdges(raw: UnknownRecord): UnknownEdge[] {
  const impact = asRecord(raw.impact) ?? asRecord(raw.impact_analysis) ?? {};
  const values = firstArray(
    impact.unknowns,
    impact.unknown_edges,
    impact.unknownEdges,
    raw.unknowns,
    raw.unknown_edges,
    raw.unknownEdges,
  );

  return values.map((value, index) => {
    if (typeof value === "string") {
      return { id: `unknown-${index + 1}`, reason: value };
    }
    const record = asRecord(value) ?? {};
    return {
      id: makeId("unknown", index, value),
      from: optionalString(readFirst(record, "from", "source")),
      to: optionalString(readFirst(record, "to", "target")),
      path: optionalString(readFirst(record, "path", "file", "relative_path")),
      line: numberValue(readFirst(record, "line", "line_number")),
      reason: stringValue(
        readFirst(record, "reason", "message", "detail", "description"),
        "The report could not resolve this edge.",
      ),
    };
  });
}

function normalizeOutput(value: unknown): OutputValue {
  if (value === undefined) return {};
  const record = asRecord(value);
  if (record) {
    const exception = optionalString(
      readFirst(record, "exception", "error", "stderr_exception"),
    );
    const nestedValue = readFirstPresent(record, "value", "output", "result", "stdout");
    if (exception || nestedValue.present) {
      return {
        exception,
        value: nestedValue.present ? redactValue(nestedValue.value) : undefined,
        raw: redactValue(value),
      };
    }
  }
  return { value: redactValue(value), raw: redactValue(value) };
}

function normalizeDetails(record: UnknownRecord): string | undefined {
  const direct = optionalString(readFirst(record, "details", "detail", "message"));
  const setup = optionalString(
    readFirst(record, "setup_error", "setupError", "setup_status", "setup", "import_status", "importStatus"),
  );
  const executionStatus = optionalString(readFirst(record, "execution_status", "executionStatus"));
  const timeout = booleanValue(readFirst(record, "timeout", "timed_out", "timedOut"));
  const details = [direct, setup, executionStatus && `Execution status: ${executionStatus}`].filter(Boolean) as string[];

  if (timeout) details.push("The probe timed out before a comparable output was recorded.");
  return details.length ? details.join(" ") : undefined;
}

function combineDetails(...details: Array<string | undefined>): string | undefined {
  const values = details.filter((detail): detail is string => Boolean(detail));
  return values.length ? values.join(" ") : undefined;
}

function normalizeObservations(raw: UnknownRecord): Observation[] {
  const values = firstCollection(raw.observations, raw.comparisons, raw.results, raw.evidence);

  return values.map((value, index) => {
    const record = asRecord(value);
    if (!record) {
      return {
        id: `observation-${String(index + 1)}`,
        name: `Malformed observation ${String(index + 1).padStart(2, "0")}`,
        input: null,
        base: normalizeOutput(undefined),
        head: normalizeOutput(undefined),
        outcome: "inconclusive",
        details: "This observation entry is not an object; no execution evidence was inferred.",
        raw: redactValue(value),
      };
    }

    const baseValue = readFirstPresent(
      record,
      "base",
      "base_output",
      "baseOutput",
      "before",
      "old_output",
      "old",
      "before_revision",
    );
    const headValue = readFirstPresent(
      record,
      "head",
      "head_output",
      "headOutput",
      "after",
      "new_output",
      "new",
      "after_revision",
    );
    const normalizedOutcome = normalizeOutcome(
      readFirst(record, "outcome", "behavior_outcome", "classification", "result", "status", "label"),
    );
    // ReviewReport comparisons nest the probe's id, input and hash under `probe`.
    const probe = asRecord(record.probe) ?? {};
    return {
      id: makeId("observation", index, probe.id !== undefined ? probe : value),
      name: stringValue(
        readFirst(record, "name", "probe_name", "probeName", "id") ?? readFirst(probe, "id", "name"),
        `Probe ${String(index + 1).padStart(2, "0")}`,
      ),
      input: redactValue(
        readFirst(record, "input", "probe_input", "probeInput", "args") ?? readFirst(probe, "input") ?? null,
      ),
      probeHash: optionalString(readFirst(record, "probe_hash", "probeHash", "hash") ?? readFirst(probe, "hash")),
      base: normalizeOutput(baseValue.present ? baseValue.value : undefined),
      head: normalizeOutput(headValue.present ? headValue.value : undefined),
      outcome: normalizedOutcome.outcome,
      details: combineDetails(normalizeDetails(record), normalizedOutcome.detail),
      raw: redactValue(value),
    };
  });
}

function normalizeChangedSymbols(raw: UnknownRecord): ChangedSymbol[] {
  return firstCollection(
    raw.changed_symbols,
    raw.changedSymbols,
    raw.symbols,
    raw.changed,
    asRecord(raw.impact)?.changed_symbols,
  ).map((value, index) => {
    const record = asRecord(value) ?? {};
    const tags = firstArray(record.tags, record.change_tags, record.changeTags)
      .map((tag) => stringValue(tag))
      .filter(Boolean);
    const changeType = optionalString(readFirst(record, "change_type", "changeType", "kind"));
    if (changeType && !tags.includes(changeType)) tags.push(changeType);
    return {
      id: makeId("symbol", index, value),
      path: stringValue(readFirst(record, "path", "file", "relative_path"), "Path not provided"),
      symbol: stringValue(readFirst(record, "symbol", "name", "label"), "Symbol not provided"),
      line: numberValue(readFirst(record, "line", "line_number", "line_start", "head_line", "base_line")),
      changeType,
      tags,
    };
  });
}

function normalizeTests(raw: UnknownRecord): TestEvidence {
  const value = readFirst(raw, "tests", "existing_tests", "test_results");
  if (Array.isArray(value)) {
    const statuses = value.map((item) => {
      const record = asRecord(item);
      // A suite run with failing tests is a failure even though the runner reports it as `error`.
      if (record && (numberValue(record.failed) ?? 0) > 0) return "failed";
      return normalizeTestStatus(record?.status ?? item);
    });
    const runs = value.flatMap((item) => {
      const record = asRecord(item);
      const revision = record && optionalString(record.revision);
      if (!record || !revision) return [];
      const counts = ["passed", "failed", "errors"]
        .map((key) => `${numberValue(record[key]) ?? 0} ${key}`)
        .join(", ");
      return [`${revision}: ${stringValue(record.status, "unknown")} (${counts})`];
    });
    const perRevision = runs.length ? ` ${runs.join("; ")}.` : "";
    if (statuses.includes("failed")) {
      return { status: "failed", label: "Existing tests", details: `At least one reported test failed.${perRevision}` };
    }
    if (statuses.includes("inconclusive")) {
      return { status: "inconclusive", label: "Existing tests", details: `The test result was not conclusive.${perRevision}` };
    }
    if (statuses.length && statuses.every((status) => status === "passed")) {
      return { status: "passed", label: "Existing tests", details: `The reported test suite passed.${perRevision}` };
    }
    return { status: "unknown", label: "Existing tests" };
  }

  const record = asRecord(value);
  if (record) {
    const status = normalizeTestStatus(readFirst(record, "status", "result", "outcome"));
    return {
      status,
      label: stringValue(readFirst(record, "label", "name"), "Existing tests"),
      details: optionalString(readFirst(record, "details", "detail", "message")),
    };
  }

  const passed = booleanValue(readFirst(raw, "tests_passed", "testsPassed"));
  if (passed !== undefined) {
    return {
      status: passed ? "passed" : "failed",
      label: "Existing tests",
    };
  }
  return { status: "unknown", label: "Existing tests" };
}

function normalizeTestStatus(value: unknown): TestStatus {
  const normalized = stringValue(value).toLowerCase();
  if (["passed", "pass", "green", "ok"].includes(normalized)) return "passed";
  if (["failed", "fail", "red"].includes(normalized)) return "failed";
  if (["inconclusive", "unknown", "error"].includes(normalized)) {
    return normalized === "unknown" ? "unknown" : "inconclusive";
  }
  if (["not_run", "not run", "skipped"].includes(normalized)) return "not_run";
  return "unknown";
}

function normalizeDecisions(raw: UnknownRecord): ReportDecision[] {
  // Ledger records cited by the engine (`prior_decisions`) keep their own status, e.g. approved.
  const values = [
    ...firstCollection(raw.decisions, raw.dispositions, raw.decision),
    ...firstArray(raw.prior_decisions),
  ];
  return values.flatMap((value, index) => {
    const record = asRecord(value);
    if (!record) return [];
    const target = asRecord(record.target) ?? {};
    const dispositionValue = optionalString(
      readFirst(record, "disposition", "human_disposition", "decision", "intent"),
    )?.toLowerCase();
    const disposition = dispositionValue as DecisionDisposition | undefined;
    return [{
      id: makeId("decision", index, value),
      observationId: optionalString(readFirst(record, "observation_id", "observationId", "observation")),
      probeHash: optionalString(readFirst(record, "probe_hash", "probeHash", "hash")),
      symbol: optionalString(readFirst(record, "symbol", "qualified_symbol", "name") ?? readFirst(target, "symbol")),
      path: optionalString(readFirst(record, "path", "file", "relative_path") ?? readFirst(target, "path")),
      requirement: optionalString(readFirst(record, "requirement_ref", "requirement")),
      disposition:
        disposition === "intended" || disposition === "unintended" || disposition === "unresolved"
          ? disposition
          : undefined,
      rationale: optionalString(readFirst(record, "rationale", "reason", "explanation")),
      status: optionalString(readFirst(record, "status", "decision_status", "approval_status", "approved_status")),
      verdict: optionalString(readFirst(record, "verdict")),
    }];
  });
}

function isHttpUrl(value: string | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function normalizeLinks(raw: UnknownRecord): ReportLinks {
  const links = asRecord(raw.links) ?? {};
  const actionRun = optionalString(
    readFirst(links, "action_run", "actionRun", "github_actions", "githubActions"),
  );
  const artifact = optionalString(readFirst(links, "artifact", "artifact_url", "artifactUrl"));
  return {
    actionRun: isHttpUrl(actionRun) ? actionRun : undefined,
    artifact: isHttpUrl(artifact) ? artifact : undefined,
  };
}

function normalizeLimits(raw: UnknownRecord): string[] {
  const values = firstCollection(raw.limits, raw.limitations, asRecord(raw.impact)?.limits);
  const limits = values
    .map((value) => {
      if (typeof value === "string") return value.trim();
      const record = asRecord(value);
      return record ? stringValue(readFirst(record, "text", "message", "description")) : "";
    })
    .filter(Boolean);
  return limits.length ? limits : DEFAULT_LIMITS;
}

const REPORT_SHAPE_KEYS = [
  "schema_version",
  "schemaVersion",
  "run",
  "repo",
  "repository",
  "base",
  "head",
  "base_sha",
  "baseSha",
  "head_sha",
  "headSha",
  "generated_at",
  "generatedAt",
  "timestamp",
  "changed_symbols",
  "changedSymbols",
  "changed",
  "symbols",
  "impact",
  "impact_analysis",
  "impact_paths",
  "impactPaths",
  "paths",
  "unknowns",
  "unknown_edges",
  "unknownEdges",
  "observations",
  "comparisons",
  "results",
  "evidence",
  "decisions",
  "decision",
  "dispositions",
  "tests",
  "existing_tests",
  "test_results",
  "limits",
  "limitations",
  "links",
  "link",
];

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function validateReportShape(raw: UnknownRecord): void {
  if (!REPORT_SHAPE_KEYS.some((key) => hasOwn(raw, key))) {
    throw new ReportAdapterError(
      "The report payload does not have a recognizable evidence-report shape. No evidence is shown.",
    );
  }

  if (hasOwn(raw, "fixture") && typeof raw.fixture !== "boolean") {
    throw new ReportAdapterError(
      "The report fixture marker is malformed. Provenance is unknown, so no evidence is shown.",
    );
  }
  for (const key of ["schema_version", "schemaVersion"]) {
    if (hasOwn(raw, key) && raw[key] !== null && typeof raw[key] !== "string") {
      throw new ReportAdapterError(`The report field “${key}” must be a string.`);
    }
  }

  for (const key of ["run", "impact", "impact_analysis", "links"]) {
    if (hasOwn(raw, key) && raw[key] !== null && asRecord(raw[key]) === null) {
      throw new ReportAdapterError(`The report field “${key}” must be an object.`);
    }
  }

  const arrayFields = [
    "changed_symbols",
    "changedSymbols",
    "symbols",
    "observations",
    "results",
    "evidence",
    "decisions",
    "dispositions",
    "limits",
    "paths",
    "impact_paths",
    "impactPaths",
    "unknowns",
    "unknown_edges",
    "unknownEdges",
  ];
  for (const key of arrayFields) {
    if (hasOwn(raw, key) && raw[key] !== null && !Array.isArray(raw[key])) {
      throw new ReportAdapterError(`The report field “${key}” must be an array.`);
    }
  }

  const impact = asRecord(raw.impact) ?? asRecord(raw.impact_analysis);
  if (impact) {
    for (const key of ["paths", "impact_paths", "impactPaths", "unknowns", "unknown_edges", "unknownEdges"]) {
      if (hasOwn(impact, key) && impact[key] !== null && !Array.isArray(impact[key])) {
        throw new ReportAdapterError(`The impact field “${key}” must be an array.`);
      }
    }
  }
}

export function normalizeReport(input: unknown): EvidenceReport {
  const raw = asRecord(input);
  if (!raw) {
    throw new ReportAdapterError("The report payload is not a JSON object. No evidence is shown.");
  }
  validateReportShape(raw);

  const run = asRecord(raw.run) ?? {};
  const revisions = asRecord(raw.revisions) ?? {};
  const runValue = (...keys: string[]): unknown =>
    readFirst(run, ...keys) ?? readFirst(revisions, ...keys) ?? readFirst(raw, ...keys);
  return {
    schemaVersion: stringValue(readFirst(raw, "schema_version", "schemaVersion"), "unknown"),
    fixture: raw.fixture === true,
    run: {
      repo: stringValue(runValue("repo", "repository"), "Repository not provided"),
      baseSha: stringValue(runValue("base_sha", "baseSha", "base_commit", "base"), "Base not provided"),
      headSha: stringValue(runValue("head_sha", "headSha", "head_commit", "head"), "Head not provided"),
      generatedAt: stringValue(runValue("generated_at", "generatedAt", "created_at", "timestamp"), "Not provided"),
      // An engine ReviewReport only exists once the run finished, so it carries no status field.
      status: stringValue(runValue("status", "run_status"), raw.revisions ? "complete" : "unknown"),
    },
    changedSymbols: normalizeChangedSymbols(raw),
    impactPaths: normalizeImpactPaths(raw),
    unknownEdges: normalizeUnknownEdges(raw),
    observations: normalizeObservations(raw),
    decisions: normalizeDecisions(raw),
    tests: normalizeTests(raw),
    limits: normalizeLimits(raw),
    links: normalizeLinks(raw),
  };
}

export async function fetchReport(
  url = "/data/report.json",
  signal?: AbortSignal,
): Promise<EvidenceReport> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ReportAdapterError("The report could not be loaded. Check the connection and retry.");
  }

  if (!response.ok) {
    throw new ReportAdapterError(`The report request failed with HTTP ${response.status}.`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ReportAdapterError("The report file is not valid JSON.");
  }

  return normalizeReport(payload);
}

export function isEmptyReport(report: EvidenceReport): boolean {
  return (
    report.changedSymbols.length === 0 &&
    report.impactPaths.length === 0 &&
    report.unknownEdges.length === 0 &&
    report.observations.length === 0
  );
}

export function isSafeExternalUrl(value: string | undefined): value is string {
  return isHttpUrl(value);
}
