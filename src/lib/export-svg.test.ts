import { describe, expect, it } from "vitest";
import { heatmapSvg } from "./export";
import type { MonthCell } from "./harmonize";

describe("scientific SVG presentation", () => {
  it("retains scientific values and rings, escapes labels, and identifies simulation and range", () => {
    const month: MonthCell = {
      source: "observed",
      lo: null,
      hi: null,
      partial: false,
      rankOf: 23,
      viirsHarmonized: null,
      year: 2025,
      month: 0,
      value: 320,
      median: 100,
      ratio: 3.2,
      rank: 1,
      level: 4,
      detections: { MODIS: 21, VIIRS: 36 },
    };
    const before = structuredClone(month);
    const svg = heatmapSvg([month], [2025], 'Area <script> & "name"', {
      source: "Simulated detections (not observations)",
      period: "2025-02 to 2025-03",
      processing: "Provisional",
      exportedAt: "2026-11-14T12:00:00Z",
      from: "2025-02",
      to: "2025-03",
    });
    expect(month).toEqual(before);
    expect(svg).toContain(
      "320 Aqua-equivalent hot spots (observed); median 100; rank 1; outside selected range",
    );
    expect(svg).toContain('opacity="0.25"');
    expect(svg).toContain('stroke="#f3eee9"');
    expect(svg).toContain("Area &lt;script&gt; &amp; &quot;name&quot;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("Simulated detections (not observations)");
    expect(svg).toContain("2025-02 to 2025-03");
    expect(svg).toContain("Exported 2026-11-14T12:00:00Z");
    expect(svg).toContain('aria-labelledby="title description"');
  });
});
