// The page turn: one definition, used by both build passes.
//
// build-www.mjs writes PAGE_TURN_TAG into every page it assembles.
// copy-ayushi.mjs runs afterwards and brings in pages that pass never saw, so
// it imports the same strings rather than keeping a second copy. It did keep a
// second copy at first, a bare `@view-transition` with no opt-outs, and that
// gave visitors who ask for reduced motion a crossfade on exactly those pages.
//
// Two ways a visitor says "no motion", and both have to hold on the INCOMING
// document, because that is the one whose styles drive a cross-document
// transition:
//
//   1. prefers-reduced-motion, which CSS can read directly.
//   2. the site's own Motion toggle, saved as localStorage `anchit-motion`.
//      Pages normally learn it from assets/cinematic.js, but that script is
//      deferred (too late for the first frame) and some pages do not load it
//      at all. So the tag carries its own three-line reader that runs while
//      the head is being parsed and marks <html> before anything renders.
export const PAGE_TURN_MARKER = 'id="page-turn"';

const GUARD = `@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }
}
html.pt-off::view-transition-group(*), html[data-motion="off"]::view-transition-group(*),
html.pt-off::view-transition-old(*), html[data-motion="off"]::view-transition-old(*),
html.pt-off::view-transition-new(*), html[data-motion="off"]::view-transition-new(*) { animation: none !important; }`;

const READER = `<script>try{if(localStorage.getItem('anchit-motion')==='off')document.documentElement.classList.add('pt-off')}catch(e){}</script>`;

// The full turn: opt-in, the site's curve, and both opt-outs.
export const PAGE_TURN_TAG = `<style ${PAGE_TURN_MARKER}>
@view-transition { navigation: auto; }
@keyframes ptOut { to { opacity: 0; transform: translate3d(0, -8px, 0); } }
@keyframes ptIn { from { opacity: 0; transform: translate3d(0, 14px, 0); } }
::view-transition-old(root) { animation: ptOut 200ms cubic-bezier(.4, 0, 1, 1) both; }
::view-transition-new(root) { animation: ptIn 420ms cubic-bezier(.22, 1, .36, 1) both; }
${GUARD}
</style>${READER}`;

// For a page that declares its own transition and keeps it: only the opt-outs.
export const PAGE_TURN_GUARD_TAG = `<style ${PAGE_TURN_MARKER}>
${GUARD}
</style>${READER}`;

// For a page with no transition of its own that should keep the browser's
// default crossfade rather than the portfolio's styled turn.
export const PAGE_TURN_PLAIN_TAG = `<style ${PAGE_TURN_MARKER}>
@view-transition { navigation: auto; }
${GUARD}
</style>${READER}`;
