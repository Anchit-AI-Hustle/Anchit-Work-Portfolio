#!/usr/bin/env node
/**
 * seo-inject — apply the SEO/AEO manifest (seo.config.json) into each hosted
 * page's <head>, and emit robots.txt / sitemap.xml / llms.txt.
 *
 * Idempotent: everything this script manages lives between the markers
 *   <!-- seo:auto:start --> … <!-- seo:auto:end -->
 * so re-running replaces the block cleanly. All edits are confined to the
 * <head> slice of each file, so page <body>/<script> content is never touched.
 *
 * Usage: node scripts/seo-inject.mjs [path/to/seo.config.json]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG = process.argv[2] || join(ROOT, 'seo.config.json');

const START = '<!-- seo:auto:start -->';
const END = '<!-- seo:auto:end -->';

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// JSON-LD is embedded verbatim; only guard against a literal </script> break.
const jsonForScript = (obj) => JSON.stringify(obj, null, 2).replace(/<\/(script)/gi, '<\\/$1');

function buildBlock(page, domain) {
  const L = [START, '<!-- Managed by scripts/seo-inject.mjs — edit seo.config.json, not here. -->'];
  if (page.description) L.push(`<meta name="description" content="${esc(page.description)}" />`);
  if (page.canonical) L.push(`<link rel="canonical" href="${esc(page.canonical)}" />`);
  L.push(`<meta name="robots" content="${esc(page.robots || 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1')}" />`);
  if (Array.isArray(page.keywords) && page.keywords.length) L.push(`<meta name="keywords" content="${esc(page.keywords.join(', '))}" />`);
  L.push('<meta name="author" content="Anchit Tandon" />');

  const og = Object.assign(
    { title: page.title, description: page.description, type: 'website', url: page.canonical,
      image: `${domain}/AnchitTandon-AppLogo.png`, site_name: 'Anchit Tandon', locale: 'en_US' },
    page.og || {});
  for (const [k, v] of Object.entries(og)) if (v) L.push(`<meta property="og:${k}" content="${esc(v)}" />`);

  const tw = Object.assign(
    { card: 'summary_large_image', title: page.title, description: page.description,
      image: og.image },
    page.twitter || {});
  for (const [k, v] of Object.entries(tw)) if (v) L.push(`<meta name="twitter:${k}" content="${esc(v)}" />`);

  // JSON-LD (plus a FAQPage synthesized from faq[] if the page didn't already include one)
  const jsonld = Array.isArray(page.jsonld) ? [...page.jsonld] : [];
  const hasFaq = jsonld.some((o) => o && (o['@type'] === 'FAQPage' || (Array.isArray(o['@type']) && o['@type'].includes('FAQPage'))));
  if (!hasFaq && Array.isArray(page.faq) && page.faq.length) {
    jsonld.push({
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: page.faq.map((f) => ({
        '@type': 'Question', name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }
  for (const obj of jsonld) {
    if (!obj || typeof obj !== 'object') continue;
    if (!obj['@context']) obj['@context'] = 'https://schema.org';
    L.push(`<script type="application/ld+json">\n${jsonForScript(obj)}\n</script>`);
  }
  L.push(END);
  return L.join('\n');
}

// Remove the tags we now manage, but ONLY within the head slice.
function stripManaged(head) {
  return head
    .replace(new RegExp(`${START}[\\s\\S]*?${END}\\n?`, 'g'), '')
    .replace(/[\t ]*<meta\s+name=["'](?:description|keywords|robots|author)["'][^>]*>\s*\n?/gi, '')
    .replace(/[\t ]*<link\s+rel=["']canonical["'][^>]*>\s*\n?/gi, '')
    .replace(/[\t ]*<meta\s+property=["']og:[^"']*["'][^>]*>\s*\n?/gi, '')
    .replace(/[\t ]*<meta\s+name=["']twitter:[^"']*["'][^>]*>\s*\n?/gi, '');
}

async function applyPage(page, domain) {
  const abs = join(ROOT, page.file);
  if (!existsSync(abs)) { console.warn(`[seo] skip (missing): ${page.file}`); return false; }
  let html = await readFile(abs, 'utf8');
  const hs = html.search(/<head[\s>]/i);
  const he = html.search(/<\/head>/i);
  if (hs < 0 || he < 0 || he < hs) { console.warn(`[seo] skip (no <head>): ${page.file}`); return false; }

  const headOpenEnd = html.indexOf('>', hs) + 1;
  let head = html.slice(headOpenEnd, he);

  // 1) title
  if (page.title) {
    if (/<title>[\s\S]*?<\/title>/i.test(head)) {
      head = head.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(page.title)}</title>`);
    } else {
      head = `\n<title>${esc(page.title)}</title>` + head;
    }
  }
  // 2) strip previously-managed tags, then append fresh block
  head = stripManaged(head).replace(/\s+$/,'') + '\n' + buildBlock(page, domain) + '\n';

  const out = html.slice(0, headOpenEnd) + head + html.slice(he);
  if (out !== html) { await writeFile(abs, out, 'utf8'); console.log(`[seo] injected: ${page.file}`); }
  return true;
}

async function main() {
  if (!existsSync(CONFIG)) { console.error(`[seo] config not found: ${CONFIG}`); process.exit(1); }
  const cfg = JSON.parse(await readFile(CONFIG, 'utf8'));
  const domain = (cfg.domain || 'https://anchit-tandon.com').replace(/\/$/, '');
  let n = 0;
  for (const page of cfg.pages || []) if (await applyPage(page, domain)) n++;

  if (cfg.robotsTxt) { await writeFile(join(ROOT, 'robots.txt'), cfg.robotsTxt.trimEnd() + '\n'); console.log('[seo] wrote robots.txt'); }
  if (cfg.sitemapXml) { await writeFile(join(ROOT, 'sitemap.xml'), cfg.sitemapXml.trimEnd() + '\n'); console.log('[seo] wrote sitemap.xml'); }
  if (cfg.llmsTxt) { await writeFile(join(ROOT, 'llms.txt'), cfg.llmsTxt.trimEnd() + '\n'); console.log('[seo] wrote llms.txt'); }
  console.log(`[seo] done — ${n} pages injected`);
}
main().catch((e) => { console.error(e); process.exit(1); });
