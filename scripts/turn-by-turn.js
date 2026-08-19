// Turn-by-turn reveal, checked across the site.
//
// Two properties, both of which have been broken by accident already:
//
//   maxAtOnce  how many blocks gained their revealed class inside a 40ms
//              window. This must be 1. It was 13 twice — once because the
//              backlog valve flushed the whole queue at the patience limit,
//              and once because the drain was re-entrant: each drain emptied
//              the queue and cleared its own flag, so a loop of enqueues found
//              it idle every time and revealed each one synchronously.
//
//   adjSame    how many blocks share an entrance with the block before them.
//              This must be 0 — the variants exist so a page does not read as
//              one animation repeated, and assigning them by a plain 1..6 cycle
//              is its own visible pattern.
//
// Run it against a served build:  node scripts/turn-by-turn.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const PAGES = process.argv.slice(2).length?process.argv.slice(2):
  ['index.html','agent.html','jobhunt.html','lifecycle-os.html','hotel.html','marketing-101.html','lifecycle-os-ads.html'];
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  console.log('page'.padEnd(26)+'variants'.padStart(9)+'adjSame'.padStart(9)+'maxAtOnce'.padStart(11)+'  allShown');
  for (const page of PAGES) {
    const p = await (await b.newContext({ viewport:{width:1440,height:900} })).newPage();
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    await p.route(/i\.ytimg\.com|youtube\.com/, r=>r.abort());
    await p.addInitScript(()=>{ window.__reveals=[];
      const mo=new MutationObserver(ms=>{ for(const m of ms){ const t=m.target;
        if(m.attributeName==='class' && t.classList && t.classList.contains('cin-in') && !t.__logged){
          t.__logged=1; window.__reveals.push(Math.round(performance.now())); } } });
      addEventListener('DOMContentLoaded',()=>mo.observe(document.body,{attributes:true,subtree:true,attributeFilter:['class']}));
    });
    try { await p.goto(`http://127.0.0.1:8099/${page}`,{waitUntil:'load',timeout:25000}); } catch { console.log(page,'load fail'); await p.close(); continue; }
    await p.waitForTimeout(3500);
    await p.evaluate(async ()=>{ const H=document.documentElement.scrollHeight;
      for(let y=0;y<H;y+=500){ window.scrollTo(0,y); await new Promise(r=>setTimeout(r,90)); } });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(()=>{
      const els=[...document.querySelectorAll('.cin, .cin-stagger')];
      const vs=els.map(e=>(e.className.match(/cin-v[1-6]/)||[''])[0]).filter(Boolean);
      let adj=0; for(let i=1;i<vs.length;i++) if(vs[i]===vs[i-1]) adj++;
      // how many revealed within any 40ms window? (a burst)
      const t=window.__reveals.slice().sort((a,z)=>a-z); let mx=0;
      for(let i=0;i<t.length;i++){ let n=1; for(let j=i+1;j<t.length && t[j]-t[i]<=40;j++) n++; if(n>mx)mx=n; }
      const vis=e=>{let n=e; while(n&&n!==document.body){ if(getComputedStyle(n).display==='none') return false; n=n.parentElement;} return true;};
      const hidden=els.filter(e=>vis(e) && +getComputedStyle(e).opacity<0.9).length;
      return { variants:new Set(vs).size, tagged:els.length, adj, mx, hidden };
    });
    console.log(page.padEnd(26)+String(r.variants+'/6').padStart(9)+String(r.adj).padStart(9)
      +String(r.mx).padStart(11)+'  '+(r.hidden===0?'yes':'NO — '+r.hidden+' still hidden'));
    await p.close();
  }
  await b.close();
})();
