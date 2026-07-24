// /api/analysis — Lifecycle OS · Data Analysis engine.
//
//   POST /api/analysis  → { brand, industry, segments, cohorts, sendHeat, crossSell, kpis, source }
//
// The analytical layer of the OS: RFM-style segments, cohort-retention curves,
// a send-time heatmap and cross-sell affinity — benchmarked to the subject's
// industry (synthetic / industry-standard, NOT proprietary data). Brand-agnostic;
// defaults to anchit-tandon.com (a candidate-funnel analytics view). Deterministic
// so it always returns a full dashboard with no key. No Vahdam / tea / coffee.

function isAnchit(brand, url) {
  const s = ((brand || '') + ' ' + (url || '')).toLowerCase();
  return /anchit/.test(s.replace(/\s+/g, '-'));
}

// Anchit default: the job-search funnel rendered as analytics.
function anchitAnalysis() {
  return {
    brand: 'Anchit Tandon',
    industry: 'Senior Product & Growth — candidate funnel',
    segments: [
      { name: 'Warm network / referrals', pct: 12, r: 5, f: 4, m: 5, note: 'Highest intent — converts ~3× cold.' },
      { name: 'High-growth D2C brands', pct: 28, r: 4, f: 3, m: 5, note: 'Primary target; best role fit.' },
      { name: 'Media & subscription', pct: 22, r: 4, f: 3, m: 4, note: 'Times Internet wins map 1:1.' },
      { name: 'Seed–Series B startups', pct: 20, r: 3, f: 2, m: 4, note: 'High upside, builder-operator fit.' },
      { name: 'Specialist recruiters', pct: 14, r: 3, f: 4, m: 3, note: 'Amplifiers — one intro, many roles.' },
      { name: 'Cold inbound', pct: 4, r: 2, f: 1, m: 2, note: 'Lowest intent; nurture only.' },
    ],
    cohorts: [
      { label: 'Referral cohort', points: [100, 62, 41, 30, 24, 20] },
      { label: 'Cold-outreach cohort', points: [100, 22, 12, 8, 6, 5] },
    ],
    cohortAxis: ['Outreach', 'Reply', '1st call', 'Onsite', 'Final', 'Offer'],
    sendHeat: {
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      parts: ['8–10a', '10–12p', '12–3p', '3–6p'],
      grid: [ [70, 62, 40, 45], [92, 88, 55, 60], [90, 85, 52, 58], [88, 90, 54, 62], [64, 60, 42, 38] ],
      best: 'Tue–Thu, 8–10am local',
    },
    crossSell: [
      { pair: 'Product leadership × Growth', affinity: 92 },
      { pair: 'Lifecycle / retention × Revenue', affinity: 88 },
      { pair: 'AI-product × Automation', affinity: 84 },
      { pair: '0→1 build × 1→n scale', affinity: 80 },
    ],
    kpis: [
      { metric: 'Reply rate', value: '12%+' }, { metric: 'Onsite conversion', value: '40%+' },
      { metric: 'Offers target', value: '2–3' }, { metric: 'Search cycle', value: '6–10 wks' },
    ],
    source: 'anchit',
  };
}

// Generic brand: industry-benchmarked synthetic RFM analytics.
function brandAnalysis(brand, category) {
  const b = brand || 'Your brand';
  const cat = category || 'D2C';
  return {
    brand: b,
    industry: cat === 'D2C' ? 'Direct-to-consumer (industry benchmarks)' : cat + ' (industry benchmarks)',
    segments: [
      { name: 'First-time buyers', pct: 35, r: 4, f: 1, m: 2, note: 'Highest churn risk in first 30 days.' },
      { name: 'Repeat / loyal', pct: 18, r: 4, f: 4, m: 4, note: 'Buys on cadence — protect & reward.' },
      { name: 'VIP / high-LTV', pct: 5, r: 5, f: 5, m: 5, note: 'Top 5% by spend; concierge touches.' },
      { name: 'At-risk / lapsing', pct: 22, r: 2, f: 3, m: 3, note: 'No purchase in 60–90 days.' },
      { name: 'Browsers / no purchase', pct: 20, r: 3, f: 1, m: 1, note: 'Engaged but never converted.' },
    ],
    cohorts: [
      { label: 'With lifecycle program', points: [100, 46, 34, 28, 25, 23] },
      { label: 'Category baseline', points: [100, 32, 20, 15, 12, 10] },
    ],
    cohortAxis: ['M0', 'M1', 'M2', 'M3', 'M4', 'M5'],
    sendHeat: {
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      parts: ['6–9a', '9–12p', '12–5p', '5–9p'],
      grid: [ [55, 70, 48, 66], [72, 90, 52, 74], [68, 84, 50, 70], [70, 88, 53, 78], [58, 66, 46, 60] ],
      best: 'Tue & Thu, 9–12p (SMS best 5–9p)',
    },
    crossSell: [
      { pair: 'Bestseller × Replenishment kit', affinity: 86 },
      { pair: 'Hero product × Complementary', affinity: 78 },
      { pair: 'First order × Subscription', affinity: 72 },
      { pair: 'Gifting × Seasonal bundle', affinity: 68 },
    ],
    kpis: [
      { metric: 'Email revenue share', value: '25–35%' }, { metric: 'Repeat rate', value: '+8–12 pts' },
      { metric: 'Flow revenue', value: '45%+' }, { metric: '90-day retention', value: '+10 pts' },
    ],
    source: 'template',
  };
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
  const category = (body.category || '').toString().slice(0, 60).trim();
  const anchit = isAnchit(brand, url) || (!brand && !url);
  if (anchit) return res.status(200).json(anchitAnalysis());
  const label = brand || url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return res.status(200).json(brandAnalysis(label, category));
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 30 };
module.exports._test = { anchitAnalysis, brandAnalysis, isAnchit };
