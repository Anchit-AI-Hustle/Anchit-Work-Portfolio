// Layout guard for the ET and Times Health studies and their working models.
//
// Fails when anything escapes its box: content wider than its container, an
// element sticking out of the card that holds it, anything past the viewport,
// two absolutely placed labels on top of each other, or a heading whose last
// line is a single stranded word. Run against the built tree:
//   npm run build && npx serve -l 8099 www &  node scripts/times-layout.js
// W=390,1000 narrows the widths, ONLY=/ideas narrows the pages, BASE= points
// it at another host, MUT=spill proves the guard can fail.
const { chromium } = require('./_playwright.js');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const SHOT = process.env.SHOT; // dir to write screenshots
const W = (process.env.W || '390,820,1440').split(',').map(Number);
const pages = [];
for (const [b, m] of [['/ET_Study', ['', '/hub', '/rules', '/maths']], ['/TimesHealth_Study', ['', '/week', '/race', '/business']]]) {
  for (const p of ['', '/users', '/problems', '/gaps', '/ideas', '/fixes', '/plan', '/evidence', '/about']) pages.push(b + p);
  for (const p of m) pages.push(b + '/model' + p);
}
(async () => {
  const br = await chromium.launch(); let total = 0;
  for (const w of W) {
    const ctx = await br.newContext({ viewport: { width: w, height: 900 } });
    const pg = await ctx.newPage();
    for (const u of (process.env.ONLY ? pages.filter(p => p.includes(process.env.ONLY)) : pages)) {
      await pg.goto(BASE + u, { waitUntil: 'load' });
      // The bug that shipped: a stale stylesheet without the thumbnail rules, so
      // source screenshots render at full size and burst out of the problem card.
      if (process.env.MUT === 'spill' && u === '/ET_Study/problems') await pg.addStyleTag({ content: 'img{max-width:none!important}.thumbs a,.thumbs img{width:auto!important}.grid>*{min-width:auto!important}' });
      await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 15)); } window.scrollTo(0, 0); });
      await pg.waitForTimeout(250);
      // Worst case for the nav: the web font never arrives and the browser falls
      // back to a wide system font. CI runners use DejaVu Sans; so do many Linux
      // desktops. The links must still fit without scrolling.
      if (w >= 1080 && !u.includes('/model')) {
        const style = await pg.addStyleTag({ content: ".nav,.nav *{font-family:'DejaVu Sans',Verdana,sans-serif!important}" });
        const over = await pg.evaluate(() => { const l = document.getElementById('links'); return l ? l.scrollWidth - l.clientWidth : 0; });
        await style.evaluate((n) => n.remove());
        if (over > 0) { total++; console.log(`\n[${w}] ${u}\n   nav overflows by ${over}px with a fallback font`); }
      }
      const issues = await pg.evaluate(() => {
        const out = []; const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
        const path = (e) => { const a = []; for (let x = e; x && x !== document.body && a.length < 4; x = x.parentElement) a.unshift(name(x)); return a.join(' > '); };
        const boxed = (e) => { const s = getComputedStyle(e); return (parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0 || s.backgroundColor !== 'rgba(0, 0, 0, 0)') && e.getBoundingClientRect().width > 40; };
        const vw = document.documentElement.clientWidth;
        for (const e of document.querySelectorAll('body *')) {
          const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') continue;
          const r = e.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue;
          if (e.closest('.ice-map .ax')) continue;
          if (e.closest('.links,.tbl,.tbl-wrap,[data-scroll],.sr-only,.visually-hidden')) continue;
          // 1. content wider than its own box (not a scroller)
          if (!/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && !['html', 'body'].includes(e.tagName.toLowerCase()) && s.display !== 'inline')
            out.push(`spill ${e.scrollWidth - e.clientWidth}px: ${path(e)}`);
          // 2. escapes nearest boxed ancestor
          let a = e.parentElement; while (a && a !== document.body && !boxed(a)) a = a.parentElement;
          if (a && a !== document.body && !a.closest('.links')) { const q = a.getBoundingClientRect(); const d = Math.max(q.left - r.left, r.right - q.right); if (d > 1 && !e.closest('[data-scroll]')) out.push(`escapes ${Math.round(d)}px: ${path(e)} out of ${name(a)}`); }
          if (r.right > vw + 1) out.push(`past viewport ${Math.round(r.right - vw)}px: ${path(e)}`);
        }
        // 3. orphan last word in headings
        for (const h of document.querySelectorAll('h1,h2,h3')) { const rg = document.createRange(); rg.selectNodeContents(h); const rs = [...rg.getClientRects()]; if (rs.length < 2) continue; const lines = []; rs.map(x => x.bottom).sort((p, q) => p - q).forEach(b => { if (!lines.length || b - lines[lines.length - 1] > 12) lines.push(b); }); if (lines.length < 2) continue; const last = rs.filter(x => x.bottom > lines[lines.length - 1] - 12); const lw = last.reduce((t, x) => t + x.width, 0); if (lw < h.getBoundingClientRect().width * 0.18) out.push(`orphan word: ${path(h)} "${h.textContent.trim().slice(-20)}"`); }
        // 4. absolutely placed labels must not collide with each other
        const abs = [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'absolute' && e.textContent.trim() && e.getBoundingClientRect().width > 0 && !e.children.length);
        for (let i = 0; i < abs.length; i++) for (let j = i + 1; j < abs.length; j++) { const p = abs[i].getBoundingClientRect(), q = abs[j].getBoundingClientRect(); const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left), oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top); if (ox > 1 && oy > 1) out.push(`overlap: "${abs[i].textContent.trim().slice(0, 16)}" with "${abs[j].textContent.trim().slice(0, 16)}"`); }
        return [...new Set(out)];
      });
      // keep only the outermost report per element chain
      const uniq = issues.filter((x, i) => !issues.some((y, j) => j !== i && y.startsWith(x.split(':')[0]) && x.length > y.length && x.includes(y.split(': ')[1])));
      if (uniq.length) { total += uniq.length; console.log(`\n[${w}] ${u}  (${uniq.length})`); uniq.slice(0, 12).forEach(x => console.log('   ' + x)); }
      if (SHOT) await pg.screenshot({ path: `${SHOT}/${w}${u.replace(/\//g, '_')}.png`, fullPage: true });
    }
    await ctx.close();
  }
  console.log(`\n${total ? 'FAIL' : 'PASS'}: ${total} layout issues${process.env.MUT ? '  [MUT=' + process.env.MUT + ']' : ''}`); await br.close(); process.exit(total ? 1 : 0);
})();
