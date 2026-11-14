// MapLibre 6 runs its tile work in a module worker that bundlers do not pick up.
// Copy the worker and the chunk it imports into public/ so the map can load them.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = dirname(createRequire(import.meta.url).resolve("maplibre-gl/dist/maplibre-gl.css"));
const out = join(root, "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  cpSync(join(dist, file), join(out, file));
}
