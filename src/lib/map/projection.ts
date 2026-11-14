import type { ProjectionMode } from "./map-contract";

export const DEFAULT_PROJECTION: ProjectionMode = "globe";

const KEY = "firefly-lens-projection";

/** The projection the person chose last time, or the default. Storage may be unavailable. */
export function readProjection(): ProjectionMode {
  try {
    const value = localStorage.getItem(KEY);
    return value === "globe" || value === "mercator" ? value : DEFAULT_PROJECTION;
  } catch {
    return DEFAULT_PROJECTION;
  }
}

export function saveProjection(mode: ProjectionMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private windows and blocked storage: the choice simply is not remembered.
  }
}

/** MapLibre's projection type for a mode. "globe" turns flat on its own past zoom ~11. */
export const projectionSpec = (mode: ProjectionMode) => ({ type: mode });

/**
 * Sky and atmosphere for the globe. The globe hangs in space in both themes,
 * so both get a blue atmosphere; the dark theme's is a little stronger.
 */
export function skyFor(theme: "light" | "dark") {
  return {
    "sky-color": "#050a14",
    "horizon-color": "#7fb2ff",
    "fog-color": "#050a14",
    "sky-horizon-blend": 0.5,
    "horizon-fog-blend": 0.6,
    "fog-ground-blend": 0,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, theme === "dark" ? 1 : 0.9, 5, 0.7, 7, 0],
  };
}
