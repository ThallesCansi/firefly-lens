import {
  GeocodeBroker,
  GeocodeRateLimit,
  photonSuggestions,
} from "@/lib/interactions/geocode-broker";

const broker = new GeocodeBroker(async (query) => {
  const url = new URL(
    process.env.PHOTON_URL || "https://photon.komoot.io/api/",
  );
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
  if (response.status === 429) {
    const value = response.headers.get("Retry-After") || "30";
    const seconds = /^\d+$/.test(value)
      ? Number(value)
      : Math.ceil((Date.parse(value) - Date.now()) / 1000);
    throw new GeocodeRateLimit(
      Number.isFinite(seconds) ? Math.max(1, seconds) : 30,
    );
  }
  if (!response.ok) throw new Error("Geocoder unavailable");
  return photonSuggestions(await response.json());
});
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 3 || query.length > 160)
    return Response.json(
      { error: "Use 3 to 160 characters." },
      { status: 400 },
    );
  try {
    return Response.json(await broker.search(query), {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch (error) {
    if (error instanceof GeocodeRateLimit)
      return Response.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    return Response.json(
      { error: "Search temporarily unavailable" },
      { status: 502 },
    );
  }
}
