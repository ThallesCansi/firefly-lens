import { COVERAGE, SENSORS, editableVertices, type AnalysisArea, type Sensor } from "./data/types";

/**
 * A view of the Lens as a link: the area of interest, the period and the
 * sensors shown. Only what the map shows goes in the address, never anything
 * about the person. A link is read with care: anything malformed or outside
 * the record is dropped, and the rest still applies.
 */
export interface SharedView {
  area: { kind: "drawn"; vertices: [number, number][]; name?: string } | { kind: "state"; id: string } | { kind: "municipality"; id: string } | null;
  /** YYYY-MM or YYYY-MM-DD. */
  period: string | null;
  sensors: Sensor[] | null;
}

/** Most corners a shared shape may have: more than anyone draws, few enough to keep a link short. */
const MAX_VERTICES = 40;
const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** The query string (without "?") for a view. */
export function shareQuery(view: { area: AnalysisArea | null; period: string; sensors: Sensor[] }): string {
  const query = new URLSearchParams();
  const vertices = editableVertices(view.area);
  if (view.area?.kind === "state" || view.area?.kind === "municipality") query.set("area", view.area.id);
  else if (view.area && vertices) {
    query.set("area", `poly:${vertices.map(([x, y]) => `${round(x)},${round(y)}`).join(";")}`);
    if (view.area.name !== "Custom area") query.set("name", view.area.name);
  }
  query.set("period", view.period);
  if (view.sensors.length < SENSORS.length) query.set("sensors", view.sensors.join(",").toLowerCase());
  return query.toString();
}

function parseArea(value: string | null, name: string | null): SharedView["area"] {
  if (!value) return null;
  if (/^state:[\w:-]{1,20}$/.test(value)) return { kind: "state", id: value.slice(6) };
  if (/^municipality:\d{7}$/.test(value)) return { kind: "municipality", id: value.slice(13) };
  if (!value.startsWith("poly:")) return null;
  const [w, s, e, n] = COVERAGE;
  const vertices: [number, number][] = [];
  for (const pair of value.slice(5).split(";")) {
    const [x, y, extra] = pair.split(",").map(Number);
    if (extra !== undefined || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < w || x > e || y < s || y > n) return null;
    vertices.push([x, y]);
  }
  if (vertices.length < 3 || vertices.length > MAX_VERTICES) return null;
  const label = name?.trim().slice(0, 60);
  return { kind: "drawn", vertices, ...(label ? { name: label } : {}) };
}

function parsePeriod(value: string | null, first: string, last: string): string | null {
  if (!value || !/^\d{4}-\d{2}(-\d{2})?$/.test(value)) return null;
  const month = value.slice(0, 7);
  if (month < first || month > last) return null;
  const date = new Date(`${value.length === 7 ? `${value}-01` : value}T00:00:00Z`);
  // Rejects month 13 and days a month does not have.
  return Number.isNaN(date.getTime()) || !date.toISOString().startsWith(value) ? null : value;
}

function parseSensors(value: string | null): Sensor[] | null {
  if (value === null) return null;
  const asked = value.toUpperCase().split(",");
  return SENSORS.filter((sensor) => asked.includes(sensor));
}

/** Reads a view from a query string; `first` and `last` are the months the record covers. */
export function parseShare(search: string, first: string, last: string): SharedView {
  const query = new URLSearchParams(search);
  return {
    area: parseArea(query.get("area"), query.get("name")),
    period: parsePeriod(query.get("period"), first, last),
    sensors: parseSensors(query.get("sensors")),
  };
}
