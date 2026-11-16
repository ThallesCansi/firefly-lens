import type { Map as MapLibreMap, RasterSourceSpecification } from "maplibre-gl";
import { COVERAGE,type BBox } from "../data/types";
import { wrapLng } from "./camera";

/** Camera centres stay in this envelope; it is not a claim of cell calibration. */
export const SOUTH_AMERICA: BBox = COVERAGE;
export const MIN_CONTINENT_ZOOM = 1.6;

export function nearContinentEdge(lng:number,lat:number) {
  const [w,s,e,n]=SOUTH_AMERICA;
  const x=wrapLng(lng);
  return x-w<4 || e-x<4 || lat-s<4 || n-lat<4;
}

export function continentCenter(lng:number,lat:number): [number,number] {
  const [w,s,e,n]=SOUTH_AMERICA;
  return [Math.max(w,Math.min(e,wrapLng(lng))),Math.max(s,Math.min(n,lat))];
}

const MASK_URL = "/interaction-boundaries/south-america-mask.geojson";
const LAYER = "outside-south-america";
/** Web Mercator's latitude limit: the picture spans the whole square world. */
const MAX_LAT = 85.0511;
const SIZE = 1024;

/** The fog's colours: thin haze to dense cloud, and its strongest opacity. */
const FOG = {
  light: { haze: [206, 216, 228], cloud: [250, 251, 253], alpha: 0.74 },
  dark: { haze: [6, 10, 20], cloud: [78, 90, 112], alpha: 0.84 },
} as const;

const mercatorY = (lat: number) => {
  const φ = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(Math.PI / 4 + φ / 2)) / Math.PI) / 2) * SIZE;
};
const mercatorX = (lng: number) => ((lng + 180) / 360) * SIZE;

/** Value noise on a lattice that wraps east–west, so the clouds have no seam at 180°. */
function cloudNoise(seed = 7) {
  const lattice = new Float32Array(256 * 256);
  let s = seed;
  for (let i = 0; i < lattice.length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    lattice[i] = s / 4294967296;
  }
  const at = (x: number, y: number, period: number) => lattice[(((y % 256) + 256) % 256) * 256 + (((x % period) + period) % period)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const octave = (u: number, v: number, period: number) => {
    const x = u * period, y = v * period;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = at(x0, y0, period), b = at(x0 + 1, y0, period);
    const c = at(x0, y0 + 1, period), d = at(x0 + 1, y0 + 1, period);
    return a + (b - a) * fx + (c - a + (a - b + d - c) * fx) * fy;
  };
  // u, v in [0, 1): four octaves, from continent-sized banks to small puffs.
  return (u: number, v: number) =>
    (octave(u, v, 7) * 0.5 + octave(u, v, 15) * 0.27 + octave(u, v, 31) * 0.15 + octave(u, v, 63) * 0.08) / 1.0;
}

type Ring = number[][];

/** The fog as a picture of the world: clear over South America, cloud elsewhere, soft between. */
function paintFog(holes: Ring[], theme: "light" | "dark"): HTMLCanvasElement {
  // 1. The continent, a little grown and blurred: how clear each pixel is.
  const clear = document.createElement("canvas");
  clear.width = clear.height = SIZE;
  const c = clear.getContext("2d", { willReadFrequently: true })!;
  // The shape is drawn off-canvas and only its shadow lands: a blur every browser supports.
  c.shadowColor = "#fff";
  c.shadowBlur = 26;
  c.shadowOffsetX = SIZE;
  c.fillStyle = c.strokeStyle = "#fff";
  c.lineWidth = 9;
  c.lineJoin = "round";
  c.beginPath();
  for (const ring of holes)
    ring.forEach(([lng, lat], i) => (i ? c.lineTo : c.moveTo).call(c, mercatorX(lng) - SIZE, mercatorY(lat)));
  c.closePath();
  c.fill();
  c.stroke();
  const mask = c.getImageData(0, 0, SIZE, SIZE).data;

  // 2. Cloud everywhere the continent is not, thicker where the noise is high.
  const out = document.createElement("canvas");
  out.width = out.height = SIZE;
  const o = out.getContext("2d")!;
  const image = o.createImageData(SIZE, SIZE);
  const px = image.data;
  const noise = cloudNoise();
  const { haze, cloud, alpha } = FOG[theme];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const open = 1 - mask[i + 3] / 255;
      const density = open * open * (3 - 2 * open);
      if (density <= 0.002) continue;
      const n = noise(x / SIZE, y / SIZE);
      const puff = Math.min(1, Math.max(0, (n - 0.3) / 0.45));
      const thick = puff * puff * (3 - 2 * puff);
      px[i] = haze[0] + (cloud[0] - haze[0]) * thick;
      px[i + 1] = haze[1] + (cloud[1] - haze[1]) * thick;
      px[i + 2] = haze[2] + (cloud[2] - haze[2]) * thick;
      px[i + 3] = 255 * alpha * density * (0.5 + 0.5 * thick);
    }
  o.putImageData(image, 0, 0);
  return out;
}

let holes: Promise<Ring[]> | null = null;
const pictures = new Map<string, Promise<HTMLCanvasElement>>();

function fogPicture(theme: "light" | "dark"): Promise<HTMLCanvasElement> {
  holes ??= fetch(MASK_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`Coverage mask: HTTP ${r.status}`);
      return r.json() as Promise<{ geometry: { type: string; coordinates: Ring[] | Ring[][] } }>;
    })
    .then(({ geometry }) => {
      // The mask is the world with South America cut out: its inner rings are the continent.
      const polygons = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as Ring[][];
      return polygons.flatMap((rings) => rings.slice(1));
    });
  holes.catch(() => { holes = null; });
  let picture = pictures.get(theme);
  if (!picture) {
    picture = holes.then((rings) => paintFog(rings, theme));
    pictures.set(theme, picture);
    picture.catch(() => pictures.delete(theme));
  }
  return picture;
}

const PROTOCOL = "firefly-fog";
let registered: Promise<void> | null = null;
/**
 * The fog reaches MapLibre as ordinary raster tiles cut from one picture of
 * the world: the globe draws tiles reliably, unlike one world-sized image.
 */
function registerFogTiles(): Promise<void> {
  registered ??= import("maplibre-gl").then(({ addProtocol }) => {
    addProtocol(PROTOCOL, async (params) => {
      const [theme, z, x, y] = params.url.slice(PROTOCOL.length + 3).split("/");
      const picture = await fogPicture(theme === "light" ? "light" : "dark");
      const span = SIZE / 2 ** Number(z);
      const data = await createImageBitmap(picture, Number(x) * span, Number(y) * span, span, span,
        { resizeWidth: 256, resizeHeight: 256, resizeQuality: "high" });
      return { data };
    });
  });
  registered.catch(() => { registered = null; });
  return registered;
}

/**
 * Basemap-only fog: the world outside South America sits under a soft bank
 * of cloud, so the covered continent stands out without a hard edge. Fire
 * activity and country selection keep their own coverage rules.
 */
const generations = new WeakMap<MapLibreMap, number>();
export function addCoverageMask(map:MapLibreMap, theme: "light" | "dark" = "dark") {
  const generation = (generations.get(map) ?? 0) + 1;
  generations.set(map, generation);
  void registerFogTiles().then(() => {
    // A newer style (a theme change) asked again meanwhile: only its own fog goes in.
    if (generations.get(map) !== generation || map.getLayer(LAYER)) return;
    map.addSource(LAYER, {
      type: "raster", tiles: [`${PROTOCOL}://${theme}/{z}/{x}/{y}`], tileSize: 256, maxzoom: 4,
    } as RasterSourceSpecification);
    map.addLayer({
      id: LAYER, type: "raster", source: LAYER,
      paint: { "raster-fade-duration": 0, "raster-resampling": "linear" },
    }, map.getLayer("brazil") ? "brazil" : undefined);
  }).catch(() => { /* No fog: the map still shows everything. */ });
}
