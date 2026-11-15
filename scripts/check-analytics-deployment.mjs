// Run against a local server or a Vercel preview: node scripts/check-analytics-deployment.mjs URL
const origin = process.argv[2] ?? "http://localhost:3000";
const response = await fetch(new URL("/api/analytics/status", origin), { signal: AbortSignal.timeout(10000) });
const result = await response.json();
console.log(JSON.stringify({ url: origin, http_status: response.status, ...result }, null, 2));
if (!response.ok) process.exitCode = 1;
