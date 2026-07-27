import { UMBRELLA_ORGS } from "@/lib/data";

export function DiseaseSupport() {
  return (
    <section
      id="support"
      className="mt-10 scroll-mt-16 border border-line px-5 py-6"
    >
      <h2 className="font-serif text-title text-ink">Where to find support</h2>
      <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
        We do not yet link condition-specific patient organisations. These
        umbrella groups support undiagnosed and ultra-rare families:
      </p>
      <ul className="mt-3 space-y-2">
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
