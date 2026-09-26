import type { EvidenceReport, ImpactNode } from "../lib/report-types";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { SectionHeading } from "./SectionHeading";

interface ImpactPathProps {
  report: EvidenceReport;
}

function NodeLabel({ node }: { node: ImpactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <code className="mono-value break-all text-sm font-semibold text-ink">{node.symbol}</code>
        {node.outsideDiff ? <Badge variant="accent">Outside diff</Badge> : <Badge>Changed</Badge>}
      </div>
      <p className="mt-1 break-all text-xs text-subtle">
        {node.path ?? "Path not provided"}
        {node.line !== undefined ? `:${node.line}` : ""}
      </p>
      {node.role ? <p className="mt-1 text-xs text-faint">{node.role}</p> : null}
    </div>
  );
}

function ImpactNodeView({ node, isLast }: { node: ImpactNode; isLast: boolean }) {
  return (
    <li className="relative flex gap-3">
      <div className="flex w-5 shrink-0 flex-col items-center" aria-hidden="true">
        <span className={node.outsideDiff ? "mt-1.5 size-2.5 rounded-full border-2 border-accent bg-accent" : "mt-1.5 size-2.5 rounded-full border-2 border-accent bg-surface"} />
        {!isLast ? <span className="mt-1 h-full min-h-7 w-px bg-rule" /> : null}
      </div>
      <NodeLabel node={node} />
    </li>
  );
}

export function ImpactPath({ report }: ImpactPathProps) {
  return (
    <section aria-labelledby="impact-heading">
      <SectionHeading
        index="02 / graph"
        title="Impact path"
        headingId="impact-heading"
        description="A bounded caller path makes the changed surface readable. Nodes outside the diff are called out rather than hidden."
      />
      <Card>
        <CardContent className="space-y-6">
          {report.impactPaths.length ? (
            report.impactPaths.map((path, pathIndex) => (
              <div key={path.id} className={pathIndex ? "border-t border-rule pt-6" : ""}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="mono-value text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">
                    {path.label ?? `Path ${String(pathIndex + 1).padStart(2, "0")}`}
                  </p>
                  <span className="text-xs text-subtle">{path.nodes.length} node{path.nodes.length === 1 ? "" : "s"}</span>
                </div>
                <ol aria-label={path.label ?? `Impact path ${pathIndex + 1}`} className="space-y-2">
                  {path.nodes.map((node, nodeIndex) => (
                    <ImpactNodeView key={node.id} node={node} isLast={nodeIndex === path.nodes.length - 1} />
                  ))}
                </ol>
              </div>
            ))
          ) : (
            <div className="border border-dashed border-rule px-4 py-6 text-sm text-subtle">
              No resolved impact path was included in this report.
            </div>
          )}

          <div className="border-t border-rule pt-5" aria-labelledby="unknown-edges-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="unknown-edges-heading" className="text-sm font-semibold text-ink">Unknown edges</h3>
              <span className="mono-value text-xs text-warning">{report.unknownEdges.length} reported</span>
            </div>
            {report.unknownEdges.length ? (
              <ul className="mt-3 space-y-3">
                {report.unknownEdges.map((edge) => (
                  <li key={edge.id} className="border-l-2 border-warning bg-warning-soft px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {edge.from ? <code className="mono-value break-all text-xs text-ink">{edge.from}</code> : null}
                      {edge.from && edge.to ? <span aria-hidden="true" className="text-warning">→</span> : null}
                      {edge.to ? <code className="mono-value break-all text-xs text-ink">{edge.to}</code> : null}
                    </div>
                    <p className="mt-1 leading-6 text-subtle">{edge.reason}</p>
                    {edge.path ? (
                      <p className="mt-1 text-xs text-faint">
                        {edge.path}{edge.line !== undefined ? `:${edge.line}` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-6 text-subtle">No unresolved edge was included in this report. That is not a proof that none exist.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
