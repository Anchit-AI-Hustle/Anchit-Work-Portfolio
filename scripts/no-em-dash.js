// No em dashes anywhere a visitor can read.
//
// The owner asked for none on the site. They had crept into ~2,600 places:
// copy, titles, meta descriptions, chatbot answers, generated plans and the
// comments in served JS and CSS. This reads the BUILT tree, because that is
// what Vercel serves, and fails on the first one. Model output is cleaned at
// request time by api/_nodash.js and is checked by its own case below.
//
//   MUT=1 puts one back into a page in memory, to prove the guard fires.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
if (!fs.existsSync(WWW)) { console.error('www/ not found, run npm run build first'); process.exit(1); }

const DASH = /—|&mdash;|&#8212;|&#x2014;|\\u2014/i;
const walk = (d, o = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'vendor') walk(p, o); }
    else if (/\.(html|js|mjs|css|json|txt|xml|webmanifest)$/.test(e.name) && !/\.min\./.test(e.name)) o.push(p);
  }
  return o;
};

let pass = 0, fail = 0;
const check = (label, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`); };

const hits = [];
for (const f of walk(WWW)) {
  let s = fs.readFileSync(f, 'utf8');
  if (process.env.MUT === '1' && f.endsWith(path.sep + 'index.html') && path.dirname(f) === WWW) s += '—';
  const lines = s.split('\n');
  lines.forEach((l, i) => { if (DASH.test(l)) hits.push(path.relative(WWW, f) + ':' + (i + 1) + '  ' + l.trim().slice(0, 90)); });
}
check('no em dash in any served file', hits.length === 0, hits.length ? hits.length + ' found' : 'www/ is clean');
hits.slice(0, 15).forEach((h) => console.log('        ' + h));

const { noDash } = require('../api/_nodash.js');
const out = noDash({ reply: 'Hey — glad you asked. Done. — Next', list: ['2022 — 2026', '— Anchit'] });
check('model replies leave the API without one', !DASH.test(JSON.stringify(out)), JSON.stringify(out));

console.log(`\n  ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
