import { Badge } from "@/components/ui/badge";
import { TONE_CLASSES } from "@/components/StatusBadge";
import type { LanguageSupport } from "@/lib/review-report";

const TIER_LABELS: Record<LanguageSupport["tier"], string> = {
  full: "full support",
  static_probe: "static + probe harness",
  static_cross_file: "static, cross-file",
  experimental: "experimental",
};

export function TierBadge({ support }: { support: Pick<LanguageSupport, "language" | "tier"> }) {
  return (
    <Badge variant="outline" className={TONE_CLASSES[support.tier === "full" ? "success" : "warning"]}>
      {support.language} · {TIER_LABELS[support.tier]}
    </Badge>
  );
}
