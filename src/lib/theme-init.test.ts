import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { themeInit } from "./theme-init";

function bootstrap(saved: string | null, darkSystem: boolean, blocked = false) {
  const dataset: Record<string, string> = {};
  runInNewContext(themeInit, {
    localStorage: {
      getItem: () => {
        if (blocked) throw new Error("Storage blocked");
        return saved;
      },
    },
    window: { matchMedia: () => ({ matches: darkSystem }) },
    document: { documentElement: { dataset } },
  });
  return dataset;
}
describe("theme before first paint", () => {
  it("honours an explicit saved theme over the operating system", () => {
    expect(bootstrap("light", true)).toEqual({
      theme: "light",
      themePreference: "light",
    });
    expect(bootstrap("dark", false)).toEqual({
      theme: "dark",
      themePreference: "dark",
    });
  });
  it("uses the system preference for new visitors and System mode", () => {
    expect(bootstrap(null, false).theme).toBe("light");
    expect(bootstrap("system", true).theme).toBe("dark");
  });
  it("recovers from invalid or unavailable storage without blocking the page", () => {
    expect(bootstrap("invalid", true)).toEqual({
      theme: "dark",
      themePreference: "system",
    });
    expect(bootstrap(null, false, true)).toEqual({
      theme: "light",
      themePreference: "system",
    });
  });
});
