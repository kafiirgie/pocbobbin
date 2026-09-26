import type { EvidenceReport } from "../lib/report-types";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface LimitsPanelProps {
  report: EvidenceReport;
}

export function LimitsPanel({ report }: LimitsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono-value text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">06 / constraints</p>
            <CardTitle className="mt-1">Read the limits</CardTitle>
          </div>
          <Badge variant="warning">Honest scope</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {report.limits.map((limit, index) => (
            <li key={`${limit}-${index}`} className="flex gap-3 text-sm leading-6 text-subtle">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{limit}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
