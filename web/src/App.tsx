import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BehaviorDifferences } from "@/components/BehaviorDifferences";
import { DecisionPanel } from "@/components/DecisionPanel";
import { LimitsCard, TestsCard } from "@/components/TestsAndLimits";
import { NeedsAttention } from "@/components/NeedsAttention";
import { NodeDetailsSheet } from "@/components/NodeDetailsSheet";
import { OpenReportDialog } from "@/components/OpenReportDialog";
import { ErrorState, LoadingState, OpenedNotice } from "@/components/ReportStates";
import { SummaryHeader } from "@/components/SummaryHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { evidenceNodes } from "@/lib/evidence";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { OpenedReport } from "@/lib/open-report";
import type { RepoMap } from "@/lib/repo-map";
import { fetchJson, parseReport, ReportError, type ReviewReport } from "@/lib/review-report";
import { useTheme } from "@/lib/use-theme";

type LoadState = { status: "loading" } | { status: "ready"; report: ReviewReport } | { status: "error"; message: string };

function useReport(reloadToken: number): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchJson("/data/report.json", controller.signal)
      .then((json) => {
        if (json === null) throw new ReportError("No report was found at /data/report.json.");
        setState({ status: "ready", report: parseReport(json) });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", message: error instanceof Error ? error.message : "The report could not be loaded." });
      });
    return () => controller.abort();
  }, [reloadToken]);
  return state;
}

const EvidenceMap = lazy(() => import("@/components/EvidenceMap"));
const RepoMapTab = lazy(() => import("@/components/RepoMapTab"));

function PrReview({ report }: { report: ReviewReport }) {
  const nodes = useMemo(() => evidenceNodes(report), [report]);
  const [selected, setSelected] = useState<string | undefined>();
  const select = useCallback((key: string) => setSelected(key), []);
  return (
    <div className="space-y-8">
      <SummaryHeader report={report} />
      <section aria-labelledby="map-heading">
        <Suspense fallback={<Skeleton className="h-112 w-full" />}>
          <EvidenceMap report={report} onSelect={select} />
        </Suspense>
      </section>
      <BehaviorDifferences report={report} onSelect={select} />
      <NeedsAttention report={report} />
      <DecisionPanel report={report} />
      <TestsCard report={report} />
      <LimitsCard report={report} />
      <NodeDetailsSheet node={selected ? nodes.get(selected) : undefined} onOpenChange={(open) => !open && setSelected(undefined)} />
    </div>
  );
}

/** `map` undefined loads the shipped repo_map.json; null means none was opened alongside the report. */
function ReportViews({ report, map }: { report: ReviewReport; map?: RepoMap | null }) {
  const [tab, setTab] = useState("pr");
  const showEvidence = useCallback(() => {
    setTab("pr");
    requestAnimationFrame(() => document.getElementById("map-heading")?.scrollIntoView({ block: "start" }));
  }, []);
  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <TabsList aria-label="Views">
        <TabsTrigger value="pr">PR review</TabsTrigger>
        <TabsTrigger value="repo">Repo map</TabsTrigger>
      </TabsList>
      <TabsContent value="pr"><PrReview report={report} /></TabsContent>
      <TabsContent value="repo">
        <Suspense fallback={<Skeleton className="h-128 w-full" />}>
          <RepoMapTab changedFiles={report.revisions.changed_files} map={map} onShowEvidence={showEvidence} />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}

function ShippedReport() {
  const [reloadToken, setReloadToken] = useState(0);
  const state = useReport(reloadToken);
  if (state.status === "loading") return <LoadingState />;
  if (state.status === "error") return <ErrorState message={state.message} onRetry={() => setReloadToken((t) => t + 1)} />;
  return <ReportViews report={state.report} />;
}

export default function App() {
  const { theme, toggle } = useTheme();
  const [opened, setOpened] = useState<OpenedReport | null>(null);

  return (
    <TooltipProvider>
      <AppHeader theme={theme} onToggleTheme={toggle}>
        <OpenReportDialog onOpen={setOpened} />
      </AppHeader>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {opened ? <OpenedNotice names={opened.names} onClose={() => setOpened(null)} /> : null}
        {opened ? (
          <ReportViews key={`${opened.names.join()}:${opened.report.generated_at}`} report={opened.report} map={opened.map} />
        ) : (
          <ShippedReport />
        )}
      </main>
    </TooltipProvider>
  );
}
