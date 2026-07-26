import type { Metadata } from "next";
import { LandscapeExplorer } from "@/components/LandscapeExplorer";
import { getAggregate, getLandscapeCells } from "@/lib/data";

export const metadata: Metadata = {
  title: "The rare disease landscape",
  description:
    "Every rare disease in this build as one cell, coloured by how many interventional trials or recent papers it has — with a sortable list toggle.",
  alternates: { canonical: "/landscape" },
};

export default function LandscapePage() {
  const cells = getLandscapeCells();
  const aggregate = getAggregate();

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="font-serif text-display-sm text-ink">
        This build, one cell each
      </h1>
      <p className="mt-5 max-w-2xl font-sans text-lede text-mute">
        Every disease in the published artifact is a single square. The colour
        shows how much is happening — interventional trials testing treatments,
        or research in the last ten years. The point Google structurally cannot
        make: how one condition compares to the others in the same build,
        because they were all queried the same way.
      </p>

      <aside className="mt-8 max-w-2xl border border-line bg-sand-50/50 px-4 py-4 font-sans text-sm leading-relaxed text-mute">
        A pale square usually means &ldquo;named differently&rdquo; as often as
        &ldquo;neglected&rdquo; — open the disease and read the query before
        drawing conclusions. Squares ringed in red returned nothing on either
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
