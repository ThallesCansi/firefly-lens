import type { Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from "maplibre-gl";
import type { BBox } from "@/lib/data/types";
import { HOME, planNavigation } from "./camera";
import { TILT_PITCH } from "./columns";
import type { MapController, MapLike, MapNavigationRequest, MapPointerEvent, ProjectionMode } from "./map-contract";
import { projectionSpec, saveProjection } from "./projection";

type PointCtor = new (x: number, y: number) => { x: number; y: number };

export interface EngineHooks {
  /** Called after the projection really changed (or fell back to the flat map). */
  onProjection(mode: ProjectionMode, fellBack: boolean): void;
}

/** Whether the person asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The map engine's side of the contract in map-contract.ts: one per MapLibre
 * instance, created by HotspotMap and handed to tools through `onReady`.
 */
export function createController(map: MapLibreMap, Point: PointCtor, initial: ProjectionMode, hooks: EngineHooks) {
  let projection: ProjectionMode = initial;
  const setups = new Set<(m: MapLike) => void>();
  let styleReady = false;
  let tilted = false;
  /** The area the camera last framed, until the person moves the map themself. */
  let framed: BBox | null = null;
  map.on("movestart", (e) => {
    // Only a gesture carries the browser's event; camera moves made here do not.
    if ((e as { originalEvent?: unknown }).originalEvent) framed = null;
  });

  /** False when the pixel shows space around the globe or sky above the horizon. */
  const onSurface = ([x, y]: [number, number]): boolean => {
    // isPointOnMapSurface is MapLibre-internal; when absent every point counts as on the map.
    const transform = (map as unknown as { transform?: { isPointOnMapSurface?: (p: { x: number; y: number }) => boolean } }).transform ?? {};
    try {
      return transform.isPointOnMapSurface ? transform.isPointOnMapSurface(new Point(x, y)) : true;
    } catch {
      return true;
    }
  };

  const unproject = (point: [number, number]): [number, number] | null => {
    if (!onSurface(point)) return null;
    const ll = map.unproject(point);
    return [ll.lng, ll.lat];
  };

  const applyProjection = (mode: ProjectionMode) => {
    try {
      map.setProjection(projectionSpec(mode));
      projection = mode;
      hooks.onProjection(mode, false);
    } catch (error) {
      console.warn("FireFly Lens map: globe unavailable, using the flat map.", error);
      if (mode !== "mercator") {
        try {
          map.setProjection(projectionSpec("mercator"));
        } catch {
          // The flat map is MapLibre's own default; nothing else to try.
        }
      }
      projection = "mercator";
      hooks.onProjection("mercator", true);
    }
  };

  const controller: MapController & {
    /** Engine only: re-apply projection and run the tools' setups after a style load. */
    styleLoaded(): void;
    /** Engine only: the style is being replaced. */
    styleUnloading(): void;
    isOnSurface(point: [number, number]): boolean;
    /**
     * Engine only: frames the last area again after the map changed size (a
     * panel opened beside it), unless the person has moved the map since.
     */
    refit(): void;
    /** Engine only: a camera move that also sets where the camera faces and how far it leans. */
    navigate(request: MapNavigationRequest, attitude?: { bearing?: number; pitch?: number }): void;
    /**
     * Engine only: leans the camera over for the 3D columns and lets a drag with
     * the right button (or two fingers) orbit; false brings it back to straight
     * down, north up, where rotating adds nothing.
     */
    setTilt(on: boolean): void;
  } = {
    navigate(request: MapNavigationRequest, attitude: { bearing?: number; pitch?: number } = {}) {
      const c = map.getCenter();
      const plan = planNavigation(request, { center: [c.lng, c.lat], zoom: map.getZoom(), projection }, prefersReducedMotion());
      // A newer request replaces the flight in progress instead of queueing behind it.
      map.stop();
      const padding = cameraPadding(map);
      framed = plan.method === "fitBounds" ? (plan.bounds as BBox) : null;
      switch (plan.method) {
        case "fitBounds": {
          const [w, s, e, n] = plan.bounds as BBox;
          // Only pass maxZoom when set: an explicit undefined overrides MapLibre's default and breaks the fit.
          map.fitBounds([w, s, e, n], {
            padding,
            duration: plan.duration,
            essential: false,
            ...(plan.maxZoom === undefined ? {} : { maxZoom: plan.maxZoom }),
            ...attitude,
          });
          break;
        }
        case "flyTo":
          map.flyTo({ center: plan.center, zoom: plan.zoom, duration: plan.duration, curve: plan.curve, essential: false, ...attitude });
          break;
        case "easeTo":
          map.easeTo({ center: plan.center, zoom: plan.zoom, duration: plan.duration, essential: false, ...attitude });
          break;
        default:
          map.jumpTo({ center: plan.center, zoom: plan.zoom, ...attitude });
      }
    },
    resetView() {
      // Home also faces north again, at the angle of the current view.
      controller.navigate(
        { id: `home-${Date.now()}`, center: HOME.center, zoom: HOME.zoom[projection], animation: "ease" },
        { bearing: 0, pitch: tilted ? TILT_PITCH : 0 },
      );
    },
    getProjection: () => projection,
    setProjection(mode: ProjectionMode) {
      if (mode === projection) return;
      saveProjection(mode);
      applyProjection(mode);
    },
    lockCamera(locked: boolean) {
      const handlers = [
        map.dragPan,
        map.scrollZoom,
        map.boxZoom,
        map.doubleClickZoom,
        map.touchZoomRotate,
        map.keyboard,
        // Orbiting exists only in the tilted view; releasing the lock must not switch it on elsewhere.
        ...(tilted ? [map.dragRotate, map.touchPitch] : []),
      ];
      for (const h of handlers) {
        if (locked) h.disable();
        else h.enable();
      }
    },
    onPointer(handler, options) {
      const layers = options?.layers;
      const wrap = (type: MapPointerEvent["type"], pointerType: MapPointerEvent["pointerType"]) => (e: MapMouseEvent | MapTouchEvent) => {
        const point: [number, number] = [e.point.x, e.point.y];
        const lngLat = onSurface(point) ? ([e.lngLat.lng, e.lngLat.lat] as [number, number]) : null;
        const available = layers?.filter((id) => map.getLayer(id));
        const features = available?.length
          ? map.queryRenderedFeatures(e.point, { layers: available }).map((f) => ({ layer: f.layer.id, properties: { ...f.properties } }))
          : undefined;
        handler({ type, lngLat, point, pointerType, features });
      };
      const pairs: [string, (e: MapMouseEvent | MapTouchEvent) => void][] = [
        ["mousedown", wrap("down", "mouse")],
        ["mousemove", wrap("move", "mouse")],
        ["mouseup", wrap("up", "mouse")],
        ["click", wrap("click", "mouse")],
        ["touchstart", wrap("down", "touch")],
        ["touchmove", wrap("move", "touch")],
        ["touchend", wrap("up", "touch")],
      ];
      for (const [name, fn] of pairs) map.on(name as "click", fn as (e: MapMouseEvent) => void);
      return () => {
        for (const [name, fn] of pairs) map.off(name as "click", fn as (e: MapMouseEvent) => void);
      };
    },
    onStyleReady(setup) {
      setups.add(setup);
      if (styleReady) setup(map as unknown as MapLike);
      return () => {
        setups.delete(setup);
      };
    },
    unproject,
    project([lon, lat]) {
      const p = map.project([lon, lat]);
      return [p.x, p.y];
    },
    getBounds() {
      const b = map.getBounds();
      return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    },
    styleLoaded() {
      // A new style starts flat: the projection must be set again on every load.
      applyProjection(projection);
      styleReady = true;
      for (const setup of setups) {
        try {
          setup(map as unknown as MapLike);
        } catch (error) {
          console.warn("FireFly Lens map: a tool failed to restore its layers.", error);
        }
      }
    },
    styleUnloading() {
      styleReady = false;
    },
    isOnSurface: onSurface,
    refit() {
      if (!framed) return;
      const [w, s, e, n] = framed;
      map.stop();
      map.fitBounds([w, s, e, n], { padding: cameraPadding(map), duration: prefersReducedMotion() ? 0 : 350, essential: false });
    },
    setTilt(on: boolean) {
      tilted = on;
      for (const h of [map.dragRotate, map.touchPitch]) {
        if (on) h.enable();
        else h.disable();
      }
      map.stop();
      const attitude = { pitch: on ? TILT_PITCH : 0, bearing: on ? map.getBearing() : 0 };
      const duration = prefersReducedMotion() ? 0 : 700;
      // Stopping the camera would drop a framing still in flight: frame and lean in one move.
      const [w, s, e, n] = framed ?? [0, 0, 0, 0];
      const fit = framed ? map.cameraForBounds([w, s, e, n], { padding: cameraPadding(map) }) : undefined;
      if (fit?.center && fit.zoom !== undefined) {
        // The fit is computed looking straight down; leaning over needs a little more room.
        const zoom = fit.zoom - (on ? 0.45 : 0);
        if (duration === 0) map.jumpTo({ center: fit.center, zoom, ...attitude });
        else map.easeTo({ center: fit.center, zoom, ...attitude, duration, essential: false });
      } else if (duration === 0) map.jumpTo(attitude);
      else map.easeTo({ ...attitude, duration, essential: false });
    },
  };
  return controller;
}

export type EngineController = ReturnType<typeof createController>;

/**
 * Room around a framed area, so it clears the floating panels. The card of
 * the selected area sits over the left of the map: when the map is wide enough
 * to spare that strip, the area is framed in the space beside the card.
 */
export function cameraPadding(map: MapLibreMap) {
  const container = map.getContainer();
  const { clientHeight: h, clientWidth: w } = container;
  const padding = {
    top: Math.min(90, h * 0.15),
    bottom: Math.min(160, h * 0.25),
    left: Math.min(90, w * 0.2),
    right: Math.min(60, w * 0.12),
  };
  const card = container.closest(".workspace-map")?.querySelector(".selection-card")?.getBoundingClientRect();
  if (card && card.width > 0) {
    const edge = card.right - container.getBoundingClientRect().left + 24;
    if (edge < w * 0.45) padding.left = Math.max(padding.left, edge);
  }
  return padding;
}
