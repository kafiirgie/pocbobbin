import { useState, type FormEvent } from "react";
import { CircleAlert, Download, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { TONE_CLASSES } from "@/components/StatusBadge";
import { buildDecision, downloadDecision, MIN_RATIONALE } from "@/lib/decision-file";
import { formatValue } from "@/lib/evidence";
import type { Comparison, Decision, Intent, ReviewReport } from "@/lib/review-report";

const INTENTS: { value: Intent; label: string; hint: string }[] = [
  { value: "unintended", label: "Unintended", hint: "A regression: fix the code, then rerun the same probe." },
  { value: "intended", label: "Intended", hint: "A deliberate change: explain why in the rationale." },
  { value: "unresolved", label: "Unresolved", hint: "Not sure yet: it stays open for review." },
];

type SaveState = { status: "saved"; decision: Decision } | { status: "error"; message: string } | null;

function SaveStatus({ state }: { state: SaveState }) {
  if (!state) return null;
  if (state.status === "error") {
    return (
      <p role="alert" className="flex items-center gap-2 text-sm text-danger">
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />{state.message}
      </p>
    );
  }
  const { id, supersedes } = state.decision;
  return (
    <p role="status" className="max-w-prose text-sm text-muted-foreground">
      Downloaded <code>{id}.json</code> as a proposed decision{supersedes ? <> that supersedes <code>{supersedes}</code></> : null}.
      Commit it to <code>behavior_decisions/</code> on this PR's branch; it counts as approved once the PR is merged.
    </p>
  );
}

function IntentChoice({ id, intent, onChange }: { id: string; intent: Intent | ""; onChange: (intent: Intent) => void }) {
  return (
    <RadioGroup value={intent} onValueChange={(value) => onChange(value as Intent)} aria-label={`Disposition for probe ${id}`}>
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
  );
}

function DeltaDecision({ report, comparison }: { report: ReviewReport; comparison: Comparison }) {
  const [intent, setIntent] = useState<Intent | "">("");
  const [rationale, setRationale] = useState("");
  const [save, setSave] = useState<SaveState>(null);
  const id = comparison.probe.id;
  const shortRationale = intent === "intended" && rationale.trim().length < MIN_RATIONALE;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!intent || shortRationale) return;
    try {
      const decision = await buildDecision(report, comparison, intent, rationale);
      downloadDecision(decision);
      setSave({ status: "saved", decision });
    } catch (error: unknown) {
      setSave({ status: "error", message: error instanceof Error ? error.message : "The decision file could not be built." });
    }
  };
  return (
    <form className="space-y-3" onSubmit={(event) => void submit(event)}>
      <p className="text-sm">
        <code className="font-semibold">{comparison.probe.target.symbol}</code> via probe <code>{id}</code>:{" "}
        <code>{formatValue(comparison.base.output)}</code> → <code>{formatValue(comparison.head.output)}</code>
      </p>
      <IntentChoice id={id} intent={intent} onChange={(next) => { setIntent(next); setSave(null); }} />
      <div className="space-y-1">
        <Label htmlFor={`${id}-rationale`}>
          Rationale {intent === "intended" ? `(required, at least ${MIN_RATIONALE} characters)` : "(optional)"}
        </Label>
        <Textarea
          id={`${id}-rationale`}
          value={rationale}
          onChange={(event) => { setRationale(event.target.value); setSave(null); }}
          aria-invalid={shortRationale}
          placeholder="Why is this behavior change correct?"
        />
      </div>
      <Button type="submit" disabled={!intent || shortRationale || report.fixture}>
        <Download aria-hidden="true" />Download decision
      </Button>
      {report.fixture ? <p className="text-sm text-muted-foreground">A fixture report cannot produce a ledger record.</p> : null}
      <SaveStatus state={save} />
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
          <AlertTitle>This page saves nothing and cannot approve anything</AlertTitle>
          <AlertDescription>
            Download writes the ledger record <code>behavior_decisions/&lt;id&gt;.json</code>. Commit it on the PR's branch: it is
            proposed there, and counts as approved once that PR is merged.
          </AlertDescription>
        </Alert>
        {deltas.length ? (
          deltas.map((comparison, index) => (
            <div key={comparison.probe.id} className="space-y-6">
              {index ? <Separator /> : null}
              <DeltaDecision report={report} comparison={comparison} />
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
