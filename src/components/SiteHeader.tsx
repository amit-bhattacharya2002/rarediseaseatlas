import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-ground/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink sm:gap-3"
        >
          <Image
            src="/RDRA.png"
            alt=""
            width={498}
            height={509}
            priority
            className="size-10 shrink-0 object-contain group-hover:opacity-80 sm:size-11"
          />
          <span className="flex flex-col font-montserrat text-sm font-normal tracking-tight text-ink group-hover:opacity-80 sm:text-base" style={{ lineHeight: '1.1' }}>
            <span>RARE DISEASE</span>
            <span>RESEARCH ATLAS</span>
          </span>
     
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/search"
            aria-label="Search rare diseases"
            title="Search rare diseases"
            className="inline-flex size-11 items-center justify-center text-ink hover:bg-sand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" strokeLinecap="round" />
            </svg>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-5 font-sans text-sm text-mute md:flex"
          >
            <Link
              href="/landscape"
              className="hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Landscape
            </Link>
            <Link
              href="/neglected"
              className="hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Thin attention
            </Link>
            <Link
              href="/findings"
              className="hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Findings
            </Link>
            <Link
              href="/glossary"
              className="hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              Glossary
            </Link>
            <Link
              href="/about"
              className="hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              About
            </Link>
          </nav>

          <details className="group relative md:hidden">
            <summary
              className="flex size-11 cursor-pointer list-none items-center justify-center border border-line text-ink hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden"
              title="Open navigation menu"
            >
              <span className="sr-only">Open navigation menu</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </summary>
            <nav
              aria-label="Mobile navigation"
              className="absolute right-0 top-full z-40 mt-2 flex min-w-44 flex-col border border-line bg-ground p-2 shadow-lg"
            >
              <Link
                href="/landscape"
                className="min-h-11 px-3 py-3 font-sans text-sm text-mute hover:bg-sand-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
              >
                Landscape
              </Link>
              <Link
                href="/neglected"
                className="min-h-11 px-3 py-3 font-sans text-sm text-mute hover:bg-sand-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
              >
                Thin attention
              </Link>
              <Link
                href="/findings"
                className="min-h-11 px-3 py-3 font-sans text-sm text-mute hover:bg-sand-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
              >
                Findings
              </Link>
              <Link
                href="/glossary"
                className="min-h-11 px-3 py-3 font-sans text-sm text-mute hover:bg-sand-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
              >
                Glossary
              </Link>
              <Link
                href="/about"
                className="min-h-11 px-3 py-3 font-sans text-sm text-mute hover:bg-sand-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
              >
                About
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
