import { cacheLife } from "next/cache";

type Feature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    osm_value?: string;
    type?: string;
    extent?: [number, number, number, number];
  };
};

async function findPlaces(query: string) {
  "use cache";
  cacheLife("days");
  const endpoint = process.env.PHOTON_URL || "https://photon.komoot.io/api/";
  const url = new URL(endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lang", "en");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent":
        "FireFlyLens/0.1 (https://github.com/ThallesCansi/firefly-lens)",
    },
  });
  if (!response.ok) throw new Error("Geocoder unavailable");
  const data = (await response.json()) as { features: Feature[] };
  return data.features.map((f) => ({
    label: [
      ...new Set(
        [
          f.properties.name,
          f.properties.city,
          f.properties.state,
          f.properties.country,
        ].filter(Boolean),
      ),
    ].join(", "),
    center: f.geometry.coordinates,
    // Photon extent is west, north, east, south; MapLibre takes west, south, east, north.
    bounds: f.properties.extent
      ? [f.properties.extent[0], f.properties.extent[3], f.properties.extent[2], f.properties.extent[1]]
      : undefined,
    zoom:
      (f.properties.type ?? f.properties.osm_value) === "country"
        ? 4
        : ["state", "region", "county"].includes(f.properties.type ?? f.properties.osm_value ?? "")
          ? 6
          : 10,
  }));
}

// A small per-process guard supplements the provider's throttling and cached results.
let nextRequest = 0;
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length > 160)
    return Response.json({ error: "Invalid query" }, { status: 400 });
  if (Date.now() < nextRequest)
    return Response.json(
      { error: "Please wait before searching again" },
      { status: 429 },
    );
  nextRequest = Date.now() + 1000;
  try {
    return Response.json(await findPlaces(query.toLowerCase()));
  } catch {
    return Response.json(
      { error: "Search temporarily unavailable" },
      { status: 502 },
    );
  }
}
