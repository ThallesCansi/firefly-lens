/**
 * Contract between the map engine (HotspotMap) and the tools built around it.
 *
 * The map engine owns the MapLibre instance: projection, camera, basemap,
 * themes and the data layers. Search, area selection and analysis tools talk
 * to it only through the types below, so they can be built and tested without
 * editing HotspotMap.
 *
 * Coordinates are always [longitude, latitude] in degrees (WGS84), and every
 * bounding box is [west, south, east, north], like `BBox` in src/lib/data/types.
 */

import type { BBox } from "@/lib/data/types";

/** How the Earth is drawn. "globe" is the default and becomes flat by itself at street zooms. */
export type ProjectionMode = "globe" | "mercator";

/**
 * What a pointer gesture on the map does.
 * - navigate: drag moves the camera (rotates the globe).
 * - draw-rectangle: drag draws a new area; the camera is locked.
 * - edit-rectangle: a tool moves or resizes the current area; it locks the camera itself
 *   while one of its handles is dragged (see MapController.lockCamera).
 * - pick-administrative: a click selects a state, biome or country; drag still navigates.
 */
export type MapInteractionMode = "navigate" | "draw-rectangle" | "edit-rectangle" | "pick-administrative";

/** How a camera move should feel. */
export type MapAnimation =
  /** A curved flight, scaled to the distance travelled (default for search results). */
  | "fly"
  /** A straight, shorter glide (default for small adjustments and fitting an area). */
  | "ease"
  /** No animation. Always used when the person asked for reduced motion. */
  | "jump";

/** A request to move the camera. Give either `bounds`, or `center` (with an optional `zoom`). */
export interface MapNavigationRequest {
  /** Changes on every new request, so the same place can be requested twice. */
  id: number | string;
  center?: [number, number];
  zoom?: number;
  /** Area to frame. West may be greater than east when the area crosses the antimeridian. */
  bounds?: BBox;
  /** Never zoom in past this when framing `bounds`. */
  maxZoom?: number;
  animation?: MapAnimation;
}

/** The area the analysis runs on. Rectangles exist today; administrative areas come next. */
export type SelectedArea =
  | { kind: "rectangle"; bbox: BBox }
  | {
      kind: "administrative";
      /** Stable id, for example "state:MT" or "biome:Pantanal". */
      id: string;
      name: string;
      /** Envelope of the geometry, for framing and for the data tiles. */
      bbox: BBox;
      /** Polygon or MultiPolygon in GeoJSON coordinates; optional when only the id is needed. */
      geometry?: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] };
    };

/** A pointer event on the map, already converted to geography. */
export interface MapPointerEvent {
  type: "down" | "move" | "up" | "click";
  /** Null when the pointer is off the Earth (in space around the globe, or above the horizon). */
  lngLat: [number, number] | null;
  /** Pixel position inside the map container. */
  point: [number, number];
  pointerType: "mouse" | "touch";
  /** Ids of rendered map features under the pointer, when the tool asked for layers to be queried. */
  features?: { layer: string; properties: Record<string, unknown> }[];
}

export type MapClickHandler = (event: MapPointerEvent) => void;
export type SelectionChangeHandler = (area: SelectedArea | null) => void;

/**
 * The handle a tool receives from HotspotMap (via `onReady`). Everything a
 * selection or search tool needs, without touching the MapLibre instance.
 */
export interface MapController {
  /** Moves the camera; a newer request cancels the one in flight. */
  navigate(request: MapNavigationRequest): void;
  /** Back to the initial view of Brazil. */
  resetView(): void;
  getProjection(): ProjectionMode;
  /** Switches projection keeping the camera centre and zoom. */
  setProjection(mode: ProjectionMode): void;
  /** Stops pan, zoom and rotation while a tool drags something; call again with false to release. */
  lockCamera(locked: boolean): void;
  /** Subscribes to pointer events; returns the unsubscribe function. `layers` limits feature queries. */
  onPointer(handler: (event: MapPointerEvent) => void, options?: { layers?: string[] }): () => void;
  /**
   * Runs `setup` now (if the style is ready) and again after every basemap change
   * (theme switch, offline fallback), when sources and layers added by tools are lost.
   * Returns the unsubscribe function.
   */
  onStyleReady(setup: (map: MapLike) => void): () => void;
  /** Screen pixel to geography; null off the Earth. */
  unproject(point: [number, number]): [number, number] | null;
  /** Geography to screen pixel. */
  project(lngLat: [number, number]): [number, number];
  /** Current view as [west, south, east, north]. */
  getBounds(): BBox;
}

/**
 * The part of the MapLibre map a tool may use inside `onStyleReady` to add its
 * own sources and layers. Tool layers should use ids starting with "tool-" and
 * be added below "modis" so the data marks stay on top.
 */
export interface MapLike {
  addSource(id: string, source: unknown): unknown;
  getSource(id: string): unknown;
  removeSource(id: string): unknown;
  addLayer(layer: unknown, beforeId?: string): unknown;
  getLayer(id: string): unknown;
  removeLayer(id: string): unknown;
  setPaintProperty(layer: string, name: string, value: unknown): unknown;
  setLayoutProperty(layer: string, name: string, value: unknown): unknown;
}

/** Layer ids owned by the map engine. Tools may place layers before them but must not change them. */
export const ENGINE_LAYERS = ["brazil", "area", "draft", "unusual", "modis", "viirs", "modis-columns", "viirs-columns"] as const;

/** First data layer: tools insert their layers before it. */
export const FIRST_DATA_LAYER = "modis";
