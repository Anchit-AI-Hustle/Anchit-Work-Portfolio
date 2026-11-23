import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
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
for(const phrase of ['FIX FIRST','IMPROVE NEXT','POLISH'])assert(platforms.includes(phrase),'Missing plain-language issue priority '+phrase);
assert(digital.includes('₹59.08')&&digital.includes('₹54.54')&&digital.includes('₹116.58'),'Displayed monthly arithmetic correction');
assert(contents['metrics.html'].includes('id="habit-metric-tree"'),'Gaana metric tree');
assert(contents['plan.html'].includes('id="gaana-90"'),'Gaana 90-day partner plan');
for(const id of ['executive-pitch','walkthrough','bar-raiser','metric-tree'])assert(prep.includes('id="'+id+'"'),'Interview preparation section missing '+id);
assert(!Object.values(contents).some(s=>s.includes('href="/radio-mirchi-interview-prep"')),'Interview prep must not be linked from study');
console.log('Mirchi: Gaana iOS audit, strategy, tabbed lab and interview preparation invariants passed.');

execFileSync(process.execPath,['--check',join(dir,'lab.20261123.js')],{stdio:'pipe'});
console.log('Mirchi: lab module passes Node syntax check.');


// Reader-first information design and accuracy checks.
const plan=contents['plan.html'];
assert(plan.includes('What I would do in the first 90 days'),'90-day plan headline must explain the purpose');
assert(plan.indexOf('id="gaana-90"')<plan.indexOf('id="sequence"'),'Gaana plan must come before the separate station plan');
assert(plan.includes('START HERE')&&plan.includes('THE IDEA IN ONE GLANCE'),'Reader should see context and an overview before technical detail');
assert(plan.includes('Make listening easy')&&plan.includes('Make returning rewarding'),'Visual three-step listener journey must exist');
assert(!plan.includes('Joint Gaana track: a gated 90-day experiment'),'Jargon-heavy heading must not return');
assert(platforms.indexOf('id="gaana-ios-audit"')<platforms.indexOf('id="test-depth"'),'The Gaana app evidence should be presented before secondary research');
assert(platforms.includes('phone-comparison')&&platforms.includes('SIMPLIFIED ILLUSTRATION'),'Before/after diagram must be clearly labelled');
assert(digital.includes('moment-grid')&&digital.indexOf('id="india-own-app"')<digital.indexOf('id="live-products"'),'Introduce the value idea before deep background');
assert(contents['opportunities.html'].indexOf('id="gaana-pilots"')<contents['opportunities.html'].indexOf('id="advertiser"'),'Priorities must precede unrelated business detail');
assert(contents['metrics.html'].indexOf('id="habit-metric-tree"')<contents['metrics.html'].indexOf('id="tree"'),'Lead with the listener scorecard');
assert(contents['index.html'].includes('reader-start')&&contents['index.html'].includes('context-pillars'),'Case-study landing must orient new readers with full context first');
for(const [file,html] of Object.entries(contents)){
 assert(html.includes('class="nav-appendix"'),file+' must group reference navigation inside collapsible appendix');
}
assert(prep.includes('interview-orientation'),'Interview guide must explain the case before the scripts');
for(const file of ['index.html','plan.html','digital.html','platforms.html','opportunities.html','metrics.html']){
 assert(contents[file].includes('/radio-mirchi/clarity.20261123.css'),file+' must load reader-first styles');
}
assert(contents['index.html'].includes('<a href="/radio-mirchi/platforms"><small>Next</small>Gaana iPhone audit</a>'),'Index Next link must follow core reading order');
assert(contents['platforms.html'].includes('<a href="/radio-mirchi/digital"><small>Next</small>'),'Platforms Next link must lead to strategy');
assert(contents['digital.html'].includes('<a href="/radio-mirchi/opportunities"><small>Next</small>'),'Digital Next link must lead to priorities');
console.log('Mirchi: reader context, visual evidence and navigation order verified.');


// Four-platform audience, engagement, ranked issue and source integrity.
const users=contents['users.html'];
assert(users.includes('id="four-app-userbase"')&&users.includes('id="four-app-engagement"'),'Separate four-platform audience and engagement reviews required');
for(const label of ['Gaana · iOS','Gaana · Android','Mirchi Plus · Android','Mirchi Plus · iOS'])assert(users.includes(label),'Audience missing '+label);
for(const text of ['20.0M+','153.1M+','Missing:','not Mirchi Plus app MAU'])assert(users.includes(text),'Audience limitations should be visible: '+text);
assert(platforms.includes('id="ranked-mobile-issues"')&&platforms.includes('id="mobile-issue-overview"'),'Priority issue register and four-OS overview required');
assert.equal((platforms.match(/data-heading="Rank"/g)||[]).length,28,'Exactly 28 numbered issue rows required');
for(const tier of ['P0','P1','P2'])assert(platforms.includes(' · '+tier+'</strong>'),'Missing rank tier '+tier);
for(const label of ['Gaana iOS','Gaana Android','Mirchi Android','Mirchi iOS'])assert(platforms.includes(label),'Issue coverage missing '+label);
assert(contents['digital.html'].includes('id="mobile-audience-strategy"'),'Digital strategy not synced to mobile users');
assert(contents['metrics.html'].includes('id="four-app-measurement"'),'Four-platform scorecard missing');
assert(contents['sources.html'].includes('id="app-audience-evidence"'),'Source limits missing');
assert(prep.includes('id="four-app-interview"'),'Interview prep must include four-app pushback');
assert(!users.includes('iOS MAU: 10')&&!users.includes('Android MAU: 10'),'Do not fabricate OS-level active users');
console.log('Mirchi: four app audiences, 28 prioritized findings, data-quality limits and interview sync passed.');

// The 28-item visual evidence experience must retain the full inspectable source table.
assert.equal((platforms.match(/class="issue-visual-card"/g)||[]).length,28,'All ranked issues require a visual card');
assert(platforms.includes('id="issue-filters"')&&platforms.includes('id="issue-visual-grid"'),'Visible issue filters and gallery required');
assert(platforms.includes('DIAGNOSTIC VISUAL')&&platforms.includes('not an actual app screenshot'),'Diagram vs screenshot integrity');
assert(platforms.includes('7 Gaana iOS screenshots')&&platforms.includes('1 iOS screen recording'),'Evidence inventory must be explicit');
