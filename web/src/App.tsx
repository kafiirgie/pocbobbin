import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BehaviorDifferences } from "@/components/BehaviorDifferences";
import { DecisionPanel } from "@/components/DecisionPanel";
import { LimitsCard, TestsCard } from "@/components/TestsAndLimits";
import { NeedsAttention } from "@/components/NeedsAttention";
import { NodeDetailsSheet } from "@/components/NodeDetailsSheet";
import { ErrorState, LoadingState } from "@/components/ReportStates";
import { SummaryHeader } from "@/components/SummaryHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { evidenceNodes } from "@/lib/evidence";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
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

export default function App() {
  const { theme, toggle } = useTheme();
  const [reloadToken, setReloadToken] = useState(0);
  const state = useReport(reloadToken);
  const [tab, setTab] = useState("pr");
  const showEvidence = useCallback(() => {
    setTab("pr");
    requestAnimationFrame(() => document.getElementById("map-heading")?.scrollIntoView({ block: "start" }));
  }, []);

  return (
    <TooltipProvider>
      <AppHeader theme={theme} onToggleTheme={toggle} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {state.status === "loading" ? <LoadingState /> : null}
        {state.status === "error" ? <ErrorState message={state.message} onRetry={() => setReloadToken((t) => t + 1)} /> : null}
        {state.status === "ready" ? (
          <Tabs value={tab} onValueChange={setTab} className="gap-6">
            <TabsList aria-label="Views">
              <TabsTrigger value="pr">PR review</TabsTrigger>
              <TabsTrigger value="repo">Repo map</TabsTrigger>
            </TabsList>
            <TabsContent value="pr"><PrReview report={state.report} /></TabsContent>
            <TabsContent value="repo">
              <Suspense fallback={<Skeleton className="h-128 w-full" />}>
                <RepoMapTab changedFiles={state.report.revisions.changed_files} onShowEvidence={showEvidence} />
              </Suspense>
            </TabsContent>
          </Tabs>
        ) : null}
      </main>
    </TooltipProvider>
  );
}
