import { afterEach, expect, it, vi } from "vitest";
import { proxyAnalytics } from "./proxy";
import { rectangleArea } from "../data/types";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const input = { geometry: rectangleArea([-57.5, -18.5, -56.5, -17.5]).geometry };
function request(body: unknown = input) {
  return new Request("http://localhost/api/analytics/history", { method: "POST", body: JSON.stringify(body) });
}
it("reports unconfigured service without needing Python in Next", async () => {
  vi.stubEnv("ANALYTICS_API_URL", "");
  expect((await proxyAnalytics(request(), "history")).status).toBe(503);
});
it("forwards JSON and private credentials only to the configured service", async () => {
  vi.stubEnv("ANALYTICS_API_URL", "http://python.internal/");
  vi.stubEnv("ANALYTICS_API_TOKEN", "private-test-token");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ detail: "region_outside_coverage" }, { status: 422 }));
  vi.stubGlobal("fetch", fetcher);
  const response = await proxyAnalytics(request(), "forecast");
  expect(response.status).toBe(422);
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe("http://python.internal/analytics/forecast");
  expect(options.headers.Authorization).toBe("Bearer private-test-token");
  expect(JSON.parse(options.body)).toEqual(input);
  expect(JSON.stringify(await response.json())).not.toContain("private-test-token");
});
it("bounds streamed input and rejects malformed geometry", async () => {
  vi.stubEnv("ANALYTICS_API_URL", "http://python.internal");
  expect((await proxyAnalytics(request({}), "history")).status).toBe(422);
  expect((await proxyAnalytics(request({ padding: "x".repeat(500_001) }), "history")).status).toBe(413);
});
it("isolates upstream failures", async () => {
  vi.stubEnv("ANALYTICS_API_URL", "http://python.internal");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
  expect((await proxyAnalytics(request(), "forecast")).status).toBe(503);
});
it("normalizes Render's HTML startup page without exposing upstream markup", async () => {
  vi.stubEnv("ANALYTICS_API_URL", "https://test.onrender.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Starting</html>", { status: 503 })));
  const response = await proxyAnalytics(request(), "history");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ detail: "analytics_service_starting" });
});
it("preserves application dataset failures rather than treating them as startup", async () => {
  vi.stubEnv("ANALYTICS_API_URL", "https://test.onrender.com");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ detail: "analytics_dataset_unavailable" }, { status: 503 })));
  expect(await (await proxyAnalytics(request(), "history")).json()).toEqual({ detail: "analytics_dataset_unavailable" });
});
