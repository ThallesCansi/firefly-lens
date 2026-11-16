import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const base=process.env.QA_BASE_URL||'http://localhost:3117';
try{
  for(const width of [1440,390]){
    const c=await browser.newContext({viewport:{width,height:900},reducedMotion:'no-preference'});
    await c.addInitScript(()=>{localStorage.setItem('firefly-lens-tour-auto-disabled-v1','true');localStorage.setItem('firefly-lens-intro-done','1');localStorage.setItem('firefly-lens-basemap-2','map');});
    await c.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#283c35'}}]}}));
    const p=await c.newPage();p.setDefaultTimeout(45000);
    const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(`${base}/lens?area=country:PRY&period=2003-09-01&sensors=MODIS`);
    await p.locator('[data-tour="analysis-status"][data-tour-ready="true"]').waitFor();
    const previous=await p.locator('[data-tour="sensors"] button').evaluateAll(els=>els.map(el=>el.getAttribute('aria-pressed')));
    await p.locator('[data-tour="replay"]').click();
    if(width<=700)await p.getByRole('button',{name:'Start tour',exact:true}).click();
    const step=id=>p.locator(`.lume-tour-card[data-tour-step="${id}"]`);
    await step('welcome').waitFor();
    assert.equal(await p.locator('[data-tour="selection"]').count(),0);
    assert.equal(await p.locator('.ff-interaction-panel:visible').count(),0);
    for(const id of ['map','search','region','pantanal','sensors','period','analyze','history','month']){
      await p.locator('.lume-tour-card .driver-popover-next-btn').click();await step(id).waitFor();
    }
    await p.evaluate(()=>{window.__tourScroll=[];window.addEventListener('scroll',()=>window.__tourScroll.push(scrollY));});
    await p.locator('.lume-tour-card .driver-popover-next-btn').click();await step('report').waitFor();
    const positions=await p.evaluate(()=>window.__tourScroll);
    assert.ok(new Set(positions.filter(y=>y>5&&y<Math.max(...positions)-5)).size>=3,'Report transition must visibly scroll through intermediate positions');
    await p.locator('.lume-tour-card .driver-popover-prev-btn').click();await step('month').waitFor();
    assert.ok(await p.evaluate(()=>scrollY)<2,'Back returns to the calendar');
    await p.getByRole('button',{name:'Skip tour',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('main.lens-workspace')?.getAttribute('data-tour-active')==='false');
    await p.locator('.analysis-heading').getByRole('heading',{name:'Paraguay',exact:true}).waitFor();
    assert.deepEqual(await p.locator('[data-tour="sensors"] button').evaluateAll(els=>els.map(el=>el.getAttribute('aria-pressed'))),previous);
    assert.match(await p.locator('[data-tour="period"]').innerText(),/2003/);
    assert.deepEqual(errors,[]);console.log(`${width}px: clean start, smooth report/back and prior area/sensors/date restoration passed`);
    await c.close();
  }
}finally{await browser.close();}
