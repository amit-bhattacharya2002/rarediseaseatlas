import { ReportProblem } from "@/components/ReportProblem";

const NAV_ITEMS: Array<[string, string]> = [
  ["overview", "Overview"],
  ["meaning", "Meaning"],
  ["readiness", "Readiness"],
  ["biology", "Biology"],
  ["therapies", "Therapies"],
  ["research", "Research"],
  ["trials-studies", "Trials"],
  ["support", "Support"],
  ["india", "India"],
  ["methods", "Methods"],
];

export function DiseaseSectionNav({
  orphaCode,
  name,
}: {
  orphaCode: string;
  name: string;
}) {
  return (
    <nav
      aria-label="On this disease page"
      className="sticky top-[3.75rem] z-20 -mx-5 mt-8 overflow-x-auto border-y border-line bg-ground/95 px-2 backdrop-blur sm:top-[4.25rem] sm:mx-0 sm:px-0"
    >
      <div className="flex min-w-max items-center sm:min-w-0 sm:flex-wrap">
        {NAV_ITEMS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="min-h-11 whitespace-nowrap px-3 py-3 font-sans text-xs font-medium text-mute hover:bg-sand-50 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink sm:px-4"
          >
            {label}
          </a>
        ))}
        <ReportProblem orphaCode={orphaCode} name={name} variant="nav" />
      </div>
    </nav>
  );
}
