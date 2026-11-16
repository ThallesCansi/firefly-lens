// Real MapLibre UI; substitute only the basemap for deterministic network timing.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const errors=[];
try {
  for(const [width,height] of [[1440,1000],[1100,900],[390,844],[320,740]]) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    await context.addInitScript(()=>{
      localStorage.setItem('firefly-lens-tour-auto-disabled-v1','true');
      localStorage.setItem('firefly-lens-intro-done','1');
      localStorage.setItem('firefly-lens-basemap-2','map');
    });
    await context.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#283c35'}}]}}));
    const page=await context.newPage();page.setDefaultTimeout(45000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${process.env.QA_BASE_URL||'http://localhost:3117'}/lens`,{waitUntil:'domcontentloaded'});
    const source=page.locator('.map-source-preview');await source.waitFor({state:'attached'});
    assert.equal(await source.isVisible(),width>700);
    assert.match(await source.textContent(),/OpenFreeMap/);
    const attribution=page.locator('.maplibregl-ctrl-attrib');
    await page.locator('.maplibregl-ctrl-attrib-button').click();
    assert.equal(await attribution.evaluate(el=>el.open),true);
    assert.equal(await attribution.locator('.maplibregl-ctrl-attrib-inner').isVisible(),true);
    await page.locator('.maplibregl-ctrl-attrib-button').click();
    const replay=page.locator('[data-tour="replay"]');
    if(width<701){
      assert.equal(await page.locator('.lume-replay-label').isVisible(),false);
      await replay.click();
      await page.getByRole('group',{name:'Tour with Lume',exact:true}).waitFor();
      assert.equal(await page.locator('.lume-tour-card:visible').count(),0);
      await page.keyboard.press('Escape');
      await page.getByRole('group',{name:'Tour with Lume',exact:true}).waitFor({state:'hidden'});
      await replay.click();await page.getByRole('button',{name:'Start tour',exact:true}).click();
    }else await replay.click();
    await page.locator('.lume-tour-card[data-tour-step="welcome"]').waitFor();
    await page.getByRole('button',{name:'Skip tour',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('main.lens-workspace')?.getAttribute('data-tour-active')==='false');
    await page.getByRole('button',{name:'Camera controls',exact:true}).click();
    await page.getByRole('button',{name:'Focus Brazil',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.camera-menu [role="status"]')?.textContent==='Camera ready');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.future-areas-notice').count(),0);
    await page.getByRole('button',{name:'Pick a state',exact:true}).click();
    const map=await page.locator('[data-tour="map-canvas"]').boundingBox();
    await page.mouse.click(map.x+map.width*.5,map.y+map.height*.6);
    await page.getByRole('button',{name:'Use this state',exact:true}).click();
    const nasa=page.getByRole('link',{name:/Open in NASA FIRMS/});await nasa.waitFor();
    const url=await nasa.getAttribute('href');
    assert.match(url,/#m:advanced;d:\d{4}-\d{2}-\d{2}/);
    assert.match(url,/fires_modis_aqua/);assert.match(url,/fires_viirs_noaa20/);
    assert.match(url,/;i:/);assert.equal(await nasa.getAttribute('target'),'_blank');
    await page.goto(`${process.env.QA_BASE_URL||'http://localhost:3117'}/lens?area=country:PRY&period=2003-09-01`);
    const panel=page.locator('.analysis-scroll');
    await panel.locator('[data-tour="analysis-status"][data-tour-ready="true"]').waitFor();
    const months=panel.getByRole('button',{name:'All months',exact:true});
    if(await months.isVisible())await months.click();
    assert.equal(await panel.evaluate(el=>el.scrollHeight<=el.clientHeight+2),true,'Calendar must fit after adding NASA link');
    await page.getByRole('button',{name:'Close analysis',exact:true}).click();
    for(const mode of ['2D Map','3D Globe']){
      await page.getByRole('button',{name:'Camera controls',exact:true}).click();
      await page.getByRole('button',{name:'Focus Brazil',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.camera-menu [role="status"]')?.textContent==='Camera ready');
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:mode,exact:true}).click();
      const canvas=await page.locator('.maplibregl-canvas').boundingBox();
      for(let i=0;i<3;i++){
        await page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);await page.mouse.down();
        await page.mouse.move(canvas.x+canvas.width*.95,canvas.y+canvas.height*.8,{steps:12});await page.mouse.up();
      }
      console.log(width,mode,'center',await page.locator('[data-tour="map-canvas"]').getAttribute('data-camera-center'));
      assert.equal(await page.locator('.future-areas-notice').isVisible(),false,'Coverage notice stays hidden at camera limits');
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`${process.env.TEMP}/firefly-context-${width}.png`});
    console.log(`${width}x${height}: tour, attribution, NASA query, fitted calendar and continent limits passed`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
