// Couture motion for Ayushi's pages; the visual rules live in couture.css.
// Everything here only sets classes and per-element custom properties (never on
// :root, which would restyle the whole page on every pointer move), does
// nothing under reduced motion, and stops work for anything off screen.
(() => {
  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const raf = (fn) => { let q = 0; return (...a) => { if (!q) q = requestAnimationFrame(() => { q = 0; fn(...a); }); }; };

  // 3D · drape: only blocks that fit on screen, then hand them back their own
  // transitions once they have landed so hover lifts stay quick.
  const vh = innerHeight;
  const drapes = [...document.querySelectorAll('.a-reveal:not(.on)')].filter((el) => el.offsetHeight < vh * 0.85);
  drapes.forEach((el) => el.classList.add('c-drape'));
  if ('IntersectionObserver' in window && drapes.length) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const done = () => (e.target.classList.contains('on') ? setTimeout(() => e.target.classList.remove('c-drape'), 1200) : setTimeout(done, 120));
      done();
    }), { threshold: 0.08 });
    drapes.forEach((el) => io.observe(el));
  } else drapes.forEach((el) => el.classList.remove('c-drape'));

  // Staggers, set inline (a transition shorthand on the child would reset a
  // delay given any other way).
  document.querySelectorAll('.a-tiles').forEach((g) => [...g.children].forEach((t, i) => { t.style.transitionDelay = `${i * 90}ms`; }));
  ['.cases', '.brands', '.index', '.s-facts', '.s-leaks', '.s-short', '.s-kpi', '.s-plan', '.s-next'].forEach((sel) => {
    document.querySelectorAll(sel).forEach((g) => [...g.children].forEach((c, i) => {
      if (c.classList.contains('a-reveal')) c.style.transitionDelay = `${Math.min(i, 6) * 70}ms`;
    }));
  });

  // 4D · stitch the hero eyebrow once the fonts have settled.
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(() => root.classList.add('c-sewn')));

  // 4D · the cover drifts back as the hero scrolls away, only while visible.
  const cover = document.querySelector('.hero .cover');
  if (cover && 'IntersectionObserver' in window) {
    let on = false;
    const drift = raf(() => {
      const r = cover.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, -r.top / (r.height || 1)));
      cover.style.setProperty('--c-drift', `${Math.round(p * 60)}px`);
      cover.style.setProperty('--c-scale', (1 - p * 0.06).toFixed(3));
    });
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !on) { on = true; addEventListener('scroll', drift, { passive: true }); drift(); }
      else if (!e.isIntersecting && on) { on = false; removeEventListener('scroll', drift); }
    }).observe(cover);
  }

  if (!fine) return;

  // 5D · satin tilt: the card leans away from the pointer and a sheen follows it.
  const tilt = (el, max) => {
    el.classList.add('c-tilt');
    const move = raf((x, y) => {
      const r = el.getBoundingClientRect();
      const px = (x - r.left) / r.width - 0.5, py = (y - r.top) / r.height - 0.5;
      const k = max * Math.min(1, 380 / r.width); // big cards lean less
      const rx = -py * k, ry = px * k, a = Math.hypot(rx, ry);
      el.style.setProperty('--c-rot', a < 0.01 ? '0 0 1 0deg' : `${(rx / a).toFixed(3)} ${(ry / a).toFixed(3)} 0 ${a.toFixed(2)}deg`);
      el.style.setProperty('--c-sx', `${(px * 45).toFixed(1)}%`);
      el.style.setProperty('--c-sy', `${(py * 45).toFixed(1)}%`);
    });
    el.addEventListener('pointerenter', () => el.classList.add('c-live'));
    el.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
    el.addEventListener('pointerleave', () => { el.classList.remove('c-live'); el.style.setProperty('--c-rot', '0 0 1 0deg'); });
  };
  document.querySelectorAll('.a-card.lift, .s-play, .s-leak, .s-fact, .a-tile').forEach((el) => tilt(el, 7));

  // 5D · the cover follows the pointer across the whole hero; the two letters
  // drift at different depths.
  const hero = cover && cover.closest('.hero');
  if (hero) {
    const letters = cover.querySelectorAll('.mono span');
    const move = raf((x, y) => {
      const r = hero.getBoundingClientRect();
      const px = (x - r.left) / r.width - 0.5, py = (y - r.top) / r.height - 0.5;
      const rx = -py * 8, ry = px * 10, a = Math.hypot(rx, ry) || 0.001;
      cover.style.setProperty('--c-rot', `${(rx / a).toFixed(3)} ${(ry / a).toFixed(3)} 0 ${a.toFixed(2)}deg`);
      letters.forEach((s, i) => {
        const d = i ? 10 : 22; // the A sits nearer than the R
        s.style.setProperty('--c-dx', `${(px * d).toFixed(1)}px`);
        s.style.setProperty('--c-dy', `${(py * d).toFixed(1)}px`);
      });
    });
    hero.addEventListener('pointerenter', () => cover.classList.add('c-live'));
    hero.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
    hero.addEventListener('pointerleave', () => {
      cover.classList.remove('c-live');
      cover.style.setProperty('--c-rot', '0 0 1 0deg');
      letters.forEach((s) => { s.style.setProperty('--c-dx', '0px'); s.style.setProperty('--c-dy', '0px'); });
    });
  }
})();
