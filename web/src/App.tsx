import { useEffect, useState } from "react";
import { BehaviorComparison } from "./components/BehaviorComparison";
import { ChangedSymbols } from "./components/ChangedSymbols";
import { DecisionPanel } from "./components/DecisionPanel";
import { EvidenceSummary } from "./components/EvidenceSummary";
import { ImpactPath } from "./components/ImpactPath";
import { LimitsPanel } from "./components/LimitsPanel";
import { ReportState, LoadingState } from "./components/ReportStates";
import { RunHeader, type ThemeMode } from "./components/RunHeader";
import { RunLinks } from "./components/RunLinks";
import { Button } from "./components/ui/button";
import { fetchReport, isEmptyReport } from "./lib/report-adapter";
import type { EvidenceReport } from "./lib/report-types";

function initialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function FallbackHeader({ theme, onToggleTheme }: { theme: ThemeMode; onToggleTheme: () => void }) {
  return (
    <header className="border-b border-rule bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus-ring fixed left-4 top-4 z-50 rounded-[2px] bg-accent px-3 py-2 text-sm font-medium text-white dark:text-[#10171d]"
      >
        Skip to report
      </a>
      <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-3 px-5 sm:px-8 lg:px-12">
        <span aria-hidden="true" className="grid size-8 place-items-center border border-accent bg-accent text-xs font-semibold text-white dark:text-[#10171d]">BR</span>
        <div>
          <p className="text-sm font-semibold text-ink">Behavior Review</p>
          <p className="text-[11px] uppercase tracking-[0.15em] text-faint">Evidence dossier</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          className="ml-auto px-2 text-xs"
        >
          <span aria-hidden="true">{theme === "light" ? "◐" : "○"}</span>
          <span className="hidden sm:inline">{theme === "light" ? "Dark" : "Light"}</span>
        </Button>
      </div>
    </header>
  );
}

function AppFooter({ fixture }: { fixture: boolean }) {
  return (
    <footer className="mx-auto flex max-w-[1440px] flex-col gap-2 border-t border-rule px-5 py-6 text-xs leading-5 text-faint sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
      <p>Behavior Review · deterministic evidence, human disposition.</p>
      <p>{fixture ? "Fixture source · replace before demo use" : "Report source · supplied by the review engine"}</p>
    </footer>
  );
}

function ReportView({ report, theme, onToggleTheme }: { report: EvidenceReport; theme: ThemeMode; onToggleTheme: () => void }) {
  return (
    <>
      <RunHeader report={report} theme={theme} onToggleTheme={onToggleTheme} />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
        <EvidenceSummary report={report} />
        <div className="mt-12 grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16">
          <div className="min-w-0 space-y-12">
            <ChangedSymbols report={report} />
            <ImpactPath report={report} />
            <BehaviorComparison report={report} />
          </div>
          <aside className="min-w-0 space-y-6 lg:sticky lg:top-6">
            <DecisionPanel report={report} />
            <LimitsPanel report={report} />
            <RunLinks report={report} />
          </aside>
        </div>
      </main>
      <AppFooter fixture={report.fixture} />
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; report: EvidenceReport }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetchReport("/data/report.json", controller.signal)
      .then((report) => setState({ status: "ready", report }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "The report could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [reloadToken]);

  const toggleTheme = () => setTheme((current) => (current === "light" ? "dark" : "light"));

  if (state.status === "loading") {
    return (
      <div className="min-h-screen bg-canvas">
        <FallbackHeader theme={theme} onToggleTheme={toggleTheme} />
        <LoadingState />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="min-h-screen bg-canvas">
        <FallbackHeader theme={theme} onToggleTheme={toggleTheme} />
        <ReportState
          title="The evidence report is unavailable"
          description={`${state.message} No claims are shown until a valid report can be loaded.`}
          actionLabel="Retry report load"
          onAction={() => setReloadToken((token) => token + 1)}
          tone="danger"
        />
      </div>
    );
  }

  if (isEmptyReport(state.report)) {
    return (
      <div className="min-h-screen bg-canvas">
        <RunHeader report={state.report} theme={theme} onToggleTheme={toggleTheme} />
        <ReportState
          title="This report has no evidence yet"
          description="The JSON shape loaded successfully, but it contains no changed symbols, impact paths, unknown edges, or observations to review. Run the engine and load its report here."
          actionLabel="Reload report"
          onAction={() => setReloadToken((token) => token + 1)}
        />
        <AppFooter fixture={state.report.fixture} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <ReportView report={state.report} theme={theme} onToggleTheme={toggleTheme} />
    </div>
  );
}
