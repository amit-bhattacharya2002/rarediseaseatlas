import type { Confidence } from "@/lib/types";

const STYLES: Record<Confidence, string> = {
  high: "text-ink border-ink/30",
  medium: "text-mute border-line",
  low: "text-mute border-line bg-sand-50",
};

export function ConfidenceBadge({
  confidence,
  className = "",
}: {
  confidence: Confidence;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${STYLES[confidence]} ${className}`}
      title={`Name-matching confidence: ${confidence}`}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-current"
        aria-hidden
      />
      {confidence} confidence
    </span>
  );
}
