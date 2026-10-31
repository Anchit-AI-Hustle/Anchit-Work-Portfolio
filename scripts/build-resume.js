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
  new Paragraph({ spacing: { before: first ? 30 : 70, after: 10 }, keepNext: true,
    tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
    children: [run(name, { bold: true, size: 20 }), run('\t' + url, { size: 18, color: DIM })] }),
  new Paragraph({ spacing: { before: 0, after: 20, line: 259 }, indent: { left: 0 }, children: rich(text, { size: 19 }) }),
];

// The band a recruiter reads first: the biggest numbers, each with what it measures.
const STATS = [
  ['5× revenue', '₹15L → ₹80L a month'],
  ['400%+ ROI', 'ET Prime, in 6 months'],
  ['₹3Cr+ a year', 'ET Markets revamp'],
  ['18K+ runners', 'Delhi Half Marathon'],
  ['20 AI products', 'built in 5\u20116 months'],
];
const cellW = Math.floor(RIGHT / STATS.length);
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const band = new Table({
  width: { size: cellW * STATS.length, type: WidthType.DXA },
  columnWidths: STATS.map(() => cellW),
  borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E5DCC7' } },
  rows: [new TableRow({ children: STATS.map(([n, l]) => new TableCell({
    width: { size: cellW, type: WidthType.DXA },
    shading: { type: ShadingType.CLEAR, color: 'auto', fill: BAND },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 80, right: 80 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 10 }, children: [new TextRun({ text: n, font: FONT, size: 24, bold: true, color: GOLD })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: l, font: FONT, size: 16, color: DIM })] }),
    ],
  })) })],
});

const NB = (s) => s.replace(/ /g, ' ').replace(/-/g, '‑');
const skills = (label, items) => para([run(label + ':  ', { bold: true }), run(items.map(NB).join('  ·  '))], { after: 30 });

const body = [
  new Paragraph({ spacing: { after: 10 }, children: [new TextRun({ text: 'Anchit Tandon', font: FONT, size: 46, bold: true, color: INK })] }),
  new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: HIRE ? 'Product Lead & AI Builder' : 'Technical Product and Growth Builder', font: FONT, size: 24, color: GOLD, bold: true }),
    run(HIRE ? '   ·   Product Management, D2C Growth, AI products' : '', { size: 20, color: DIM })] }),
  new Paragraph({ spacing: { after: 110 }, children: [
    run('Delhi, India  |  +91 9873945238  |  ', { size: 19, color: DIM }), link('anchit.tandon@gmail.com', 'mailto:anchit.tandon@gmail.com'),
    run('  |  ', { size: 19, color: DIM }), link('anchit-tandon.com', 'https://anchit-tandon.com/'),
    run('  |  ', { size: 19, color: DIM }), link('linkedin.com/in/anchit-tandon', 'https://www.linkedin.com/in/anchit-tandon'),
  ] }),
  band,

  section('Profile'),
  para(rich(HIRE
    ? 'Engineer turned product leader. Close to **4 years at Times Internet** (APM to Senior PM) scaling subscriptions and assisted sales, then **AGM, Product Management and D2C Growth at Vahdam India** across the US, UK and global markets. In the last 5\u20116 months I have built **20 AI products** end to end, and since September 2026 I have been building full time, including **Parwah**, a family-care app for Indian families. I am looking for a role where product and AI meet: shaping the product and building it hands-on with customers.'
    : 'Engineer turned product leader across consumer platforms, subscriptions, sales operations and international ecommerce. I connect problem definition, customer journeys, AI-assisted development and experimentation to ship products that lift conversion, retention and operational efficiency. Currently building **Parwah**, a family-care app for Indian families looking after ageing parents, and available for freelance builds and fractional product and growth engagements.')),

  section('Skills'),
  skills('Product', ['Discovery and prioritisation', 'Roadmaps', 'Experimentation', 'Subscription monetisation', 'Conversion funnels']),
  skills('Growth', ['Lifecycle and retention', 'CRM (Klaviyo, WebEngage)', 'D2C across US, UK and global markets', 'Analytics']),
  skills('AI and build', ['AI agents and workflows', 'Next.js', 'Supabase', 'Vercel', 'Android and iPhone apps', 'Cross-functional delivery']),

  section('Professional experience'),
  role('Parwah, family-care app for India', 'Sep 2026 to Present', { first: true }),
  bullet('Building a family-care app for Indian families looking after ageing parents, so siblings in different cities can share their parents’ care without anything slipping.'),
  bullet('Treated care as **a task problem, not a chat problem**: every need moves from open to assigned, claimed and done, with one tap to say “I’m on it”, ending the family WhatsApp group’s “I thought you did”.'),
  bullet('Made handing a task back normal, with full history kept, and every action checks that the right family member is making the change. **Live at parwah-hq.anchit-tandon.com.**'),

  role('Vahdam India', 'Apr 2026 to Sep 2026'),
  sub('AGM, Product Management and D2C Growth', 'US, UK and global markets'),
  bullet('Led D2C product and growth across **US, UK and global markets**, covering customer experience, product performance and revenue optimisation.'),
  bullet('Ran product and CRM experiments, including lifecycle campaigns on **Klaviyo and WebEngage** and customer-rating improvement initiatives.'),
  bullet('Helped build a **customer lifecycle and retention OS** that links analytics, planning, segmentation and mailer generation in one loop, and helped **lift UK marketing revenue within the first two months**.'),

  role('Times Internet', 'Jun 2022 to Apr 2026'),
  sub('Senior Product Manager', 'Apr 2025 to Apr 2026'),
  sub('Product Manager', 'Oct 2023 to Mar 2025'),
  sub('Associate Product Manager', 'Jun 2022 to Oct 2023'),
  group('Assisted conversion and subscriptions'),
  bullet('Scaled Economic Times assisted-sales monthly revenue **5×, from INR 15 lakh to INR 80 lakh**, through funnel redesign and continuous experimentation; delivered **400%+ ROI within six months** on ET Prime’s structured assisted-conversion funnel.'),
  bullet('Built **AI TeleSuite** for call transcription, quality scoring and pitch assistance, standardising conversion execution across high-intent traffic.'),
  bullet('Launched Assisted Buying, growing qualified leads from **about 30 to 150+ a day**; lifted subscriber retention by **10%** through onboarding and engagement experiments.'),
  group('Consumer platforms and new product launches'),
  bullet('Led the ET Markets web and mobile-web revamp, lifting engagement by **27%** and unlocking **INR 3 crore+** in incremental annual revenue.'),
  bullet('Revamped the ET Markets Android and iOS apps, growing daily active users by **25%** and average session duration by **15%**.'),
  bullet('Launched paid wellness subscriptions for **Times Health+**, and led discovery, registration and acquisition journeys for the inaugural **Times Internet Delhi Half Marathon (18K+ runners)**.'),

  section('Earlier experience'),
  role('Tuple Technologies, Software Engineer', 'Apr 2020 to Mar 2022', { first: true }),
  bullet('Built and scaled backend services for consumer-facing applications, and owned an early **live sports commentary product**, connecting product decisions with technical delivery.'),
  role('Citymall, Software Engineer', 'Mar 2022 to Jun 2022'),
  bullet('Supported data pipelines and backend systems for consumer commerce platforms.'),

  section(HIRE ? 'Selected products (from 20 built in 5\u20116 months)' : 'Selected independent product builds'),
  ...product('LifeCycle-OS, lifecycle marketing platform', 'lifecycle-os.anchit-tandon.com',
    'Any brand in, a full lifecycle plan out in seconds, then on-brand mailers, ads and landing pages from real customer data. **Missing facts are marked “data required”, never invented**; brand isolation is tested on every change.', true),
  ...product('The Third Eye, personal AI operating system', 'the-third-eye.anchit-tandon.com',
    'One assistant across tasks, notes, goals, calendar and email, by voice and camera: **24 tools plus 76 linked apps**, four assistant modes and Razorpay credit packs, on web, Android and iPhone.'),
  ...product('Predict Natural Disasters, live global hazard map', 'predict-natural-disasters.anchit-tandon.com',
    'One map across **8 official data sources** (USGS, NASA, GDACS, NOAA and more). **Every forecast states its evidence and is graded afterwards**, and uncovered regions say “not covered”, never “all clear”.'),
  ...product('LoosenUp, stress relief for your worst 2 minutes', 'loosenup.anchit-tandon.com',
    'A 2-minute guided break with a before-and-after **Calm gain**; an SOS on every screen (Tele-MANAS 14416, a trusted contact, 112); no account needed, and it works offline.'),
  ...(HIRE ? [
    ...product('Airpane, an AR browser with no headset or app', 'airpane.anchit-tandon.com',
      'Pins any website in your room on a phone, turns a laptop webcam into head-tracked 3D, and **throws pages to a TV** with a pinch-and-swing gesture.'),
    ...product('Edu AI, a learning planner from birth to Class 12', 'edu-ai.anchit-tandon.com',
      'One skill map from age 0 to 18 across CBSE, ICSE/ISC, NIOS and state boards, with **JEE, NEET, CUET and UPSC** tracks branching off it.'),
  ] : []),

  ...(HIRE ? [] : [
    section('Engagement focus'),
    proofBullet('AI workflows and internal tools: call review, knowledge assistants, reporting dashboards and scoped integrations with human review.',
      'AI TeleSuite helped scale assisted-sales revenue from **INR 15 lakh to INR 80 lakh a month**.'),
    proofBullet('Conversion-focused websites: clear offer positioning, enquiry or purchase journeys, CRM integrations and full-funnel measurement.',
      'The ET Markets web revamp lifted engagement **27%** and unlocked **INR 3 crore+** in incremental annual revenue.'),
    proofBullet('Fractional product and growth: roadmap prioritisation, zero-to-one launches, conversion experiments and subscription or ecommerce retention.',
      '**400%+ ROI** within six months on an assisted-conversion funnel; subscriber retention up **10%**.'),
    proofBullet('Focused web MVPs and journeys: one core customer journey shipped end to end, with agreed acceptance criteria and a clean handover.',
      'Assisted Buying took qualified leads from **about 30 to 150+ a day**; the app revamp grew daily active users **25%**.'),
  ]),

  section('Education'),
  role('B.Tech, Computer Science and Engineering, Vellore Institute of Technology', '2016 to 2020', { first: true }),
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
