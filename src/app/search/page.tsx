import type { Metadata } from "next";
import { SearchBox } from "@/components/SearchBox";
import { getSearchIndex } from "@/lib/data";

export const metadata: Metadata = {
  title: "Search rare diseases",
  description:
    "Search rare diseases by preferred name, synonym, or ORPHA code.",
};

export default function SearchPage() {
  const searchIndex = getSearchIndex();

  return (
    <div className="mx-auto min-h-[65vh] max-w-5xl px-5 py-12 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-mute">
        {searchIndex.length.toLocaleString("en")} conditions in this build
      </p>
      <h1 className="mt-3 max-w-2xl font-serif text-display-sm text-ink">
        Find a rare disease
      </h1>
      <p className="mb-7 mt-3 max-w-xl font-sans text-sm leading-relaxed text-mute">
        Search Orphanet preferred names, synonyms, or ORPHA codes.
      </p>
      <SearchBox
        diseases={searchIndex}
        autoFocus
        inputId="rare-disease-search"
      />
    </div>
  );
}
