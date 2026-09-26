import type { EvidenceReport } from "../lib/report-types";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { SectionHeading } from "./SectionHeading";

interface ChangedSymbolsProps {
  report: EvidenceReport;
}

export function ChangedSymbols({ report }: ChangedSymbolsProps) {
  return (
    <section aria-labelledby="changed-symbols-heading">
      <SectionHeading
        index="01 / scope"
        title="Changed surface"
        headingId="changed-symbols-heading"
        description="Symbols reported as changed between the base and head revisions. The UI does not infer why a symbol changed."
        action={<span className="text-xs text-subtle">{report.changedSymbols.length} symbol{report.changedSymbols.length === 1 ? "" : "s"}</span>}
      />
      <Card>
        <CardContent className="p-0">
          {report.changedSymbols.length ? (
            <ul className="divide-y divide-rule">
              {report.changedSymbols.map((symbol) => (
                <li key={symbol.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-6">
                  <div className="min-w-0">
                    <code className="mono-value break-all text-sm font-semibold text-ink">{symbol.symbol}</code>
                    <p className="mt-1 break-all text-xs text-subtle">
                      {symbol.path}{symbol.line !== undefined ? `:${symbol.line}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {symbol.tags.length ? symbol.tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <Badge>Changed</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm leading-6 text-subtle sm:px-6">No changed symbols were included in this report.</p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
