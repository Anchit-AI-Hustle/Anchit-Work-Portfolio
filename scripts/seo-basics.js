// SEO basics on every page that ships.
//
// A portfolio review asked for five things on EVERY page: a title, a 60-160
// character meta description, an og:image, a canonical and a favicon. Fifteen
// of the forty pages in www/ were outside seo.config.json, so nothing kept
// them honest: auth-demo and cyber had no description at all, ayushi's was the
// two words "Ayushi Rawat", growth-school and hotel had no canonical, and every
// share image was a 1.5MB square app icon.
//
// This reads the BUILT tree, because that is what Vercel serves. It needs no
// server and no browser: run it after `npm run build`.
//
//   MUT=desc   blanks one page's description in memory, to prove the guard fires.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const DOMAIN = 'https://anchit-tandon.com';

if (!fs.existsSync(WWW)) { console.error('www/ not found — run npm run build first'); process.exit(1); }

const walk = (d, o = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, o); }
    else if (e.name.endsWith('.html')) o.push(p);
  }
  return o;
};
const decode = (s) => String(s || '')
  .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// A local URL must point at a file that is actually in www/.
const localFile = (url, page) => {
  if (/^data:/.test(url)) return true;
  let p = url.startsWith(DOMAIN) ? url.slice(DOMAIN.length) : url;
  if (/^https?:/.test(p)) return null;                         // third-party host: not ours to check
  p = p.split(/[?#]/)[0];
  const abs = p.startsWith('/') ? path.join(WWW, p) : path.join(path.dirname(page), p);
  return fs.existsSync(abs);
};

const files = walk(WWW).filter((f) => !/[\\/]how-to[\\/]assets[\\/]/.test(f));
const problems = [];
for (const file of files) {
  const rel = path.relative(WWW, file);
  const src = fs.readFileSync(file, 'utf8');
  let head = (src.match(/<head[\s>][\s\S]*?<\/head>/i) || [''])[0];
  if (process.env.MUT === 'desc' && rel === 'freelancer.html') head = head.replace(/<meta name="description"[^>]*>/, '');
  const all = (re) => [...head.matchAll(re)].map((m) => m[1]);
  const bad = (what) => problems.push(rel + ': ' + what);

  const title = decode((head.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]).trim();
  if (!title) bad('no <title>');

  const descs = all(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/gi);
  if (descs.length !== 1) bad(descs.length + ' meta descriptions');
  else {
    const n = [...decode(descs[0])].length;
    if (n < 60 || n > 160) bad('description is ' + n + ' characters (60-160)');
  }

  const canon = all(/<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/gi);
  if (canon.length !== 1) bad(canon.length + ' canonical tags');
  else if (!canon[0].startsWith(DOMAIN + '/')) bad('canonical is not absolute on ' + DOMAIN + ': ' + canon[0]);

  const og = all(/<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/gi);
  if (og.length !== 1) bad(og.length + ' og:image tags');
  else if (!/^https:\/\//.test(og[0])) bad('og:image is not an absolute https URL: ' + og[0]);
  else if (localFile(og[0], file) === false) bad('og:image file missing from www/: ' + og[0]);

  const icon = (head.match(/<link[^>]+rel=["'][^"']*\bicon\b[^"']*["'][^>]*>/i) || [])[0];
  if (!icon) bad('no favicon');
  else {
    const href = (icon.match(/href=["']([^"']+)["']/) || [])[1] || '';
    if (localFile(href, file) === false) bad('favicon missing from www/: ' + href);
  }
}

// /marketing-101 had fifteen H1s. One page, one H1, chapters below it.
{
  const m = fs.readFileSync(path.join(WWW, 'marketing-101.html'), 'utf8');
  const h1 = (m.match(/<h1[\s>]/gi) || []).length;
  if (h1 !== 1) problems.push('marketing-101.html: ' + h1 + ' <h1> elements (want exactly 1)');
}

const ok = problems.length === 0;
console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  title, 60-160 char description, og:image, canonical, favicon on every page   '
  + (ok ? files.length + ' pages' : ''));
for (const p of problems.slice(0, 25)) console.log('        ' + p);
if (problems.length > 25) console.log('        … and ' + (problems.length - 25) + ' more');
process.exit(ok ? 0 : 1);
