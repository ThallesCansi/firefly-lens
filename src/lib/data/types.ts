/**
 * FireFly Lens reads real NASA FIRMS detections for Brazil, already filtered,
 * counted on a 0.25° grid and harmonized (see harmonization/).
 *
 * MODIS means MODIS on Aqua; VIIRS means VIIRS on NOAA-20. Terra, Suomi NPP and
 * NOAA-21 are not part of the harmonized record.
 */

export type Sensor = "MODIS" | "VIIRS";

export const SENSORS: readonly Sensor[] = ["MODIS", "VIIRS"];

export const SENSOR_NAME: Record<Sensor, string> = { MODIS: "MODIS Aqua", VIIRS: "VIIRS NOAA-20" };

/** [west, south, east, north] in degrees. */
export type BBox = [number, number, number, number];

export interface Region {
  id: string;
  name: string;
  /** Where the region sits, in a few words. */
  place: string;
  bbox: BBox;
}

/** GeoJSON polygon coordinates, [longitude, latitude] in degrees. */
export type PolygonGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/**
 * The area the analysis runs on: a drawn shape, prepared region or state's outline. The data
 * cells count by the share of them inside `geometry`; `bbox` is its envelope.
 */
export interface AnalysisArea {
  /** Changes whenever the shape changes, so it can key loaded records. */
  id: string;
  name: string;
  kind: "drawn" | "state" | "municipality" | "preset";
  geometry: PolygonGeometry;
  bbox: BBox;
}

/** Envelope of a polygon as [west, south, east, north]. */
export function geometryEnvelope(geometry: PolygonGeometry): BBox {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const rings of polygons)
    for (const ring of rings)
      for (const [x, y] of ring) {
        w = Math.min(w, x);
        e = Math.max(e, x);
        s = Math.min(s, y);
        n = Math.max(n, y);
      }
  return [w, s, e, n];
}

/** A closed GeoJSON ring from an open list of vertices. */
export function closeRing(vertices: number[][]): number[][] {
  return [...vertices.map((p) => [p[0], p[1]]), [vertices[0][0], vertices[0][1]]];
}

/** The vertices of a closed GeoJSON ring, without the repeated last point. */
export function openRing(ring: number[][]): [number, number][] {
  const last = ring.length - 1;
  const closed = last > 0 && ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1];
  return (closed ? ring.slice(0, last) : ring).map((p) => [p[0], p[1]] as [number, number]);
}

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** A drawn area from its vertices, in order, without the repeated last point. */
export function drawnArea(vertices: number[][], name = "Custom area"): AnalysisArea {
  const ring = closeRing(vertices.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]));
  const geometry: PolygonGeometry = { type: "Polygon", coordinates: [ring] };
  return { id: `drawn:${hash(JSON.stringify(ring))}`, name, kind: "drawn", geometry, bbox: geometryEnvelope(geometry) };
}

/** A rectangle as a four-vertex drawn area. */
export function rectangleArea([w, s, e, n]: BBox, name?: string): AnalysisArea {
  return drawnArea(
    [
      [w, s],
      [e, s],
      [e, n],
      [w, n],
    ],
    name,
  );
}

/** The vertices of a drawn area, when it is a single ring that can be edited by hand. */
export function editableVertices(area: AnalysisArea | null): [number, number][] | null {
  if (!area || area.kind !== "drawn" || area.geometry.type !== "Polygon" || area.geometry.coordinates.length !== 1)
    return null;
  return openRing(area.geometry.coordinates[0]);
}

/** Largest side of an area of interest, in degrees. */
export const MAX_AREA_SIDE = 12;

/** Navigation/selection envelope. Scientific coverage is checked separately. */
export const COVERAGE: BBox = [-85, -58, -32, 14];

/** Keeps an area inside the South American envelope and allowed selection size. */
export function normalizeBBox([w, s, e, n]: BBox): BBox {
  const [cw, cs, ce, cn] = COVERAGE;
  let west = Math.max(cw, Math.min(w, e));
  let east = Math.min(ce, Math.max(w, e));
  let south = Math.max(cs, Math.min(s, n));
  let north = Math.min(cn, Math.max(s, n));
  if (east - west < 0.5) east = Math.min(ce, west + 0.5);
  if (north - south < 0.5) north = Math.min(cn, south + 0.5);
  if (east - west < 0.5) west = east - 0.5;
  if (north - south < 0.5) south = north - 0.5;
  if (east - west > MAX_AREA_SIDE) {
    const mid = (east + west) / 2;
    west = mid - MAX_AREA_SIDE / 2;
    east = mid + MAX_AREA_SIDE / 2;
  }
  if (north - south > MAX_AREA_SIDE) {
    const mid = (north + south) / 2;
    south = mid - MAX_AREA_SIDE / 2;
    north = mid + MAX_AREA_SIDE / 2;
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  return [r(west), r(south), r(east), r(north)];
}
