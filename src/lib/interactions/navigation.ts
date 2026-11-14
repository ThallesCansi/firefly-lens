/** Local search adapter. The globe agent owns the future shared map contract. */
export type GeographicPoint = readonly [longitude: number, latitude: number];
export type GeographicBounds = [
  west: number,
  south: number,
  east: number,
  north: number,
];
export type SearchSuggestion = {
  label: string;
  center: [number, number];
  zoom: number;
  bounds?: GeographicBounds;
  kind?: string;
};

export function validPoint(point: readonly number[]): point is GeographicPoint {
  return (
    point.length === 2 &&
    point.every(Number.isFinite) &&
    Math.abs(point[0]) <= 180 &&
    Math.abs(point[1]) <= 90
  );
}
export function validBounds(value: unknown): value is GeographicBounds {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every(Number.isFinite)
  )
    return false;
  const [w, s, e, n] = value;
  return w >= -180 && e <= 180 && s >= -90 && n <= 90 && w < e && s < n;
}
export function coordinateSuggestion(
  query: string,
): SearchSuggestion | "invalid" | null {
  const text = query.trim();
  if (!text.includes(",")) return null;
  const parts = text.split(",").map((part) => part.trim());
  if (
    !parts.every(
      (part) =>
        !part ||
        /^[+\-.\deE]+$/.test(part) ||
        /^(NaN|[+-]?Infinity)$/i.test(part),
    )
  )
    return null;
  if (parts.length !== 2 || parts.some((part) => !part)) return "invalid";
  const [lat, lon] = parts.map(Number);
  if (!validPoint([lon, lat])) return "invalid";
  return {
    label: lat.toFixed(4) + ", " + lon.toFixed(4),
    center: [lon, lat],
    zoom: 8,
    kind: "coordinates",
  };
}
export function distanceKm(a: GeographicPoint, b: GeographicPoint): number {
  if (!validPoint(a) || !validPoint(b))
    throw new Error("Invalid geographic position");
  const rad = Math.PI / 180;
  const dlat = (b[1] - a[1]) * rad,
    dlon = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
let lastRequestId = 0;
export function navigationForSearch(
  result: SearchSuggestion,
  options: { from?: GeographicPoint; reducedMotion?: boolean } = {},
) {
  if (!validPoint(result.center) || !Number.isFinite(result.zoom))
    throw new Error("Invalid navigation destination");
  const durationMs = options.reducedMotion
    ? 0
    : options.from
      ? Math.round(
          Math.min(
            2000,
            Math.max(
              500,
              500 + Math.sqrt(distanceKm(options.from, result.center)) * 18,
            ),
          ),
        )
      : 900;
  return {
    center: [...result.center] as [number, number],
    zoom: Math.max(0, Math.min(18, result.zoom)),
    animation: options.reducedMotion ? ("jump" as const) : ("fly" as const),
    maxZoom: 12,
    ...(result.bounds && validBounds(result.bounds)
      ? { bounds: [...result.bounds] as GeographicBounds }
      : {}),
    id: (lastRequestId = Math.max(Date.now(), lastRequestId + 1)),
    motion: {
      kind: "fly" as const,
      durationMs,
      interruptible: true as const,
      essential: false as const,
    },
  };
}
