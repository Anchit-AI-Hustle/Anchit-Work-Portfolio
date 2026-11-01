// Builds the résumé as a Word file, in one of two versions:
//
//   node scripts/build-resume.js out.docx hire        -> assets/resume.pdf
//   node scripts/build-resume.js out.docx freelance   -> assets/anchit-tandon-freelance-resume.pdf
//
// Then export each to PDF: soffice --headless --convert-to pdf out.docx
// The freelance .docx is also kept at assets/anchit-tandon-freelance-resume.docx.
//
// Every claim must match wording already on the site or in the owner's own
// 20-products posts. **double asterisks** in a string set that text in bold,
// which is how the numbers are made to stand out.
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, ExternalHyperlink, AlignmentType, LevelFormat,
  TabStopType, BorderStyle, Footer, PageNumber, Table, TableRow, TableCell, WidthType,
  ShadingType, VerticalAlign } = require('docx');

const OUT = process.argv[2] || 'resume.docx';
const VARIANT = (process.argv[3] || 'hire').toLowerCase();
const HIRE = VARIANT !== 'freelance';

const FONT = 'Calibri', INK = '161312', DIM = '5A554E', GOLD = '8A6D2F', BAND = 'F6F1E7';
const PAGE_W = 12240, MARGIN = 979;                 // US Letter, 0.68" margins
const RIGHT = PAGE_W - MARGIN * 2;                  // right tab stop at the text edge

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 20, bold: o.bold, italics: o.italics, color: o.color || INK });
// "**x**" -> bold runs; numbers are what a reader scans for first.
const rich = (text, o = {}) => text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
  /^\*\*.*\*\*$/.test(part) ? run(part.slice(2, -2), { ...o, bold: true }) : run(part, o));
const link = (text, url) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, font: FONT, size: 19, color: DIM })] });

const section = (title) => new Paragraph({
  spacing: { before: 190, after: 70 }, keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 2 } },
  children: [new TextRun({ text: title.toUpperCase(), font: FONT, size: 21, bold: true, color: INK, characterSpacing: 30 })],
});
// "Company, Role ............ Dates" with the dates right-aligned.
const role = (left, dates, o = {}) => new Paragraph({
  spacing: { before: o.first ? 40 : 100, after: 20 }, keepNext: true,
  tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
  children: [run(left, { bold: true, size: 21 }), run('\t' + dates, { size: 19, color: DIM })],
});
const sub = (left, dates) => new Paragraph({
  spacing: { before: 0, after: 20 }, keepNext: true,
  tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
  children: [run(left, { italics: true, size: 20 }), run('\t' + dates, { size: 19, color: DIM })],
});
const group = (t) => new Paragraph({ spacing: { before: 60, after: 20 }, keepNext: true, children: [run(t, { bold: true, size: 19, color: GOLD })] });
const bullet = (t) => new Paragraph({ numbering: { reference: 'dot', level: 0 }, spacing: { before: 0, after: 30, line: 259 }, children: rich(t) });
const proofBullet = (t, proof) => new Paragraph({ numbering: { reference: 'dot', level: 0 }, spacing: { before: 0, after: 40, line: 259 },
  children: [...rich(t + ' '), run('Proof: ', { bold: true, color: GOLD }), ...rich(proof)] });
const para = (children, o = {}) => new Paragraph({ spacing: { before: 0, after: o.after || 40, line: 259 }, children });
// One product per line: name and link on the heading row, what it does below.
const product = (name, url, text, first) => [
  new Paragraph({ spacing: { before: first ? 30 : 50, after: 0 }, keepNext: true,
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
    children: [run(name, { bold: true, size: 20 }), run('\t' + url, { size: 18, color: DIM })] }),
  new Paragraph({ spacing: { before: 0, after: 20, line: 259 }, indent: { left: 0 }, children: Array.isArray(text)
    ? [run('Need: ', { bold: true, size: 19, color: GOLD }), ...rich(text[0] + ' ', { size: 19 }), run('How it helps: ', { bold: true, size: 19, color: GOLD }), ...rich(text[1], { size: 19 })]
    : rich(text, { size: 19 }) }),
];

// A product that fits on one row: name and what it is, link (or a note) on the right.
const mini = (name, what, url) => new Paragraph({ spacing: { before: 0, after: 8 },
  tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
  children: [run(name, { bold: true, size: 19 }), run(', ' + what, { size: 19 }), run('\t' + url, { size: 17, color: DIM })] });

// The band a recruiter reads first: the biggest numbers, each with what it measures.
const STATS = [
  ['5× revenue', '₹15L → ₹80L/mo in 4 months'],
  ['400%+ ROI', 'ET Prime, in 6 months'],
  ['New revenue stream', 'Half Marathon, 18K+ runners'],
  ['20 products', 'built in 5\u20116 months'],
  ['9 books, 62 tracks', '7.7K+ YouTube views'],
];
// Widths follow the text: the marathon headline is the longest.
const COLS = [2100, 1650, 2450, 1750, RIGHT - 2100 - 1650 - 2450 - 1750];
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const band = new Table({
  width: { size: RIGHT, type: WidthType.DXA },
  columnWidths: COLS,
  borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E5DCC7' } },
  rows: [new TableRow({ children: STATS.map(([n, l], i) => new TableCell({
    width: { size: COLS[i], type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: BAND },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, bottom: 80, left: 40, right: 40 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 10 }, children: [new TextRun({ text: n, font: FONT, size: 23, bold: true, color: GOLD })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: l, font: FONT, size: 15, color: DIM })] }),
    ],
  })) })],
});

const NB = (s) => s.replace(/ /g, ' ').replace(/-/g, '‑');
const skills = (label, items) => para([run(label + ':  ', { bold: true }), run(items.map(NB).join('  ·  '))], { after: 30 });

const body = [
  new Paragraph({ spacing: { after: 10 }, children: [new TextRun({ text: 'Anchit Tandon', font: FONT, size: 46, bold: true, color: INK })] }),
  new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: HIRE ? 'Product & Growth Leader · AI Product Builder' : 'Technical Product and Growth Builder', font: FONT, size: 24, color: GOLD, bold: true }),
    run(HIRE ? '' : '', { size: 20, color: DIM })] }),
  new Paragraph({ spacing: { after: 110 }, children: [
    run('Delhi, India  |  +91 9873945238  |  ', { size: 19, color: DIM }), link('anchit.tandon@gmail.com', 'mailto:anchit.tandon@gmail.com'),
    run('  |  ', { size: 19, color: DIM }), link('anchit-tandon.com', 'https://anchit-tandon.com/'),
    run('  |  ', { size: 19, color: DIM }), link('linkedin.com/in/anchit-tandon', 'https://www.linkedin.com/in/anchit-tandon'),
  ] }),
  band,

  section('Profile'),
  para(rich(HIRE
    ? 'Engineer turned product leader. Close to **4 years at Times Internet**, **promoted twice in under 3 years** (APM to Senior PM), scaling subscriptions and assisted sales, then **AGM, Product Management and D2C Growth at Vahdam India** across the US, UK and global markets. In the last 5\u20116 months I have built **20 products** end to end, and since September 2026 I have been building full time, including **Parwah**, a family-care app for Indian families. I am looking for a role where product and AI meet: shaping the product and building it hands-on with customers.'
    : 'Engineer turned product leader across consumer platforms, subscriptions, sales operations and international ecommerce. I connect problem definition, customer journeys, AI-assisted development and experimentation to ship products that lift conversion, retention and operational efficiency. Currently building **Parwah**, a family-care app for Indian families looking after ageing parents, and available for freelance builds and fractional product and growth engagements.')),

  section('Skills'),
  skills('Product', ['Discovery and prioritisation', 'Roadmaps', 'Experimentation', 'Subscription monetisation', 'Conversion funnels']),
  skills('Growth', ['Lifecycle and retention', 'CRM (Klaviyo, WebEngage)', 'D2C growth', 'Analytics']),
  skills('AI and build', ['AI agents and workflows', 'Next.js', 'Supabase', 'Vercel', 'Android and iPhone apps', 'Cross-functional delivery']),

  section('Professional experience'),
  role('Parwah, family-care app for India', 'Sep 2026 to Present', { first: true }),
  bullet('Building a family-care app for Indian families looking after ageing parents, so siblings in different cities can share their parents’ care without anything slipping.'),
  bullet('Treated care as **a task problem, not a chat problem**: every need moves from open to assigned, claimed and done, with one tap to say “I’m on it”, ending the family WhatsApp group’s “I thought you did”.'),
  bullet('Made handing a task back normal, with full history kept, and every action checks that the right family member is making the change. **Live at parwah-hq.anchit-tandon.com.**'),

  role('Vahdam India', 'Apr 2026 to Sep 2026'),
  sub('AGM, Product Management and D2C Growth', ''),
  bullet('Led D2C product and growth across **US, UK and global markets**, covering customer experience, product performance and revenue optimisation.'),
  bullet('Ran product and CRM experiments, including lifecycle campaigns on **Klaviyo and WebEngage** and customer-rating improvement initiatives.'),
  bullet('Helped build a **customer lifecycle and retention OS** that links analytics, planning, segmentation and mailer generation in one loop, and helped **lift UK marketing revenue within the first two months**.'),

  role('Times Internet', 'Jun 2022 to Apr 2026'),
  sub('Senior Product Manager', 'Apr 2025 to Apr 2026'),
  sub('Product Manager', 'Oct 2023 to Mar 2025'),
  sub('Associate Product Manager', 'Jun 2022 to Oct 2023'),
  group('Assisted conversion and subscriptions'),
  bullet('Scaled Economic Times assisted-sales monthly revenue **5× within 4 months, from ₹15L to ₹80L**, through funnel redesign and continuous experimentation; delivered **400%+ ROI within six months** on ET Prime’s structured assisted-conversion funnel.'),
  bullet('Built **AI TeleSuite** for call transcription, quality scoring and pitch assistance, standardising conversion execution across high-intent traffic.'),
  bullet('Launched Assisted Buying, growing qualified leads from **about 30 to 150+ a day**; lifted subscriber retention by **10%** through onboarding and engagement experiments.'),
  group('Consumer platforms and new product launches'),
  bullet('Led the ET Markets web and mobile-web revamp, lifting engagement by **27%** and unlocking **₹3Cr+** in incremental annual revenue.'),
  bullet('Revamped the ET Markets Android and iOS apps, growing daily active users by **25%** and average session duration by **15%**.'),
  bullet('Launched paid wellness subscriptions for **Times Health+**, and led discovery, registration and acquisition journeys for the inaugural **Times Internet Delhi Half Marathon (18K+ runners)**, setting up a **new revenue stream**.'),

  section('Earlier experience'),
  role('Citymall, Software Engineer', 'Mar 2022 to Jun 2022', { first: true }),
  bullet('Supported data pipelines and backend systems for consumer commerce platforms.'),
  role('Tuple Technologies, Software Engineer', 'Apr 2020 to Mar 2022'),
  bullet('Built backend services for consumer apps and owned an early **live sports commentary product**.'),

  section('Education'),
  role('B.Tech, Computer Science and Engineering, Vellore Institute of Technology', '2016 to 2020', { first: true }),

  section(HIRE ? 'All 20 products, built in 5\u20116 months' : 'Selected independent product builds'),
  ...product('LifeCycle-OS, lifecycle marketing platform', 'lifecycle-os.anchit-tandon.com', 
    'For D2C growth teams shipping emails, ads and landing pages for every cohort, every week: any brand in, a full lifecycle plan and on-brand content out in seconds, with missing facts marked **“data required”, never invented**.', true),
  ...product('The Third Eye, personal AI operating system', 'the-third-eye.anchit-tandon.com', 
    'For people whose tasks, notes and goals live in separate apps: one assistant, by voice and camera, that plans, remembers and acts across their email, calendar and **76 linked apps**.'),
  ...product('Predict Natural Disasters, live global hazard map', 'predict-natural-disasters.anchit-tandon.com', 
    'For newsrooms, NGOs and operations teams who need one trustworthy view in a disaster: one map across **8 official sources**, where every forecast shows its evidence and is **graded afterwards**.'),
  ...product('LoosenUp, stress relief for your worst 2 minutes', 'loosenup.anchit-tandon.com', 
    'For the tense moment, not a 20-minute programme: a **2-minute** guided break with a before-and-after Calm gain, no account, works offline, and an SOS on every screen.'),
  ...(HIRE ? [
    ...product('Edu AI, a learning planner from birth to Class 12', 'edu-ai.anchit-tandon.com', 
    'So a child’s learning carries over from app to app and year to year: one skill map from age 0 to 18 across CBSE, ICSE, NIOS and state boards, branching into **JEE, NEET, CUET and UPSC**.'),
    ...product('Airpane, an AR browser with no headset or app', 'airpane.anchit-tandon.com', 
    'AR without a headset: pins any website in your room with a phone, turns a laptop webcam into head-tracked 3D, and **throws pages to a TV** with a gesture.'),
    ...product('ANCHOR, an AI techno artist', 'anchor.anchit-tandon.com', 
    'Artists fail at consistency, so a robot releases a track a day at ₹0: **62 tracks since 4 Sep 2026** and **7.7K+ YouTube views**. YouTube **@ANCHOR_AT**, Instagram **@anchor_at2803**.'),
    ...product('Book publishing engine, 9 books on Amazon', 'amazon.in/Anchit-Tandon/e/B0HL6RW348', 
    'Can one person with AI run a real publishing business? A quality-gated engine behind **The Watermark Files** (4 thrillers) and **5 Doodle Lane** drawing books for kids; Instagram **@ai_at2803**.'),
    group('Also built (plus Parwah, above)'),
    mini('AI TeleSuite', 'AI scores every sales call so managers can coach', 'demo on request'),
    mini('Hey Yaara', 'a Hinglish voice friend to talk to, any time', 'hey-yaara.anchit-tandon.com'),
    mini('Animind', 'tells pet owners from a 10-second clip when to worry', 'pet-mind.anchit-tandon.com'),
    mini('TH+ LifeEngine', 'yoga and food plans you can follow, log and adjust', 'th-life-engine.anchit-tandon.com'),
    mini('Kolab', 'creators run their business, brands find verified creators', 'kolab.anchit-tandon.com'),
    mini('Shoutout', 'musicians find gigs and collaborators, and get paid', 'shoutout.anchit-tandon.com'),
    mini('JobHunt', 'tailors a résumé to each real job, never exaggerating', 'anchit-tandon.com/jobhunt'),
    mini('Anchit LLM', 'recruiters question my work instead of reading a PDF', 'anchit-tandon.com'),
    mini('Markets Pro', 'retail investors test strategies on honest numbers', 'being fixed'),
    mini('MuseVibe Studio', 'turns how a song should feel into a full song', 'being fixed'),
    mini('The Passion Table', 'daily home-style food, so nobody has to cook', 'being fixed'),
  ] : []),

  ...(HIRE ? [] : [
    section('Engagement focus'),
    proofBullet('AI workflows and internal tools: call review, knowledge assistants, reporting dashboards and scoped integrations with human review.',
      'AI TeleSuite helped scale assisted-sales revenue from **₹15L to ₹80L a month**.'),
    proofBullet('Conversion-focused websites: clear offer positioning, enquiry or purchase journeys, CRM integrations and full-funnel measurement.',
      'The ET Markets web revamp lifted engagement **27%** and unlocked **₹3Cr+** in incremental annual revenue.'),
    proofBullet('Fractional product and growth: roadmap prioritisation, zero-to-one launches, conversion experiments and subscription or ecommerce retention.',
      '**400%+ ROI** within six months on an assisted-conversion funnel; subscriber retention up **10%**.'),
    proofBullet('Focused web MVPs and journeys: one core customer journey shipped end to end, with agreed acceptance criteria and a clean handover.',
      'Assisted Buying took qualified leads from **about 30 to 150+ a day**; the app revamp grew daily active users **25%**.'),
  ]),

];

const doc = new Document({
  creator: 'Anchit Tandon', title: 'Anchit Tandon Resume',
  styles: { default: { document: { run: { font: FONT, size: 20 } } } },
  numbering: { config: [{ reference: 'dot', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 300, hanging: 220 } }, run: { color: GOLD } } }] }] },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: 15840 }, margin: { top: 792, bottom: 720, left: MARGIN, right: MARGIN } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
      new TextRun({ text: 'Anchit Tandon  ·  anchit-tandon.com  ·  page ', font: FONT, size: 16, color: DIM }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: DIM }),
      new TextRun({ text: ' of ', font: FONT, size: 16, color: DIM }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: DIM })] })] }) },
    children: body,
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(OUT, b); console.log('written ' + VARIANT + ' -> ' + OUT); });
