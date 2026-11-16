import type { Map as MapLibreMap, MapSourceDataEvent, ErrorEvent as MapErrorEvent } from "maplibre-gl";
import { DEFAULT_IMAGERY, IMAGERY_LAYER, IMAGERY_PROVIDERS, imageryLayer, type ImageryProviderId } from "./imagery-providers";

export type ImageryPhase = "off" | "loading" | "active" | "unavailable";

/** Owns only the raster. Never replaces styles, camera or scientific layers. */
export function createImagery(map: MapLibreMap, onPhase: (phase: ImageryPhase) => void) {
  let provider = DEFAULT_IMAGERY, theme: "light" | "dark" = "light";
  let enabled = false, ready = false, disposed = false, failed = false;
  let generation = 0, source: string | undefined, before: string | undefined;
  let phase: ImageryPhase = "off";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  const publish = (next: ImageryPhase) => { if (!disposed && next !== phase) { phase = next; onPhase(next); } };
  const detach = () => {
    generation++; clearTimeout(timer); timer = undefined; unsubscribe?.(); unsubscribe = undefined;
    if (map.getLayer(IMAGERY_LAYER)) map.removeLayer(IMAGERY_LAYER);
    if (source && map.getSource(source)) map.removeSource(source);
    source = undefined;
  };
  const install = () => {
    if (disposed || !ready || !enabled || failed || source) return;
    const token = ++generation;
    // Unique IDs also reject late events delivered by a previous provider/style.
    const id = `imagery-${provider}-${token}`;
    source = id;
    const current = () => !disposed && ready && enabled && generation === token;
    const fail = () => queueMicrotask(() => {
      if (!current()) return;
      failed = true; detach(); publish("unavailable");
    });
    const data = (event: MapSourceDataEvent) => {
      if (current() && event.sourceId === id && (event.tile || event.sourceDataType === "content") && map.isSourceLoaded(id)) {
        clearTimeout(timer); timer = undefined; publish("active");
      }
    };
    const error = (event: MapErrorEvent) => {
      if ((event as MapErrorEvent & { sourceId?: string }).sourceId === id && !/abort/i.test(event.error?.message ?? "")) fail();
    };
    map.on("sourcedata", data); map.on("error", error);
    unsubscribe = () => { map.off("sourcedata", data); map.off("error", error); };
    publish("loading");
    try {
      const spec = IMAGERY_PROVIDERS[provider].source;
      map.addSource(id, { ...spec });
      map.addLayer(imageryLayer(provider, theme, id), before && map.getLayer(before) ? before : undefined);
      timer = setTimeout(fail, 25_000);
    } catch { fail(); }
  };
  return {
    configure(next: ImageryProviderId, visible: boolean, nextTheme: "light" | "dark") {
      if (disposed || (provider === next && enabled === visible && theme === nextTheme)) return;
      detach(); provider = next; enabled = visible; theme = nextTheme; failed = false;
      if (!enabled) publish("off"); else { publish("loading"); install(); }
    },
    retry() { if (!disposed && enabled) { detach(); failed = false; install(); } },
    styleLoading() { if (!disposed) { ready = false; detach(); failed = false; publish(enabled ? "loading" : "off"); } },
    styleLoaded() {
      if (disposed || ready) return;
      ready = true; failed = false;
      const layers = map.getStyle().layers;
      const at = layers.findIndex((layer) => layer.id === IMAGERY_LAYER);
      before = at >= 0 ? layers[at + 1]?.id : undefined;
      // The style's hidden raster is an insertion anchor, not a second loader.
      if (at >= 0) map.removeLayer(IMAGERY_LAYER);
      if (map.getSource(IMAGERY_LAYER)) map.removeSource(IMAGERY_LAYER);
      install();
    },
    dispose() { if (!disposed) { detach(); disposed = true; } },
  };
}
export type ImageryManager = ReturnType<typeof createImagery>;
