// Cloudflare Workers static assets cap each file at 25 MiB. Write www/.assetsignore listing any
// larger file so the Cloudflare deploy succeeds; Vercel (primary) still serves those files.
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
const WWW = new URL('../www/', import.meta.url).pathname;
const LIMIT = 25 * 1024 * 1024;
const big = [];
async function walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) await walk(p);
    else if ((await stat(p)).size > LIMIT) big.push('/' + relative(WWW, p).split('\\').join('/'));
  }
}
await walk(WWW);
await writeFile(join(WWW, '.assetsignore'), ['.assetsignore', ...big].join('\n') + '\n');
console.log(`[cf-assetsignore] ${big.length} file(s) over 25 MiB excluded from Cloudflare assets` + (big.length ? ': ' + big.join(', ') : ''));
