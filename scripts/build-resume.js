// Builds the résumé Word file: node scripts/build-resume.js out.docx
// Then export the PDF with LibreOffice: soffice --headless --convert-to pdf out.docx
// and copy the PDF to assets/resume.pdf and assets/anchit-tandon-freelance-resume.pdf.
// Every claim here should match wording already on the site.
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, ExternalHyperlink, AlignmentType, LevelFormat,
  TabStopType, BorderStyle, Footer, PageNumber } = require('docx');

const FONT = 'Calibri', INK = '161312', DIM = '5A554E', GOLD = '8A6D2F';
const PAGE_W = 12240, MARGIN = 1008;               // US Letter, 0.7" margins
const RIGHT = PAGE_W - MARGIN * 2;                  // right tab stop at the text edge

const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 20, bold: o.bold, italics: o.italics, color: o.color || INK });
const link = (text, url) => new ExternalHyperlink({ link: url, children: [new TextRun({ text, font: FONT, size: 19, color: DIM })] });

const section = (title) => new Paragraph({
  spacing: { before: 200, after: 80 }, keepNext: true,
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 2 } },
  children: [new TextRun({ text: title.toUpperCase(), font: FONT, size: 21, bold: true, color: INK, characterSpacing: 30 })],
});
// "Company, Role ............ Dates" with the dates right-aligned.
const role = (left, dates, o = {}) => new Paragraph({
  spacing: { before: o.first ? 40 : 110, after: 20 }, keepNext: true,
  tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
  children: [run(left, { bold: true, size: 21 }), run('\t' + dates, { size: 19, color: DIM })],
});
const sub = (left, dates) => new Paragraph({
  spacing: { before: 0, after: 20 }, keepNext: true,
  tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
  children: [run(left, { italics: true, size: 20 }), run('\t' + dates, { size: 19, color: DIM })],
});
const group = (t) => new Paragraph({ spacing: { before: 70, after: 20 }, keepNext: true, children: [run(t, { bold: true, size: 19, color: DIM })] });
const bullet = (t) => new Paragraph({ numbering: { reference: 'dot', level: 0 }, spacing: { before: 0, after: 30, line: 264 }, children: [run(t)] });
const para = (children, o = {}) => new Paragraph({ spacing: { before: 0, after: o.after || 40, line: 264 }, children });

const body = [
  new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: 'Anchit Tandon', font: FONT, size: 44, bold: true, color: INK })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Technical Product and Growth Builder', font: FONT, size: 23, color: GOLD, bold: true })] }),
  new Paragraph({ spacing: { after: 0 }, children: [
    run('Delhi, India  |  +91 9873945238  |  ', { size: 19, color: DIM }), link('anchit.tandon@gmail.com', 'mailto:anchit.tandon@gmail.com'),
    run('  |  ', { size: 19, color: DIM }), link('anchit-tandon.com', 'https://anchit-tandon.com/'),
    run('  |  ', { size: 19, color: DIM }), link('linkedin.com/in/anchit-tandon', 'https://www.linkedin.com/in/anchit-tandon'),
  ] }),

  section('Profile'),
  para([run('Engineer turned product leader across consumer platforms, subscriptions, sales operations and international ecommerce. I connect problem definition, customer journeys, AI-assisted development and experimentation to ship products that lift conversion, retention and operational efficiency. Currently building Parwah, a family care product for India, and available for freelance builds and fractional product and growth engagements.')]),

  section('Core capabilities'),
  para([run('Product\u00A0discovery\u00A0and\u00A0prioritisation  ·  Customer\u00A0journeys\u00A0and\u00A0conversion\u00A0funnels  ·  AI\u00A0workflows\u00A0and\u00A0internal\u00A0tools  ·  Web\u00A0MVPs  ·  Subscription\u00A0monetisation  ·  Lifecycle\u00A0and\u00A0retention  ·  Analytics\u00A0and\u00A0experimentation  ·  Cross\u2011functional\u00A0delivery')]),

  section('Professional experience'),
  role('Parwah, family care for India', 'Sep 2026 to Present', { first: true }),
  bullet('Designing and building one app for the whole family with parents at the centre: daily check-in, SOS, booking anything for them and sending money safely.'),
  bullet('Built senior-first (big type, voice-first, three actions per screen) with consent as the product: every share is chosen by the parent, visible to them and revocable in one tap.'),
  bullet('Working website live at parwah-hq.anchit-tandon.com, with a real person to talk to on WhatsApp.'),

  role('Vahdam India', 'Apr 2026 to Sep 2026'),
  sub('AGM, Product Management and D2C Growth', 'US, UK and global markets'),
  bullet('Led D2C product and growth across US, UK and global markets, covering customer experience, product performance and revenue optimisation.'),
  bullet('Ran product and CRM experiments, including lifecycle campaigns on Klaviyo and WebEngage and customer-rating improvement initiatives.'),
  bullet('Helped build a customer lifecycle and retention OS that links analytics, planning, segmentation and mailer generation in one loop, and helped lift UK marketing revenue within the first two months.'),

  role('Times Internet', 'Jun 2022 to Apr 2026'),
  sub('Senior Product Manager', 'Apr 2025 to Apr 2026'),
  sub('Product Manager', 'Oct 2023 to Mar 2025'),
  sub('Associate Product Manager', 'Jun 2022 to Oct 2023'),
  group('Assisted conversion and subscriptions'),
  bullet('Scaled Economic Times assisted-sales monthly revenue 5×, from INR 15 lakh to INR 80 lakh, through funnel redesign and continuous experimentation; delivered 400%+ ROI within six months on ET Prime’s structured assisted-conversion funnel.'),
  bullet('Built AI TeleSuite for call transcription, quality scoring and pitch assistance, standardising conversion execution across high-intent traffic.'),
  bullet('Launched Assisted Buying, growing qualified leads from about 30 to 150+ a day; lifted subscriber retention by 10% through onboarding and engagement experiments.'),
  group('Consumer platforms and new product launches'),
  bullet('Led the ET Markets web and mobile-web revamp, lifting engagement by 27% and unlocking INR 3 crore+ in incremental annual revenue.'),
  bullet('Revamped the ET Markets Android and iOS apps, growing daily active users by 25% and average session duration by 15%.'),
  bullet('Launched paid wellness subscriptions for Times Health Plus, and drove discovery, registration and acquisition journeys for the Times Internet Half Marathon.'),

  section('Earlier experience'),
  role('Citymall', 'Mar 2022 to Jun 2022', { first: true }),
  sub('Software Engineer', ''),
  bullet('Supported data pipelines and backend systems for consumer commerce platforms.'),
  role('Tuple Technologies', 'Apr 2020 to Mar 2022'),
  sub('Software Engineer', ''),
  bullet('Built and scaled backend services for consumer-facing applications.'),
  bullet('Owned an early live sports commentary product, connecting product decisions with technical delivery.'),

  section('Selected independent product builds'),
  para([run('AI-assisted development across personal products and prototypes, spanning product design, application workflows and integrations.', { color: DIM })], { after: 20 }),
  role('Third Eye, personal AI assistant', 'the-third-eye.anchit-tandon.com', { first: true }),
  bullet('Built a full-stack Next.js and Supabase assistant with tool calling, memory, tasks and Google integration, connecting personal context with actions it can take.'),
  role('Lifecycle OS, marketing workflow application', 'lifecycle-os.anchit-tandon.com'),
  bullet('Built a multi-brand workspace and campaign workflow that links planning, segmentation, content and dispatch in one pipeline.'),
  role('The Passion Table, subscription and ordering product', 'In development'),
  bullet('Built subscription, ordering and fulfilment workflows for a food-service concept, including a test-mode payment journey.'),

  section('Engagement focus'),
  bullet('AI workflows and internal tools: call review, knowledge assistants, reporting dashboards and scoped integrations with human review.'),
  bullet('Conversion-focused websites: clear offer positioning, enquiry or purchase journeys, CRM integrations and full-funnel measurement.'),
  bullet('Fractional product and growth: roadmap prioritisation, zero-to-one launches, conversion experiments and subscription or ecommerce retention.'),
  bullet('Focused web MVPs: one core customer journey shipped end to end, with agreed acceptance criteria and a clean handover.'),

  section('Education'),
  role('B.Tech, Computer Science and Engineering', '2016 to 2020', { first: true }),
  para([run('Vellore Institute of Technology, Vellore', { italics: true })]),
];

const doc = new Document({
  creator: 'Anchit Tandon', title: 'Anchit Tandon Resume',
  styles: { default: { document: { run: { font: FONT, size: 20 } } } },
  numbering: { config: [{ reference: 'dot', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 300, hanging: 220 } }, run: { color: GOLD } } }] }] },
  sections: [{
    properties: { page: { size: { width: PAGE_W, height: 15840 }, margin: { top: 864, bottom: 792, left: MARGIN, right: MARGIN } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
      new TextRun({ text: 'Anchit Tandon  ·  page ', font: FONT, size: 16, color: DIM }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: DIM }),
      new TextRun({ text: ' of ', font: FONT, size: 16, color: DIM }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 16, color: DIM })] })] }) },
    children: body,
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync(process.argv[2], b); console.log('written'); });
