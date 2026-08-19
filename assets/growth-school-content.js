/* growth-school-content.js — the teaching, written once.
 *
 * Both courses load this file. The general course uses these tracks as they
 * are; Ayushi❤️'s course uses the same tracks and adds her own chapters on top,
 * so a correction to how something is TAUGHT lands in both at the same time and
 * cannot drift. Only the framing, the worked example and the voice differ.
 *
 * Every figure quoted in the worked example comes from a public source that is
 * named where it is used — no invented numbers.
 */

const V_YC = { src: 'https://www.youtube-nocookie.com/embed/hyYCn_kAngI',
  title: 'How to Get Your First Customers', source: 'Y Combinator · Startup School',
  note: 'Gustaf Alströmer, former Head of Growth at Airbnb, on where the first customers actually come from.' };

const REPO_LIFECYCLE = { name: 'anchittandon-create/lifecycle-os',
  url: 'https://github.com/anchittandon-create/lifecycle-os',
  why: 'The working system this course teaches from — segmentation, calendar, mailer studio, competitive benchmarks. Read <code>analysis-registry.js</code> for how one place decides which analysis lives where.' };
const REPO_REGION = { name: 'lifecycle-os · region-context.js',
  url: 'https://github.com/anchittandon-create/lifecycle-os/blob/main/region-context.js',
  why: 'Region selection existed on 17 of 66 pages, implemented six different ways, none sharing state. This is the fix: one active region, every page. The same disease shows up in marketing stacks constantly.' };
const REPO_BRANDCTX = { name: 'lifecycle-os · brand-context.js',
  url: 'https://github.com/anchittandon-create/lifecycle-os/blob/main/brand-context.js',
  why: 'One active brand drives tokens, fonts, title and favicon everywhere. Worth reading if you have ever run two brands out of one stack and watched them bleed into each other.' };
const REPO_CATALOG = { name: 'lifecycle-os · brand-catalog.js',
  url: 'https://github.com/anchittandon-create/lifecycle-os/blob/main/brand-catalog.js',
  why: 'A catalogue resolver that stops one tenant seeing another tenant’s products. The comment at the top is a good short lesson in multi-brand data hygiene.' };
const REPO_SEARCHDOCS = { name: 'Google Search Central — documentation',
  url: 'https://developers.google.com/search/docs',
  why: 'The primary source. Most SEO advice you will read is someone’s summary of this, usually out of date.' };
const REPO_YC = { name: 'Y Combinator — Startup Library',
  url: 'https://www.ycombinator.com/library',
  why: 'Free, specific, and written by people who have done it. Start with the customer-acquisition entries.' };
const REPO_OPENSRC = { name: 'PostHog — open-source product analytics',
  url: 'https://github.com/PostHog/posthog',
  why: 'Read how funnels, retention and cohorts are actually modelled in code. It makes the vocabulary concrete in a way no article does.' };

// ── shared chapters (identical teaching in both courses) ───────────────────
function baseTracks() {
  const Y = 'you';
  return [
  { name: 'Foundations', chapters: [
    { id: 'ch-loop', title: 'The only loop that matters', minutes: 7,
      intro: 'Every growth job, in every company, is the same four steps repeated. Once ' + Y + ' can name them, most marketing advice sorts itself into "this is step two" or "this is noise".',
      promise: 'Describe any marketing activity as one of four steps, and say which step a business is actually stuck on.',
      beats: [
        { tag: 'The loop', title: 'Reach → Convert → Keep → Learn',
          body: '<strong>Reach</strong> someone who could buy. <strong>Convert</strong> them once. <strong>Keep</strong> them buying. <strong>Learn</strong> enough from what happened to do the next round better. That is the whole job. Ads are reach. Landing pages are convert. Email is mostly keep. Analytics is learn.',
          deeper: 'The reason this matters is that businesses almost never fail at all four. They fail at one, and spend money on the other three. A brand with a 1% conversion rate does not have a traffic problem, but traffic is what most people buy, because reach is the easiest thing to purchase and the easiest to report. Before ' + Y + ' propose anything, say out loud which of the four is broken.' },
        { tag: 'The trap', title: 'The step you can buy is rarely the step that is broken',
          body: 'Reach has a price list. Retention does not. So when a number is down, the reflex is to buy reach — it is available, it is fast, and it produces a chart. This is why so many brands have a large top of funnel and no business underneath it.',
          deeper: 'A useful test: if ' + Y + ' doubled traffic tomorrow at the same conversion and repeat rates, would the business be healthy? If the answer is "no, we would just lose money twice as fast", the problem is not reach. Contribution per order is the number that decides this, and it is the one the capital simulator later in this course puts in front of ' + Y + '.' },
      ],
      video: V_YC,
      repos: [REPO_YC, REPO_LIFECYCLE],
      quiz: [
        { q: 'A brand gets 50,000 visits a month, converts 0.4%, and 8% of customers order again. Where is it stuck?',
          options: ['Reach — it needs more traffic', 'Convert — the site turns almost nobody into a buyer', 'Keep — the repeat rate is the only real issue', 'Learn — it needs better dashboards'],
          answer: 1,
          why: '0.4% is far below a typical e-commerce range, and 50,000 visits is real traffic. Buying more reach multiplies the leak rather than fixing it. Repeat rate is also weak, but with a conversion rate that low, most of the money is being lost before anyone becomes a customer at all.' },
        { q: 'Which of these is a "Learn" activity rather than a "Reach" one?',
          options: ['Increasing the daily budget on a working campaign', 'Adding a second influencer to the same audience', 'Running a holdout group who see no ads, to measure what ads actually added', 'Expanding to a new placement on the same platform'],
          answer: 2,
          why: 'A holdout exists purely to produce knowledge — it deliberately gives up some reach to find out what the reach was worth. The other three all buy more of the same exposure.' },
      ],
      activity: { title: 'Diagnose one real brand in ten minutes',
        intro: 'Pick any brand ' + Y + ' actually buy from. No tools, no login.',
        steps: [
          'Open their site as if ' + Y + ' had never seen it. Time how long it takes to understand what they sell and who it is for. Over 8 seconds is a Convert problem.',
          'Add something to the basket and abandon it. Note what arrives, and how fast. Nothing within 24 hours is a Keep problem.',
          'Search their brand name plus a product category. If competitors outrank them on their own name, that is a Reach problem hiding as a brand problem.',
          'Write one sentence: "This brand is stuck on ____, because ____." That sentence is the whole exercise.',
        ] },
      outro: 'Every later chapter is one of these four steps, in detail. When something feels abstract, come back and ask which step it belongs to.' },

    { id: 'ch-numbers', title: 'Four numbers that decide everything', minutes: 9,
      intro: 'Marketing has hundreds of metrics and about four that change decisions. The rest are mostly the same four, sliced.',
      promise: 'Work out whether a business can afford to grow, using numbers ' + Y + ' can get in an afternoon.',
      beats: [
        { tag: 'The four', title: 'AOV, margin, CAC, repeat rate',
          body: '<strong>Average order value</strong> — what a sale is worth. <strong>Gross margin</strong> — what is left after making and shipping it. <strong>Cost to acquire</strong> — what it took to get that order. <strong>Repeat rate</strong> — how often they come back. Everything else is downstream of these.',
          deeper: 'Contribution per order is <em>AOV × margin − CAC</em>. If that is negative, growth is a machine for converting capital into losses, and no channel, creative or agency changes that. This is the single most useful arithmetic in the discipline, and it fits on a napkin.' },
        { tag: 'The rule', title: 'Value returned over cost paid, and why 3× is the folklore',
          body: 'Take what a customer is worth over a year and divide by what they cost to acquire. Under 1× and ' + Y + ' lose money on every customer. Around 1–2× and the business survives but never funds anything. The rule of thumb is 3×, and the third exists to pay for everything the ratio ignores — salaries, tools, returns, a bad quarter.',
          deeper: 'Treat 3× as a smell test, not a law. A business with near-zero fixed costs can live at 2×. One carrying a warehouse and a team cannot. What matters more than the ratio is the <em>payback period</em>: how many orders before ' + Y + ' get the acquisition cost back. If that number is larger than the orders a customer actually places, the ratio is fiction.' },
      ],
      sim: 'payback',
      repos: [REPO_OPENSRC],
      quiz: [
        { q: 'AOV is ₹4,000, gross margin 50%, CAC ₹2,400, and customers order 1.2 times a year. What is true?',
          options: ['Healthy — margin covers CAC comfortably', 'Each order contributes ₹2,000 gross, so it is fine', 'It loses money: ₹2,000 margin against ₹2,400 to acquire, and 1.2 orders does not close the gap', 'It cannot be judged without knowing ad spend'],
          answer: 2,
          why: '₹4,000 × 50% = ₹2,000 of margin per order, against ₹2,400 to acquire. The first order loses ₹400, and at 1.2 orders a year the second order only brings the customer to roughly break-even. This is the most common way a growing brand quietly dies.' },
        { q: 'Which change most reliably improves contribution per order?',
          options: ['Raising ad budget so the algorithm has more data', 'Increasing AOV through bundling, at the same acquisition cost', 'Posting more often on social', 'Adding a new sales channel'],
          answer: 1,
          why: 'Contribution is AOV × margin − CAC. Lifting AOV without lifting CAC increases the first term and leaves the third alone. The others change effort or reach without necessarily moving any of the three terms.' },
      ],
      activity: { title: 'Build the four numbers for a brand ' + Y + ' can see',
        intro: 'Estimation is a skill. Being roughly right beats being precisely absent.',
        steps: [
          'Pick a D2C brand with public prices. Take ten products and note the median price — that is a decent AOV proxy.',
          'Estimate margin: for most physical goods, assume the landed cost is 30–45% of the price unless ' + Y + ' know better. Say which ' + Y + ' assumed and why.',
          'Estimate CAC: search their brand, then their category. Heavy paid presence on category terms means they are buying customers, so assume a CAC in the range of 20–35% of AOV.',
          'Write the contribution line. Then write the one number ' + Y + ' would most want to verify if this were ' + Y + 'r job.',
        ] },
      outro: 'Keep this arithmetic close. Most of what follows is ways of moving one of these four terms.' },
  ] },

  { name: 'Search', chapters: [
    { id: 'ch-seo-intent', title: 'Search is intent, not keywords', minutes: 8,
      intro: 'The mistake in most SEO work is optimising for a phrase instead of for the reason someone typed it.',
      promise: 'Sort any list of search terms by what the searcher actually wants, and say which ones ' + Y + ' can win.',
      beats: [
        { tag: 'Intent', title: 'Four reasons anyone searches',
          body: 'They want to <strong>know</strong> something, <strong>go</strong> somewhere specific, <strong>do</strong> something, or <strong>buy</strong> something. A page that answers the wrong one of these will not rank however well it is written, because the engine is matching the reason, not the words.',
          deeper: 'The fastest way to identify intent is to search the term and look at what already ranks. If the first page is all product listings, the engine has decided this is a buying query, and a blog post will not displace it. If it is all guides, a product page will not either. This single check saves more wasted effort than any tool.' },
        { tag: 'Reality', title: 'Volume is not opportunity',
          body: 'A term with 90,000 searches that ' + Y + ' cannot rank for is worth less than one with 900 that ' + Y + ' can. Opportunity is realistic share × what a visit is worth — and realistic share depends on how strong ' + Y + 'r site is against how hard the term is.',
          deeper: 'This is why new sites should start narrow and specific. Long, precise queries have fewer searchers and far fewer credible competitors, and they convert better because the searcher has already narrowed their own problem. The broad term is the reward for winning fifty narrow ones, not the starting point.' },
      ],
      sim: 'seo',
      repos: [REPO_SEARCHDOCS],
      quiz: [
        { q: 'Everything ranking for a term is a product listing page. What should ' + Y + ' publish?',
          options: ['A long guide — depth wins over time', 'A product or category page, because the engine has already judged this a buying query', 'A news piece to attract links', 'A comparison of your competitors'],
          answer: 1,
          why: 'The current results are the engine telling you what it thinks the searcher wants. Publishing a guide against ten listing pages is arguing with the referee rather than playing the game.' },
        { q: 'A new site with little authority should target which term first?',
          options: ['"running shoes" — 200,000 searches', '"best running shoes for flat feet under 5000" — 400 searches', 'Whatever the biggest competitor ranks for', 'The term with the highest advertised cost-per-click'],
          answer: 1,
          why: 'Narrow terms have credible competitors a new site can actually beat, and the searcher has already specified their problem, so they convert better. The broad term is unwinnable early and would absorb months for nothing.' },
      ],
      activity: { title: 'Classify twenty terms in fifteen minutes',
        steps: [
          'List twenty things someone might search before buying what ' + Y + ' sell, or what a brand ' + Y + ' like sells.',
          'Search each. Note only what type of page is ranking in the top three.',
          'Label each term know / go / do / buy based on what ranks, not on what ' + Y + ' assumed.',
          'Circle the five where the ranking pages look beatable — thin, old, or plainly not answering the question. That is the shortlist.',
        ] },
      outro: 'Nearly all durable search traffic comes from doing this honestly and then writing the genuinely better page.' },
  ] },

  { name: 'Brand', chapters: [
    { id: 'ch-brand-mean', title: 'A brand is what people expect next', minutes: 7,
      intro: 'Not a logo, not a palette. A brand is the prediction someone makes about what ' + Y + ' will do.',
      promise: 'State any brand’s position in one sentence, and tell whether the marketing is keeping the promise.',
      beats: [
        { tag: 'Definition', title: 'The promise, and the evidence',
          body: 'A brand is a <strong>promise</strong> plus the <strong>evidence</strong> that it gets kept. The promise is the sentence people could say about ' + Y + ' when ' + Y + ' are not in the room. The evidence is delivery, packaging, replies, returns — everything after the sale.',
          deeper: 'This is why brand work cannot be delegated entirely to design. If the promise is "fastest in the category" and the parcel takes nine days, the brand is not the wordmark, it is the nine days. The most effective brand intervention in a struggling business is often an operations fix that marketing then gets to talk about honestly.' },
        { tag: 'Position', title: 'For whom, against what, and why believe it',
          body: 'A usable position answers three things: who is it <em>for</em>, what is it <em>instead of</em>, and what makes the claim <em>credible</em>. If ' + Y + ' cannot answer all three, no amount of content will make the brand distinct.',
          deeper: 'The "instead of" is the part people skip, and it is the one that creates meaning. Being "for busy professionals" says nothing; being "for busy professionals instead of a two-hour weekend meal-prep ritual" tells them exactly what they are giving up and what they get back. Positioning is subtraction.' },
      ],
      repos: [REPO_BRANDCTX],
      quiz: [
        { q: 'Which is a genuine positioning statement?',
          options: ['"Premium quality at affordable prices"', '"For people who cook once and eat well for three days, instead of ordering in every night"', '"India’s most loved wellness brand"', '"Curated, conscious, considered"'],
          answer: 1,
          why: 'It names who it is for, what it replaces, and implies the evidence you would need. The others are claims anyone could make and nobody could disprove — which means they do not distinguish anything.' },
      ],
      activity: { title: 'Write the sentence, then check it against the parcel',
        steps: [
          'Write the promise for a brand ' + Y + ' know in the form "For ___, instead of ___, because ___."',
          'List the last five things that brand actually did to a customer: delivery time, packaging, an email, a reply, a return.',
          'Mark each one keeps or breaks the promise.',
          'If more break than keep, the fix is not a campaign. Say what the fix actually is.',
        ] },
      outro: '' },
  ] },

  { name: 'Social & content', chapters: [
    { id: 'ch-social', title: 'Social is a distribution problem', minutes: 8,
      intro: 'Most social advice is about making things. The hard part is that nobody is obliged to see them.',
      promise: 'Design a posting approach around how the feed actually decides, rather than around a calendar.',
      beats: [
        { tag: 'Mechanics', title: 'The feed tests, then decides',
          body: 'A post is shown to a small sample. What that sample does — watch, stop, share, ignore — decides whether it is shown to more. So the first seconds and the first line carry almost all of the outcome, and posting more often does not help if each post fails its own test.',
          deeper: 'This is why "consistency" is bad advice on its own. Consistency compounds only when the thing being repeated passes the test; otherwise it teaches the system that ' + Y + 'r account is reliably ignorable. Better to publish less and study which pieces earned their second wave.' },
        { tag: 'Practice', title: 'One idea, many shapes',
          body: 'The efficient unit is not a post, it is an <strong>idea</strong> that can take several shapes across places. One genuine insight becomes a short video, a carousel, a written post and a section of an email — same argument, different container.',
          deeper: 'The failure mode is the reverse: a calendar of slots to fill, which forces the production of content with nothing to say. If ' + Y + ' cannot state the idea in one sentence before making it, the piece will not survive its first three seconds.' },
      ],
      repos: [REPO_LIFECYCLE, REPO_REGION],
      quiz: [
        { q: 'A brand posts daily for three months with almost no reach. Best next move?',
          options: ['Post twice a day — volume compounds', 'Study which few posts did get reach and make more of that specific thing', 'Move to a different platform', 'Buy followers to raise the baseline'],
          answer: 1,
          why: 'Reach is earned per post by what the test sample does. Doubling output without changing what fails the test just produces more failures; the signal is already in the handful that worked.' },
      ],
      activity: { title: 'Find the idea underneath your best post',
        steps: [
          'Take any account ' + Y + ' can see, including one ' + Y + ' do not run. Find its three best-performing posts.',
          'Write the single sentence each one is really arguing.',
          'Ask what the three sentences have in common. That is the account’s actual subject, whatever its bio claims.',
          'Draft one new idea in that same vein, in three shapes: short video, carousel, written post.',
        ] },
      outro: '' },
  ] },
  ];
}

window.GS_CONTENT = {
  baseTracks: baseTracks,
  V_YC: V_YC,
  repos: { lifecycle: REPO_LIFECYCLE, region: REPO_REGION, brandctx: REPO_BRANDCTX,
           catalog: REPO_CATALOG, searchdocs: REPO_SEARCHDOCS, yc: REPO_YC, opensrc: REPO_OPENSRC },
};

/* ── Ayushi❤️'s chapters ─────────────────────────────────────────────────────
 * Added on top of the shared tracks, not instead of them. This is the worked
 * example the course is built around: one real question, followed all the way
 * to a number.
 *
 * The catalogue figures below are from Knickgasm's PUBLIC Shopify feed
 * (knickgasm.com/products.json), captured in the lifecycle-os repository on
 * 2026-08-03: 436 active SKUs, USA list median $153 with a median compare-at of
 * $197, and 349 of the 436 in a single silhouette. Public storefront data, and
 * every derived number below is arithmetic on top of it.
 */
window.GS_CONTENT.ayushiTracks = function () {
  return [{
    name: 'The question',
    chapters: [
      { id: 'ay-question', title: 'Can I build a D2C brand like this?', minutes: 6,
        intro: 'Ayushi❤️ — you asked me a real question, so this is a real answer rather than encouragement. We are going to take it apart until it becomes a number, and then you can decide.',
        promise: 'Turn “can I do this?” into three questions that actually have answers.',
        beats: [
          { tag: 'Reframe', title: '“Can I?” is three questions wearing one coat',
            body: 'It is really: <strong>is the product sellable</strong>, <strong>can I get customers for less than they are worth</strong>, and <strong>do I have enough money to survive until those two are true</strong>. Only the third is about capital. The first two decide whether capital is worth spending at all.',
            deeper: 'People usually ask the capital question first because it feels like the gate. It is not. Plenty of well-funded brands fail with money left in the bank because the second question was never answered — every order lost money and more money simply bought more orders. We will answer them in order.' },
          { tag: 'The example', title: 'What the reference brand actually is',
            body: 'Knickgasm’s public product feed lists <strong>436 active SKUs</strong>, and <strong>349 of them are one silhouette</strong> — Nike Air Force 1. Median list price on the US feed is <strong>$153</strong>, against a median compare-at of <strong>$197</strong>. So: a narrow catalogue, one hero product, and a permanent discount posture of around 22%.',
            deeper: 'This shape matters more than the category. A narrow catalogue means less capital tied up in stock and a simpler story to tell. One hero product means the marketing has a single subject. A standing compare-at price means the brand has chosen to compete on perceived value rather than exclusivity — which sets the tone for everything downstream, from the ads to the emails. <em>Source: the catalogue export in the lifecycle-os repository, taken from the brand’s public products.json.</em>' },
          { tag: 'The honest part', title: 'What this reference does not tell us',
            body: 'A public feed shows prices and range. It does not show what those units cost to buy, what the ads cost, or whether the brand makes money. So we will not pretend to know. Instead we will make our assumptions visible, and you can move each one and watch what happens.',
            deeper: 'This is the habit worth taking from the whole course: when a number is unknown, do not drop the calculation — state the assumption, keep going, and mark it as the thing to verify first. A model with named assumptions is useful. A model with hidden ones is a story.' },
        ],
        repos: [window.GS_CONTENT.repos.lifecycle, window.GS_CONTENT.repos.catalog],
        quiz: [
          { q: 'Of the 436 SKUs in the reference catalogue, 349 are one silhouette. What does that most suggest?',
            options: ['A wide range that spreads risk', 'A narrow, hero-product catalogue with less capital tied up in stock', 'That the brand is about to close', 'That the products are unpopular'],
            answer: 1,
            why: 'Eighty percent of the range in one silhouette is a deliberate concentration. It lowers the stock bill and gives the marketing a single subject — which is usually an advantage for a small team, not a weakness.' },
          { q: 'Median list $153 against median compare-at $197. What is that telling you?',
            options: ['The brand is exclusive and rarely discounts', 'The brand runs a standing discount posture of about 22%', 'The products are mispriced', 'Nothing useful without cost data'],
            answer: 1,
            why: 'A compare-at price that sits permanently above the list price is a positioning choice: compete on perceived value. It is readable straight off a public feed, and it shapes every message that follows.' },
        ],
        activity: { title: 'Pick your own reference brand',
          intro: 'You do not have to use mine. Use one you would actually be proud to build.',
          steps: [
            'Choose a brand you admire that sells physical products online.',
            'Count roughly how many products they list, and how many are variations of one thing.',
            'Note the median price and whether a struck-through price is always present.',
            'Write one line: “This brand is a ___ catalogue, competing on ___.” That line is your starting shape.',
          ] },
        outro: 'Next: whether the customers can be bought for less than they are worth. That is the question that kills most brands, so we take it before the money one.' },

      { id: 'ay-capital', title: 'What capital would it actually take?', minutes: 12,
        intro: 'Now the number, Ayushi❤️. Move every slider — I would rather you distrust my assumptions and find your own than take mine on faith.',
        promise: 'Produce a defensible capital figure for a brand of your own, and say which assumption it is most sensitive to.',
        beats: [
          { tag: 'Where it goes', title: 'Capital is mostly stock, then patience',
            body: 'Three buckets. <strong>Stock</strong> — SKUs × units held × unit cost, paid before anyone buys anything. <strong>Fixed costs</strong> — the monthly bill that exists whether or not you sell. <strong>Acquisition</strong> — what you spend finding buyers while the repeat business is still too small to carry you.',
            deeper: 'In a catalogue business, stock usually dominates, and it is the one people underestimate because it is not an expense — it is cash converted into boxes. It comes back only when the boxes sell, and any unit that does not sell is capital you funded and cannot spend. This is why narrow ranges are the sane way to start: fewer SKUs is directly less money at risk.' },
          { tag: 'The gate', title: 'Contribution decides whether capital helps at all',
            body: 'Price minus unit cost minus what it cost to get the order. If that is <strong>negative</strong>, every order makes things worse and more money makes them worse faster. Check this before you raise anything, and check it again whenever the ad cost moves.',
            deeper: 'Notice what this means for discounting. A standing 22% off, like the reference brand runs, comes straight out of contribution. It can still be right — if it lifts conversion enough that the cost per order falls by more than the discount costs — but it is a trade, and you should be able to say which side you are on.' },
          { tag: 'How to read it', title: 'Find the assumption it hinges on',
            body: 'Move one slider at a time and watch the capital figure. The one that swings it hardest is the number to go and verify in the real world before committing anything. Usually it is unit cost or cost per order, and both are knowable with a few phone calls and a small test budget.',
            deeper: 'This is sensitivity analysis, and it is the difference between a plan and a wish. A plan says “this works provided unit cost lands under X, and here is how I will find out by spending a small amount first.” A wish says “this works” and only discovers the sensitive variable after the money is gone.' },
        ],
        sim: 'capital',
        repos: [window.GS_CONTENT.repos.lifecycle, window.GS_CONTENT.repos.opensrc],
        quiz: [
          { q: 'The simulator shows contribution per order is negative. What does raising more capital do?',
            options: ['Fixes it — scale brings costs down', 'Buys time for the brand to find its audience', 'Funds more loss-making orders, faster', 'Improves the ratio automatically'],
            answer: 2,
            why: 'If each order loses money, volume multiplies the loss. Capital only helps once contribution is positive — before that it is fuel on the wrong fire. Fix price, unit cost or cost-per-order first.' },
          { q: 'You cut launch SKUs from 200 to 60 at the same depth. What mainly happens?',
            options: ['Revenue falls proportionally', 'The stock bill — usually the largest block of capital — falls sharply', 'Cost per order rises', 'Nothing meaningful'],
            answer: 1,
            why: 'Stock is SKUs × depth × unit cost, and it is typically the biggest single use of capital at launch. Fewer SKUs is the most direct lever on how much money you need on day one — and it concentrates the story too.' },
        ],
        activity: { title: 'Get one real number, not four estimates',
          intro: 'One verified figure is worth more than a whole model of guesses.',
          steps: [
            'Pick the assumption the simulator is most sensitive to for your brand.',
            'If it is unit cost: find three suppliers and ask for pricing at two order sizes. The gap between them is your negotiating room.',
            'If it is cost per order: run the smallest possible paid test to one product page and measure what one order actually costs. A tiny budget answers this honestly.',
            'Put the real number in, and write down what changed. That difference is the value of doing this rather than guessing.',
          ] },
        outro: 'So — <em>can</em> you? If contribution is positive and you can fund the stock, yes, and the rest is execution. If it is not, the answer is “not with these numbers”, which is a far more useful thing to know than a yes. <span class="gs-love">Either way, I am glad you asked. — A.</span>' },
    ],
  }];
};
