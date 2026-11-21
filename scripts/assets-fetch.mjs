// Download every pack in scripts/assets-sources.mjs into a local cache, so
// scripts/assets-build.mjs can rebuild games/assets/ from the original files.
//
//   node scripts/assets-fetch.mjs            # everything missing
//   node scripts/assets-fetch.mjs q-nature   # one pack
//
// Cache: $ASSETS_CACHE, default node_modules/.cache/game-assets (ignored by git).
// Each pack lands extracted in <cache>/<pack key>/. A pack already there is
// skipped; delete its folder to fetch it again.
//
// Sources, and how each is reached:
// - itch.io free downloads (Quaternius megakits): the same three requests the
//   itch download button makes (download_url, the download page, file/<id>).
// - OpenGameArt: plain file links on the pack page, uploaded by the author.
// - Poly Haven: api.polyhaven.com/files/<id>; their API asks clients to send
//   a User-Agent naming the client, which we do (no personal details).
// - ambientCG: ambientcg.com/get?file=<id>_1K-JPG.zip.
// Downloaded archives are data: they are only unzipped, never executed.
import { mkdir, writeFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PACKS } from './assets-sources.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
export const CACHE = process.env.ASSETS_CACHE || join(ROOT, 'node_modules/.cache/game-assets');
const UA = { 'User-Agent': 'game-asset-pipeline/1.0' };

async function get(url, opts = {}) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { ...UA, ...(opts.headers || {}) }, method: opts.method || 'GET', body: opts.body, redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return r;
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
    }
  }
}
const save = async (url, file, opts) => {
  await mkdir(dirname(file), { recursive: true });
  const r = await get(url, opts);
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
};
const unzip = (zip, dir) => execFileSync('unzip', ['-oq', zip, '-d', dir], { stdio: 'inherit' });

// itch.io: a free / name-your-price download without an account.
async function itch({ user, game, pick }, dir) {
  const jar = new Map();
  const keep = (r) => { for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); } return r; };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
  const csrfOf = (html) => /name="csrf_token" value="([^"]+)"/.exec(html)?.[1];
  const base = `https://${user}.itch.io/${game}`;
  const page = await keep(await get(base)).text();
  let csrf = csrfOf(page);
  const form = (t) => new URLSearchParams({ csrf_token: t }).toString();
  const hdr = () => ({ cookie: cookie(), 'content-type': 'application/x-www-form-urlencoded' });
  const dl = await keep(await get(`${base}/download_url`, { method: 'POST', body: form(csrf), headers: hdr() })).json();
  const dpage = await keep(await get(dl.url, { headers: { cookie: cookie() } })).text();
  csrf = csrfOf(dpage) || csrf;
  const ids = [...dpage.matchAll(/data-upload_id="(\d+)"/g)].map((m) => m[1]);
  const names = [...dpage.matchAll(/<strong title="([^"]+)" class="name">/g)].map((m) => m[1]);
  const i = names.findIndex((n) => n.includes(pick));
  if (i < 0) throw new Error(`itch ${game}: no upload matching "${pick}" (have ${names.join(', ')})`);
  const f = await keep(await get(`${base}/file/${ids[i]}?source=game_download&after_download_lightbox=1&as_props=1`, { method: 'POST', body: form(csrf), headers: hdr() })).json();
  const zip = join(dir, '_pack.zip');
  await save(f.url, zip);
  unzip(zip, dir);
  await rm(zip);
}

async function polyhavenModels(ids, dir) {
  for (const id of ids) {
    const d = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
    const g = d.gltf['1k'].gltf;
    await save(g.url, join(dir, id, g.url.split('/').pop()));
    for (const [rel, inc] of Object.entries(g.include)) await save(inc.url, join(dir, id, rel));
  }
}
async function polyhavenHdri(ids, dir) {
  for (const id of ids) {
    const d = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
    await save(d.hdri['1k'].hdr.url, join(dir, `${id}_1k.hdr`));
  }
}
async function ambientcg(ids, dir) {
  for (const id of ids) {
    const zip = join(dir, `${id}.zip`);
    await save(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, zip);
    await mkdir(join(dir, id), { recursive: true });
    unzip(zip, join(dir, id));
    await rm(zip);
  }
}

export async function fetchPack(p) {
  const dir = join(CACHE, p.key);
  if (existsSync(dir) && (await readdir(dir)).length) return false;
  await mkdir(dir, { recursive: true });
  const d = p.download;
  try {
    if (d.kind === 'itch') await itch(d, dir);
    else if (d.kind === 'url') {
      const urls = [].concat(d.url);
      for (let i = 0; i < urls.length; i++) {
        const zip = join(dir, `_pack${i}.zip`);
        await save(urls[i], zip);
        const into = d.into ? join(dir, d.into[i]) : dir;
        await mkdir(into, { recursive: true });
        unzip(zip, into);
        await rm(zip);
      }
    } else if (d.kind === 'polyhaven-models') await polyhavenModels(d.ids, dir);
    else if (d.kind === 'polyhaven-hdri') await polyhavenHdri(d.ids, dir);
    else if (d.kind === 'ambientcg') await ambientcg(d.ids, dir);
    else throw new Error('unknown download kind ' + d.kind);
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  for (const p of PACKS) {
    if (only.length && !only.includes(p.key)) continue;
    const got = await fetchPack(p);
    const s = await stat(join(CACHE, p.key));
    console.log(`[assets-fetch] ${p.key}: ${got ? 'downloaded' : 'cached'}${s.isDirectory() ? '' : ' (?)'}`);
  }
}
