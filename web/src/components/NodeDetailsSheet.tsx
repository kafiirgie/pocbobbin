import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge, STATUS_META, TONE_CLASSES } from "@/components/StatusBadge";
import { formatValue, OUTCOME_STATUS, type EvidenceNode } from "@/lib/evidence";

interface NodeDetailsSheetProps {
  node: EvidenceNode | undefined;
  onOpenChange: (open: boolean) => void;
}

function Observed({ label, output, exception }: { label: string; output: unknown; exception: string | null }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <pre className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-sm whitespace-pre-wrap break-all">
        {exception ?? formatValue(output)}
      </pre>
    </div>
  );
}

export function NodeDetailsSheet({ node, onOpenChange }: NodeDetailsSheetProps) {
  return (
    <Sheet open={!!node} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        {node ? (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono break-all">{node.ref.symbol}</SheetTitle>
              <SheetDescription className="break-all">
                {node.ref.path}{node.line ? `:${node.line}` : ""}{node.isTest ? " · test code" : ""}
              </SheetDescription>
              <div className="flex flex-wrap gap-2">
                {node.statuses.map((status) => <StatusBadge key={status} status={status} />)}
              </div>
            </SheetHeader>
            <ScrollArea className="min-h-0 flex-1 px-4">
              <section aria-label="Probe results" className="space-y-4 pb-4">
                <h3 className="font-medium">Probe results</h3>
                {node.comparisons.length ? node.comparisons.map((comparison) => (
                  <div key={comparison.probe.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <code className="text-sm font-semibold">{comparison.probe.id}</code>
                      <StatusBadge status={OUTCOME_STATUS[comparison.outcome]} />
                    </div>
                    <Observed label="Input" output={comparison.probe.input} exception={null} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Observed label="Base (old) output" output={comparison.base.output} exception={comparison.base.exception} />
                      <Observed label="Head (new) output" output={comparison.head.output} exception={comparison.head.exception} />
                    </div>
                    <p className="text-xs text-muted-foreground">Probe hash <code>{comparison.probe.hash}</code></p>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">
                    {node.statuses.includes("needs_probe")
                      ? `${STATUS_META.needs_probe.label}: run /behavior-review in Bob to add one for this caller.`
                      : "No probe targets this symbol in this run."}
                  </p>
                )}
              </section>
              <Separator />
              <section aria-label="Decisions" className="space-y-3 py-4">
                <h3 className="font-medium">Decisions</h3>
                {node.decisions.length ? node.decisions.map((decision) => (
                  <div key={decision.id} className="space-y-1 rounded-md border p-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className={TONE_CLASSES.info}>{decision.intent}</Badge>
                      <Badge variant="outline" className={TONE_CLASSES[decision.status === "approved" ? "success" : "neutral"]}>{decision.status}</Badge>
                    </div>
                    {decision.rationale ? <p className="text-sm">{decision.rationale}</p> : null}
                    <p className="text-xs text-muted-foreground">Decision <code>{decision.id}</code></p>
                  </div>
                )) : <p className="text-sm text-muted-foreground">No recorded decision for this symbol.</p>}
              </section>
            </ScrollArea>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
