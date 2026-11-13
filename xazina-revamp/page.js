import { mountModel } from './model.js?v=light-2';

const media = matchMedia('(prefers-reduced-motion: reduce)');
const motion = window.Motion;
const root = document.documentElement;
let effects = !media.matches;
let intro, progressCleanup, labTransition, heroTransition;
const effectsToggle = document.querySelector('#effects-toggle');
const status = document.querySelector('#hero-status');
const progress = document.querySelector('.light-progress');
const activeReveals = new Set();

function updateEffects() {
  root.dataset.effects = effects ? 'on' : 'off';
  effectsToggle.textContent = effects ? 'Pause effects' : 'Play effects';
  status.textContent = effects ? 'Live render' : 'Motion paused';
  if (!effects) {
    intro?.complete();
    heroTransition?.complete();
    labTransition?.complete();
    for (const animation of activeReveals) animation.complete();
    progressCleanup?.();
    progressCleanup = null;
  } else if (motion && !progressCleanup) {
    progressCleanup = motion.scroll(motion.animate(progress, { scaleX: [0, 1] }, { ease: 'linear' }));
  }
  document.dispatchEvent(new Event('xazina:effects'));
}

effectsToggle.addEventListener('click', () => {
  effects = !effects;
  updateEffects();
});
media.addEventListener('change', event => {
  effects = !event.matches;
  updateEffects();
});

if (motion && effects) {
  const { animate, stagger } = motion;
  intro = animate('[data-intro]', { opacity: [.24, 1], y: [33, 0] },
    { duration: .81, delay: stagger(.09), ease: [.2, .75, .24, 1] });
}
if (motion) {
  motion.inView('[data-reveal]', element => {
    if (!effects || element.getBoundingClientRect().top < innerHeight * .13) return;
    const delay = element.classList.contains('piece') ? Number(element.querySelector('.piece-media span').textContent) * .095 : 0;
    const animation = motion.animate(element, { opacity: [.44, 1], y: [34, 0] },
      { duration: .78, delay, ease: [.2, .75, .24, 1] });
    activeReveals.add(animation);
    animation.then(() => activeReveals.delete(animation));
  }, { amount: .18 });
}
const shine = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting || !effects) continue;
    entry.target.classList.add('is-lit');
    shine.unobserve(entry.target);
  }
}, { threshold: .28 });
document.querySelectorAll('.piece,.scent-layout figure,.atelier-art').forEach(el => shine.observe(el));
updateEffects();

const exhibit = document.querySelector('#hero-exhibit');
const heroStage = document.querySelector('#hero-stage');
const heroCanvas = document.querySelector('#hero-model');
const heroWebGL = document.querySelector('#hero-webgl');
const heroPanel = document.querySelector('#hero-panel');
const heroDrag = document.querySelector('#hero-drag');
const heroModel = mountModel(heroCanvas);
let heroGem;
if (heroModel) {
  let mode = 3, time = 0, frame = 0, last = 0, visible = false;
  let yaw = 0, pitch = 0, targetYaw = 0, targetPitch = 0, drag;
  const captions = {
    3: ['01 / BRILLIANT CUT', 'Brilliant-cut 3D diamond with moving reflections.'],
    4: ['02 / TESSERACT', '4D tesseract projection with light moving along its edges.'],
    5: ['03 / PENTERACT', '5D penteract projection with spectral colour dispersion.']
  };
  const draw = () => {
    const state = { mode, time, yaw, pitch, angle: time * .63, phase: time * .85, dispersion: .92 };
    if (mode === 3 && heroGem) heroGem.draw(state);
    else heroModel.draw(state);
  };
  function schedule() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }
  function tick(now) {
    frame = 0;
    if (!visible || document.hidden) { last = 0; return; }
    if (effects && last) time += Math.min(.05, (now - last) / 1000);
    last = effects ? now : 0;
    const smooth = effects ? .13 : 1;
    yaw += (targetYaw - yaw) * smooth;
    pitch += (targetPitch - pitch) * smooth;
    draw();
    if (effects) schedule();
  }
  function setMode(next) {
    mode = next;
    time = yaw = pitch = targetYaw = targetPitch = last = 0;
    exhibit.dataset.mode = mode;
    document.querySelector('#hero-figure').textContent = captions[mode][0];
    document.querySelector('#hero-model-description').textContent = captions[mode][1];
    draw();
    if (motion && effects) {
      heroTransition?.complete();
      heroTransition = motion.animate(heroStage, { opacity: [.46, 1], scale: [.98, 1] },
        { duration: .52, ease: [.22, .7, .32, 1] });
    }
    schedule();
  }
  function turn(dx, dy) {
    targetYaw += dx;
    targetPitch = Math.max(-1.1, Math.min(1.1, targetPitch + dy));
    if (!effects) { yaw = targetYaw; pitch = targetPitch; draw(); }
    else schedule();
  }
  heroPanel.addEventListener('change', event => {
    if (event.target.name === 'hero-dimension') setMode(Number(event.target.value));
  });
  heroDrag.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY };
    heroDrag.setPointerCapture(event.pointerId);
  });
  heroDrag.addEventListener('pointermove', event => {
    if (!event.isPrimary || !drag) return;
    turn((event.clientX - drag.x) * .012, (event.clientY - drag.y) * .009);
    drag = { x: event.clientX, y: event.clientY };
  });
  heroDrag.addEventListener('lostpointercapture', () => { drag = null; });
  heroDrag.addEventListener('keydown', event => {
    const vectors = { ArrowLeft: [-.19, 0], ArrowRight: [.19, 0], ArrowUp: [0, -.15], ArrowDown: [0, .15] };
    const vector = vectors[event.key];
    if (!vector) return;
    event.preventDefault();
    turn(...vector);
  });
  const resize = () => { heroModel.size(); heroGem?.resize(); draw(); };
  new ResizeObserver(resize).observe(heroStage);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    exhibit.dataset.visible = String(visible);
    last = 0;
    schedule();
  }).observe(heroStage);
  document.addEventListener('visibilitychange', () => { last = 0; schedule(); });
  document.addEventListener('xazina:effects', () => { last = 0; schedule(); });
  exhibit.classList.add('is-live');
  heroPanel.hidden = heroDrag.hidden = false;
  resize();
  import('./gem-render.js?v=light-2').then(({ createGemRenderer }) => {
    heroGem = createGemRenderer(heroWebGL, heroStage, () => {
      heroGem = null;
      delete exhibit.dataset.renderer;
      draw();
    });
    if (heroGem) { exhibit.dataset.renderer = 'webgl'; draw(); }
    return createGemRenderer;
  }).then(createGemRenderer => {
    if (initLabGem && createGemRenderer) initLabGem(createGemRenderer);
  }).catch(() => {
    // Canvas still renders all three modes if the optional WebGL module fails.
  });
}

let initLabGem;

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
      alt: 'Interactive 3D projection of a faceted gemstone', verb: 'rotation' },
    4: { name: 'FIG 02 / TESSERACT', label: 'Time phase', max: 100, start: 0, unit: '%',
      hint: 'Scrub through one cycle of a rotating 4D cube projected into three dimensions.',
      alt: 'Interactive projection of a four-dimensional tesseract', verb: 'time' },
    5: { name: 'FIG 03 / PENTERACT', label: 'Light dispersion', max: 100, start: 62, unit: '%',
      hint: 'Split the light across the edges of a projected 5D cube.',
      alt: 'Interactive projection of a five-dimensional penteract with colour dispersion', verb: 'motion' }
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
  initLabGem = createGemRenderer => {
    labGem = createGemRenderer(byId('lab-webgl'), stage, () => {
      labGem = null;
      delete stage.dataset.renderer;
      draw();
    }, .94);
    if (labGem) { stage.dataset.renderer = 'webgl'; draw(); }
  };
}
