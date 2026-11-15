import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("reports missing configuration without claiming a deployed service", async () => {
  vi.stubEnv("ANALYTICS_API_URL", "");
  const response = await GET(new Request("http://localhost/api/analytics/status"));
  expect(response.status).toBe(503);
  expect((await response.json()).reason).toBe("analytics_service_unconfigured");
});

it("checks real service health without exposing its address or token", async () => {
  vi.stubEnv("ANALYTICS_API_URL", "https://private-service.example");
  vi.stubEnv("ANALYTICS_API_TOKEN", "secret-token");
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "ok", processing_version: "abc" }));
  vi.stubGlobal("fetch", fetcher);
  const response = await GET(new Request("http://localhost/api/analytics/status"));
  const body = await response.text();
  expect(body).toContain("available");
  expect(body).not.toContain("private-service");
  expect(body).not.toContain("secret-token");
  expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer secret-token");
});
