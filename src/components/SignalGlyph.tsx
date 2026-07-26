import { SIGNAL_COLORS } from "@/lib/signals";

export interface SignalGlyphProps {
  publications: number;
  researchers: number;
  trials: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { width: 12, height: 18, gap: 1.5, barW: 2.5 },
  md: { width: 18, height: 28, gap: 2, barW: 4 },
  lg: { width: 32, height: 52, gap: 3.5, barW: 7 },
};

/**
 * Three-segment glyph: publications · researchers · interventional trials.
 * Bar height encodes intensity (0–4) on the sand→indigo scale.
 */
export function SignalGlyph({
  publications,
  researchers,
  trials,
  size = "md",
  className = "",
}: SignalGlyphProps) {
  const dims = SIZES[size];
  const levels = [publications, researchers, trials].map((n) =>
    Math.max(0, Math.min(4, Math.round(n)))
  );
  const labels = ["Publications", "Researchers", "Interventional trials"];

  return (
    <svg
      width={dims.width}
      height={dims.height}
      viewBox={`0 0 ${dims.width} ${dims.height}`}
      role="img"
      aria-label={`Research signals: ${labels
        .map((l, i) => `${l} ${levels[i]} of 4`)
        .join("; ")}`}
      className={className}
    >
      {levels.map((level, i) => {
        const barH = dims.height * ((level + 1) / 5);
        const x = i * (dims.barW + dims.gap);
        const y = dims.height - barH;
        return (
          <rect
            key={labels[i]}
            x={x}
            y={y}
            width={dims.barW}
            height={barH}
            rx={dims.barW / 3}
            fill={SIGNAL_COLORS[level]}
          />
        );
      })}
    </svg>
  );
}
