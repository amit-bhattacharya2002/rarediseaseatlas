import { indiaNprd, indiaStaleWarning } from "@/lib/data";
import type { DiseaseRecord } from "@/lib/types";

export function DiseaseIndia({ d }: { d: DiseaseRecord }) {
  const indiaStale = indiaStaleWarning();

  return (
    <section
      id="india"
      className="mt-10 scroll-mt-16 border border-line px-5 py-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-title text-ink">India — NPRD</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-mute">
          Last verified {indiaNprd.lastVerified}
        </span>
      </div>
      {indiaStale && (
        <p className="mt-3 border border-line bg-sand-50/60 px-3 py-2 font-sans text-xs text-mute">
          This India policy layer was last verified more than six months ago —
          confirm current MoHFW guidance before acting on it.
        </p>
      )}
      {d.indiaNprd?.listed && d.indiaNprd.groups.length > 0 ? (
        <>
          {d.indiaNprd.via === "direct" ? (
            <p className="mt-3 font-sans text-sm text-ink">
              Directly listed under NPRD
              {d.indiaNprd.groups.length === 1
                ? ` Group ${d.indiaNprd.groups[0]}`
                : ` Groups ${d.indiaNprd.groups.join(" and ")}`}
              .
            </p>
          ) : (
            <p className="mt-3 font-sans text-sm text-ink">
              Likely covered — the policy lists{" "}
              <em>{d.indiaNprd.matchedViaLabel ?? "a broader category"}</em> as a
              category
              {d.indiaNprd.groups.length === 1
                ? ` (Group ${d.indiaNprd.groups[0]})`
                : ` (Groups ${d.indiaNprd.groups.join(" and ")})`}
              , and this condition is a form of it. Confirm eligibility with a
              Centre of Excellence.
            </p>
          )}
          {d.indiaNprd.entitlements.map((ent) => (
            <div key={ent.label} className="mt-4">
              <p className="font-sans text-sm font-medium text-ink">{ent.label}</p>
              {ent.amountCeiling && (
                <p className="mt-1 font-mono text-sm text-ink">
                  {ent.amountCeiling}
                </p>
              )}
              <p className="mt-1 font-sans text-sm leading-relaxed text-mute">
                {ent.mechanism}
              </p>
              <p className="mt-2 font-sans text-xs leading-relaxed text-mute">
                {ent.caveat}
                {ent.verifyUrl ? (
                  <>
                    {" "}
                    <a
                      href={ent.verifyUrl}
                      className="underline decoration-line underline-offset-2 hover:text-ink"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Verify
                    </a>
                  </>
                ) : null}
              </p>
            </div>
          ))}
          <details className="mt-6 border-t border-line pt-4">
            <summary className="cursor-pointer font-sans text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              Centres of Excellence ({indiaNprd.centresOfExcellence.length})
            </summary>
            <ul className="mt-3 space-y-2 font-sans text-sm text-mute">
              {indiaNprd.centresOfExcellence.map((c) => (
                <li key={`${c.name}-${c.city}`}>
                  <span className="text-ink">{c.name}</span>
                  {" — "}
                  {c.city}, {c.state}
                  {c.department ? ` · ${c.department}` : ""}
                  {c.phone ? ` · ${c.phone}` : ""}
                </li>
              ))}
            </ul>
          </details>
          <p className="mt-4 font-sans text-sm text-mute">
            Voluntary contributions / crowdfunding (separate from CoE funding):{" "}
            <a
              href={indiaNprd.crowdfundingPortal}
              className="underline decoration-line underline-offset-2 hover:text-ink"
              target="_blank"
              rel="noopener noreferrer"
            >
              {indiaNprd.crowdfundingPortal}
            </a>
          </p>
        </>
      ) : (
        <p className="mt-3 font-sans text-sm leading-relaxed text-mute">
          This ORPHAcode is not on our curated NPRD list (direct or Mondo-parent
          match). That does not decide clinical eligibility; families in India
          should ask a notified Centre of Excellence about current coverage.
        </p>
      )}
      <p className="mt-4 font-sans text-xs text-mute">{indiaNprd.disclaimer}</p>
    </section>
  );
}
