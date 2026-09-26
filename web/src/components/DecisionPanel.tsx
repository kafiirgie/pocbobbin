import { useState } from "react";
import { Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TONE_CLASSES } from "@/components/StatusBadge";
import { formatValue } from "@/lib/evidence";
import type { Comparison, Decision, Intent, ReviewReport } from "@/lib/review-report";

const INTENTS: { value: Intent; label: string; hint: string }[] = [
  { value: "unintended", label: "Unintended", hint: "A regression: fix the code, then rerun the same probe." },
  { value: "intended", label: "Intended", hint: "A deliberate change: explain why in the rationale." },
  { value: "unresolved", label: "Unresolved", hint: "Not sure yet: it stays open for review." },
];

function DeltaDecision({ comparison }: { comparison: Comparison }) {
  const [intent, setIntent] = useState<Intent | "">("");
  const [rationale, setRationale] = useState("");
  const [recorded, setRecorded] = useState<Intent | null>(null);
  const id = comparison.probe.id;
  const needsRationale = intent === "intended" && !rationale.trim();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (intent && !needsRationale) setRecorded(intent);
      }}
    >
      <p className="text-sm">
        <code className="font-semibold">{comparison.probe.target.symbol}</code> via probe <code>{id}</code>:{" "}
        <code>{formatValue(comparison.base.output)}</code> → <code>{formatValue(comparison.head.output)}</code>
      </p>
      <RadioGroup
        value={intent}
        onValueChange={(value) => { setIntent(value as Intent); setRecorded(null); }}
        aria-label={`Disposition for probe ${id}`}
      >
        {INTENTS.map((option) => (
          <div key={option.value} className="flex items-start gap-3">
            <RadioGroupItem value={option.value} id={`${id}-${option.value}`} className="mt-0.5" />
            <Label htmlFor={`${id}-${option.value}`} className="flex-col items-start gap-0.5">
              <span>{option.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      <div className="space-y-1">
        <Label htmlFor={`${id}-rationale`}>Rationale {intent === "intended" ? "(required)" : "(optional)"}</Label>
        <Textarea
          id={`${id}-rationale`}
          value={rationale}
          onChange={(event) => { setRationale(event.target.value); setRecorded(null); }}
          aria-invalid={needsRationale}
          placeholder="Why is this behavior change correct?"
        />
      </div>
      <Button type="submit" disabled={!intent || needsRationale}>Record for this session</Button>
      {recorded ? (
        <p role="status" className="text-sm text-muted-foreground">
          Recorded “{recorded}” in this browser session only. Nothing was saved or approved.
        </p>
      ) : null}
    </form>
  );
}

function PriorDecision({ decision }: { decision: Decision }) {
  return (
    <li className="space-y-1 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-sm font-semibold">{decision.target.symbol}</code>
        <Badge variant="outline" className={TONE_CLASSES.info}>{decision.intent}</Badge>
        <Badge variant="outline" className={TONE_CLASSES[decision.status === "approved" ? "success" : "neutral"]}>{decision.status}</Badge>
      </div>
      {decision.rationale ? <p className="max-w-prose text-sm">{decision.rationale}</p> : null}
      <p className="text-xs break-all text-muted-foreground">
        {decision.target.path} · decision <code>{decision.id}</code>{decision.requirement_ref ? ` · ${decision.requirement_ref}` : ""}
      </p>
    </li>
  );
}

export function DecisionPanel({ report }: { report: ReviewReport }) {
  const deltas = report.comparisons.filter((c) => c.outcome === "delta_observed");
  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 className="text-lg font-semibold">Decision</h2></CardTitle>
        <CardDescription>Every behavior difference needs a human disposition.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info aria-hidden="true" />
          <AlertTitle>Session only — not saved, cannot approve anything</AlertTitle>
          <AlertDescription>Real decisions are committed to the ledger in a pull request and count as approved once it is merged.</AlertDescription>
        </Alert>
        {deltas.length ? (
          deltas.map((comparison, index) => (
            <div key={comparison.probe.id} className="space-y-6">
              {index ? <Separator /> : null}
              <DeltaDecision comparison={comparison} />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No behavior difference in this report needs a decision.</p>
        )}
        <Separator />
        <section aria-labelledby="prior-heading" className="space-y-3">
          <h3 id="prior-heading" className="font-medium">Prior decisions from the ledger</h3>
          {report.prior_decisions.length ? (
            <ul className="space-y-2">{report.prior_decisions.map((d) => <PriorDecision key={d.id} decision={d} />)}</ul>
          ) : (
            <p className="text-sm text-muted-foreground">No earlier decision covers these symbols.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
