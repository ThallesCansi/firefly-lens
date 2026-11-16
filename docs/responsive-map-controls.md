# Responsive map controls and usable state picking

The camera trigger now uses a side-view video camera icon and stretches to the
width of the projection controls below it. The mobile analysis layout retains
the compact camera button beside zoom without stretching its enclosing card.

When the available **map** width is 900 px or less, the selected area becomes
an “Area of interest” button with its full accessible place name. The name is
ellipsized visually where necessary. Clicking expands the existing actions and
description; Escape closes it and returns focus. The map legend becomes a
“Legend” disclosure. Both remain full cards on roomy maps. Their layout uses
container queries so a sidebar or the analysis drawer can reduce the available
space independently of the browser's outer width. Date/layer controls now fold
at the same width.

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
