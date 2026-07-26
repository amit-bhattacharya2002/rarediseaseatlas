import { ImageResponse } from "next/og";
import { getAllDiseases, getDisease } from "@/lib/data";
import { diseaseSignals, SIGNAL_COLORS } from "@/lib/signals";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllDiseases().map((d) => ({ orphacode: d.orphaCode }));
}

export default async function Image({
  params,
}: {
  params: { orphacode: string };
}) {
  const d = getDisease(params.orphacode);
  const name = d?.name ?? `ORPHA:${params.orphacode}`;
  const signals = d
    ? diseaseSignals(d)
    : { publications: 0, researchers: 0, trials: 0 };
  const levels = [signals.publications, signals.researchers, signals.trials];

  const counts = d
    ? [
        { label: "Publications", value: d.publications.total },
        { label: "Researchers", value: d.researchers.distinctCount },
        { label: "Interventional trials", value: d.trials.total },
      ]
    : [];
  const fmt = (n: number | null | undefined) =>
    n == null ? "—" : n.toLocaleString("en");

  const glyphH = 160;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#FAF9F6",
          backgroundImage:
            "linear-gradient(135deg, #F3EFE6 0%, #FAF9F6 45%, #EBE8E0 100%)",
          padding: 64,
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 40,
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 22,
                color: "#6B6A66",
                fontFamily: "ui-monospace, monospace",
                letterSpacing: 1,
              }}
            >
              ORPHA:{params.orphacode}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 20,
                fontSize: name.length > 60 ? 42 : 54,
                lineHeight: 1.15,
                color: "#1B1B1A",
                maxWidth: 820,
              }}
            >
              {name}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              height: glyphH,
              gap: 10,
            }}
          >
            {levels.map((level, i) => {
              const h = glyphH * ((level + 1) / 5);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    width: 22,
                    height: h,
                    backgroundColor: SIGNAL_COLORS[level],
                    borderRadius: 4,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 56, width: "100%" }}>
          {counts.map((c) => (
            <div
              key={c.label}
              style={{ display: "flex", flexDirection: "column" }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: 40,
                  fontFamily: "ui-monospace, monospace",
                  color: "#1B1B1A",
                }}
              >
                {fmt(c.value)}
              </div>
              <div
                style={{
                  display: "flex",
                  marginTop: 6,
                  fontSize: 18,
                  color: "#6B6A66",
                }}
              >
                {c.label}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "1px solid #E6E4DE",
            paddingTop: 24,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", fontSize: 22, color: "#1B1B1A" }}>
            Rare Disease Research Atlas
          </div>
          <div style={{ display: "flex", fontSize: 16, color: "#6B6A66" }}>
            Research landscape · not medical advice
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
