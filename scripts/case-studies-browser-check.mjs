import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const BASE=process.env.PORTFOLIO_TEST_ORIGIN||'http://localhost:8099';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 for(const width of [390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:860}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  const response=await page.goto(BASE+'/',{waitUntil:'domcontentloaded',timeout:30000});
  assert(response&&response.status()===200,'Portfolio must load');
  await page.waitForFunction(()=>typeof window.switchView==='function',{timeout:12000});
  await page.evaluate(()=>window.switchView('case-studies'));
  await page.locator('#view-case-studies.active').waitFor({state:'visible',timeout:12000});
  assert.equal(await page.locator('#view-case-studies .case-studies-card').count(),7,'Seven case study cards');
  assert(await page.locator('#view-case-studies a.case-studies-card[href="/medanta-study"]').isVisible(),'Medanta card visible');
  assert(await page.locator('#view-case-studies a[href="/medanta-study#presentation-deck"]').isVisible(),'Presentation link visible');
  const css=await page.locator('.sidebar-item[data-view="case-studies"]').getAttribute('class');
  assert(css?.includes('active'),'Case Studies tab must be active');
  const shape=await page.evaluate(()=>{
   const cards=[...document.querySelectorAll('#view-case-studies .case-studies-card')].map(el=>el.getBoundingClientRect());
   const overlap=cards.some((a,i)=>cards.some((b,j)=>i<j&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2));
   return {scrollWidth:document.documentElement.scrollWidth,innerWidth,overlap};
  });
  assert(shape.scrollWidth<=shape.innerWidth+2,'Horizontal overflow at '+width+': '+JSON.stringify(shape));
  assert(!shape.overlap,'Study cards collide at '+width);
  assert.deepEqual(errors,[],'Portfolio JS page errors at '+width);
  await page.evaluate(()=>window.switchView('home'));
  await page.locator('#view-home.active').waitFor({state:'visible'});
  await page.evaluate(()=>document.querySelector('.sidebar-item[data-view="case-studies"]').click());
  await page.locator('#view-case-studies.active').waitFor({state:'visible'});
  await page.close();
 }
 const routes=[
  '/radio-mirchi/index.html','/radio-mirchi/lab.html','/radio-mirchi-interview-prep.html',
  '/ET_Study/index.html','/TimesHealth_Study/index.html','/pw-study/index.html',
  '/lenskart-study/index.html','/amar-ujala/study.html','/medanta-study/index.html'
 ];
 const ctx=await browser.newContext();
 for(const path of routes){
  const response=await ctx.request.get(BASE+path);
  assert.equal(response.status(),200,'Built case-study route not served: '+path);
 }
 await ctx.close();
 console.log('PASS: Case Studies works at 390, 768 and 1440 px; seven cards, navigation, linked routes and overlap.');
}finally{await browser.close();}
