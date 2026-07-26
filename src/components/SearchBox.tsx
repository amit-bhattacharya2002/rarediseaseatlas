"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { SignalGlyph } from "./SignalGlyph";
import type { SearchIndexEntry } from "@/lib/types";

interface SearchBoxProps {
  diseases: SearchIndexEntry[];
  autoFocus?: boolean;
  inputId?: string;
}

export function SearchBox({
  diseases,
  autoFocus = false,
  inputId = "disease-search",
}: SearchBoxProps) {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    if (needle.length < 2) return [];
    return diseases
      .filter((d) => {
        if (d.name.toLowerCase().includes(needle)) return true;
        if (d.orphaCode.includes(needle.replace(/^orpha:?/i, ""))) return true;
        return d.synonyms.some((s) => s.toLowerCase().includes(needle));
      })
      .slice(0, 12);
  }, [deferred, diseases]);

  return (
    <div className="w-full">
      <label htmlFor={inputId} className="sr-only">
        Search rare diseases
      </label>
      <input
        id={inputId}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, synonym, or ORPHA code…"
        className="w-full border border-line bg-ground px-4 py-3 font-sans text-base text-ink placeholder:text-mute/70 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        autoComplete="off"
        autoFocus={autoFocus}
        spellCheck={false}
      />
      {deferred.trim().length >= 2 && (
        <ul className="mt-2 divide-y divide-line border border-line bg-ground">
          {results.length === 0 && (
            <li className="px-4 py-3 font-sans text-sm text-mute">No matches.</li>
          )}
          {results.map((d) => (
            <li key={d.orphaCode}>
              <Link
                href={`/disease/${d.orphaCode}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
              >
                <SignalGlyph
                  publications={d.publications}
                  researchers={d.researchers}
                  trials={d.trials}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-ink">{d.name}</span>
                  <span className="font-mono text-xs text-mute">
                    ORPHA:{d.orphaCode}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
