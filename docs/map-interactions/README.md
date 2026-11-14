# Advanced map interactions (Agent B)

**Integration is now implemented in the main Lens workspace.** Read
[the current workflows and verification](INTEGRATED.md). The document below
records the original isolated delivery and its integration checklist.

## Isolation and scope

Worktree: `C:\Users\caioc\Documents\GitHub\firefly-interactions`
Branch: `feature/map-interactions`
Base: `origin/main` at `6ea44c7a8962e2e462cba0cb48cd8883a1f8757c`.

No merge, rebase or push. The other agent's worktree is untouched. HotspotMap,
LensApp, projections, central map contracts, global styles, dependencies,
NASA observations, harmonization and Python are unchanged.

The shared globe contract does not exist in this base. These are local adapters,
not competing definitions of ProjectionMode, MapInteractionMode,
MapNavigationRequest or SelectedArea. The integration owner must map them to
the shared contract once available.

## What works now

- LocationSearch is already consumed by TopNavigation. Automatic suggestions,
  coordinate parsing, keyboard/mouse selection, Escape, cancellation, race guards,
  cache, loading/empty/error states and ARIA combobox work through the existing
  onNavigate(MapDestination) callback.
- The geocode API preserves its array response of label/center/zoom/bounds;
  optional kind distinguishes result types. Photon extent is converted from
  west/north/east/south to west/south/east/north.
- Independent administrative lookup and confirmation, rectangle preview/commit/
  cancellation and resizable panel can be exercised at /interaction-preview.
  This explicitly labelled development route has no map or scientific analysis.
  Its coordinate forms simulate geographic events; they are not a map renderer.
- New toolbar actions are opt-in: old callers remain unchanged. Active states use
  administrativeActive and rectangleEditing. The original SpatialTool union
  remains intact.
- Theme tokens, existing typography, header and branding are reused. New CSS is
  scoped with exclusive ff-location-, ff-interaction- and ff-preview- class prefixes.
  The existing Turbopack *.css loader rewrites module output; browser verification
  found CSS Module exports undefined. Component CSS uses ordinary side-effect
  imports with namespaced selectors so no shared config/global stylesheet changes
  are required.

## Integration owner checklist

### Navigation

Keep the existing LocationSearch onNavigate callback or translate it at the
controller boundary. The local legacy-compatible payload has:

```ts
{
  id: number,
  center: [longitude, latitude],
  zoom: number,
  animation: "fly" | "jump",
  maxZoom: 12,
  bounds?: [west, south, east, north],
  motion?: {
    kind: "fly",
    durationMs: number,
    interruptible: true,
    essential: false
  }
}
```

Pass currentCenter to LocationSearch for distance-adapted duration (500-2000 ms);
without it, duration defaults to 900 ms. Reduced motion requests zero duration.
These are hints only: the existing map does not consume motion yet. The globe
engine owns animation, interruption, safe globe/2D camera transitions, bounds
framing, panel padding and projection-specific behavior. Neither search nor
these modules call flyTo, easeTo, fitBounds or access a map instance.
Search never changes the selected analysis geometry.

### Administrative selection

Create one AdministrativeSelectionController per workspace:

```ts
const selection = new AdministrativeSelectionController(
  undefined, // default cached BoundaryRepository
  (candidate) => renderPreview(candidate?.feature ?? null),
  (candidate) => commitDisplayGeometry(candidate),
);
// Called only when the administrative tool is active:
await selection.selectAt([event.longitude, event.latitude], "state");
// Or "country"; selection.choose(id), .confirm(), .cancel().
```

Render AdministrativeSelectionCard with that controller. Render the candidate's
actual GeoJSON Polygon/MultiPolygon, not its bounding envelope. Multiple matches
(e.g. a shared border) remain available for explicit choice.

AdministrativeCandidate separates feature geometry, administrative ID, bounds
and center. centerKind is explicitly bounding-box-center, not a centroid.
dataCoverage is brazil or none; analysis is available (a Brazilian state),
too-large (the whole of Brazil) or outside-data-coverage. These are capability flags, not observation/quality claims
for every location or time.

The analysis takes an `AnalysisArea` (src/lib/data/types.ts): a polygon and its
envelope. Each 0.25° cell counts by the share of it inside the polygon
(src/lib/geo/clip.ts). Confirming a Brazilian state makes its outline the area
of interest; a country is only shown. Countries outside Brazil are identified
with no data coverage. Cancel clears the preview.

### Area editing

A drawn area is edited with PolygonEditor (src/lib/interactions/polygon-editor.ts)
and PolygonEditOverlay. The Lens creates the editor as soon as a drawn area
exists; there is no separate edit mode or confirm step. Each corner moves on its
own; the + on an edge adds a corner; double-click or Delete removes one (at
least three remain); the centre handle moves the shape. onPreview draws the
shape while dragging; onCommit hands over the shape when a drag ends, and the
host replaces the area with it. No historical query runs until Analyze.

An edit is refused, keeping the last valid shape, when edges would cross, the
shape would leave Brazil's coverage box, its envelope would pass 12° in either
direction, or it would shrink below one 0.25° cell. State outlines are not
edited by hand.

RectangleEditor and RectangleEditOverlay remain for the /interaction-preview page.

Supply a RectangleProjectionAdapter with project(geographicPoint) and
unproject(containerPixel). Both must use the actual active map projection.
Return null for sky, occluded points or an unsafe inverse projection; project
can additionally return visible:false. The overlay origin must match the map
container origin. Increment viewRevision after map moves/projection changes so
the geographic handles are reprojected. No planar pixel-to-degree approximation
is provided.

onInteractionLock(true) asks the host to suspend conflicting camera/draw
gestures. Restore them on false; pointer completion, capture loss, cancellation
and overlay unmount release the lock. The host must also suspend conflicting
gestures during keyboard editing. Arrow keys move by 0.1 degree, Shift by 0.5;
Escape cancels the edit.

Editing retains existing constraints read from data/types: Brazil coverage,
minimum 0.5 degree per side, maximum MAX_BBOX_DEGREES (12). Corner crossings
normalize direction. Whole-area translation preserves dimensions and clamps to
coverage. Null globe intersections are ignored; jumps exceeding 180 degrees
are rejected. General dateline-spanning rectangle editing is unsupported,
consistent with the existing Brazil-only BBox analysis domain.

At confirmation, invalidate any stale analyzed selection and ask to recalculate
through the existing explicit Analyze action. Do not recalculate on camera move
or on every preview.

### Resizable analysis panel

Replace the controller's existing fixed aside wrapper with
ResizableAnalysisPanel and keep AnalysisContent inside. The wrapper owns only
layout and scrolling: the integration owner retains open/close, selected period,
analyzed area and expand/full-width controls. Avoid nesting it inside the old
fixed-width drawer or keeping conflicting old width CSS.

Defaults: 600 px, minimum 320, maximum min(960, 70% of container,
container - 320). At widths <=700 it becomes a 58% bottom sheet and horizontal
resize is disabled. Desktop handle supports pointer/touch, arrows (16 px,
Shift 32), Home/End, Escape cancellation, double-click reset. The Reset width
button is available on mobile too. localStorage persists the preference where
available; constrained viewport resizing retains the desktop preference.

Optional onResize(width) reports actual ResizeObserver measurements, coalesced
with requestAnimationFrame. The map owner must call map.resize() after map
container changes, preserving camera and selection. A significant existing
integration issue: the base HotspotMap ResizeObserver calls both resize() and
fitBounds() on each resize. The globe owner must remove/suppress that repeated
framing for panel drags. Initial selection framing is a separate deliberate
action. This file was not modified due to ownership.

Charts/calendars should retain their own responsive/expanded views. No scientific
component has been rewritten or squeezed into a test-only replacement.

## Provider policy and data provenance

Photon supports typeahead but its public service requires fair/moderate usage:
[Photon project and public service](https://photon.komoot.io/).
Defaults: client debounce 650 ms, minimum 3 characters, 1100 ms between starts,
AbortController, 50 cached queries / 30 minutes, stale-response generation guard.
Server broker: one upstream request at a time per process, identical requests
coalesced, minimum 1100 ms between starts, 300 cached queries / 24 hours.
Cache hits precede rate limiting. 429 responses carry Retry-After; the client
retries at most twice, respecting delays up to 5 seconds, otherwise shows an
actionable error. Timeout is 8 seconds. No private key is sent to the browser.

This is a conservative per-process guard, not a distributed quota. Multiple
serverless instances still need a shared limiter or a dedicated/self-hosted
Photon endpoint via server-only PHOTON_URL for substantial traffic. Aborting a
browser search does not cancel the broker's shared request, avoiding one
consumer aborting another. The provider's actual cooldown always takes priority.
No concurrent-request workaround is used within the broker.

Administrative assets are separate new reference geography, not satellite data:

- 177 country features: Natural Earth Admin 0 Countries, 1:110m.
  [Public domain terms](https://www.naturalearthdata.com/about/terms-of-use/).
  Source URL is recorded per feature and in provenance.json.
- All 27 Brazilian UFs: IBGE simplified public mesh, with official UF names/IDs.
  [IBGE mesh API](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3),
  [IBGE locality API](https://servicodados.ibge.gov.br/api/docs/localidades).
  The API default vintage was used; no specific boundary year is asserted.
- public/interaction-boundaries/provenance.json records retrieval timestamp,
  exact URLs and upstream payload SHA256s. Only properties were normalized;
  upstream geometry coordinates were preserved.

Boundaries are generalized: small countries/islands may be absent, coastlines
and disputes are not definitive. Border clicks may return multiple candidates.
Bounds use a conventional ordered WGS84 envelope; dateline features may have
very wide bounds. Polygon identification handles holes, MultiPolygons and
dateline rings, but this display dataset is not a scientific clipping mask.
No synthetic observations or invented scientific metrics were added.

## Files

Modified: src/components/lens/LocationSearch.tsx, MapControls.tsx and
src/app/api/geocode/route.ts.

Added: src/lib/interactions/* (autocomplete, navigation, geocode broker,
administrative geometry/controller, rectangle editor, panel sizing and tests);
src/components/interactions/* (cards, handles, panel and isolated preview);
LocationSearch.css; src/app/interaction-preview/*; the reference boundary
assets; scripts/qa-map-interactions.mjs and this guide/screenshots.

The remaining conflict surface with the globe agent is limited to final wiring
in LensApp/HotspotMap and translating local payloads into its owned contract.
No edits to those files are included here.

## Run and verify

Requires Node/pnpm as declared by the existing project.

```powershell
cd C:\Users\caioc\Documents\GitHub\firefly-interactions
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev --port 3102
# Open http://localhost:3102/interaction-preview and /
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd build
```

Automated browser QA uses an externally installed Playwright module and Chrome,
without adding a project dependency:

```powershell
pnpm.cmd start --port 3102
$env:PLAYWRIGHT_MODULE = 'file:///absolute/path/to/playwright/index.mjs'
$env:QA_BASE_URL = 'http://localhost:3102'
node scripts/qa-map-interactions.mjs
```

Geocoding is mocked in browser QA to exercise success/error/empty/cancel cases
without spending public provider quota. Administrative files are loaded locally
from the actual source assets. Screenshots are reproducible outputs of that QA,
not proposed mockups. The preview contains no scientific analysis.

Final validation: pnpm test passed (40 tests, 7 files); pnpm lint passed;
pnpm build passed with no warnings. Browser QA passed in Chrome at desktop
1440x1000 and touch mobile 390x844 / 320x844: suggestions, keyboard/mouse
selection, local/invalid coordinates, empty/error/cancel cases, real boundary
lookup, rectangle commit/cancel, panel pointer/keyboard limits and persistence,
and no horizontal page overflow. No page errors were observed. Provider calls
were mocked; remote geocoder availability is not asserted.

Screenshots: screenshots/autocomplete-desktop.png,
screenshots/selection-panel-desktop.png, screenshots/main-autocomplete-desktop.png,
screenshots/selection-panel-dark.png, screenshots/selection-mobile-390.png and
screenshots/selection-mobile-320.png.

## Upstream movement during isolated work

The branch started from updated main at 6ea44c7. During development the shared
origin/main ref advanced to 7ed43d1, containing globe commit 2ad8d69.
No merge/rebase was performed, as requested. Consequently the mandatory
git diff --name-only origin/main lists the upstream globe files as differences
even though they were never edited here. Before the local commit, git diff HEAD
and git status confirmed
that only the three authorized existing files were changed; all other work is
new files. git diff --exit-code HEAD -- [reserved paths] passed.
Compare this work against its base, not interpret the inverse upstream delta
as removal of the globe. The integration owner should apply these changes
onto current main, retaining the globe commits.

The new central contract was inspected read-only using git show origin/main:
src/lib/map/map-contract.ts. Search now emits animation ("fly"/"jump") and
maxZoom in addition to the existing payload, structurally compatible with
that MapNavigationRequest. The optional motion duration remains an extension
for the integration owner: the central request does not expose duration.
No copy of or import from an absent local contract was created.

For that contract, connect controller.onPointer click.lngLat to selectAt.
Use controller.lockCamera for editor locks. Adapt controller.project to
{x,y,visible}; the host must additionally exclude occluded handles because
the published project signature alone does not indicate occlusion. Adapt
controller.unproject([x,y]) to the geographic null-safe interface. Rendering
preview geometry can use onStyleReady with tool-prefixed layers below modis;
remove those layers/sources in host cleanup. Keep capability/coverage flags
with AdministrativeCandidate outside SelectedArea so committing a geometry
never silently enables unsupported polygon analysis.

The upstream resize handler now reframes only if selection leaves the view.
The integration owner still must decide how panel resizing preserves the
camera; the unconditional base behavior described above was never edited.
