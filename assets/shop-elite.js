/* Shared upgrades for Gram Street Coffee and Deli Chic.
   Each page only runs the branch that matches its markup.
   Motion stays on transform, opacity, scale and rotate. Loops stop off screen. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function pillCursor(zones) {
    if (!fine) return;
    var pill = document.createElement('div');
    pill.className = 'ctx-pill';
    document.body.appendChild(pill);
    var label = '', px = 0, py = 0, raf = 0;
    var roots = zones.map(function (z) { return [document.querySelector(z[0]), z[1]]; });
    function paint() {
      raf = 0;
      pill.style.translate = (px + 16) + 'px ' + (py + 18) + 'px';
      var hit = document.elementFromPoint(px, py);
      var next = '';
      if (hit) {
        for (var i = 0; i < roots.length; i++) {
          if (roots[i][0] && roots[i][0].contains(hit)) { next = roots[i][1]; break; }
        }
      }
      if (next !== label) {
        label = next;
        pill.textContent = next;
        pill.classList.toggle('on', !!next);
      }
    }
    window.addEventListener('pointermove', function (e) {
      px = e.clientX; py = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
  }

  function flyTo(fromEl, badge) {
    if (!fromEl || !badge || reduce) return;
    var img = fromEl.querySelector('img');
    if (!img) return;
    var a = img.getBoundingClientRect();
    var b = badge.getBoundingClientRect();
    var ghost = img.cloneNode(true);
    ghost.style.cssText = 'position:fixed;z-index:1000001;width:48px;height:48px;object-fit:cover;border-radius:12px;pointer-events:none;left:0;top:0;margin:0;';
    document.body.appendChild(ghost);
    var x0 = a.left, y0 = a.top;
    var x1 = (a.left + b.left) / 2;
    var y1 = Math.min(a.top, b.top) - 90;
    var x2 = b.left, y2 = b.top;
    var t0 = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - t0) / 700);
      var u = 1 - t;
      var x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
      var y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
      ghost.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
      ghost.style.scale = (1 - t * 0.65).toFixed(3);
      if (t < 1) requestAnimationFrame(frame);
      else {
        ghost.remove();
        badge.animate(
          [{ scale: '1' }, { scale: '1.25' }, { scale: '1' }],
          { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' }
        );
      }
    }
    requestAnimationFrame(frame);
  }

  function kinetic(selector) {
    if (reduce) return;
    var lastY = window.scrollY, vel = 0, raf = 0;
    var nodes = [];
    var lastTilt = 0;
    function apply() {
      raf = 0;
      vel *= 0.82;
      var tilt = clamp(vel * 0.08, -3, 3);
      if (Math.abs(tilt - lastTilt) > 0.04) {
        lastTilt = tilt;
        var text = tilt.toFixed(2) + 'deg';
        for (var i = 0; i < nodes.length; i++) nodes[i].style.rotate = text;
      }
      if (Math.abs(vel) > 0.05) raf = requestAnimationFrame(apply);
      else if (lastTilt !== 0) {
        lastTilt = 0;
        for (var j = 0; j < nodes.length; j++) nodes[j].style.rotate = '0deg';
      }
    }
    window.addEventListener('scroll', function () {
      if (!nodes.length) nodes = [].slice.call(document.querySelectorAll(selector));
      var y = window.scrollY;
      vel = clamp(y - lastY, -25, 25);
      lastY = y;
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
  }

  /* ── Gram Street ─────────────────────────────────────────────── */
  if (document.getElementById('walkin')) {
    var facade = document.getElementById('walkFacade');
    var reflect = document.getElementById('walkReflect');
    if (facade && reflect && fine) {
      var wx = 0, wraf = 0, walk = document.getElementById('walkin');
      function moveReflect() {
        wraf = 0;
        reflect.style.translate = wx.toFixed(1) + '% 0';
      }
      window.addEventListener('pointermove', function (e) {
        if (!walk) return;
        var r = walk.getBoundingClientRect();
        if (e.clientY < r.top || e.clientY > r.bottom || r.width === 0) return;
        wx = ((e.clientX - r.left) / r.width - 0.5) * 35;
        if (!wraf) wraf = requestAnimationFrame(moveReflect);
      }, { passive: true });
    }

    (function shot() {
      var host = document.getElementById('craftExtractionImg');
      if (!host) return;
      var box = host.parentElement;
      box.classList.add('shot-stage');
      var canvas = document.createElement('canvas');
      canvas.className = 'shot-canvas';
      canvas.setAttribute('aria-label', 'Bottomless portafilter extraction');
      box.appendChild(canvas);
      var board = document.createElement('div');
      board.className = 'shot-board';
      board.style.cssText = 'position:absolute;left:16px;right:16px;bottom:72px;z-index:5;color:#F1E9FF;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;';
      board.innerHTML = '<label for="shotScrub">Pull the shot · 0.0s to 27.4s</label><input id="shotScrub" type="range" min="0" max="274" value="274" aria-valuemin="0" aria-valuemax="274">';
      box.appendChild(board);
      var scrub = board.querySelector('input');
      var ctx = canvas.getContext('2d');
      var sizedW = 0, sizedH = 0;
      function size() {
        var w = box.clientWidth, h = box.clientHeight || 380;
        if (w === sizedW && h === sizedH) return;
        sizedW = w; sizedH = h;
        canvas.width = w; canvas.height = h;
      }
      function draw(sec) {
        size();
        var w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        var bar = sec <= 6 ? (sec / 6) * 3 : 9.2;
        var grams = sec <= 6 ? 0 : Math.min(36.8, ((sec - 6) / 21.4) * 36.8);
        var tds = sec < 18 ? 0 : Math.min(9.8, ((sec - 18) / 9.4) * 9.8);
        var pEl = document.getElementById('craftPressureVal');
        var tEl = document.getElementById('craftTimeVal');
        var yEl = document.getElementById('craftYieldVal');
        if (pEl) pEl.textContent = bar.toFixed(1) + ' BAR';
        if (tEl) tEl.textContent = sec.toFixed(1) + 's';
        if (yEl) yEl.textContent = grams.toFixed(1) + 'g';
        ctx.fillStyle = '#1A0E08';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#C9BEDC';
        ctx.fillRect(w * 0.28, h * 0.08, w * 0.44, h * 0.12);
        ctx.fillStyle = '#3A2414';
        ctx.beginPath();
        ctx.ellipse(w * 0.5, h * 0.28, w * 0.16, h * 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        if (sec > 0.4 && sec < 6) {
          for (var i = 0; i < 8; i++) {
            ctx.fillStyle = 'rgba(40,18,8,' + (0.3 + (sec / 6) * 0.6) + ')';
            ctx.beginPath();
            ctx.arc(w * (0.4 + (i % 4) * 0.05), h * (0.27 + (i > 3 ? 0.03 : 0)), 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        var streams = sec < 6.1 ? 0 : sec < 12 ? 2 : 1;
        ctx.strokeStyle = sec > 18 ? '#C9843A' : '#4A2610';
        ctx.lineWidth = streams === 1 ? 7 : 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (streams === 2) {
          ctx.moveTo(w * 0.46, h * 0.32); ctx.lineTo(w * 0.46, h * 0.62);
          ctx.moveTo(w * 0.54, h * 0.32); ctx.lineTo(w * 0.54, h * 0.62);
        } else if (streams === 1) {
          ctx.moveTo(w * 0.5, h * 0.32); ctx.lineTo(w * 0.5, h * 0.64);
        }
        ctx.stroke();
        var cup = h * 0.78;
        ctx.fillStyle = '#F6F1EA';
        ctx.fillRect(w * 0.38, cup, w * 0.24, h * 0.14);
        var fill = clamp(grams / 36.8, 0, 1);
        ctx.fillStyle = sec > 18 ? '#E0B56A' : '#6B3A16';
        ctx.fillRect(w * 0.39, cup + h * 0.12 * (1 - fill), w * 0.22, h * 0.12 * fill);
        if (sec > 18) {
          ctx.strokeStyle = 'rgba(90,40,12,.65)';
          ctx.lineWidth = 2;
          for (var s = 0; s < 5; s++) {
            ctx.beginPath();
            ctx.moveTo(w * (0.4 + s * 0.04), cup + 6);
            ctx.lineTo(w * (0.42 + s * 0.04), cup + h * 0.1);
            ctx.stroke();
          }
        }
        ctx.fillStyle = '#F1E9FF';
        ctx.font = '700 12px sans-serif';
        ctx.fillText(tds ? ('TDS ' + tds.toFixed(1) + '%') : 'Pre-infusion', 16, h - 16);
      }
      function fromScrub() { draw(Number(scrub.value) / 10); }
      scrub.addEventListener('input', fromScrub);
      fromScrub();
      window.addEventListener('resize', fromScrub);
    })();

    (function pour() {
      var img = document.getElementById('craftLatteImg');
      if (!img) return;
      var box = img.parentElement;
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 200 200');
      svg.classList.add('pour-overlay');
      svg.innerHTML = '<path id="pourPath" d="M100 18 C 70 50, 130 70, 100 100 C 68 132, 132 150, 100 184" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>';
      var sheen = document.createElement('div');
      sheen.className = 'pour-sheen';
      box.appendChild(svg);
      box.appendChild(sheen);
      var paths = {
        rosetta: 'M100 16 C 60 48, 140 60, 100 92 C 55 120, 78 140, 100 156 C 122 140, 145 120, 100 92',
        tulip: 'M100 20 L100 70 M70 90 H130 M78 115 H122 M86 140 H114 M100 140 V175',
        heart: 'M100 30 C 40 70, 40 130, 100 175 C 160 130, 160 70, 100 30'
      };
      function show(name) {
        var p = svg.querySelector('path');
        p.setAttribute('d', paths[name] || paths.rosetta);
        p.style.strokeDashoffset = '100';
        if (!reduce) requestAnimationFrame(function () { p.style.transition = 'stroke-dashoffset 1.1s ease'; p.style.strokeDashoffset = '0'; });
        else p.style.strokeDashoffset = '0';
      }
      var orig = window.setCraftPattern;
      if (orig) window.setCraftPattern = function (pat) { orig(pat); show(pat); };
      show('rosetta');
      if (fine) {
        var sx = 50, sy = 40, sraf = 0;
        function paintSheen() {
          sraf = 0;
          sheen.style.setProperty('--sx', sx.toFixed(1) + '%');
          sheen.style.setProperty('--sy', sy.toFixed(1) + '%');
        }
        box.addEventListener('pointermove', function (e) {
          var r = box.getBoundingClientRect();
          if (!r.width) return;
          sx = (e.clientX - r.left) / r.width * 100;
          sy = (e.clientY - r.top) / r.height * 100;
          if (!sraf) sraf = requestAnimationFrame(paintSheen);
        }, { passive: true });
      }
    })();

    (function roast() {
      var slider = document.getElementById('craftRoastSlider');
      var orig = window.changeCraftRoastProfile;
      if (!slider || !orig) return;
      slider.min = '196'; slider.max = '235'; slider.step = '0.1'; slider.value = '196';
      var panel = document.getElementById('craftPanel-roast');
      var disc = document.createElement('div');
      disc.className = 'bean-disc';
      var bars = panel && panel.querySelector('.w-full.max-w-sm');
      if (bars) bars.parentElement.insertBefore(disc, bars);
      var state = { a: 94, b: 65, s: 88, d: 72, va: 0, vb: 0, vs: 0, vd: 0 };
      var target = { a: 94, b: 65, s: 88, d: 72 };
      var notes = [
        ['Wild Jasmine', 'White Peach', 'Bergamot Citrus', 'Raw Honey'],
        ['Dark Cocoa Nibs', 'Roasted Hazelnut', 'Raw Panela', 'Brown Sugar'],
        ['Smoked Cacao', 'Spiced Tobacco', 'Toasted Oak', 'Dense Crema']
      ];
      function spring() {
        var k = 0.18, damp = 0.72;
        [['a', 'craftAcidityBar', 'craftAcidityVal', 9.4, 4.1],
         ['b', 'craftBodyBar', 'craftBodyVal', 6.5, 9.8],
         ['s', 'craftSweetnessBar', 'craftSweetnessVal', 8.8, 7.6],
         ['d', 'craftRoastTimeBar', 'craftRoastTimeVal', 14.2, 22.8]].forEach(function (row) {
          var key = row[0];
          state['v' + key] = (state['v' + key] + (target[key] - state[key]) * k) * damp;
          state[key] += state['v' + key];
          var bar = document.getElementById(row[1]);
          var lab = document.getElementById(row[2]);
          if (bar) bar.style.width = clamp(state[key], 0, 100).toFixed(1) + '%';
        });
        if (Math.abs(target.a - state.a) > 0.2) requestAnimationFrame(spring);
      }
      window.changeCraftRoastProfile = function (val) {
        var temp = Number(val);
        if (temp < 10) { orig(val); return; }
        var u = clamp((temp - 196) / 39, 0, 1);
        var key = u < 0.34 ? 1 : u < 0.67 ? 2 : 3;
        orig(String(key));
        var acidity = 9.4 + (4.1 - 9.4) * u;
        var body = 6.5 + (9.8 - 6.5) * u;
        var sweet = 8.8 + (7.6 - 8.8) * u;
        var dtr = 14.2 + (22.8 - 14.2) * u;
        target.a = acidity / 10 * 100;
        target.b = body / 10 * 100;
        target.s = sweet / 10 * 100;
        target.d = (dtr / 22.8) * 100;
        var set = function (id, text) { var n = document.getElementById(id); if (n) n.textContent = text; };
        set('craftAcidityVal', acidity.toFixed(1) + ' / 10');
        set('craftBodyVal', body.toFixed(1) + ' / 10');
        set('craftSweetnessVal', sweet.toFixed(1) + ' / 10');
        set('craftRoastTimeVal', dtr.toFixed(1) + '% DTR');
        var box = document.getElementById('craftRoastNotes');
        if (box) {
          box.innerHTML = notes[key - 1].map(function (n) {
            return '<span class="note-pill px-3.5 py-1.5 rounded-full text-xs font-bold" style="background:' + (key === 1 ? '#EDE4FF' : key === 2 ? '#F3E2C4' : '#3A2418') + ';color:' + (key === 3 ? '#F6E7C1' : '#5B21B6') + '">' + n + '</span>';
          }).join('');
        }
        var hue = 28 - u * 22;
        disc.style.background = 'radial-gradient(circle at 35% 30%, hsl(' + hue + ',45%,62%), hsl(' + (hue - 10) + ',40%,' + (38 - u * 22) + '%) 70%)';
        disc.style.boxShadow = 'inset 0 0 ' + (8 + u * 18) + 'px rgba(255,220,140,' + (0.15 + u * 0.55) + ')';
        requestAnimationFrame(spring);
      };
      window.changeCraftRoastProfile(196);
    })();

    (function chapters() {
      var stage = document.querySelector('#chapters .stage');
      if (!stage) return;
      var layer = document.createElement('div');
      layer.className = 'ch-ambient' + (reduce ? '' : ' is-live');
      layer.setAttribute('aria-hidden', 'true');
      var colors = ['#6E44FF', '#1F4E3B', '#C88A4B'];
      for (var n = 0; n < 14; n++) {
        var dot = document.createElement('span');
        dot.style.cssText = 'left:' + ((n * 7) % 96) + '%;top:' + ((n * 13) % 80) + '%;width:' + (n % 3 + 2) + 'px;height:' + (n % 3 + 2) + 'px;background:' + colors[n % 3] + ';animation-delay:' + (-n * 0.6) + 's';
        layer.appendChild(dot);
      }
      stage.prepend(layer);
      var themes = [
        ['#2A1810', 'rgba(110,68,255,.55)'],
        ['#D8E8D5', 'rgba(31,78,59,.45)'],
        ['#1C1412', 'rgba(200,138,75,.5)']
      ];
      var btns = stage.querySelectorAll('.ch-nav button');
      var shown = -1;
      function sync() {
        var i = 0;
        for (var k = 0; k < btns.length; k++) if (btns[k].getAttribute('aria-current') === 'true') i = k;
        if (i === shown) return;
        shown = i;
        stage.style.setProperty('--surface-tint', themes[i][0]);
        stage.style.setProperty('--accent-glow', themes[i][1]);
        var dots = layer.children;
        for (var d = 0; d < dots.length; d++) dots[d].style.background = colors[i];
      }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) {
          var on = en[0].isIntersecting && !document.hidden && !reduce;
          layer.classList.toggle('is-live', on);
          if (on) sync();
        }).observe(stage);
      }
      window.addEventListener('scroll', sync, { passive: true });
      document.addEventListener('visibilitychange', function () {
        layer.classList.toggle('is-live', !document.hidden && !reduce);
      });
      sync();
    })();

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button');
      if (!btn) return;
      var card = btn.closest('.d2c-card');
      if (card && /Bag|Subscribe/.test(btn.textContent || '')) flyTo(card, document.getElementById('cartCount'));
    }, true);

    pillCursor([
      ['#craftPanel-extraction', 'Hold to pull shot · 9.2 bar'],
      ['#scratchCanvas', 'Wipe condensation'],
      ['#productGridContainer', 'Add the roast']
    ]);
    kinetic('#productGridContainer .d2c-card');
  }

  /* ── Deli Chic ───────────────────────────────────────────────── */
  if (document.getElementById('bwalkin')) {
    (function loupeHud() {
      var box = document.getElementById('heroLoupeContainer');
      var hud = document.getElementById('loupeHud');
      var read = document.getElementById('loupeReadout');
      var call = document.getElementById('loupeCall');
      if (!box || !hud) return;
      var spots = [
        { x: 0.32, y: 0.42, name: 'Beechwood smoke ring' },
        { x: 0.58, y: 0.48, name: 'Intramuscular marbling' },
        { x: 0.7, y: 0.3, name: 'Tellicherry pepper crust' }
      ];
      var tx = 50, ty = 50, x = 50, y = 50, raf = 0, pointing = false, boxW = 1, boxH = 1, lastRead = '';
      function loop() {
        raf = 0;
        x += (tx - x) * 0.22;
        y += (ty - y) * 0.22;
        var px = x / 100 * boxW, py = y / 100 * boxH;
        var snap = null;
        for (var i = 0; i < spots.length; i++) {
          var sx = spots[i].x * boxW, sy = spots[i].y * boxH;
          if (Math.hypot(px - sx, py - sy) < 24) snap = spots[i];
        }
        if (snap) { tx = snap.x * 100; ty = snap.y * 100; }
        hud.style.translate = (px - 96).toFixed(1) + 'px ' + (py - 96).toFixed(1) + 'px';
        var line = 'X ' + (x / 100 * 86).toFixed(1) + 'mm  Y ' + (y / 100 * 54).toFixed(1) + 'mm  ·  ' + (18 + x / 100 * 22).toFixed(0) + '% marbling  ·  ' + (2.3 + y / 100 * 0.2).toFixed(1) + '°C';
        if (read && line !== lastRead) { lastRead = line; read.textContent = line; }
        if (call) {
          var show = !!snap;
          if (call.classList.contains('on') !== show) call.classList.toggle('on', show);
          if (snap && call.textContent !== snap.name) {
            call.textContent = snap.name;
            call.style.translate = (snap.x * boxW) + 'px ' + (snap.y * boxH + 28) + 'px';
          }
        }
        var settled = Math.abs(tx - x) < 0.15 && Math.abs(ty - y) < 0.15;
        if (pointing || !settled) raf = requestAnimationFrame(loop);
      }
      function measure() {
        boxW = box.clientWidth || 1;
        boxH = box.clientHeight || 1;
      }
      box.addEventListener('pointermove', function (e) {
        var r = box.getBoundingClientRect();
        boxW = r.width || 1; boxH = r.height || 1;
        tx = ((e.clientX - r.left) / boxW) * 100;
        ty = ((e.clientY - r.top) / boxH) * 100;
        pointing = true;
        if (hud.style.display !== 'block') hud.style.display = 'block';
        if (!raf) raf = requestAnimationFrame(loop);
      }, { passive: true });
      box.addEventListener('pointerleave', function () {
        pointing = false;
        hud.style.display = 'none';
        if (call) call.classList.remove('on');
      });
      window.addEventListener('resize', measure);
    })();

    (function atmo() {
      var stage = document.getElementById('deliStage');
      if (!stage) return;
      var layer = document.createElement('div');
      layer.className = 'ch-atmo';
      layer.setAttribute('aria-hidden', 'true');
      var scan = document.createElement('span');
      scan.className = 'scan';
      layer.appendChild(scan);
      for (var n = 0; n < 10; n++) {
        var dot = document.createElement('span');
        dot.style.cssText = 'left:' + (8 + (n * 9) % 84) + '%;top:' + (15 + (n * 17) % 70) + '%;width:' + (n % 2 ? 10 : 4) + 'px;height:' + (n % 2 ? 4 : 4) + 'px;background:' + (n % 2 ? '#D4AF37' : '#FFA03C') + ';animation-delay:' + (-n * 0.8) + 's';
        layer.appendChild(dot);
      }
      stage.prepend(layer);
      var chapters = ['deliCh1', 'deliCh2', 'deliCh3'].map(function (id) { return document.getElementById(id); });
      var shown = -1;
      function sync() {
        var best = 0, op = -1;
        for (var i = 0; i < chapters.length; i++) {
          var o = chapters[i] ? parseFloat(chapters[i].style.opacity || '0') : 0;
          if (o > op) { op = o; best = i; }
        }
        if (best === shown) return;
        shown = best;
        layer.setAttribute('data-ch', String(best));
        scan.style.opacity = best === 0 ? '1' : '0';
      }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) {
          layer.classList.toggle('is-live', en[0].isIntersecting && !document.hidden && !reduce);
          if (en[0].isIntersecting) sync();
        }).observe(stage);
      }
      window.addEventListener('scroll', sync, { passive: true });
      sync();
    })();

    var cut = document.getElementById('heritageCut');
    var bench = document.getElementById('bench');
    if (cut && bench && 'IntersectionObserver' in window) {
      var steps = bench.querySelectorAll('.bench-step');
      var last = steps[steps.length - 1];
      if (last) {
        new IntersectionObserver(function (en) {
          if (en[0].isIntersecting) cut.classList.add('is-sealed');
        }, { threshold: 0.6 }).observe(last);
      }
    } else if (cut) cut.classList.add('is-sealed');

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button');
      if (!btn) return;
      var card = btn.closest('#productGrid > div, .deli-card');
      if (card && /Add to Basket/.test(btn.textContent || '')) flyTo(card, document.getElementById('basketCount'));
    }, true);

    var audioBtns = [].slice.call(document.querySelectorAll('[data-deli-audio]'));
    if (audioBtns.length) {
      var ctx = null, node = null;
      function setAudio(on) {
        audioBtns.forEach(function (btn) {
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          btn.textContent = on ? 'On' : 'Sound';
        });
      }
      audioBtns[0].addEventListener('click', function () {
        var on = audioBtns[0].getAttribute('aria-pressed') === 'true';
        if (on) {
          if (node) { try { node.stop(); } catch (e) {} node = null; }
          setAudio(false);
          return;
        }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = ctx || new AC();
        if (ctx.state === 'suspended') ctx.resume();
        var buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
        node = ctx.createBufferSource();
        node.buffer = buffer; node.loop = true;
        var filter = ctx.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = 2400; filter.Q.value = 0.7;
        var gain = ctx.createGain(); gain.gain.value = 0.04;
        node.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        node.start();
        var osc = ctx.createOscillator();
        var g2 = ctx.createGain();
        osc.frequency.value = 180;
        g2.gain.setValueAtTime(0.05, ctx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(g2); g2.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.2);
        setAudio(true);
      });
      audioBtns.slice(1).forEach(function (btn) {
        btn.addEventListener('click', function () { audioBtns[0].click(); });
      });
    }

    pillCursor([
      ['#larder', 'Inspect cut · 2.4°C'],
      ['#masterCarver', '2.5× loupe'],
      ['#heritageCut', 'Vacuum seal']
    ]);
    kinetic('#productGrid .deli-card, #productGrid > div');
  }
})();
