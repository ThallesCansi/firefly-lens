import { describe, expect, it } from "vitest";
import { GLOW, glowAt } from "./glow";

describe("glow", () => {
  it("breathes between its limits and never goes out", () => {
    const samples = Array.from({ length: 261 }, (_, i) => glowAt(i * 10));
    expect(Math.min(...samples)).toBeCloseTo(GLOW.min);
    expect(Math.max(...samples)).toBeCloseTo(GLOW.max);
    expect(GLOW.min).toBeGreaterThan(0.2);
  });

  it("repeats once per period, well under three flashes a second", () => {
    expect(glowAt(700)).toBeCloseTo(glowAt(700 + GLOW.period));
    expect(1000 / GLOW.period).toBeLessThan(1);
  });
});
