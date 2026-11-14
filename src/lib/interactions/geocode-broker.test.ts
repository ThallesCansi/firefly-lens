import { describe, expect, it, vi } from "vitest";
import {
  GeocodeBroker,
  GeocodeRateLimit,
  photonSuggestions,
} from "./geocode-broker";
const value = [
  { label: "Berlin, Germany", center: [13, 52] as [number, number], zoom: 10 },
];
describe("geocoding provider gate", () => {
  it("coalesces identical requests, blocks concurrent different queries and serves cache before the gate", async () => {
    let resolve!: (result: typeof value) => void;
    let now = 1000;
    const upstream = vi.fn(
      () =>
        new Promise<typeof value>((r) => {
          resolve = r;
        }),
    );
    const broker = new GeocodeBroker(upstream, () => now);
    const a = broker.search("Berlin"),
      b = broker.search(" BERLIN ");
    expect(a).toBe(b);
    await Promise.resolve();
    expect(upstream).toHaveBeenCalledTimes(1);
    await expect(broker.search("Paris")).rejects.toBeInstanceOf(
      GeocodeRateLimit,
    );
    resolve(value);
    await a;
    expect(await broker.search("berlin")).toEqual(value);
    await expect(broker.search("Paris")).rejects.toBeInstanceOf(
      GeocodeRateLimit,
    );
    now = 2500;
    const paris = broker.search("Paris");
    await Promise.resolve();
    resolve(value);
    await paris;
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it("propagates provider cooldown and never retries immediately", async () => {
    let now = 0;
    const upstream = vi.fn(async () => {
      throw new GeocodeRateLimit(30);
    });
    const broker = new GeocodeBroker(upstream, () => now);
    await expect(broker.search("Rome")).rejects.toMatchObject({
      retryAfterSeconds: 30,
    });
    now = 2000;
    await expect(broker.search("Paris")).rejects.toMatchObject({
      retryAfterSeconds: 28,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  });
  it("converts Photon extents, disambiguates administrative names and rejects malformed coordinates", () => {
    const results = photonSuggestions({
      features: [
        {
          geometry: { coordinates: [13, 52] },
          properties: {
            name: "Berlin",
            state: "Berlin",
            country: "Germany",
            type: "state",
            extent: [12, 53, 14, 51],
          },
        },
        {
          geometry: { coordinates: [NaN, 1] },
          properties: { name: "Invalid" },
        },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].label).toBe("Berlin, Germany");
    expect(results[0].bounds).toEqual([12, 51, 14, 53]);
    expect(results[0].zoom).toBe(6);
  });
});
