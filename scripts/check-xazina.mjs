import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const output=process.argv[2]||'www';
const base='/xazina-revamp';
const site=join(output,base.slice(1));
const audit=JSON.parse(await readFile(join(site,'catalog','route-map.json')));
const config=JSON.parse(await readFile('vercel.json'));
const routes=new Set(audit.routes.map(item=>item.path));
const required={product:audit.siteMap.products-1,collection:audit.siteMap.collections+1,article:audit.siteMap.articles,policy:4};
for(const [kind,count] of Object.entries(required))assert.equal(audit.routes.filter(r=>r.kind===kind).length,count,kind);
assert.deepEqual(audit.missingProducts,[]);
assert.deepEqual(audit.missingCaptures,audit.retiredSourceLinks);
for(const [alias,to] of Object.entries(audit.redirects)){
 assert.ok(routes.has(to),to);
 assert.ok(config.redirects.some(r=>r.source===base+alias&&r.destination===base+to&&r.permanent),alias);
}
assert.ok(config.redirects.some(r=>r.source===base+'/collections/:collection/products/:product'&&r.destination===base+'/products/:product'));
const files=[];
async function walk(dir){
 for(const f of await readdir(dir,{withFileTypes:true})){
  const target=join(dir,f.name);
  if(f.isDirectory())await walk(target);
  else if(f.name.endsWith('.html'))files.push(target);
 }
}
await walk(site);
const broken=new Set();
for(const f of files){
 const body=await readFile(f,'utf8');
 for(const m of body.matchAll(/href="(\/xazina-revamp[^"]*)"/g)){
  const u=new URL(m[1],'https://anchit-tandon.com');
  const p=decodeURIComponent(u.pathname).replace(/\/$/,'');
  if(p===base)continue;
  const local=join(output,p.slice(1));
  if(!existsSync(local)&&!existsSync(local+'.html')&&!existsSync(join(local,'index.html')))broken.add(p);
 }
}
assert.deepEqual([...broken],[],'Broken storefront links');
const home=await readFile(join(site,'index.html'),'utf8');
assert.match(home,/id="shop-navigation"/);
assert.match(home,/id="original-edit"/);
for(const r of audit.routes)assert.ok(existsSync(join(site,r.path.slice(1)+'.html')),r.path);
assert.ok(!existsSync(join(site,'catalog','snapshot.json')),'raw source snapshot must not be copied to the public route');
console.log(`Xazina: ${files.length} generated documents, ${audit.routes.length} themed destinations, ${Object.keys(audit.redirects).length} observed redirects, every local href resolved.`);
