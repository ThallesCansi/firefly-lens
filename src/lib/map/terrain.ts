import type { Map as MapLibreMap, MapSourceDataEvent, ErrorEvent as MapErrorEvent, RasterDEMSourceSpecification } from "maplibre-gl";

export const TERRAIN_SOURCE = "mapterhorn-terrain";
export const TERRAIN_EXAGGERATION = 1;
export const TERRAIN_DEM: RasterDEMSourceSpecification = {
  type: "raster-dem",
  tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
  encoding: "terrarium",
  tileSize: 512,
  minzoom: 0,
  // The global archive ends here; higher zoom archives are regional.
  maxzoom: 12,
  attribution: '<a href="https://mapterhorn.com/attribution/" target="_blank" rel="noreferrer">Elevation: © Mapterhorn / source attribution</a>',
};
export type TerrainPhase = "off" | "loading" | "active" | "unavailable";

/** Presentation only: never writes the user's column preference or sensor data. */
export function terrainPresentation(requested: boolean, suspended: boolean, phase: TerrainPhase, columnsChosen: boolean, forceColumns: boolean) {
  const terrainEnabled = requested && !suspended && phase !== "unavailable";
  return { terrainEnabled, inColumns: forceColumns || (columnsChosen && !terrainEnabled) };
}

/** Owns only DEM resources. Camera movement and gesture handling stay in the controller. */
export function createTerrain(map: MapLibreMap, onPhase: (phase: TerrainPhase) => void) {
  let enabled = false, ready = false, disposed = false, failed = false;
  let generation = 0, phase: TerrainPhase = "off";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeListeners: (() => void) | undefined;
  const publish = (next: TerrainPhase) => { if (!disposed && phase !== next) { phase = next; onPhase(next); } };
  const detach = () => {
    generation++;
    clearTimeout(timer); timer = undefined;
    removeListeners?.(); removeListeners = undefined;
    if (map.getTerrain()?.source === TERRAIN_SOURCE) map.setTerrain(null);
    if (map.getSource(TERRAIN_SOURCE)) map.removeSource(TERRAIN_SOURCE);
  };
  const install = () => {
    if (disposed || !enabled || !ready || failed || map.getTerrain()?.source === TERRAIN_SOURCE) return;
    const token = ++generation;
    const current = () => !disposed && ready && enabled && token === generation;
    const fail = () => {
      // Tile errors can fire inside a style update. Detach after its stack has
      // finished; an off toggle/style replacement invalidates this callback.
      queueMicrotask(() => {
        if (!current()) return;
        failed = true; detach(); publish("unavailable");
      });
    };
    const data = (event: MapSourceDataEvent) => {
      // In 6.18 individual decoded raster-DEM tiles emit `tile` without a
      // sourceDataType; `content` alone is not a reliable readiness signal.
      if (current() && event.sourceId === TERRAIN_SOURCE && (event.tile || event.sourceDataType === "content") && map.isSourceLoaded(TERRAIN_SOURCE)) {
        clearTimeout(timer); timer = undefined; publish("active");
      }
    };
    const error = (event: MapErrorEvent) => {
      if ((event as MapErrorEvent & { sourceId?: string }).sourceId === TERRAIN_SOURCE && !/abort/i.test(event.error?.message ?? "")) fail();
    };
    map.on("sourcedata", data); map.on("error", error);
    removeListeners = () => { map.off("sourcedata", data); map.off("error", error); };
    publish("loading");
    try {
      if (!map.getSource(TERRAIN_SOURCE)) map.addSource(TERRAIN_SOURCE, { ...TERRAIN_DEM });
      map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION });
      timer = setTimeout(fail, 25_000);
    } catch { fail(); }
  };
  return {
    setEnabled(next: boolean) {
      if (disposed || next === enabled) return;
      enabled = next;
      if (!next) { failed = false; detach(); publish("off"); }
      else { publish("loading"); install(); }
    },
    styleLoading() {
      detach(); ready = false; failed = false;
      publish(enabled ? "loading" : "off");
    },
    styleLoaded() { if (!disposed) { ready = true; install(); } },
    dispose() { if (!disposed) { detach(); disposed = true; } },
  };
}
export type TerrainManager = ReturnType<typeof createTerrain>;
