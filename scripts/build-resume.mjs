#!/usr/bin/env node
/**
 * Render resume/anchit-tandon-resume.html to the PDF (and DOCX) the site serves.
 *
 * The resume used to be a hand-made binary with no source in the repo, which is
 * how it ended up four months stale: it still finished the career at Vahdam and
 * listed four side builds. Now the HTML is the source and this regenerates both
 * artefacts from it.
 */
import { createRequire } from 'node:module';
// _playwright.js is the one place that knows where this image keeps chromium;
// importing playwright directly here looked for a browser it has not installed.
const { chromium } = createRequire(import.meta.url)('./_playwright.js');
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'resume', 'anchit-tandon-resume.html');
const PDF = join(ROOT, 'assets', 'resume.pdf');
const PDF_ALIAS = join(ROOT, 'assets', 'anchit-tandon-freelance-resume.pdf');
const DOCX = join(ROOT, 'assets', 'anchit-tandon-freelance-resume.docx');

const b = await chromium.launch();
const page = await b.newPage();
await page.goto(pathToFileURL(SRC).href, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: PDF,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});

// Ask the PDF how many pages it has. Estimating this from scrollHeight was
// wrong by a whole page, because it cannot see break-inside:avoid or where the
// paginator actually lands.
await b.close();

await copyFile(PDF, PDF_ALIAS);

let docx = 'skipped';
try {
  // No --standalone: it emitted the page <title> as a stray first paragraph.
  // An empty title: pandoc writes the page <title> into the docx as a title
  // block otherwise, which showed up as a stray first paragraph.
  await run('pandoc', [SRC, '-f', 'html', '-o', DOCX, '-M', 'title=']);
  docx = 'written';
} catch (err) {
  docx = 'FAILED: ' + String(err.message || err).split('\n')[0];
}

async function pageCount(file) {
  try {
    const { stdout } = await run('pdfinfo', [file]);
    const m = stdout.match(/^Pages:\s*(\d+)/m);
    if (m) return Number(m[1]);
  } catch { /* fall through */ }
  const buf = await readFile(file);
  return (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length || 0;
}

const size = (p) => stat(p).then((s) => (s.size / 1024).toFixed(0) + ' KB');
const pages = await pageCount(PDF);
if (pages > 2) console.log(`[resume] WARNING: ${pages} pages. A resume should be 1-2.`);
console.log(`[resume] ${await size(PDF)}  →  assets/resume.pdf  (${pages} page${pages === 1 ? '' : 's'})`);
console.log(`[resume] ${await size(PDF_ALIAS)}  →  assets/anchit-tandon-freelance-resume.pdf`);
console.log(`[resume] docx ${docx}`);
