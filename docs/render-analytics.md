# Historical analytics on Render Free

Scope: restore dynamic History for Brazilian polygons and the published whole
South American countries, plus verified numeric NASA meteorological assessments.
Weather now leads the full report, above the centered History/Forecast tabs. Forecast
quality gates and national-only calibration remain unchanged.

`render.yaml` defines one **Free web service**, with no database or paid disk.
It builds `analytics/Dockerfile.render` from the repository root. Data are
immutable files shipped in the image, so restarting or sleeping loses only the
bounded in-memory response cache. The Docker ignore allowlist excludes secrets,
worktrees, native detection archives and browser tiles. The image includes weather
dependencies and the small normalized NASA subset as a fallback. See
[weather delivery](weather-first-report.md) for the independent refresh pipeline.

The entry point requires a nonempty `ANALYTICS_API_TOKEN`, binds Render's `PORT`
and runs one worker. Numerical libraries use one thread; DuckDB working memory
is capped at 128 MB. SARIMA stays disabled; existing baseline and retrospective
models and scientific gates still apply. CI builds the actual image and checks
real small/large Brazilian polygons plus Paraguay with a hard 512 MB container
limit, including rejection of unauthenticated requests. Passing CI is not a
guarantee of throughput on Render's shared CPU.

## Deployment

1. Connect Render to this GitHub repository, then create a Blueprint from
   `render.yaml` on `main`. Confirm **Free**, service name `firefly-analytics`,
   Docker runtime and `/health`. Automatic deployment waits for passing checks.
2. Render generates `ANALYTICS_API_TOKEN`. Keep it private. Wait for a successful
   deploy and save the actual HTTPS `onrender.com` origin; names can receive suffixes.
3. In Vercel's existing `firefly-lens` project, set server-only production
   `ANALYTICS_API_URL` to that origin and `ANALYTICS_API_TOKEN` to the same secret.
   Do not use `NEXT_PUBLIC_` variables. Redeploy production to apply them.
4. Check `node scripts/check-analytics-deployment.mjs https://firefly-lens.vercel.app`.
   It must report `available`. With the token supplied through the environment,
   `python scripts/smoke-render-analytics.py https://ACTUAL-SERVICE.onrender.com`
   verifies the real deployed API. Finally draw a Brazilian polygon in the site
   and open History; ensure the scientific report loads with its actual geometry.

No secret belongs in Git, screenshots, PR descriptions or console logs.
Deployment requires authenticated access to both Render and Vercel; committing
the Blueprint alone does not activate the Python service.

## Sleep and limits

Render Free sleeps after 15 minutes idle and can take about one minute to wake.
The Next proxy keeps its 55-second per-request budget; the history client retries
up to twice when the proxy reports startup. Unconfigured services, dataset errors,
authorization failures and scientific unavailability are not treated as startup.
An aborted selection cancels its retry. Prolonged failures still show a retryable
error and preserve existing static reports/calendars. No keep-alive pinger is used.

Free includes 750 instance hours per workspace/month and no persistent disk.
Usage and build allowances still apply. Check the account's limits before
deploying; do not upgrade or enable paid resources to resolve failures.

Sources: [Render Free](https://render.com/docs/free),
[Blueprint specification](https://render.com/docs/blueprint-spec).

## Rollback

Remove the two Vercel variables and redeploy to restore static-only fallback;
or revert the service's last deployment in Render. Preserve matching map/service
metadata. The existing API rejects mismatched data versions rather than mixing
scientific releases. To switch weather providers, deploy matching verified
data, dependencies and a refresh pipeline for that provider.
