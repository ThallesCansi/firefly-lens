import { describe,expect,it } from "vitest";
import { continentCenter,SOUTH_AMERICA } from "./south-america";

describe("South American navigation",()=>{
  it("keeps the Southern Cone, Caribbean coast and western countries reachable",()=>{
    for (const center of [[-70,-55],[-75,-10],[-62,12],[-35,-8]]) expect(continentCenter(center[0],center[1])).toEqual(center);
  });
  it("bounds long drags and wrapped world copies without changing a covered centre",()=>{
    const [w,s,e,n]=SOUTH_AMERICA;
    expect(continentCenter(2,48)).toEqual([e,n]);
    expect(continentCenter(150,-80)).toEqual([e,s]);
    expect(continentCenter(-200,0)).toEqual([e,0]);
    expect(continentCenter(300,-20)).toEqual([-60,-20]);
    expect(continentCenter(-100,-20)).toEqual([w,-20]);
  });
});
