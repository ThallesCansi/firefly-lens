import { describe, expect, it } from "vitest";
import { drawnArea, rectangleArea, type AnalysisArea } from "./data/types";
import { parseShare, shareQuery } from "./share";

const read = (query: string) => parseShare(query, "2002-07", "2026-11");

describe("share links", () => {
  it("carries a drawn area, the period and the sensors there and back", () => {
    const area = drawnArea(
      [
        [-60.4512345, -18.45],
        [-48.45, -18.45],
        [-50, -8.24],
      ],
      "My triangle",
    );
    const view = read(shareQuery({ area, period: "2024-09", sensors: ["VIIRS"] }));
    expect(view.period).toBe("2024-09");
    expect(view.sensors).toEqual(["VIIRS"]);
    expect(view.area).toEqual({
      kind: "drawn",
      vertices: [
        [-60.4512, -18.45],
        [-48.45, -18.45],
        [-50, -8.24],
      ],
      name: "My triangle",
    });
  });

  it("keeps a rectangle a rectangle and leaves out what is default", () => {
    const query = shareQuery({ area: rectangleArea([-58.5, -22, -54.5, -16]), period: "2023-09-14", sensors: ["MODIS", "VIIRS"] });
    expect(query).not.toContain("sensors");
    expect(query).not.toContain("name");
    const view = read(query);
    expect(view.sensors).toBeNull();
    expect(view.period).toBe("2023-09-14");
    expect(view.area?.kind === "drawn" && view.area.vertices).toHaveLength(4);
  });

  it("names a state by its id instead of copying its outline", () => {
    const state = { id: "state:ibge:51", name: "Mato Grosso (MT)", kind: "state", geometry: { type: "Polygon", coordinates: [] }, bbox: [0, 0, 0, 0] } as unknown as AnalysisArea;
    const query = shareQuery({ area: state, period: "2024-09", sensors: ["MODIS", "VIIRS"] });
    expect(query).toContain("area=state%3Aibge%3A51");
    expect(read(query).area).toEqual({ kind: "state", id: "ibge:51" });
  });

  it("says nothing about the area when none is selected", () => {
    expect(read(shareQuery({ area: null, period: "2024-09", sensors: ["MODIS"] })).area).toBeNull();
  });

  it("drops what is malformed or outside the record and keeps the rest", () => {
    expect(read("period=2024-13").period).toBeNull();
    expect(read("period=2024-02-30").period).toBeNull();
    expect(read("period=1999-01").period).toBeNull();
    expect(read("period=2030-01").period).toBeNull();
    expect(read("area=poly:-50,-10;-49,-10").area).toBeNull(); // two corners
    expect(read("area=poly:-50,-10;-49,-10;abc,-9").area).toBeNull();
    expect(read("area=poly:10,50;11,50;11,51").area).toBeNull(); // outside Brazil's coverage
    expect(read("area=state:<script>").area).toBeNull();
    expect(read("area=javascript:alert(1)&period=2024-09")).toEqual({ area: null, period: "2024-09", sensors: null });
    expect(read("sensors=radar").sensors).toEqual([]);
    expect(read("").period).toBeNull();
  });

  it("refuses a shape with too many corners", () => {
    const many = Array.from({ length: 41 }, (_, i) => `${-50 + i * 0.01},-10`).join(";");
    expect(read(`area=poly:${many}`).area).toBeNull();
  });
});
