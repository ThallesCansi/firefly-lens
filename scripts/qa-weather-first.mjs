// Real local Python weather/history; basemap tiles are the only mocked dependency.
import assert from "node:assert/strict";
import { mkdir,writeFile } from "node:fs/promises";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base=process.env.QA_BASE_URL || "http://localhost:3119";
const out=process.env.QA_OUTPUT || "docs/weather-first-qa";
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:"chrome",headless:true,args:["--enable-unsafe-swiftshader"]});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
const errors=[],checks=[],responses=[];
context.on("page",p=>p.on("pageerror",e=>errors.push(e.message)));
await context.addInitScript(()=>{
  try {localStorage.setItem("firefly-lens-tour-auto-disabled-v1","true");localStorage.setItem("firefly-lens-intro-done","1");localStorage.setItem("firefly-lens-basemap-2","map");} catch { /* about:blank */ }
});
await context.route("https://tiles.openfreemap.org/**",r=>r.fulfill({json:{version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#24382e"}}]}}));
const triangle="poly:-57.6,-18.6;-56.4,-18.3;-56.8,-17.4";
async function open(area=triangle,page) {
  await page.goto(`${base}/lens?${new URLSearchParams({area,period:"2003-09",name:"Weather verification"})}`,{waitUntil:"domcontentloaded"});
  const intro=page.getByRole("button",{name:"Close the introduction",exact:true});if(await intro.isVisible())await intro.click();
  await page.locator('.analysis-scroll [data-tour="analysis-status"][data-tour-ready="true"]').waitFor({timeout:90000});
  await page.locator(".analysis-scroll").getByRole("button",{name:/see full report below/i}).click();
}
async function layout(page) {
  const report=page.locator(".analysis-report").first();
  const positions=await report.evaluate(el=>{
    const weather=el.querySelector(".weather-assessment").getBoundingClientRect();
    const tablist=el.querySelector('[role="tablist"]');
    const tabs=tablist.getBoundingClientRect();
    const buttons=[...tablist.querySelectorAll('[role="tab"]')].map(b=>b.getBoundingClientRect());
    return {weatherBottom:weather.bottom,tabsTop:tabs.top,tabCenter:(buttons[0].left+buttons.at(-1).right)/2,containerCenter:(tabs.left+tabs.right)/2,overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert.ok(positions.weatherBottom<=positions.tabsTop,JSON.stringify(positions));
  assert.ok(Math.abs(positions.tabCenter-positions.containerCenter)<2,JSON.stringify(positions));
  assert.equal(positions.overflow,false);
  return report;
}
try {
  const page=await context.newPage();
  page.on("response",async r=>{
    if(r.url().endsWith("/api/analytics/fire-weather") && r.status()===200) responses.push(await r.json());
  });
  await open(triangle,page);
  await page.locator('.weather-assessment[data-weather-status="available"]').waitFor({timeout:30000}).catch(async error=>{
    console.log(await page.locator('.weather-assessment').innerText());
    console.log(JSON.stringify(responses.map(r=>({status:r.data.status,reason:r.data.reason}))));
    throw error;
  });
  let report=await layout(page);
  assert.equal(await report.locator(".weather-summary").count(),1);
  assert.match(await report.locator(".weather-assessment").innerText(),/independent of the historical month/);
  await report.getByRole("heading",{name:"Historical fire activity, over time",exact:true}).waitFor();
  await report.getByRole("tab",{name:"Forecast",exact:true}).click();
  await report.getByRole("heading",{name:"Statistical Activity Forecast",exact:true}).waitFor();
  assert.equal(await report.locator('.weather-assessment[data-weather-status="available"]').count(),1);
  await report.locator(".weather-assessment").scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/desktop.png`});
  checks.push("Custom Brazilian polygon: real numeric weather leads centered tabs, remains across Forecast/History, and is independent of the 2003 map month");
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844}); await layout(page);
    await report.locator(".weather-assessment").scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/mobile-${width}.png`});
    checks.push(`${width}px: weather before centered tabs, no horizontal overflow`);
  }
  await page.setViewportSize({width:1440,height:1000});
  await open("country:PRY",page);
  await page.locator('.weather-assessment[data-weather-status="available"]').waitFor({timeout:90000});
  report=await layout(page);
  await report.getByRole("tab",{name:"Forecast",exact:true}).click();
  assert.equal(await report.locator(".weather-assessment").count(),1);
  checks.push("Paraguay: same weather-first order with one assessment across both tabs");
  const unavailable=await context.newPage();
  await unavailable.route("**/api/analytics/fire-weather",r=>r.fulfill({status:503,json:{detail:"weather_service_unavailable"}}));
  await open(triangle,unavailable);
  await unavailable.locator('.weather-assessment[data-weather-status="unavailable"]').waitFor();
  assert.equal(await unavailable.locator(".weather-summary").count(),0);
  await unavailable.getByRole("heading",{name:"Historical fire activity, over time",exact:true}).waitFor({timeout:60000});
  checks.push("Unavailable weather shows no numeric placeholder and does not block real History");
  assert.ok(responses.some(r=>r.data.status==="available" && r.data.provenance.synthetic===false && r.data.forecasts[0].valid_at===null));
  assert.deepEqual(errors,[]);
  const result={checks,errors,realWeather:responses.map(r=>({status:r.data.status,source:r.data.source_id,rows:r.data.forecasts.map(f=>({valid_date:f.valid_date,value:f.value,coverage:f.coverage_fraction}))}))};
  await writeFile(`${out}/results.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await browser.close()}
