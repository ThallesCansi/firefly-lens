import {expect,it} from "vitest";
import {rectangleArea,type AnalysisArea} from "../data/types";
import {firmsLink} from "./firms";

const area=rectangleArea([-58,-23,-57,-22]);
it("preserves a day and only the selected platforms, including archive and NRT layers",()=>{
  const result=firmsLink(area,"2003-09-01",["MODIS"])!;
  expect(result.url).toContain("#m:advanced;");
  expect(result.url).toContain("d:2003-09-01;");
  expect(result.url).toContain("l:fires_modis_aqua,fires_modis_aqua_sp;");
  expect(result.url).not.toContain("terra");expect(result.url).not.toContain("viirs");
  expect(result.url).toContain("i:POLYGON((-58%20-23");expect(result.scope).toBe("outline");
});
it("keeps a leap-year month and NOAA-20, without substituting Suomi or NOAA-21",()=>{
  const result=firmsLink(area,"2024-02",["VIIRS"])!;
  expect(result.url).toContain("d:2024-02-01..2024-02-29;");
  expect(result.url).toContain("fires_viirs_noaa20_sp");
  expect(result.url).not.toMatch(/snpp|noaa21|modis/);
});
it("retains multipolygon rings and holes, falling back honestly for long outlines",()=>{
  const hole=[[-57.8,-22.8],[-57.2,-22.8],[-57.2,-22.2],[-57.8,-22.8]];
  const geometry={type:"MultiPolygon" as const,coordinates:[area.geometry.type==="Polygon"?[...area.geometry.coordinates,hole]:[]]};
  const exact=firmsLink({...area,geometry},"2023-09",["MODIS"])!.url;
  expect(exact).toContain("i:MULTIPOLYGON(((-58%20-23");
  expect(exact).toContain(",(-57.8%20-22.8,-57.2%20-22.8,-57.2%20-22.2,-57.8%20-22.8)))");
  const long={...area,geometry:{type:"Polygon" as const,coordinates:[Array.from({length:2000},(_,i)=>[-58+i/10000,-23])]}} as AnalysisArea;
  const result=firmsLink(long,"2023-09",["MODIS","VIIRS"])!;
  expect(result.scope).toBe("extent");expect(result.url).toContain("i:-58,-23,-57,-22");expect(result.url.length).toBeLessThan(1000);
});
it("does not silently open NASA defaults for an empty sensor query or malformed date",()=>{
  for(const date of ["2023-02-30","2023-13","invalid"])expect(firmsLink(area,date,["MODIS"])).toBeNull();
  expect(firmsLink(area,"2023-09",[])).toBeNull();
});
