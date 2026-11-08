import crypto from 'node:crypto';
import { q, one } from './db.js';

const COOKIE = 'pc_session';
const SESSION_DAYS = 30;
export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;

function secret(name) {
  const v = process.env[name];
  if (!v || v.length < 16) throw Object.assign(new Error(name + ' missing'), { status: 500, public: 'Server is not configured' });
  return v;
}

/* ---------- input rules ---------- */
export function normPhone(raw) {
  const s = String(raw || '').replace(/[\s\-().]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null; // E.164
  if (s.startsWith('+91') && !/^\+91[6-9]\d{9}$/.test(s)) return null; // Indian mobiles: 10 digits starting 6-9
  return s;
}
const WEAK = new Set(['0000','1111','2222','3333','4444','5555','6666','7777','8888','9999','1234','4321','1212','0123','9876','1004','2000','6969']);
export function pinProblem(pin) {
  if (!/^\d{4}$/.test(String(pin || ''))) return 'PIN must be exactly 4 digits';
  if (WEAK.has(pin)) return 'That PIN is too easy to guess. Pick a less obvious one';
  return null;
}

/* ---------- hashing: HMAC pepper (env) then scrypt with per-record salt ---------- */
function scrypt(pw, salt) {
  return new Promise((res, rej) => crypto.scrypt(pw, salt, 32, { N: 16384, r: 8, p: 1 }, (e, k) => e ? rej(e) : res(k)));
}
function peppered(v) { return crypto.createHmac('sha256', secret('PIN_PEPPER')).update(String(v)).digest(); }
export async function hashSecret(v) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(peppered(v), salt);
  return 's1$' + salt.toString('base64') + '$' + key.toString('base64');
}
export async function verifySecret(v, stored) {
  const [ver, s, k] = String(stored || '').split('$');
  if (ver !== 's1' || !s || !k) return false;
  const key = await scrypt(peppered(v), Buffer.from(s, 'base64'));
  const want = Buffer.from(k, 'base64');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}
// Recovery code: 10 chars, unambiguous alphabet, shown once as XXXXX-XXXXX
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newRecoveryCode() {
  const b = crypto.randomBytes(10); let s = '';
  for (let i = 0; i < 10; i++) s += ALPH[b[i] % ALPH.length];
  return s.slice(0, 5) + '-' + s.slice(5);
}
export function normRecovery(v) { return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

/* ---------- session cookie: uid.ver.exp.sig ---------- */
function sign(payload) { return crypto.createHmac('sha256', secret('SESSION_SECRET')).update(payload).digest('base64url'); }
export function sessionCookie(user) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = `${user.id}.${user.session_ver}.${exp}`;
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export function clearCookie() { return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
function readCookie(req) {
  const h = req.headers.cookie || '';
  const m = h.split(/;\s*/).find(p => p.startsWith(COOKIE + '='));
  return m ? m.slice(COOKIE.length + 1) : null;
}
export async function currentUser(req) {
  const tok = readCookie(req); if (!tok) return null;
  const parts = tok.split('.'); if (parts.length !== 4) return null;
  const [id, ver, exp, sig] = parts;
  const expect = sign(`${id}.${ver}.${exp}`);
  const sb = Buffer.from(sig), eb = Buffer.from(expect);
  if (sb.length !== eb.length || !crypto.timingSafeEqual(sb, eb)) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  if (!/^\d+$/.test(id)) return null;
  const u = await one('SELECT id, phone, name, prefs, session_ver, created_at FROM users WHERE id=$1', [id]);
  if (!u || String(u.session_ver) !== ver) return null;
  return u;
}

/* ---------- throttle: fixed window per key ---------- */
export async function throttle(key, limit, windowSec) {
  const row = await one(
    `INSERT INTO throttle(key, count, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN throttle.window_start < now() - make_interval(secs => $2) THEN 1 ELSE throttle.count + 1 END,
       window_start = CASE WHEN throttle.window_start < now() - make_interval(secs => $2) THEN now() ELSE throttle.window_start END
     RETURNING count`, [key, windowSec]);
  return row.count <= limit;
}
export function clientIp(req) {
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || req.socket?.remoteAddress || 'unknown';
}
export async function cleanupThrottle() {
  // cheap opportunistic cleanup, ~2% of auth calls
  if (Math.random() < 0.02) await q(`DELETE FROM throttle WHERE window_start < now() - interval '1 day'`);
}
