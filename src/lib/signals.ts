import type { DiseaseRecord } from "./types";

/** Map a raw count onto 0–4 intensity steps for the indigo scale. */
export function signalLevel(count: number, kind: "pubs" | "people" | "trials"): number {
  if (count <= 0) return 0;
  switch (kind) {
    case "pubs":
      if (count < 5) return 1;
      if (count < 50) return 2;
      if (count < 500) return 3;
      return 4;
    case "people":
      if (count < 3) return 1;
      if (count < 10) return 2;
      if (count < 40) return 3;
      return 4;
    case "trials":
      if (count < 2) return 1;
      if (count < 5) return 2;
      if (count < 20) return 3;
      return 4;
  }
}

export function diseaseSignals(d: DiseaseRecord) {
  return {
    publications: signalLevel(d.publications.total ?? 0, "pubs"),
    researchers: signalLevel(d.researchers.distinctCount ?? 0, "people"),
    trials: signalLevel(d.trials.total ?? 0, "trials"),
  };
}

/** Tailwind / CSS color tokens for levels 0–4 on the sand→indigo scale */
export const SIGNAL_COLORS = [
  "#E4DDCF", // 0 empty / unknown — pale sand
  "#C9BFA8", // 1
  "#6B7799", // 2
  "#3D4A6B", // 3
  "#1E2A4A", // 4 deep indigo
] as const;
