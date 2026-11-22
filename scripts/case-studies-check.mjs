import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const read=(p)=>readFile(join(ROOT,p),'utf8');
const html=await read('index.html');
const hub=(html.match(/<section class="view" id="view-case-studies"[\s\S]*?<\/section>/)||[])[0];
assert(hub,'Dedicated Case Studies view missing');
assert.equal((hub.match(/class="case-studies-card"/g)||[]).length,6,'Six brand study cards');
assert(html.includes('href="#case-studies" data-view="case-studies" aria-label="Case Studies"'),'Sidebar navigation missing');
assert(html.includes("'experience','case-studies','projects'"),'SPA route is not registered');
assert(html.includes("case-studies': 'Case Studies'"),'Narration/view label missing');
assert(!html.includes('href="/radio-mirchi-interview-prep"'),'Interview prep must stay out of main portfolio links');
const routes=[
  ['Radio Mirchi + Gaana','/radio-mirchi','radio-mirchi/index.html'],
  ['The Economic Times','/ET_Study','ET_Study/index.html'],
  ['Times Health+','/TimesHealth_Study','TimesHealth_Study/index.html'],
  ['PhysicsWallah','/pw-study','pw-study/index.html'],
  ['Lenskart','/lenskart-study','lenskart-study/index.html'],
  ['Amar Ujala','/amar-ujala/study','amar-ujala/study.html']
];
for(const [brand,route,file] of routes){
 assert(hub.includes(brand),'Brand missing: '+brand);
 assert(hub.includes('href="'+route+'"'),'Route missing: '+route);
 assert((await stat(join(ROOT,file))).isFile(),'Study entry missing: '+file);
}
for(const url of ['/radio-mirchi/platforms#gaana-ios-audit','/radio-mirchi/digital#india-own-app','/radio-mirchi/plan#gaana-90','/radio-mirchi/lab'])
 assert(hub.includes('href="'+url+'"'),'Related Mirchi chapter link missing: '+url);
assert(hub.includes('independent research and product proposals'),'Studies must be clearly independent');
const prep=await read('radio-mirchi-interview-prep.html');
for(const id of ['executive-pitch','walkthrough','bar-raiser','metric-tree'])assert(prep.includes('id="'+id+'"'),'Interview prep missing '+id);
const study=await read('radio-mirchi/plan.html');
assert(study.includes('id="gaana-90"')&&study.includes('What I would do in the first 90 days'),'Case study plan needs the four-stage work');
console.log('PASS: six brand studies, independent-research disclaimer, sidebar routing, deep links and interview guide.');
