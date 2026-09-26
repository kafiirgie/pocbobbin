import type { LucideIcon } from "lucide-react";
import { CircleAlert, CircleDashed, CircleHelp, Diff, Equal, FileSearch, FlaskConical, PencilLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { EvidenceStatus } from "@/lib/evidence";
import { cn } from "@/lib/utils";

export type Tone = "danger" | "warning" | "success" | "info" | "neutral";

// Literal class strings so Tailwind can see them; colors come only from the semantic tokens.
export const TONE_CLASSES: Record<Tone, string> = {
  danger: "border-danger/40 bg-danger-muted text-danger",
  warning: "border-warning/40 bg-warning-muted text-warning",
  success: "border-success/40 bg-success-muted text-success",
  info: "border-info/40 bg-info-muted text-info",
  neutral: "border-neutral/40 bg-neutral-muted text-neutral",
};

export const STATUS_META: Record<EvidenceStatus, { label: string; icon: LucideIcon; tone: Tone }> = {
  behavior_differs: { label: "Behavior differs", icon: Diff, tone: "danger" },
  inconclusive: { label: "Inconclusive", icon: CircleHelp, tone: "warning" },
  needs_probe: { label: "Needs a probe", icon: FlaskConical, tone: "neutral" },
  pre_existing_failure: { label: "Pre-existing failure", icon: CircleAlert, tone: "neutral" },
  same: { label: "Same on tested cases", icon: Equal, tone: "success" },
  changed: { label: "Changed", icon: PencilLine, tone: "info" },
  outside_diff: { label: "Outside diff", icon: FileSearch, tone: "info" },
  unknown_edge: { label: "Unknown edge", icon: CircleDashed, tone: "warning" },
};

interface StatusBadgeProps {
  status: EvidenceStatus;
  count?: number;
  className?: string;
}

export function StatusBadge({ status, count, className }: StatusBadgeProps) {
  const { label, icon: Icon, tone } = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn(TONE_CLASSES[tone], className)}>
      <Icon aria-hidden="true" />
      {count === undefined ? label : `${count} · ${label}`}
    </Badge>
  );
}
