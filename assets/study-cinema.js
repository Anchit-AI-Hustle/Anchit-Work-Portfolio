(function () {
  'use strict';
  var root = document.querySelector('.cinema');
  if (!root) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var brand = root.getAttribute('data-brand') || 'th';
  var storageKey = brand === 'et' ? 'et-study-brief' : 'th-study-brief';
  var orderKey = storageKey + '-last';
  var wa = '919873945238';
  var studyName = brand === 'et' ? 'ET Study' : 'Times Health Study';

  var targetScroll = window.scrollY || 0;
  var currentScroll = targetScroll;
  var velocity = 0;
  var waveAmt = 0;
  var targetMouseX = 0, targetMouseY = 0, mouseX = 0, mouseY = 0;

  var walk = root.querySelector('.walk');
  var planes = [].slice.call(root.querySelectorAll('.w-plane'));
  var bar = document.getElementById('walkProgressBar');
  var lab = document.getElementById('walkProgressLabel');
  var disp = document.getElementById('freq-disp-map');
  var chars = [];
  var portal = root.querySelector('.portal');
  var disc = root.querySelector('.disc-3d');
  var sleeve = root.querySelector('.sleeve-card');
  var curtain = root.querySelector('.curtain-frame');
  var fanCards = [].slice.call(root.querySelectorAll('.fan-card'));
  var fanRead = root.querySelector('[data-fan-readout]');
  var activeIndex = 2;
  var nodes = [].slice.call(root.querySelectorAll('.node[data-depth]'));
  var drawerStep = 'bag';
  var cart = [];
  var lastOrder = null;
  var audio = null;

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function progress(el) {
    if (!el) return 0;
    var r = el.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    if (span <= 0) return clamp(-r.top / Math.max(r.height, 1), 0, 1);
    return clamp(-r.top / span, 0, 1);
  }

  [].forEach.call(root.querySelectorAll('[data-wave-title]'), function (el) {
    var text = el.textContent;
    el.textContent = '';
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement('span');
      s.className = 'char';
      s.dataset.idx = String(i);
      s.textContent = text[i] === ' ' ? '\u00a0' : text[i];
      el.appendChild(s);
      chars.push({ el: s, i: i });
    }
  });

  if (!reduce && walk) walk.classList.add('is-armed');

  window.addEventListener('pointermove', function (e) {
    targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
    targetMouseY = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('in-view', en.isIntersecting); });
    }, { threshold: 0.05 });
    [].forEach.call(root.querySelectorAll('.marquee-wrap, .eq, .cin-grain, .disc-sheen, .show-card, .fan-block, .blueprint'), function (n) { io.observe(n); });
    if (walk) {
      new IntersectionObserver(function (en) {
        var hit = en[0];
        walk.classList.toggle('is-before', hit.boundingClientRect.top > 0);
        walk.classList.toggle('is-past', hit.boundingClientRect.bottom < 0);
        var live = hit.isIntersecting;
        planes.forEach(function (p) { p.style.willChange = live ? 'transform, opacity' : 'auto'; });
      }, { threshold: 0 }).observe(walk);
    }
  }

  function placeWalk(p) {
    if (!walk || !planes.length) return;
    var zTravel = p * 3400;
    var pct = Math.round(p * 100);
    if (bar) bar.style.width = pct + '%';
    if (lab) lab.textContent = pct + '% DEPTH';
    if (reduce) return;
    for (var i = 0; i < planes.length; i++) {
      var plane = planes[i];
      var z0 = +plane.getAttribute('data-z0');
      var z = z0 + zTravel;
      var depth = Math.abs(z0) / 3600;
      var px = mouseX * 18 * (1 - depth);
      var py = mouseY * 14 * (1 - depth);
      plane.style.transform = 'translate3d(calc(-50% + ' + px.toFixed(2) + 'px), calc(-50% + ' + py.toFixed(2) + 'px), ' + z.toFixed(1) + 'px) rotateX(' + (-mouseY * 2.5).toFixed(2) + 'deg) rotateY(' + (mouseX * 3.5).toFixed(2) + 'deg)';
      var o = 1;
      if (z > 180) o = clamp(1 - (z - 180) / 420, 0, 1);
      if (z < -3200) o = clamp((z + 3600) / 400, 0, 1);
      plane.style.opacity = o.toFixed(3);
    }
  }

  function placeWave() {
    if (reduce) {
      if (disp) disp.setAttribute('scale', '0');
      return;
    }
    var live = waveAmt > 0.01;
    for (var i = 0; i < chars.length; i++) {
      var c = chars[i];
      if (!live) { c.el.style.transform = ''; continue; }
      var phase = (currentScroll * 0.025) + (c.i * 0.55);
      var scaleY = 1 + Math.sin(phase) * waveAmt * 0.42;
      var shiftY = Math.cos(phase) * waveAmt * -14;
      c.el.style.transform = 'translate3d(0, ' + shiftY.toFixed(2) + 'px, 0) scaleY(' + scaleY.toFixed(3) + ')';
    }
    if (disp) disp.setAttribute('scale', live ? (waveAmt * 22).toFixed(1) : '0');
  }

  function placeDisc(p) {
    if (!disc) return;
    var spin = clamp(p / 0.45, 0, 1);
    var rot = spin * 720;
    var sc = 0.68 + spin * 0.5;
    var slide = clamp((p - 0.55) / 0.45, 0, 1);
    var x = -28 * slide;
    disc.style.transform = 'translate3d(' + x.toFixed(2) + '%, 0, 0) rotate(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
    if (p >= 0.35 && p <= 0.65) document.body.setAttribute('data-world', 'accent');
    else document.body.removeAttribute('data-world');
    if (sleeve) {
      sleeve.style.opacity = slide.toFixed(3);
      sleeve.style.transform = 'translate(' + (18 - 18 * slide).toFixed(2) + '%, -50%)';
      sleeve.classList.toggle('is-on', slide > 0.55);
    }
  }

  function placeCurtain() {
    if (!curtain) return;
    var r = curtain.getBoundingClientRect();
    var p = clamp((window.innerHeight - r.top) / (window.innerHeight + r.height * 0.45), 0, 1);
    curtain.style.setProperty('--curtain', p.toFixed(3));
  }

  function placeFan() {
    fanCards.forEach(function (card, i) {
      var offset = i - activeIndex;
      card.style.zIndex = String(20 - Math.abs(offset));
      card.style.opacity = String(Math.abs(offset) > 2 ? 0 : 1);
      card.style.transform = 'translate3d(' + (offset * 195) + 'px, ' + (Math.abs(offset) * 28) + 'px, ' + (Math.abs(offset) * -90) + 'px) rotateZ(' + (offset * 8) + 'deg)';
      card.setAttribute('aria-current', i === activeIndex ? 'true' : 'false');
    });
    var on = fanCards[activeIndex];
    if (fanRead && on) fanRead.textContent = on.getAttribute('data-detail') || '';
  }

  function placeNodes() {
    if (reduce) return;
    nodes.forEach(function (n) {
      var d = parseFloat(n.getAttribute('data-depth')) || 1;
      n.style.transform = 'translate3d(' + (mouseX * 10 * d).toFixed(2) + 'px, ' + (mouseY * 8 * d).toFixed(2) + 'px, 0)';
    });
  }

  function tick() {
    targetScroll = window.scrollY || 0;
    currentScroll += (targetScroll - currentScroll) * 0.11;
    velocity = targetScroll - currentScroll;
    waveAmt = Math.min(1, Math.abs(velocity) / 95);
    mouseX += (targetMouseX - mouseX) * 0.08;
    mouseY += (targetMouseY - mouseY) * 0.08;
    placeWalk(progress(walk));
    placeWave();
    placeDisc(progress(portal));
    placeCurtain();
    placeNodes();
    requestAnimationFrame(tick);
  }

  if (reduce) {
    if (disp) disp.setAttribute('scale', '0');
    placeWalk(0);
    if (lab) lab.textContent = '0% DEPTH';
    if (bar) bar.style.width = '0%';
    placeFan();
  } else {
    placeFan();
    requestAnimationFrame(tick);
  }

  fanCards.forEach(function (card, i) {
    card.addEventListener('click', function () { activeIndex = i; placeFan(); });
  });
  var prev = root.querySelector('[data-fan="prev"]');
  var next = root.querySelector('[data-fan="next"]');
  if (prev) prev.addEventListener('click', function () { activeIndex = (activeIndex + fanCards.length - 1) % fanCards.length; placeFan(); });
  if (next) next.addEventListener('click', function () { activeIndex = (activeIndex + 1) % fanCards.length; placeFan(); });

  [].forEach.call(root.querySelectorAll('.show-card'), function (card) {
    card.addEventListener('pointermove', function (e) {
      if (reduce) return;
      var r = card.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width - 0.5) * 10;
      var y = ((e.clientY - r.top) / r.height - 0.5) * -10;
      card.style.transform = 'perspective(700px) rotateX(' + y.toFixed(2) + 'deg) rotateY(' + x.toFixed(2) + 'deg)';
    });
    card.addEventListener('pointerleave', function () { card.style.transform = ''; });
  });

  var tabs = [].slice.call(root.querySelectorAll('[data-tab]'));
  var cells = [].slice.call(root.querySelectorAll('[data-track]'));
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var key = tab.getAttribute('data-tab');
      tabs.forEach(function (t) { t.setAttribute('aria-pressed', String(t === tab)); });
      cells.forEach(function (c) {
        c.hidden = !(key === 'all' || c.getAttribute('data-cat') === key);
      });
    });
  });

  /* Ambient sound: filtered noise + two oscillators. Starts only on a press. */
  function bootAudio() {
    if (audio) return audio;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    var ctx = new Ctx();
    var master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    var buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < data.length; i++) {
      var white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.4;
    }
    var noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = brand === 'et' ? 420 : 280;
    noise.connect(filter);
    filter.connect(master);
    function tone(freq, type, gain) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(master);
      o.start();
    }
    tone(brand === 'et' ? 98 : 110, 'sine', 0.03);
    tone(brand === 'et' ? 196 : 165, 'triangle', 0.016);
    noise.start();
    audio = { ctx: ctx, master: master, muted: false, playing: false };
    return audio;
  }
  function setLive(on) {
    var a = bootAudio();
    if (!a) return;
    a.playing = on;
    if (a.ctx.state === 'suspended') a.ctx.resume();
    a.master.gain.cancelScheduledValues(a.ctx.currentTime);
    a.master.gain.exponentialRampToValueAtTime(on && !a.muted ? 0.12 : 0.0001, a.ctx.currentTime + 0.25);
    var play = document.getElementById('cinPlay');
    if (play) play.textContent = on ? '❚❚ PLAYING' : '▶ AMBIENT SOUND';
    [].forEach.call(root.querySelectorAll('.eq-bar'), function (b) { b.classList.toggle('is-live', on && !a.muted); });
  }
  var muteBtn = document.getElementById('cinMute');
  var playBtn = document.getElementById('cinPlay');
  if (playBtn) playBtn.addEventListener('click', function () {
    var a = bootAudio();
    if (!a) return;
    setLive(!a.playing);
  });
  if (muteBtn) muteBtn.addEventListener('click', function () {
    var a = bootAudio();
    if (!a) return;
    a.muted = !a.muted;
    muteBtn.textContent = a.muted ? '🔇 MUTE' : '🔊 LIVE';
    if (a.playing) setLive(true);
  });

  /* Briefing drawer: bag, details, confirmed. */
  function loadState() {
    try { cart = JSON.parse(localStorage.getItem(storageKey) || '[]') || []; } catch (e) { cart = []; }
    try { lastOrder = JSON.parse(localStorage.getItem(orderKey) || 'null'); } catch (e) { lastOrder = null; }
    if (lastOrder && lastOrder.step === 'done') drawerStep = 'done';
  }
  function saveCart() {
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch (e) {}
  }
  function badge() {
    var n = cart.reduce(function (s, x) { return s + x.qty; }, 0);
    var b = document.getElementById('cinBagBtn');
    if (b) b.textContent = 'Briefing' + (n ? ' · ' + n : '');
    [].forEach.call(root.querySelectorAll('[data-sku]'), function (btn) {
      var sku = btn.getAttribute('data-sku');
      var hit = cart.find(function (x) { return x.sku === sku; });
      btn.textContent = hit ? String(hit.qty) : '+';
    });
  }
  function addToCart(item) {
    if (drawerStep === 'done') drawerStep = 'bag';
    var hit = cart.find(function (x) { return x.sku === item.sku; });
    if (hit) hit.qty += 1;
    else cart.push({ sku: item.sku, title: item.title, qty: 1 });
    saveCart();
    badge();
    openDrawer();
    showStep();
  }
  function summaryText(order) {
    var lines = [studyName + ' briefing'];
    (order.items || cart).forEach(function (x) { lines.push(x.qty + ' × ' + x.title + ' (' + x.sku + ')'); });
    if (order.name) lines.push('From: ' + order.name);
    if (order.note) lines.push(order.note);
    lines.push('anchit-tandon.com/' + (brand === 'et' ? 'ET_Study' : 'TimesHealth_Study'));
    return lines.join('\n');
  }
  var drawer = document.getElementById('cinDrawer');
  function openDrawer() { if (drawer) { drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); } }
  function closeDrawer() { if (drawer) { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); } }
  function showStep() {
    ['bag', 'details', 'done'].forEach(function (s) {
      var el = document.getElementById('cinStep-' + s);
      if (el) el.hidden = s !== drawerStep;
    });
    var list = document.getElementById('cinCartList');
    if (list && drawerStep === 'bag') {
      list.innerHTML = cart.length ? cart.map(function (x) {
        return '<div class="item"><span>' + x.qty + ' × ' + x.title + '</span><button type="button" class="cin-pill" data-drop="' + x.sku + '">Remove</button></div>';
      }).join('') : '<p>Nothing in the briefing yet. Add an idea from the matrix.</p>';
    }
    if (drawerStep === 'done') {
      var pre = document.getElementById('cinOrderPre');
      if (pre && lastOrder) pre.textContent = summaryText(lastOrder);
    }
  }
  document.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add]');
    if (add) {
      addToCart({ sku: add.getAttribute('data-sku'), title: add.getAttribute('data-title') });
    }
    var drop = e.target.closest('[data-drop]');
    if (drop) {
      cart = cart.filter(function (x) { return x.sku !== drop.getAttribute('data-drop'); });
      saveCart(); badge(); showStep();
    }
  });
  var bagBtn = document.getElementById('cinBagBtn');
  if (bagBtn) bagBtn.addEventListener('click', function () { openDrawer(); showStep(); });
  var closeBtn = document.getElementById('cinDrawerClose');
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  var toDetails = document.getElementById('cinToDetails');
  if (toDetails) toDetails.addEventListener('click', function () {
    if (!cart.length) return;
    drawerStep = 'details';
    showStep();
  });
  var detailsForm = document.getElementById('cinStep-details');
  if (detailsForm) detailsForm.addEventListener('submit', function (e) {
    e.preventDefault();
    lastOrder = {
      step: 'done',
      name: (document.getElementById('cinName') || {}).value || '',
      note: (document.getElementById('cinNote') || {}).value || '',
      items: cart.slice()
    };
    try { localStorage.setItem(orderKey, JSON.stringify(lastOrder)); } catch (err) {}
    var text = summaryText(lastOrder);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        var b = document.getElementById('cinCopied');
        if (b) { b.classList.add('on'); setTimeout(function () { b.classList.remove('on'); }, 1800); }
      }).catch(function () {});
    }
    var waBtn = document.getElementById('cinWa');
    if (waBtn) waBtn.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent(text);
    drawerStep = 'done';
    showStep();
  });
  var copyBtn = document.getElementById('cinCopy');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    if (!lastOrder) return;
    var text = summaryText(lastOrder);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
    var b = document.getElementById('cinCopied');
    if (b) { b.classList.add('on'); setTimeout(function () { b.classList.remove('on'); }, 1800); }
  });

  loadState();
  badge();
  showStep();

  var clock = document.getElementById('cinClock');
  if (clock) {
    function stamp() {
      try {
        clock.textContent = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST';
      } catch (e) { clock.textContent = 'India Standard Time'; }
    }
    stamp();
    setInterval(stamp, 30000);
  }
})();
