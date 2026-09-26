import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeVariant = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variants: Record<BadgeVariant, string> = {
  neutral: "border-rule bg-surface-muted text-subtle",
  accent: "border-accent/30 bg-accent-soft text-accent-strong",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/35 bg-warning-soft text-warning",
  danger: "border-danger/35 bg-danger-soft text-danger",
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] leading-none",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
