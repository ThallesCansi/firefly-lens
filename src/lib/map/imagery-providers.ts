import type { RasterLayerSpecification, RasterSourceSpecification } from "maplibre-gl";

export type ImageryProviderId = "nasa-blue-marble" | "eox-sentinel-2025";
export const DEFAULT_IMAGERY: ImageryProviderId = "nasa-blue-marble";
// Keep the existing layer identifier for consumers of the original basemap.
export const IMAGERY_LAYER = "nasa-imagery";

type ImageryProvider = {
  id: ImageryProviderId;
  label: string;
  reference: string;
  mosaicYear: number | null;
  source: RasterSourceSpecification;
  paint(theme: "light" | "dark"): NonNullable<RasterLayerSpecification["paint"]>;
};

export const IMAGERY_PROVIDERS: Record<ImageryProviderId, ImageryProvider> = {
  "nasa-blue-marble": {
    id: "nasa-blue-marble", label: "NASA Blue Marble", mosaicYear: null,
    reference: "Static reference mosaic, independent of the analysis dates.",
    source: {
      type: "raster", tileSize: 256, minzoom: 0, maxzoom: 8,
      tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg"],
      attribution: '<a href="https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" target="_blank" rel="noreferrer">Imagery: NASA GIBS, Blue Marble</a>',
    },
    paint: (theme) => ({
      "raster-opacity": ["interpolate", ["linear"], ["zoom"], 9, 1, 11.5, 0],
      ...(theme === "dark" ? { "raster-brightness-max": 0.55, "raster-saturation": -0.2 } : {}),
    }),
  },
  "eox-sentinel-2025": {
    id: "eox-sentinel-2025", label: "Sentinel-2 · 2025", mosaicYear: 2025,
    reference: "2025 reference mosaic, independent of the analysis dates. Non-commercial imagery · CC BY-NC-SA 4.0.",
    source: {
      type: "raster", tileSize: 256, minzoom: 0, maxzoom: 14,
      // WMTS matrix g is Web Mercator. TileRow precedes TileCol in this URL.
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg"],
      attribution: '<a href="https://cloudless.eox.at" target="_blank" rel="noreferrer">EOxCloudless</a> by <a href="https://eox.at" target="_blank" rel="noreferrer">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2025) · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a> · 2025 reference mosaic, independent of analysis dates; display colors may be adjusted.',
    },
    // Overzoom remains visible; it does not imply additional native detail.
    paint: (theme) => ({ "raster-opacity": 1,
      ...(theme === "dark" ? { "raster-brightness-max": 0.8, "raster-saturation": -0.1 } : {}),
    }),
  },
};

export function imageryLayer(provider: ImageryProviderId, theme: "light" | "dark", source = IMAGERY_LAYER, visible = true): RasterLayerSpecification {
  return { id: IMAGERY_LAYER, type: "raster", source,
    layout: { visibility: visible ? "visible" : "none" }, paint: IMAGERY_PROVIDERS[provider].paint(theme) };
}
