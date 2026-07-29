import { geneValidityPlain } from "@/lib/plain-copy";
import type { DiseaseRecord } from "@/lib/types";

function monarchUrl(id: string): string | null {
  if (/^MONDO:\d+/i.test(id)) {
    return `https://monarchinitiative.org/disease/${id}`;
  }
  if (/^(MGI|ZFIN|WB|FB|RGD):/i.test(id) || /^NCBITaxon:/i.test(id)) {
    return `https://monarchinitiative.org/genotype/${encodeURIComponent(id)}`;
  }
  if (id.includes(":")) {
    return `https://monarchinitiative.org/search?q=${encodeURIComponent(id)}`;
  }
  return null;
}

export function DiseaseBiology({ d }: { d: DiseaseRecord }) {
  const genePlain = geneValidityPlain(
    d.geneDiseaseValidity.classification,
    d.geneDiseaseValidity.genes
  );
  const monarch = d.monarch;
  const phenotypes = monarch?.phenotypeSample ?? [];
  const models = monarch?.models ?? [];
  const mondoPrimary =
    d.identifiers?.mondo?.[0] ??
    (d.mondoIds?.[0]
      ? d.mondoIds[0].startsWith("MONDO:")
        ? d.mondoIds[0]
        : `MONDO:${d.mondoIds[0]}`
      : null);

  return (
    <section id="biology" className="mt-12 scroll-mt-16 border-t border-line pt-10">
      <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
        Biology
      </p>
      <h2 className="mt-2 font-serif text-title text-ink">Genes and phenotypes</h2>
      <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-mute">
        Gene–disease validity from GenCC, plus phenotypes and animal models joined
        from Monarch Initiative via Mondo ID — not a clinical diagnosis aid.
      </p>

      <div className="mt-8 grid gap-10 sm:grid-cols-2">
        <div>
          <h3 className="font-sans text-sm font-medium text-ink">
            Do we know what causes it?
          </h3>
          <p className="mt-3 font-sans text-lede text-ink">{genePlain.headline}</p>
          <p className="mt-2 font-mono text-xs text-mute">{genePlain.detail}</p>
          {d.geneDiseaseValidity.genes.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {d.geneDiseaseValidity.genes.map((g) => (
                <li key={g}>
                  <a
                    href={`https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(g)}[sym]`}
                    className="inline-block border border-line px-2 py-0.5 font-mono text-xs text-ink hover:bg-sand-50"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {g}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="font-sans text-sm font-medium text-ink">
            Phenotypes (Monarch / HPO)
          </h3>
          {!monarch && d.mydisease && d.mydisease.phenotypeCount > 0 ? (
            <>
              <p className="mt-3 font-mono text-2xl tabular-nums text-ink">
                {d.mydisease.phenotypeCount.toLocaleString("en")}
              </p>
              <p className="mt-1 font-sans text-xs text-mute">
                HPO annotations via MyDisease.info (Monarch not enriched)
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {d.mydisease.phenotypeSample.map((p) => (
                  <li
                    key={p.id}
                    className="border border-line bg-ground px-2 py-1 font-sans text-xs text-ink"
                  >
                    {p.name}
                  </li>
                ))}
              </ul>
            </>
          ) : !monarch ? (
            <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
              Not enriched in this build — Monarch phenotype joins were not run
              for this record.
            </p>
          ) : monarch.phenotypeCount == null ? (
            <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
              Phenotype lookup did not return a usable count for this Mondo ID.
            </p>
          ) : monarch.phenotypeCount === 0 ? (
            <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
              None returned for this Mondo ID. That often means “not linked under
              this ID,” not “no clinical features.”
            </p>
          ) : (
            <>
              <p className="mt-3 font-mono text-2xl tabular-nums text-ink">
                {monarch.phenotypeCount.toLocaleString("en")}
              </p>
              <p className="mt-1 font-sans text-xs text-mute">
                Associated phenotypes
                {mondoPrimary ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={`https://monarchinitiative.org/disease/${mondoPrimary}`}
                      className="underline decoration-line underline-offset-2 hover:text-ink"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {mondoPrimary}
                    </a>
                  </>
                ) : null}
              </p>
              {phenotypes.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {phenotypes.map((p) => (
                    <li
                      key={p}
                      className="border border-line bg-ground px-2 py-1 font-sans text-xs text-ink"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              {monarch.phenotypeCount > phenotypes.length && (
                <p className="mt-3 font-sans text-xs text-mute">
                  Showing {phenotypes.length} of {monarch.phenotypeCount} — open
                  Monarch for the full list.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h3 className="font-sans text-sm font-medium text-ink">
          Animal models (Monarch / Alliance)
        </h3>
        {!monarch ? (
          <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
            Not enriched in this build.
          </p>
        ) : models.length === 0 ? (
          <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
            None returned for this Mondo ID. Empty here is not proof that no
            model organism work exists under another name or gene.
          </p>
        ) : (
          <>
            <p className="mt-3 font-mono text-2xl tabular-nums text-ink">
              {monarch.modelCount.toLocaleString("en")}
            </p>
            <p className="mt-1 font-sans text-xs text-mute">
              Model associations linked to this Mondo ID
            </p>
            <ul className="mt-4 space-y-3">
              {models.map((m) => {
                const href = monarchUrl(m.id);
                return (
                  <li key={m.id} className="font-sans text-sm text-ink">
                    {href ? (
                      <a
                        href={href}
                        className="underline decoration-line underline-offset-2 hover:opacity-80"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {m.label || m.id}
                      </a>
                    ) : (
                      <span>{m.label || m.id}</span>
                    )}
                    <span className="mx-2 text-mute">·</span>
                    <span className="font-mono text-xs text-mute">{m.id}</span>
                    {m.taxonLabel ? (
                      <>
                        <span className="mx-2 text-mute">·</span>
                        <span className="text-mute">{m.taxonLabel}</span>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {monarch?.fetchedAt && (
          <p className="mt-4 font-mono text-[10px] text-mute">
            Monarch fetch {new Date(monarch.fetchedAt).toISOString().slice(0, 10)}
          </p>
        )}
      </div>
    </section>
  );
}
