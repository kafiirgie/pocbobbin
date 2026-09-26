import { Badge } from "@/components/ui/badge";
import { TONE_CLASSES } from "@/components/StatusBadge";
import type { LanguageSupport, Tier } from "@/lib/review-report";

const TIER_LABELS: Record<Tier, string> = {
  full: "full support",
  static_probe: "static + probe harness",
  static_cross_file: "static, cross-file",
  experimental: "experimental",
};

// What each tier means for the evidence, in the words of app/adapters/registry.py (TIER_LIMITS).
const TIER_MEANING: Record<Tier, string> = {
  full: "callers traced, and tests and probes run on both revisions",
  static_probe: "callers traced across files; a probe harness exists, but no end-to-end run is verified",
  static_cross_file: "callers traced across files; tests and probes are not verified",
  experimental: "same-file callers only; matching by name can miss or invent edges",
};

const TIER_ORDER: Tier[] = ["full", "static_probe", "static_cross_file", "experimental"];

const toneOf = (tier: Tier) => TONE_CLASSES[tier === "full" ? "success" : "warning"];

export function TierBadge({ support }: { support: Pick<LanguageSupport, "language" | "tier"> }) {
  return (
    <Badge variant="outline" className={toneOf(support.tier)}>
      {support.language} · {TIER_LABELS[support.tier]}
    </Badge>
  );
}

/** Legend rows for the language badges on a map: only the tiers that appear on it. */
export function TierLegend({ tiers }: { tiers: Iterable<Tier> }) {
  const present = new Set(tiers);
  const shown = TIER_ORDER.filter((tier) => present.has(tier));
  if (!shown.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Language badge: how much is verified</p>
      <ul aria-label="Language support tiers" className="space-y-1">
        {shown.map((tier) => (
          <li key={tier} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className={toneOf(tier)}>{TIER_LABELS[tier]}</Badge>
            {TIER_MEANING[tier]}
          </li>
        ))}
      </ul>
    </div>
  );
}
