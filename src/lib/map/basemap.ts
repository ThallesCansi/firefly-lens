import type { StyleSpecification } from "maplibre-gl";

/**
 * The basemap: OpenFreeMap "Liberty", a free OpenStreetMap style with classic
 * map colours (green and tan land from Natural Earth relief at globe zooms,
 * blue water) and no API key. The dark theme uses the same map at night:
 * every colour is darkened in the browser, so both themes show the same places
 * with the same meaning.
 */
export const BASEMAP_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Shown with the source attributions MapLibre reads from the tiles. */
export const BASEMAP_ATTRIBUTION = '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Colour paint properties to rewrite; everything else in the style stays as it is. */
const COLOR_KEYS = /(^|-)color$/;

let probe: CanvasRenderingContext2D | null = null;
/** Parses any CSS colour the browser understands; null when the string is not a colour. */
function parseColor(value: string): [number, number, number, number] | null {
  if (typeof document === "undefined") return null;
  probe ??= document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  probe.fillStyle = "#010203";
  probe.fillStyle = value;
  const out = probe.fillStyle;
  if (out === "#010203" && value.trim().toLowerCase() !== "#010203") return null;
  if (out.startsWith("#")) {
    const n = parseInt(out.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = out.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = "1"] = m[1].split(",").map((s) => s.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const css = (h: number, s: number, l: number, a: number) =>
  `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`;

/** Night version of a colour: surfaces sink, text rises, hue is kept. */
export function nightColor(value: string, role: "surface" | "text" | "halo"): string {
  const c = parseColor(value);
  if (!c) return value;
  const [h, s, l] = toHsl(c[0], c[1], c[2]);
  if (role === "text") return css(h, s * 0.35, 0.9 - l * 0.35, c[3]);
  if (role === "halo") return css(h, s * 0.4, 0.07, c[3]);
  return css(h, s * 0.62, 0.05 + l * 0.27, c[3]);
}

function mapColors(value: Json, role: "surface" | "text" | "halo"): Json {
  if (typeof value === "string") return nightColor(value, role);
  if (Array.isArray(value)) return value.map((v) => mapColors(v, role));
  if (value && typeof value === "object") {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapColors(v, role);
    return out;
  }
  return value;
}

/** A layer seen as plain JSON: paint values are walked, not interpreted. */
type Layer = { type: string; paint?: Record<string, Json> };

/** Rewrites a style for the night theme. Pure apart from colour parsing. */
export function nightStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((layer) => {
    const l = layer as unknown as Layer;
    if (!l.paint) return layer;
    const paint: Record<string, Json> = {};
    for (const [key, value] of Object.entries(l.paint)) {
      if (!COLOR_KEYS.test(key)) {
        paint[key] = value;
        continue;
      }
      const role = key === "text-halo-color" ? "halo" : key.startsWith("text-") ? "text" : "surface";
      paint[key] = mapColors(value, role);
    }
    if (l.type === "raster") {
      paint["raster-brightness-max"] = 0.42;
      paint["raster-saturation"] = -0.15;
    }
    return { ...layer, paint } as unknown as typeof layer;
  });
  return { ...style, layers };
}

/** Day version: the Natural Earth relief a little stronger at globe zooms, so land reads green and tan. */
export function dayStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((layer) => {
    const l = layer as unknown as Layer;
    if (l.type !== "raster" || !l.paint) return layer;
    return { ...layer, paint: { ...l.paint, "raster-opacity": ["interpolate", ["exponential", 1.5], ["zoom"], 0, 0.95, 5, 0.6, 7, 0.15] } } as unknown as typeof layer;
  });
  return { ...style, layers };
}

export const styleFor = (theme: "light" | "dark") => (_previous: StyleSpecification | undefined, next: StyleSpecification) =>
  theme === "dark" ? nightStyle(next) : dayStyle(next);
