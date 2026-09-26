import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-strong disabled:bg-accent/45 dark:text-[#10171d]",
  secondary:
    "border border-rule bg-surface text-ink hover:border-accent hover:text-accent disabled:text-faint",
  ghost:
    "bg-transparent text-subtle hover:bg-surface-muted hover:text-ink disabled:text-faint",
  danger:
    "border border-danger/35 bg-danger-soft text-danger hover:border-danger disabled:opacity-50",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-xs",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-11 px-5 text-sm",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-[2px] font-medium transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
