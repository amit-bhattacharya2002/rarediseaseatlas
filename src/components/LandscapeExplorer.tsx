"use client";

import { useMemo, useState } from "react";
import { SIGNAL_COLORS, signalLevel } from "@/lib/signals";

export interface LandscapeCell {
  orphaCode: string;
  name: string;
  pubs: number | null;
  recent: number | null;
  trials: number | null;
  researchers: number | null;
  confidence: "high" | "medium" | "low";
  broken: boolean;
}

type Metric = "trials" | "research";
type View = "map" | "list";
type Order = "intensity" | "alpha";

const METRIC_LABEL: Record<Metric, string> = {
  trials: "Interventional trials",
  research: "Research (last 10 years)",
};

const LEVEL_LABEL: Record<Metric, string[]> = {
  trials: ["none", "1", "2–4", "5–19", "20+"],
  research: ["none", "1–4", "5–49", "50–499", "500+"],
};

function levelOf(cell: LandscapeCell, metric: Metric): number {
  if (cell.broken) return 0;
  if (metric === "trials") {
    if (cell.trials == null) return 0;
    return signalLevel(cell.trials, "trials");
  }
  if (cell.recent == null) return 0;
  return signalLevel(cell.recent, "pubs");
}

function valueOf(cell: LandscapeCell, metric: Metric): number | null {
  return metric === "trials" ? cell.trials : cell.recent;
}

export function LandscapeExplorer({ cells }: { cells: LandscapeCell[] }) {
  const [metric, setMetric] = useState<Metric>("trials");
  const [view, setView] = useState<View>("map");
  const [order, setOrder] = useState<Order>("intensity");
  const [hover, setHover] = useState<number | null>(null);

  const ordered = useMemo(() => {
    const withLevel = cells.map((c) => ({
      c,
      lvl: levelOf(c, metric),
      val: valueOf(c, metric) ?? -1,
    }));
    if (order === "alpha") {
      withLevel.sort((a, b) => a.c.name.localeCompare(b.c.name));
    } else {
      withLevel.sort(
        (a, b) => b.val - a.val || b.lvl - a.lvl || a.c.name.localeCompare(b.c.name)
      );
    }
    return withLevel;
  }, [cells, metric, order]);

  const histogram = useMemo(() => {
    const h = [0, 0, 0, 0, 0];
    let broken = 0;
    let unknown = 0;
    for (const { c } of ordered) {
      if (c.broken) {
        broken += 1;
        continue;
      }
      if (valueOf(c, metric) == null) {
        unknown += 1;
        continue;
      }
      h[levelOf(c, metric)] += 1;
    }
    return { h, broken, unknown };
  }, [ordered, metric]);

  const hovered = hover != null ? ordered[hover]?.c ?? null : null;

  return (
    <div className="mt-8">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Toggle
          label="Colour by"
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          options={[
            { id: "trials", label: "Interventional trials" },
            { id: "research", label: "Research" },
          ]}
        />
        <Toggle
          label="View"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { id: "map", label: "Heat map" },
            { id: "list", label: "List" },
          ]}
        />
        <Toggle
          label="Order"
          value={order}
          onChange={(v) => setOrder(v as Order)}
          options={[
            { id: "intensity", label: "By intensity" },
            { id: "alpha", label: "A–Z" },
          ]}
        />
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <span className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
          {METRIC_LABEL[metric]}
        </span>
        <div className="flex items-center gap-1">
          {SIGNAL_COLORS.map((color, i) => (
            <span key={color} className="flex items-center gap-1">
              <span
                className="inline-block h-3.5 w-3.5 border border-black/10"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              <span className="font-mono text-[10px] text-mute">
                {LEVEL_LABEL[metric][i]}
              </span>
            </span>
          ))}
        </div>
        <span className="font-mono text-[10px] text-mute">
          {histogram.broken > 0
            ? `· ${histogram.broken} broken-query (ringed)`
            : ""}
          {histogram.unknown > 0 ? ` · ${histogram.unknown} fetch failed` : ""}
        </span>
      </div>

      {/* Hover readout — reserved height so layout doesn't jump */}
      <div className="mt-4 min-h-[2.75rem] font-sans text-sm">
        {hovered ? (
          <span className="text-ink">
            <span className="font-serif text-base">{hovered.name}</span>
            <span className="ml-2 font-mono text-xs text-mute">
              ORPHA:{hovered.orphaCode} ·{" "}
              {hovered.trials == null ? "—" : hovered.trials} interventional
              trials ·{" "}
              {hovered.recent == null ? "—" : hovered.recent} papers (10y) ·{" "}
              {hovered.pubs == null ? "—" : hovered.pubs} total ·{" "}
              {hovered.confidence} confidence
              {hovered.broken ? " · broken query (excluded from stats)" : ""}
            </span>
          </span>
        ) : (
          <span className="text-mute">
            Hover or focus a cell for its counts. Click to open the disease.
          </span>
        )}
      </div>

      {view === "map" ? (
        <div
          className="mt-2 flex flex-wrap gap-[5px]"
          onMouseLeave={() => setHover(null)}
        >
          {ordered.map(({ c }, i) => {
            const lvl = levelOf(c, metric);
            const unknown = !c.broken && valueOf(c, metric) == null;
            return (
              <a
                key={c.orphaCode}
                href={`/disease/${c.orphaCode}`}
                data-idx={i}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                aria-label={`${c.name}, ${
                  valueOf(c, metric) ?? "unknown"
                } ${metric === "trials" ? "interventional trials" : "papers in last 10 years"}`}
                title={`${c.name} — ${
                  metric === "trials"
                    ? `${c.trials ?? "—"} interventional trials`
                    : `${c.recent ?? "—"} papers (10y)`
                }`}
                className="h-[28px] w-[28px] rounded-[3px] outline-none transition-transform duration-75 hover:scale-[1.5] hover:shadow focus-visible:scale-[1.5] focus-visible:ring-2 focus-visible:ring-ink"
                style={{
                  backgroundColor: SIGNAL_COLORS[lvl],
                  boxShadow: c.broken
                    ? "inset 0 0 0 2px rgba(190,60,60,0.85)"
                    : unknown
                      ? "inset 0 0 0 1px rgba(0,0,0,0.35)"
                      : undefined,
                }}
              />
            );
          })}
        </div>
      ) : (
        <ol className="mt-2 divide-y divide-line border-y border-line">
          {ordered.map(({ c }) => {
            const lvl = levelOf(c, metric);
            return (
              <li key={c.orphaCode}>
                <a
                  href={`/disease/${c.orphaCode}`}
                  className="flex items-center gap-4 py-3 hover:bg-sand-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                >
                  <span
                    className="h-4 w-4 shrink-0 rounded-[2px] border border-black/10"
                    style={{ backgroundColor: SIGNAL_COLORS[lvl] }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-base text-ink">
                      {c.name}
                    </span>
                    <span className="font-mono text-xs text-mute">
                      ORPHA:{c.orphaCode} ·{" "}
                      {c.trials == null ? "—" : c.trials} interventional trials ·{" "}
                      {c.recent == null ? "—" : c.recent} papers (10y) ·{" "}
                      {c.confidence} confidence
                      {c.broken ? " · broken query" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-ink">
                    {valueOf(c, metric) == null ? "—" : valueOf(c, metric)}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
        {label}
      </span>
      <div className="flex overflow-hidden rounded border border-line">
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={active}
              className={`px-3 py-1.5 font-sans text-sm transition-colors ${
                active
                  ? "bg-ink text-ground"
                  : "bg-ground text-mute hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
