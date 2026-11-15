import { afterEach, expect, it, vi } from "vitest";
import { driver } from "driver.js";
import { createTourDriver } from "./driver-adapter";
import { TourSession } from "./session";
vi.mock("driver.js", () => ({ driver: vi.fn((options) => options) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("keeps all seventeen Driver steps read-only without target or map exceptions", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const session = new TourSession({ capture: () => { throw new Error("not started"); }, prepare: async () => {}, restore: () => {}, keep: () => {} });
  createTourDriver(session, { render: vi.fn(), close: vi.fn() });
  const options = vi.mocked(driver).mock.calls[0][0]!;
  expect(options).toMatchObject({ allowPageInteraction: false, disableActiveInteraction: true, focus: "popover", animate: false });
  expect(options.steps).toHaveLength(17);
  for (const step of options.steps!) {
    expect(step).toMatchObject({ disableActiveInteraction: true, allowPageInteraction: false, focus: "popover" });
    expect(step.allowedElements).toBeUndefined();
    expect(step.onInteraction).toBeUndefined();
    expect(step.advanceOn).toBeUndefined();
  }
});
