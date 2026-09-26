import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadge } from "@/components/StatusBadge";
import { formatValue, OUTCOME_STATUS, STATUS_PRIORITY } from "@/lib/evidence";
import { symbolKey, type Comparison, type Observation, type ReviewReport } from "@/lib/review-report";

interface BehaviorDifferencesProps {
  report: ReviewReport;
  onSelect: (key: string) => void;
}

function observed(observation: Observation) {
  return observation.exception ? `raises ${observation.exception}` : formatValue(observation.output);
}

function Value({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex items-start gap-1">
      <code className="min-w-0 font-mono text-sm break-all">{value}</code>
      <CopyButton value={value} label={label} />
    </span>
  );
}

function TargetButton({ comparison, onSelect }: { comparison: Comparison; onSelect: (key: string) => void }) {
  const { target } = comparison.probe;
  return (
    <Button variant="link" className="h-auto p-0 font-mono" onClick={() => onSelect(symbolKey(target))}>
      {target.symbol}
    </Button>
  );
}

/** One comparison as a stacked card: the mobile layout of a table row. */
function BehaviorDiffRow({ comparison, onSelect }: { comparison: Comparison; onSelect: (key: string) => void }) {
  return (
    <li className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TargetButton comparison={comparison} onSelect={onSelect} />
        <StatusBadge status={OUTCOME_STATUS[comparison.outcome]} />
      </div>
      <p className="text-xs break-all text-muted-foreground">{comparison.probe.target.path} · probe {comparison.probe.id}</p>
      <dl className="space-y-1 text-sm">
        <div><dt className="text-xs text-muted-foreground">Input</dt><dd><Value value={formatValue(comparison.probe.input)} label="input" /></dd></div>
        <div><dt className="text-xs text-muted-foreground">Base (old)</dt><dd><Value value={observed(comparison.base)} label="base output" /></dd></div>
        <div><dt className="text-xs text-muted-foreground">Head (new)</dt><dd><Value value={observed(comparison.head)} label="head output" /></dd></div>
      </dl>
    </li>
  );
}

export function BehaviorDifferences({ report, onSelect }: BehaviorDifferencesProps) {
  const rank = (c: Comparison) => STATUS_PRIORITY.indexOf(OUTCOME_STATUS[c.outcome] as (typeof STATUS_PRIORITY)[number]);
  const comparisons = [...report.comparisons].sort((a, b) => rank(a) - rank(b));
  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 className="text-lg font-semibold">Behavior differences</h2></CardTitle>
        <CardDescription>The same probe input, run on the old (base) and new (head) code. Differences come first.</CardDescription>
      </CardHeader>
      <CardContent>
        {comparisons.length === 0 ? (
          <p className="text-sm text-muted-foreground">No probes ran in this report, so it makes no behavior claim.</p>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {comparisons.map((c) => <BehaviorDiffRow key={c.probe.id} comparison={c} onSelect={onSelect} />)}
            </ul>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Target</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Base (old)</TableHead>
                  <TableHead>Head (new)</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparisons.map((c) => (
                  <TableRow key={c.probe.id}>
                    <TableCell className="align-top">
                      <TargetButton comparison={c} onSelect={onSelect} />
                      <p className="text-xs text-muted-foreground">probe {c.probe.id}</p>
                    </TableCell>
                    <TableCell className="max-w-xs align-top whitespace-normal"><Value value={formatValue(c.probe.input)} label="input" /></TableCell>
                    <TableCell className="align-top whitespace-normal"><Value value={observed(c.base)} label="base output" /></TableCell>
                    <TableCell className="align-top whitespace-normal"><Value value={observed(c.head)} label="head output" /></TableCell>
                    <TableCell className="align-top"><StatusBadge status={OUTCOME_STATUS[c.outcome]} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
