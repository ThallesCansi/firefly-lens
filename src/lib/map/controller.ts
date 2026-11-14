import type { Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from "maplibre-gl";
import type { BBox } from "@/lib/data/types";
import { HOME, planNavigation } from "./camera";
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
  } = {
    navigate(request: MapNavigationRequest) {
      const c = map.getCenter();
      const plan = planNavigation(request, { center: [c.lng, c.lat], zoom: map.getZoom(), projection }, prefersReducedMotion());
      // A newer request replaces the flight in progress instead of queueing behind it.
      map.stop();
      const padding = cameraPadding(map);
      switch (plan.method) {
        case "fitBounds": {
          const [w, s, e, n] = plan.bounds as BBox;
          // Only pass maxZoom when set: an explicit undefined overrides MapLibre's default and breaks the fit.
          map.fitBounds([w, s, e, n], {
            padding,
            duration: plan.duration,
            essential: false,
            ...(plan.maxZoom === undefined ? {} : { maxZoom: plan.maxZoom }),
          });
          break;
        }
        case "flyTo":
          map.flyTo({ center: plan.center, zoom: plan.zoom, duration: plan.duration, curve: plan.curve, essential: false });
          break;
        case "easeTo":
          map.easeTo({ center: plan.center, zoom: plan.zoom, duration: plan.duration, essential: false });
          break;
        default:
          map.jumpTo({ center: plan.center, zoom: plan.zoom });
      }
    },
    resetView() {
      controller.navigate({ id: `home-${Date.now()}`, center: HOME.center, zoom: HOME.zoom[projection], animation: "ease" });
    },
    getProjection: () => projection,
    setProjection(mode: ProjectionMode) {
      if (mode === projection) return;
      saveProjection(mode);
      applyProjection(mode);
    },
    lockCamera(locked: boolean) {
      const handlers = [map.dragPan, map.scrollZoom, map.boxZoom, map.doubleClickZoom, map.touchZoomRotate, map.keyboard];
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
  };
  return controller;
}

export type EngineController = ReturnType<typeof createController>;

/** Room around a framed area, so it clears the floating panels. */
export function cameraPadding(map: MapLibreMap) {
  const { clientHeight: h, clientWidth: w } = map.getContainer();
  return {
    top: Math.min(90, h * 0.15),
    bottom: Math.min(160, h * 0.25),
    left: Math.min(90, w * 0.2),
    right: Math.min(60, w * 0.12),
  };
}
