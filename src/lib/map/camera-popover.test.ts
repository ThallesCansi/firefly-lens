import { describe, expect, it } from "vitest";
import { placeCameraPopover, type ScreenRect } from "./camera-popover";
const intersects = (a: ScreenRect, b: ScreenRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
describe("camera popup free-space placement", () => {
  it.each([1440, 1000, 390, 320])("avoids Highlights and critical controls at %ipx", (width) => {
    const viewport = { left: 0, top: 0, right: width, bottom: 1000 };
    const anchor = { left: width - 64, right: width - 12, top: 530, bottom: 568 };
    const obstacles = [
      { left: width > 700 ? width - 580 : 86, right: width - 12, top: 16, bottom: width > 700 ? 170 : 112 },
      { left: 12, right: width > 700 ? 176 : 78, top: 84, bottom: 362 },
      { left: width - 64, right: width - 12, top: 530, bottom: 880 },
      { left: 12, right: Math.min(width - 84, 300), top: 788, bottom: 880 },
    ];
    const p = placeCameraPopover(anchor, { width: Math.min(280, width - 96), height: 310 }, viewport, obstacles);
    const rect = { left: p.left, top: p.top, right: p.left + p.width, bottom: p.top + p.maxHeight };
    expect(obstacles.some((o) => intersects(o, rect))).toBe(false);
    expect(rect.left).toBeGreaterThanOrEqual(12); expect(rect.right).toBeLessThanOrEqual(width - 12);
    expect(rect.top).toBeGreaterThanOrEqual(12); expect(rect.bottom).toBeLessThanOrEqual(988);
    expect(p.maxHeight).toBeGreaterThan(180);
  });
  it("keeps a scrollable popup in the remaining gap on a short mobile viewport", () => {
    const p = placeCameraPopover({ left: 254, right: 308, top: 250, bottom: 288 }, { width: 224, height: 310 },
      { left: 0, top: 0, right: 320, bottom: 600 }, [{ left: 0, right: 320, top: 0, bottom: 200 }, { left: 0, right: 320, top: 500, bottom: 600 }]);
    expect(p.top).toBeGreaterThanOrEqual(208); expect(p.top + p.maxHeight).toBeLessThanOrEqual(492);
  });
});
