import type { YearCount } from "@/lib/types";

export function Sparkline({
  data,
  className = "",
  width = 160,
  height = 36,
}: {
  data: YearCount[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (!data.length) {
    return (
      <span className={`font-mono text-xs text-mute ${className}`}>No yearly data</span>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const points = data
    .map((d, i) => {
      const x = pad + i * step;
      const y = pad + innerH - (d.count / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  const area = `${pad},${pad + innerH} ${points} ${pad + innerW},${pad + innerH}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Publications per year, ${data[0].year}–${data[data.length - 1].year}`}
    >
      <polygon points={area} fill="#D9DCE8" opacity={0.55} />
      <polyline
        points={points}
        fill="none"
        stroke="#1E2A4A"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
