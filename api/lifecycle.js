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

// Mailer shape follows the Smart-Brain "think → lock → execute" model: a single
// locked theme, a strategy-driven hero + structured sections, and one primary
// CTA — so the content is coherent, not a random blob. The UI renders it as a
// designed HTML email (Mailer-Architect visual quality), falling back to `body`.
function normalizeMailer(m) {
  if (!m || typeof m !== 'object') return null;
  const h = m.hero && typeof m.hero === 'object' ? m.hero : {};
  const c = m.cta && typeof m.cta === 'object' ? m.cta : {};
  const clampScore = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };
  return {
    theme: str(m.theme, 120),
    subject: str(m.subject, 140),
    preview: str(m.preview, 160),
    hero: { kicker: str(h.kicker, 40), headline: str(h.headline, 140), subhead: str(h.subhead, 220) },
    sections: arr(m.sections).slice(0, 4).map((s) => ({ title: str(s.title, 60), body: str(s.body, 340) })),
    cta: { label: str(c.label, 40), note: str(c.note, 120) },
    signoff: str(m.signoff, 80),
    body: str(m.body, 1600),
    // Mailer Studio: multiple variant concepts per send, each quality-scored
    // (strategy alignment · copy · content density · divergence · overall).
    variants: arr(m.variants).slice(0, 4).map((v) => {
      const sc = v.score && typeof v.score === 'object' ? v.score : {};
      const score = { strategy: clampScore(sc.strategy), copy: clampScore(sc.copy), density: clampScore(sc.density), divergence: clampScore(sc.divergence), overall: clampScore(sc.overall) };
      const nums = ['strategy', 'copy', 'density', 'divergence'].map((k) => score[k]).filter((n) => n != null);
      if (score.overall == null && nums.length) score.overall = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
      return { label: str(v.label, 40), type: /image/i.test(v.type) ? 'image' : 'text', angle: str(v.angle, 240), score };
    }),
  };
}

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
    calendar: arr(o.calendar).slice(0, 8).map((c) => ({ week: str(c.week, 24), theme: str(c.theme, 80), cadence: str(c.cadence, 60), sends: arr(c.sends).slice(0, 5).map((x) => str(x, 80)) })),
    analysis: normalizeAnalysis(o.analysis),
    mailer: normalizeMailer(o.mailer),
    retention: arr(o.retention).slice(0, 6).map((r) => ({ trigger: str(r.trigger, 80), flow: str(r.flow, 280) })),
    kpis: arr(o.kpis).slice(0, 6).map((k) => ({ metric: str(k.metric, 60), target: str(k.target, 60) })),
    smartBrain: normalizeSmartBrain(o.smartBrain),
    guardrails: arr(o.guardrails).slice(0, 8).map((g) => (typeof g === 'string' ? { rule: str(g, 60), detail: '' } : { rule: str(g.rule, 60), detail: str(g.detail, 180) })),
  };
}

// Data-Analysis stage (RFM segmentation model, cohort retention, best send-time
// heatmap, cross-sell affinity) — the analytical layer of the original OS.
function normalizeAnalysis(a) {
  if (!a || typeof a !== 'object') return null;
  const st = a.sendTime && typeof a.sendTime === 'object' ? a.sendTime : {};
  return {
    model: str(a.model, 80),
    cohortNote: str(a.cohortNote, 240),
    sendTime: { window: str(st.window, 60), note: str(st.note, 160) },
    crossSell: arr(a.crossSell).slice(0, 6).map((x) => str(x, 60)),
  };
}

// Smart-Brain autopilot loop (analyze → plan → prebuild → review → approve).
function normalizeSmartBrain(b) {
  if (!b || typeof b !== 'object') return null;
  return {
    horizon: str(b.horizon, 60),
    loop: arr(b.loop).slice(0, 6).map((s) => (typeof s === 'string' ? { step: str(s, 30), detail: '' } : { step: str(s.step, 30), detail: str(s.detail, 180) })),
    note: str(b.note, 240),
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
    "category": string (the D2C category you inferred, e.g. "Premium skincare"),
    "competitors": [string]  (3-6 comparable brands in the same industry/tier),
    "benchmarks": [{"metric": string, "value": string (an industry-standard band, e.g. "3.2-4.1%"), "note": string (why it matters)}]  (4-6 benchmarks: channel mix, AOV band, repeat-purchase rate, email revenue share, seasonality, etc.)
  },
  "positioning": string (1-2 sentences on how lifecycle marketing should position this brand relative to its industry benchmarks),
  "segments": [{"name": string, "description": string, "size": string (e.g. "~18% of list")}]  (4-6 behavioural/RFM segments),
  "stages": [{"stage": string (e.g. Acquisition, Welcome, Activation, Nurture, Win-back, VIP), "goal": string, "channels": [string], "campaign": string (one concrete campaign idea)}]  (5-6 stages),
  "calendar": [{"week": string (e.g. "Week 1"), "theme": string, "cadence": string (per-segment send cadence guard, e.g. "≤3 sends/segment"), "sends": [string]}]  (4-6 weeks),
  "analysis": {  // Data-Analysis stage
    "model": string (segmentation model, e.g. "RFM — 9 behavioural segments"),
    "cohortNote": string (one cohort-retention insight for this category),
    "sendTime": {"window": string (best send window, e.g. "Tue & Thu, 10am-12pm"), "note": string},
    "crossSell": [string]  (3-6 cross-sell / affinity ideas)
  },
  "mailer": {  // "think -> lock -> execute": lock ONE theme, then a structured, strategy-driven email
    "theme": string (the single locked angle of this send, e.g. "Welcome & first order: story -> hero products -> nudge"),
    "subject": string,
    "preview": string (inbox preview text),
    "hero": {"kicker": string (2-3 words), "headline": string (one strong line), "subhead": string (one supporting line)},
    "sections": [{"title": string, "body": string}]  (2-3 tight, on-brand content blocks that follow the locked theme),
    "cta": {"label": string (button text), "note": string (one supporting line under the button)},
    "signoff": string (e.g. "Team <brand>"),
    "variants": [{"label": string (e.g. "A - Story-led"), "type": "text" | "image", "angle": string (what makes this variant different), "score": {"strategy": number (0-100), "copy": number, "density": number, "divergence": number, "overall": number}}]  (2-4 scored variant concepts, the Mailer-Studio output)
  },
  "retention": [{"trigger": string (e.g. "Cart abandon", "60 days no purchase"), "flow": string (the automated flow)}]  (4-6),
  "kpis": [{"metric": string, "target": string}]  (4-6 lifecycle KPIs with realistic targets),
  "smartBrain": {  // the autopilot operating loop
    "horizon": string (e.g. "90-day rolling"),
    "loop": [{"step": string (Analyze | Plan | Prebuild | Review | Approve), "detail": string}]  (the 5 loop steps),
    "note": string
  },
  "guardrails": [{"rule": string, "detail": string}]  (3-5 safety guardrails: discount cap, suppression/cadence, banned-phrase, brand lock)
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
      { week: 'Week 1', theme: 'Onboarding & story', cadence: '≤3 sends/segment · new subs only', sends: ['Welcome #1 (story)', 'Bestsellers #2', 'Browse-abandon (triggered)'] },
      { week: 'Week 2', theme: 'Activation & social proof', cadence: '≤3 sends/segment · suppress converters', sends: ['UGC / reviews', 'Cart recovery (triggered)', 'SMS first-order nudge'] },
      { week: 'Week 3', theme: 'Education & cross-sell', cadence: '≤2 sends/segment', sends: ['How-to / usage', 'Complementary products', 'Segment: browsers re-engage'] },
      { week: 'Week 4', theme: 'Retention & replenishment', cadence: '≤2 sends/segment · VIP +1', sends: ['Replenishment reminder', 'VIP early access', 'Win-back for 60-day lapsers'] },
    ],
    analysis: {
      model: 'RFM — 9 behavioural segments (recency × frequency × monetary)',
      cohortNote: `New-buyer cohorts in ${cat} typically retain 20–30% into a second order; the 30–60 day replenishment window is the LTV inflection point to target.`,
      sendTime: { window: 'Tue & Thu, 10am–12pm local', note: 'Category-typical peak open/click window; SMS best late-afternoon.' },
      crossSell: ['Bestseller bundles', 'Replenishment kits', 'Complementary category', 'Gifting sets', 'Subscription upgrade'],
    },
    mailer: {
      theme: 'Welcome & first order: story → hero products → first-order nudge',
      subject: `A little something to start your ${b} journey`,
      preview: 'Your welcome gift is inside — plus where to begin.',
      hero: {
        kicker: 'Welcome',
        headline: `Welcome to ${b}.`,
        subhead: `We build for people who care about the details — and you'll feel it from the first order.`,
      },
      sections: [
        { title: 'Here’s 10% to start', body: 'Use code WELCOME10 at checkout — consider it a thank-you for giving us a try.' },
        { title: 'Not sure where to begin?', body: 'Our bestsellers are loved for a reason. Start there, and reply to this email anytime — a real human reads every one.' },
      ],
      cta: { label: 'Shop bestsellers', note: 'Free returns, and we read every reply.' },
      signoff: `Team ${b}`,
      body: `Hi there,\n\nWelcome to ${b}. Here's 10% to get started: WELCOME10. Not sure where to begin? Start with our bestsellers, and reply anytime.\n\n— Team ${b}`,
      variants: [
        { label: 'A · Story-led', type: 'text', angle: `Opens on the ${b} origin story, then the welcome offer — builds brand affinity first.`, score: { strategy: 90, copy: 88, density: 80, divergence: 72, overall: 88 } },
        { label: 'B · Offer-led', type: 'text', angle: 'Leads with WELCOME10 and bestsellers — highest first-order conversion for deal-seekers.', score: { strategy: 86, copy: 82, density: 78, divergence: 80 } },
        { label: 'C · Hero-image', type: 'image', angle: 'Full-bleed hero product image + one-line promise and CTA — for visual-first mobile readers.', score: { strategy: 84, copy: 80, density: 86, divergence: 85 } },
      ],
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
    smartBrain: {
      horizon: '90-day rolling',
      loop: [
        { step: 'Analyze', detail: 'Recompute RFM segments, cohorts and cross-sell affinity from the latest data.' },
        { step: 'Plan', detail: 'Generate the segment- and seasonality-aware send calendar with cadence guards.' },
        { step: 'Prebuild', detail: 'Pre-draft each send’s mailer variants so nothing starts from a blank page.' },
        { step: 'Review', detail: 'Human-approve the plan; every variant is quality-scored before it ships.' },
        { step: 'Approve', detail: 'Release the winning variant, then feed performance back into the next cycle.' },
      ],
      note: 'A convergent daily loop over a rolling horizon, with human-in-the-loop approval and confidence tracking.',
    },
    guardrails: [
      { rule: 'Discount cap', detail: 'Offers capped (≤15%) against a real code registry; per-cohort offer depth enforced.' },
      { rule: 'Progressive suppression', detail: 'Cadence guards per segment so the program never over-mails.' },
      { rule: 'Banned-phrase sanitizer', detail: 'Copy is scrubbed of spam-trigger phrases before send.' },
      { rule: 'Brand lock', detail: 'A fixed palette and typography are baked into every generated mailer.' },
    ],
  };
}

// ── Default demo subject: anchit-tandon.com ──
// The demo markets Anchit Tandon's own candidacy the way you'd grow a high-LTV
// D2C product: the "brand" is the résumé at anchit-tandon.com, the "buy" is a
// senior Product/Growth role, and the "lifecycle" is the job search itself.
// This is deterministic so the default demo is always great and never depends
// on an LLM key. Any other brand still routes through the generic engine.
function isAnchit(brand, url) {
  const s = ((brand || '') + ' ' + (url || '')).toLowerCase();
  return /anchit/.test(s) || /anchit-?tandon/.test(s.replace(/\s+/g, '-'));
}

function anchitPlan() {
  return {
    brand: 'Anchit Tandon',
    industry: {
      category: 'Product & Growth leadership — personal-brand / candidate marketing',
      competitors: [
        'Senior PMs in D2C growth',
        'Growth leads at consumer startups',
        'Product leaders from media & subscription',
        'Ex-founder operators moving into product',
      ],
      benchmarks: [
        { metric: 'Recruiter reply rate (targeted outreach)', value: '8–15%', note: 'Personalised senior-PM outreach vs ~2% for generic applications.' },
        { metric: 'Application → first interview', value: '10–20%', note: 'A clickable portfolio + a warm referral lifts this materially.' },
        { metric: 'First interview → onsite', value: '35–50%', note: 'Won on a clear, quantified growth-impact narrative.' },
        { metric: 'Onsite → offer', value: '20–30%', note: 'Senior roles convert on proof of compounding wins.' },
        { metric: 'Focused search cycle', value: '6–10 weeks', note: 'Funnel-driven search, not spray-and-pray.' },
      ],
    },
    positioning: 'Market Anchit Tandon like a high-LTV product: an engineer who learned to love the funnel, now a Product & Growth leader with compounding, quantified wins — 5× MRR on Assisted Sales (₹15L → ₹80L), ₹3Cr+ incremental ARR from the ET Markets revamp, and D2C growth across US, UK and global markets. The "buy" is a senior Product/Growth role; anchit-tandon.com is the always-on landing page and the job search is the funnel.',
    segments: [
      { name: 'High-growth D2C brands', description: 'Scaling consumer brands that need retention, LTV and lifecycle leadership.', size: 'Primary target' },
      { name: 'Media & subscription businesses', description: 'Where the Times Internet subscription and growth wins map one-to-one.', size: 'Warm fit' },
      { name: 'Seed–Series B startups', description: 'Founders who need a builder-operator across product, growth and revenue.', size: 'High upside' },
      { name: 'Product & growth recruiters', description: 'Specialist recruiters placing senior product and growth talent.', size: 'Amplifiers' },
      { name: 'Warm network / referrals', description: 'Ex-colleagues and peers — the highest-conversion channel.', size: 'Highest intent' },
    ],
    stages: [
      { stage: 'Awareness', goal: 'Get on the radar of the right teams', channels: ['Portfolio', 'LinkedIn', 'Referrals'], campaign: 'Keep anchit-tandon.com as the always-on landing page; ship a weekly growth-teardown post to stay top-of-feed.' },
      { stage: 'Interest', goal: 'Turn a click into a conversation', channels: ['Email', 'LinkedIn DM'], campaign: 'Personalised outreach that leads with one relevant, quantified win per company.' },
      { stage: 'Outreach / Apply', goal: 'Convert interest into a first call', channels: ['Email', 'Referral intro'], campaign: 'Role-tailored one-pager + a deep-link into the matching portfolio case, plus a warm referral ask.' },
      { stage: 'Interview', goal: 'Prove compounding impact', channels: ['Live', 'Portfolio'], campaign: 'Case-led narrative: constraint → experiment → measured outcome, mapped directly to the role.' },
      { stage: 'Offer & Close', goal: 'Land the right offer, not just any offer', channels: ['Email', 'Call'], campaign: 'Compare scope, growth mandate and compounding upside; negotiate on impact, not just title.' },
      { stage: 'Onboard', goal: 'Start compounding from week one', channels: ['30-60-90 plan'], campaign: 'Send a 30-60-90 growth plan before day one to anchor the mandate.' },
    ],
    calendar: [
      { week: 'Week 1', theme: 'Set up the funnel', cadence: 'Foundation — no cold outreach yet', sends: ['Refresh anchit-tandon.com', 'Target-list of 25 companies', 'Growth-teardown post #1'] },
      { week: 'Week 2', theme: 'Warm outreach', cadence: '≤5 personalised touches/day', sends: ['Referral asks (10)', 'Personalised recruiter DMs', 'Growth-teardown post #2'] },
      { week: 'Week 3', theme: 'Direct outreach', cadence: '≤8 touches/day · 1 follow-up max', sends: ['Role-tailored one-pagers', 'Hiring-manager cold emails', 'Follow-up on Week-1 opens'] },
      { week: 'Week 4', theme: 'Interview & nurture', cadence: 'Reactive — reply within 24h', sends: ['Interview prep case studies', 'Same-day thank-you follow-ups', 'Win-back on no-replies'] },
    ],
    analysis: {
      model: 'Candidate funnel model — 5 employer segments scored by fit × intent',
      cohortNote: 'Warm-referral cohort converts ~3× cold outreach to first interview; prioritise the network cohort first, then media/subscription (closest role fit).',
      sendTime: { window: 'Tue–Thu, 8–10am local', note: 'Highest open/reply window for senior recruiter and hiring-manager outreach.' },
      crossSell: ['Product leadership', 'Growth / lifecycle', 'Revenue & monetisation', 'AI-product / automation', '0→1 & 1→n scaling'],
    },
    mailer: {
      theme: 'Proof-led intro: compounding wins → clickable résumé → 20-minute conversation',
      subject: 'Anchit Tandon — Product & Growth leader who ships compounding wins',
      preview: '5× MRR, ₹3Cr+ ARR, D2C growth across US/UK/global — and a portfolio you can click.',
      hero: {
        kicker: 'Product & D2C Growth',
        headline: 'I market myself the way I’d grow a high-LTV brand.',
        subhead: 'An engineer who learned to love the funnel — now leading product and growth with quantified, compounding wins.',
      },
      sections: [
        { title: 'Wins that compound', body: 'Scaled Assisted Sales 5× to ₹80L MRR. Added ₹3Cr+ incremental ARR from the ET Markets revamp. Now driving D2C growth across US, UK and global markets.' },
        { title: 'A résumé you can click', body: 'anchit-tandon.com is an interactive portfolio — a chat clone that answers as me, a talking AI avatar, and live demos I built end-to-end (including this one).' },
        { title: 'What I’m looking for', body: 'A senior Product or Growth role with a real mandate to build compounding systems. If that’s open on your team, let’s talk.' },
      ],
      cta: { label: 'Open anchit-tandon.com', note: 'Or just reply — 20 minutes is all I’m asking.' },
      signoff: 'Anchit Tandon · anchit-tandon.com',
      body: 'Hi there,\n\nI\'m Anchit — an engineer who learned to love the funnel, now leading Product & D2C Growth. I scaled Assisted Sales 5× to ₹80L MRR, added ₹3Cr+ ARR from the ET Markets revamp, and now drive D2C growth across US, UK and global markets. My portfolio, anchit-tandon.com, is an interactive résumé. If you\'re hiring for a senior Product or Growth role, I\'d love 20 minutes.\n\n— Anchit Tandon\nanchit-tandon.com',
      variants: [
        { label: 'A · Proof-led', type: 'text', angle: 'Leads with the three hardest numbers (5× MRR, ₹3Cr+ ARR, US/UK/global) — for data-driven hiring managers.', score: { strategy: 94, copy: 90, density: 88, divergence: 70, overall: 90 } },
        { label: 'B · Referral-led', type: 'text', angle: 'Opens on the shared connection / warm intro, then one proof point — highest reply rate.', score: { strategy: 91, copy: 88, density: 82, divergence: 85 } },
        { label: 'C · Role-fit-led', type: 'image', angle: 'Portrait + a one-glance stat card mapping my wins to the exact role — for visual-first recruiters.', score: { strategy: 88, copy: 84, density: 90, divergence: 88 } },
      ],
    },
    retention: [
      { trigger: 'Outreach opened, no reply (3 days)', flow: 'One-nudge follow-up adding a second, role-specific proof point.' },
      { trigger: 'Applied, no response (7 days)', flow: 'Referral-backed follow-up to the hiring manager via a warm intro.' },
      { trigger: 'Post-interview', flow: 'Same-day thank-you + a tailored mini-case answering their hardest question.' },
      { trigger: 'No fit right now', flow: 'Gracious "keep in touch" + add to a quarterly value-add nurture.' },
      { trigger: 'Offer stage', flow: 'Send a 30-60-90 growth plan to de-risk the hire and anchor the mandate.' },
    ],
    kpis: [
      { metric: 'Recruiter / HM replies', target: '12%+ of outreach' },
      { metric: 'First interviews booked', target: '8–10 in 6 weeks' },
      { metric: 'Onsite conversion', target: '40%+ of first interviews' },
      { metric: 'Quality offers', target: '2–3' },
      { metric: 'anchit-tandon.com → conversation', target: 'CTR up 20%' },
      { metric: 'Search cycle', target: 'Signed in 6–10 weeks' },
    ],
    smartBrain: {
      horizon: '6–10 week rolling search',
      loop: [
        { step: 'Analyze', detail: 'Score the target list by fit × intent; refresh from new openings daily.' },
        { step: 'Plan', detail: 'Sequence outreach by cohort — warm network first, then closest role fit.' },
        { step: 'Prebuild', detail: 'Pre-draft the role-tailored one-pager and email variants before each send window.' },
        { step: 'Review', detail: 'Human-approve every message; quality-score each variant before it ships.' },
        { step: 'Approve', detail: 'Send the winning variant, log the outcome, and feed replies back into scoring.' },
      ],
      note: 'A convergent daily loop over a rolling horizon — the same autopilot rhythm applied to a job search instead of a send calendar.',
    },
    guardrails: [
      { rule: 'Personalisation required', detail: 'No message ships without one company- or role-specific proof point — never a mass blast.' },
      { rule: 'Cadence cap', detail: 'One follow-up per contact max; progressive suppression once someone replies or declines.' },
      { rule: 'Honest claims only', detail: 'Every metric is real and verifiable on anchit-tandon.com — no inflated numbers.' },
      { rule: 'Tone lock', detail: 'Warm, specific, first-person; no buzzword filler or generic recruiter-speak.' },
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

  res.setHeader('Cache-Control', 'no-store');

  // Default demo subject: anchit-tandon.com. Empty input or any Anchit-matching
  // brand/url returns the deterministic career-growth plan — always available,
  // no LLM key required.
  if ((!brand && !url) || isAnchit(brand, url)) {
    return res.status(200).json({ plan: anchitPlan(), source: 'anchit' });
  }

  if (!brand && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'brand_or_url_required' });
  const label = brand || url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

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
module.exports._test = { normalize, parsePlan, templatePlan, buildPrompt, anchitPlan, isAnchit };
