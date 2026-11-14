import type { BBox } from "@/lib/data/types";
import type { MapAnimation, MapNavigationRequest, ProjectionMode } from "./map-contract";

/** The view the map opens on: Brazil, whole, with some of the Atlantic around it. */
export const HOME = { center: [-54, -14] as [number, number], zoom: { globe: 2.6, mercator: 3 } };

/** Highest latitude the flat map can frame; the globe has no such limit. */
const MERCATOR_MAX_LAT = 85;

const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm([lon1, lat1]: [number, number], [lon2, lat2]: [number, number]): number {
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Longitude folded into [-180, 180). */
export function wrapLng(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * Bounds ready for MapLibre's fitBounds: latitudes kept inside what the
 * projection can frame, and an area that crosses the antimeridian (west > east)
 * unwrapped so east is just past 180 instead of jumping back to -180.
 */
export function safeBounds([w, s, e, n]: BBox, projection: ProjectionMode): BBox {
  const limit = projection === "mercator" ? MERCATOR_MAX_LAT : 89.9;
  const south = Math.max(-limit, Math.min(s, n));
  const north = Math.min(limit, Math.max(s, n));
  const west = wrapLng(w);
  let east = wrapLng(e);
  if (east < west) east += 360;
  return [west, south, east, north];
}

/** Centre of a bounding box, antimeridian-aware. */
export function boundsCenter(bounds: BBox): [number, number] {
  const [w, s, e, n] = safeBounds(bounds, "globe");
  return [wrapLng((w + e) / 2), (s + n) / 2];
}

/**
 * Flight time in milliseconds: short hops stay short, a flight across an ocean
 * takes a few seconds, and nothing drags on.
 */
export function flightDuration(from: [number, number], to: [number, number], zoomFrom: number, zoomTo: number): number {
  const km = distanceKm(from, to);
  const zoomChange = Math.abs(zoomTo - zoomFrom);
  const ms = 700 + 650 * Math.log2(1 + km / 400) + 120 * zoomChange;
  return Math.round(Math.min(4000, Math.max(700, ms)));
}

export interface CameraPlan {
  method: "flyTo" | "easeTo" | "fitBounds" | "jumpTo";
  center?: [number, number];
  zoom?: number;
  bounds?: BBox;
  maxZoom?: number;
  duration: number;
  /** flyTo only: how much the flight zooms out on the way (MapLibre's `curve`). */
  curve?: number;
}

/**
 * Turns a navigation request into one MapLibre camera call. Pure, so it can be
 * tested without a map.
 */
export function planNavigation(
  request: MapNavigationRequest,
  camera: { center: [number, number]; zoom: number; projection: ProjectionMode },
  reducedMotion: boolean,
): CameraPlan {
  const target = request.bounds ? boundsCenter(request.bounds) : (request.center ?? camera.center);
  const zoomTo = request.zoom ?? camera.zoom;
  const animation: MapAnimation = reducedMotion ? "jump" : (request.animation ?? (request.bounds ? "ease" : "fly"));
  const travel = flightDuration(camera.center, target, camera.zoom, zoomTo);
  if (request.bounds) {
    return {
      method: "fitBounds",
      bounds: safeBounds(request.bounds, camera.projection),
      ...(request.maxZoom === undefined ? {} : { maxZoom: request.maxZoom }),
      duration: animation === "jump" ? 0 : animation === "fly" ? travel : Math.min(1200, travel),
    };
  }
  if (animation === "jump") return { method: "jumpTo", center: target, zoom: zoomTo, duration: 0 };
  if (animation === "ease") return { method: "easeTo", center: target, zoom: zoomTo, duration: Math.min(1200, travel) };
  // A gentler arc on the globe, where zooming out shows the Earth turning underneath.
  return { method: "flyTo", center: target, zoom: zoomTo, duration: travel, curve: camera.projection === "globe" ? 1.6 : 1.42 };
}

/** True when every corner of `inner` lies inside `outer` (both [w, s, e, n], no antimeridian crossing). */
export function boundsContain(outer: BBox, inner: BBox): boolean {
  return inner[0] >= outer[0] && inner[2] <= outer[2] && inner[1] >= outer[1] && inner[3] <= outer[3];
}
