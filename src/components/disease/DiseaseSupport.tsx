import { UMBRELLA_ORGS } from "@/lib/data";

export function DiseaseSupport({
  orphaCode,
  name,
}: {
  orphaCode: string;
  name: string;
}) {
  const orphanetSupportUrl = `https://www.orpha.net/en/disease/detail/${encodeURIComponent(orphaCode)}`;

  return (
    <section
      id="support"
      className="mt-10 scroll-mt-16 border border-line px-5 py-6"
    >
      <h2 className="font-serif text-title text-ink">Where to find support</h2>
      <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
        Condition-specific patient organisations, when Orphanet lists them, are
        on the disease&rsquo;s Orphanet page. We also link umbrella groups that
        support undiagnosed and ultra-rare families.
      </p>
      <p className="mt-4 font-sans text-sm text-ink">
        <a
          href={orphanetSupportUrl}
          className="underline decoration-line underline-offset-2 hover:opacity-80"
          target="_blank"
          rel="noopener noreferrer"
        >
          Orphanet entry for {name}
        </a>
        <span className="text-mute">
          {" "}
          — check Associations / patient organisations on that page.
        </span>
      </p>
      <ul className="mt-4 space-y-2">
        {UMBRELLA_ORGS.map((o) => (
          <li key={o.url}>
            <a
              href={o.url}
              className="font-sans text-sm underline decoration-line underline-offset-2 hover:text-ink"
              target="_blank"
              rel="noopener noreferrer"
            >
              {o.name}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
