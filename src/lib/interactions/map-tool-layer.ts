import type { MapController, MapLike } from "../map/map-contract";
import type { PolygonGeometry } from "./administrative";
import type { BBox } from "../data/types";

export function rectangleGeometry([w, s, e, n]: BBox): PolygonGeometry {
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}
const SOURCE = "tool-workspace-selection";
const FILL = SOURCE + "-fill",
  LINE = SOURCE + "-line";
export function bindSelectionLayer(
  controller: Pick<MapController, "onStyleReady">,
) {
  let geometry: PolygonGeometry | null = null;
  let map: MapLike | null = null;
  const data = () => ({
    type: "FeatureCollection",
    features: geometry ? [{ type: "Feature", properties: {}, geometry }] : [],
  });
  const update = () =>
    (
      map?.getSource(SOURCE) as
        { setData: (value: unknown) => void } | undefined
    )?.setData(data());
  const unsubscribe = controller.onStyleReady((m) => {
    map = m;
    if (!m.getSource(SOURCE))
      m.addSource(SOURCE, { type: "geojson", data: data() });
    const before = m.getLayer("modis") ? "modis" : undefined;
    if (!m.getLayer(FILL))
      m.addLayer(
        {
          id: FILL,
          type: "fill",
          source: SOURCE,
          paint: { "fill-color": "#cce647", "fill-opacity": 0.16 },
        },
        before,
      );
    if (!m.getLayer(LINE))
      m.addLayer(
        {
          id: LINE,
          type: "line",
          source: SOURCE,
          paint: { "line-color": "#cce647", "line-width": 3 },
        },
        before,
      );
    update();
  });
  return {
    setGeometry(next: PolygonGeometry | null) {
      geometry = next;
      update();
    },
    dispose() {
      unsubscribe();
      for (const id of [LINE, FILL]) if (map?.getLayer(id)) map.removeLayer(id);
      if (map?.getSource(SOURCE)) map.removeSource(SOURCE);
      map = null;
    },
  };
}
