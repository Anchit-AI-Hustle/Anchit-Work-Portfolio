// The Google Fonts stylesheet is a cross-origin request on a fresh connection
// (DNS, TCP and TLS before the CSS even starts), and a plain
// <link rel="stylesheet"> to it holds the first paint, and every deferred
// script on the page, until it answers. On a throttled phone that was 300 to
// 450 ms of blank screen on every page that used it, measured. The text is set
// with font-display: swap either way, so the block bought nothing a reader
// could see. index.html already did this for itself; the build now does it for
// every page: preload the stylesheet, promote it when it lands, and keep a
// <noscript> copy for browsers without JavaScript.
//
// Only real <link> tags in the document are touched. Markup inside <script>
// (the mailer studio builds whole email documents in strings), <template>,
// <textarea> and <noscript> is left exactly as written.
//
// THE PAGES THAT KEEP THE BLOCK. Painting first in a fallback face means the
// text moves when the web font arrives, and on a few pages that move is big
// enough to matter. Measured on a 390px phone, Fast 4G, 4x CPU, layout shift
// with the block -> without it: ET_Study 0 -> 0.175, its problems page 0 ->
// 0.066, TimesHealth_Study 0 -> 0.092 (sub-pages up to 0.049), pw-study 0 ->
// 0.104 (prototype 0.054), marketing-101 0.015 -> 0.050, ayushi-rawat 0 ->
// 0.037, lifecycle-os-intel 0.005 -> 0.035. On freelancer the swap made the
// largest paint 800 ms later every run (the hero paragraph grows when Inter
// lands). Those keep the blocking stylesheet; every other page measured
// within 0.01 of its old shift. A path is relative to www/.
const KEEP_BLOCKING = [/^ET_Study\//, /^TimesHealth_Study\//, /^pw-study\//, /^ayushi-rawat\/index\.html$/, /^lifecycle-os-intel\.html$/, /^marketing-101\.html$/, /^freelancer\.html$/];
const SKIP = /(<(script|noscript|template|textarea)\b[\s\S]*?<\/\2\s*>)/i;

export function deferGoogleFontsIn(html, relPath = '') {
  if (KEEP_BLOCKING.some((re) => re.test(relPath.split('\\').join('/')))) return html;
  return html.split(SKIP).map((part, i, all) => {
    // split() with two capture groups yields [text, block, tagName, text, ...].
    if (i % 3 !== 0) return i % 3 === 1 ? part : '';
    return part.replace(/<link\b[^>]*>/gi, (tag) => {
      if (!/href=["']https:\/\/fonts\.googleapis\.com\/css2?\?/i.test(tag)) return tag;
      if (!/rel=["']?stylesheet["']?/i.test(tag) || /\bonload=|\bmedia=/i.test(tag)) return tag;
      const href = /href=(["'])([^"']+)\1/i.exec(tag)[2];
      return `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${href}"></noscript>`;
    });
  }).join('');
}
