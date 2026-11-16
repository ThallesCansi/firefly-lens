# Responsive map controls and usable state picking

The camera trigger now uses a side-view video camera icon and stretches to the
width of the projection controls below it. The mobile analysis layout retains
the compact camera button beside zoom without stretching its enclosing card.

The selected area and map legend are collapsed by default on **every device**.
The area header keeps its accessible place name and a separate, persistent
**Show analysis** button, so opening the calendar does not require finding an
action inside a disclosure. Secondary actions expand on click; Escape closes
them and returns focus. The legend header previews the actual sensor/area
symbols, including unusual activity when applicable; full labels and controls
expand on demand. Names ellipsize visually only where needed.

Container queries adapt docking when the map is 900 px or narrower, including
when a sidebar or analysis drawer reduces its space independently of the outer
viewport. Date/layer controls fold at that width. A narrow desktop map leaves
the assistant clear; mobile analysis stacks camera over zoom to leave the area
header accessible. Current screenshots are in
[compact-map-cards-qa](compact-map-cards-qa/).

State selection uses two explicit level buttons instead of a native select
picker. A height-bounded, scrollable card leaves the canvas available for taps
and dragging. Identification, candidate selection and the actual confirmation
still use the real administrative controller and published boundaries. Boundary
metadata remain in an expandable details section; the idle instruction now says
to tap the map instead of showing the previous cancellation message.

Short landscape layouts place cards beside the tools and hide the map-style
group to keep camera, projection and zoom accessible. Mobile selected-area chips
are raised clear of the basemap attribution. The tour can still access its
selection and legend targets while the workspace is inert. No scientific data,
calibration, imagery provider or analytics contracts change.

## Verification

254 Vitest tests, TypeScript and ESLint passed. A production build passed.
`scripts/qa-responsive-controls.mjs` uses real MapLibre and published Brazilian
state outlines with a deterministic basemap. It checks matching camera/projection
width, disclosure visibility/keyboard closure, pointer access to the canvas,
actual state identification/confirmation, split-map behavior and horizontal
overflow at 1440×1000, 1100×900, 900×800, 760×800, 390×844, 320×740 and 844×420.
Mobile cases use touch events on the map. Screenshots and results are in
[responsive-controls-qa](responsive-controls-qa/).

The integrated map-tools script was adjusted to use the new level buttons.
These checks validate application interactions; external basemap availability
and every device/browser combination are outside their scope.
