import type { EvidenceReport } from "../lib/report-types";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { SectionHeading } from "./SectionHeading";

interface EvidenceSummaryProps {
  report: EvidenceReport;
}

function testLabel(report: EvidenceReport): string {
  switch (report.tests.status) {
    case "passed":
      return "Passed";
    case "failed":
      return "Failed";
    case "inconclusive":
      return "Inconclusive";
    case "not_run":
      return "Not run";
    default:
      return "Not reported";
  }
}

export function EvidenceSummary({ report }: EvidenceSummaryProps) {
  const deltaCount = report.observations.filter((observation) => observation.outcome === "delta_observed").length;
  const sameCount = report.observations.filter((observation) => observation.outcome === "same_on_tested_cases").length;
  const inconclusiveCount = report.observations.filter((observation) => observation.outcome === "inconclusive").length;
  const callerCount = new Set(
    report.impactPaths
      .flatMap((path) => path.nodes)
      .filter((node) => node.outsideDiff)
      .map((node) => `${node.path ?? ""}:${node.symbol}:${node.line ?? ""}`),
  ).size;

  const behaviorLabel = deltaCount
    ? `${deltaCount} behavior ${deltaCount === 1 ? "difference" : "differences"} observed`
    : sameCount && !inconclusiveCount
      ? `No delta on ${sameCount} tested ${sameCount === 1 ? "case" : "cases"}`
      : inconclusiveCount
        ? `${inconclusiveCount} observation${inconclusiveCount === 1 ? "" : "s"} inconclusive`
        : "No behavior observation reported";

  return (
    <section aria-labelledby="summary-heading">
      <SectionHeading
        index="00 / signal"
        title="Evidence summary"
        headingId="summary-heading"
        description="A quick read of what this report actually contains. Green tests add context; they do not prove safety."
        action={
          <Badge variant={deltaCount ? "danger" : inconclusiveCount ? "warning" : "neutral"}>
            {deltaCount ? "Human review needed" : inconclusiveCount ? "Evidence incomplete" : "No delta reported"}
          </Badge>
        }
      />
      <Card>
        <CardContent className="p-0">
          <div className="grid divide-y divide-rule sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            <div className="px-5 py-5 sm:px-6">
              <p className="mono-value text-2xl font-semibold tracking-[-0.04em] text-ink">{deltaCount || sameCount || "—"}</p>
              <p className="mt-2 text-sm font-medium text-ink">{behaviorLabel}</p>
              <p className="mt-1 text-xs leading-5 text-subtle">Based on paired probe observations.</p>
            </div>
            <div className="px-5 py-5 sm:px-6">
              <p className="mono-value text-2xl font-semibold tracking-[-0.04em] text-ink">{callerCount || "—"}</p>
              <p className="mt-2 text-sm font-medium text-ink">Caller{callerCount === 1 ? "" : "s"} outside diff</p>
              <p className="mt-1 text-xs leading-5 text-subtle">Resolved by the bounded impact graph.</p>
            </div>
            <div className="px-5 py-5 sm:px-6">
              <p className="mono-value text-2xl font-semibold tracking-[-0.04em] text-ink">{testLabel(report)}</p>
              <p className="mt-2 text-sm font-medium text-ink">{report.tests.label}</p>
              <p className="mt-1 text-xs leading-5 text-subtle">Passing is not the same as safe.</p>
            </div>
            <div className="px-5 py-5 sm:px-6">
              <p className="mono-value text-2xl font-semibold tracking-[-0.04em] text-ink">{report.unknownEdges.length || "—"}</p>
              <p className="mt-2 text-sm font-medium text-ink">Unknown edge{report.unknownEdges.length === 1 ? "" : "s"}</p>
              <p className="mt-1 text-xs leading-5 text-subtle">Unknown is not a safe edge.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
