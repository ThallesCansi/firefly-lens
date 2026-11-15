import { describe, expect, it } from "vitest";
import { timelapseRange } from "./timelapse";

const range = (a: string, b: string) => timelapseRange(a, b, "2002-07", "2026-11");

describe("timelapseRange", () => {
  it("reads years as their whole span", () => {
    expect(range("2010", "2012")).toEqual({ ok: true, from: "2010-01", to: "2012-12", trimmed: false });
  });

  it("cuts the range to the record and says it did", () => {
    expect(range("2001", "2024")).toEqual({ ok: true, from: "2002-07", to: "2024-12", trimmed: true });
    expect(range("2020-03", "2030")).toEqual({ ok: true, from: "2020-03", to: "2026-11", trimmed: true });
  });

  it("accepts the ends in either order and days as months", () => {
    expect(range("2024", "2020-05-17")).toEqual({ ok: true, from: "2020-05", to: "2024-12", trimmed: false });
  });

  it("refuses a range wholly outside the record or malformed", () => {
    expect(range("1990", "1999").ok).toBe(false);
    expect(range("2030", "2031").ok).toBe(false);
    expect(range("2020-13", "2021").ok).toBe(false);
    expect(range("soon", "2021").ok).toBe(false);
  });
});
