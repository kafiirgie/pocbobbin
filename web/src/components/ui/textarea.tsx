import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "focus-ring min-h-24 w-full resize-y rounded-[2px] border border-rule bg-surface-muted px-3 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus:border-accent",
        className,
      )}
      {...props}
    />
  );
}
