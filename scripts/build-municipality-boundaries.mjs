// Builds the municipality search index and outlines from IBGE's public API.
// Usage: node scripts/build-municipality-boundaries.mjs
// Writes public/interaction-boundaries/municipalities/{index.json,<UF code>.geojson}
// and records the sources and their hashes in provenance.json.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../public/interaction-boundaries/", import.meta.url);
const SOURCES = {
  municipalities:
    "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?intrarregiao=municipio&formato=application%2Fvnd.geo%2Bjson&qualidade=minima",
  municipalityNames: "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado",
};

const raw = {};
for (const [key, url] of Object.entries(SOURCES)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  raw[key] = Buffer.from(await response.arrayBuffer());
}
const names = new Map(
  JSON.parse(raw.municipalityNames).map((m) => [String(m["municipio-id"]), { name: m["municipio-nome"], uf: m["UF-sigla"] }]),
);
const mesh = JSON.parse(raw.municipalities);

const byState = new Map();
const index = [];
for (const feature of mesh.features) {
  const id = String(feature.properties.codarea);
  const known = names.get(id);
  if (!known) throw new Error(`No name for municipality ${id}`);
  index.push([Number(id), known.name, known.uf]);
  const state = id.slice(0, 2);
  if (!byState.has(state)) byState.set(state, []);
  byState.get(state).push({ type: "Feature", properties: { id, name: known.name, uf: known.uf }, geometry: feature.geometry });
}
index.sort((a, b) => a[1].localeCompare(b[1], "pt-BR") || a[2].localeCompare(b[2]));

await mkdir(new URL("municipalities/", OUT), { recursive: true });
await writeFile(new URL("municipalities/index.json", OUT), JSON.stringify(index));
for (const [state, features] of byState)
  await writeFile(new URL(`municipalities/${state}.geojson`, OUT), JSON.stringify({ type: "FeatureCollection", features }));

const provenanceUrl = new URL("provenance.json", OUT);
const provenance = JSON.parse(await readFile(provenanceUrl, "utf8"));
Object.assign(provenance.sources, SOURCES);
for (const key of Object.keys(SOURCES)) provenance.rawSha256[key] = createHash("sha256").update(raw[key]).digest("hex");
provenance.municipalitiesRetrievedAt = new Date().toISOString();
await writeFile(provenanceUrl, JSON.stringify(provenance, null, 2) + "\n");
console.log(`${index.length} municipalities in ${byState.size} state files`);
