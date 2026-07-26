import type { Metadata } from "next";
import { FindingsBody } from "@/components/FindingsBody";
import { diseasesArtifact, getAggregate } from "@/lib/data";
import { listFindingsDates, loadLatestFindings } from "@/lib/findings";
import { trialsHeadline } from "@/lib/plain-copy";

export const metadata: Metadata = {
  title: "Findings — nomenclature, searchability, and trial measurement",
  description:
    "Dated methods-and-findings note from a 300-disease Orphanet sample: how official rare-disease names map to literature and trial registries.",
  alternates: { canonical: "/findings" },
};

export default function FindingsPage() {
  const f = loadLatestFindings();
  const allDates = listFindingsDates();
  const trials = trialsHeadline(
    getAggregate(),
    diseasesArtifact.validation
  );
  const liveHeadline =
    trials.pct != null
      ? `${trials.pct}% of rare diseases currently have no matched interventional trial`
      : null;

  return (
    <FindingsBody f={f} allDates={allDates} liveHeadline={liveHeadline} />
  );
}
