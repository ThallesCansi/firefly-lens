// Small live contract check; does not redistribute tiles or copy the WMTS archive.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const output = process.env.QA_OUTPUT || "docs/hires-satellite-poc";
mkdirSync(output, { recursive: true });
const capabilitiesUrl = "https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml";
const response = await fetch(capabilitiesUrl); assert.equal(response.status, 200);
const xml = await response.text();
const layer = [...xml.matchAll(/<Layer>([\s\S]*?)<\/Layer>/g)].map((m) => m[1]).find((s) => s.includes("<ows:Identifier>s2cloudless-2025_3857</ows:Identifier>"));
assert.ok(layer); assert.ok(layer.includes("<TileMatrixSet>g</TileMatrixSet>"));
assert.ok(layer.includes("{TileMatrix}/{TileRow}/{TileCol}.jpg"));
assert.ok(layer.includes("by-nc-sa/4.0/"));
const checks = [];
for (const [place, lng, lat] of [["andes", -70.01, -32.68], ["serra-do-mar", -43.04, -22.46], ["pantanal", -56.5, -19]]) {
  const z = 14, n = 2 ** z;
  const x = Math.floor((lng + 180) / 360 * n);
  const y = Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  const url = `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/${z}/${y}/${x}.jpg`;
  const r = await fetch(url, { headers: { Origin: "https://firefly-lens.example" } });
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.equal(r.status, 200); assert.ok(r.headers.get("content-type")?.includes("image/jpeg"));
  assert.equal(bytes[0], 0xff); assert.equal(bytes[1], 0xd8);
  checks.push({ place, center: [lng, lat], z, x, y, url, status: r.status, bytes: bytes.length, cors: r.headers.get("access-control-allow-origin") });
}
writeFileSync(`${output}/wmts-check.json`, JSON.stringify({ checkedAt: new Date().toISOString(), capabilitiesUrl, capabilitiesStatus: response.status,
  capabilitiesSha256: createHash("sha256").update(xml).digest("hex"), layer: "s2cloudless-2025_3857", matrix: "g", tileOrder: "z/y/x", configuredMaxZoom: 14,
  license: "https://creativecommons.org/licenses/by-nc-sa/4.0/", checks }, null, 2));
console.log("Live EOX WMTS contract and all three z14 tiles passed");
