/** Deployment check, with no tokens or private service URLs in the response. */
export async function GET(request: Request) {
  const endpoint = process.env.ANALYTICS_API_URL;
  const headers = { "Cache-Control": "no-store" };
  if (!endpoint) return Response.json({ status: "unavailable", reason: "analytics_service_unconfigured" }, { status: 503, headers });
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/health`, {
      cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
      headers: process.env.ANALYTICS_API_TOKEN ? { Authorization: `Bearer ${process.env.ANALYTICS_API_TOKEN}` } : {},
    });
    const health = await response.json();
    if (!response.ok || health.status !== "ok") throw new Error("unhealthy");
    return Response.json({ status: "available", processing_version: health.processing_version }, { headers });
  } catch {
    return Response.json({ status: "unavailable", reason: "analytics_service_unavailable" }, { status: 503, headers });
  }
}
