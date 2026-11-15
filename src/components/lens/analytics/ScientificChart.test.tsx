import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScientificChart, numeric } from "./ScientificChart";

describe("scientific chart presentation", () => {
  it("renders source labels, partial points, null gaps, intervals and accessible numeric table", () => {
    const html = renderToStaticMarkup(
      createElement(ScientificChart, {
        title: "History",
        description: "Real output",
        unit: "hot spots",
        series: [
          {
            label: "Observed",
            kind: "observed",
            points: [
              { label: "2026-01", value: 12 },
              { label: "2026-02", value: null },
              {
                label: "2026-03",
                value: 7,
                partial: true,
                note: "partial month",
              },
            ],
          },
          {
            label: "Experimental forecast",
            kind: "forecast",
            points: [
              { label: "2026-01", value: null },
              { label: "2026-02", value: null },
              { label: "2026-03", value: 9, lower: 2, upper: 15 },
            ],
          },
        ],
      }),
    );
    expect(html).toContain("analytics-partial");
    expect(html).toContain("analytics-series-forecast");
    expect(html).toContain("View chart data");
    expect(html).toContain("Unavailable");
    expect(html).toContain("partial month");
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
  it("handles empty or all-null series explicitly without a fake zero chart", () => {
    const html = renderToStaticMarkup(
      createElement(ScientificChart, {
        title: "Missing",
        description: "No data",
        unit: "%",
        series: [
          { label: "Anomaly", points: [{ label: "2026-11", value: null }] },
        ],
      }),
    );
    expect(html).toContain("Missing values are not zero");
    expect(html).not.toContain("<svg");
    expect(numeric(null)).toBe("Unavailable");
    expect(numeric(0)).toBe("0");
  });
});
