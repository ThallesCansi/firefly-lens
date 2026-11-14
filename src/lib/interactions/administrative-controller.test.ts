import { describe, expect, it, vi } from "vitest";
import {
  AdministrativeSelectionController,
  BoundaryRepository,
  type BoundaryFeature,
} from "./administrative";
const feature: BoundaryFeature = {
  type: "Feature",
  properties: {
    id: "ibge:35",
    name: "Test state",
    level: "state",
    countryCode: "BRA",
    sourceId: "35",
    source: "Test fixture",
    sourceUrl: "https://example.com",
    license: "Test only",
  },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-50, -25],
        [-40, -25],
        [-40, -20],
        [-50, -20],
        [-50, -25],
      ],
    ],
  },
};
const response = () =>
  new Response(
    JSON.stringify({ type: "FeatureCollection", features: [feature] }),
  );
describe("administrative selection lifecycle", () => {
  it("previews actual geometry and confirms display only on explicit request", async () => {
    const fetcher = vi.fn(async () => response()),
      preview = vi.fn(),
      confirm = vi.fn();
    const c = new AdministrativeSelectionController(
      new BoundaryRepository(fetcher),
      preview,
      confirm,
    );
    await c.selectAt([-45, -23], "state");
    expect(c.snapshot().selected?.feature.geometry).toEqual(feature.geometry);
    expect(c.snapshot().selected?.analysis).toBe("available");
    expect(confirm).not.toHaveBeenCalled();
    c.confirm();
    expect(confirm).toHaveBeenCalledTimes(1);
    await c.selectAt([-44, -23], "state");
    expect(fetcher).toHaveBeenCalledTimes(1);
    c.cancel();
    expect(preview).toHaveBeenLastCalledWith(null);
    expect(c.snapshot().selected).toBeNull();
  });
  it("ignores a late noncooperative request after cancellation", async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => {
      resolve = r;
    });
    const c = new AdministrativeSelectionController(
      new BoundaryRepository(vi.fn(() => pending)),
    );
    const request = c.selectAt([-45, -23], "state");
    c.cancel();
    resolve(response());
    await request;
    expect(c.snapshot().phase).toBe("idle");
    expect(c.snapshot().selected).toBeNull();
  });
  it("handles failed loads, invalid coordinates and empty identification", async () => {
    const c = new AdministrativeSelectionController(
      new BoundaryRepository(
        vi.fn(async () => new Response("", { status: 503 })),
      ),
    );
    await c.selectAt([-45, -23], "state");
    expect(c.snapshot().phase).toBe("error");
    await c.selectAt([181, 0], "country");
    expect(c.snapshot().message).toMatch(/Invalid/);
    const empty = new AdministrativeSelectionController(
      new BoundaryRepository(vi.fn(async () => response())),
    );
    await empty.selectAt([0, 0], "state");
    expect(empty.snapshot().phase).toBe("empty");
  });
});
