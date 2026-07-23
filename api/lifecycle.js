// /api/lifecycle — D2C-LifeCycle-OS demo engine.
//
//   POST /api/lifecycle  → { plan, source }
//
// Given any brand (name, optionally a website URL and category), it returns a
// plug-and-play, brand-agnostic AI-led D2C marketing-automation plan: an
// industry read (category, peer/competitor set and industry-standard
// benchmarks), positioning, segments, lifecycle stages, a campaign calendar, a
// sample mailer, retention flows and KPIs — grounded in industry baselines for
// the entered brand's category rather than any single brand's proprietary data.
//
// The industry read is sourced from a competitive-intelligence layer the way
// SimilarWeb / SEMrush profile a market: if a data-provider key is configured
// it pulls a live domain profile and feeds it to the model as context;
// otherwise the model derives industry-standard bands from its category
// knowledge. A deterministic template backs everything so the demo ALWAYS
// returns a usable plan.
//
// Env (all optional):
//   LLM cascade — GROQ_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY (+casings),
//     OPENROUTER_API_KEY, and *_MODEL overrides.
//   Competitive intelligence — SIMILARWEB_API_KEY, SEMRUSH_API_KEY (both
//     optional; used only to enrich the industry read when present).

function geminiKey() {
  const e = process.env;
  return (e.GEMINI_API_KEY || e.Gemini_API_Key || e.GEMINI_KEY || e.GOOGLE_API_KEY
    || e.GOOGLE_GENAI_API_KEY || e.GOOGLE_GEMINI_API_KEY || '').trim();
}
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'llama-3.3-70b';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

function haveAnyProvider() {
  return !!(process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY || geminiKey() || process.env.OPENROUTER_API_KEY);
}

// ── Competitive-intelligence layer (SimilarWeb / SEMrush, both optional) ──
// Pulls a live domain profile for the entered brand and returns a short text
// summary the model can ground its industry benchmarks in. Best-effort: any
// failure (no key, bad domain, rate limit, network) returns '' and the model
// falls back to its own category knowledge. This is the "industry standard
// level of the other brands in that industry" signal, sourced the way
// competitor-discovery platforms surface it.
function domainOf(brand, url) {
  const raw = (url || brand || '').toString().trim();
  const m = raw.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1].toLowerCase() : '';
}

async function similarWebProfile(domain) {
  const key = (process.env.SIMILARWEB_API_KEY || '').trim();
  if (!key || !domain) return '';
  const base = 'https://api.similarweb.com/v1/website/' + encodeURIComponent(domain);
  try {
    const [visitsR, srcR] = await Promise.all([
      fetchTO(base + '/total-traffic-and-engagement/visits?api_key=' + key + '&granularity=monthly&main_domain_only=true', {}, 8000),
      fetchTO(base + '/traffic-sources/overview-share?api_key=' + key + '&main_domain_only=true', {}, 8000),
    ]);
    const out = [];
    if (visitsR && visitsR.ok) {
      const d = await visitsR.json();
      const v = arr(d.visits);
      if (v.length) out.push('Monthly visits (recent): ' + v.slice(-3).map((x) => (x.visits ? Math.round(x.visits).toLocaleString() : '?')).join(' → '));
    }
    if (srcR && srcR.ok) {
      const d = await srcR.json();
      const s = (d.overview && d.overview.length ? d.overview[0] : d) || {};
      const parts = [];
      ['direct', 'search', 'social', 'mail', 'referrals', 'paid_referrals', 'display_ads'].forEach((k) => {
        if (s[k] != null) parts.push(k + ' ' + Math.round(Number(s[k]) * 100) + '%');
      });
      if (parts.length) out.push('Channel mix: ' + parts.join(', '));
    }
    return out.length ? ('SimilarWeb (' + domain + '): ' + out.join('. ')) : '';
  } catch (e) { return ''; }
}

async function semrushProfile(domain) {
  const key = (process.env.SEMRUSH_API_KEY || '').trim();
  if (!key || !domain) return '';
  try {
    const url = 'https://api.semrush.com/analytics/ta/api/v3/summary?targets=' + encodeURIComponent(domain)
      + '&export_columns=target,visits,users,bounce_rate&key=' + key;
    const r = await fetchTO(url, {}, 8000);
    if (!r || !r.ok) return '';
    const text = (await r.text()).trim();
    // SEMrush returns CSV-ish (";"-separated). Keep the first data row as context.
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return '';
    return 'SEMrush (' + domain + '): ' + lines[0].replace(/;/g, ' | ') + ' → ' + lines[1].replace(/;/g, ' | ');
  } catch (e) { return ''; }
}

async function competitiveContext(brand, url) {
  const domain = domainOf(brand, url);
  if (!domain) return '';
  const parts = (await Promise.all([similarWebProfile(domain), semrushProfile(domain)])).filter(Boolean);
  return parts.join('\n');
}

async function fetchTO(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 18000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); }
  finally { clearTimeout(t); }
}

async function oaiChat(url, key, model, prompt, jsonMode, extraHeaders) {
  const body = { model, messages: [{ role: 'user', content: prompt }], temperature: 0.6, max_tokens: 4096 };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const r = await fetchTO(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', Authorization: 'Bearer ' + key }, extraHeaders || {}), body: JSON.stringify(body) });
  if (r.status === 429) throw new Error('429');
  if (!r.ok) throw new Error('http_' + r.status);
  const d = await r.json();
  return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
}

async function geminiGen(key, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  const opts = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 4096 } }) };
  let r = await fetchTO(url, opts);
  if (r.status === 429) { await new Promise((s) => setTimeout(s, 2500)); r = await fetchTO(url, opts); }
  if (r.status === 429) throw new Error('429');
  if (!r.ok) throw new Error('http_' + r.status);
  const d = await r.json();
  const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  return parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('').trim();
}

async function generate(prompt) {
  const providers = [];
  if (process.env.GROQ_API_KEY) providers.push(() => oaiChat('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, GROQ_MODEL, prompt, true));
  if (process.env.CEREBRAS_API_KEY) providers.push(() => oaiChat('https://api.cerebras.ai/v1/chat/completions', process.env.CEREBRAS_API_KEY, CEREBRAS_MODEL, prompt, true));
  const gk = geminiKey();
  if (gk) providers.push(() => geminiGen(gk, prompt));
  if (process.env.OPENROUTER_API_KEY) providers.push(() => oaiChat('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL, prompt, false, { 'HTTP-Referer': 'https://anchit-tandon.com/d2c-lifecycle-os', 'X-Title': 'D2C-LifeCycle-OS' }));
  for (const run of providers) {
    try {
      const plan = parsePlan(await run());
      if (plan) return plan;
    } catch (e) { /* next provider */ }
  }
  return null;
}

function parsePlan(text) {
  if (!text) return null;
  let t = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) return null;
  try {
    const o = JSON.parse(t.slice(a, b + 1));
    if (!o || typeof o !== 'object') return null;
    return normalize(o);
  } catch (e) { return null; }
}

function arr(x) { return Array.isArray(x) ? x : []; }
function str(x, n) { return String(x == null ? '' : x).slice(0, n || 400); }

// Clamp whatever the model returns into the shape the UI expects.
function normalize(o) {
  const ind = o.industry && typeof o.industry === 'object' ? o.industry : {};
  return {
    brand: str(o.brand, 80),
    industry: {
      category: str(ind.category, 80),
      competitors: arr(ind.competitors).slice(0, 6).map((c) => str(c, 60)),
      benchmarks: arr(ind.benchmarks).slice(0, 8).map((b) => ({ metric: str(b.metric, 60), value: str(b.value, 60), note: str(b.note, 160) })),
    },
    positioning: str(o.positioning, 600),
    segments: arr(o.segments).slice(0, 6).map((s) => ({ name: str(s.name, 60), description: str(s.description, 300), size: str(s.size, 40) })),
    stages: arr(o.stages).slice(0, 6).map((s) => ({ stage: str(s.stage, 40), goal: str(s.goal, 200), channels: arr(s.channels).slice(0, 5).map((c) => str(c, 30)), campaign: str(s.campaign, 240) })),
    calendar: arr(o.calendar).slice(0, 8).map((c) => ({ week: str(c.week, 24), theme: str(c.theme, 80), sends: arr(c.sends).slice(0, 5).map((x) => str(x, 80)) })),
    mailer: o.mailer && typeof o.mailer === 'object' ? { subject: str(o.mailer.subject, 140), preview: str(o.mailer.preview, 160), body: str(o.mailer.body, 1600) } : null,
    retention: arr(o.retention).slice(0, 6).map((r) => ({ trigger: str(r.trigger, 80), flow: str(r.flow, 280) })),
    kpis: arr(o.kpis).slice(0, 6).map((k) => ({ metric: str(k.metric, 60), target: str(k.target, 60) })),
  };
}

function buildPrompt(brand, url, category, profileText, benchmarkContext) {
  return `You are D2C-LifeCycle-OS, an AI that designs plug-and-play lifecycle marketing automation for any direct-to-consumer brand — grounded in INDUSTRY-STANDARD benchmarks for the brand's category, the way competitor-discovery platforms like SimilarWeb and SEMrush profile a market.

First infer the brand's category and its peer/competitor set (3-6 comparable D2C brands in the same industry and price tier). Then establish industry-standard benchmarks for that peer set — traffic mix / channel split, typical AOV band, repeat-purchase / retention rate band, email revenue share, and seasonality. Use these baselines to ground the entire lifecycle plan. Be specific to the brand and its category — no generic filler. Use realistic, quantified targets that reflect the industry standard.

BRAND: ${brand}
${category ? 'CATEGORY: ' + category : ''}
${url ? 'WEBSITE: ' + url : ''}
${profileText ? 'SITE CONTEXT: ' + profileText.slice(0, 2500) : ''}
${benchmarkContext ? 'COMPETITIVE-INTELLIGENCE DATA (use to ground benchmarks; do not contradict it):\n' + benchmarkContext.slice(0, 1500) : ''}

Return ONLY a JSON object (no markdown fences, no commentary) with EXACTLY this shape:
{
  "brand": string,
  "industry": {
    "category": string (the D2C category you inferred, e.g. "Premium loose-leaf tea"),
    "competitors": [string]  (3-6 comparable brands in the same industry/tier),
    "benchmarks": [{"metric": string, "value": string (an industry-standard band, e.g. "3.2-4.1%"), "note": string (why it matters)}]  (4-6 benchmarks: channel mix, AOV band, repeat-purchase rate, email revenue share, seasonality, etc.)
  },
  "positioning": string (1-2 sentences on how lifecycle marketing should position this brand relative to its industry benchmarks),
  "segments": [{"name": string, "description": string, "size": string (e.g. "~18% of list")}]  (4-6 behavioural/RFM segments),
  "stages": [{"stage": string (e.g. Acquisition, Welcome, Activation, Nurture, Win-back, VIP), "goal": string, "channels": [string], "campaign": string (one concrete campaign idea)}]  (5-6 stages),
  "calendar": [{"week": string (e.g. "Week 1"), "theme": string, "sends": [string]}]  (4-6 weeks),
  "mailer": {"subject": string, "preview": string, "body": string (a short, on-brand sample email in the brand's voice)},
  "retention": [{"trigger": string (e.g. "Cart abandon", "60 days no purchase"), "flow": string (the automated flow)}]  (4-6),
  "kpis": [{"metric": string, "target": string}]  (4-6 lifecycle KPIs with realistic targets)
}`;
}

// ── Deterministic fallback so the demo always returns a usable plan ──
function templatePlan(brand, category) {
  const b = brand || 'Your brand';
  const cat = category || 'D2C';
  return {
    brand: b,
    industry: {
      category: cat === 'D2C' ? 'Direct-to-consumer' : cat,
      competitors: ['Category leader', 'Fast-growing challenger', 'Value alternative', 'Premium incumbent'],
      benchmarks: [
        { metric: 'Channel mix (email/SMS revenue share)', value: '25-35% of total', note: 'Industry-standard band for a healthy D2C lifecycle program.' },
        { metric: 'Repeat-purchase rate', value: '20-30%', note: 'Typical for the category; the second order is the LTV inflection point.' },
        { metric: 'Average order value band', value: 'Category median ±15%', note: 'Anchor offers and free-ship thresholds to the peer set, not guesses.' },
        { metric: 'Flow vs campaign revenue', value: '~45% from automations', note: 'Best-in-class D2C brands earn ~half of email revenue from flows.' },
        { metric: 'Seasonality', value: 'Q4 + category moments', note: 'Peak windows follow the industry calendar; plan cadence around them.' },
      ],
    },
    positioning: `${b} wins on repeat purchase, not just the first sale. Benchmarked against its ${cat} peer set, lifecycle marketing turns one-time buyers into a predictable, high-LTV base through timely, segmented, on-brand touches.`,
    segments: [
      { name: 'First-time buyers', description: 'Placed exactly one order; highest churn risk in the first 30 days.', size: '~35% of list' },
      { name: 'Repeat / loyal', description: '2+ orders, buys on cadence — protect and reward.', size: '~18% of list' },
      { name: 'VIP / high-LTV', description: 'Top 5% by spend; deserve early access and concierge touches.', size: '~5% of list' },
      { name: 'At-risk / lapsing', description: 'No purchase in 60–90 days; needs a win-back nudge.', size: '~22% of list' },
      { name: 'Browsers / no purchase', description: 'Engaged with email/site but never converted.', size: '~20% of list' },
    ],
    stages: [
      { stage: 'Acquisition', goal: 'Capture email/SMS with a first-order incentive', channels: ['Popup', 'Meta', 'SMS'], campaign: 'Welcome-10 offer on signup, gated behind email + SMS opt-in.' },
      { stage: 'Welcome', goal: 'Introduce brand story + hero products', channels: ['Email', 'SMS'], campaign: '3-part welcome flow: story → bestsellers → social proof + first-order nudge.' },
      { stage: 'Activation', goal: 'Convert the first order within 7 days', channels: ['Email', 'SMS'], campaign: 'Abandoned-browse + cart recovery with dynamic product blocks.' },
      { stage: 'Nurture', goal: 'Drive the second purchase (the LTV inflection point)', channels: ['Email'], campaign: 'Replenishment reminder timed to product consumption cycle + cross-sell.' },
      { stage: 'Win-back', goal: 'Re-engage lapsing buyers before they churn', channels: ['Email', 'SMS'], campaign: '"We miss you" escalating offer over 3 sends across 14 days.' },
      { stage: 'VIP', goal: 'Reward and retain top spenders', channels: ['Email', 'SMS'], campaign: 'Early access drops + surprise gift at spend milestones.' },
    ],
    calendar: [
      { week: 'Week 1', theme: 'Onboarding & story', sends: ['Welcome #1 (story)', 'Bestsellers #2', 'Browse-abandon (triggered)'] },
      { week: 'Week 2', theme: 'Activation & social proof', sends: ['UGC / reviews', 'Cart recovery (triggered)', 'SMS first-order nudge'] },
      { week: 'Week 3', theme: 'Education & cross-sell', sends: ['How-to / usage', 'Complementary products', 'Segment: browsers re-engage'] },
      { week: 'Week 4', theme: 'Retention & replenishment', sends: ['Replenishment reminder', 'VIP early access', 'Win-back for 60-day lapsers'] },
    ],
    mailer: {
      subject: `A little something to start your ${b} journey`,
      preview: 'Your welcome gift is inside — plus where to begin.',
      body: `Hi {{ first_name | default: "there" }},\n\nWelcome to ${b}. We build for people who care about the details — and we think you'll feel it from the first order.\n\nHere's 10% to get you started: WELCOME10\n\nNot sure where to begin? Our bestsellers are loved for a reason — start there, and reply to this email anytime. A real human reads it.\n\n— Team ${b}`,
    },
    retention: [
      { trigger: 'Browse abandon', flow: '2 emails + 1 SMS over 24h with the exact product viewed and a soft nudge.' },
      { trigger: 'Cart abandon', flow: '3-step recovery (1h / 24h / 48h), incentive only on the final send.' },
      { trigger: '60 days no purchase', flow: 'Win-back series: value reminder → best-seller → escalating offer.' },
      { trigger: 'Post-delivery +7 days', flow: 'Review request + usage tips; routes happy buyers to referral.' },
      { trigger: 'Spend milestone hit', flow: 'Auto-upgrade to VIP segment; unlock early access + surprise gift.' },
    ],
    kpis: [
      { metric: 'Email revenue share', target: '25–35% of total' },
      { metric: 'Repeat purchase rate', target: '+8–12 pts in 90 days' },
      { metric: 'Flow revenue / total email', target: '45%+ from automations' },
      { metric: '90-day retention', target: '+10 pts vs baseline' },
      { metric: 'Win-back recovery rate', target: '6–10% of lapsed' },
      { metric: 'List → revenue (RPME)', target: '₹ / $ per email up 15%' },
    ],
  };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const brand = (body.brand || '').toString().slice(0, 80).trim();
  const url = (body.url || '').toString().slice(0, 300).trim();
  const category = (body.category || '').toString().slice(0, 60).trim();
  if (!brand && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'brand_or_url_required' });
  const label = brand || url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  res.setHeader('Cache-Control', 'no-store');
  try {
    if (haveAnyProvider()) {
      // Enrich the industry read with live competitive-intelligence data when a
      // provider key is present; otherwise the model derives benchmarks itself.
      let benchmarkContext = '';
      try { benchmarkContext = await competitiveContext(label, url); } catch (e) { /* best-effort */ }
      const plan = await generate(buildPrompt(label, url, category, '', benchmarkContext));
      if (plan) return res.status(200).json({ plan, source: benchmarkContext ? 'ai+ci' : 'ai' });
    }
  } catch (e) { /* fall through to template */ }
  // Always return something usable.
  return res.status(200).json({ plan: templatePlan(label, category), source: 'template' });
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 30 };
module.exports._test = { normalize, parsePlan, templatePlan, buildPrompt };
