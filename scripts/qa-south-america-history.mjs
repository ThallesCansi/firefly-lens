// Real local data and Python service; no model calls or live basemap dependency.
import assert from "node:assert/strict";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
const { chromium }=await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base=process.env.QA_BASE_URL || "http://localhost:3118";
const out=process.env.QA_OUTPUT || "docs/south-america-history-qa";
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:"chrome",headless:true,args:["--enable-unsafe-swiftshader"]});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",acceptDownloads:true});
await context.route(/https:\/\/(basemaps\.cartocdn\.com|tiles\.openfreemap\.org)\/.*/,(route)=>route.fulfill({json:{
  version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#65896c"}}],
}}));
await context.addInitScript(()=>{
  try {
  localStorage.setItem("firefly-lens-intro-done","1");
  localStorage.setItem("firefly-lens-tour-auto-disabled-v1","true");
  localStorage.setItem("firefly-lens-theme","dark");
  } catch { /* The initial about:blank document has no storage origin. */ }
});
const page=await context.newPage();
page.setDefaultTimeout(45000);
const checks=[],errors=[],requests=[];
context.on("page",(p)=>p.on("pageerror",(error)=>errors.push(error.message)));
page.on("pageerror",(error)=>errors.push(error.message));
page.on("request",(request)=>requests.push(request.url()));
const sidebar=(p=page)=>p.locator(".analysis-scroll");
const report=(p=page)=>p.locator(".analysis-report");
async function ready(p=page) {
  await sidebar(p).locator('[data-tour="analysis-status"][data-tour-ready="true"]').waitFor({timeout:90000});
}
async function choose(id) {
  await page.getByRole("button",{name:"Coordinates",exact:true}).click();
  await page.locator('[data-tour="presets"]').selectOption(id);
  await ready();
}
async function noScroll(p=page) {
  await sidebar(p).locator(".calendar-overview table").waitFor();
  await p.waitForFunction(()=>{
    const el=document.querySelector('.analysis-scroll');
    return el && el.scrollHeight<=el.clientHeight+1;
  });
  const measurement=await sidebar(p).evaluate((el)=>{
    const button=el.querySelector('[data-tour="open-report"]');
    const a=el.getBoundingClientRect(),b=button.getBoundingClientRect();
    return {client:el.clientHeight,scroll:el.scrollHeight,buttonVisible:b.top>=a.top && b.bottom<=a.bottom+1};
  });
  assert.equal(measurement.buttonVisible,true,JSON.stringify(measurement));
  assert.equal(await sidebar(p).locator(".analytics-chart").count(),0);
  return measurement;
}
async function show(element) {
  await element.evaluate((el)=>window.scrollTo({top:scrollY+el.getBoundingClientRect().top-88,behavior:"instant"}));
}
try {
  assert.equal((await context.request.get(`${base}/api/analytics/status`)).status(),200);
  await page.goto(`${base}/lens`);
  await choose("pantanal");
  await noScroll();
  assert.ok(await sidebar().locator('.calendar-overview tbody tr').count()>=12,"Desktop calendar should use the available panel height");
  await page.screenshot({path:`${out}/brazil-sidebar.png`});
  checks.push("Brazil opens a fitted year/month calendar with the report button visible and no sidebar chart or vertical scrolling");
  await sidebar().getByRole("button",{name:/see full report below/i}).click();
  await report().getByRole("heading",{name:"Historical fire activity, over time",exact:true}).waitFor();
  await report().getByLabel("Resolution").selectOption("annual");
  await report().getByRole("heading",{name:"Annual activity",exact:true}).waitFor();
  await report().getByLabel("Resolution").selectOption("monthly");
  await show(report().getByRole("heading",{name:"Historical fire activity, over time",exact:true}));
  await page.screenshot({path:`${out}/brazil-full-report.png`});
  checks.push("Historical monthly/annual analyses remain in the full report below the map");

  await choose("raw:PRY");
  await noScroll();
  await page.evaluate(()=>window.scrollTo(0,0));
  const countryStart=requests.length;
  const older=sidebar().getByRole("button",{name:"Older years",exact:true});
  while (await sidebar().getByRole("button",{name:/^September 2003:/}).count()===0) {
    assert.equal(await older.isEnabled(),true);
    await older.click();
  }
  await sidebar().getByRole("button",{name:/^September 2003:/}).click();
  await sidebar().getByRole("heading",{name:"September 2003",exact:true}).waitFor();
  await sidebar().locator('[data-date="2003-09-01"]').click();
  await page.waitForFunction(()=>document.querySelector('.map-key-status')?.textContent?.includes("Loading")===false);
  assert.equal(requests.slice(countryStart).some((url)=>url.includes("/data/brazil/t_")),false);
  assert.equal(requests.some((url)=>url.includes("/paraguay/map-days/2003-09.json.gz")),true);
  const ownRaw=await (await context.request.get(`${base}/data/continental/paraguay/manifest.json`)).json();
  const year=ownRaw.daily["2003"];
  const body=await (await context.request.get(new URL(year.url,base).href)).body();
  const daily=JSON.parse((body[0]===0x1f ? gunzipSync(body):body).toString("utf8"));
  const first=daily.find((row)=>row[0]==="2003-09-01");
  const downloadReady=page.waitForEvent("download");
  await page.getByRole("button",{name:"CSV",exact:true}).click();
  const csv=(await readFile(await (await downloadReady).path(),"utf8")).trim().split("\n");
  assert.equal(csv[0],"period,cell_id,longitude,latitude,modis_aqua_raw,viirs_noaa20_raw");
  assert.equal(csv.slice(1).reduce((sum,row)=>sum+Number(row.split(",")[4]),0),first[1]+first[2]);
  await sidebar().getByRole("button",{name:"All months",exact:true}).click();
  await noScroll();
  await page.screenshot({path:`${out}/paraguay-old-calendar.png`});
  checks.push("Paraguay's 2003 year/month/day calendar and day-map CSV reconcile with its own real country archive without Brazilian tile substitution");

  await page.getByRole("button",{name:"Share",exact:true}).click();
  const shared=page.url();
  assert.equal(new URL(shared).searchParams.get("area"),"country:PRY");
  assert.equal(new URL(shared).searchParams.get("period"),"2003-09-01");
  const restored=await context.newPage();
  await restored.goto(shared); await ready(restored);
  assert.match(await restored.locator('.analysis-heading').innerText(),/Paraguay/);
  await noScroll(restored);
  await restored.close();
  checks.push("Shared country links preserve old historical dates and daily selection");

  await sidebar().getByRole("button",{name:/see full report below/i}).click();
  await report().getByRole("tab",{name:"History",exact:true}).click();
  await report().getByRole("heading",{name:"Historical fire activity, over time",exact:true}).waitFor();
  assert.match(await report().innerText(),/2002-07/);
  assert.match(await report().innerText(),/2025-12/);
  await report().getByLabel("Resolution").selectOption("annual");
  await report().getByRole("heading",{name:"Annual activity",exact:true}).waitFor();
  await show(report().getByRole("heading",{name:"National fire activity · Paraguay",exact:true}));
  await page.screenshot({path:`${out}/paraguay-full-history.png`});
  await report().getByRole("tab",{name:"Forecast",exact:true}).click();
  await report().getByText("No current numeric forecast",{exact:true}).waitFor();
  await report().getByLabel("Historical forecast origin").selectOption("2016-09");
  const retrospectiveReady=page.waitForResponse((response)=>response.url().endsWith("/api/analytics/retrospective") && response.request().method()==="POST");
  await report().getByRole("button",{name:"Run retrospective forecast",exact:true}).click();
  const response=await retrospectiveReady;
  assert.equal(response.status(),200);
  const retro=await response.json(),forecast=retro.sections.forecast.data;
  assert.equal(retro.sections.history.source.provenance.country_code,"PRY");
  assert.equal(forecast.forecast_origin,"2016-09");
  assert.equal(forecast.training_period.end,"2016-09");
  assert.equal(forecast.predictions.every((row)=>row.value!==null && row.date>"2016-09" && row.date<="2016-12"),true);
  await report().getByRole("heading",{name:"Past forecast and later eligible observations",exact:true}).waitFor();
  await show(report().getByRole("heading",{name:"What would the model have forecast?",exact:true}));
  await page.screenshot({path:`${out}/paraguay-retrospective.png`});
  await writeFile(`${out}/paraguay-retrospective.json`,JSON.stringify(retro,null,2));
  checks.push("Countries expose the same History/Forecast report tabs; a genuine 2016 Paraguayan retrospective uses its own long history and no later training data");

  await page.getByRole("button",{name:"Close analysis",exact:true}).click();
  await page.getByRole("button",{name:"Reset view",exact:true}).click();
  const tour=page.locator('[data-tour="replay"]'),zoom=page.getByRole("button",{name:"Zoom out",exact:true});
  const tourBox=await tour.boundingBox(),zoomBox=await zoom.boundingBox(),mapBox=await page.locator('.workspace-map').boundingBox();
  assert.ok(tourBox.x+tourBox.width/2>mapBox.x+mapBox.width/2);
  assert.ok(Math.abs(tourBox.y-zoomBox.y)<180);
  for (const mode of ["2D Map","3D Globe"]) {
    await page.getByRole("button",{name:mode,exact:true}).click();
    const canvas=await page.locator('.maplibregl-canvas').boundingBox();
    for (const direction of [-1,1]) {
      for (let i=0;i<3;i++) {
        await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);
        await page.mouse.down();
        await page.mouse.move(canvas.x+canvas.width*(direction<0?.1:.9),canvas.y+canvas.height*.65,{steps:12});
        await page.mouse.up();
      }
    }
    await page.waitForTimeout(1200);
    const center=await page.locator('[data-tour="map-canvas"]').getAttribute("data-camera-center");
    const [lng,lat]=center.split(",").map(Number);
    assert.ok(lng>=-85.001 && lng<=-31.999 && lat>=-58.001 && lat<=14.001,center);
  }
  assert.equal(requests.some((url)=>url.includes("south-america-mask.geojson")),true);
  await page.getByRole("button",{name:"Reset view",exact:true}).click();
  await page.screenshot({path:`${out}/continent-scope-dark.png`});
  await page.getByRole("button",{name:"Switch to light theme",exact:true}).click();
  await page.screenshot({path:`${out}/continent-scope-light.png`});
  checks.push("Tour sits beside the bottom-right zoom controls; large drags remain bounded to South America in flat/globe modes and the outside mask reloads with themes");

  for (const [width,height] of [[320,740],[390,844]]) {
    const mobile=await context.newPage();
    await mobile.setViewportSize({width,height});
    await mobile.goto(`${base}/lens?area=country:PRY&period=2025-09`);
    await ready(mobile); const measurement=await noScroll(mobile);
    const mobileMap=await mobile.locator('.workspace-map').boundingBox();
    for (const locator of [mobile.locator('[data-tour="replay"]'),mobile.getByRole('button',{name:'Zoom in',exact:true})]) {
      const box=await locator.boundingBox();
      assert.ok(box.y>=mobileMap.y && box.y+box.height<=mobileMap.y+mobileMap.height+1,"Tour and zoom controls should remain visible above the mobile calendar");
    }
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    await mobile.screenshot({path:`${out}/paraguay-sidebar-${width}.png`});
    await mobile.close();
    checks.push(`${width}px: calendar and report button fit without sidebar or document overflow (${measurement.client}px panel)`);
  }
  await choose("raw:ECU");
  await ready(); await noScroll();
  await report().getByRole("heading",{name:"National fire activity · Ecuador",exact:true}).waitFor();
  checks.push("Switching to Ecuador loads its own long calendar and report");
  await page.goto(`${base}/method#fire-danger-risk`);
  await page.getByRole("heading",{name:"What the Canadian FWI System measures",exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  await writeFile(`${out}/browser-results.json`,JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({checks,errors},null,2));
} finally { await browser.close(); }
