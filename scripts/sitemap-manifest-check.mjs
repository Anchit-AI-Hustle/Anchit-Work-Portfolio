#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(join(root, 'seo.config.json'), 'utf8'));
const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');

const extractUrls = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expected = [
  ...extractUrls(config.sitemapXml || ''),
  ...(config.sitemapExtraUrls || []).map((entry) => entry.loc),
];
const actual = extractUrls(sitemap);

const duplicateUrls = (urls) => [...new Set(urls.filter((url, index) => urls.indexOf(url) !== index))];
const missing = expected.filter((url) => !actual.includes(url));
const unexpected = actual.filter((url) => !expected.includes(url));
const duplicates = duplicateUrls(actual);

if (missing.length || unexpected.length || duplicates.length) {
  console.error('Committed sitemap.xml is out of sync with seo.config.json.');
  if (missing.length) console.error(`Missing: ${missing.join(', ')}`);
  if (unexpected.length) console.error(`Unexpected: ${unexpected.join(', ')}`);
  if (duplicates.length) console.error(`Duplicates: ${duplicates.join(', ')}`);
  process.exit(1);
}

console.log(`Sitemap manifest OK: ${actual.length} unique URLs`);
