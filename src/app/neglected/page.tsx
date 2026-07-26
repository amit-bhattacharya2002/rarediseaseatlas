import type { Metadata } from "next";
import Link from "next/link";
import { SignalGlyph } from "@/components/SignalGlyph";
import { getNeglectedDiseases } from "@/lib/data";
import { diseaseSignals } from "@/lib/signals";

export const metadata: Metadata = {
  title: "Where research attention is thinnest",
  description:
    "Rare diseases ranked by weakest research signals — a view for researchers and funders, not a ranking of patients or prognosis.",
  alternates: { canonical: "/neglected" },
};

export default function NeglectedPage() {
  const diseases = getNeglectedDiseases(80);

  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="font-serif text-display-sm text-ink">
        Where research attention is thinnest
      </h1>
      <p className="mt-5 max-w-2xl font-sans text-lede text-mute">
        A ranking of research attention — publications, researchers, and
        interventional trials — not of patients, severity, or prognosis.
        Intended for researchers and funders scanning for gaps.
      </p>
      <aside className="mt-8 max-w-2xl border border-line bg-sand-50/50 px-4 py-4 font-sans text-sm leading-relaxed text-mute">
        Absent data may reflect naming and indexing gaps rather than genuine
        absence of work. Conditions with low name-matching confidence are
        especially likely to be mis-counted. Always open the disease page and
        inspect the query before acting on a row.
      </aside>

      <ol className="mt-12 divide-y divide-line border-y border-line">
        {diseases.map((d, i) => {
          const s = diseaseSignals(d);
          return (
            <li key={d.orphaCode}>
              <Link
                href={`/disease/${d.orphaCode}`}
                className="flex items-center gap-4 py-4 hover:bg-sand-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
              >
                <span className="w-8 shrink-0 font-mono text-sm text-mute tabular-nums">
                  {i + 1}
                </span>
                <SignalGlyph
                  publications={s.publications}
                  researchers={s.researchers}
                  trials={s.trials}
                  size="sm"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-serif text-lg text-ink">
                    {d.name}
                  </span>
                  <span className="font-mono text-xs text-mute">
                    ORPHA:{d.orphaCode} ·{" "}
                    {d.publications.total == null ? "—" : d.publications.total}{" "}
                    pubs ·{" "}
                    {d.trials.total == null ? "—" : d.trials.total} interventional
                    trials ·{" "}
                    {d.confidence} confidence
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
