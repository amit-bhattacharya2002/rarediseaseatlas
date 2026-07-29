"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
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
  disorderGroup: string | null;
}

type Metric = "trials" | "research";
type View =
  | "scatter"
  | "map"
  | "dual"
  | "barcode"
  | "swarm"
  | "groups"
  | "list";
type Order = "intensity" | "alpha";

const METRIC_LABEL: Record<Metric, string> = {
  trials: "Interventional trials",
  research: "Research (last 10 years)",
};

const LEVEL_LABEL: Record<Metric, string[]> = {
  trials: ["none", "1", "2–4", "5–19", "20+"],
  research: ["none", "1–4", "5–49", "50–499", "500+"],
};

const VIEW_OPTIONS: { id: View; label: string }[] = [
  { id: "scatter", label: "Scatter" },
  { id: "map", label: "Tiles" },
  { id: "dual", label: "Dual" },
  { id: "barcode", label: "Barcode" },
  { id: "swarm", label: "Bands" },
  { id: "groups", label: "Groups" },
  { id: "list", label: "List" },
];

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

function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
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

function dualFill(trialsLvl: number, researchLvl: number): string {
  const base = SIGNAL_COLORS[trialsLvl];
  if (researchLvl <= 0) return base;
  const step = Math.max(3, 10 - researchLvl * 1.5);
  return `repeating-linear-gradient(135deg, ${base} 0 ${step}px, rgba(255,255,255,0.22) ${step}px ${step + 1.5}px)`;
}

export function LandscapeExplorer({ cells }: { cells: LandscapeCell[] }) {
  const coarse = useCoarsePointer();
  const [metric, setMetric] = useState<Metric>("trials");
  const [view, setView] = useState<View>("scatter");
  const [order, setOrder] = useState<Order>("intensity");
  const [activeCode, setActiveCode] = useState<string | null>(null);

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

  const byCode = useMemo(() => {
    const m = new Map<string, LandscapeCell>();
    for (const c of cells) m.set(c.orphaCode, c);
    return m;
  }, [cells]);

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

  const scatterBounds = useMemo(() => {
    let maxX = 1;
    let maxY = 1;
    for (const c of cells) {
      maxX = Math.max(maxX, 1 + (c.recent ?? 0));
      maxY = Math.max(maxY, 1 + (c.trials ?? 0));
    }
    return {
      maxX: Math.log10(maxX),
      maxY: Math.log10(maxY),
    };
  }, [cells]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof ordered>();
    for (const row of ordered) {
      const key = row.c.disorderGroup?.trim() || "Ungrouped";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
    );
  }, [ordered]);

  useEffect(() => {
    setActiveCode(null);
  }, [metric, order, view]);

  const selected = activeCode ? byCode.get(activeCode) ?? null : null;
  const showMobileDock = Boolean(coarse && selected && view !== "list");
  const showColourBy = view === "map" || view === "barcode" || view === "swarm" || view === "groups" || view === "list";
  const showOrder =
    view === "map" ||
    view === "dual" ||
    view === "barcode" ||
    view === "groups" ||
    view === "list";

  const selectCell = (code: string) => setActiveCode(code);
  const clearIfFine = () => {
    if (!coarse) setActiveCode(null);
  };

  return (
    <div className={`mt-8 ${showMobileDock ? "pb-36" : ""}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3">
        <Toggle
          label="View"
          value={view}
          onChange={(v) => setView(v as View)}
          options={VIEW_OPTIONS}
          wrap
        />
        {showColourBy ? (
          <Toggle
            label="Colour by"
            value={metric}
            onChange={(v) => setMetric(v as Metric)}
            options={[
              { id: "trials", label: "Trials" },
              { id: "research", label: "Research" },
            ]}
          />
        ) : null}
        {showOrder ? (
          <Toggle
            label="Order"
            value={order}
            onChange={(v) => setOrder(v as Order)}
            options={[
              { id: "intensity", label: "Intensity" },
              { id: "alpha", label: "A–Z" },
            ]}
          />
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        {view === "scatter" ? (
          <span className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
            Papers (10y) → · Trials ↑ · log scales
          </span>
        ) : view === "dual" ? (
          <>
            <span className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
              Colour = trials · hatch = research
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {SIGNAL_COLORS.map((color, i) => (
                <span key={color} className="flex items-center gap-1">
                  <span
                    className="inline-block size-3.5 border border-black/10"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="font-mono text-[10px] text-mute">
                    {LEVEL_LABEL.trials[i]}
                  </span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
              {METRIC_LABEL[metric]}
            </span>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {SIGNAL_COLORS.map((color, i) => (
                <span key={color} className="flex items-center gap-1">
                  <span
                    className="inline-block size-3.5 border border-black/10"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="font-mono text-[10px] text-mute">
                    {LEVEL_LABEL[metric][i]}
                  </span>
                </span>
              ))}
            </div>
          </>
        )}
        <span className="font-mono text-[10px] text-mute">
          {histogram.broken > 0
            ? `· ${histogram.broken} broken-query (ringed)`
            : ""}
          {histogram.unknown > 0 ? ` · ${histogram.unknown} fetch failed` : ""}
        </span>
      </div>

      {!coarse ? (
        <div className="sticky top-16 z-30 mt-4 border-y border-line bg-ground/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-ground/90">
          <div className="min-h-[2.75rem] font-sans text-sm">
            {selected ? (
              <SelectionCopy cell={selected} />
            ) : (
              <span className="text-mute">
                {view === "list"
                  ? "Browse the list, or switch views for a spatial landscape."
                  : "Hover a mark for its counts. Click to open the disease."}
              </span>
            )}
          </div>
        </div>
      ) : view !== "list" && !selected ? (
        <p className="mt-4 font-sans text-sm text-mute">
          Tap a mark — details stay pinned at the bottom so you can open the page
          without scrolling back up.
        </p>
      ) : null}

      {view === "scatter" ? (
        <ScatterView
          cells={cells}
          bounds={scatterBounds}
          activeCode={activeCode}
          coarse={coarse}
          onSelect={selectCell}
          onLeave={clearIfFine}
        />
      ) : null}

      {view === "map" || view === "dual" ? (
        <TileGrid
          rows={ordered}
          metric={metric}
          dual={view === "dual"}
          activeCode={activeCode}
          coarse={coarse}
          onSelect={selectCell}
          onLeave={clearIfFine}
        />
      ) : null}

      {view === "barcode" ? (
        <BarcodeView
          rows={ordered}
          metric={metric}
          activeCode={activeCode}
          coarse={coarse}
          onSelect={selectCell}
          onLeave={clearIfFine}
        />
      ) : null}

      {view === "swarm" ? (
        <BeeswarmView
          cells={cells}
          metric={metric}
          activeCode={activeCode}
          coarse={coarse}
          onSelect={selectCell}
          onLeave={clearIfFine}
        />
      ) : null}

      {view === "groups" ? (
        <GroupsView
          grouped={grouped}
          metric={metric}
          activeCode={activeCode}
          coarse={coarse}
          onSelect={selectCell}
          onLeave={clearIfFine}
        />
      ) : null}

      {view === "list" ? (
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
                      {c.trials == null ? "—" : c.trials} interventional trials
                      · {c.recent == null ? "—" : c.recent} papers (10y) ·{" "}
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
      ) : null}

      {showMobileDock && selected ? (
        <MobileDock cell={selected} onDismiss={() => setActiveCode(null)} />
      ) : null}
    </div>
  );
}

function SelectionCopy({ cell }: { cell: LandscapeCell }) {
  return (
    <div className="text-ink">
      <span className="font-serif text-base leading-snug">{cell.name}</span>
      <span className="mt-1 block font-mono text-xs text-mute sm:mt-0 sm:ml-2 sm:inline">
        ORPHA:{cell.orphaCode} · {cell.trials == null ? "—" : cell.trials}{" "}
        interventional trials · {cell.recent == null ? "—" : cell.recent} papers
        (10y) · {cell.pubs == null ? "—" : cell.pubs} total · {cell.confidence}{" "}
        confidence
        {cell.broken ? " · broken query (excluded from stats)" : ""}
      </span>
      <Link
        href={`/disease/${cell.orphaCode}`}
        className="mt-1 inline-block underline decoration-line underline-offset-2 sm:ml-2 sm:mt-0"
      >
        Open disease page
      </Link>
    </div>
  );
}

function MobileDock({
  cell,
  onDismiss,
}: {
  cell: LandscapeCell;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink bg-ground px-4 pt-3 shadow-[0_-10px_28px_rgba(28,25,23,0.08)]"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        <div className="min-w-0">
          <p className="font-serif text-base leading-snug text-ink">{cell.name}</p>
          <p className="mt-1 font-mono text-xs text-mute">
            ORPHA:{cell.orphaCode} · {cell.trials == null ? "—" : cell.trials}{" "}
            interventional trials · {cell.recent == null ? "—" : cell.recent}{" "}
            papers (10y)
            {cell.broken ? " · broken query" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/disease/${cell.orphaCode}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center bg-ink px-4 font-sans text-sm text-ground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Open disease page
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 shrink-0 items-center justify-center border border-line px-4 font-sans text-sm text-mute focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

function TileGrid({
  rows,
  metric,
  dual,
  activeCode,
  coarse,
  onSelect,
  onLeave,
}: {
  rows: Array<{ c: LandscapeCell; lvl: number }>;
  metric: Metric;
  dual: boolean;
  activeCode: string | null;
  coarse: boolean;
  onSelect: (code: string) => void;
  onLeave: () => void;
}) {
  return (
    <div
      className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(1.125rem,1fr))] gap-1 p-0.5 sm:grid-cols-[repeat(auto-fill,minmax(1.5rem,1fr))] sm:gap-1.5"
      onMouseLeave={onLeave}
    >
      {rows.map(({ c }) => {
        const trialsLvl = levelOf(c, "trials");
        const researchLvl = levelOf(c, "research");
        const lvl = dual ? trialsLvl : levelOf(c, metric);
        const unknown = !c.broken && valueOf(c, metric) == null;
        const isActive = activeCode === c.orphaCode;
        const label = `${c.name}, ${c.trials ?? "unknown"} trials, ${c.recent ?? "unknown"} papers (10y)`;
        const style = dual
          ? {
              backgroundImage: dualFill(trialsLvl, researchLvl),
              backgroundColor: SIGNAL_COLORS[trialsLvl],
              boxShadow: c.broken
                ? "inset 0 0 0 2px rgba(190,60,60,0.85)"
                : undefined,
            }
          : {
              backgroundColor: SIGNAL_COLORS[lvl],
              boxShadow: c.broken
                ? "inset 0 0 0 2px rgba(190,60,60,0.85)"
                : unknown
                  ? "inset 0 0 0 1px rgba(0,0,0,0.35)"
                  : undefined,
            };

        if (coarse) {
          return (
            <button
              key={c.orphaCode}
              type="button"
              onClick={() => onSelect(c.orphaCode)}
              aria-label={label}
              aria-pressed={isActive}
              className={`aspect-square min-h-[1.125rem] w-full rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 ${
                isActive ? "ring-2 ring-ink ring-offset-1" : ""
              }`}
              style={style}
            />
          );
        }

        return (
          <a
            key={c.orphaCode}
            href={`/disease/${c.orphaCode}`}
            onMouseEnter={() => onSelect(c.orphaCode)}
            onFocus={() => onSelect(c.orphaCode)}
            aria-label={label}
            className="aspect-square min-h-[1.5rem] w-full rounded-[3px] outline-none transition-transform duration-75 hover:z-10 hover:scale-125 hover:shadow focus-visible:z-10 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-ink"
            style={style}
          />
        );
      })}
    </div>
  );
}

function niceCountTicks(logMin: number, logMax: number): number[] {
  const base = [
    0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 20_000,
    50_000, 100_000, 200_000, 500_000, 1_000_000,
  ];
  const inRange = (c: number) => {
    const L = Math.log10(1 + c);
    return L >= logMin - 1e-6 && L <= logMax + 1e-6;
  };
  let ticks = base.filter(inRange);
  // When zoomed between coarse steps, densify so the grid keeps labels.
  if (ticks.length < 4) {
    const lo = Math.max(0, Math.ceil(10 ** logMin - 1));
    const hi = Math.floor(10 ** logMax - 1);
    const span = Math.max(hi - lo, 1);
    const rough = span / 5;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const stepCandidates = [1, 2, 5, 10].map((m) => m * mag);
    const step =
      stepCandidates.find((s) => span / s <= 8) ??
      stepCandidates[stepCandidates.length - 1];
    const denser: number[] = [];
    const start = Math.ceil(lo / step) * step;
    for (let c = start; c <= hi; c += step) {
      if (inRange(c)) denser.push(c);
    }
    if (inRange(0)) denser.unshift(0);
    ticks = Array.from(new Set(denser)).sort((a, b) => a - b);
  }
  return ticks;
}

function formatTickCount(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1000) return `${n / 1000}k`;
  return String(n);
}

type ScatterViewport = { x0: number; x1: number; y0: number; y1: number };

function clampViewport(
  vp: ScatterViewport,
  full: ScatterViewport
): ScatterViewport {
  const minSpanX = (full.x1 - full.x0) / 12;
  const minSpanY = (full.y1 - full.y0) / 12;
  let { x0, x1, y0, y1 } = vp;
  if (x1 - x0 < minSpanX) {
    const mid = (x0 + x1) / 2;
    x0 = mid - minSpanX / 2;
    x1 = mid + minSpanX / 2;
  }
  if (y1 - y0 < minSpanY) {
    const mid = (y0 + y1) / 2;
    y0 = mid - minSpanY / 2;
    y1 = mid + minSpanY / 2;
  }
  if (x1 - x0 > full.x1 - full.x0) {
    x0 = full.x0;
    x1 = full.x1;
  }
  if (y1 - y0 > full.y1 - full.y0) {
    y0 = full.y0;
    y1 = full.y1;
  }
  if (x0 < full.x0) {
    x1 += full.x0 - x0;
    x0 = full.x0;
  }
  if (x1 > full.x1) {
    x0 -= x1 - full.x1;
    x1 = full.x1;
  }
  if (y0 < full.y0) {
    y1 += full.y0 - y0;
    y0 = full.y0;
  }
  if (y1 > full.y1) {
    y0 -= y1 - full.y1;
    y1 = full.y1;
  }
  x0 = Math.max(full.x0, x0);
  x1 = Math.min(full.x1, x1);
  y0 = Math.max(full.y0, y0);
  y1 = Math.min(full.y1, y1);
  return { x0, x1, y0, y1 };
}

function ScatterView({
  cells,
  bounds,
  activeCode,
  coarse,
  onSelect,
  onLeave,
}: {
  cells: LandscapeCell[];
  bounds: { maxX: number; maxY: number };
  activeCode: string | null;
  coarse: boolean;
  onSelect: (code: string) => void;
  onLeave: () => void;
}) {
  const W = 1000;
  const H = 560;
  const pad = { l: 56, r: 16, t: 16, b: 48 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const full = useMemo<ScatterViewport>(
    () => ({
      x0: 0,
      x1: Math.max(bounds.maxX, 0.001),
      y0: 0,
      y1: Math.max(bounds.maxY, 0.001),
    }),
    [bounds]
  );

  const [vp, setVp] = useState<ScatterViewport>(full);
  useEffect(() => {
    setVp(full);
  }, [full]);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    vp: ScatterViewport;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const fullRef = useRef(full);
  fullRef.current = full;
  const [dragging, setDragging] = useState(false);

  const dataPoints = useMemo(() => {
    return cells.map((c) => {
      const x = Math.log10(1 + (c.recent ?? 0));
      const y = Math.log10(1 + (c.trials ?? 0));
      const lvl = Math.max(levelOf(c, "trials"), levelOf(c, "research"));
      return { c, x, y, lvl };
    });
  }, [cells]);

  const zoomRatio =
    (full.x1 - full.x0) / Math.max(vp.x1 - vp.x0, 1e-9);
  const isZoomed =
    zoomRatio > 1.02 ||
    vp.x0 > full.x0 + 1e-6 ||
    vp.y0 > full.y0 + 1e-6 ||
    vp.x1 < full.x1 - 1e-6 ||
    vp.y1 < full.y1 - 1e-6;

  const project = (x: number, y: number) => ({
    px: pad.l + ((x - vp.x0) / (vp.x1 - vp.x0)) * innerW,
    py: pad.t + innerH - ((y - vp.y0) / (vp.y1 - vp.y0)) * innerH,
  });

  const visiblePoints = useMemo(() => {
    const marginX = (vp.x1 - vp.x0) * 0.02;
    const marginY = (vp.y1 - vp.y0) * 0.02;
    const spanX = vp.x1 - vp.x0;
    const spanY = vp.y1 - vp.y0;
    return dataPoints
      .filter(
        (p) =>
          p.x >= vp.x0 - marginX &&
          p.x <= vp.x1 + marginX &&
          p.y >= vp.y0 - marginY &&
          p.y <= vp.y1 + marginY
      )
      .map((p) => ({
        ...p,
        px: pad.l + ((p.x - vp.x0) / spanX) * innerW,
        py: pad.t + innerH - ((p.y - vp.y0) / spanY) * innerH,
      }));
  }, [dataPoints, vp, pad.l, pad.t, innerW, innerH]);

  const xTicks = niceCountTicks(vp.x0, vp.x1);
  const yTicks = niceCountTicks(vp.y0, vp.y1);

  const zoomAt = (factor: number, focusX?: number, focusY?: number) => {
    setVp((prev) => {
      const fx =
        focusX ?? (prev.x0 + prev.x1) / 2;
      const fy =
        focusY ?? (prev.y0 + prev.y1) / 2;
      const nextW = (prev.x1 - prev.x0) / factor;
      const nextH = (prev.y1 - prev.y0) / factor;
      const relX = (fx - prev.x0) / (prev.x1 - prev.x0);
      const relY = (fy - prev.y0) / (prev.y1 - prev.y0);
      return clampViewport(
        {
          x0: fx - relX * nextW,
          x1: fx + (1 - relX) * nextW,
          y0: fy - relY * nextH,
          y1: fy + (1 - relY) * nextH,
        },
        full
      );
    });
  };

  const resetView = () => setVp(full);

  // Non-passive wheel so preventDefault actually stops page scroll while zooming.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * W;
      const my = ((e.clientY - rect.top) / rect.height) * H;
      const fx = (mx - pad.l) / innerW;
      const fy = 1 - (my - pad.t) / innerH;
      const cur = vpRef.current;
      const focusX =
        fx >= 0 && fx <= 1 ? cur.x0 + fx * (cur.x1 - cur.x0) : (cur.x0 + cur.x1) / 2;
      const focusY =
        fy >= 0 && fy <= 1 ? cur.y0 + fy * (cur.y1 - cur.y0) : (cur.y0 + cur.y1) / 2;
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const nextW = (cur.x1 - cur.x0) / factor;
      const nextH = (cur.y1 - cur.y0) / factor;
      const relX = (focusX - cur.x0) / (cur.x1 - cur.x0);
      const relY = (focusY - cur.y0) / (cur.y1 - cur.y0);
      setVp(
        clampViewport(
          {
            x0: focusX - relX * nextW,
            x1: focusX + (1 - relX) * nextW,
            y0: focusY - relY * nextH,
            y1: focusY + (1 - relY) * nextH,
          },
          fullRef.current
        )
      );
    };
    svg.addEventListener("wheel", handler, { passive: false });
    return () => svg.removeEventListener("wheel", handler);
  }, [pad.l, pad.t, innerW, innerH]);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      vp: { ...vp },
    };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const dxPx = ((e.clientX - drag.startX) / rect.width) * W;
    const dyPx = ((e.clientY - drag.startY) / rect.height) * H;
    const dxData = -(dxPx / innerW) * (drag.vp.x1 - drag.vp.x0);
    const dyData = (dyPx / innerH) * (drag.vp.y1 - drag.vp.y0);
    setVp(
      clampViewport(
        {
          x0: drag.vp.x0 + dxData,
          x1: drag.vp.x1 + dxData,
          y0: drag.vp.y0 + dyData,
          y1: drag.vp.y1 + dyData,
        },
        full
      )
    );
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      dragRef.current = null;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
  };

  return (
    <div className="mt-3 border border-line bg-sand-50/30">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <p className="font-mono text-[10px] text-mute">
          {Math.round(zoomRatio * 100)}% · scroll zooms the grid · drag pans
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomAt(1 / 1.35)}
            disabled={zoomRatio <= 1.02}
            aria-label="Zoom out"
            className="inline-flex size-9 items-center justify-center border border-line font-sans text-lg text-ink disabled:opacity-40 hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => zoomAt(1.35)}
            disabled={zoomRatio >= 11.5}
            aria-label="Zoom in"
            className="inline-flex size-9 items-center justify-center border border-line font-sans text-lg text-ink disabled:opacity-40 hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            +
          </button>
          <button
            type="button"
            onClick={resetView}
            disabled={!isZoomed}
            className="ml-1 min-h-9 border border-line px-3 font-sans text-xs text-mute disabled:opacity-40 hover:bg-sand-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Reset
          </button>
        </div>
      </div>
      <div className="overflow-x-auto p-2" onMouseLeave={onLeave}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className={`h-auto w-full min-w-[20rem] touch-none ${
            dragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          role="img"
          aria-label="Interactive scatter grid of diseases by recent papers and interventional trials"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <clipPath id="scatter-plot-clip">
              <rect x={pad.l} y={pad.t} width={innerW} height={innerH} />
            </clipPath>
          </defs>

          {/* Plot background */}
          <rect
            x={pad.l}
            y={pad.t}
            width={innerW}
            height={innerH}
            fill="#F7F3EB"
          />

          {/* Interactive grid */}
          <g clipPath="url(#scatter-plot-clip)">
            {xTicks.map((count) => {
              const L = Math.log10(1 + count);
              const { px } = project(L, 0);
              return (
                <line
                  key={`vx-${count}`}
                  x1={px}
                  y1={pad.t}
                  x2={px}
                  y2={pad.t + innerH}
                  stroke="#E4DDCF"
                  strokeWidth="1"
                />
              );
            })}
            {yTicks.map((count) => {
              const L = Math.log10(1 + count);
              const { py } = project(0, L);
              return (
                <line
                  key={`hy-${count}`}
                  x1={pad.l}
                  y1={py}
                  x2={pad.l + innerW}
                  y2={py}
                  stroke="#E4DDCF"
                  strokeWidth="1"
                />
              );
            })}
          </g>

          {/* Axes */}
          <line
            x1={pad.l}
            y1={pad.t + innerH}
            x2={pad.l + innerW}
            y2={pad.t + innerH}
            stroke="#C9BFA8"
            strokeWidth="1.25"
          />
          <line
            x1={pad.l}
            y1={pad.t}
            x2={pad.l}
            y2={pad.t + innerH}
            stroke="#C9BFA8"
            strokeWidth="1.25"
          />

          {/* Tick labels — update with viewport */}
          {xTicks.map((count) => {
            const L = Math.log10(1 + count);
            const { px } = project(L, 0);
            if (px < pad.l - 2 || px > pad.l + innerW + 2) return null;
            return (
              <text
                key={`xl-${count}`}
                x={px}
                y={pad.t + innerH + 16}
                textAnchor="middle"
                fill="#6B6560"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
              >
                {formatTickCount(count)}
              </text>
            );
          })}
          {yTicks.map((count) => {
            const L = Math.log10(1 + count);
            const { py } = project(0, L);
            if (py < pad.t - 2 || py > pad.t + innerH + 2) return null;
            return (
              <text
                key={`yl-${count}`}
                x={pad.l - 8}
                y={py + 3}
                textAnchor="end"
                fill="#6B6560"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
              >
                {formatTickCount(count)}
              </text>
            );
          })}

          <text
            x={pad.l + innerW / 2}
            y={H - 8}
            textAnchor="middle"
            fill="#6B6560"
            fontSize="12"
          >
            Papers in last 10 years →
          </text>
          <text
            x={14}
            y={pad.t + innerH / 2}
            textAnchor="middle"
            fill="#6B6560"
            fontSize="12"
            transform={`rotate(-90 14 ${pad.t + innerH / 2})`}
          >
            Interventional trials →
          </text>

          <g clipPath="url(#scatter-plot-clip)">
            {visiblePoints.map(({ c, px, py, lvl }) => {
              const isActive = activeCode === c.orphaCode;
              const common = {
                cx: px,
                cy: py,
                r: isActive ? 5 : 2.6,
                fill: SIGNAL_COLORS[lvl],
                stroke: c.broken
                  ? "rgba(190,60,60,0.95)"
                  : isActive
                    ? "#1C1917"
                    : "transparent",
                strokeWidth: c.broken || isActive ? 1.5 : 0,
                opacity: c.broken ? 0.85 : 0.8,
              };
              if (coarse) {
                return (
                  <circle
                    key={c.orphaCode}
                    {...common}
                    className="cursor-pointer"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelect(c.orphaCode);
                    }}
                    onPointerDown={(ev) => ev.stopPropagation()}
                  >
                    <title>{c.name}</title>
                  </circle>
                );
              }
              return (
                <a key={c.orphaCode} href={`/disease/${c.orphaCode}`}>
                  <circle
                    {...common}
                    className="cursor-pointer"
                    onMouseEnter={() => onSelect(c.orphaCode)}
                    onFocus={() => onSelect(c.orphaCode)}
                    onPointerDown={(ev) => ev.stopPropagation()}
                  >
                    <title>{c.name}</title>
                  </circle>
                </a>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function BarcodeView({
  rows,
  metric,
  activeCode,
  coarse,
  onSelect,
  onLeave,
}: {
  rows: Array<{ c: LandscapeCell; lvl: number }>;
  metric: Metric;
  activeCode: string | null;
  coarse: boolean;
  onSelect: (code: string) => void;
  onLeave: () => void;
}) {
  return (
    <div
      className="mt-3 flex h-28 w-full overflow-hidden border border-line bg-sand-50/40 sm:h-36"
      onMouseLeave={onLeave}
      role="img"
      aria-label="Barcode of diseases sorted by intensity"
    >
      {rows.map(({ c, lvl }) => {
        const isActive = activeCode === c.orphaCode;
        const style = {
          backgroundColor: SIGNAL_COLORS[lvl],
          boxShadow: c.broken
            ? "inset 0 0 0 1px rgba(190,60,60,0.9)"
            : isActive
              ? "inset 0 0 0 1px #1C1917"
              : undefined,
          flex: "1 1 0",
          minWidth: 0,
        } as const;
        if (coarse) {
          return (
            <button
              key={c.orphaCode}
              type="button"
              aria-label={c.name}
              onClick={() => onSelect(c.orphaCode)}
              className="h-full border-0 p-0 outline-none focus-visible:ring-1 focus-visible:ring-ink"
              style={style}
            />
          );
        }
        return (
          <a
            key={c.orphaCode}
            href={`/disease/${c.orphaCode}`}
            aria-label={c.name}
            title={`${c.name} — ${valueOf(c, metric) ?? "—"}`}
            onMouseEnter={() => onSelect(c.orphaCode)}
            onFocus={() => onSelect(c.orphaCode)}
            className="h-full outline-none focus-visible:ring-1 focus-visible:ring-ink"
            style={style}
          />
        );
      })}
    </div>
  );
}

function BeeswarmView({
  cells,
  metric,
  activeCode,
  coarse,
  onSelect,
  onLeave,
}: {
  cells: LandscapeCell[];
  metric: Metric;
  activeCode: string | null;
  coarse: boolean;
  onSelect: (code: string) => void;
  onLeave: () => void;
}) {
  const W = 1000;
  const rowH = 72;
  const padX = 120;
  const labels = LEVEL_LABEL[metric];

  const lanes = useMemo(() => {
    const buckets: LandscapeCell[][] = [[], [], [], [], []];
    for (const c of cells) {
      buckets[levelOf(c, metric)].push(c);
    }
    return buckets.map((bucket, lvl) => {
      const pts = bucket.map((c, i) => {
        const t = bucket.length <= 1 ? 0.5 : i / (bucket.length - 1);
        const x = padX + t * (W - padX - 24) + (hashUnit(c.orphaCode) - 0.5) * 8;
        const y =
          lvl * rowH +
          rowH / 2 +
          (hashUnit(c.orphaCode + "j") - 0.5) * (rowH * 0.55);
        return { c, x, y };
      });
      return { lvl, pts };
    });
  }, [cells, metric]);

  const H = rowH * 5 + 8;

  return (
    <div className="mt-3 overflow-x-auto border border-line bg-sand-50/30 p-2" onMouseLeave={onLeave}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[22rem]" role="img">
        {lanes.map(({ lvl, pts }) => (
          <g key={lvl}>
            <text
              x={12}
              y={lvl * rowH + rowH / 2 + 4}
              fill="#6B6560"
              fontSize="11"
              fontFamily="ui-monospace, monospace"
            >
              {labels[lvl]}
            </text>
            <line
              x1={padX - 8}
              y1={lvl * rowH + rowH - 0.5}
              x2={W - 8}
              y2={lvl * rowH + rowH - 0.5}
              stroke="#E4DDCF"
              strokeWidth="1"
            />
            {pts.map(({ c, x, y }) => {
              const isActive = activeCode === c.orphaCode;
              const common = {
                cx: x,
                cy: y,
                r: isActive ? 4.5 : 2.2,
                fill: SIGNAL_COLORS[lvl],
                stroke: c.broken
                  ? "rgba(190,60,60,0.95)"
                  : isActive
                    ? "#1C1917"
                    : "transparent",
                strokeWidth: c.broken || isActive ? 1.4 : 0,
                opacity: 0.8,
              };
              if (coarse) {
                return (
                  <circle
                    key={c.orphaCode}
                    {...common}
                    className="cursor-pointer"
                    onClick={() => onSelect(c.orphaCode)}
                  >
                    <title>{c.name}</title>
                  </circle>
                );
              }
              return (
                <a key={c.orphaCode} href={`/disease/${c.orphaCode}`}>
                  <circle
                    {...common}
                    onMouseEnter={() => onSelect(c.orphaCode)}
                    onFocus={() => onSelect(c.orphaCode)}
                  >
                    <title>{c.name}</title>
                  </circle>
                </a>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

function GroupsView({
  grouped,
  metric,
  activeCode,
  coarse,
  onSelect,
  onLeave,
}: {
  grouped: Array<[string, Array<{ c: LandscapeCell; lvl: number }>]>;
  metric: Metric;
  activeCode: string | null;
  coarse: boolean;
  onSelect: (code: string) => void;
  onLeave: () => void;
}) {
  return (
    <div className="mt-3 space-y-8" onMouseLeave={onLeave}>
      {grouped.map(([group, rows]) => (
        <section key={group}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-lg text-ink">{group}</h3>
            <span className="font-mono text-xs text-mute">
              {rows.length.toLocaleString("en")} diseases
            </span>
          </div>
          <TileGrid
            rows={rows}
            metric={metric}
            dual={false}
            activeCode={activeCode}
            coarse={coarse}
            onSelect={onSelect}
            onLeave={() => {}}
          />
        </section>
      ))}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
  options,
  wrap = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  wrap?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <span className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
        {label}
      </span>
      <div
        className={`flex w-full overflow-hidden rounded border border-line ${
          wrap ? "flex-wrap sm:w-auto" : "sm:w-auto"
        }`}
      >
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={active}
              className={`min-h-11 flex-1 px-2.5 py-2 font-sans text-sm transition-colors sm:min-h-0 sm:flex-none sm:px-3 sm:py-1.5 ${
                active
                  ? "bg-ink text-ground"
                  : "bg-ground text-mute hover:text-ink"
              } ${wrap ? "min-w-[4.5rem]" : ""}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
