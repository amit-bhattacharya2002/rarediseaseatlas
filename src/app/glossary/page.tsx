import type { Metadata } from "next";
import Link from "next/link";
import {
  GLOSSARY_CATEGORIES,
  entriesForCategory,
} from "@/lib/glossary";

export const metadata: Metadata = {
  title: "Glossary",
  description:
    "Definitions of measurement terms, data sources, and clinical language used on the Rare Disease Research Atlas.",
  alternates: { canonical: "/glossary" },
};

export default function GlossaryPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="font-serif text-display-sm text-ink">Glossary</h1>
      <p className="mt-5 font-sans text-lede text-mute">
        Plain definitions for words this site uses when talking about trials,
        literature, identifiers, and disease descriptions. For full methods and
        licences, see{" "}
        <Link
          href="/about"
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          About
        </Link>
        .
      </p>

      <nav
        aria-label="Glossary sections"
        className="mt-10 flex flex-wrap gap-x-4 gap-y-2 border-y border-line py-3 font-sans text-xs text-mute"
      >
        {GLOSSARY_CATEGORIES.map((c) => (
          <a
            key={c.id}
            href={`#${c.id}`}
            className="hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {c.title}
          </a>
        ))}
      </nav>

      {GLOSSARY_CATEGORIES.map((category) => {
        const entries = entriesForCategory(category.id);
        return (
          <section
            key={category.id}
            id={category.id}
            className="mt-12 scroll-mt-16"
          >
            <h2 className="font-serif text-title text-ink">{category.title}</h2>
            <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
              {category.blurb}
            </p>
            <dl className="mt-6 divide-y divide-line border-y border-line">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  id={entry.id}
                  className="scroll-mt-20 py-5"
                >
                  <dt className="font-serif text-lg text-ink">{entry.term}</dt>
                  <dd className="mt-2 font-sans text-sm leading-relaxed text-mute">
                    <p>{entry.definition}</p>
                    {entry.detail ? (
                      <p className="mt-2 text-mute/90">{entry.detail}</p>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <p className="mt-14 font-sans text-sm leading-relaxed text-mute">
        Clinical glosses are for reading definitions, not for diagnosis. If
        something still looks wrong on a disease page,{" "}
        <Link
          href="/about#contact"
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          get in touch
        </Link>{" "}
        or open a GitHub issue from that page.
      </p>
    </div>
  );
}
