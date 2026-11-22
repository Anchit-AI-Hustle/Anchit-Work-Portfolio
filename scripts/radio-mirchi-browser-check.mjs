import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from 'playwright';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const BASE=process.env.PORTFOLIO_TEST_ORIGIN||'http://localhost:8099';
const studyFiles=(await readdir(join(ROOT,'radio-mirchi'))).filter(x=>x.endsWith('.html'));
const routes=[...studyFiles.map(f=>'/radio-mirchi/'+f),'/radio-mirchi-interview-prep.html'];
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let tested=0;
try{
 for(const route of routes){
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:30000});
  assert(response&&response.status()<400,route+' failed to load');
  assert.equal(await page.locator('h1').count(),1,route+' missing one H1');
  await page.waitForTimeout(60);
  assert.deepEqual(errors,[],route+' JavaScript page errors');
  await page.close();tested++;
 }
 // Check the new visual case-study sections at desktop and mobile widths.
 for(const width of [390,1280]){
  for(const [route,selector] of [
   ['/radio-mirchi/index.html','.reader-start'],
   ['/radio-mirchi/plan.html','#gaana-90 .plan-timeline'],
   ['/radio-mirchi/platforms.html','#gaana-ios-audit .phone-comparison'],
   ['/radio-mirchi/digital.html','#india-own-app .moment-grid'],
   ['/radio-mirchi/opportunities.html','#gaana-pilots .priority-cards'],
   ['/radio-mirchi/metrics.html','#habit-metric-tree .success-grid']
  ]){
   const page=await browser.newPage({viewport:{width,height:844}});
   const errors=[];page.on('pageerror',err=>errors.push(err.message));
   const response=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:30000});
   assert(response&&response.status()<400,'Reader-first page failed: '+route);
   assert(await page.locator(selector).count()===1,'Missing visual section: '+route+' '+selector);
   const geom=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
   assert(geom.width<=geom.viewport+2,'Horizontal overflow '+route+' @ '+width+': '+JSON.stringify(geom));
   assert.deepEqual(errors,[],'JavaScript errors '+route+' @ '+width);
   if(route.endsWith('/plan.html')){
    assert.equal(await page.locator('#gaana-90 .plan-phase').count(),4,'Four phases should be visible');
    const first=await page.locator('#gaana-90').boundingBox();
    const station=await page.locator('#sequence').boundingBox();
    assert(first&&station&&first.y<station.y,'Gaana-first visual order');
   }
   if(route.endsWith('/platforms.html'))assert.equal(await page.locator('#gaana-ios-audit .issue-card').count(),3,'Three urgent issue explanations');
   await page.close();
  }
 }
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(BASE+'/radio-mirchi/lab.html',{waitUntil:'domcontentloaded'});
  assert(response&&response.status()<400,'lab response');
  await page.locator('#subscriber-result .result-grid').waitFor();
  assert(await page.locator('#subscribers').isVisible(),'Gaana model should be default tab');
  const before=await page.locator('#subscriber-result').innerText();
  await page.locator('[data-model="subscriber-model"][data-preset="post"]').click();
  const after=await page.locator('#subscriber-result').innerText();
  assert.notEqual(before,after,'subscription preset must recalculate KPI cards');
  await page.locator('[data-tab="inventory"]').click();
  assert(await page.locator('#inventory').isVisible(),'FM model should open');
  assert(!await page.locator('#subscribers').isVisible(),'inactive tab must hide');
  await page.locator('[data-model="radio-model"][data-preset="pressure"]').click();
  assert((await page.locator('#inventory-takeaway').innerText()).includes('revenue'),'FM takeaway should update');
  await page.locator('[data-tab="events"]').click();
  await page.locator('[data-model="event-model"][data-preset="weak"]').click();
  assert((await page.locator('#events-takeaway').innerText()).includes('contribution'),'event takeaway should update');
  const state=await page.evaluate(()=>{
   const box=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom}};
   const a=box('.lab-inputs'),b=box('.lab-output');
   const overlap=Math.min(a.r,b.r)-Math.max(a.l,b.l)>1&&Math.min(a.b,b.b)-Math.max(a.t,b.t)>1;
   return {docWidth:document.documentElement.scrollWidth,viewport:innerWidth,overlap};
  });
  assert(state.docWidth<=state.viewport+2,'Lab has horizontal document overflow at '+width+': '+JSON.stringify(state));
  assert(!state.overlap,'Input controls and KPIs overlap at '+width);
  assert.deepEqual(errors,[],'Lab page errors at '+width);
  await page.close();
 }
 const prep=await browser.newPage({viewport:{width:390,height:844}});
 const response=await prep.goto(BASE+'/radio-mirchi-interview-prep.html');
 assert(response&&response.status()<400,'prep mobile response');
 const width=await prep.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));
 assert(width.document<=width.viewport+2,'Interview prep mobile overflow: '+JSON.stringify(width));
 await prep.close();
 console.log('Mirchi Chromium smoke: '+tested+' pages, subscription/radio/event interactions and mobile/desktop geometry passed.');
}finally{await browser.close();}
