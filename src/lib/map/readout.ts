import { meta } from "../data/meta";
import { cellIndex } from "../data/tiles";

/** Id of the grid cell that holds a point, the same id the data tiles give their cells. */
export function cellIdAt(lon: number, lat: number): number {
  const [x0, y0] = meta.origin;
  return cellIndex(lat, y0) * 1000 + cellIndex(lon, x0);
}

/** Outline of the 0.25° cell centred on a point, as a closed ring. */
export function cellRing(lon: number, lat: number): [number, number][] {
  const h = meta.cellDeg / 2;
  return [
    [lon - h, lat - h],
    [lon + h, lat - h],
    [lon + h, lat + h],
    [lon - h, lat + h],
    [lon - h, lat - h],
  ];
}

/** Gap between the pointer and the readout, in pixels. */
const OFFSET = 16;

/**
 * Where the readout goes: below and to the right of the pointer, switching
 * side when it would leave the map, so it never covers the cell it describes
 * and is never cut off.
 */
export function placeReadout(
  [x, y]: [number, number],
  size: { width: number; height: number },
  map: { width: number; height: number },
): [number, number] {
  const left = x + OFFSET + size.width > map.width ? x - OFFSET - size.width : x + OFFSET;
  const top = y + OFFSET + size.height > map.height ? y - OFFSET - size.height : y + OFFSET;
  return [Math.max(0, left), Math.max(0, top)];
}

/** A cell centre in words: "12.38°S 55.63°W". */
export function cellPlace(lon: number, lat: number): string {
  const part = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(2)}°${value < 0 ? negative : positive}`;
  return `${part(lat, "N", "S")} ${part(lon, "E", "W")}`;
}
