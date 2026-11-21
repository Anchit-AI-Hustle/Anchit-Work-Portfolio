import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {eventModel,subscriberModel,radioModel} from '../radio-mirchi/models.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=join(root,'radio-mirchi');
const files=(await readdir(dir)).filter(f=>f.endsWith('.html'));
assert.equal(files.length,20,'All study pages must exist');
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
console.log('Mirchi: 20 pages, internal destinations, metadata and economics invariants passed.');
