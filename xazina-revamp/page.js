import { mountModel } from './model.js?v=prism-3';
import { mountStory } from './story.js?v=prism-4';

const media = matchMedia('(prefers-reduced-motion: reduce)');
const motion = window.Motion;
let effects = !media.matches, progressCleanup, labTransition;
const activeReveals = new Set();
const progress = document.querySelector('.light-progress');

function updateEffects(next) {
  effects = next;
  if (!effects) {
    labTransition?.complete();
    for (const animation of activeReveals) animation.complete();
    progressCleanup?.();
    progressCleanup = null;
  } else if (motion && !progressCleanup) {
    progressCleanup = motion.scroll(motion.animate(progress, { scaleX: [0, 1] }, { ease: 'linear' }));
  }
  document.dispatchEvent(new Event('xazina:effects'));
}

if (motion) {
  motion.inView('[data-reveal]', element => {
    if (!effects) return;
    const delay = element.classList.contains('piece') ? Number(element.querySelector('.piece-media span').textContent) * .10 : 0;
    const animation = motion.animate(element, { opacity: [.52, 1], y: [32, 0] },
      { duration: .74, delay, ease: [.2, .75, .24, 1] });
    activeReveals.add(animation);
    animation.then(() => activeReveals.delete(animation));
  }, { amount: .22 });
}
const shine = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting || !effects) continue;
    entry.target.classList.add('is-lit');
    shine.unobserve(entry.target);
  }
}, { threshold: .28 });
document.querySelectorAll('.piece,.scent-layout figure,.atelier-art').forEach(el => shine.observe(el));
// The concept bar sits above the film. The film is one screen tall minus the
// bar, so the first screen still ends on its chapter controls; the height is
// written on the story, not on :root, and only when the bar resizes.
const conceptBar = document.querySelector('.concept-bar');
const lightStory = document.getElementById('light-story');
if (conceptBar && lightStory) {
  const fit = () => lightStory.style.setProperty('--concept-h', conceptBar.offsetHeight + 'px');
  fit();
  new ResizeObserver(fit).observe(conceptBar);
}
mountStory({ motion, media, onEffects:updateEffects });

// "Design notes" in the concept bar lands here from every Xazina page. The
// film grows once it is ready and the photos above load as they are passed,
// so a smooth jump measured at the start ended 500-800px short on a phone.
// Until the reader takes over, the target is held in place while the page
// above it settles.
function holdTarget() {
  const id = decodeURIComponent(location.hash.slice(1));
  const target = id && id !== 'top' && document.getElementById(id);
  if (!target || target.closest('#light-story')) return;
  let reader = false;
  const off = () => { reader = true; };
  for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) addEventListener(type, off, { once: true, passive: true });
  const margin = () => parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const snap = () => {
    if (!reader && Math.abs(target.getBoundingClientRect().top - margin()) > 2) target.scrollIntoView({ behavior: 'instant' });
  };
  const watch = new ResizeObserver(() => requestAnimationFrame(snap));
  watch.observe(document.body);
  addEventListener('scrollend', snap, { once: true });
  setTimeout(() => { watch.disconnect(); for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) removeEventListener(type, off); }, 4000);
}
holdTarget();
addEventListener('hashchange', holdTarget);

const stage = document.getElementById('stage');
const canvas = document.getElementById('model');
const lab = mountModel(canvas);

if (lab) {
  const byId = id => document.getElementById(id);
  const controls = byId('lab-ui'), input = byId('model-value'), output = byId('value-readout');
  const play = byId('play-model'), reset = byId('reset-model');
  const modes = {
    3: { name: 'FIG 01 / BRILLIANT CUT', label: 'Rotation', max: 360, start: 0, unit: '°',
      hint: 'Turn a brilliant-cut model to see how its facets catch the light.',
      alt: 'Interactive model of a faceted brilliant-cut gemstone', verb: 'rotation' },
    4: { name: 'FIG 02 / TIME', label: 'Moment', max: 100, start: 0, unit: '%',
      hint: 'Move through one turn of a cube that folds through time, a moment at a time.',
      alt: 'Interactive drawing of a cube folding through time', verb: 'time' },
    5: { name: 'FIG 03 / LIGHT', label: 'Colour split', max: 100, start: 62, unit: '%',
      hint: 'Split white light into colour across the edges of a turning form.',
      alt: 'Interactive drawing of a turning form with light split into colour', verb: 'motion' }
  };
  let mode = 3, playing = effects, visible = false, frame = 0, last = 0;
  let value = 0, time = 0, yaw = 0, pitch = 0, drag = null;
  let targetYaw = 0, targetPitch = 0, labGem;

  function readout() {
    const n = Math.round(value), entry = modes[mode];
    input.value = String(n);
    input.setAttribute('aria-valuetext', `${n} ${entry.unit === '°' ? 'degrees' : 'percent'}`);
    output.value = n + entry.unit;
  }

  function draw() {
    const state = { mode, time, yaw, pitch, angle: value * Math.PI / 180,
      phase: value * Math.PI / 50, dispersion: value / 100 };
    if (mode === 3 && labGem) labGem.draw(state);
    else lab.draw(state);
  }

  function schedule() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    frame = 0;
    if (!visible || document.hidden) { last = 0; return; }
    const dt = last ? Math.min((now - last) / 1000, .05) : 0;
    last = now;
    if (playing) {
      time += dt;
      if (mode === 3) value = (value + dt * 32) % 360;
      if (mode === 4) value = (value + dt * 15) % 100;
      if (mode !== 5 && Number(input.value) !== Math.round(value)) readout();
    }
    const smooth = !media.matches && playing ? .1 : 1;
    yaw += (targetYaw - yaw) * smooth;
    pitch += (targetPitch - pitch) * smooth;
    draw();
    if (playing) schedule();
    else last = 0;
  }

  function setPlaying(next) {
    playing = next;
    last = 0;
    play.textContent = (playing ? 'Pause ' : 'Play ') + modes[mode].verb;
    schedule();
  }

  function switchMode(next, animate = true) {
    mode = next;
    const entry = modes[mode];
    value = entry.start;
    time = 0;
    yaw = pitch = targetYaw = targetPitch = 0;
    stage.dataset.mode = mode;
    canvas.setAttribute('aria-label', entry.alt);
    byId('stage-name').textContent = entry.name;
    byId('mode-description').textContent = entry.hint;
    byId('value-label').textContent = entry.label;
    input.max = entry.max;
    readout();
    setPlaying(playing);
    draw();
    if (animate && motion && effects) {
      labTransition?.complete();
      labTransition = motion.animate(stage, { opacity: [.53, 1], scale: [.986, 1] }, { duration: .38 });
    }
  }

  controls.addEventListener('change', event => {
    if (event.target.name === 'dimension') switchMode(Number(event.target.value));
  });
  input.addEventListener('input', () => {
    value = Number(input.value);
    setPlaying(false);
    readout();
    draw();
  });
  play.addEventListener('click', () => setPlaying(!playing));
  reset.addEventListener('click', () => {
    setPlaying(false);
    switchMode(mode);
  });

  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, yaw: targetYaw, pitch: targetPitch };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!event.isPrimary || !drag) return;
    targetYaw = drag.yaw + (event.clientX - drag.x) * .012;
    targetPitch = Math.max(-1.15, Math.min(1.15, drag.pitch + (event.clientY - drag.y) * .009));
    if (!playing) { yaw = targetYaw; pitch = targetPitch; draw(); }
    else schedule();
  });
  canvas.addEventListener('lostpointercapture', () => { drag = null; });
  document.addEventListener('xazina:effects', () => setPlaying(effects));
  document.addEventListener('visibilitychange', () => {
    last = 0;
    schedule();
  });
  stage.classList.add('is-live');
  controls.hidden = false;
  new ResizeObserver(() => { lab.size(); labGem?.resize(); draw(); }).observe(stage);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    last = 0;
    schedule();
  }).observe(stage);
  lab.size();
  switchMode(3, false);
  function initLabGem(createGemRenderer) {
    labGem = createGemRenderer(byId('lab-webgl'), stage, () => {
      labGem = null;
      delete stage.dataset.renderer;
      draw();
    }, .94);
    if (labGem) { stage.dataset.renderer = 'webgl'; draw(); }
  }
  const loader = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    loader.disconnect();
    import('./gem-render.js?v=prism-3').then(m => initLabGem(m.createGemRenderer)).catch(() => {});
  }, { rootMargin: '220px' });
  loader.observe(stage);
}
