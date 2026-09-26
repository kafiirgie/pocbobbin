import { useId, useState } from "react";
import type { DecisionDisposition, EvidenceReport, Observation, ReportDecision } from "../lib/report-types";
import { DECISION_LABELS } from "../lib/report-types";
import { canSubmitDecision, decisionNeedsRationale } from "../lib/decision-state";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";

interface DecisionPanelProps {
  report: EvidenceReport;
}

interface DraftDecision {
  selection: DecisionDisposition | null;
  rationale: string;
  submitted: boolean;
}

const optionDescriptions: Record<DecisionDisposition, string> = {
  unintended: "Keep the issue open for a fix and rerun.",
  intended: "Explain why this behavior change is part of the requirement.",
  unresolved: "Leave the difference prominently open for review.",
};

const optionVariants: Record<DecisionDisposition, "danger" | "accent" | "warning"> = {
  unintended: "danger",
  intended: "accent",
  unresolved: "warning",
};

const emptyDraft: DraftDecision = {
  selection: null,
  rationale: "",
  submitted: false,
};

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function observationIdMatches(decisionId: string | undefined, observationId: string): boolean {
  if (!decisionId) return false;
  if (decisionId === observationId) return true;
  const unprefixedObservationId = observationId.replace(/^observation-/, "");
  return decisionId === unprefixedObservationId || observationId === `observation-${decisionId}`;
}

function decisionsForObservation(report: EvidenceReport, observation: Observation): ReportDecision[] {
  return report.decisions.filter((decision) => {
    if (observationIdMatches(decision.observationId, observation.id)) return true;
    return Boolean(
      decision.probeHash &&
        observation.probeHash &&
        decision.probeHash === observation.probeHash,
    );
  });
}

function dispositionVariant(disposition: DecisionDisposition | undefined): "danger" | "accent" | "warning" | "neutral" {
  if (!disposition) return "neutral";
  return optionVariants[disposition];
}

function ReportDecisionContext({ decision }: { decision: ReportDecision }) {
  const disposition = decision.disposition ? DECISION_LABELS[decision.disposition] : "Not recorded";
  return (
    <div className="border border-rule bg-surface-muted px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mono-value text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
          Report decision · {decision.id}
        </p>
        <Badge variant={dispositionVariant(decision.disposition)}>{disposition}</Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-subtle">
        Read-only context from the supplied report. It does not select or approve this session decision.
      </p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {decision.status ? (
          <div>
            <dt className="font-semibold uppercase tracking-[0.1em] text-faint">Report status</dt>
            <dd className="mt-0.5 break-words text-subtle">{decision.status}</dd>
          </div>
        ) : null}
        {decision.probeHash ? (
          <div>
            <dt className="font-semibold uppercase tracking-[0.1em] text-faint">Probe hash</dt>
            <dd className="mono-value mt-0.5 break-all text-subtle">{decision.probeHash}</dd>
          </div>
        ) : null}
        {decision.symbol ? (
          <div>
            <dt className="font-semibold uppercase tracking-[0.1em] text-faint">Symbol</dt>
            <dd className="mt-0.5 break-words text-subtle">{decision.symbol}</dd>
          </div>
        ) : null}
        {decision.path ? (
          <div>
            <dt className="font-semibold uppercase tracking-[0.1em] text-faint">Path</dt>
            <dd className="mt-0.5 break-all text-subtle">{decision.path}</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-3 border-t border-rule pt-2 text-xs leading-5 text-subtle">
        <span className="font-semibold text-ink">Rationale: </span>
        {decision.rationale ?? (decision.disposition === "intended" ? "Not provided; intended requires a rationale." : "Not provided.")}
      </p>
    </div>
  );
}

function DecisionForm({
  observation,
  panelId,
  draft,
  onSelect,
  onRationale,
  onSubmit,
}: {
  observation: Observation;
  panelId: string;
  draft: DraftDecision;
  onSelect: (value: DecisionDisposition) => void;
  onRationale: (value: string) => void;
  onSubmit: () => void;
}) {
  const groupId = `${panelId}-${safeId(observation.id)}`;
  const rationaleId = `${groupId}-rationale`;
  const errorId = `${groupId}-rationale-note`;
  const valid = canSubmitDecision(draft.selection, draft.rationale);

  return (
    <div className="border-t border-rule pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mono-value text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            Decision for {observation.id}
          </p>
          <p className="mt-1 break-words text-sm font-semibold text-ink">{observation.name}</p>
        </div>
        <Badge variant="danger">Delta requires review</Badge>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-ink">Temporary disposition</legend>
        <div role="radiogroup" aria-label={`Temporary disposition for ${observation.name}`} className="mt-3 space-y-2">
          {(Object.keys(DECISION_LABELS) as DecisionDisposition[]).map((value) => {
            const inputId = `${groupId}-${value}`;
            const checked = draft.selection === value;
            return (
              <label
                key={value}
                htmlFor={inputId}
                className={`focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-surface flex cursor-pointer gap-3 rounded-[2px] border px-3 py-3 transition-colors ${
                  checked ? "border-accent bg-accent-soft" : "border-rule bg-surface hover:border-accent/60"
                }`}
              >
                <input
                  id={inputId}
                  className="sr-only"
                  type="radio"
                  name={`${groupId}-disposition`}
                  value={value}
                  checked={checked}
                  onChange={() => onSelect(value)}
                />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${checked ? "border-accent" : "border-faint"}`}
                >
                  {checked ? <span className="size-2 rounded-full bg-accent" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {DECISION_LABELS[value]}
                    {value === "intended" ? <Badge variant="accent" className="text-[9px]">Rationale required</Badge> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-subtle">{optionDescriptions[value]}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor={rationaleId} className="text-sm font-semibold text-ink">
          Rationale <span className="font-normal text-faint">(required for intended)</span>
        </label>
        <Textarea
          id={rationaleId}
          value={draft.rationale}
          onChange={(event) => onRationale(event.target.value)}
          disabled={!decisionNeedsRationale(draft.selection)}
          aria-describedby={draft.selection === "intended" ? errorId : undefined}
          aria-invalid={draft.selection === "intended" && !draft.rationale.trim()}
          placeholder={draft.selection === "intended" ? "Explain the intended contract change…" : "Select Intended to add a rationale."}
          className="mt-2 disabled:cursor-not-allowed disabled:opacity-55"
        />
        <p id={errorId} className="mt-2 text-xs leading-5 text-subtle">
          {draft.selection === "intended" && !draft.rationale.trim()
            ? "A non-empty rationale enables the Intended decision."
            : "This text stays in this browser session only."}
        </p>
      </div>

      <div className="mt-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-faint">This does not write an approval record.</p>
        <Button variant="primary" onClick={onSubmit} disabled={!valid} aria-disabled={!valid}>
          Record for this observation
        </Button>
      </div>
      {draft.submitted && draft.selection ? (
        <div role="status" className="mt-3 border-l-2 border-success bg-success-soft px-3 py-2.5 text-sm leading-6 text-success">
          <strong>{DECISION_LABELS[draft.selection]}</strong> recorded for <strong>{observation.name}</strong> in this session only. The observed delta remains part of the report evidence.
        </div>
      ) : null}
    </div>
  );
}

export function DecisionPanel({ report }: DecisionPanelProps) {
  const [drafts, setDrafts] = useState<Record<string, DraftDecision>>({});
  const panelId = useId();
  const deltaObservations = report.observations.filter((observation) => observation.outcome === "delta_observed");
  const sameCount = report.observations.filter((observation) => observation.outcome === "same_on_tested_cases").length;
  const hasInconclusive = report.observations.some((observation) => observation.outcome === "inconclusive");
  const unmatchedDecisions = report.decisions.filter(
    (decision) => !deltaObservations.some((observation) => decisionsForObservation(report, observation).includes(decision)),
  );

  function draftFor(observationId: string): DraftDecision {
    return drafts[observationId] ?? emptyDraft;
  }

  function updateDraft(observationId: string, update: Partial<DraftDecision>) {
    setDrafts((current) => ({
      ...current,
      [observationId]: { ...(current[observationId] ?? emptyDraft), ...update },
    }));
  }

  return (
    <Card className="border-accent/35">
      <CardHeader className="bg-accent-soft/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="mono-value text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">04 / human gate</p>
            <CardTitle className="mt-1">Disposition each observed delta</CardTitle>
          </div>
          <Badge variant={deltaObservations.length ? "danger" : hasInconclusive ? "warning" : "neutral"}>
            {deltaObservations.length ? `${deltaObservations.length} required` : hasInconclusive ? "Inconclusive" : "No delta"}
          </Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-subtle">
          Each <code className="mono-value text-xs">delta_observed</code> observation gets its own session-only disposition. Nothing here is saved to the repository or treated as approval.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {deltaObservations.length ? (
          <div className="space-y-5">
            {deltaObservations.map((observation) => {
              const context = decisionsForObservation(report, observation);
              return (
                <div key={observation.id} className="space-y-4">
                  {context.map((decision) => <ReportDecisionContext key={decision.id} decision={decision} />)}
                  <DecisionForm
                    observation={observation}
                    panelId={panelId}
                    draft={draftFor(observation.id)}
                    onSelect={(selection) => updateDraft(observation.id, { selection, submitted: false })}
                    onRationale={(rationale) => updateDraft(observation.id, { rationale, submitted: false })}
                    onSubmit={() => {
                      const draft = draftFor(observation.id);
                      if (canSubmitDecision(draft.selection, draft.rationale)) {
                        updateDraft(observation.id, { submitted: true });
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-rule bg-surface-muted px-3 py-3 text-sm leading-6 text-subtle">
            {hasInconclusive
              ? "No disposition form is shown for inconclusive observations. Inconclusive means execution could not establish a comparable outcome; it is not evidence that no delta occurred or that the change is safe. Rerun the comparison."
              : sameCount
                ? "No delta_observed observation is present. same_on_tested_cases only describes the tested inputs; it is not a safety verdict."
                : "No delta_observed observation is present, so there is no behavior difference to disposition in this report."}
          </div>
        )}

        {unmatchedDecisions.length ? (
          <div className="space-y-3 border-t border-rule pt-5">
            <div>
              <h3 className="text-sm font-semibold text-ink">Other report decisions</h3>
              <p className="mt-1 text-xs leading-5 text-subtle">
                These supplied decisions are shown as context only. They do not set a visitor disposition and do not prove approval.
              </p>
            </div>
            {unmatchedDecisions.map((decision) => <ReportDecisionContext key={decision.id} decision={decision} />)}
          </div>
        ) : null}

        {hasInconclusive && deltaObservations.length ? (
          <div className="border-l-2 border-warning bg-warning-soft px-3 py-2.5 text-sm leading-6 text-ink">
            At least one observation is inconclusive. It needs a new comparable run; it is not a no-delta or safe result.
          </div>
        ) : null}
      </CardContent>
      <CardFooter>
        <p className="text-xs leading-5 text-faint">Reloading clears every temporary visitor disposition. Existing report decisions remain read-only context.</p>
      </CardFooter>
    </Card>
  );
}
