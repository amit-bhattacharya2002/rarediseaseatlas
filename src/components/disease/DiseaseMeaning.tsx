import { LimitationsNote } from "@/components/LimitationsNote";
import { friendMeaningBlock } from "@/lib/plain-copy";
import type { DiseaseRecord } from "@/lib/types";

export function DiseaseMeaning({ d }: { d: DiseaseRecord }) {
  const friend = friendMeaningBlock(d);
  const zeroPubs = d.publications.total === 0;

  return (
    <section id="meaning" className="scroll-mt-16">
      <aside className="mt-10 border border-ink/15 bg-sand-50/50 px-5 py-6 sm:px-7">
        <h2 className="font-serif text-title text-ink">
          What this research picture means
        </h2>
        <p className="mt-3 max-w-2xl font-sans text-sm leading-relaxed text-ink/90">
          {friend.livingWith}
        </p>
        <h3 className="mt-6 font-sans text-sm font-medium text-ink">
          Potential next steps
        </h3>
        <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-mute">
          {friend.ifYouWantToHelp}
        </p>
      </aside>

      <div className="mt-10">
        <LimitationsNote orphaCode={d.orphaCode} name={d.name} />
      </div>

      {zeroPubs &&
        (d.geneDiseaseValidity.classification === "Definitive" ||
          d.geneDiseaseValidity.classification === "Strong") && (
          <aside className="mt-8 border border-line bg-sand-50/60 px-4 py-4 font-sans text-sm leading-relaxed text-mute">
            No publications matched this name, but GenCC rates the gene–disease
            link as {d.geneDiseaseValidity.classification}
            {d.geneDiseaseValidity.genes.length
              ? ` (${d.geneDiseaseValidity.genes.join(", ")})`
              : ""}
            . Literature likely exists under another disease name — this page is
            excluded from the site-wide neglect count.
          </aside>
        )}
    </section>
  );
}
