import { Button } from "./ui/button";

export function LoadingState() {
  return (
    <main id="main-content" tabIndex={-1} aria-busy="true" aria-live="polite" className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="space-y-8 motion-safe:animate-pulse">
        <div className="h-4 w-32 rounded-[2px] bg-rule" />
        <div className="h-14 max-w-2xl rounded-[2px] bg-rule" />
        <div className="h-5 max-w-xl rounded-[2px] bg-rule" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-32 border border-rule bg-surface" />)}
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="h-[430px] border border-rule bg-surface" />
          <div className="h-[430px] border border-rule bg-surface" />
        </div>
      </div>
      <span className="sr-only">Loading report evidence</span>
    </main>
  );
}

interface ReportStateProps {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  tone?: "neutral" | "danger";
}

export function ReportState({ title, description, actionLabel, onAction, tone = "neutral" }: ReportStateProps) {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[65vh] max-w-[760px] items-center px-5 py-12 sm:px-8">
      <section role={tone === "danger" ? "alert" : undefined} className="w-full border border-rule bg-surface p-6 sm:p-10">
        <div className={`mb-5 size-3 ${tone === "danger" ? "bg-danger" : "bg-accent"}`} aria-hidden="true" />
        <p className="mono-value text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">Report state</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-ink">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-subtle">{description}</p>
        <Button className="mt-6" variant={tone === "danger" ? "secondary" : "primary"} onClick={onAction}>
          {actionLabel}
        </Button>
      </section>
    </main>
  );
}
