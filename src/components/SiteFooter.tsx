import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-5xl px-5 py-10 font-sans text-sm text-mute">
        <Link
          href="/"
          className="inline-flex items-center gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          <Image
            src="/RDRA.png"
            alt=""
            width={498}
            height={509}
            className="size-11 shrink-0  object-contain opacity-90 sm:size-12"
          />
          <span className="flex flex-col font-montserrat text-sm font-normal tracking-tight text-ink sm:text-base" style={{ lineHeight: '1.1' }}>
            <span>RARE DISEASE</span>
            <span>RESEARCH ATLAS</span>
          </span>
        </Link>
        <p className="mt-6 max-w-2xl leading-relaxed">
          Derived data for research landscape awareness — not medical advice,
          not a diagnosis tool, and not a substitute for clinician judgment.
          Disease names and definitions © Orphanet / INSERM,{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            className="underline decoration-line underline-offset-2 hover:text-ink"
          >
            CC BY 4.0
          </a>
          .
        </p>
        <p className="mt-4 leading-relaxed">
          Author:{" "}
          <a
            href="https://www.linkedin.com/in/amit-bhattacharya-551aa6202/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-line underline-offset-2 hover:text-ink"
          >
            Amit Bhattacharya
          </a>
        </p>
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/about" className="hover:text-ink">
            Methodology & licences
          </Link>
          <Link href="/status" className="hover:text-ink">
            Ingest status
          </Link>
          <a
            href="https://github.com/is-anyone-working-on-this/atlas/issues"
            className="hover:text-ink"
          >
            Report an error
          </a>
        </p>
      </div>
    </footer>
  );
}
