import type { Map as MapLibreMap, MapMouseEvent, MapTouchEvent } from "maplibre-gl";
import type { BBox } from "@/lib/data/types";
import { DEFAULT_CAMERA_PROFILE, HOME, planNavigation } from "./camera";
import { TILT_PITCH } from "./columns";
import { boundsSamples, clampPitch, normalizeBearing, pitchedPadding, viewportPadding } from "./camera-presets";
import type { CameraProfile, MapController, MapLike, MapNavigationRequest, MapPointerEvent, ProjectionMode } from "./map-contract";
import { projectionSpec, saveProjection } from "./projection";

type PointCtor = new (x: number, y: number) => { x: number; y: number };

export interface EngineHooks {
  /** Called after the projection really changed (or fell back to the flat map). */
  onProjection(mode: ProjectionMode, fellBack: boolean): void;
  onFlightChange?(running: boolean): void;
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
  let locked = false;
  let tutorial = false;
  let profile: CameraProfile = DEFAULT_CAMERA_PROFILE;
  let generation = 0;
  let frame = 0;
  let pending: MapNavigationRequest | null = null;
  let active: { generation: number; bounds?: BBox; corrections: number } | null = null;
  let beforeTilt: { pitch: number; bearing: number } | null = null;
  /** The area the camera last framed, until the person moves the map themself. */
  let framed: BBox | null = null;
  const invalidate = (forget = true) => {
    const owned = !!(frame || pending || active);
    generation++;
    cancelAnimationFrame(frame);
    frame = 0; pending = null; active = null;
    if (forget) framed = null;
    if (owned) hooks.onFlightChange?.(false);
  };
  const stop = (forget = true) => { invalidate(forget); map.stop(); };
  // MapLibre's own input pipeline interrupts its animation scheduler. Calling
  // Map.stop here also resets native handlers and clears their inertia, losing
  // all but the first drag frame. Gestures invalidate only our pending work.
  const gesture = () => invalidate();
  const canvas = map.getCanvas();
  // Capture before MapLibre starts a gesture; never resume a cancelled flight.
  for (const type of ["pointerdown", "touchstart", "wheel", "keydown"]) canvas.addEventListener(type, gesture, { capture: true, passive: true });
  map.on("movestart", (e) => { if ((e as { originalEvent?: unknown }).originalEvent) invalidate(); });
  const applyLocks = () => {
    for (const h of [map.dragPan, map.scrollZoom, map.boxZoom, map.doubleClickZoom, map.touchZoomRotate, map.keyboard]) {
      if (locked || tutorial) h.disable(); else h.enable();
    }
    for (const h of [map.dragRotate, map.touchPitch]) {
      if (tilted && !locked && !tutorial) h.enable(); else h.disable();
    }
  };
  const motionPreference = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const motionChanged = () => { if (motionPreference?.matches) stop(); };
  motionPreference?.addEventListener("change", motionChanged);
  map.on("remove", () => {
    cancelAnimationFrame(frame); generation++; pending = null; active = null;
    motionPreference?.removeEventListener("change", motionChanged);
    for (const type of ["pointerdown", "touchstart", "wheel", "keydown"]) canvas.removeEventListener(type, gesture, true);
  });

  // Only the current animation may validate its arrival. stop() invalidates it
  // before MapLibre emits moveend, including events fired synchronously.
  map.on("moveend", (event) => {
    if (!active || (event as { navigationGeneration?: number }).navigationGeneration !== active.generation) return;
    const current = active;
    if (current.bounds && map.getPitch() > 0 && current.corrections < 1 && !locked && !tutorial) {
      const padding = cameraPadding(map);
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      const margin = 8;
      const cx = (padding.left + w - padding.right) / 2, cy = (padding.top + h - padding.bottom) / 2;
      const halfWidth = Math.max(1, (w - padding.left - padding.right) / 2 + margin);
      const halfHeight = Math.max(1, (h - padding.top - padding.bottom) / 2 + margin);
      const overflow = Math.max(1, ...boundsSamples(current.bounds).map((point) => {
        const p = map.project(point);
        return Number.isFinite(p.x) && Number.isFinite(p.y) ? Math.max(Math.abs(p.x - cx) / halfWidth, Math.abs(p.y - cy) / halfHeight) : 2;
      }));
      if (overflow > 1) {
        current.corrections++;
        // Bounded settling adjustment; no timer or idle listener can restart it.
        const adjustment = Math.min(1.5, Math.log2(overflow) + 0.08);
        map.easeTo({ zoom: Math.max(map.getMinZoom(), map.getZoom() - adjustment), duration: prefersReducedMotion() ? 0 : 420, essential: false }, { navigationGeneration: current.generation });
        return;
      }
    }
    active = null;
    hooks.onFlightChange?.(false);
  });

  const execute = (request: MapNavigationRequest) => {
    const c = map.getCenter();
    const effectiveProfile = tutorial ? "standard" : profile;
    const plan = planNavigation(request, { center: [c.lng, c.lat], zoom: map.getZoom(), projection }, prefersReducedMotion(), effectiveProfile);
    const cinematic = !tutorial && profile === "cinematic" && (!request.source || request.source === "user");
    const standardNavigation = !tutorial && profile === "standard" && (!request.source || request.source === "user");
    // A profile change retains the physical pose. The next Standard navigation
    // starts from traditional north-up/top-down defaults, not an inherited
    // cinematic arrival. Explicit attitude, column tilt and restoration win.
    const attitude = { bearing: normalizeBearing(request.bearing ?? (plan.bounds && !cinematic || standardNavigation && !tilted ? 0 : map.getBearing())),
      pitch: clampPitch(request.pitch ?? (standardNavigation ? (tilted ? TILT_PITCH : 0)
        : cinematic && request.bounds ? (tilted ? TILT_PITCH : 35) : map.getPitch())) };
    const padding = cameraPadding(map);
    const eventData = { navigationGeneration: generation };
    framed = plan.bounds ?? null;
    active = { generation, bounds: plan.bounds, corrections: 0 };
    const options = { duration: plan.duration, essential: false, ...attitude };
    if (plan.bounds) {
      const [w, s, e, n] = plan.bounds;
      const container = map.getContainer();
      const fit = map.cameraForBounds([w, s, e, n], {
        padding: pitchedPadding(padding, container.clientWidth, container.clientHeight, attitude.pitch),
        absolutePadding: true, bearing: attitude.bearing,
        ...(plan.maxZoom === undefined ? {} : { maxZoom: plan.maxZoom }),
      });
      if (!fit) { stop(); return; }
      const destination = { ...fit, ...options };
      if (plan.duration === 0) map.jumpTo(destination, eventData);
      else if (cinematic || request.animation === "fly") map.flyTo({ ...destination, ...(plan.curve === undefined ? {} : { curve: plan.curve }) }, eventData);
      else map.easeTo(destination, eventData);
    } else {
      // Reset retained fit padding when navigating to a point/explicit pose.
      const destination = { center: plan.center, zoom: plan.zoom, padding: request.padding ?? { top: 0, bottom: 0, left: 0, right: 0 }, ...options };
      if (plan.method === "flyTo") map.flyTo({ ...destination, curve: plan.curve }, eventData);
      else if (plan.method === "easeTo") map.easeTo(destination, eventData);
      else map.jumpTo(destination, eventData);
    }
  };

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
    /**
     * Engine only: leans the camera over for the 3D columns and lets a drag with
     * the right button (or two fingers) orbit; false brings it back to straight
     * down, north up, where rotating adds nothing.
     */
    setTilt(on: boolean): void;
  } = {
    navigate(request: MapNavigationRequest) {
      if (tutorial && request.source !== "tutorial" && request.source !== "restore") return;
      if (locked && request.source !== "restore" && request.source !== "tutorial") return;
      stop(false);
      pending = request;
      hooks.onFlightChange?.(true);
      // Coalesce React's selection and column-tilt effects into one camera call.
      frame = requestAnimationFrame(() => {
        frame = 0;
        const next = pending; pending = null;
        if (next) execute(next);
      });
    },
    stopNavigation: () => stop(),
    setCameraProfile(next) { profile = next; },
    setTutorialActive(next) { if (tutorial !== next) { stop(); tutorial = next; applyLocks(); } },
    getCameraPose() {
      const c = map.getCenter();
      return { center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), projection,
        padding: { top: 0, bottom: 0, left: 0, right: 0, ...map.getPadding() } };
    },
    restoreCamera(pose) {
      stop();
      if (projection !== pose.projection) applyProjection(pose.projection);
      controller.navigate({ id: "restore-camera", ...pose, animation: "jump", source: "restore" });
    },
    resetView() {
      // Home also faces north again, at the angle of the current view.
      controller.navigate(
        { id: `home-${Date.now()}`, center: HOME.center, zoom: HOME.zoom[projection], animation: "ease", bearing: 0, pitch: tilted ? TILT_PITCH : 0 },
      );
    },
    getProjection: () => projection,
    setProjection(mode: ProjectionMode) {
      if (mode === projection) return;
      stop();
      saveProjection(mode);
      applyProjection(mode);
    },
    lockCamera(next: boolean) {
      locked = next;
      if (next) stop();
      applyLocks();
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
      stop();
      styleReady = false;
    },
    isOnSurface: onSurface,
    refit() {
      if (!framed || pending || active || locked || tutorial) return;
      controller.navigate({ id: "resize-fit", bounds: framed, bearing: map.getBearing(), pitch: map.getPitch(), source: "layout", animation: "jump" });
    },
    setTilt(on: boolean) {
      if (tilted === on) return;
      if (on) beforeTilt = { pitch: map.getPitch(), bearing: map.getBearing() };
      tilted = on;
      applyLocks();
      if (locked || tutorial || pending?.source === "restore") return;
      const attitude = on ? { pitch: TILT_PITCH, bearing: map.getBearing() }
        : profile === "cinematic" ? beforeTilt ?? { pitch: 0, bearing: 0 } : { pitch: 0, bearing: 0 };
      const c = map.getCenter();
      controller.navigate({ ...(pending ?? (framed ? { bounds: framed } : { center: [c.lng, c.lat] as [number, number], zoom: map.getZoom() })), id: pending?.id ?? "column-tilt",
        ...attitude, animation: pending?.animation ?? "ease" });
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
  const cards = container.closest(".workspace-map")?.querySelectorAll<HTMLElement>(".selection-card, .explore-hint, .map-card");
  const origin = container.getBoundingClientRect();
  return viewportPadding(w, h, Array.from(cards ?? []).map((element) => {
    const r = element.getBoundingClientRect();
    return { left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top };
  }));
}
