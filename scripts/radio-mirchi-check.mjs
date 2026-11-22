import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {eventModel,subscriberModel,radioModel} from '../radio-mirchi/models.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=join(root,'radio-mirchi');
const files=(await readdir(dir)).filter(f=>f.endsWith('.html'));
assert.equal(files.length,18,'All study pages must exist');
const contents=Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(join(dir,f),'utf8')])));
for(const [file,html] of Object.entries(contents)){
 assert.equal((html.match(/<h1[>\s]/g)||[]).length,1,file+' needs one heading');
 const description=html.match(/<meta name="description" content="([^"]+)"/)[1];
 assert(description.length>=60&&description.length<=160,file+' description length');
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1,file+' active navigation');
 for(const m of html.matchAll(/(?:href|src)="(\/radio-mirchi[^"?#]*)(?:#([^"]*))?"/g)){
  const path=m[1].replace('/radio-mirchi','').replace(/^\//,'');
  const target=path?(path.includes('.')?path:path+'.html'):'index.html';
  const targetText=contents[target]||await readFile(join(dir,target),'utf8');
  if(m[2])assert(targetText.includes('id="'+m[2]+'"'),file+' invalid destination '+m[0]);
 }
}
// Business-model invariants: loss scenarios, zero denominators and capacity limits.
let e=eventModel({capacity:5000,occupancy:60,ticket:800,sponsor:1500000,ancillary:100000,fixed:3000000,variable:150});
assert.equal(e.contribution,550000);assert.equal(e.breakEven,2154);assert(e.withinCapacity);
e=eventModel({capacity:100,occupancy:100,ticket:100,sponsor:0,ancillary:0,fixed:50000,variable:100});
assert.equal(e.breakEven,null);assert.equal(e.contribution,-50000);assert.equal(e.withinCapacity,false);
assert.equal(eventModel({capacity:100,occupancy:0,ticket:100,sponsor:0,ancillary:0,fixed:1000,variable:50}).margin,null);
let s=subscriberModel({people:10000,price:600,retention:50,costshare:55,service:30,cac:180});
assert(Math.abs(s.firstYear-600000)<1e-7);assert.equal(s.renewed,5000);assert(Math.abs(s.paybackMonths-9)<1e-7);
assert.equal(subscriberModel({people:1,price:0,retention:0,costshare:0,service:0,cac:1}).paybackMonths,null);
let r=radioModel({seconds:100000,utilisation:70,yield:100,newutil:80,discount:10});
assert.equal(r.baseline,7000000);assert.equal(r.alternative,7200000);
assert.equal(radioModel({seconds:1,utilisation:70,yield:100,newutil:80,discount:100}).required,null);
assert.equal(radioModel({seconds:1,utilisation:0,yield:100,newutil:0,discount:0}).change,null);
console.log('Mirchi: 18 pages, internal destinations, metadata and economics invariants passed.');

assert.equal(radioModel({seconds:10,utilisation:0,yield:100,newutil:80,discount:100}).required,0);
const order = ['brief', 'problem', 'readout', 'solution', 'pilot', 'decision', 'map'];
const chapterPositions = order.map(id => contents['index.html'].indexOf('id="' + id + '"'));
assert(chapterPositions.every((p, i) => p >= 0 && (!i || p > chapterPositions[i-1])), 'Assignment reading order');
const prep = await readFile(join(root, 'radio-mirchi-interview-prep.html'), 'utf8');
assert(prep.includes('noindex,nofollow'), 'Interview prep indexing');
assert(Object.values(contents).every(s => !s.includes('/radio-mirchi-interview-prep')), 'Interview guide must stay unlinked');
assert(contents['prototype.html'].includes('id="offer-select"'), 'Renewal offer control');
assert(contents['initiatives.html'].includes('>FY25</th>'), 'FY25 timeline entry');


// New evidence-led audit, partner strategy and lab interaction invariants.
const lab=contents['lab.html'],platforms=contents['platforms.html'],digital=contents['digital.html'];
assert(!lab.includes('Search this study')&&!lab.includes('search.20261122.js'),'Lab should not load study search UI or index');
assert.equal((lab.match(/role="tab" /g)||[]).length,3,'Three accessible model tabs');
for(const id of ['subscribers','inventory','events'])assert(lab.includes('role="tabpanel" id="'+id+'"'),'Missing lab panel '+id);
for(const id of ['subscriber-model','radio-model','event-model'])assert(lab.includes('id="'+id+'"'),'Missing interactive form '+id);
assert(lab.includes('Assumptions &amp; definitions'),'Assumption definitions must sit in an accordion');
assert(lab.includes('INTERACTIVE MODEL')&&!lab.includes('>Prepare</span>'),'Lab eyebrow and header');
for(const id of ['gaana-ios-audit'])assert(platforms.includes('id="'+id+'"'),'Missing Gaana iOS evidence');
for(const id of ['pricing-trust','india-own-app'])assert(digital.includes('id="'+id+'"'),'Missing Gaana strategy or pricing');
for(const priority of ['P0','P1','P2'])assert(platforms.includes(priority),'Missing audit priority '+priority);
assert(digital.includes('₹59.08')&&digital.includes('₹54.54')&&digital.includes('₹116.58'),'Displayed monthly arithmetic correction');
assert(contents['metrics.html'].includes('id="habit-metric-tree"'),'Gaana metric tree');
assert(contents['plan.html'].includes('id="gaana-90"'),'Gaana 90-day partner plan');
for(const id of ['executive-pitch','walkthrough','bar-raiser','metric-tree'])assert(prep.includes('id="'+id+'"'),'Interview preparation section missing '+id);
assert(!Object.values(contents).some(s=>s.includes('href="/radio-mirchi-interview-prep"')),'Interview prep must not be linked from study');
console.log('Mirchi: Gaana iOS audit, strategy, tabbed lab and interview preparation invariants passed.');
