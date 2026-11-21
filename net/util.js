// Small helpers shared by the router and the Durable Objects.

// Pages this server answers: the site itself, its Cloudflare hosts (production
// and per-branch previews) and a local test server. Anything else is refused,
// so another website cannot open rooms or post scores through a visitor.
const ORIGIN_OK = [
  /^https:\/\/(www\.)?anchit-tandon\.com$/,
  /^https:\/\/([a-z0-9-]+-)?anchit-work-portfolio\.anchit-tandon\.workers\.dev$/,
  /^https:\/\/anchit-work-portfolio-anchit-ai-hustle\.vercel\.app$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/,
];
export function originAllowed(origin) {
  return typeof origin === 'string' && ORIGIN_OK.some((re) => re.test(origin));
}

export function cors(request) {
  const o = request.headers.get('Origin');
  const h = { 'Vary': 'Origin' };
  if (originAllowed(o)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

export function json(data, status, extra) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, extra || {}),
  });
}

export function fail(code, status, extra) {
  return json({ ok: false, error: code }, status || 400, extra);
}

// An anonymous id made by the browser: 16 to 40 url-safe characters. It is a
// secret the client keeps; the server never sends it to anyone else.
export const validId = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{16,40}$/.test(s);
export const validMode = (s) => typeof s === 'string' && /^[a-z0-9-]{1,16}$/.test(s);
export const validRoomId = (s) => typeof s === 'string' && /^[a-z0-9]{8,24}$/.test(s);
export const validCode = (s) => typeof s === 'string' && /^[A-HJ-NP-Z2-9]{5}$/.test(s);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode() {
  const b = new Uint8Array(5); crypto.getRandomValues(b);
  let s = ''; for (const x of b) s += CODE_CHARS[x % CODE_CHARS.length];
  return s;
}
export function randomRoomId() {
  const b = new Uint8Array(10); crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 16);
}
export function randomToken() {
  const b = new Uint8Array(18); crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Nicknames: letters, digits, spaces, dot, underscore and hyphen; 2 to 16
// characters; no slurs or crude words. The word list is stored ROT13 so the
// source does not print it. The browser runs the same check (net.js) first.
const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
const SUB = ('shpx fuvg ovgpu phag chffl jnaxre juber snttbg avttre avttn ergneq cbea encvfg uvgyre ' +
  'puhgvln puhgvlr ynhqn yniqn ourapubq orurapubq znqnepubq ofqx tnnaq unenzv xnzvan cravf intvan obbof').split(' ').map(rot13);
const WORD = new Set('qvpx pbpx nff nefr frk gvgf fyhg gjng encr anmv yhaq enaqv snt'.split(' ').map(rot13));
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };
export function nickBlocked(s) {
  const low = s.toLowerCase().replace(/[0-9@$!]/g, (c) => LEET[c] || c);
  const flat = low.replace(/[^a-z]/g, '');
  if (SUB.some((w) => flat.includes(w))) return true;
  return low.split(/[^a-z]+/).some((t) => WORD.has(t));
}
export function cleanNick(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 16) return null;
  if (!/^[A-Za-z0-9 ._-]+$/.test(s)) return null;
  if (nickBlocked(s)) return null;
  return s;
}
export function defaultNick(id) {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 'Player ' + String(1000 + (h % 9000));
}

export async function readBody(request, max) {
  const t = await request.text();
  if (t.length > (max || 4096)) return null;
  try { const v = JSON.parse(t); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || 'local';
}

// A fixed window counter kept in memory only. It is lost when the object
// sleeps, which is fine: it only has to slow a burst down.
export class Meter {
  constructor() { this.m = new Map(); }
  hit(key, limit, windowMs) {
    const now = Date.now();
    let e = this.m.get(key);
    if (!e || now - e.t >= windowMs) { e = { t: now, n: 0 }; this.m.set(key, e); }
    e.n++;
    if (this.m.size > 5000) for (const [k, v] of this.m) if (now - v.t >= windowMs) this.m.delete(k);
    return e.n <= limit;
  }
}
