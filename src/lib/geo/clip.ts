import type { PolygonGeometry } from "../data/types";

/**
 * Share of grid cells inside a polygon, by area in degrees (the same measure
 * the rectangle areas always used). Rings are clipped to each cell's square
 * (Sutherland–Hodgman, exact for any simple ring against a rectangle) and
 * measured with the shoelace formula: outer rings add, holes subtract.
 */

type Ring = { points: number[][]; box: [number, number, number, number] };
type Polygon = { outer: Ring; holes: Ring[] };
/** A polygon ready for measuring cells (see prepare). */
export type PreparedPolygon = Polygon[];

function ringOf(points: number[][]): Ring {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of points) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return { points, box: [w, s, e, n] };
}

/** Prepares a polygon once, so many cells can be measured against it. */
export function prepare(geometry: PolygonGeometry): PreparedPolygon {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons
    .filter((rings) => rings.length > 0 && rings[0].length >= 3)
    .map((rings) => ({ outer: ringOf(rings[0]), holes: rings.slice(1).map(ringOf) }));
}

/** Clips a ring, shifted so the cell's south-west corner is the origin, to [0, size]². */
function clippedArea(ring: Ring, x0: number, y0: number, size: number): number {
  const [w, s, e, n] = ring.box;
  if (e <= x0 || w >= x0 + size || n <= y0 || s >= y0 + size) return 0;
  let pts = ring.points.map(([x, y]) => [x - x0, y - y0]);
  // Left, right, bottom, top: keep the side inside, cut each edge that crosses.
  const planes: [number, number, 1 | -1][] = [
    [0, 0, 1],
    [0, size, -1],
    [1, 0, 1],
    [1, size, -1],
  ];
  for (const [axis, at, sign] of planes) {
    if (pts.length === 0) return 0;
    const out: number[][] = [];
    const inside = (p: number[]) => sign * (p[axis] - at) >= 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ina = inside(a);
      const inb = inside(b);
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = (at - a[axis]) / (b[axis] - a[axis]);
        out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    pts = out;
  }
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) / 2;
}

/** Share (0 to 1) of the square cell with south-west corner (west, south) inside the polygon. */
export function cellShare(polygons: PreparedPolygon, west: number, south: number, size: number): number {
  let area = 0;
  for (const { outer, holes } of polygons) {
    let a = clippedArea(outer, west, south, size);
    if (a <= 0) continue;
    for (const hole of holes) a -= clippedArea(hole, west, south, size);
    area += Math.max(0, a);
  }
  const share = area / (size * size);
  // Rounding in the clip must not turn a whole cell into 0.9999999.
  if (share > 1 - 1e-9) return 1;
  if (share < 1e-9) return 0;
  return share;
}
