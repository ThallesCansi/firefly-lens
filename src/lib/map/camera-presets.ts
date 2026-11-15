import type { BBox } from "../data/types";
import type { CameraPose, MapNavigationRequest } from "./map-contract";

export type CameraAction = "earth" | "brazil" | "pantanal" | "selected" | "north" | "top";
/** Extent of the existing Brazil outline, including its Atlantic islands. */
export const BRAZIL_BOUNDS: BBox = [-73.990449969, -33.743905028, -28.847850788, 5.271841077];

/** A globe disk fits the shorter viewport dimension, rather than a world bbox. */
export function earthZoom(width: number, height: number): number {
  return Math.max(-1.5, Math.min(2.3, Math.log2(Math.max(100, Math.min(width, height)) / 512) + 1.2));
}
export const clampPitch = (pitch: number) => Math.max(0, Math.min(60, Number.isFinite(pitch) ? pitch : 0));
export const normalizeBearing = (bearing: number) => Number.isFinite(bearing) ? ((bearing + 180) % 360 + 360) % 360 - 180 : 0;

export function presetRequest(action: CameraAction, pose: CameraPose, width: number, height: number,
  pantanal: BBox, selected: BBox | null): MapNavigationRequest | null {
  const common = { id: `camera-${action}`, source: "user" as const };
  switch (action) {
    case "earth": return { ...common, center: [-54, -14], zoom: earthZoom(width, height), pitch: 0, bearing: 0 };
    case "brazil": return { ...common, bounds: BRAZIL_BOUNDS, pitch: 0, bearing: 0 };
    case "pantanal": return { ...common, bounds: pantanal, maxZoom: 8 };
    case "selected": return selected ? { ...common, bounds: selected } : null;
    case "north": return { ...common, center: pose.center, zoom: pose.zoom, pitch: pose.pitch, bearing: 0, animation: "ease" };
    case "top": return { ...common, center: pose.center, zoom: pose.zoom, pitch: 0, bearing: 0, animation: "ease" };
  }
}

export type Padding = { top: number; bottom: number; left: number; right: number };
export function viewportPadding(width: number, height: number, cards: { left: number; top: number; right: number; bottom: number }[] = []): Padding {
  const padding = { top: Math.min(90, height * 0.15), bottom: Math.min(160, height * 0.25),
    left: Math.min(90, width * 0.2), right: Math.min(60, width * 0.12) };
  for (const card of cards) {
    if (card.right <= card.left || card.bottom <= card.top) continue;
    const wide = card.right - card.left > width * 0.5;
    if (wide && card.top > height * 0.4) padding.bottom = Math.max(padding.bottom, Math.min(height * 0.48, height - card.top + 16));
    else if (card.top < height * 0.25 && card.right - card.left > width * 0.35)
      padding.top = Math.max(padding.top, Math.min(height * 0.35, card.bottom + 16));
    else if (card.right + 24 < width * 0.45) padding.left = Math.max(padding.left, card.right + 24);
  }
  return padding;
}
/** Reserve perspective headroom using the actual drawable viewport dimensions. */
export function pitchedPadding(padding: Padding, width: number, height: number, pitch: number): Padding {
  const lean = Math.sin(clampPitch(pitch) * Math.PI / 180);
  const w = Math.max(0, width - padding.left - padding.right);
  const h = Math.max(0, height - padding.top - padding.bottom);
  return { top: padding.top + h * lean * 0.25, bottom: padding.bottom + h * lean * 0.25,
    left: padding.left + w * lean * 0.12, right: padding.right + w * lean * 0.12 };
}

/** Sample edges and interior, including curved globe edges, for arrival validation. */
export function boundsSamples([w, s, e, n]: BBox): [number, number][] {
  return Array.from({ length: 25 }, (_, i) => [w + (e - w) * (i % 5) / 4, s + (n - s) * Math.floor(i / 5) / 4]);
}
