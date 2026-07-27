import type { ReactNode } from "react";
import { GlossaryText } from "@/components/GlossaryText";
import { prevalencePlain } from "@/lib/plain-copy";
import type { DiseaseRecord } from "@/lib/types";

function IdChip({
  href,
  children,
}: {
  href?: string | null;
  children: ReactNode;
}) {
  const className =
    "inline-block border border-line px-2 py-0.5 font-mono text-[11px] text-ink hover:bg-sand-50";
  if (href) {
    return (
      <a
        href={href}
        className={className}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    );
  }
  return <span className={className}>{children}</span>;
}

function crossRefChips(d: DiseaseRecord) {
  const chips: { key: string; label: string; href?: string }[] = [];
  const mondo = Array.from(
    new Set([...(d.identifiers?.mondo ?? []), ...(d.mondoIds ?? [])])
  );
  for (const id of mondo) {
    const bare = id.replace(/^MONDO:/i, "");
    chips.push({
      key: `mondo-${id}`,
      label: id.startsWith("MONDO:") ? id : `MONDO:${id}`,
      href: `https://monarchinitiative.org/disease/MONDO:${bare}`,
    });
  }
  for (const id of d.identifiers?.mesh ?? []) {
    chips.push({
      key: `mesh-${id}`,
      label: `MeSH:${id}`,
      href: `https://id.nlm.nih.gov/mesh/${id}.html`,
    });
  }
  for (const id of d.identifiers?.omim ?? []) {
    chips.push({
      key: `omim-${id}`,
      label: `OMIM:${id}`,
      href: `https://omim.org/entry/${id}`,
    });
  }
  for (const id of d.identifiers?.umls ?? []) {
    chips.push({ key: `umls-${id}`, label: `UMLS:${id}` });
  }
  for (const id of d.identifiers?.ncit ?? []) {
    chips.push({ key: `ncit-${id}`, label: `NCIT:${id}` });
  }
  return chips;
}

export function DiseaseOverview({ d }: { d: DiseaseRecord }) {
  const plain = d.plainLanguageDefinition;
  const prevalence = prevalencePlain(d.prevalenceClass);
  const chips = crossRefChips(d);
  const mondoSynonyms = (d.mondoSynonyms ?? []).filter(
    (s) => s && !d.synonyms.includes(s) && s !== d.name
  );

  return (
    <section id="overview" className="scroll-mt-16">
      {(plain || d.definition) && (
        <div className="mt-10 max-w-3xl space-y-5">
          {plain && (
            <div>
              <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
                In plain terms
              </p>
              <p className="mt-2 font-sans text-lede leading-relaxed text-ink">
                <GlossaryText text={plain} />
              </p>
              <p className="mt-2 font-sans text-xs text-mute">
                Machine-generated from the Orphanet definition only — check the
                clinical text below.
              </p>
            </div>
          )}
          {d.definition && (
            <div>
              <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
                Clinical definition (Orphanet)
              </p>
              <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
                <GlossaryText text={d.definition} />
              </p>
            </div>
          )}
        </div>
      )}

      {prevalence && (
        <p className="mt-6 max-w-2xl font-sans text-sm leading-relaxed text-mute">
          <span className="text-ink">How rare: </span>
          {prevalence}
        </p>
      )}

      <p className="mt-3 font-sans text-sm text-mute">
        <a
          href={d.expertLink}
          className="underline decoration-line underline-offset-2 hover:text-ink"
          target="_blank"
          rel="noopener noreferrer"
        >
          Orphanet entry
        </a>
      </p>

      {chips.length > 0 && (
        <div className="mt-6">
          <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
            Cross-references
          </p>
          <p className="mt-1 font-sans text-xs text-mute">
            Joined from Mondo / Orphanet. MeSH labels may enter searches; UMLS /
            OMIM / NCIT are stored for reference.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {chips.map((c) => (
              <li key={c.key}>
                <IdChip href={c.href}>{c.label}</IdChip>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mondoSynonyms.length > 0 && (
        <details className="mt-6 max-w-3xl">
          <summary className="cursor-pointer font-sans text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            Additional Mondo synonyms ({mondoSynonyms.length})
          </summary>
          <p className="mt-2 font-sans text-sm leading-relaxed text-mute">
            {mondoSynonyms.join(" · ")}
          </p>
        </details>
      )}
    </section>
  );
}
