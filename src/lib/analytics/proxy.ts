import { geometryKey } from "./client";

/** Keep Python/data outside the Next serverless bundle; credentials stay server-side. */
export async function proxyAnalytics(request: Request, section: "history" | "forecast" | "fire-weather" | "retrospective") {
  const endpoint = process.env.ANALYTICS_API_URL;
  if (!endpoint) return Response.json({ detail: "analytics_service_unconfigured" }, { status: 503 });
  if (Number(request.headers.get("content-length")) > 500_000)
    return Response.json({ detail: "request_too_large" }, { status: 413 });
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 500_000) {
        await reader.cancel();
        return Response.json({ detail: "request_too_large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    body = JSON.parse(new TextDecoder().decode(bytes));
    geometryKey((body as { geometry: unknown }).geometry);
  } catch {
    return Response.json({ detail: "invalid_analytics_request" }, { status: 422 });
  }
  try {
    const upstream = await fetch(`${endpoint.replace(/\/$/, "")}/analytics/${section}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ANALYTICS_API_TOKEN ? { Authorization: `Bearer ${process.env.ANALYTICS_API_TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(55_000)]),
      cache: "no-store",
    });
    if ([502, 503, 504].includes(upstream.status) && !upstream.headers.get("Content-Type")?.includes("application/json")) {
      await upstream.body?.cancel();
      return Response.json({ detail: "analytics_service_starting" }, { status: 503, headers: { "Retry-After": "2" } });
    }
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const starting = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ detail: starting ? "analytics_service_starting" : "analytics_service_unavailable" }, { status: 503 });
  }
}
