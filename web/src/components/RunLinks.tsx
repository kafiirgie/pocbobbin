import type { EvidenceReport } from "../lib/report-types";
import { isSafeExternalUrl } from "../lib/report-adapter";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface RunLinksProps {
  report: EvidenceReport;
}

export function RunLinks({ report }: RunLinksProps) {
  const hasAction = isSafeExternalUrl(report.links.actionRun);
  const hasArtifact = isSafeExternalUrl(report.links.artifact);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono-value text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">05 / provenance</p>
            <CardTitle className="mt-1">Run references</CardTitle>
          </div>
          <Badge variant={hasAction || hasArtifact ? "accent" : "neutral"}>{hasAction || hasArtifact ? "Linked" : "Not linked"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {hasAction ? (
          <a className="focus-ring flex items-center justify-between gap-3 rounded-[2px] border border-rule bg-surface-muted px-3 py-2.5 text-sm font-medium text-accent hover:border-accent" href={report.links.actionRun} target="_blank" rel="noreferrer">
            <span>GitHub Action run</span><span aria-hidden="true">↗</span>
          </a>
        ) : (
          <div className="flex items-center justify-between gap-3 border border-dashed border-rule px-3 py-2.5 text-sm text-faint">
            <span>No Action URL in report</span><span aria-hidden="true">—</span>
          </div>
        )}
        {hasArtifact ? (
          <a className="focus-ring flex items-center justify-between gap-3 rounded-[2px] border border-rule bg-surface-muted px-3 py-2.5 text-sm font-medium text-accent hover:border-accent" href={report.links.artifact} target="_blank" rel="noreferrer">
            <span>Evidence artifact</span><span aria-hidden="true">↗</span>
          </a>
        ) : (
          <div className="flex items-center justify-between gap-3 border border-dashed border-rule px-3 py-2.5 text-sm text-faint">
            <span>No artifact URL in report</span><span aria-hidden="true">—</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
