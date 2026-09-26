import type { ReactNode } from "react";
import type { EvidenceReport } from "../lib/report-types";
import { isSafeExternalUrl } from "../lib/report-adapter";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export type ThemeMode = "light" | "dark";

interface RunHeaderProps {
  report: EvidenceReport;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function formatStatus(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-rule pl-3 first:border-l-0 first:pl-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{label}</dt>
      <dd className="mt-1 min-w-0 text-sm text-ink">{children}</dd>
    </div>
  );
}

function Commit({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-2">
      <span className="text-xs uppercase tracking-[0.12em] text-faint">{label}</span>
      <code className="mono-value truncate text-xs text-ink" title={value}>
        {value}
      </code>
    </span>
  );
}

export function RunHeader({ report, theme, onToggleTheme }: RunHeaderProps) {
  const status = formatStatus(report.run.status);

  return (
    <header className="border-b border-rule bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus-ring fixed left-4 top-4 z-50 rounded-[2px] bg-accent px-3 py-2 text-sm font-medium text-white dark:text-[#10171d]"
      >
        Skip to report
      </a>
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="flex min-h-16 items-center gap-4 border-b border-rule py-3">
          <a href="#main-content" className="focus-ring inline-flex min-w-0 items-center gap-3 rounded-[2px]">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center border border-accent bg-accent text-xs font-semibold tracking-[-0.04em] text-white dark:text-[#10171d]"
            >
              BR
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-ink">
                Behavior Review
              </span>
              <span className="block text-[11px] uppercase tracking-[0.15em] text-faint">
                Evidence dossier
              </span>
            </span>
          </a>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Badge variant={report.fixture ? "warning" : "neutral"}>
              <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
              {report.fixture ? "Fixture data" : "Report data"}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              className="px-2 text-xs"
            >
              <span aria-hidden="true" className="text-base leading-none">
                {theme === "light" ? "◐" : "○"}
              </span>
              <span className="hidden sm:inline">{theme === "light" ? "Dark" : "Light"}</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:items-end lg:gap-12 lg:py-12">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="mono-value text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
                Run / {status}
              </span>
              <span aria-hidden="true" className="text-faint">·</span>
              <span className="text-xs text-subtle">Schema {report.schemaVersion}</span>
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold leading-[1.08] tracking-[-0.045em] text-ink sm:text-4xl lg:text-[46px]">
              Review the evidence behind this change.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-subtle">
              A paired view of changed symbols, impact paths, and observed behavior. Evidence is shown as reported;
              it is not a safety verdict.
            </p>
          </div>

          <dl className="grid grid-cols-1 gap-4 border-t border-rule pt-5 sm:grid-cols-2 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
            <MetaItem label="Repository">
              <span className="break-words">{report.run.repo}</span>
            </MetaItem>
            <MetaItem label="Run status">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                {status}
              </span>
            </MetaItem>
            <MetaItem label="Revision pair">
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                <Commit label="base" value={report.run.baseSha} />
                <Commit label="head" value={report.run.headSha} />
              </span>
            </MetaItem>
            <MetaItem label="Generated">
              <span className="break-words">{formatGeneratedAt(report.run.generatedAt)}</span>
            </MetaItem>
          </dl>
        </div>

        {report.fixture ? (
          <div className="mb-6 flex flex-col gap-2 border border-warning/35 bg-warning-soft px-4 py-3 text-sm text-ink sm:flex-row sm:items-start sm:gap-3">
            <span className="mono-value shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-warning">
              Fixture report
            </span>
            <p className="leading-6">
              Values below are a UI integration fixture. Replace this file with engine-generated evidence before using the page to make review claims.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule py-3 text-xs text-subtle">
          <span>
            <span className="font-medium text-ink">Base</span> <code className="mono-value">{report.run.baseSha}</code>
          </span>
          <span>
            <span className="font-medium text-ink">Head</span> <code className="mono-value">{report.run.headSha}</code>
          </span>
          {isSafeExternalUrl(report.links.actionRun) ? (
            <a
              className="focus-ring inline-flex items-center gap-1 rounded-[2px] font-medium text-accent hover:text-accent-strong"
              href={report.links.actionRun}
              target="_blank"
              rel="noreferrer"
            >
              Action run <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <span className="text-faint">No Action run linked</span>
          )}
        </div>
      </div>
    </header>
  );
}
