// /api/jobhunt — a gated live job-search agent, powered by free public job APIs.
//
//   GET  /api/jobhunt  → { supabaseUrl, supabaseAnonKey, gated, engineReady }
//   POST /api/jobhunt  → aggregates real openings from free, keyless job boards
//
// Access is gated behind Google sign-in (via Supabase): every POST must carry a
// valid Supabase session token. The search itself pulls live openings from free,
// no-key public job APIs (Remotive, RemoteOK, Arbeitnow, The Muse) — so it's
// genuinely free, has no API-key or per-minute rate-limit to hit, and always
// returns real results with direct apply links.
//
// Env:
//   SUPABASE_URL        public project URL
//   SUPABASE_ANON_KEY   public anon key (safe in browser)

const ALL_BOARDS = ['Remotive', 'RemoteOK', 'Arbeitnow', 'The Muse'];
const UA = 'Mozilla/5.0 (compatible; JobHunt/1.0; +https://anchit-tandon.com/jobhunt)';

async function fetchJSON(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function clean(j) {
  return {
    title: String(j.title || '').slice(0, 200).trim(),
    company: String(j.company || '').slice(0, 160).trim(),
    location: String(j.location || '').slice(0, 160).trim(),
    link: String(j.link || '').slice(0, 600).trim(),
    source: String(j.source || '').slice(0, 40),
  };
}

// --- Per-source fetchers: each returns normalized jobs, or [] on any failure ---
async function fromRemotive(role) {
  const d = await fetchJSON('https://remotive.com/api/remote-jobs?search=' + encodeURIComponent(role) + '&limit=40');
  const jobs = (d && d.jobs) || [];
  return jobs.map((x) => clean({ title: x.title, company: x.company_name, location: x.candidate_required_location, link: x.url, source: 'Remotive' }));
}
async function fromRemoteOK() {
  const d = await fetchJSON('https://remoteok.com/api');
  const arr = Array.isArray(d) ? d.filter((x) => x && x.position && x.url) : [];
  return arr.map((x) => clean({ title: x.position, company: x.company, location: x.location || 'Remote', link: x.url, source: 'RemoteOK' }));
}
async function fromArbeitnow() {
  const d = await fetchJSON('https://www.arbeitnow.com/api/job-board-api');
  const arr = (d && d.data) || [];
  return arr.map((x) => clean({ title: x.title, company: x.company_name, location: x.location || (x.remote ? 'Remote' : ''), link: x.url, source: 'Arbeitnow' }));
}
async function fromMuse(role) {
  const d = await fetchJSON('https://www.themuse.com/api/public/jobs?page=1');
  const arr = (d && d.results) || [];
  return arr.map((x) => clean({
    title: x.name,
    company: (x.company || {}).name,
    location: ((x.locations || [])[0] || {}).name || '',
    link: (x.refs || {}).landing_page,
    source: 'The Muse',
  }));
}

// Adzuna aggregates real listings across the big boards (incl. LinkedIn/Indeed-
// sourced roles). Free tier; needs ADZUNA_APP_ID + ADZUNA_APP_KEY. Skipped
// gracefully when unconfigured.
function detectCountry(location) {
  const l = (location || '').toLowerCase();
  const map = [
    ['in', /india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|gurgaon|gurugram|noida|kolkata/],
    ['gb', /united kingdom|\buk\b|england|london|manchester|scotland|wales/],
    ['us', /united states|\busa?\b|u\.s|new york|san francisco|seattle|austin|boston|chicago/],
    ['ca', /canada|toronto|vancouver|montreal/],
    ['au', /australia|sydney|melbourne|brisbane/],
    ['de', /germany|berlin|munich|münchen/],
    ['sg', /singapore/],
    ['nl', /netherlands|amsterdam/],
    ['fr', /france|paris/],
    ['nz', /new zealand|auckland/],
  ];
  for (const [c, re] of map) { if (re.test(l)) return c; }
  return process.env.ADZUNA_COUNTRY || 'us';
}
async function fromAdzuna(role, location) {
  const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) return [];
  const country = detectCountry(location);
  let url = 'https://api.adzuna.com/v1/api/jobs/' + country + '/search/1'
    + '?app_id=' + encodeURIComponent(id) + '&app_key=' + encodeURIComponent(key)
    + '&results_per_page=25&content-type=application/json&what=' + encodeURIComponent(role);
  if (location && !/remote|anywhere|worldwide/i.test(location)) url += '&where=' + encodeURIComponent(location);
  const d = await fetchJSON(url);
  const arr = (d && d.results) || [];
  return arr.map((x) => clean({ title: x.title, company: (x.company || {}).display_name, location: (x.location || {}).display_name, link: x.redirect_url, source: 'Adzuna' }));
}

const FETCHERS = {
  Remotive: fromRemotive,
  RemoteOK: fromRemoteOK,
  Arbeitnow: fromArbeitnow,
  'The Muse': fromMuse,
};

function words(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9+]+/).filter((w) => w.length >= 3);
}

// Rank/keep by how many role words appear in the title.
function keywordFilter(jobs, role) {
  const rw = words(role);
  if (!rw.length) return jobs;
  const scored = jobs.map((j) => ({ j, s: rw.filter((w) => j.title.toLowerCase().includes(w)).length }));
  const all = scored.filter((x) => x.s === rw.length).map((x) => x.j);
  const some = scored.filter((x) => x.s > 0 && x.s < rw.length).sort((a, b) => b.s - a.s).map((x) => x.j);
  return all.concat(some);
}

function locationFilter(jobs, location) {
  const loc = String(location || '').toLowerCase().trim();
  if (!loc) return jobs;
  const isRemoteQuery = /remote|anywhere|worldwide/.test(loc);
  const kept = jobs.filter((j) => {
    const l = (j.location || '').toLowerCase();
    if (!l) return true;
    if (/remote|anywhere|worldwide/.test(l)) return true; // remote roles match any location
    if (isRemoteQuery) return /remote|anywhere|worldwide/.test(l);
    return l.includes(loc);
  });
  return kept.length >= 3 ? kept : jobs; // don't let a strict location wipe out results
}

function dedupe(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    if (!j.title || !/^https?:\/\//i.test(j.link)) continue;
    const key = (j.title + '|' + j.company).toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}

async function verifySupabase(token, url, anonKey) {
  if (!url || !anonKey) return { ok: true, email: null };
  if (!token) return { ok: false };
  try {
    const base = url.replace(/\/+$/, '');
    const r = await fetch(base + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } });
    if (!r.ok) return { ok: false };
    const u = await r.json();
    if (!u || !u.email) return { ok: false };
    if (!u.email_confirmed_at && !u.confirmed_at) return { ok: false };
    return { ok: true, email: u.email };
  } catch (e) {
    return { ok: false };
  }
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL || 'https://rhvmpzjeyjminlvuhozx.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJodm1wempleWptaW5sdnVob3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODE2MTgsImV4cCI6MjA5NTQ1NzYxOH0.qmwLy5GYg5ymby-TY1Jc2k9s49XmqoAX_9NMq2ILjdg';
  const gated = !!(supabaseUrl && supabaseAnonKey);

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    // Free public APIs, no key needed — the engine is always ready.
    return res.status(200).json({ supabaseUrl: supabaseUrl || null, supabaseAnonKey: supabaseAnonKey || null, gated, engineReady: true, boards: ALL_BOARDS });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = (req.headers['authorization'] || '').toString();
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const gate = await verifySupabase(token, supabaseUrl, supabaseAnonKey);
  if (!gate.ok) return res.status(401).json({ error: 'signin_required' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const role = (body.role || '').toString().slice(0, 160).trim();
  const location = (body.location || '').toString().slice(0, 120).trim();
  let boards = Array.isArray(body.boards) ? body.boards.filter((b) => ALL_BOARDS.includes(b)) : [];
  if (!boards.length) boards = ALL_BOARDS.slice();
  if (!role) return res.status(400).json({ error: 'role required' });

  try {
    // Selected free boards + Adzuna (always, when configured) run in parallel.
    const tasks = boards.map((b) => FETCHERS[b](role, location).catch(() => []));
    tasks.push(fromAdzuna(role, location).catch(() => []));
    const batches = await Promise.all(tasks);
    let all = [];
    batches.forEach((part) => {
      // Title-match every source (even servers' loose search) so results are
      // actually about the role the user asked for.
      all = all.concat(keywordFilter(part || [], role));
    });
    all = locationFilter(all, location);
    const results = dedupe(all).slice(0, 40);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ results, count: results.length, role, location, boards });
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed', message: String(e).slice(0, 200) });
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 30 };
// Internal helpers exposed for tests only.
module.exports._test = { FETCHERS, keywordFilter, locationFilter, dedupe, ALL_BOARDS };
