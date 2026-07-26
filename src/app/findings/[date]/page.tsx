import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FindingsBody } from "@/components/FindingsBody";
import { diseasesArtifact, getAggregate } from "@/lib/data";
import {
  listFindingsDates,
  loadFindingsSnapshot,
} from "@/lib/findings";
import { trialsHeadline } from "@/lib/plain-copy";

type Props = { params: { date: string } };

export function generateStaticParams(): { date: string }[] {
  return listFindingsDates().map((date) => ({ date }));
}

export function generateMetadata({ params }: Props): Metadata {
  return {
    title: `Findings · ${params.date}`,
    description: `Historical findings freeze dated ${params.date}.`,
  };
}

export default function FindingsDatePage({ params }: Props) {
  const dates = listFindingsDates();
  if (!dates.includes(params.date)) notFound();
  const f = loadFindingsSnapshot(params.date);
  const trials = trialsHeadline(
    getAggregate(),
    diseasesArtifact.validation
  );
  const liveHeadline =
    trials.pct != null
      ? `${trials.pct}% of diseases in the live trials denominator currently have no matched interventional trial`
      : null;

  return (
    <FindingsBody f={f} allDates={dates} liveHeadline={liveHeadline} />
  );
}
