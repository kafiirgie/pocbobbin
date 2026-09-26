import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, STATUS_META, TONE_CLASSES } from "@/components/StatusBadge";
import type { EvidenceStatus } from "@/lib/evidence";
import type { ReviewReport } from "@/lib/review-report";

interface Item {
  id: string;
  title: string;
  detail: string;
}

function items(report: ReviewReport): Record<"needs_probe" | "unknown_edge" | "inconclusive", Item[]> {
  return {
    needs_probe: report.needs_bob_action.map((ref) => ({
      id: `${ref.path}::${ref.symbol}`,
      title: `${ref.symbol} (${ref.path})`,
      detail: "No committed probe covers this caller. Run /behavior-review in Bob to add a probe.",
    })),
    unknown_edge: report.impact.unknowns.map((u, index) => ({
      id: `${u.path}:${u.line}:${index}`,
      title: `${u.expression || u.symbol} at ${u.path}:${u.line}`,
      detail: `${u.reason}. It could reach ${u.may_reach.join(", ") || "a changed symbol"}; treated as unknown, not as safe.`,
    })),
    inconclusive: report.comparisons
      .filter((c) => c.outcome === "inconclusive")
      .map((c) => ({
        id: c.probe.id,
        title: `Probe ${c.probe.id} on ${c.probe.target.symbol}`,
        detail: [c.base, c.head]
          .map((o) => `${o.revision}: ${o.status}${o.exception ? ` (${o.exception})` : ""}`)
          .join("; "),
      })),
  };
}

export function NeedsAttention({ report }: { report: ReviewReport }) {
  const groups = items(report);
  const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 className="text-lg font-semibold">Needs attention</h2></CardTitle>
        <CardDescription>
          {total ? `${total} item${total === 1 ? "" : "s"} the evidence could not settle.` : "Nothing in this run was left unresolved."}
        </CardDescription>
      </CardHeader>
      {total ? <CardContent>
        <Accordion type="multiple" defaultValue={Object.keys(groups).filter((k) => groups[k as keyof typeof groups].length)}>
          {(Object.keys(groups) as (keyof typeof groups)[]).map((status) => (
            <AccordionItem key={status} value={status}>
              <AccordionTrigger><StatusBadge status={status as EvidenceStatus} count={groups[status].length} /></AccordionTrigger>
              <AccordionContent className="space-y-2">
                {groups[status].length ? groups[status].map((item) => (
                  <Alert key={item.id} className={TONE_CLASSES[STATUS_META[status].tone]}>
                    <AlertTitle className="font-mono break-all">{item.title}</AlertTitle>
                    <AlertDescription>{item.detail}</AlertDescription>
                  </Alert>
                )) : <p className="text-sm text-muted-foreground">None in this run.</p>}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent> : null}
    </Card>
  );
}
