// Shapes the class-less HTML captured from the original Xazina storefront so
// the stylesheet can lay it out.
//
// The snapshot is ~100 different Shopify section types, every one of them a
// tree of anonymous <div>s. Styling them by name is not possible, and the CSS
// that would recognise them by SHAPE ("an element whose children all contain a
// photo") needs :has() nested inside :has(), which browsers reject outright.
// So the shape is read here, once, at build time, and written into the markup
// as a handful of classes:
//
//   src-split   two children: one is only media, the other is the copy
//   src-grid    two or more children that each carry media (cards)
//   src-card    a child of a src-grid
//   src-swap    an image pair inside a link: Shopify's hover photo
//   src-span    copy sitting among cards; it takes a full row
//   src-aside   a short heading block beside a long body (FAQs)
//   src-chips   three or more short links in a row
//   src-flat    a carousel column wrapping a pair of cards; it steps aside so
//               every card joins the outer grid (4 + 4, not 3 + 3 + an orphan)
//   src-quote   a testimonial: src-qmark marks its loose “ ” glyphs
//
// It also removes three things the capture turned into visible text: inline
// style values that leaked out of an attribute, Shopify's screen-reader price
// scaffolding ("Regular price / Sale price / Unit price /per") and the empty
// "Type:" label that preceded every product title.
//
// The tokenizer only has to cope with serializer output (every tag closed,
// attributes quoted). serialize(parse(x)) === x is asserted for every block by
// scripts/xazina-layout.js, so a capture it cannot read fails loudly there.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const MEDIA = new Set(['img', 'video', 'picture']);
const OPAQUE = new Set(['a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'video', 'picture', 'details', 'summary', 'table', 'thead', 'tbody', 'tr', 'svg', 'button', 'form', 'select']);
const SKIP = new Set(['br', 'source', 'script', 'style', 'template']);

export function parse(html) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[2] === undefined) { top.children.push({ text: m[0] }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== tag) i--;
      if (i > 0) { stack[i].close = m[0]; stack.length = i; } else top.children.push({ text: m[0] });
      continue;
    }
    const node = { tag, open: m[0], children: [] };
    top.children.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(node);
  }
  return root;
}

export function serialize(node) {
  if (node.text !== undefined) return node.text;
  const inner = node.children.map(serialize).join('');
  if (node.tag === '#root') return inner;
  let open = node.open;
  if (node.cls?.length) {
    const cls = node.cls.join(' ');
    open = /\sclass="/.test(open)
      ? open.replace(/\sclass="([^"]*)"/, (_, c) => ` class="${c ? c + ' ' : ''}${cls}"`)
      : open.replace(/\s*(\/?)>$/, ` class="${cls}"$1>`);
  }
  return open + inner + (node.close || '');
}

const kids = n => n.children.filter(c => c.tag && !SKIP.has(c.tag));
const memo = (fn, key) => n => (n[key] ??= fn(n));
const hasMedia = memo(n => MEDIA.has(n.tag) || n.children.some(c => c.tag && hasMedia(c)), '_m');
const hasHeading = memo(n => /^h[1-4]$/.test(n.tag) || n.children.some(c => c.tag && hasHeading(c)), '_h');
const textLen = memo(n => n.children.reduce((s, c) => s + (c.text !== undefined
  ? (c.text.startsWith('<!--') ? 0 : c.text.replace(/\s+/g, '').length)
  : SKIP.has(c.tag) ? 0 : textLen(c)), 0), '_t');
const mediaOnly = n => hasMedia(n) && textLen(n) < 3;
// The copy side of a split may carry its own small cards (a photo beside
// "Beyond the Ring" and two pieces): a heading is what makes it the copy.
const isCopy = n => !mediaOnly(n) && (hasHeading(n) || (!hasMedia(n) && textLen(n) >= 60));
const add = (n, ...c) => (n.cls ||= []).push(...c);

function grid(n, cards) {
  add(n, 'src-grid');
  if (cards.some(c => textLen(c) > 140)) add(n, 'src-grid-wide');
  // With a full-row caption among them, auto-fit keeps every track alive, so
  // two videos sat in a quarter of the width each. Two or three cards get
  // exactly that many columns (less only when the column is too narrow).
  if (cards.length <= 3) add(n, 'src-few', 'src-n' + cards.length);
  cards.forEach(c => add(c, 'src-card'));
}

function shape(n, inLink) {
  const link = inLink || n.tag === 'a';
  const k = kids(n);
  if (n.tag !== '#root' && !OPAQUE.has(n.tag) && k.length >= 2) {
    const [a, b] = k;
    if (k.length === 2 && ((mediaOnly(a) && isCopy(b)) || (mediaOnly(b) && isCopy(a)))) {
      add(n, 'src-split');
      add(mediaOnly(a) ? a : b, 'src-split-media');
    } else if (k.every(hasMedia)) {
      if (link && k.every(mediaOnly)) add(n, 'src-swap');
      else grid(n, k);
    } else if (!link) {
      // Media interleaved with a caption or a heading: the pieces become
      // cards and the copy takes a full row. Capped so that two whole page
      // sections that merely contain photos are never tiled side by side.
      const withMedia = k.filter(hasMedia);
      const rest = k.filter(c => !hasMedia(c));
      if (withMedia.length >= 2 && rest.length <= 2 && withMedia.every(c => textLen(c) < 600)) {
        grid(n, withMedia);
        rest.forEach(c => add(c, 'src-span'));
      } else if (k.length <= 3 && !hasMedia(n) && hasHeading(a) && textLen(a) < 160
        && k.slice(1).every(c => textLen(c) > 200) && k.slice(1).reduce((t, c) => t + textLen(c), 0) > 400) {
        add(n, 'src-aside');                       // FAQ title beside its answers
      } else if (k.length >= 3 && !hasMedia(n) && k.every(c => hasHeading(c) && textLen(c) < 400)) {
        grid(n, k);                                // text-only tiles: an edit list
        add(n, 'src-grid-text');
      } else if (k.length >= 3 && !hasMedia(n) && k.every(c => c.tag === 'a' && textLen(c) <= 40)) {
        add(n, 'src-chips');                       // a run of short links
      }
    }
  } else if (n.tag === 'a' && k.length >= 2 && k.every(mediaOnly)) add(n, 'src-swap');
  for (const c of n.children) if (c.tag) shape(c, link);
}

export function clean(html) {
  return String(html ?? '')
    // An inline object-position/transform value that escaped its attribute
    // and rendered as copy: "54% 50%;transform:translate(-4%,0%) scale(1.5);"
    .replace(/>(\s*-?[\d.]+%\s+-?[\d.]+%;\s*transform:[^<]*)</g, '><')
    // Shopify's price block: a visible "Regular price", a duplicate "Sale price"
    // and an empty "Unit price /per". Kept: the one price a shopper needs.
    .replace(/<div>\s*<div>\s*Regular price\s*([^<]*?)\s*<\/div>\s*<div>\s*Sale price[\s\S]*?<\/div>\s*<div>\s*Unit price\s*<div>\s*\/per\s*<\/div>\s*<\/div>\s*<\/div>/g,
      (_, price) => `<p class="source-price">${price.replace(/Rs\.\s*/g, '₹')}</p>`)
    .replace(/<p>\s*Type:\s*<\/p>/g, '');
}

const QMARK = /^\s*["“”„«»❝❞]\s*$/;
function finish(n) {
  if (!n.tag) return;
  const k = kids(n);
  // A card whose whole content is a pair or trio of cards is a carousel
  // column, not a card: it steps aside so those cards join the outer grid.
  // Bigger inner grids (a 12-piece "For Her" tab panel) stay panels.
  if (n.cls?.includes('src-grid')) {
    const cards = k.filter(c => c.cls?.includes('src-card'));
    let total = 0, flat = 0;
    for (const c of cards) {
      const ck = kids(c), inner = ck.length === 1 && ck[0].cls?.includes('src-grid') ? kids(ck[0]).filter(x => x.cls?.includes('src-card')) : null;
      if (inner && inner.length <= 3) { add(c, 'src-flat'); add(ck[0], 'src-flat'); total += inner.length; flat++; } else total++;
    }
    if (flat) {
      n.cls = n.cls.filter(x => x !== 'src-few' && !/^src-n\d$/.test(x));
      if (total <= 3) add(n, 'src-few', 'src-n' + total);
    }
  }
  if (k.length === 0 && n.tag !== '#root' && QMARK.test(n.children.map(c => c.text || '').join(''))) add(n, 'src-qmark');
  if (k.some(c => !kids(c).length && QMARK.test(c.children.map(x => x.text || '').join('')))) add(n, 'src-quote');
  n.children.forEach(finish);
}

export function tidy(html) {
  if (!html) return html;
  const tree = parse(clean(html));
  shape(tree, false);
  finish(tree);
  return serialize(tree);
}
