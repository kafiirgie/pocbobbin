import type { EvidenceReport, Observation, Outcome, OutputValue } from "../lib/report-types";
import { OUTCOME_LABELS } from "../lib/report-types";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { SectionHeading } from "./SectionHeading";

interface BehaviorComparisonProps {
  report: EvidenceReport;
}

function outcomeVariant(outcome: Outcome): "neutral" | "success" | "warning" | "danger" {
  if (outcome === "delta_observed") return "danger";
  if (outcome === "inconclusive") return "warning";
  return "success";
}

function formatValue(value: unknown): string {
  if (value === undefined) return "Not reported";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function outputText(output: OutputValue): string {
  if (output.exception) return `Exception\n${output.exception}`;
  if (output.value === undefined) return "Not reported";
  return formatValue(output.value);
}

function OutputPane({ label, sha, output }: { label: string; sha: string; output: OutputValue }) {
  const isException = Boolean(output.exception);
  return (
    <div className="min-w-0 border border-rule bg-surface-muted">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{label} output</span>
        <code className="mono-value max-w-full truncate text-[10px] text-subtle" title={sha}>{sha}</code>
      </div>
      <pre className={`min-h-20 whitespace-pre-wrap break-words px-3 py-3 font-mono text-xs leading-6 ${isException ? "text-danger" : "text-ink"}`}>
        {outputText(output)}
      </pre>
    </div>
  );
}

function ObservationCard({ observation, report }: { observation: Observation; report: EvidenceReport }) {
  return (
    <article className="border border-rule bg-surface">
      <div className="flex flex-col gap-3 border-b border-rule px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="mono-value text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{observation.id}</p>
          <h3 className="mt-1 break-words text-base font-semibold tracking-[-0.01em] text-ink">{observation.name}</h3>
        </div>
        <Badge variant={outcomeVariant(observation.outcome)}>{OUTCOME_LABELS[observation.outcome]}</Badge>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">Probe input</h4>
            <code className="mono-value max-w-[55%] truncate text-[10px] text-subtle" title={observation.probeHash ?? "Probe hash not reported"}>
              {observation.probeHash ?? "hash not reported"}
            </code>
          </div>
          <pre className="mt-2 min-h-20 whitespace-pre-wrap break-words border border-rule bg-surface-muted px-3 py-3 font-mono text-xs leading-6 text-ink">
            {formatValue(observation.input)}
          </pre>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <OutputPane label="Base" sha={report.run.baseSha} output={observation.base} />
          <OutputPane label="Head" sha={report.run.headSha} output={observation.head} />
        </div>
      </div>

      {observation.details ? (
        <div className="border-t border-rule px-4 py-3 text-sm leading-6 text-subtle sm:px-5">
          <span className="font-medium text-ink">Execution note: </span>{observation.details}
        </div>
      ) : null}

      <details className="group border-t border-rule">
        <summary className="focus-ring flex list-none items-center justify-between gap-3 px-4 py-3 text-xs font-medium text-subtle hover:text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
          <span>Raw observation</span>
          <span aria-hidden="true" className="text-base leading-none transition-transform group-open:rotate-45">+</span>
        </summary>
        <pre className="overflow-x-auto border-t border-rule bg-surface-inset px-4 py-4 font-mono text-[11px] leading-5 text-subtle sm:px-5">
          {formatValue(observation.raw ?? observation)}
        </pre>
      </details>
    </article>
  );
}

export function BehaviorComparison({ report }: BehaviorComparisonProps) {
  const inconclusiveCount = report.observations.filter((observation) => observation.outcome === "inconclusive").length;
  return (
    <section aria-labelledby="comparison-heading">
      <SectionHeading
        index="03 / execution"
        title="Behavior comparison"
        headingId="comparison-heading"
        description="The same probe input is shown against base and head. A delta needs a human disposition; an inconclusive run is neither safe nor a bug verdict."
        action={
          <span className="text-xs text-subtle">
            {report.observations.length} observation{report.observations.length === 1 ? "" : "s"}
          </span>
        }
      />
      {inconclusiveCount ? (
        <div className="mb-4 border-l-2 border-warning bg-warning-soft px-3 py-2.5 text-sm leading-6 text-ink">
          {inconclusiveCount} observation{inconclusiveCount === 1 ? " is" : "s are"} inconclusive. Setup failures, import errors, and timeouts are not evidence of safety or regression.
        </div>
      ) : null}
      <Card>
        <CardContent className="space-y-4">
          {report.observations.length ? (
            report.observations.map((observation) => (
              <ObservationCard key={observation.id} observation={observation} report={report} />
            ))
          ) : (
            <p className="border border-dashed border-rule px-4 py-6 text-sm leading-6 text-subtle">
              No paired behavior observations were included in this report.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
