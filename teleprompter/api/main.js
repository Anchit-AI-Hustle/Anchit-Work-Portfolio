// Single function, routed by path (keeps the deployment to one serverless function).
// vercel.json rewrites /api/:path* -> /api/main?route=:path*
import { q, one } from './_lib/db.js';
import {
  normPhone, pinProblem, hashSecret, verifySecret, newRecoveryCode, normRecovery,
  sessionCookie, clearCookie, currentUser, throttle, clientIp, cleanupThrottle, MAX_FAILS, LOCK_MINUTES
} from './_lib/auth.js';

const LIMITS = { scripts: 500, body: 100000, title: 120, settings: 16000, bgs: 12, bgBytes: 800000, name: 60 };

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.public = msg; this.extra = extra; } }
const bad = (m, extra) => new HttpError(400, m, extra);

function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null;
  if (raw === null) {
    raw = await new Promise((resolve, reject) => {
      let s = ''; req.setEncoding('utf8');
      req.on('data', c => { s += c; if (s.length > 2_000_000) reject(new HttpError(413, 'Request too large')); });
      req.on('end', () => resolve(s)); req.on('error', reject);
    });
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw bad('Invalid JSON'); }
}
function jsonSize(o) { return Buffer.byteLength(JSON.stringify(o || {})); }
function cleanSettings(s) {
  if (s === undefined) return undefined;
  if (s === null || typeof s !== 'object' || Array.isArray(s)) throw bad('settings must be an object');
  if (jsonSize(s) > LIMITS.settings) throw bad('settings too large');
  return s;
}
function cleanTitle(t) { const v = String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.title); return v || 'Untitled script'; }
function cleanBody(b) { const v = String(b ?? ''); if (v.length > LIMITS.body) throw bad(`Script is too long (max ${LIMITS.body.toLocaleString('en-IN')} characters)`); return v; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function publicUser(u) { return { id: String(u.id), phone: u.phone, name: u.name, prefs: u.prefs || {}, createdAt: u.created_at }; }

/* ---------------- PIN attempts: claimed atomically so parallel requests cannot exceed MAX_FAILS ---------------- */
// Returns { user } when an attempt slot was claimed, { locked: minutes } when locked, or {} when no such user.
async function claimAttempt(col, val) {
  const u = await one(
    `UPDATE users SET
       failed_count = (CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 0 ELSE failed_count END) + 1,
       locked_until = CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN NULL ELSE locked_until END
     WHERE ${col} = $1
       AND (locked_until IS NULL OR locked_until <= now())
       AND (CASE WHEN locked_until IS NOT NULL AND locked_until <= now() THEN 0 ELSE failed_count END) < $2
     RETURNING *`, [val, MAX_FAILS]);
  if (u) return { user: u };
  const x = await one(`SELECT locked_until FROM users WHERE ${col} = $1`, [val]);
  if (!x) return {};
  const mins = x.locked_until ? Math.max(1, Math.ceil((new Date(x.locked_until) - Date.now()) / 60000)) : LOCK_MINUTES;
  return { locked: mins };
}
async function attemptFailed(u) {
  const r = await one(`UPDATE users SET locked_until = CASE WHEN failed_count >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
                       WHERE id=$1 RETURNING failed_count`, [u.id, MAX_FAILS, LOCK_MINUTES]);
  return Math.max(0, MAX_FAILS - (r ? r.failed_count : MAX_FAILS));
}
const lockedMsg = (m) => `Too many wrong PINs. Try again in ${m} minute${m === 1 ? '' : 's'}, or reset your PIN with your recovery code.`;
// For signed-in actions that need the PIN (change PIN, new recovery code, delete account): same lockout as login.
async function requirePin(u, pin) {
  if (!/^\d{4}$/.test(String(pin || ''))) throw bad('PIN must be 4 digits');
  const c = await claimAttempt('id', u.id);
  if (c.locked) throw new HttpError(423, lockedMsg(c.locked));
  if (!c.user) throw new HttpError(401, 'Please sign in');
  if (!(await verifySecret(pin, c.user.pin_hash))) {
    const left = await attemptFailed(c.user);
    if (left === 0) throw new HttpError(423, lockedMsg(LOCK_MINUTES));
    throw new HttpError(401, 'PIN is incorrect', { attemptsLeft: left });
  }
  await q('UPDATE users SET failed_count=0, locked_until=NULL WHERE id=$1', [u.id]);
  return c.user;
}

/* ---------------- auth ---------------- */
async function signup(req, res) {
  const b = await readBody(req);
  const ip = clientIp(req);
  if (!(await throttle('signup:' + ip, 10, 3600))) throw new HttpError(429, 'Too many sign-ups from this network. Try again in an hour.');
  const phone = normPhone(b.phone); if (!phone) throw bad('Enter a valid mobile number with country code');
  const pp = pinProblem(b.pin); if (pp) throw bad(pp);
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
  const recovery = newRecoveryCode();
  const [pinHash, recHash] = await Promise.all([hashSecret(b.pin), hashSecret(normRecovery(recovery))]);
  const u = await one(
    `INSERT INTO users(phone, name, pin_hash, recovery_hash, last_login_at) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (phone) DO NOTHING RETURNING id, phone, name, prefs, session_ver, created_at`, [phone, name, pinHash, recHash]);
  if (!u) throw new HttpError(409, 'This mobile number already has an account. Sign in instead.');
  await q(`INSERT INTO scripts(user_id, title, body) VALUES ($1,$2,$3)`, [u.id, 'Welcome to Prompter Cam', WELCOME]);
  send(res, 201, { user: publicUser(u), recoveryCode: recovery }, { 'Set-Cookie': sessionCookie(u) });
}

async function login(req, res) {
  const b = await readBody(req);
  const ip = clientIp(req);
  await cleanupThrottle();
  if (!(await throttle('login:' + ip, 30, 900))) throw new HttpError(429, 'Too many attempts from this network. Wait 15 minutes and try again.');
  const phone = normPhone(b.phone); if (!phone) throw bad('Enter a valid mobile number with country code');
  if (!/^\d{4}$/.test(String(b.pin || ''))) throw bad('PIN must be 4 digits');
  const generic = 'Mobile number or PIN is incorrect';
  const c = await claimAttempt('phone', phone);
  if (c.locked) throw new HttpError(423, lockedMsg(c.locked));
  if (!c.user) { await hashSecret('timing-equaliser'); throw new HttpError(401, generic); }
  const u = c.user;
  if (!(await verifySecret(b.pin, u.pin_hash))) {
    const left = await attemptFailed(u);
    if (left === 0) throw new HttpError(423, `Too many wrong PINs. Account locked for ${LOCK_MINUTES} minutes. You can reset your PIN with your recovery code.`);
    throw new HttpError(401, generic, { attemptsLeft: left });
  }
  const nu = await one(`UPDATE users SET failed_count=0, locked_until=NULL, last_login_at=now() WHERE id=$1
                        RETURNING id, phone, name, prefs, session_ver, created_at`, [u.id]);
  send(res, 200, { user: publicUser(nu) }, { 'Set-Cookie': sessionCookie(nu) });
}

async function resetPin(req, res) {
  const b = await readBody(req);
  const ip = clientIp(req);
  if (!(await throttle('reset:' + ip, 10, 3600))) throw new HttpError(429, 'Too many reset attempts. Try again in an hour.');
  const phone = normPhone(b.phone); if (!phone) throw bad('Enter a valid mobile number with country code');
  const pp = pinProblem(b.newPin); if (pp) throw bad(pp);
  if (!(await throttle('reset-phone:' + phone, 5, 3600))) throw new HttpError(429, 'Too many reset attempts for this number. Try again in an hour.');
  const u = await one('SELECT * FROM users WHERE phone=$1', [phone]);
  const generic = 'Mobile number or recovery code is incorrect';
  if (!u) { await hashSecret('timing-equaliser'); throw new HttpError(401, generic); }
  if (!(await verifySecret(normRecovery(b.recoveryCode), u.recovery_hash))) throw new HttpError(401, generic);
  const recovery = newRecoveryCode();
  const [pinHash, recHash] = await Promise.all([hashSecret(b.newPin), hashSecret(normRecovery(recovery))]);
  const nu = await one(
    `UPDATE users SET pin_hash=$2, recovery_hash=$3, failed_count=0, locked_until=NULL, session_ver=session_ver+1, last_login_at=now()
     WHERE id=$1 RETURNING id, phone, name, prefs, session_ver, created_at`, [u.id, pinHash, recHash]);
  send(res, 200, { user: publicUser(nu), recoveryCode: recovery }, { 'Set-Cookie': sessionCookie(nu) });
}

async function changePin(req, res, u) {
  const b = await readBody(req);
  const pp = pinProblem(b.newPin); if (pp) throw bad(pp);
  await requirePin(u, b.currentPin);
  const nu = await one(`UPDATE users SET pin_hash=$2, session_ver=session_ver+1 WHERE id=$1 RETURNING id, phone, name, prefs, session_ver, created_at`,
    [u.id, await hashSecret(b.newPin)]);
  send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(nu) });
}

async function newRecovery(req, res, u) {
  const b = await readBody(req);
  await requirePin(u, b.pin);
  const recovery = newRecoveryCode();
  await q('UPDATE users SET recovery_hash=$2 WHERE id=$1', [u.id, await hashSecret(normRecovery(recovery))]);
  send(res, 200, { recoveryCode: recovery });
}

async function deleteAccount(req, res, u) {
  const b = await readBody(req);
  await requirePin(u, b.pin);
  await q('DELETE FROM users WHERE id=$1', [u.id]);
  send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
}

/* ---------------- profile & prefs ---------------- */
async function updateMe(req, res, u) {
  const b = await readBody(req);
  const sets = [], vals = [u.id];
  if (b.name !== undefined) { vals.push(String(b.name).replace(/\s+/g, ' ').trim().slice(0, LIMITS.name)); sets.push(`name=$${vals.length}`); }
  if (b.prefs !== undefined) { vals.push(JSON.stringify(cleanSettings(b.prefs))); sets.push(`prefs=$${vals.length}::jsonb`); }
  if (!sets.length) throw bad('Nothing to update');
  const nu = await one(`UPDATE users SET ${sets.join(', ')} WHERE id=$1 RETURNING id, phone, name, prefs, session_ver, created_at`, vals);
  send(res, 200, { user: publicUser(nu) });
}

/* ---------------- scripts ---------------- */
async function listScripts(req, res, u) {
  const rows = await q(`SELECT id, title, left(body, 240) AS preview, length(body) AS chars,
      coalesce(array_length(regexp_split_to_array(trim(body), '\\s+'), 1), 0) AS words, settings, created_at, updated_at
    FROM scripts WHERE user_id=$1 ORDER BY updated_at DESC`, [u.id]);
  send(res, 200, { scripts: rows.map(r => ({ ...r, words: r.preview.trim() ? Number(r.words) : 0 })) });
}
async function createScript(req, res, u) {
  const b = await readBody(req);
  const c = await one('SELECT count(*)::int AS n FROM scripts WHERE user_id=$1', [u.id]);
  if (c.n >= LIMITS.scripts) throw bad(`You have reached ${LIMITS.scripts} scripts. Delete some to add more.`);
  const s = await one(`INSERT INTO scripts(user_id, title, body, settings) VALUES ($1,$2,$3,$4::jsonb)
                       RETURNING id, title, body, settings, created_at, updated_at`,
    [u.id, cleanTitle(b.title), cleanBody(b.body), JSON.stringify(cleanSettings(b.settings) || {})]);
  send(res, 201, { script: s });
}
async function getScript(req, res, u, id) {
  const s = await one('SELECT id, title, body, settings, created_at, updated_at FROM scripts WHERE id=$1 AND user_id=$2', [id, u.id]);
  if (!s) throw new HttpError(404, 'Script not found');
  send(res, 200, { script: s });
}
async function updateScript(req, res, u, id) {
  const b = await readBody(req);
  const sets = [], vals = [id, u.id];
  if (b.title !== undefined) { vals.push(cleanTitle(b.title)); sets.push(`title=$${vals.length}`); }
  if (b.body !== undefined) { vals.push(cleanBody(b.body)); sets.push(`body=$${vals.length}`); }
  if (b.settings !== undefined) { vals.push(JSON.stringify(cleanSettings(b.settings))); sets.push(`settings=$${vals.length}::jsonb`); }
  if (!sets.length) throw bad('Nothing to update');
  const s = await one(`UPDATE scripts SET ${sets.join(', ')}, updated_at=now() WHERE id=$1 AND user_id=$2
                       RETURNING id, title, body, settings, created_at, updated_at`, vals);
  if (!s) throw new HttpError(404, 'Script not found');
  send(res, 200, { script: s });
}
async function deleteScript(req, res, u, id) {
  const r = await q('DELETE FROM scripts WHERE id=$1 AND user_id=$2 RETURNING id', [id, u.id]);
  if (!r.length) throw new HttpError(404, 'Script not found');
  send(res, 200, { ok: true });
}

/* ---------------- custom backgrounds ---------------- */
async function listBgs(req, res, u) {
  const rows = await q('SELECT id, name, mime, bytes, created_at FROM backgrounds WHERE user_id=$1 ORDER BY created_at DESC', [u.id]);
  send(res, 200, { backgrounds: rows });
}
async function addBg(req, res, u) {
  const b = await readBody(req);
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
  if (!m) throw bad('Upload a JPG, PNG or WebP image');
  const bytes = Math.floor(m[2].length * 3 / 4);
  if (bytes > LIMITS.bgBytes) throw bad('Image is too large after compression (max 800 KB)');
  const c = await one('SELECT count(*)::int AS n FROM backgrounds WHERE user_id=$1', [u.id]);
  if (c.n >= LIMITS.bgs) throw bad(`You can keep up to ${LIMITS.bgs} backgrounds. Delete one first.`);
  const name = String(b.name || 'Background').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Background';
  const row = await one(`INSERT INTO backgrounds(user_id, name, mime, data_b64, bytes) VALUES ($1,$2,$3,$4,$5)
                         RETURNING id, name, mime, bytes, created_at`, [u.id, name, m[1], m[2], bytes]);
  send(res, 201, { background: row });
}
async function getBg(req, res, u, id) {
  const r = await one('SELECT mime, data_b64 FROM backgrounds WHERE id=$1 AND user_id=$2', [id, u.id]);
  if (!r) throw new HttpError(404, 'Background not found');
  res.statusCode = 200;
  res.setHeader('Content-Type', r.mime);
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.end(Buffer.from(r.data_b64, 'base64'));
}
async function deleteBg(req, res, u, id) {
  const r = await q('DELETE FROM backgrounds WHERE id=$1 AND user_id=$2 RETURNING id', [id, u.id]);
  if (!r.length) throw new HttpError(404, 'Background not found');
  send(res, 200, { ok: true });
}

/* ---------------- router ---------------- */
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    let route = url.searchParams.get('route');
    if (route === null) route = url.pathname.replace(/^\/api\/?/, '');
    route = route.replace(/^\/+|\/+$/g, '');
    const parts = route.split('/').filter(Boolean);
    const m = req.method;

    // CSRF defence for cookie-authenticated writes: require our header (cross-site forms cannot set it)
    if (m !== 'GET' && m !== 'HEAD' && req.headers['x-pc'] !== '1') throw new HttpError(403, 'Missing client header');

    if (parts[0] === 'health') return send(res, 200, { ok: true, db: !!(await one('SELECT 1 AS ok')) });

    if (parts[0] === 'auth') {
      if (m === 'POST' && parts[1] === 'signup') return await signup(req, res);
      if (m === 'POST' && parts[1] === 'login') return await login(req, res);
      if (m === 'POST' && parts[1] === 'reset') return await resetPin(req, res);
      if (m === 'POST' && parts[1] === 'logout') return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
    }

    const u = await currentUser(req);
    if (parts[0] === 'me' && m === 'GET' && parts.length === 1) {
      if (!u) return send(res, 200, { user: null });
      return send(res, 200, { user: publicUser(u) });
    }
    if (!u) throw new HttpError(401, 'Please sign in');

    if (parts[0] === 'me') {
      if (parts.length === 1 && m === 'PATCH') return await updateMe(req, res, u);
      if (parts.length === 1 && m === 'DELETE') return await deleteAccount(req, res, u);
      if (parts[1] === 'pin' && m === 'POST') return await changePin(req, res, u);
      if (parts[1] === 'recovery' && m === 'POST') return await newRecovery(req, res, u);
    }
    if (parts[0] === 'scripts') {
      if (parts.length === 1 && m === 'GET') return await listScripts(req, res, u);
      if (parts.length === 1 && m === 'POST') return await createScript(req, res, u);
      if (parts.length === 2) {
        if (!UUID.test(parts[1])) throw new HttpError(404, 'Script not found');
        if (m === 'GET') return await getScript(req, res, u, parts[1]);
        if (m === 'PATCH') return await updateScript(req, res, u, parts[1]);
        if (m === 'DELETE') return await deleteScript(req, res, u, parts[1]);
      }
    }
    if (parts[0] === 'backgrounds') {
      if (parts.length === 1 && m === 'GET') return await listBgs(req, res, u);
      if (parts.length === 1 && m === 'POST') return await addBg(req, res, u);
      if (parts.length === 2) {
        if (!UUID.test(parts[1])) throw new HttpError(404, 'Background not found');
        if (m === 'GET') return await getBg(req, res, u, parts[1]);
        if (m === 'DELETE') return await deleteBg(req, res, u, parts[1]);
      }
    }
    throw new HttpError(404, 'Not found');
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[api]', req.method, req.url, e && e.stack || e);
    send(res, status, { error: e.public || 'Something went wrong. Please try again.', ...(e.extra || {}) });
  }
}

const WELCOME = `# How this works
Welcome! This is your first script. Edit it, or create a new one from your library.

Press Space (or tap the text) to start and pause scrolling. The gold line is your reading line: keep your eyes on it and the camera lens.

# Make it yours
Open Settings to change the speed, text size, font, colours, margins and where the reading line sits. Every script remembers its own settings, so a fast 30 second reel and a slow 5 minute explainer can each feel right.

# Look the part
Turn on your camera and pick a background: blur, a colour, a studio backdrop, or upload your own image. Then press Record. A short countdown runs, the text starts scrolling, and your take is ready to download when you stop.

Lines that start with a hash sign become gold section cues, and text wrapped in double stars is shown **in bold** so you know where to lean in.`;
