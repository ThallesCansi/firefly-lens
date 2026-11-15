import { geometryEnvelope, type AnalysisArea, type PolygonGeometry } from "../data/types";

/**
 * Brazilian municipalities: a name index to search, and outlines to select.
 * Both are static files built from IBGE's public API by
 * scripts/build-municipality-boundaries.mjs. The index loads when the search
 * opens; an outline loads with its state's file, only when a city is chosen.
 */
export interface Municipality {
  /** IBGE's seven-digit code. Its first two digits are the state's code. */
  id: number;
  name: string;
  /** Two-letter state code, e.g. "MT". */
  uf: string;
}

const BASE = "/interaction-boundaries/municipalities/";

/** Lower case, no accents, single spaces: how names and queries are compared. */
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const municipalityLabel = (m: Municipality) => `${m.name}, ${m.uf}`;

/**
 * The municipalities a query names, best first: the exact name, then names
 * that start with it, then names with a word that starts with it. A trailing
 * state code narrows the search ("Sorriso MT", "Bonito, MS"). Pure.
 */
export function searchMunicipalities(index: Municipality[], query: string, limit = 5): Municipality[] {
  let q = fold(query);
  if (q.length < 2) return [];
  let uf: string | null = null;
  const tail = /^(.{2,}) ([a-z]{2})$/.exec(q);
  if (tail && index.some((m) => m.uf.toLowerCase() === tail[2])) {
    // "Campo Grande MS" narrows to a state; "Porto de" does not, as no state is "DE".
    uf = tail[2];
    q = tail[1];
  }
  const ranked: { m: Municipality; rank: number }[] = [];
  for (const m of index) {
    if (uf && m.uf.toLowerCase() !== uf) continue;
    const name = fold(m.name);
    const rank = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(` ${q}`) ? 2 : -1;
    if (rank >= 0) ranked.push({ m, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.m.name.length - b.m.name.length || a.m.name.localeCompare(b.m.name))
    .slice(0, limit)
    .map((r) => r.m);
}

export const municipalityAreaId = (id: number | string) => `municipality:${id}`;

type OutlineFile = {
  features?: { properties?: { id?: string; name?: string; uf?: string }; geometry?: PolygonGeometry }[];
};

export class MunicipalityRepository {
  private names: Promise<Municipality[]> | null = null;
  private states = new Map<string, Promise<OutlineFile>>();
  constructor(private fetcher: typeof fetch = (...args) => fetch(...args)) {}

  /** Every municipality's name and state. Loaded once; a failed load can be retried. */
  index(): Promise<Municipality[]> {
    this.names ??= this.fetcher(`${BASE}index.json`)
      .then((response) => {
        if (!response.ok) throw new Error("The municipality list could not be loaded.");
        return response.json() as Promise<[number, string, string][]>;
      })
      .then((rows) => rows.map(([id, name, uf]) => ({ id, name, uf })))
      .catch((error) => {
        this.names = null;
        throw error;
      });
    return this.names;
  }

  /** The municipality as an area of interest, with IBGE's outline. Null when the code is unknown. */
  async area(id: number | string): Promise<AnalysisArea | null> {
    const code = String(id);
    if (!/^\d{7}$/.test(code)) return null;
    const state = code.slice(0, 2);
    let file = this.states.get(state);
    if (!file) {
      file = this.fetcher(`${BASE}${state}.geojson`)
        .then((response) => {
          if (!response.ok) throw new Error("The municipality outline could not be loaded.");
          return response.json() as Promise<OutlineFile>;
        })
        .catch((error) => {
          this.states.delete(state);
          throw error;
        });
      this.states.set(state, file);
    }
    const feature = (await file).features?.find((f) => f.properties?.id === code);
    const geometry = feature?.geometry;
    if (!feature?.properties?.name || !geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) return null;
    return {
      id: municipalityAreaId(code),
      name: `${feature.properties.name}, ${feature.properties.uf ?? ""}`.replace(/, $/, ""),
      kind: "municipality",
      geometry,
      bbox: geometryEnvelope(geometry),
    };
  }
}

/** One shared copy for the page: the search, the assistant and shared links read the same files. */
export const municipalities = new MunicipalityRepository();
