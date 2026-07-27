import { ReportProblem } from "@/components/ReportProblem";

export function LimitationsNote({
  orphaCode,
  name,
}: {
  orphaCode: string;
  name: string;
}) {
  return (
    <aside className="border border-line bg-sand-50/60 px-4 py-4 font-sans text-sm leading-relaxed text-mute">
      <p>
        These figures are automatically derived from public databases and may be
        wrong — especially when disease names are ambiguous. Check the query
        below, compare with{" "}
        <a
          href={`https://www.orpha.net/en/disease/detail/${orphaCode}`}
          className="underline decoration-line underline-offset-2 hover:text-ink"
        >
          Orphanet
        </a>
        , and{" "}
        <ReportProblem orphaCode={orphaCode} name={name} variant="inline" /> if
        something looks off.
      </p>
    </aside>
  );
}
