import type { ReactNode } from "react";

interface SectionHeadingProps {
  index: string;
  title: string;
  description: string;
  headingId?: string;
  action?: ReactNode;
}

export function SectionHeading({ index, title, description, headingId, action }: SectionHeadingProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="dossier-rule pl-4">
        <p className="mono-value text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">
          {index}
        </p>
        <h2 id={headingId} className="mt-1 text-xl font-semibold tracking-[-0.025em] text-ink sm:text-[22px]">
          {title}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-subtle">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
