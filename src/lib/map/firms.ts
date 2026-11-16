import type { AnalysisArea, Sensor } from "../data/types";

/** Verified against FIRMS' public hash parser (d, l and i) and layer catalog. */
export function firmsLink(area: AnalysisArea, period: string, sensors: Sensor[]) {
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(period) || !sensors.length) return null;
  const first=period.length===7?`${period}-01`:period;
  const parsed=new Date(`${first}T00:00:00Z`);
  if(!Number.isFinite(+parsed) || parsed.toISOString().slice(0,10)!==first) return null;
  const last=period.length===10?first:new Date(Date.UTC(parsed.getUTCFullYear(),parsed.getUTCMonth()+1,0)).toISOString().slice(0,10);
  const layers=[...new Set(sensors)].flatMap(sensor=>sensor==="MODIS"?["fires_modis_aqua","fires_modis_aqua_sp"]:sensor==="VIIRS"?["fires_viirs_noaa20","fires_viirs_noaa20_sp"]:[]);
  if(!layers.length) return null;
  const date=first===last?first:`${first}..${last}`;
  const prefix=`https://firms.modaps.eosdis.nasa.gov/map/#m:advanced;d:${date};l:${layers.join(",")};i:`;
  const polygons=area.geometry.type==="Polygon"?[area.geometry.coordinates]:area.geometry.coordinates;
  if(polygons.some(p=>p.some(r=>r.some(point=>point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90)))) return null;
  const rings=polygons.map(p=>p.map(r=>`(${r.map(([x,y])=>`${x} ${y}`).join(",")})`).join(","));
  const wkt=area.geometry.type==="Polygon"?`POLYGON(${rings[0]})`:`MULTIPOLYGON(${rings.map(r=>`(${r})`).join(",")})`;
  // FIRMS reads WKT punctuation literally and decodes %20 for coordinate spaces.
  const exact=prefix+wkt.replaceAll(" ","%20");
  if(exact.length<=7000) return {url:exact,scope:"outline" as const};
  return {url:prefix+area.bbox.join(","),scope:"extent" as const};
}
