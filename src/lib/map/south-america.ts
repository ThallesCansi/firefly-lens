import type { Map as MapLibreMap } from "maplibre-gl";
import { COVERAGE,type BBox } from "../data/types";
import { wrapLng } from "./camera";

/** Camera centres stay in this envelope; it is not a claim of cell calibration. */
export const SOUTH_AMERICA: BBox = COVERAGE;
export const MIN_CONTINENT_ZOOM = 1.6;

export function continentCenter(lng:number,lat:number): [number,number] {
  const [w,s,e,n]=SOUTH_AMERICA;
  return [Math.max(w,Math.min(e,wrapLng(lng))),Math.max(s,Math.min(n,lat))];
}

/** Basemap-only dimming. Fire activity and country selection keep their own coverage rules. */
export function addCoverageMask(map:MapLibreMap) {
  if (!map.getSource("outside-south-america")) map.addSource("outside-south-america",{
    type:"geojson",data:"/interaction-boundaries/south-america-mask.geojson",attribution:"Natural Earth",
  });
  if (!map.getLayer("outside-south-america")) map.addLayer({
    id:"outside-south-america",type:"fill",source:"outside-south-america",
    paint:{"fill-color":"#050a14","fill-opacity":.72,"fill-antialias":true},
  },map.getLayer("brazil") ? "brazil" : undefined);
}
