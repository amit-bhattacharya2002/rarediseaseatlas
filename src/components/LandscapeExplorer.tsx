"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return coarse;
}

export function LandscapeExplorer({ cells }: { cells: LandscapeCell[] }) {
  const coarse = useCoarsePointer();
  const [metric, setMetric] = useState<Metric>("trials");
  const [view, setView] = useState<View>("map");
  const [order, setOrder] = useState<Order>("intensity");
  const [active, setActive] = useState<number | null>(null);

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
        (a, b) =>
          b.val - a.val || b.lvl - a.lvl || a.c.name.localeCompare(b.c.name)
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

  // Reset selection when the ordering/metric changes so indices stay valid.
  useEffect(() => {
    setActive(null);
  }, [metric, order, view]);

  const selected = active != null ? ordered[active]?.c ?? null : null;

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3">
        <Toggle
          label="Colour by"
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          options={[
            { id: "trials", label: "Trials" },
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
            { id: "intensity", label: "Intensity" },
            { id: "alpha", label: "A–Z" },
          ]}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <span className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
          {METRIC_LABEL[metric]}
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {SIGNAL_COLORS.map((color, i) => (
            <span key={color} className="flex items-center gap-1">
              <span
                className="inline-block size-3.5 border border-black/10 sm:size-3.5"
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

      <div className="mt-4 min-h-[4.5rem] rounded border border-line bg-sand-50/40 px-3 py-3 font-sans text-sm sm:min-h-[2.75rem] sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        {selected ? (
          <div className="flex flex-col gap-2 sm:block">
            <div className="text-ink">
              <span className="font-serif text-base leading-snug">
                {selected.name}
              </span>
              <span className="mt-1 block font-mono text-xs text-mute sm:ml-2 sm:mt-0 sm:inline">
                ORPHA:{selected.orphaCode} ·{" "}
                {selected.trials == null ? "—" : selected.trials} interventional
                trials · {selected.recent == null ? "—" : selected.recent}{" "}
                papers (10y) · {selected.pubs == null ? "—" : selected.pubs}{" "}
                total · {selected.confidence} confidence
                {selected.broken ? " · broken query (excluded from stats)" : ""}
              </span>
            </div>
            <Link
              href={`/disease/${selected.orphaCode}`}
              className="inline-flex min-h-11 items-center justify-center border border-ink px-4 font-sans text-sm text-ink hover:bg-ink hover:text-ground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:min-h-0 sm:border-0 sm:px-0 sm:underline sm:decoration-line sm:underline-offset-2 sm:hover:bg-transparent sm:hover:text-ink"
            >
              Open disease page
            </Link>
          </div>
        ) : (
          <span className="text-mute">
            {coarse
              ? "Tap a cell to see its counts, then open the disease page."
              : "Hover or focus a cell for its counts. Click to open the disease."}
          </span>
        )}
      </div>

      {view === "map" ? (
        <div
          className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(1.125rem,1fr))] gap-1 p-0.5 sm:grid-cols-[repeat(auto-fill,minmax(1.5rem,1fr))] sm:gap-1.5"
          onMouseLeave={() => {
            if (!coarse) setActive(null);
          }}
        >
          {ordered.map(({ c }, i) => {
            const lvl = levelOf(c, metric);
            const unknown = !c.broken && valueOf(c, metric) == null;
            const isActive = active === i;
            const label = `${c.name}, ${
              valueOf(c, metric) ?? "unknown"
            } ${
              metric === "trials"
                ? "interventional trials"
                : "papers in last 10 years"
            }`;

            if (coarse) {
              return (
                <button
                  key={c.orphaCode}
                  type="button"
                  data-idx={i}
                  onClick={() => setActive(i)}
                  aria-label={label}
                  aria-pressed={isActive}
                  className={`aspect-square min-h-[1.125rem] w-full rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 ${
                    isActive ? "ring-2 ring-ink ring-offset-1" : ""
                  }`}
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
            }

            return (
              <a
                key={c.orphaCode}
                href={`/disease/${c.orphaCode}`}
                data-idx={i}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                aria-label={label}
                title={`${c.name} — ${
                  metric === "trials"
                    ? `${c.trials ?? "—"} interventional trials`
                    : `${c.recent ?? "—"} papers (10y)`
                }`}
                className="aspect-square min-h-[1.5rem] w-full rounded-[3px] outline-none transition-transform duration-75 hover:z-10 hover:scale-125 hover:shadow focus-visible:z-10 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-ink"
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
                  className="flex min-h-14 items-center gap-3 py-3 sm:gap-4 hover:bg-sand-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                >
                  <span
                    className="size-4 shrink-0 rounded-[2px] border border-black/10"
                    style={{ backgroundColor: SIGNAL_COLORS[lvl] }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-base leading-snug text-ink sm:truncate">
                      {c.name}
                    </span>
                    <span className="font-mono text-xs text-mute">
                      ORPHA:{c.orphaCode} ·{" "}
                      {c.trials == null ? "—" : c.trials} interventional
                      trials · {c.recent == null ? "—" : c.recent} papers (10y)
                      · {c.confidence} confidence
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
    <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <span className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
        {label}
      </span>
      <div className="flex w-full overflow-hidden rounded border border-line sm:w-auto">
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={active}
              className={`min-h-11 flex-1 px-3 py-2 font-sans text-sm transition-colors sm:min-h-0 sm:flex-none sm:py-1.5 ${
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
