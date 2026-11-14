import { mountModel } from './model.js?v=prism-3';
import { mountOptics } from './optics.js?v=prism-3';

const acts = [
  { index: '01 / THE FORM', lines: ['A Study', 'in ', 'Light.'], caption: 'Lab-grown diamond jewellery and fine fragrance. Three scenes play as you watch.', mark: '01 / REFLECTION' },
  { index: '02 / TIME', lines: ['A moment,', 'un', 'folded.'], caption: 'A single cut, separated into moments. Scroll to move through them.', mark: '02 / TIME SLICE' },
  { index: '03 / SPECTRUM', lines: ['Light', 'comes ', 'apart.'], caption: 'One white beam, split into a spectrum. The colour was there all along.', mark: '03 / DISPERSION' }
];
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));

export function mountStory({ motion, media, onEffects }) {
  const story = document.querySelector('#light-story');
  const film = document.querySelector('#film');
  const title = document.querySelector('#hero-title');
  const caption = document.querySelector('#film-caption');
  const index = document.querySelector('#film-index');
  const coordinates = document.querySelector('#film-coordinates');
  const next = document.querySelector('#next-act');
  const controls = document.querySelector('#film-controls');
  const splitter = film.querySelector('.film-split');
  const structure = document.querySelector('#structure-toggle');
  const pause = document.querySelector('#effects-toggle');
  const shots = [...film.querySelectorAll('.film-shot')];
  const buttons = [...film.querySelectorAll('[data-act-button]')];
  const opticalCanvas = document.querySelector('#film-optics');
  const optics = mountOptics(opticalCanvas);
  const model = mountModel(document.querySelector('#film-projection'));
  const glCanvas = document.querySelector('#film-gem');
  let effects = !media.matches, act = 0, isStructure = false, visible = true;
  let sceneProgress = 0, chapterProgress = 0, activeAnimations = [], sceneObserver;
  let frame = 0, start = 0, time = 0, x = 0, y = 0, toX = 0, toY = 0;
  let focused = false, gem, gemLoading = false, scrollOverride = null, scrolling;
  const dwell = 5.8;
  let nextCut = dwell, userDirected = false, anchorScroll = window.scrollY;

  function cancelTransitions() {
    for (const animation of activeAnimations) animation.stop();
    activeAnimations = [];
    for (const el of [title, caption, index, splitter]) {
      el.style.removeProperty('transform'); el.style.removeProperty('opacity');
    }
  }

  function decorate() {
    film.style.setProperty('--chapter-progress', chapterProgress.toFixed(3));
    film.style.setProperty('--zoom', (1.045 + sceneProgress * .20 + Math.sin(time * .63) * .026).toFixed(4));
    film.style.setProperty('--lens-x', `${x * -27}px`);
    film.style.setProperty('--lens-y', `${y * -17}px`);
    optics?.draw({ act, time, scroll: sceneProgress, x, y, focused, structure: isStructure });
    if (!isStructure) return;
    const state = { mode: act + 3, time, yaw: x * .72, pitch: y * .39,
      angle: time * .57 + sceneProgress * 2.7, phase: time * .62 + sceneProgress * 5.1,
      dispersion: .94 };
    if (act === 0 && gem) gem.draw(state);
    else model?.draw(state);
  }

  function animateCut() {
    cancelTransitions();
    if (!motion || !effects) return;
    for (const [i, el] of [index, title, caption].entries()) {
      activeAnimations.push(motion.animate(el, { opacity: [.34, 1], y: [24 + i * 7, 0] },
        { duration: .61 + i * .07, ease: [.16,.8,.23,1] }));
    }
    activeAnimations.push(motion.animate(splitter, { x: ['-76%','0%','69%'], opacity: [0,.76,0] },
      { duration: .94, ease: [.3,.68,.23,1] }));
  }

  function show(nextAct, cut = true) {
    if (nextAct === act && cut) return;
    act = nextAct;
    const d = acts[act];
    film.dataset.act = act;
    title.replaceChildren(d.lines[0], document.createElement('br'), d.lines[1], Object.assign(document.createElement('em'), { textContent:d.lines[2] }));
    caption.textContent = d.caption;
    index.textContent = d.index;
    coordinates.textContent = d.mark;
    next.querySelector('span').textContent = act === 2 ? 'Continue to jewellery' : 'Next scene';
    buttons.forEach((button, i) => {
      if (i === act) button.setAttribute('aria-current','step');
      else button.removeAttribute('aria-current');
    });
    shots.forEach((shot, i) => shot.classList.toggle('current', i === act));
    if (cut) animateCut();
    decorate();
  }

  function updateScroll() {
    if (!effects || !userDirected) return;
    const { top, height } = story.getBoundingClientRect();
    const total = Math.max(1, height - film.offsetHeight);
    sceneProgress = clamp(-top / total);
    const nextAct = sceneProgress < .31 ? 0 : sceneProgress < .67 ? 1 : 2;
    if (scrollOverride === null) show(nextAct);
    const interval = [[0,.31],[.31,.67],[.67,1]][act];
    chapterProgress = clamp((sceneProgress - interval[0]) / (interval[1] - interval[0]), .07);
    if (!frame) schedule();
  }

  function scrollToAct(i) {
    userDirected = true;
    nextCut = time + dwell;
    if (i > 2) {
      document.querySelector('#jewellery').scrollIntoView({ behavior: effects ? 'smooth' : 'instant' });
      return;
    }
    show(i);
    if (!effects) return;
    scrollOverride = i;
    clearTimeout(scrolling);
    const total = Math.max(0, story.offsetHeight - film.offsetHeight);
    window.scrollTo({ top: story.getBoundingClientRect().top + scrollY + [0,.41,.76][i] * total, behavior:'smooth' });
    scrolling = setTimeout(() => { scrollOverride = null; updateScroll(); }, 750);
  }

  function schedule() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  function tick(now) {
    frame = 0;
    if (!visible || document.hidden) { start = 0; return; }
    if (effects && start) time += Math.min((now - start) / 1000, .05);
    start = effects ? now : 0;
    x += (toX - x) * .12; y += (toY - y) * .12;
    if (effects && !userDirected && !isStructure) {
      if (time >= nextCut) {
        nextCut = time + dwell;
        show((act + 1) % acts.length);
      }
      chapterProgress = clamp(1 - (nextCut - time) / dwell, .07);
    }
    decorate();
    if (effects) schedule();
  }

  function setEffects(nextEffects) {
    if (nextEffects === effects && story.classList.contains('is-ready')) return;
    const previousTop = story.getBoundingClientRect().top;
    const restoreAfterFilm = previousTop + story.offsetHeight <= 2;
    const oldHeight = story.offsetHeight;
    effects = nextEffects;
    story.classList.toggle('is-flat', !effects);
    document.documentElement.dataset.effects = effects ? 'on' : 'off';
    opticalCanvas.hidden = !effects;
    pause.textContent = effects ? 'Pause motion' : 'Play motion';
    pause.setAttribute('aria-pressed', String(!effects));
    clearTimeout(scrolling);
    scrollOverride = null;
    if (!effects) cancelTransitions();
    if (restoreAfterFilm) window.scrollBy({top:story.offsetHeight - oldHeight,behavior:'instant'});
    else if (previousTop < -1) {
      if (effects) {
        const target = [0,.41,.76][act] * Math.max(0, story.offsetHeight - film.offsetHeight);
        window.scrollTo({top:scrollY + previousTop + target, behavior:'instant'});
      } else window.scrollTo({top:scrollY + previousTop, behavior:'instant'});
    } else if (effects && act !== 0) scrollToAct(act);
    if (effects) { optics?.size(); updateScroll(); }
    else decorate();
    onEffects(effects);
    start = 0;
    schedule();
  }

  function resize() {
    optics?.size(); model?.size(); gem?.resize();
    updateScroll();
    decorate();
  }

  controls.hidden = false;
  setEffects(effects);
  story.classList.add('is-ready');
  show(0, false);
  resize();

  buttons.forEach((button, i) => button.addEventListener('click', () => scrollToAct(i)));
  next.addEventListener('click', () => scrollToAct(act + 1));
  pause.addEventListener('click', () => setEffects(!effects));
  media.addEventListener('change', event => setEffects(!event.matches));
  structure.addEventListener('click', () => {
    isStructure = !isStructure;
    nextCut = time + dwell;
    film.classList.toggle('is-structure', isStructure);
    structure.setAttribute('aria-pressed', String(isStructure));
    structure.lastChild.textContent = isStructure ? ' Return to film' : ' Show geometry';
    if (isStructure && !gem && !gemLoading) {
      gemLoading = true;
      import('./gem-render.js?v=prism-3').then(({ createGemRenderer }) => {
        gem = createGemRenderer(glCanvas, glCanvas, () => {
          gem = null;
          delete film.dataset.renderer;
          decorate();
        }, 1.17);
        if (gem) { film.dataset.renderer = 'webgl'; gem.resize(); decorate(); }
      }).catch(() => {}).finally(() => { gemLoading = false; });
    }
    resize();
  });
  film.addEventListener('pointermove', event => {
    if (!effects || event.pointerType === 'touch') return;
    const box = film.getBoundingClientRect();
    toX = clamp((event.clientX - box.left) / box.width * 2 - 1, -1, 1);
    toY = clamp((event.clientY - box.top) / box.height * 2 - 1, -1, 1);
    focused = true;
  }, { passive:true });
  film.addEventListener('pointerleave', () => { toX = toY = 0; focused = false; });
  addEventListener('scroll', () => {
    if (Math.abs(window.scrollY - anchorScroll) > 12) userDirected = true;
    updateScroll();
  }, { passive:true });
  document.addEventListener('visibilitychange', () => { start = 0; schedule(); });
  new ResizeObserver(resize).observe(film);
  sceneObserver = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    start = 0;
    schedule();
  });
  sceneObserver.observe(film);
  updateScroll();
  schedule();
}
