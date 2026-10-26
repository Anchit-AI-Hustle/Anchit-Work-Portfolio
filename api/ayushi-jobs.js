// /api/ayushi-jobs — the search half of Ayushi's job agent.
//
//   GET /api/ayushi-jobs            → ranked openings for her target roles
//   GET /api/ayushi-jobs?extra=gh:acme,lv:foo,ab:bar   → also search those boards
//
// WHY NOT /api/jobhunt
//   jobhunt searches remote-first boards (Remotive, RemoteOK, Arbeitnow, The
//   Muse). For a marketer in New Delhi they return almost nothing: a search for
//   "CRM Marketing" in India came back with five remote US/EU roles. Companies
//   that hire in India publish their openings through their applicant-tracking
//   system's public board API (Greenhouse, Lever, Ashby). Those need no key,
//   carry the employer's own apply link, and are where the India roles are.
//
// WHAT IT DOES
//   Pulls every board in parallel, keeps marketing / CRM / growth titles in
//   India or remote, scores each against her profile and returns them ranked,
//   each with the reasons for its score. A board that times out or 404s is
//   reported in `sources`, never fatal.
//
// It submits nothing. Applying is done by her, from the page, on the employer's
// own form — see the note at the top of ayushi-rawat/auto-job-applier.html.
const { guard } = require('./_guard.js');
const { _test: jobhunt } = require('./jobhunt.js');

// Boards checked on 2026-10-26 to be live and to list India-based openings.
const BOARDS = [
  ['gh', 'groww'], ['gh', 'inmobi'], ['gh', 'druva'], ['gh', 'hackerrank'], ['gh', 'rubrik'],
  ['gh', 'databricks'], ['gh', 'mongodb'], ['gh', 'okta'], ['gh', 'twilio'], ['gh', 'gitlab'],
  ['gh', 'stripe'], ['lv', 'cred'], ['lv', 'meesho'], ['lv', 'zeta'], ['lv', 'paytm'],
  ['ab', 'atlan'], ['ab', 'sarvam'],
];
const UA = 'Mozilla/5.0 (compatible; AyushiJobAgent/1.0; +https://anchit-tandon.com/ayushi-rawat)';

const INDIA = /\b(india|new delhi|delhi|ncr|gurgaon|gurugram|noida|bengaluru|bangalore|mumbai|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|agra|chandigarh)\b/i;
const NCR = /\b(new delhi|delhi|ncr|gurgaon|gurugram|noida)\b/i;
const REMOTE = /\b(remote|anywhere|worldwide|work from home|wfh)\b/i;
// "Remote - United Kingdom" is remote for someone in the UK. A remote role is
// open to her only when nothing but India, APAC or "anywhere" is attached to it.
const REMOTE_OK_FOR_INDIA = /\b(india|apac|asia|anywhere|worldwide|global)\b/i;

const MARKETING = /\b(marketing|marketer|crm|lifecycle|retention|growth|campaigns?|brand|content|social media|community|demand gen(?:eration)?|martech|engagement|communications|seo|sem|performance|salesforce)\b/i;
const NOT_HER = /\b(engineer|engineering|developer|software|scientist|designer|accountant|legal|counsel|recruit\w*|account executive|account manager|sales development|sdr|bdr|architect|devops|security|finance|payroll|product manager|customer success|support|escalations?)\b/i;

const CORE = /\b(crm|lifecycle|retention|marketing operations|marketing ops|martech|marketing automation|customer engagement|salesforce marketing|email marketing)\b/i;
const MKT = /\b(digital marketing|growth|performance marketing|campaigns?|demand gen(?:eration)?|marketing manager|marketing executive|marketing specialist|marketing associate)\b/i;
const CRAFT = /\b(content|brand|social media|community|communications|seo|sem)\b/i;
const SF_ADMIN = /\bsalesforce\b/i;
const TOO_SENIOR = /\b(director|vp|vice president|head of|chief|principal|gm|avp|dgm|agm)\b/i;
const TOO_JUNIOR = /\b(intern|internship|trainee|fresher|apprentice)\b/i;
const RIGHT_LEVEL = /\b(manager|lead|specialist|senior|associate|executive|analyst)\b/i;
const PROPERTY = /\b(real estate|proptech|property|housing)\b/i;

async function fetchJSON(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) return { error: 'http_' + r.status };
    return { data: await r.json() };
  } catch (e) {
    return { error: e && e.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(t);
  }
}

const text = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const titleCase = (slug) => slug.replace(/(^|[-_])(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase());

function job(o) {
  return {
    title: text(o.title, 200), company: text(o.company, 120), location: text(o.location, 200),
    link: text(o.link, 600), source: o.source, posted: o.posted || null,
    description: text(o.description, 1500), remote: !!o.remote,
  };
}

async function greenhouse(slug) {
  const r = await fetchJSON('https://boards-api.greenhouse.io/v1/boards/' + encodeURIComponent(slug) + '/jobs');
  if (r.error) return r;
  const company = titleCase(slug);
  return { jobs: ((r.data && r.data.jobs) || []).map((x) => job({
    title: x.title, company, location: (x.location || {}).name, link: x.absolute_url,
    source: 'Greenhouse', posted: x.first_published || x.updated_at,
  })) };
}

async function lever(slug) {
  const r = await fetchJSON('https://api.lever.co/v0/postings/' + encodeURIComponent(slug) + '?mode=json');
  if (r.error) return r;
  const company = titleCase(slug);
  return { jobs: (Array.isArray(r.data) ? r.data : []).map((x) => {
    const c = x.categories || {};
    const locs = [c.location].concat(c.allLocations || []).filter(Boolean);
    return job({
      title: x.text, company, location: [...new Set(locs)].join(' · '), link: x.hostedUrl || x.applyUrl,
      source: 'Lever', posted: x.createdAt ? new Date(x.createdAt).toISOString() : null,
      description: x.descriptionPlain, remote: x.workplaceType === 'remote',
    });
  }) };
}

async function ashby(slug) {
  const r = await fetchJSON('https://api.ashbyhq.com/posting-api/job-board/' + encodeURIComponent(slug));
  if (r.error) return r;
  const company = titleCase(slug);
  return { jobs: ((r.data && r.data.jobs) || []).map((x) => {
    const locs = [x.location].concat((x.secondaryLocations || []).map((s) => s.location)).filter(Boolean);
    return job({
      title: x.title, company, location: [...new Set(locs)].join(' · '), link: x.jobUrl || x.applyUrl,
      source: 'Ashby', posted: x.publishedAt, description: x.descriptionPlain, remote: !!x.isRemote,
    });
  }) };
}

const ATS = { gh: greenhouse, lv: lever, ab: ashby };

// The remote boards jobhunt already knows. Only Remotive takes a query; the
// others return their whole feed, which the title filter below narrows.
async function remoteBoards() {
  const parts = await Promise.all(Object.values(jobhunt.FETCHERS).map((f) => f('marketing').catch(() => [])));
  return parts.flat().map((x) => job({ ...x, remote: REMOTE.test(x.location || '') }));
}

function where(j) {
  if (NCR.test(j.location)) return 'ncr';
  if (INDIA.test(j.location)) return 'india';
  if (j.remote || REMOTE.test(j.location)) {
    const rest = j.location.replace(new RegExp(REMOTE.source, 'gi'), '').replace(/[^a-z]+/gi, ' ').trim();
    if (!rest || REMOTE_OK_FOR_INDIA.test(rest)) return 'remote';
  }
  return null;
}

// Score 0-100 against her profile, with the reason for every point that moved it.
function score(j, now) {
  const t = j.title;
  let s = 40;
  const why = [];
  if (CORE.test(t)) { s += 30; why.push('Core CRM / lifecycle role'); }
  else if (MKT.test(t)) { s += 18; why.push('Digital / growth marketing role'); }
  else if (CRAFT.test(t)) { s += 10; why.push('Content, brand or social role'); }
  else if (SF_ADMIN.test(t)) { s += 12; why.push('Uses her Salesforce background'); }
  if (SF_ADMIN.test(t) && CORE.test(t)) { s += 6; why.push('Salesforce + marketing'); }
  if (TOO_SENIOR.test(t)) { s -= 22; why.push('Likely more senior than 4+ yrs'); }
  else if (TOO_JUNIOR.test(t)) { s -= 30; why.push('Junior / internship level'); }
  else if (RIGHT_LEVEL.test(t)) { s += 6; why.push('Level fits 4+ yrs'); }
  // Titles here often carry the experience band: "Exp- 8- 10 Years", "2-4 Years".
  const band = t.match(/(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\s*(?:\+\s*)?y(?:ea)?rs?/i) || t.match(/(\d{1,2})\s*\+\s*y(?:ea)?rs?/i);
  if (band) {
    const lo = +band[1], hi = band[2] ? +band[2] : lo + 3;
    if (lo >= 6) { s -= 15; why.push('Asks for ' + lo + '+ years'); }
    else if (hi < 3) { s -= 10; why.push('Pitched below her experience'); }
    else if (lo <= 5 && hi >= 4) { s += 6; why.push('Experience band fits'); }
  }
  const w = j.where;
  if (w === 'ncr') { s += 14; why.push('Delhi NCR'); }
  else if (w === 'india') { s += 8; why.push('India'); }
  else if (w === 'remote') { s += 4; why.push('Remote'); }
  if (PROPERTY.test(t + ' ' + j.company + ' ' + j.description)) { s += 8; why.push('Property / real estate domain'); }
  if (j.posted) {
    const days = (now - Date.parse(j.posted)) / 864e5;
    if (days <= 14) { s += 4; why.push('Posted in the last 2 weeks'); }
    else if (days > 60) { s -= 6; why.push('Posted over 2 months ago'); }
  }
  return { score: Math.max(0, Math.min(100, Math.round(s))), reasons: why };
}

function idFor(j) {
  let h = 0;
  const k = (j.link || j.title + j.company).toLowerCase();
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
  return 'j' + (h >>> 0).toString(36);
}

function parseExtra(q) {
  return String(q || '').split(',').map((s) => s.trim().toLowerCase())
    .map((s) => s.match(/^(gh|lv|ab):([a-z0-9][a-z0-9-]{0,60})$/))
    .filter(Boolean).slice(0, 8).map((m) => [m[1], m[2]]);
}

function rank(all, now) {
  const seen = new Set();
  const out = [];
  for (const j of all) {
    if (!j.title || !/^https:\/\//i.test(j.link)) continue;
    if (!MARKETING.test(j.title) || NOT_HER.test(j.title)) continue;
    const w = where(j);
    if (!w) continue;
    const key = (j.title + '|' + j.company).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = { ...j, where: w };
    Object.assign(r, score(r, now), { id: idFor(r) });
    out.push(r);
  }
  return out.sort((a, b) => b.score - a.score || String(b.posted || '').localeCompare(String(a.posted || '')));
}

async function handler(req, res) {
  if (guard(req, res, { route: 'ayushi-jobs', max: 12, methods: 'GET, OPTIONS' })) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const url = new URL(req.url || '/', 'http://x');
  const boards = BOARDS.concat(parseExtra(url.searchParams.get('extra')));
  const sources = [];
  const tasks = boards.map(([kind, slug]) => ATS[kind](slug).then((r) => {
    sources.push({ board: kind + ':' + slug, ok: !r.error, count: r.jobs ? r.jobs.length : 0, error: r.error || null });
    return r.jobs || [];
  }));
  tasks.push(remoteBoards().then((jobs) => { sources.push({ board: 'remote-boards', ok: true, count: jobs.length, error: null }); return jobs; }));

  const all = (await Promise.all(tasks)).flat();
  const results = rank(all, Date.now()).slice(0, 80);
  // Same answer for everyone for 15 minutes: the boards don't change faster,
  // and the CDN absorbs repeat runs instead of the boards' rate limits.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900, stale-while-revalidate=3600');
  return res.status(200).json({ results, count: results.length, scanned: all.length, sources, at: new Date().toISOString() });
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 30 };
module.exports._test = { rank, score, where, parseExtra, BOARDS };
