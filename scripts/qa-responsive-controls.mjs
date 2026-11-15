// Real state boundaries and map interaction. Only the basemap is replaced for deterministic network timing.
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base=process.env.QA_BASE_URL || "http://localhost:3117";
const output=process.env.QA_OUTPUT || "docs/responsive-controls-qa";
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:"chrome",headless:true,args:["--enable-unsafe-swiftshader"]});
const results=[],errors=[];
try {
  for(const [width,height] of (process.env.QA_SIZES ? JSON.parse(process.env.QA_SIZES) : [[1440,1000],[1100,900],[900,800],[760,800],[390,844],[320,740],[844,420]])) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:"reduce",hasTouch:width<900});
    await context.addInitScript(()=>{
      try {localStorage.setItem("firefly-lens-tour-auto-disabled-v1","true");localStorage.setItem("firefly-lens-intro-done","1");localStorage.setItem("firefly-lens-basemap-2","map");} catch { /* about:blank */ }
    });
    await context.route("https://tiles.openfreemap.org/**",r=>r.fulfill({json:{version:8,sources:{},layers:[{id:"background",type:"background",paint:{"background-color":"#283c35"}}]}}));
    const page=await context.newPage();page.setDefaultTimeout(45000);page.on("pageerror",e=>errors.push(e.message));
    await page.goto(`${base}/lens`,{waitUntil:"domcontentloaded"});
    await page.locator(".camera-trigger").waitFor({timeout:90000});
    const sizes=await page.locator(".map-view-controls").evaluate(el=>({camera:el.querySelector(".camera-control").getBoundingClientRect().width,projection:el.querySelector(".map-projection").getBoundingClientRect().width}));
    assert.ok(Math.abs(sizes.camera-sizes.projection)<=1,JSON.stringify(sizes));
    if(width<=900) {
      const key=page.locator(".map-key");
      assert.equal(await key.locator(".map-key-rows").isVisible(),false);
      await key.getByRole("button",{name:"Legend",exact:true}).click();
      assert.equal(await key.locator(".map-key-rows").isVisible(),true);
      await page.keyboard.press("Escape");
      assert.equal(await key.locator(".map-key-rows").isVisible(),false);
    }
    await page.getByRole("button",{name:"Camera controls",exact:true}).click();
    await page.getByRole("button",{name:"Focus Brazil",exact:true}).click();
    await page.waitForFunction(()=>{
      const value=document.querySelector('[data-tour="map-canvas"]')?.getAttribute("data-camera-center");
      if(!value)return false;const [x,y]=value.split(',').map(Number);return x>-60&&x<-44&&y>-18&&y<-8;
    });
    await page.waitForFunction(()=>document.querySelector('.camera-menu [role="status"]')?.textContent==="Camera ready");
    await page.keyboard.press("Escape");
    await page.getByRole("button",{name:"Pick a state",exact:true}).click();
    const picker=page.getByRole("region",{name:"Country or state selection",exact:true});
    await picker.waitFor();
    const map=await page.locator('[data-tour="map-canvas"]').boundingBox();
    const box=await picker.boundingBox();
    assert.ok(box.height<map.height*.5,JSON.stringify({map,box}));
    const point={x:map.x+map.width*.5,y:map.y+map.height*.6};
    const hit=await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.maplibregl-canvas-container'),point);
    assert.equal(hit,true,JSON.stringify({point,box}));
    if(width<900) await page.touchscreen.tap(point.x,point.y);
    else await page.mouse.click(point.x,point.y);
    await page.waitForFunction(()=>['ready','empty'].includes(document.querySelector('.ff-workspace-tools-card')?.getAttribute('data-phase')));
    if(await picker.getAttribute("data-phase")==="empty") {
      if(width<900) await page.touchscreen.tap(map.x+map.width*.52,map.y+map.height*.5);
      else await page.mouse.click(map.x+map.width*.52,map.y+map.height*.5);
    }
    await picker.getByRole("button",{name:"Use this state",exact:true}).waitFor();
    await page.screenshot({path:`${output}/${width}-state-picking.png`});
    await picker.getByRole("button",{name:"Use this state",exact:true}).click();
    const splitWidth=await page.locator(".workspace-map").evaluate(el=>el.clientWidth);
    if(splitWidth<=900) {
      const chip=page.locator('.selection-card-chip');await chip.waitFor();
      assert.equal(await page.locator('.selection-card-body').isVisible(),false);
    }
    await page.getByRole("button",{name:"Close analysis",exact:true}).click();
    const selected=page.getByRole("region",{name:"Selected area",exact:true});
    await selected.waitFor();
    if(width<=900) {
      assert.equal(await selected.locator(".selection-card-body").isVisible(),false);
      const chip=selected.locator(".selection-card-chip");
      assert.match(await chip.innerText(),/Area of interest/);
      await chip.click();assert.equal(await selected.locator(".selection-card-body").isVisible(),true);
      await page.keyboard.press("Escape");assert.equal(await selected.locator(".selection-card-body").isVisible(),false);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${output}/${width}-selected.png`});
    results.push({width,height,cameraAndProjectionWidth:sizes.camera,stateSelected:true,pickerHeight:box.height,mapHeight:map.height,collapsedCards:width<=900});
    await context.close();console.log(`${width}x${height}: camera, disclosures, map tap and state confirmation passed`);
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${output}/results.json`,JSON.stringify({results,errors},null,2));
} finally {await browser.close()}
