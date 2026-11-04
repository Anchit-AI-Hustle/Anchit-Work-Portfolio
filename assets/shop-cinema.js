/* Unified RAF cinema for Gram Street Coffee and Deli Chic.
   Takes over walk placement when #walkProgressBar is present. */
(function () {
  'use strict';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var walk = document.getElementById('walkin') || document.getElementById('bwalkin');
  var shop = document.querySelector('.shop-cin');
  if (!walk && !shop) return;

  var isDeli = !!(document.getElementById('bwalkin') || (shop && shop.getAttribute('data-shop') === 'dc'));
  var worldName = isDeli ? 'oxblood' : 'lilac';
  var targetScroll = window.scrollY || 0;
  var currentScroll = targetScroll;
  var velocity = 0;
  var waveAmt = 0;
  var targetMouseX = 0, targetMouseY = 0, mouseX = 0, mouseY = 0;

  var planes = walk ? [].slice.call(walk.querySelectorAll('.walk-layer, .b-plane')) : [];
  var bar = walk ? walk.querySelector('#walkProgressBar') : document.getElementById('walkProgressBar');
  var lab = walk ? walk.querySelector('#walkProgressLabel') : document.getElementById('walkProgressLabel');
  var disp = document.getElementById('freq-disp-map');
  var chars = [];
  var portal = shop ? shop.querySelector('.portal') : document.querySelector('.portal');
  var portalSticky = portal ? portal.querySelector('.portal-sticky') : null;
  var disc = shop ? shop.querySelector('.disc-3d') : document.querySelector('.disc-3d');
  var sleeve = shop ? shop.querySelector('.sleeve-card') : document.querySelector('.sleeve-card');
  var curtain = shop ? shop.querySelector('.curtain-frame') : document.querySelector('.curtain-frame');
  var fanCards = shop ? [].slice.call(shop.querySelectorAll('.fan-card')) : [];
  var fanRead = shop ? shop.querySelector('[data-fan-readout]') : document.querySelector('[data-fan-readout]');
  var activeIndex = 2;
  var nodes = shop ? [].slice.call(shop.querySelectorAll('.node[data-depth]')) : [];
  var audio = null;
  var cap = document.getElementById('walkCap') || document.getElementById('bwalkCap');
  var step = document.getElementById('walkStep') || document.getElementById('bwalkStep');
  var hint = document.getElementById('walkHint') || document.getElementById('bwalkHint');
  var capT = 0, at = -1;
  var STEPS = isDeli ? [
    [0.00, '01 / The cold room', 'A boucherie, not a counter.', 'Cuts hang on a steel rail between 0 C and 4 C. Keep scrolling into the room.'],
    [0.22, '02 / What hangs there', 'Wood-smoked charcuterie.', 'German-style beechwood smoked frankfurters, and ribs rested over smoke.'],
    [0.44, '03 / The block', 'Hand-cut by master butchers.', 'Every portion weighed, trimmed and inspected before it is sealed.'],
    [0.66, '04 / Sealed for the door', 'Cold-chain to your table.', 'Vacuum-sealed, then two delivery windows a day across Delhi NCR.'],
    [0.84, '05 / Dispatch', 'Four NCR hubs.', 'Slot 1 10 AM to 1 PM. Slot 2 5 PM to 8 PM. Code WoW20 on Rs 999.']
  ] : [
    [0.00, '01 / The lilac streetfront', 'Outside on Arjun Marg.', 'A glass front painted lilac. Keep scrolling and the doorframe comes toward you.'],
    [0.22, '02 / Through the glass', 'Chrome along the doorframe.', 'The facade passes the edges of the screen. Street light gives way to the bar.'],
    [0.44, '03 / The room', 'Pendants and the back shelf.', 'Lilac glass, chrome accents, the compact 10-seater room coming toward you.'],
    [0.66, '04 / The chrome bar', 'Ten seats, brushed steel, the shot.', 'In-house roasts, ceremonial matcha and small-batch gelato, docked at the counter.'],
    [0.84, '05 / The shot', 'In your hand.', 'Nagaland Arabica dosed at 18.5 grams. Dual streams, tiger-striped crema, 9.2 bar.']
  ];

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function progress(el) {
    if (!el) return 0;
    var r = el.getBoundingClientRect();
    var span = r.height - window.innerHeight;
    if (span <= 0) return clamp(-r.top / Math.max(r.height, 1), 0, 1);
    return clamp(-r.top / span, 0, 1);
  }

  [].forEach.call((shop || document).querySelectorAll('[data-wave-title]'), function (el) {
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
    [].forEach.call(document.querySelectorAll('.marquee-wrap, .eq, .disc-sheen, .show-card, .fan-block, .blueprint'), function (n) {
      io.observe(n);
    });
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
    var zTravel = 280 + p * 3400;
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
      plane.style.zIndex = String(Math.round(z + 4000));
      var o = 1;
      if (z > 120) o = clamp(1 - (z - 120) / 280, 0, 1);
      if (z < -800) o = Math.min(o, clamp((z + 1050) / 250, 0, 1));
      plane.style.opacity = o.toFixed(3);
      plane.style.visibility = o < 0.04 ? 'hidden' : 'visible';
    }
    var facade = document.getElementById('walkFacade');
    var flare = document.getElementById('walkFlare');
    if (facade) {
      var sc = p < 0.18 ? 1 : p < 0.56 ? 1 + ((p - 0.18) / 0.38) * 3.2 : 4.2;
      var fo = p < 0.18 ? 1 : p < 0.42 ? 1 - (p - 0.18) / 0.24 : 0;
      facade.style.scale = sc.toFixed(3);
      facade.style.opacity = fo.toFixed(3);
    }
    if (flare) {
      var fl = p < 0.16 ? 0 : p < 0.28 ? (p - 0.16) / 0.12 : p < 0.42 ? 1 - (p - 0.28) / 0.14 : 0;
      flare.style.opacity = Math.max(0, fl).toFixed(3);
    }
    if (hint) hint.style.opacity = (1 - clamp(p / 0.08, 0, 1)).toFixed(3);
    var k = 0;
    for (var j = 0; j < STEPS.length; j++) if (p >= STEPS[j][0]) k = j;
    if (k !== at) {
      at = k;
      if (step) step.textContent = STEPS[k][1];
      if (cap) {
        clearTimeout(capT);
        cap.style.opacity = '0';
        cap.style.transform = 'translateY(10px)';
        var S = STEPS[k];
        capT = setTimeout(function () {
          cap.innerHTML = '<b>' + S[2] + '</b><span>' + S[3] + '</span>';
          cap.style.opacity = '1';
          cap.style.transform = 'none';
        }, 160);
      }
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
    var slide = clamp((p - 0.22) / 0.5, 0, 1);
    var x = -28 * slide;
    disc.style.transform = 'translate3d(' + x.toFixed(2) + '%, 0, 0) rotate(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
    if (portalSticky) {
      if (p > 0.28 && p < 0.82) portalSticky.setAttribute('data-world', worldName);
      else portalSticky.removeAttribute('data-world');
    }
    document.body.removeAttribute('data-world');
    if (sleeve) {
      sleeve.style.opacity = slide.toFixed(3);
      sleeve.style.transform = 'translate(' + (18 - 18 * slide).toFixed(2) + '%, -50%)';
      sleeve.classList.toggle('is-on', slide > 0.35);
    }
  }

  function placeCurtain() {
    if (!curtain) return;
    var r = curtain.getBoundingClientRect();
    var p = reduce ? 1 : clamp((window.innerHeight - r.top) / (window.innerHeight + r.height * 0.35), 0, 1);
    curtain.style.setProperty('--curtain', p.toFixed(3));
  }

  function placeFan() {
    fanCards.forEach(function (card, i) {
      var offset = i - activeIndex;
      card.style.zIndex = String(20 - Math.abs(offset));
      card.style.opacity = String(Math.abs(offset) > 2 ? 0 : 1);
      card.style.transform = 'translate3d(' + (offset * 168) + 'px, calc(-50% + ' + (Math.abs(offset) * 12) + 'px), ' + (Math.abs(offset) * -80) + 'px) rotateZ(' + (offset * 7) + 'deg)';
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

  if (cap) cap.style.transition = 'opacity .34s ease, transform .34s cubic-bezier(.16,1,.3,1)';

  if (reduce) {
    if (disp) disp.setAttribute('scale', '0');
    placeWalk(0);
    if (lab) lab.textContent = '0% DEPTH';
    if (bar) bar.style.width = '0%';
    placeFan();
    placeCurtain();
  } else {
    placeFan();
    requestAnimationFrame(tick);
  }

  window.__shopCinemaWalk = true;

  fanCards.forEach(function (card, i) {
    card.addEventListener('click', function () { activeIndex = i; placeFan(); });
  });
  var prev = shop ? shop.querySelector('[data-fan="prev"]') : document.querySelector('[data-fan="prev"]');
  var next = shop ? shop.querySelector('[data-fan="next"]') : document.querySelector('[data-fan="next"]');
  if (prev) prev.addEventListener('click', function () { activeIndex = (activeIndex + fanCards.length - 1) % fanCards.length; placeFan(); });
  if (next) next.addEventListener('click', function () { activeIndex = (activeIndex + 1) % fanCards.length; placeFan(); });

  [].forEach.call((shop || document).querySelectorAll('.show-card'), function (card) {
    card.addEventListener('pointermove', function (e) {
      if (reduce) return;
      var r = card.getBoundingClientRect();
      var x = ((e.clientX - r.left) / r.width - 0.5) * 10;
      var y = ((e.clientY - r.top) / r.height - 0.5) * -10;
      card.style.transform = 'perspective(700px) rotateX(' + y.toFixed(2) + 'deg) rotateY(' + x.toFixed(2) + 'deg)';
    });
    card.addEventListener('pointerleave', function () { card.style.transform = ''; });
  });

  var tabs = shop ? [].slice.call(shop.querySelectorAll('[data-tab]')) : [];
  var cells = shop ? [].slice.call(shop.querySelectorAll('[data-track]')) : [];
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var key = tab.getAttribute('data-tab');
      tabs.forEach(function (t) { t.setAttribute('aria-pressed', String(t === tab)); });
      cells.forEach(function (c) {
        c.hidden = !(key === 'all' || c.getAttribute('data-cat') === key);
      });
    });
  });

  document.addEventListener('click', function (e) {
    var add = e.target.closest('[data-add-sku]');
    if (add) {
      var sku = add.getAttribute('data-add-sku');
      if (window.addToCart) window.addToCart(sku);
      else if (typeof window.addToBasket === 'function') window.addToBasket(sku);
      return;
    }
    var sub = e.target.closest('[data-sub-sku]');
    if (!sub) return;
    var take = sub.getAttribute('data-sub-sku');
    if (window.removeCartSku) window.removeCartSku(take);
    else if (typeof window.removeBasketSku === 'function') window.removeBasketSku(take);
  });

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
    filter.type = isDeli ? 'bandpass' : 'lowpass';
    filter.frequency.value = isDeli ? 2400 : 280;
    if (isDeli) filter.Q.value = 0.7;
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
    tone(isDeli ? 90 : 110, 'sine', 0.03);
    tone(isDeli ? 180 : 165, 'triangle', 0.016);
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
    if (play) play.textContent = on ? '❚❚ LIVE AUDIO' : (isDeli ? '▶ ATELIER AMBIENCE' : '▶ CAFE SOUNDSCAPE');
    [].forEach.call(document.querySelectorAll('.eq-bar'), function (b) { b.classList.toggle('is-live', on && !a.muted); });
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

  var clock = document.getElementById('cinClock');
  var hours = document.getElementById('shopHours');
  function stamp() {
    var now;
    try { now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })); }
    catch (e) { now = new Date(); }
    var h = now.getHours() + now.getMinutes() / 60;
    var open = isDeli ? (h >= 10 && h < 13) || (h >= 17 && h < 20) : (h >= 8.5 && h < 22.5);
    var label = open ? 'OPEN NOW' : 'CLOSED';
    if (hours) hours.textContent = label;
    if (clock) {
      try {
        clock.textContent = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST · ' + label;
      } catch (err) { clock.textContent = 'India Standard Time'; }
    }
  }
  stamp();
  setInterval(stamp, 30000);

  [].forEach.call(document.querySelectorAll('[data-apply-wow20]'), function (promo) {
    promo.addEventListener('click', function () {
      if (typeof window.applyPromo === 'function') {
        var input = document.getElementById('promoInput');
        if (input) input.value = 'WoW20';
        window.applyPromo();
      }
    });
  });
})();
