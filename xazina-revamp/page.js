import { mountModel } from './model.js';

const media = matchMedia('(prefers-reduced-motion: reduce)');
const motion = window.Motion;
if (motion && !media.matches) {
  const { animate, stagger, inView, scroll } = motion;
  const intro = animate('[data-intro]', { opacity: [0, 1], y: [20, 0] },
    { duration: .74, delay: stagger(.08, { startDelay: .05 }), ease: [.21, .72, .26, 1] });
  const clean = inView('[data-reveal]', element => {
    if (media.matches || element.getBoundingClientRect().top < innerHeight * .28) return;
    animate(element, { opacity: [.45, 1], y: [19, 0] },
      { duration: .54, ease: [.21, .72, .26, 1] });
  }, { amount: .22 });
  const heroImg = document.querySelector('.hero-image img');
  const parallax = scroll(animate(heroImg, { y: [0, 56], scale: [1, 1.065] }, { ease: 'linear' }),
    { target: document.querySelector('.hero'), offset: ['start start', 'end start'] });
  media.addEventListener('change', event => {
    if (!event.matches) return;
    intro.complete();
    clean();
    parallax();
    heroImg.style.transform = '';
  }, { once: true });
}

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
  let mode = 3, playing = !media.matches, visible = false, frame = 0, last = 0;
  let value = 0, time = 0, yaw = 0, pitch = 0, drag = null;
  let targetYaw = 0, targetPitch = 0;

  function readout() {
    const n = Math.round(value), entry = modes[mode];
    input.value = String(n);
    input.setAttribute('aria-valuetext', `${n} ${entry.unit === '°' ? 'degrees' : 'percent'}`);
    output.value = n + entry.unit;
  }

  function draw() {
    lab.draw({ mode, time, yaw, pitch, angle: value * Math.PI / 180,
      phase: value * Math.PI / 50, dispersion: value / 100 });
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
      if (mode === 3) value = (value + dt * 15) % 360;
      if (mode === 4) value = (value + dt * 9) % 100;
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
    if (animate && motion && !media.matches) {
      motion.animate(canvas, { opacity: [.38, 1], scale: [.985, 1] }, { duration: .32 });
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
  media.addEventListener('change', event => {
    if (event.matches) setPlaying(false);
  });
  document.addEventListener('visibilitychange', () => {
    last = 0;
    schedule();
  });
  stage.classList.add('is-live');
  controls.hidden = false;
  new ResizeObserver(() => { lab.size(); draw(); }).observe(stage);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    last = 0;
    schedule();
  }).observe(stage);
  lab.size();
  switchMode(3, false);
}
