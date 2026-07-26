"use client";

import { Fragment, useMemo, useState } from "react";
import { GLOSSARY, GLOSSARY_TERMS } from "@/lib/glossary";

type Segment =
  | { type: "text"; value: string }
  | { type: "term"; value: string; gloss: string };

function segmentText(text: string): Segment[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits: { start: number; end: number; term: string }[] = [];

  for (const term of GLOSSARY_TERMS) {
    const t = term.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(t, from);
      if (idx === -1) break;
      const before = idx === 0 ? " " : lower[idx - 1];
      const after =
        idx + t.length >= lower.length ? " " : lower[idx + t.length];
      const boundary = /[^a-z0-9]/;
      if (boundary.test(before) && boundary.test(after)) {
        const overlaps = hits.some(
          (h) => idx < h.end && idx + t.length > h.start
        );
        if (!overlaps) {
          hits.push({ start: idx, end: idx + t.length, term });
        }
      }
      from = idx + t.length;
    }
  }

  hits.sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const h of hits) {
    if (h.start > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, h.start) });
    }
    segments.push({
      type: "term",
      value: text.slice(h.start, h.end),
      gloss: GLOSSARY[h.term],
    });
    cursor = h.end;
  }
  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) });
  }
  return segments;
}

function TermChip({ value, gloss }: { value: string; gloss: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline">
      <button
        type="button"
        className="border-b border-dotted border-ink/40 text-ink hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {value}
      </button>
      {open && (
        <span
          role="note"
          className="absolute left-0 top-full z-10 mt-1 w-56 border border-line bg-ground px-3 py-2 font-sans text-xs leading-relaxed text-mute shadow-sm"
        >
          {gloss}
        </span>
      )}
    </span>
  );
}

export function GlossaryText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const segments = useMemo(() => segmentText(text), [text]);
  return (
    <span className={className}>
      {segments.map((s, i) =>
        s.type === "text" ? (
          <Fragment key={i}>{s.value}</Fragment>
        ) : (
          <TermChip key={i} value={s.value} gloss={s.gloss} />
        )
      )}
    </span>
  );
}
