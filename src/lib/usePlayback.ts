"use client";
import { useEffect, useState } from "react";
import { cellDays, type CellCount } from "./data/area";
import type { AnalysisArea } from "./data/types";
import { rawPilotFor } from "./data/coverage";
import { rawPilotMonths } from "./data/raw-pilot";

/** Months from `from` to `to` inclusive, as YYYY-MM. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  while (y * 12 + m <= end) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export interface PlaybackFrames {
  /** Cells per month, cells without detections left out. */
  months: Map<string, CellCount[]>;
  /** Busiest cell of any month in the range, per sensor: one scale for every frame. */
  top: { modis: number; viirs: number };
}

/**
 * Every month of a time-lapse, loaded in one pass over the area's tiles, so
 * playing never waits on the network between frames. Sharing one scale across
 * the frames lets a quiet month look quiet next to a busy one.
 */
export function usePlaybackFrames(area: AnalysisArea | null, from: string, to: string, enabled: boolean) {
  const key = area && enabled ? `${area.id}|${from}|${to}` : null;
  const [state, setState] = useState<{ key: string; frames: PlaybackFrames | null; error: boolean } | null>(null);
  useEffect(() => {
    if (!area || !enabled) return;
    let live = true;
    const key = `${area.id}|${from}|${to}`;
    const controller = new AbortController();
    const done = (frames: PlaybackFrames) => { if (live) setState({ key, frames, error: false }); };
    const fail = () => { if (live) setState({ key, frames: null, error: true }); };
    // A country: its raw detections, one daily partition per month.
    if (rawPilotFor(area)) {
      rawPilotMonths(area, monthsBetween(from, to), controller.signal)
        .then((months) => {
          let modis = 1;
          let viirs = 1;
          for (const cells of months.values())
            for (const cell of cells) {
              if (cell.modis > modis) modis = cell.modis;
              if (cell.viirs > viirs) viirs = cell.viirs;
            }
          done({ months, top: { modis, viirs } });
        })
        .catch(fail);
      return () => {
        live = false;
        controller.abort();
      };
    }
    const last = new Date(Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)), 0)).getUTCDate();
    cellDays(area, `${from}-01`, `${to}-${last}`)
      .then((rows) => {
        const months = new Map<string, Map<number, CellCount>>();
        let modis = 1;
        let viirs = 1;
        for (const row of rows) {
          const month = row.date.slice(0, 7);
          let cells = months.get(month);
          if (!cells) months.set(month, (cells = new Map()));
          let cell = cells.get(row.cell.id);
          if (!cell) cells.set(row.cell.id, (cell = { ...row.cell, modis: 0, viirs: 0 }));
          cell.modis += row.aquaD + row.aquaN;
          cell.viirs += row.viirsD + row.viirsN;
          if (cell.modis > modis) modis = cell.modis;
          if (cell.viirs > viirs) viirs = cell.viirs;
        }
        const frames: PlaybackFrames = {
          months: new Map([...months].map(([m, cells]) => [m, [...cells.values()]])),
          top: { modis, viirs },
        };
        done(frames);
      })
      .catch(fail);
    return () => {
      live = false;
    };
  }, [area, from, to, enabled]);
  const current = key && state?.key === key ? state : null;
  return { frames: current?.frames ?? null, error: current?.error ?? false, loading: !!key && !current };
}
