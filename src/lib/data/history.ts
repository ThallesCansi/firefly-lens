import { daysBetween } from "../dates";
import { prepare } from "../geo/clip";
import type { CellHistory } from "../unusual";
import { meta } from "./meta";
import { cellGeometry, loadTile, tilesFor } from "./tiles";
import type { AnalysisArea } from "./types";

let lookup: Uint16Array | null = null;
/** Month of every day of the record, counted from January of `meta.epochYear`. */
function monthOfDay(): Uint16Array {
  if (lookup) return lookup;
  const days = daysBetween(meta.epochDay, meta.lastDay) + 1;
  const out = new Uint16Array(days);
  const date = new Date(`${meta.epochDay}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    out[i] = (date.getUTCFullYear() - meta.epochYear) * 12 + date.getUTCMonth();
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return (lookup = out);
}

/**
 * The monthly record of each cell of an area: MODIS Aqua detections for every
 * month, and the harmonized VIIRS value with its variance for the modeled
 * months. One pass over the area's tiles, which the map has already fetched.
 */
export async function cellHistory(shape: AnalysisArea): Promise<CellHistory> {
  const tiles = await Promise.all(tilesFor(shape.bbox).map(([tx, ty]) => loadTile(tx, ty)));
  const polygon = prepare(shape.geometry);
  const months = (Number(meta.lastDay.slice(0, 4)) - meta.epochYear + 1) * 12;
  const firstModeled = (meta.observedUntil + 1 - meta.epochYear) * 12;
  const monthOf = monthOfDay();
  const history: CellHistory = { firstYear: meta.epochYear, aqua: new Map(), modeled: new Map() };

  for (const tile of tiles) {
    // Share of each local cell inside the area, as the area's own sums use it:
    // zero outside the area and off the grid.
    const at = Array.from(tile.biome, (_, local) => cellGeometry(tile, local, polygon));
    const w = at.map((g, local) => (tile.biome[local] !== 255 ? g.weight : 0));
    const series = (local: number) => {
      const id = at[local].id;
      let aqua = history.aqua.get(id);
      if (!aqua) history.aqua.set(id, (aqua = new Float32Array(months)));
      return aqua;
    };
    // Every cell of the area has a record, also the ones that never burned.
    w.forEach((share, local) => {
      if (share > 0) series(local);
    });
    const d = tile.daily;
    for (let i = 0; i < d.day.length; i++) {
      const local = d.cell[i];
      if (w[local] <= 0 || d.day[i] >= monthOf.length) continue;
      series(local)[monthOf[d.day[i]]] += d.aquaD[i] + d.aquaN[i];
    }
    const estimate = (local: number, month: number) => {
      const id = at[local].id;
      let cell = history.modeled.get(id);
      if (!cell) history.modeled.set(id, (cell = new Map()));
      let entry = cell.get(month);
      if (!entry) cell.set(month, (entry = [0, 0]));
      return entry;
    };
    const m = tile.monthly;
    for (let i = 0; i < m.mu.length; i++) {
      if (w[m.cell[i]] > 0 && m.month[i] >= firstModeled) estimate(m.cell[i], m.month[i])[0] = m.mu[i];
    }
    const v = tile.variance;
    for (let i = 0; i < v.value.length; i++) {
      if (w[v.cell[i]] > 0 && v.month[i] >= firstModeled) estimate(v.cell[i], v.month[i])[1] = v.value[i];
    }
  }
  return history;
}
