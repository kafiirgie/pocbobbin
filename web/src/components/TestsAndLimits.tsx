import { CircleCheck, CircleHelp, CircleX, type LucideIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TONE_CLASSES, type Tone } from "@/components/StatusBadge";
import type { ReviewReport, SuiteRun } from "@/lib/review-report";

// A suite that errored without failing tests (import error, timeout) is inconclusive, never "passed".
function suiteVerdict(run: SuiteRun): { label: string; icon: LucideIcon; tone: Tone } {
  if (run.failed > 0) return { label: "Failed", icon: CircleX, tone: "danger" };
  if (run.status === "ok" && run.errors === 0) return { label: "Passed", icon: CircleCheck, tone: "success" };
  return { label: "Inconclusive", icon: CircleHelp, tone: "warning" };
}

export function TestsCard({ report }: { report: ReviewReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle><h2 className="text-lg font-semibold">Tests</h2></CardTitle>
        <CardDescription>The base revision's test suite, run unchanged on both revisions. Passing tests are context, not proof.</CardDescription>
      </CardHeader>
      <CardContent>
        {report.tests.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Revision</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Passed</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Failed</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.tests.map((run) => {
                const { label, icon: Icon, tone } = suiteVerdict(run);
                return (
                  <TableRow key={run.revision}>
                    <TableCell className="whitespace-normal">
                      {run.revision === "base" ? "Base (old)" : "Head (new)"} <code className="text-xs text-muted-foreground">{run.sha.slice(0, 7)}</code>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <Badge variant="outline" className={TONE_CLASSES[tone]}><Icon aria-hidden="true" />{label}</Badge>
                      <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                        {run.passed} passed · {run.failed} failed · {run.errors} errors
                      </p>
                    </TableCell>
                    <TableCell className="hidden text-right font-mono sm:table-cell">{run.passed}</TableCell>
                    <TableCell className="hidden text-right font-mono sm:table-cell">{run.failed}</TableCell>
                    <TableCell className="hidden text-right font-mono sm:table-cell">{run.errors}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No test suite ran in this report.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function LimitsCard({ report }: { report: ReviewReport }) {
  return (
    <Card>
      <CardContent>
        <Accordion type="single" collapsible defaultValue="limits">
          <AccordionItem value="limits" className="border-b-0">
            <AccordionTrigger><h2 className="text-lg font-semibold">Limits ({report.limits.length})</h2></AccordionTrigger>
            <AccordionContent>
              <ul className="max-w-prose list-disc space-y-2 pl-5 text-sm">
                {report.limits.map((limit) => <li key={limit}>{limit}</li>)}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
