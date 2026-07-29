import type { DiseaseRecord } from "@/lib/types";

function stageLabel(stage: string | null): string {
  if (!stage) return "—";
  return stage.replace(/_/g, " ").toLowerCase();
}

export function DiseaseTherapies({ d }: { d: DiseaseRecord }) {
  const orphan = d.orphanDesignation;
  const ot = d.openTargets;
  const ctd = d.mydisease;

  return (
    <section
      id="therapies"
      className="mt-12 scroll-mt-16 border-t border-line pt-10"
    >
      <p className="font-sans text-xs uppercase tracking-[0.12em] text-mute">
        Therapies
      </p>
      <h2 className="mt-2 font-serif text-title text-ink">
        Designations, candidates, and chemicals
      </h2>
      <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-mute">
        FDA orphan designations (OOPD mirror), Open Targets clinical candidates,
        and CTD chemical associations via MyDisease.info. These never change the
        interventional-trial headline.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <div>
          <h3 className="font-sans text-sm font-medium text-ink">
            FDA orphan designation
          </h3>
          {!orphan ? (
            <p className="mt-3 font-sans text-sm text-mute">
              Not enriched in this build.
            </p>
          ) : !orphan.matched ? (
            <p className="mt-3 font-sans text-sm text-mute">
              No designation matched this disease via UMLS or preferred name.
              Absence here is not proof that none exists under another wording.
            </p>
          ) : (
            <>
              <p className="mt-3 font-mono text-2xl tabular-nums text-ink">
                {orphan.designationCount.toLocaleString("en")}
              </p>
              <p className="mt-1 font-sans text-xs text-mute">
                Designation{orphan.designationCount === 1 ? "" : "s"}
                {orphan.approvedOrphanIndicationCount > 0
                  ? ` · ${orphan.approvedOrphanIndicationCount} with orphan-indication approval`
                  : " · none yet approved for the orphan indication"}
              </p>
              <ul className="mt-4 space-y-3">
                {orphan.designations.slice(0, 8).map((row) => (
                  <li
                    key={`${row.genericName}-${row.designation}-${row.designatedDate}`}
                    className="font-sans text-sm text-ink"
                  >
                    <span className="font-medium">{row.genericName}</span>
                    {row.tradeName ? (
                      <span className="text-mute"> ({row.tradeName})</span>
                    ) : null}
                    <span className="mt-0.5 block font-mono text-xs text-mute">
                      {row.designation}
                      {row.designatedDate ? ` · ${row.designatedDate}` : ""}
                      {row.approvalStatus ? ` · ${row.approvalStatus}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-sans text-xs text-mute">
                Source:{" "}
                <a
                  href="https://www.accessdata.fda.gov/scripts/opdlisting/oopd/"
                  className="underline decoration-line underline-offset-2 hover:text-ink"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  FDA OOPD
                </a>
              </p>
            </>
          )}
        </div>

        <div>
          <h3 className="font-sans text-sm font-medium text-ink">
            Open Targets candidates
          </h3>
          {!ot ? (
            <p className="mt-3 font-sans text-sm text-mute">
              Not enriched in this build.
            </p>
          ) : ot.drugCount === 0 ? (
            <p className="mt-3 font-sans text-sm text-mute">
              No drugs or clinical candidates returned for this Mondo ID on Open
              Targets.
            </p>
          ) : (
            <>
              <p className="mt-3 font-mono text-2xl tabular-nums text-ink">
                {ot.drugCount.toLocaleString("en")}
              </p>
              <p className="mt-1 font-sans text-xs text-mute">
                Drugs / clinical candidates
                {ot.efoId ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={`https://platform.opentargets.org/disease/${ot.efoId}`}
                      className="underline decoration-line underline-offset-2 hover:text-ink"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {ot.efoId}
                    </a>
                  </>
                ) : null}
              </p>
              <ul className="mt-4 space-y-2">
                {ot.drugs.map((drug) => (
                  <li key={drug.chemblId} className="font-sans text-sm text-ink">
                    <a
                      href={drug.url}
                      className="underline decoration-line underline-offset-2 hover:opacity-80"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {drug.name}
                    </a>
                    <span className="mx-2 text-mute">·</span>
                    <span className="font-mono text-xs text-mute">
                      {stageLabel(drug.maxClinicalStage)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h3 className="font-sans text-sm font-medium text-ink">
          CTD chemicals (MyDisease.info)
        </h3>
        {!ctd ? (
          <p className="mt-3 font-sans text-sm text-mute">
            Not enriched in this build.
          </p>
        ) : ctd.chemicalCount === 0 ? (
          <p className="mt-3 font-sans text-sm text-mute">
            No CTD chemical associations returned for this Mondo ID.
          </p>
        ) : (
          <>
            <p className="mt-3 font-sans text-sm text-mute">
              {ctd.chemicalCount.toLocaleString("en")} associated chemical
              {ctd.chemicalCount === 1 ? "" : "s"}
              {ctd.pathwayCount > 0
                ? ` · ${ctd.pathwayCount} pathway${ctd.pathwayCount === 1 ? "" : "s"}`
                : ""}
              . Therapeutic evidence is listed first when present — not a
              treatment recommendation.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {ctd.chemicals.map((c) => (
                <li
                  key={c.name}
                  className="border border-line bg-ground px-2 py-1 font-sans text-xs text-ink"
                  title={c.evidence ?? undefined}
                >
                  {c.name}
                  {c.evidence ? (
                    <span className="text-mute"> · {c.evidence}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            {ctd.pathways.length > 0 && (
              <p className="mt-4 font-mono text-xs text-mute">
                Pathways: {ctd.pathways.join("; ")}
              </p>
            )}
            {ctd.mondoId && (
              <p className="mt-3 font-sans text-xs text-mute">
                <a
                  href={`https://mydisease.info/v1/disease/${encodeURIComponent(ctd.mondoId)}`}
                  className="underline decoration-line underline-offset-2 hover:text-ink"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  MyDisease.info · {ctd.mondoId}
                </a>
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
