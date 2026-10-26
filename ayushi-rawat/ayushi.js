// Shared behaviour for Ayushi's pages: reveal on scroll, grow the impact bars,
// and land deep links after web fonts settle (a smooth scroll that starts before
// the fonts load stops short of the target by hundreds of pixels).
(() => {
  const root = document.documentElement;
  root.classList.add('js');

  const els = document.querySelectorAll('.a-reveal, .a-bars');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('on'));
  } else {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); }
    }), { threshold: 0.08 });
    els.forEach((el) => io.observe(el));
  }

  const land = () => {
    const id = location.hash && decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    if (target) target.scrollIntoView();
    root.classList.add('ready');
  };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(land));
})();
