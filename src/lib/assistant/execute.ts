import { fireData } from "@/lib/data/source";
import { loadArea } from "@/lib/data/area";
import { normalizeBBox, rectangleArea, SENSORS, type AnalysisArea, type BBox, type Sensor } from "@/lib/data/types";
import { buildRecord, type FireRecord } from "@/lib/harmonize";
import { BoundaryRepository, geometryBounds } from "@/lib/interactions/administrative";
import { navigationForSearch, type SearchSuggestion } from "@/lib/interactions/navigation";
import { MONTHS } from "@/lib/format";
import type { MapDestination } from "@/components/lens/LocationSearch";

/** What the assistant can read and change in the workspace. */
export interface AssistantHost {
  area: AnalysisArea | null;
  period: string;
  sensors: Sensor[];
  analysisOpen: boolean;
  chooseArea(area: AnalysisArea): void;
  clearArea(): void;
  navigate(destination: MapDestination): void;
  setPeriod(period: string): void;
  setSensors(sensors: Sensor[]): void;
  openAnalysis(area: AnalysisArea): void;
}

export interface ToolOutcome {
  ok: boolean;
  /** What goes back to the model. */
  result: string;
  /** One line for the person, when the map changed. */
  note?: string;
}

const boundaries = new BoundaryRepository();
const records = new Map<string, Promise<FireRecord>>();

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** The map's state, prefixed to every question. */
export function describeHost(host: AssistantHost): string {
  const area = host.area ? `${host.area.name} (${host.area.kind === "state" ? "state" : "drawn area"})` : "none";
  return `<map_state>area of interest: ${area}; period shown: ${host.period}; layers: ${
    host.sensors.join(", ") || "none"
  }; analysis panel: ${host.analysisOpen ? "open" : "closed"}</map_state>`;
}

async function findState(query: string): Promise<AnalysisArea | null> {
  const features = await boundaries.load("state");
  const q = fold(query).replace(/^(estado d[eoa]s?|state of)\s+/, "");
  const entries = features.map((f) => {
    const m = /^(.*)\s+\((\w{2})\)$/.exec(f.properties.name);
    return { f, base: fold(m ? m[1] : f.properties.name), code: m ? m[2].toLowerCase() : "" };
  });
  const hit =
    entries.find((e) => e.base === q || e.code === q || fold(e.f.properties.name) === q) ??
    entries.find((e) => q.includes(e.base)) ??
    entries.find((e) => e.base.startsWith(q));
  if (!hit) return null;
  const { f } = hit;
  return {
    id: `state:${f.properties.id}`,
    name: f.properties.name,
    kind: "state",
    geometry: f.geometry,
    bbox: geometryBounds(f.geometry),
  };
}

function validPeriod(period: string): string | null {
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(period)) return "Use YYYY-MM or YYYY-MM-DD.";
  const month = Number(period.slice(5, 7));
  if (month < 1 || month > 12) return "No such month.";
  if (period.length === 10) {
    const d = new Date(`${period}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== period) return "No such day.";
  }
  const lo = fireData.firstDay.slice(0, period.length);
  const hi = fireData.lastDay.slice(0, period.length);
  if (period < lo || period > hi) return `The record runs from ${fireData.firstDay} to ${fireData.lastDay}.`;
  return null;
}

const round = (x: number) => Math.round(x);
const monthName = (m: number) => MONTHS[m];

async function history(area: AnalysisArea, fromYear: number, toYear: number): Promise<string> {
  let record = records.get(area.id);
  if (!record) {
    record = loadArea(area).then(buildRecord);
    records.set(area.id, record);
    record.catch(() => records.delete(area.id));
  }
  const r = await record;
  let from = Math.max(fireData.firstYear, Math.min(fromYear, toYear));
  const to = Math.min(fireData.lastYear, Math.max(fromYear, toYear));
  if (to - from > 9) from = to - 9;
  const months = r.months
    .filter((m) => m.year >= from && m.year <= to)
    .map((m) => ({
      month: `${monthName(m.month)} ${m.year}`,
      hotSpots: round(m.value),
      typical: round(m.median),
      rank: `${m.rank} of ${m.rankOf} for this month`,
      ...(m.source === "modeled" && m.lo !== null && m.hi !== null
        ? { modeled: `95% interval ${round(m.lo)}–${round(m.hi)}` }
        : {}),
      ...(m.partial ? { partial: true } : {}),
    }));
  return JSON.stringify({
    area: area.name,
    unit: "harmonized hot spots, MODIS Aqua scale",
    biomes: r.biomes.map((b) => `${b.name} ${Math.round(b.share * 100)}%`),
    typicalSeason: r.season
      ? `day ${r.season.startDay} to day ${r.season.endDay} of the year (${r.season.days} days)`
      : null,
    yearTotals: r.yearTotals.map((y) => ({
      year: y.year,
      hotSpots: round(y.value),
      typical: round(y.median),
      ...(y.complete ? {} : { incomplete: true }),
    })),
    months,
  });
}

/** Runs one tool call against the workspace. Never throws. */
export async function runTool(host: AssistantHost, name: string, input: Record<string, unknown>): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "select_state": {
        const area = await findState(String(input.state ?? ""));
        if (!area) return { ok: false, result: `No Brazilian state matches "${input.state}".` };
        host.chooseArea(area);
        return { ok: true, result: `Selected ${area.name}.`, note: `Selected ${area.name}` };
      }
      case "select_region": {
        const preset = fireData.presets().find((p) => p.id === input.region);
        if (!preset) return { ok: false, result: `Unknown region "${input.region}".` };
        const area = rectangleArea(preset.bbox, preset.name);
        host.chooseArea(area);
        return { ok: true, result: `Selected ${preset.name}.`, note: `Selected ${preset.name}` };
      }
      case "select_box": {
        const box = [input.west, input.south, input.east, input.north].map(Number) as BBox;
        if (box.some((x) => !Number.isFinite(x))) return { ok: false, result: "The corners must be numbers." };
        const bbox = normalizeBBox(box);
        const label = String(input.name || "Custom area").slice(0, 60);
        host.chooseArea(rectangleArea(bbox, label));
        return {
          ok: true,
          result: `Selected ${label}: W ${bbox[0]}, S ${bbox[1]}, E ${bbox[2]}, N ${bbox[3]} (kept inside Brazil and 12° a side).`,
          note: `Selected ${label}`,
        };
      }
      case "go_to_place": {
        const query = String(input.query ?? "").trim().slice(0, 160);
        if (query.length < 3) return { ok: false, result: "Give at least three characters." };
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
        if (!response.ok) return { ok: false, result: "Place search is unavailable right now." };
        const [place] = (await response.json()) as SearchSuggestion[];
        if (!place) return { ok: false, result: `Nothing found for "${query}".` };
        host.navigate(
          navigationForSearch(place, { reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches }),
        );
        return {
          ok: true,
          result: JSON.stringify({ found: place.label, center: place.center, bounds: place.bounds ?? null }),
          note: `Moved to ${place.label}`,
        };
      }
      case "set_period": {
        const period = String(input.period ?? "");
        const problem = validPeriod(period);
        if (problem) return { ok: false, result: problem };
        host.setPeriod(period);
        const label = `${period.length === 10 ? `${Number(period.slice(8))} ` : ""}${monthName(
          Number(period.slice(5, 7)) - 1,
        )} ${period.slice(0, 4)}`;
        return { ok: true, result: `The map shows ${label}.`, note: `Showing ${label}` };
      }
      case "set_layers": {
        const sensors = SENSORS.filter((s) => Array.isArray(input.sensors) && input.sensors.includes(s));
        if (!sensors.length) return { ok: false, result: "Choose MODIS, VIIRS or both." };
        host.setSensors(sensors);
        return { ok: true, result: `Layers: ${sensors.join(", ")}.`, note: `Layers: ${sensors.join(" + ")}` };
      }
      case "open_analysis": {
        if (!host.area) return { ok: false, result: "There is no area of interest. Select one first." };
        host.openAnalysis(host.area);
        return { ok: true, result: `Analysis open for ${host.area.name}.`, note: "Opened the analysis" };
      }
      case "clear_area": {
        host.clearArea();
        return { ok: true, result: "Area cleared.", note: "Cleared the area" };
      }
      case "get_fire_history": {
        if (!host.area) return { ok: false, result: "There is no area of interest. Select one first." };
        const fromYear = Number(input.from_year);
        const toYear = Number(input.to_year);
        if (!Number.isInteger(fromYear) || !Number.isInteger(toYear))
          return { ok: false, result: "Years must be whole numbers." };
        return { ok: true, result: await history(host.area, fromYear, toYear) };
      }
      default:
        return { ok: false, result: `Unknown tool ${name}.` };
    }
  } catch (error) {
    return { ok: false, result: error instanceof Error ? error.message : "The action failed." };
  }
}
