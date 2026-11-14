# Map tools integrated into the Lens workspace

The tools now run in the main application at / and /lens. The independent
/interaction-preview route remains available for isolated checks, but is not
needed for any of the workflows below.

## Select a whole country or Brazilian state

1. Activate **Select Country / State** in the left map toolbar (folded-map icon).
2. Set **Selection level** to Country or Brazilian state.
3. Click/tap a geographic location on the map. Dragging still navigates.
4. Inspect the region name, coverage, source and actual Polygon/MultiPolygon preview.
5. Choose **Confirm boundary for display**. The camera frames its envelope and
   the real boundary remains highlighted. **Change region** starts another
   identification; **Clear boundary** removes it. Escape/Cancel dismisses an
   unconfirmed preview and retains the last confirmed boundary.

Countries use the simplified Natural Earth reference; UFs use IBGE. See
[provenance and source limitations](README.md#provider-policy-and-data-provenance).
Coverage outside Brazil is explicitly unavailable. Administrative geometry is
never converted into a rectangular scientific selection. **Analyze Area** is
therefore not offered for a country/state: exact territorial calculations still
require a polygon clipping path in the scientific data adapter.

Search still navigates only. It does not select the country's territory.

## Edit a rectangular study area

Draw a rectangle, apply coordinates or choose a study preset. Activate
**Edit rectangle** (pencil icon). Drag a corner or the central move handle;
arrow keys adjust a focused handle (Shift uses a larger step). Confirm commits
the new bounds; Cancel/Escape restores the old selection. Edit previews update
only the lightweight tool layer, not the historical record or tile query key.

The overlay uses the actual map controller's projection and inverse projection.
A geographic round trip hides occluded/unsafe globe positions. Sky points are
ignored. Camera gestures are suspended while a handle is dragged and released
on completion, cancellation, capture loss or unmount. Handles reproject on
MapLibre render events only while editing. 2D/3D switching remains available.

The existing constraints remain: Brazil coverage, 0.5-12 degrees per side.
Dateline-spanning rectangles remain unsupported. Confirming an edited area
closes the old analysis and asks the user to use **Analyze Area** again.

## Resize the scientific panel

Click **Analyze Area** for a rectangle. Drag the panel's left separator, or focus
it and use Left/Right, Shift+arrows, Home/End. **Reset width** restores 600 px.
The existing Expand/Compact control remains available. The preferred width is
saved locally. Calendars, temporal selection, sensor details and exports reuse
the existing AnalysisContent without scientific changes.

The panel scrolls independently. Mobile uses a bottom sheet, without a horizontal
resize handle. Closing keeps the rectangle, period and mounted scientific
content. Opening analysis deliberately frames the selected rectangle after the
layout changes. Subsequent panel resizing calls map.resize() without moving
the camera or triggering historical analysis.

## Implementation

- LensApp connects toolbar modes, explicit commits, clear/cancel, controller
  readiness, map clicks, editor overlay and ResizableAnalysisPanel.
- useWorkspaceTools owns the administrative preview/confirmed boundary and
  editing session, using the existing shared map contract.
- WorkspaceSelectionTools renders spatial confirmation controls independently
  from the application controller.
- map-tool-layer adds only tool-prefixed GeoJSON sources/layers below the sensor
  layers, restores them after style/theme reloads and removes them on cleanup.
- HotspotMap exposes a render notification for projected handles, honors search
  animation hints and resizes without reframing. Its instance/projection
  lifecycle is preserved.
- ResizableAnalysisPanel supports hidden-but-mounted analysis and Expand/Compact.
  AdministrativeSelectionCard supports a host cancellation callback.
- MapControls distinguishes any selection from an editable rectangle.

No harmonization algorithm, data aggregation, real observations, Python code,
package dependency or shared central map contract was changed.

## Verification

- pnpm.cmd test: 55 tests across 9 files passed, including layer ownership,
  clearing and restoration on basemap reload.
- pnpm.cmd lint and pnpm.cmd build: passed.
- scripts/qa-integrated-map-tools.mjs exercises actual MapLibre/WebGL on the
  main application: country selection from the initial view, UF selection,
  explicit confirmation, no polygon-to-BBox analysis, keyboard/pointer editing,
  cancellation, 2D/3D switching, theme reload, real historical calendars,
  month-to-map synchronization, resizable panel and mobile touch.
- Desktop viewport: 1440x1000. Mobile: 390x844 and 320x844, including the actual
  scientific bottom sheet and no horizontal page overflow. No page errors.
- The QA replaces only the external basemap with a deterministic background
  style so public CDN availability is not a prerequisite. Reference boundaries
  and scientific data are the real locally supplied files. No scientific data
  is fabricated or mocked.
- Captures are in [integrated/](integrated/): country-globe.png,
  state-2d-dark.png, rectangle-edit-globe.png, analysis-resizable.png,
  country-mobile-390.png, country-mobile-320.png, analysis-mobile-390.png and
  analysis-mobile-320.png.

## Run

From the isolated firefly-interactions worktree:

```powershell
pnpm.cmd dev --port 3102
# Open http://localhost:3102/
```

To reproduce browser checks, run a production server on that port, then:

```powershell
$env:PLAYWRIGHT_MODULE = 'file:///absolute/path/to/playwright/index.mjs'
node scripts/qa-integrated-map-tools.mjs
```
