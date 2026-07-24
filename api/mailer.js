// /api/mailer — Universal Mailer Architect engine.
//
//   POST /api/mailer  → { variants:[{label,type,subject,preview,html,score}], source, kind }
//
// Turns a brief into multiple designed, ready-to-send HTML email variants, each
// quality-scored. UNIVERSAL, complete-coverage: works for ANY context a mailer
// could exist for — a company or D2C brand, a product or item, a school or
// college (admissions, announcements, events), an office/team (internal memos,
// updates), a task or submission reminder (deadlines), an event invite, a
// nonprofit appeal, or personal outreach. It infers the CONTEXT KIND from the
// inputs and adopts the right tone + structure for that kind — it never assumes
// e-commerce. Defaults to anchit-tandon.com (a "hire me" outreach mailer) when
// no brand/context is given. Uses a free multi-provider LLM cascade for the
// copy, with a deterministic fallback that ALWAYS returns fully designed HTML —
// no key required. No proprietary data, no brand-specific hardcoding.

function geminiKey() {
  const e = process.env;
  return (e.GEMINI_API_KEY || e.Gemini_API_Key || e.GEMINI_KEY || e.GOOGLE_API_KEY || e.GOOGLE_GENAI_API_KEY || '').trim();
}
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'llama-3.3-70b';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

function haveAnyProvider() {
  return !!(process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY || geminiKey() || process.env.OPENROUTER_API_KEY);
}
async function fetchTO(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 18000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); }
  finally { clearTimeout(t); }
}
async function oaiChat(url, key, model, prompt, jsonMode, extraHeaders) {
  const body = { model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096 };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const r = await fetchTO(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', Authorization: 'Bearer ' + key }, extraHeaders || {}), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('http_' + r.status);
  const d = await r.json();
  return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
}
async function geminiGen(key, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  const opts = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } }) };
  const r = await fetchTO(url, opts);
  if (!r.ok) throw new Error('http_' + r.status);
  const d = await r.json();
  const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  return parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('').trim();
}
async function generateCopy(prompt) {
  const providers = [];
  if (process.env.GROQ_API_KEY) providers.push(() => oaiChat('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, GROQ_MODEL, prompt, true));
  if (process.env.CEREBRAS_API_KEY) providers.push(() => oaiChat('https://api.cerebras.ai/v1/chat/completions', process.env.CEREBRAS_API_KEY, CEREBRAS_MODEL, prompt, true));
  const gk = geminiKey();
  if (gk) providers.push(() => geminiGen(gk, prompt));
  if (process.env.OPENROUTER_API_KEY) providers.push(() => oaiChat('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL, prompt, false, { 'HTTP-Referer': 'https://anchit-tandon.com/lifecycle-os', 'X-Title': 'Lifecycle OS Mailer Studio' }));
  for (const run of providers) {
    try { const parsed = parseCopy(await run()); if (parsed) return parsed; } catch (e) { /* next */ }
  }
  return null;
}
function parseCopy(text) {
  if (!text) return null;
  let t = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a === -1 || b === -1) return null;
  try { const o = JSON.parse(t.slice(a, b + 1)); return o && Array.isArray(o.variants) ? o : null; } catch (e) { return null; }
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function str(x, n) { return String(x == null ? '' : x).slice(0, n || 400); }
function isAnchit(brand, url) {
  const s = ((brand || '') + ' ' + (url || '')).toLowerCase();
  return /anchit/.test(s.replace(/\s+/g, '-'));
}

// ── Brand palette: a neutral, professional email palette (brand-agnostic). ──
const PAL = { bg: '#f4f1ea', card: '#ffffff', ink: '#1a1714', dim: '#6b655c', rule: '#e6dfd0', primary: '#c9a96e', primaryDeep: '#a8863f', dark: '#17130e' };

// Render one designed, table-based, inline-styled HTML email from a content block.
function renderEmail(brand, c) {
  const btn = c.cta ? `<tr><td style="padding:6px 32px 30px"><a href="#" style="display:inline-block;background:${PAL.dark};color:#fff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:.02em;padding:14px 30px;border-radius:8px">${esc(c.cta)}</a>${c.ctaNote ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${PAL.dim};margin-top:12px">${esc(c.ctaNote)}</div>` : ''}</td></tr>` : '';
  const blocks = (c.sections || []).map((s) => `<tr><td style="padding:0 32px 18px"><div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:bold;color:${PAL.ink};margin-bottom:6px">${esc(s.title)}</div><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:${PAL.dim}">${esc(s.body)}</div></td></tr>`).join('');
  const heroImg = c.type === 'image'
    ? `<tr><td style="padding:0"><div style="height:160px;background:linear-gradient(120deg,${PAL.primary},${PAL.primaryDeep});display:block"></div></td></tr>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:${PAL.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAL.bg};padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${PAL.card};border:1px solid ${PAL.rule};border-radius:14px;overflow:hidden">
<tr><td style="background:${PAL.dark};padding:16px 32px"><span style="font-family:Georgia,serif;font-size:18px;font-weight:bold;color:#fff;letter-spacing:.02em">${esc(brand)}</span></td></tr>
${heroImg}
<tr><td style="padding:28px 32px 8px"><div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${PAL.primaryDeep};margin-bottom:10px">${esc(c.kicker || '')}</div><div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;font-weight:bold;color:${PAL.ink}">${esc(c.headline)}</div>${c.subhead ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${PAL.dim};margin-top:10px">${esc(c.subhead)}</div>` : ''}</td></tr>
<tr><td style="padding:20px 0 0"></td></tr>
${blocks}
${btn}
<tr><td style="border-top:1px solid ${PAL.rule};padding:16px 32px"><div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${PAL.dim}">${esc(c.signoff || brand)} · You're receiving this because you opted in. Unsubscribe anytime.</div></td></tr>
</table></td></tr></table></body></html>`;
}

// Quality score (0-100) from simple, honest heuristics over the variant content.
function scoreVariant(c) {
  const words = ((c.headline || '') + ' ' + (c.sections || []).map((s) => s.body).join(' ')).split(/\s+/).filter(Boolean).length;
  const density = Math.max(40, Math.min(100, Math.round((words / 90) * 100)));
  const copy = Math.max(50, Math.min(100, 70 + (c.headline ? 10 : 0) + (c.subhead ? 8 : 0) + ((c.sections || []).length >= 2 ? 12 : 0)));
  const strategy = Math.max(55, Math.min(100, 72 + (c.cta ? 14 : 0) + (c.kicker ? 6 : 0)));
  const divergence = c._divergence || 75;
  const overall = Math.round((strategy + copy + density + divergence) / 4);
  return { strategy, copy, density, divergence, overall };
}

// ── Deterministic content — always available, brand-aware, 3 variants. ──
function anchitVariants() {
  return [
    { label: 'A · Proof-led', type: 'text', _divergence: 70, kicker: 'Product & D2C Growth', headline: 'I market myself the way I’d grow a high-LTV brand.', subhead: 'An engineer who learned to love the funnel — now leading product and growth with quantified, compounding wins.',
      sections: [ { title: 'Wins that compound', body: 'Scaled Assisted Sales 5× to ₹80L MRR. Added ₹3Cr+ incremental ARR from the ET Markets revamp. Now driving D2C growth across US, UK and global markets.' }, { title: 'A résumé you can click', body: 'anchit-tandon.com is an interactive portfolio — a chat clone, a talking AI avatar, and live demos I built end-to-end.' } ],
      cta: 'Open anchit-tandon.com', ctaNote: 'Or just reply — 20 minutes is all I’m asking.', signoff: 'Anchit Tandon' },
    { label: 'B · Referral-led', type: 'text', _divergence: 85, kicker: 'A quick intro', headline: 'We share a connection — and I think I can help your team.', subhead: 'A Product & Growth leader with proof, not promises.',
      sections: [ { title: 'Why me, why now', body: 'I turn retention and lifecycle into compounding revenue. Recent: 5× MRR on Assisted Sales, ₹3Cr+ ARR from a platform revamp, D2C growth across three markets.' }, { title: 'The ask', body: 'If you’re hiring for a senior Product or Growth role, a 20-minute call is the fastest way to see the fit.' } ],
      cta: 'Grab 20 minutes', ctaNote: 'Portfolio: anchit-tandon.com', signoff: 'Anchit Tandon' },
    { label: 'C · Role-fit (image)', type: 'image', _divergence: 88, kicker: 'Senior Product / Growth', headline: 'The impact you’re hiring for — mapped to what I’ve shipped.', subhead: 'One glance: the wins, the mandate, the fit.',
      sections: [ { title: 'At a glance', body: '5× MRR · ₹3Cr+ ARR · US/UK/global D2C growth · an engineer-turned-operator who builds compounding systems.' }, { title: 'See it live', body: 'anchit-tandon.com is the interactive proof — built end-to-end, including a lifecycle OS demo.' } ],
      cta: 'See the portfolio', ctaNote: 'Reply here to start a conversation.', signoff: 'Anchit Tandon' },
  ];
}
function brandVariants(brand, brief) {
  const b = brand || 'Your brand';
  const angle = brief ? ` ${brief}` : '';
  return [
    { label: 'A · Story-led', type: 'text', _divergence: 72, kicker: 'Welcome', headline: `Welcome to ${b}.`, subhead: 'We build for people who care about the details — and you’ll feel it from the first order.',
      sections: [ { title: 'Where it started', body: `${b} exists because good products deserve a story worth telling.${angle}` }, { title: 'Here’s 10% to begin', body: 'Use WELCOME10 at checkout. Reply anytime — a real human reads every message.' } ],
      cta: 'Shop bestsellers', ctaNote: 'Free returns, always.', signoff: `Team ${b}` },
    { label: 'B · Offer-led', type: 'text', _divergence: 80, kicker: 'A little something', headline: `Your ${b} welcome gift is inside.`, subhead: '10% off your first order — because a great first impression matters.',
      sections: [ { title: 'Start with the favourites', body: `Our bestsellers are loved for a reason.${angle}` }, { title: 'No pressure', body: 'Take your time, and reply if you want a recommendation.' } ],
      cta: 'Claim WELCOME10', ctaNote: 'Ends in 7 days.', signoff: `Team ${b}` },
    { label: 'C · Hero (image)', type: 'image', _divergence: 86, kicker: 'New here?', headline: `${b}, made for you.`, subhead: 'One promise, one click.',
      sections: [ { title: 'The one-liner', body: `Everything ${b} makes, in one place — start with what everyone loves.${angle}` } ],
      cta: 'Explore now', ctaNote: 'Free to reply — we read every one.', signoff: `Team ${b}` },
  ];
}

// ── Universal context detection ─────────────────────────────────────────────
// Infer what KIND of mailer this is from the free-text inputs, so the engine
// covers any use case — not just commerce.
const KINDS = {
  commerce: { label: 'Commerce / D2C', hints: ['shop','store','brand','product','buy','cart','checkout','sale','discount','sku','catalog','order','ecommerce','e-commerce','d2c','retail','collection','launch','coupon'] },
  school: { label: 'School / K-12', hints: ['school','pta','parent','student','pupil','classroom','principal','teacher','term','semester','admission','enrol','enroll','holiday','field trip','report card','grade'] },
  college: { label: 'College / University', hints: ['college','university','campus','faculty','department','undergraduate','graduate','alumni','semester','course','lecture','scholarship','fest','placement','convocation','admission'] },
  office: { label: 'Office / Internal', hints: ['office','team','company update','all-hands','internal','employee','staff','hr','memo','policy','onboarding','townhall','town hall','meeting','manager','department','colleague'] },
  event: { label: 'Event / Invite', hints: ['event','invite','invitation','rsvp','conference','webinar','workshop','meetup','summit','gala','ceremony','session','register','ticket','agenda','keynote'] },
  reminder: { label: 'Task / Submission / Deadline', hints: ['reminder','deadline','due','submit','submission','assignment','form','application','renew','renewal','payment due','overdue','last date','pending','complete','fill'] },
  nonprofit: { label: 'Nonprofit / Fundraising', hints: ['donate','donation','fundraiser','fundraising','charity','ngo','nonprofit','non-profit','cause','volunteer','pledge','give','campaign for','relief'] },
};
function detectKind(brand, brief, segment, offer) {
  const hay = [brand, brief, segment, offer].filter(Boolean).join(' ').toLowerCase();
  if (!hay.trim()) return 'generic';
  let best = 'generic', bestScore = 0;
  for (const [kind, def] of Object.entries(KINDS)) {
    let s = 0;
    for (const h of def.hints) { if (hay.includes(h)) s += h.length; }
    if (s > bestScore) { bestScore = s; best = kind; }
  }
  return bestScore > 0 ? best : 'generic';
}
function kindLabel(kind) { return (KINDS[kind] && KINDS[kind].label) || 'General'; }

// ── Universal deterministic templates (one set per context kind) ────────────
// Every kind returns 3 send-ready, genuinely different-angle variants. Nothing
// here is brand-specific; the sender label + brief are interpolated.
function universalVariants(label, brief, segment, offer, kind) {
  const b = label || 'Your organisation';
  const angle = brief ? ` ${brief}` : '';
  const who = segment ? segment : 'everyone on this list';
  const detail = offer || '';
  switch (kind) {
    case 'commerce':
      return brandVariants(b, brief);
    case 'school':
    case 'college': {
      const inst = b; const isCol = kind === 'college';
      return [
        { label: 'A · Warm announcement', type: 'text', _divergence: 74, kicker: isCol ? 'From the campus' : 'A note home', headline: `An update from ${inst}.`, subhead: `For ${who} — here’s what’s happening and what to do next.`,
          sections: [ { title: 'What’s new', body: `${brief ? brief : `A quick update from ${inst}.`}${detail ? ' ' + detail : ''}` }, { title: 'What we need from you', body: isCol ? 'Read through, note any dates, and reach the department if you have questions.' : 'Please read this with your child and reply if you have any questions.' } ],
          cta: 'Read the details', ctaNote: 'Questions? Just reply to this email.', signoff: inst },
        { label: 'B · Dates & logistics', type: 'text', _divergence: 82, kicker: 'Key dates', headline: `${inst}: important dates and next steps.`, subhead: 'Everything you need to stay on track, in one place.',
          sections: [ { title: 'Mark your calendar', body: detail ? detail : 'Key dates and deadlines are listed below — add them to your calendar now.' }, { title: 'How to prepare', body: `${angle ? angle.trim() : 'A short checklist follows so nothing gets missed.'}` } ],
          cta: 'View the full schedule', ctaNote: 'Save this email for reference.', signoff: `${inst} · Administration` },
        { label: 'C · Highlight (image)', type: 'image', _divergence: 86, kicker: isCol ? 'Campus life' : 'Our community', headline: `${inst}, together.`, subhead: 'One update, one click.',
          sections: [ { title: 'In brief', body: `${brief ? brief : `The latest from ${inst}.`}${detail ? ' ' + detail : ''}` } ],
          cta: 'See more', ctaNote: 'We read every reply.', signoff: inst },
      ];
    }
    case 'office':
      return [
        { label: 'A · Team update', type: 'text', _divergence: 72, kicker: 'Internal', headline: `Update from ${b}.`, subhead: `For ${who} — a quick, no-fluff summary.`,
          sections: [ { title: 'What’s changing', body: `${brief ? brief : 'Here’s the latest for the team.'}${detail ? ' ' + detail : ''}` }, { title: 'What you need to do', body: 'Action items are below. If none apply to you, no action needed.' } ],
          cta: 'Read the full memo', ctaNote: 'Reply with questions anytime.', signoff: `${b} · Team` },
        { label: 'B · Action required', type: 'text', _divergence: 84, kicker: 'Action needed', headline: `A quick action for ${who}.`, subhead: detail ? detail : 'Two minutes now saves a follow-up later.',
          sections: [ { title: 'The ask', body: `${brief ? brief : 'Please complete the step below.'}` }, { title: 'By when', body: detail ? detail : 'As soon as you can — ideally this week.' } ],
          cta: 'Take action', ctaNote: 'Done already? Ignore this.', signoff: `${b}` },
        { label: 'C · Highlight (image)', type: 'image', _divergence: 80, kicker: 'All hands', headline: `${b}: what matters this week.`, subhead: 'The short version, up top.',
          sections: [ { title: 'TL;DR', body: `${brief ? brief : 'The week in one line.'}${detail ? ' ' + detail : ''}` } ],
          cta: 'Open the update', ctaNote: 'Full notes inside.', signoff: `${b}` },
      ];
    case 'event':
      return [
        { label: 'A · Warm invite', type: 'text', _divergence: 76, kicker: 'You’re invited', headline: `${b} would love to see you there.`, subhead: detail ? detail : 'Save the date — details inside.',
          sections: [ { title: 'What & why', body: `${brief ? brief : `Join ${b} for something worth your time.`}` }, { title: 'The essentials', body: detail ? detail : 'Date, time and place are below. Add it to your calendar.' } ],
          cta: 'RSVP now', ctaNote: 'Seats are limited.', signoff: `${b}` },
        { label: 'B · Logistics-first', type: 'text', _divergence: 82, kicker: 'Event details', headline: `Everything you need for ${b}.`, subhead: 'Where, when, and how to join — in one place.',
          sections: [ { title: 'The details', body: detail ? detail : 'Date, time, venue and agenda are listed below.' }, { title: 'Before you come', body: `${angle ? angle.trim() : 'A short note on what to bring or expect.'}` } ],
          cta: 'Reserve my spot', ctaNote: 'Confirm by replying if you prefer.', signoff: `${b}` },
        { label: 'C · Don’t-miss (image)', type: 'image', _divergence: 88, kicker: 'Almost full', headline: `A few spots left for ${b}.`, subhead: 'One click to hold yours.',
          sections: [ { title: 'Why go', body: `${brief ? brief : 'The one you’ll be glad you didn’t skip.'}${detail ? ' ' + detail : ''}` } ],
          cta: 'Grab a seat', ctaNote: 'First come, first served.', signoff: `${b}` },
      ];
    case 'reminder':
      return [
        { label: 'A · Friendly nudge', type: 'text', _divergence: 74, kicker: 'Quick reminder', headline: `A gentle nudge from ${b}.`, subhead: detail ? detail : 'This one’s quick — and easy to finish now.',
          sections: [ { title: 'What’s pending', body: `${brief ? brief : 'You have one step left to complete.'}` }, { title: 'How to finish', body: 'Tap the button below and you’re done in a couple of minutes.' } ],
          cta: 'Complete it now', ctaNote: 'Already done? Thank you — ignore this.', signoff: `${b}` },
        { label: 'B · Firm deadline', type: 'text', _divergence: 86, kicker: 'Deadline', headline: `Action needed before the deadline.`, subhead: detail ? detail : 'Please complete this before the due date.',
          sections: [ { title: 'What’s due', body: `${brief ? brief : 'Your submission is still pending.'}` }, { title: 'By when', body: detail ? detail : 'The deadline is approaching — please don’t leave it to the last day.' } ],
          cta: 'Submit now', ctaNote: 'Late submissions may not be accepted.', signoff: `${b}` },
        { label: 'C · Help-and-consequences (image)', type: 'image', _divergence: 84, kicker: 'Last call', headline: `Final reminder from ${b}.`, subhead: 'A little help so nothing slips.',
          sections: [ { title: 'If you’re stuck', body: `${brief ? brief : 'Reply to this email and we’ll help you finish.'}${detail ? ' ' + detail : ''}` } ],
          cta: 'Finish or ask for help', ctaNote: 'We’re here if you need us.', signoff: `${b}` },
      ];
    case 'nonprofit':
      return [
        { label: 'A · Story-led', type: 'text', _divergence: 78, kicker: 'Your impact', headline: `With you, ${b} can do more.`, subhead: detail ? detail : 'A small gift goes a long way here.',
          sections: [ { title: 'The story', body: `${brief ? brief : `Here’s what your support makes possible at ${b}.`}` }, { title: 'How to help', body: 'Every contribution counts — and it takes under a minute.' } ],
          cta: 'Donate now', ctaNote: 'Every amount helps.', signoff: `${b}` },
        { label: 'B · Specific ask', type: 'text', _divergence: 84, kicker: 'A clear goal', headline: `Help ${b} reach the goal.`, subhead: detail ? detail : 'A concrete target, and exactly what it funds.',
          sections: [ { title: 'What we’re raising for', body: `${brief ? brief : 'Your gift funds the work below.'}` }, { title: 'Where it goes', body: detail ? detail : '100% of what you give goes to the cause.' } ],
          cta: 'Give today', ctaNote: 'Cancel a recurring gift anytime.', signoff: `${b}` },
        { label: 'C · Community (image)', type: 'image', _divergence: 82, kicker: 'Together', headline: `${b}: powered by people like you.`, subhead: 'One click to be part of it.',
          sections: [ { title: 'Join in', body: `${brief ? brief : 'Add your support to the movement.'}${detail ? ' ' + detail : ''}` } ],
          cta: 'Support the cause', ctaNote: 'Volunteer options inside too.', signoff: `${b}` },
      ];
    default: // generic — any organisation / announcement
      return [
        { label: 'A · Clear & direct', type: 'text', _divergence: 72, kicker: 'A note from', headline: `A message from ${b}.`, subhead: `For ${who} — the short version first.`,
          sections: [ { title: 'What this is', body: `${brief ? brief : `An update from ${b}.`}${detail ? ' ' + detail : ''}` }, { title: 'What to do', body: 'If it’s relevant to you, the next step is below.' } ],
          cta: 'Read more', ctaNote: 'Reply anytime — a real person reads it.', signoff: `${b}` },
        { label: 'B · Detail-led', type: 'text', _divergence: 80, kicker: 'The details', headline: `${b}: everything in one place.`, subhead: 'No hunting around — it’s all here.',
          sections: [ { title: 'The essentials', body: detail ? detail : (brief || 'Key details are listed below.') }, { title: 'Next steps', body: `${angle ? angle.trim() : 'A short list of what to do next.'}` } ],
          cta: 'See the details', ctaNote: 'Save this for reference.', signoff: `${b}` },
        { label: 'C · Highlight (image)', type: 'image', _divergence: 84, kicker: 'In brief', headline: `${b}, in one glance.`, subhead: 'One click for the rest.',
          sections: [ { title: 'TL;DR', body: `${brief ? brief : `The latest from ${b}.`}${detail ? ' ' + detail : ''}` } ],
          cta: 'Open it', ctaNote: 'We read every reply.', signoff: `${b}` },
      ];
  }
}

function buildPrompt(brand, brief, segment, offer, kind) {
  const kindLine = kind && kind !== 'generic'
    ? `DETECTED CONTEXT: ${kindLabel(kind)} — write for this kind of audience and purpose, NOT a generic sales email.`
    : 'DETECTED CONTEXT: general — infer the right purpose and tone from the brief.';
  return `You are a UNIVERSAL Mailer Architect. You can write a send-ready HTML email for ANY context — a company or D2C brand, a product or item, a school or college (admissions, announcements, events, results), an office or team (internal memos, updates, all-hands), a task/submission/deadline reminder, an event invitation, a nonprofit appeal, or personal outreach. Never assume e-commerce unless the context clearly is commerce.

CONTEXT / SENDER: ${brand}
${kindLine}
${brief ? 'BRIEF: ' + brief : ''}
${segment ? 'AUDIENCE: ' + segment : ''}
${offer ? 'OFFER / KEY DETAIL / DEADLINE: ' + offer : ''}

Write 3 DISTINCT, genuinely different-angle variants appropriate to the context (for commerce: story/offer/hero; for a reminder: friendly nudge / firm deadline / consequences-and-help; for an event: warm invite / logistics-first / FOMO; adapt sensibly for schools, colleges, offices, nonprofits). Each must be a real, send-ready email. The CTA must match the purpose (e.g. "Submit your form", "RSVP now", "Read the update", "Donate", "Shop the collection").

Return ONLY JSON (no fences): {"variants":[{"label":string (e.g. "A · Warm invite"),"type":"text"|"image","kicker":string,"headline":string,"subhead":string,"sections":[{"title":string,"body":string}],"cta":string,"ctaNote":string,"signoff":string}]}  — exactly 3 variants. Keep copy tight and specific; no em-dashes in the copy body.`;
}

function normalizeVariants(brand, variants) {
  return (variants || []).slice(0, 4).map((v) => {
    const c = {
      label: str(v.label, 40), type: /image/i.test(v.type) ? 'image' : 'text',
      kicker: str(v.kicker, 40), headline: str(v.headline, 140), subhead: str(v.subhead, 220),
      sections: (Array.isArray(v.sections) ? v.sections : []).slice(0, 3).map((s) => ({ title: str(s.title, 60), body: str(s.body, 340) })),
      cta: str(v.cta, 40), ctaNote: str(v.ctaNote, 120), signoff: str(v.signoff, 80), _divergence: v._divergence || 78,
    };
    return { label: c.label, type: c.type, subject: c.headline, preview: c.subhead, html: renderEmail(brand, c), score: scoreVariant(c) };
  });
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  res.setHeader('Cache-Control', 'no-store');

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const brand = (body.brand || '').toString().slice(0, 80).trim();
  const url = (body.url || '').toString().slice(0, 300).trim();
  const brief = (body.brief || '').toString().slice(0, 600).trim();
  const segment = (body.segment || '').toString().slice(0, 120).trim();
  const offer = (body.offer || '').toString().slice(0, 120).trim();
  const anchit = isAnchit(brand, url) || (!brand && !url && !brief && !segment && !offer);
  const label = anchit ? 'Anchit Tandon' : (brand || url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'Your organisation');
  // Detect the CONTEXT KIND so both the AI prompt and the deterministic
  // fallback produce the right kind of mailer (not a generic sales email).
  const kind = anchit ? 'commerce' : detectKind(brand, brief, segment, offer);

  // Try the LLM cascade for tailored copy; always fall back to deterministic.
  try {
    if (haveAnyProvider()) {
      const parsed = await generateCopy(buildPrompt(label, brief, segment, offer, kind));
      if (parsed && parsed.variants && parsed.variants.length) {
        return res.status(200).json({ brand: label, kind, variants: normalizeVariants(label, parsed.variants), source: 'ai' });
      }
    }
  } catch (e) { /* fall through */ }

  const det = anchit ? anchitVariants() : universalVariants(label, brief, segment, offer, kind);
  return res.status(200).json({ brand: label, kind, variants: normalizeVariants(label, det), source: anchit ? 'anchit' : 'template' });
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 30 };
module.exports._test = { renderEmail, scoreVariant, anchitVariants, brandVariants, universalVariants, detectKind, normalizeVariants, isAnchit };
