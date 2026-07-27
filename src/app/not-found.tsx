import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Page not found",
  description: `This page is not in the ${SITE_NAME}. Search for a rare disease or return home.`,
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-5 pb-24 pt-14 sm:pt-20">
      <section className="relative overflow-hidden border-t border-ink pt-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 top-0 select-none font-mono text-[clamp(6rem,28vw,14rem)] font-medium leading-none tracking-tight text-sand-100"
        >
          404
        </div>

        <p className="animate-rise relative font-sans text-sm uppercase tracking-[0.14em] text-mute">
          {SITE_NAME}
        </p>
        <h1 className="animate-rise relative mt-4 max-w-2xl font-serif text-display-sm text-ink sm:text-display">
          This page is not on the map.
        </h1>
        <p className="animate-rise relative mt-5 max-w-xl font-serif text-title text-ink [animation-delay:60ms]">
          {SITE_TAGLINE}
        </p>
        <p className="animate-rise relative mt-4 max-w-xl font-sans text-lede text-mute [animation-delay:80ms]">
          The link may be mistyped, outdated, or point to a disease code we do
          not publish. Search the atlas, or start from the landscape of research
          attention.
        </p>

        <div className="animate-rise relative mt-10 flex flex-wrap gap-3 [animation-delay:120ms]">
          <Link
            href="/search"
            className="inline-flex items-center justify-center border border-ink bg-ink px-5 py-3 font-sans text-sm text-ground hover:bg-indigo-signal-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Search rare diseases
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center border border-ink bg-transparent px-5 py-3 font-sans text-sm text-ink hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Back to home
          </Link>
          <Link
            href="/landscape"
            className="inline-flex items-center justify-center border border-line bg-transparent px-5 py-3 font-sans text-sm text-mute hover:border-ink hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Landscape
          </Link>
        </div>
      </section>
    </div>
  );
}
