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

/** Sky and atmosphere for the globe, per theme. The flat map ignores them. */
export function skyFor(theme: "light" | "dark") {
  return theme === "dark"
    ? {
        "sky-color": "#0b1020",
        "horizon-color": "#1b2a44",
        "fog-color": "#0b1020",
        "sky-horizon-blend": 0.5,
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 5, 0.6, 7, 0],
      }
    : {
        "sky-color": "#dfe9f5",
        "horizon-color": "#ffffff",
        "fog-color": "#dfe9f5",
        "sky-horizon-blend": 0.5,
        "horizon-fog-blend": 0.6,
        "fog-ground-blend": 0,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 5, 0.4, 7, 0],
      };
}
