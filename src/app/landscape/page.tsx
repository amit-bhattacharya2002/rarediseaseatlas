import type { Metadata } from "next";
import { LandscapeExplorer } from "@/components/LandscapeExplorer";
import { getAggregate, getLandscapeCells } from "@/lib/data";

export const metadata: Metadata = {
  title: "The rare disease landscape",
  description:
    "Every rare disease in this build as a mark — scatter, tiles, dual channel, barcode, bands, groups, or list — coloured by trials or recent papers.",
  alternates: { canonical: "/landscape" },
};

export default function LandscapePage() {
  const cells = getLandscapeCells();
  const aggregate = getAggregate();

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="font-serif text-display-sm text-ink">
        This build, one mark each
      </h1>
      <p className="mt-5 max-w-2xl font-sans text-lede text-mute">
        Every disease in the published artifact is a single mark. Toggle how
        they are arranged — scatter of papers vs trials, heat tiles, dual
        channel, barcode, intensity bands, Orphanet groups, or a list. Colour
        shows how much is happening under the same query rules for every
        condition.
      </p>

      <aside className="mt-8 max-w-2xl border border-line bg-sand-50/50 px-4 py-4 font-sans text-sm leading-relaxed text-mute">
        A pale mark usually means &ldquo;named differently&rdquo; as often as
        &ldquo;neglected&rdquo; — open the disease and read the query before
        drawing conclusions. Marks ringed in red returned nothing on either
        database (broken query) and are excluded from every site-wide statistic.
        Counts come from name and identifier matching and can be wrong.
      </aside>

      <LandscapeExplorer cells={cells} />

      <p className="mt-10 font-sans text-sm leading-relaxed text-mute">
        Corpus: {aggregate.totalDiseases.toLocaleString("en")} records ·{" "}
        {aggregate.trialsDenominator.toLocaleString("en")} with usable trial
        matching · {aggregate.noTrials.toLocaleString("en")} with no
        interventional trial · {aggregate.brokenQueryRows.toLocaleString("en")}{" "}
        broken queries excluded.
      </p>
    </div>
  );
}
