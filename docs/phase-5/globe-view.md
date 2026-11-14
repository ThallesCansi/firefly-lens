# Phase 5 — Globe view and map contract

Branch `feature/3d-globe`, base `6ea44c7` (main after Phase 4).

## What changed

- The map opens as a **3D globe** (MapLibre's native `globe` projection, which turns flat by itself at street zooms). A **3D Globe / 2D Map** switch sits above the zoom buttons; the choice is kept in `localStorage` (`firefly-lens-projection`).
- Switching keeps the camera centre and zoom, the selected area, the MODIS and VIIRS layers, the period and the theme. The MapLibre instance is never recreated.
- The globe has a sky and atmosphere per theme. Theme changes replace the basemap style; projection, sky, data layers and tool layers are restored on every `style.load`.
- **Camera** moves go through one place (`src/lib/map/camera.ts`, `controller.navigate`): search results fly along an arc whose length scales with distance (0.7–4 s), areas are framed with a short glide, and `prefers-reduced-motion` jumps without animation. A new request stops the flight in progress. Antimeridian-crossing bounds are unwrapped and the flat map never frames past ±85°.
- **Drawing** on the globe locks pan, zoom and rotation, and ignores a drag that starts in space around the globe (the last corner on the Earth is kept if the pointer leaves it).
- **Resizing** the map container re-frames the area only if the new size cut it off, so it no longer undoes the person's own navigation.
- If the globe cannot be set, the map falls back to the flat map and the legend says so.

## Files

| File | Role |
|---|---|
| `src/lib/map/map-contract.ts` | Public types for tools: projection, interaction modes, navigation requests, selected area, pointer events, `MapController` |
| `src/lib/map/controller.ts` | The engine's implementation of `MapController` |
| `src/lib/map/camera.ts` | Pure camera planning (flight time, bounds, reduced motion) |
| `src/lib/map/projection.ts` | Default projection, saved choice, sky per theme |
| `src/lib/map/camera.test.ts` | Tests for the above |
| `src/components/lens/map/ProjectionToggle.tsx` | The 3D/2D switch |
| `src/components/lens/HotspotMap.tsx` | Engine wired to the controller; new optional props |

## Contract for the interaction tools

`HotspotMap` keeps every existing prop. New optional props:

| Prop | Type | Use |
|---|---|---|
| `onReady` | `(controller: MapController) => void` | Receive the controller once the map has loaded |
| `navigation` | `MapNavigationRequest \| null` | Move the camera; a new `id` starts a new move |
| `interactionMode` | `MapInteractionMode` | `"draw-rectangle"` equals `drawing`; `"pick-administrative"` shows a pointer cursor |
| `onMapClick` | `(e: MapPointerEvent) => void` | Clicks with geography (`lngLat` is null off the Earth) |
| `projection` / `onProjectionChange` | `ProjectionMode` | Controlled projection; when set, the built-in switch hides |
| `showProjectionToggle` | `boolean` | Hide the built-in switch |

`MapController` (from `onReady`):

```ts
navigate(request: MapNavigationRequest): void   // { id, center?, zoom?, bounds?, maxZoom?, animation?: "fly" | "ease" | "jump" }
resetView(): void
getProjection(): ProjectionMode                 // "globe" | "mercator"
setProjection(mode: ProjectionMode): void
lockCamera(locked: boolean): void               // while a tool drags a handle
onPointer(handler, { layers? }): () => void     // down / move / up / click, with lngLat (null off the Earth) and queried features
onStyleReady(setup: (map: MapLike) => void): () => void   // add tool sources/layers; re-run after every theme change
unproject(point): [lng, lat] | null
project(lngLat): [x, y]
getBounds(): BBox
```

Tool layers should use ids starting with `tool-` and be inserted before `FIRST_DATA_LAYER` (`"modis"`), so data marks stay on top. Engine layer ids (`brazil`, `area`, `draft`, `modis`, `viirs`) must not be changed.

### Where the interaction agent connects

- **Search** (`LocationSearch.tsx`): nothing to change. `MapDestination` is consumed as before and now flies along an arc. To request other moves, pass `navigation` from `LensApp`.
- **Editable rectangle**: a separate component that receives the controller, draws handles in `onStyleReady` (layers `tool-…`), listens with `onPointer`, calls `lockCamera(true)` while a handle is dragged, and reports the new box through the same `onDraw(normalizeBBox(bbox))`. Use `interactionMode="edit-rectangle"`.
- **Administrative picker**: boundaries as a `tool-` fill layer added in `onStyleReady`; `interactionMode="pick-administrative"` and `onMapClick` (or `onPointer` with `layers`) return the clicked feature; report it as a `SelectedArea` of kind `"administrative"`.
- **Integration point**: `LensApp.tsx` now connects `onReady`, `interactionMode` and `onMapClick` to the spatial tools. Country/state selection, rectangle editing and the resizable analysis panel run in the main workspace; see [the integrated workflows](../map-interactions/INTEGRATED.md).

## Verified

- `pnpm lint`, `pnpm test` (29 tests), `pnpm build`.
- Headless Chromium with software WebGL (SwiftShader), 15 scripted checks: opens on the globe; 2D and back; choice remembered across reloads; data cells on the globe; theme switch keeps the globe; drawing on the globe; a drag starting in space is ignored; search flight to Lisbon; mobile 375 px with touch; reduced motion; no page errors.

## Limitations

- Visual smoothness of flights was judged from screenshots in a software renderer; check it on a real GPU in the Vercel preview.
- A lat/lon rectangle looks slightly curved on the globe; the analysed area is exactly the rectangle shown.
- Selecting an area that spans the antimeridian or a pole is not possible today (data cover Brazil only); the camera handles such bounds for search results.
- MapLibre's `isPointOnMapSurface` is internal; if a future version removes it, every point counts as on the Earth (drawing still works, only the space guard is lost).
