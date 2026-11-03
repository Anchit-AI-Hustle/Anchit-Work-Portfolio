/* Shared cinematic layer for Gram Street Coffee and Deli Chic.
   Each page only runs the branch that matches its markup.
   Motion stays on transform, opacity, scale and rotate. Loops stop off screen. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function pillCursor(zones) {
    if (!fine) return;
    var pill = document.createElement('div');
    pill.className = 'ctx-pill';
    pill.setAttribute('aria-hidden', 'true');
    document.body.appendChild(pill);
    var label = '';
    var mx = -100, my = -100, raf = 0, els = [];
    for (var z = 0; z < zones.length; z++) {
      els.push([document.querySelector(zones[z][0]), zones[z][1]]);
    }
    function draw() {
      raf = 0;
      pill.style.transform = 'translate3d(' + mx.toFixed(1) + 'px,' + my.toFixed(1) + 'px,0)';
      var next = '';
      for (var i = 0; i < els.length; i++) {
        var el = els[i][0];
        if (!el) continue;
        var r = el.getBoundingClientRect();
        if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) {
          next = els[i][1];
          break;
        }
      }
      if (next !== label) {
        label = next;
        pill.textContent = next;
        pill.classList.toggle('on', !!next);
      }
    }
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      if (!raf) raf = requestAnimationFrame(draw);
    }, { passive: true });
    window.addEventListener('scroll', function () {
      if (!raf) raf = requestAnimationFrame(draw);
    }, { passive: true });
  }

  function flyTo(fromEl, badge) {
    if (!fromEl || !badge || reduce) return;
    var img = fromEl.querySelector('img');
    if (!img) return;
    var a = img.getBoundingClientRect();
    var b = badge.getBoundingClientRect();
    var ghost = img.cloneNode(true);
    ghost.setAttribute('alt', '');
    ghost.style.cssText = 'position:fixed;z-index:1000001;width:48px;height:48px;object-fit:cover;border-radius:12px;pointer-events:none;left:0;top:0;margin:0;';
    document.body.appendChild(ghost);
    var x0 = a.left, y0 = a.top;
    var x1 = (a.left + b.left) / 2;
    var y1 = Math.min(a.top, b.top) - 90;
    var x2 = b.left, y2 = b.top;
    var t0 = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - t0) / 700);
      var ease = 1 - Math.pow(1 - t, 3);
      var u = 1 - ease;
      var x = u * u * x0 + 2 * u * ease * x1 + ease * ease * x2;
      var y = u * u * y0 + 2 * u * ease * y1 + ease * ease * y2;
      ghost.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
      ghost.style.scale = (1 - ease * 0.65).toFixed(3);
      ghost.style.opacity = (1 - ease * 0.15).toFixed(3);
      if (t < 1) requestAnimationFrame(frame);
      else {
        ghost.remove();
        if (badge.animate) {
          badge.animate(
            [{ scale: '1' }, { scale: '1.25' }, { scale: '1' }],
            { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' }
          );
        }
      }
    }
    requestAnimationFrame(frame);
  }

  function kinetic(selector) {
    if (reduce) return;
    var lastY = window.scrollY, vel = 0, raf = 0;
    function apply() {
      raf = 0;
      vel *= 0.82;
      var tilt = clamp(vel * 0.08, -3, 3);
      var cards = document.querySelectorAll(selector);
      for (var i = 0; i < cards.length; i++) cards[i].style.rotate = tilt.toFixed(2) + 'deg';
      if (Math.abs(vel) > 0.05) raf = requestAnimationFrame(apply);
    }
    window.addEventListener('scroll', function () {
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
      window.addEventListener('pointermove', function (e) {
        var sec = document.getElementById('walkin');
        if (!sec) return;
        var r = sec.getBoundingClientRect();
        if (e.clientY < r.top || e.clientY > r.bottom) return;
        var x = ((e.clientX - r.left) / r.width) * 100;
        reflect.style.translate = ((x - 50) * 0.35).toFixed(1) + '% 0';
      }, { passive: true });
    }

    (function shot() {
      var img = document.getElementById('craftExtractionImg');
      if (!img) return;
      var box = img.parentElement;
      box.classList.add('shot-stage');
      var canvas = document.createElement('canvas');
      canvas.className = 'shot-hud';
      canvas.setAttribute('aria-label', 'Bottomless portafilter extraction');
      box.appendChild(canvas);
      var board = document.createElement('div');
      board.className = 'shot-board';
      board.innerHTML = '<label for="shotScrub">Pull the shot · 0.0s to 27.4s</label><input id="shotScrub" type="range" min="0" max="274" value="274" aria-valuemin="0" aria-valuemax="274">';
      box.appendChild(board);
      var scrub = board.querySelector('input');
      var ctx = canvas.getContext('2d');
      var secNow = 27.4, playing = false;

      function size() {
        var w = box.clientWidth, h = box.clientHeight || 380;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }

      function telemetry(sec) {
        var bar = sec <= 6 ? (sec / 6) * 3 : 9.2;
        var grams = sec <= 6 ? 0 : Math.min(36.8, ((sec - 6) / 21.4) * 36.8);
        var tds = sec < 18 ? 0 : Math.min(9.8, ((sec - 18) / 9.4) * 9.8);
        var set = function (id, text) { var n = document.getElementById(id); if (n) n.textContent = text; };
        set('craftPressureVal', bar.toFixed(1) + ' BAR');
        set('craftTimeVal', sec.toFixed(1) + 's');
        set('craftYieldVal', grams.toFixed(1) + 'g');
        set('craftTdsVal', tds ? tds.toFixed(1) + '%' : '0.0%');
        return { bar: bar, grams: grams, tds: tds };
      }

      function draw(sec) {
        size();
        var w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        var tel = telemetry(sec);
        var u = clamp(sec / 27.4, 0, 1);
        var cx = w * 0.5, cy = h * 0.46, rr = Math.min(w, h) * 0.28;

        ctx.fillStyle = 'rgba(12, 8, 6,' + (0.18 * (1 - u)).toFixed(3) + ')';
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        var bloom = lerp(0.55, 1.15, u);
        var grd = ctx.createRadialGradient(cx, cy, 4, cx, cy, rr * bloom);
        grd.addColorStop(0, 'rgba(0,0,0,1)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, rr * bloom, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (sec > 0.3 && sec < 6.2) {
          var beads = 10;
          for (var i = 0; i < beads; i++) {
            var a = (i / beads) * Math.PI * 2 + sec * 0.4;
            var rad = rr * (0.22 + (sec / 6) * 0.2);
            ctx.fillStyle = 'rgba(28, 14, 8,' + (0.35 + (sec / 6) * 0.45).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad * 0.72, 3.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (sec > 18) {
          ctx.strokeStyle = 'rgba(90, 42, 12,' + (0.18 + (sec - 18) / 9.4 * 0.35).toFixed(3) + ')';
          ctx.lineWidth = 2;
          for (var s = 0; s < 7; s++) {
            ctx.beginPath();
            var x0 = cx - rr * 0.42 + s * rr * 0.12;
            ctx.moveTo(x0, cy - rr * 0.18);
            ctx.quadraticCurveTo(x0 + 8, cy, x0 - 4, cy + rr * 0.28);
            ctx.stroke();
          }
        }

        var gx = 28, gy = 28, gr = 26;
        ctx.strokeStyle = 'rgba(241,233,255,.28)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(gx + gr, gy + gr, gr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#CDB8F7';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(gx + gr, gy + gr, gr, -Math.PI / 2, -Math.PI / 2 + (tel.bar / 9.2) * Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#F1E9FF';
        ctx.font = '700 11px Bricolage Grotesque, sans-serif';
        ctx.fillText(tel.bar.toFixed(1) + ' BAR', gx, gy + gr * 2 + 16);

        var phase = sec <= 6 ? 'Pre-infusion' : sec <= 18 ? 'Coalescence' : 'Tiger-striped crema';
        var frame = String(Math.max(1, Math.round(u * 60))).padStart(2, '0');
        ctx.fillStyle = 'rgba(12,8,20,.55)';
        ctx.fillRect(16, h - 44, 220, 28);
        ctx.fillStyle = '#F1E9FF';
        ctx.fillText(phase + '  ·  ' + frame + '/60', 24, h - 26);

        var yieldW = 110;
        ctx.fillStyle = 'rgba(12,8,20,.5)';
        ctx.fillRect(w - yieldW - 16, 18, yieldW, 36);
        ctx.fillStyle = '#E0B56A';
        ctx.fillRect(w - yieldW - 12, 38, (yieldW - 8) * clamp(tel.grams / 36.8, 0, 1), 10);
        ctx.fillStyle = '#F1E9FF';
        ctx.fillText(tel.grams.toFixed(1) + 'g  ' + (tel.tds ? tel.tds.toFixed(1) + '% TDS' : '1.34 g/s'), w - yieldW - 10, 34);
      }

      function fromScrub() {
        secNow = Number(scrub.value) / 10;
        scrub.setAttribute('aria-valuenow', String(Math.round(secNow * 10)));
        draw(secNow);
      }
      scrub.addEventListener('input', fromScrub);

      var dragging = false;
      canvas.addEventListener('pointerdown', function (e) {
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
        var r = canvas.getBoundingClientRect();
        scrub.value = String(Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 274));
        fromScrub();
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var r = canvas.getBoundingClientRect();
        scrub.value = String(Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 274));
        fromScrub();
      });
      canvas.addEventListener('pointerup', function () { dragging = false; });
      canvas.addEventListener('pointercancel', function () { dragging = false; });

      function playShot() {
        if (playing) return;
        var btn = document.getElementById('craftRunBtn');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span>Pulling the shot...</span>';
        }
        if (reduce) {
          scrub.value = '274';
          fromScrub();
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>Calibration Locked (9.2 Bar · 36.8g)</span>';
          }
          return;
        }
        playing = true;
        var t0 = performance.now();
        function tick(now) {
          var t = Math.min(1, (now - t0) / 2800);
          var sec = t * 27.4;
          scrub.value = String(Math.round(sec * 10));
          fromScrub();
          if (t < 1) requestAnimationFrame(tick);
          else {
            playing = false;
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = '<span>Calibration Locked (9.2 Bar · 36.8g)</span>';
            }
          }
        }
        requestAnimationFrame(tick);
      }

      window.runCraftCalibration = function () { playShot(); };

      fromScrub();
      window.addEventListener('resize', function () { draw(secNow); });
    })();

    (function pour() {
      var img = document.getElementById('craftLatteImg');
      if (!img) return;
      var box = img.parentElement;
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 200 200');
      svg.setAttribute('aria-hidden', 'true');
      svg.classList.add('pour-overlay');
      svg.innerHTML =
        '<path id="pourPath" fill="none" stroke="#F4EFE6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>' +
        '<circle id="pourTip" cx="100" cy="18" r="4" fill="#F1E9FF"/>';
      var sheen = document.createElement('div');
      sheen.className = 'pour-sheen';
      box.appendChild(svg);
      box.appendChild(sheen);
      var paths = {
        rosetta: 'M100 22 C 78 38, 64 58, 78 78 C 96 98, 128 92, 118 70 C 108 52, 84 68, 92 88 C 102 112, 128 118, 118 138 C 108 154, 88 148, 96 168 C 102 180, 110 186, 100 192',
        tulip: 'M100 20 L100 72 M72 88 C 88 78, 112 78, 128 88 M78 112 C 92 100, 108 100, 122 112 M86 136 C 96 126, 104 126, 114 136 M100 136 V188',
        heart: 'M100 34 C 58 8, 24 62, 100 178 C 176 62, 142 8, 100 34'
      };
      var tip = svg.querySelector('#pourTip');
      var tipRaf = 0, tipOn = false, tipSeen = false, tipName = 'rosetta';
      function show(name) {
        tipName = name;
        var p = svg.querySelector('path');
        p.setAttribute('d', paths[name] || paths.rosetta);
        p.style.strokeDashoffset = '100';
        if (!reduce) {
          p.style.transition = 'none';
          requestAnimationFrame(function () {
            p.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)';
            p.style.strokeDashoffset = '0';
          });
        } else p.style.strokeDashoffset = '0';
      }
      function tipTick(now) {
        tipRaf = 0;
        if (!tipOn) return;
        var wobble = Math.sin(now / 140) * 3;
        tip.setAttribute('cx', String(100 + wobble));
        tip.setAttribute('cy', tipName === 'tulip' ? '20' : '18');
        if (tipOn) tipRaf = requestAnimationFrame(tipTick);
      }
      function tipStart() {
        if (tipOn || reduce || !tipSeen || document.hidden) return;
        tipOn = true;
        tipRaf = requestAnimationFrame(tipTick);
      }
      function tipStop() { tipOn = false; if (tipRaf) cancelAnimationFrame(tipRaf); tipRaf = 0; }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) { tipSeen = en[0].isIntersecting; tipSeen ? tipStart() : tipStop(); }).observe(box);
      } else { tipSeen = true; tipStart(); }
      document.addEventListener('visibilitychange', function () { document.hidden ? tipStop() : tipStart(); });

      var orig = window.setCraftPattern;
      if (orig) window.setCraftPattern = function (pat) { orig(pat); show(pat); };
      show('rosetta');
      if (fine) {
        box.addEventListener('pointermove', function (e) {
          var r = box.getBoundingClientRect();
          sheen.style.setProperty('--sx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
          sheen.style.setProperty('--sy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
        }, { passive: true });
      }
    })();

    (function roast() {
      var slider = document.getElementById('craftRoastSlider');
      var orig = window.changeCraftRoastProfile;
      if (!slider || !orig) return;
      slider.min = '196'; slider.max = '235'; slider.step = '0.1'; slider.value = '196';
      slider.setAttribute('aria-valuemin', '196');
      slider.setAttribute('aria-valuemax', '235');
      var panel = document.getElementById('craftPanel-roast');
      var disc = document.getElementById('craftBeanMorph') || document.createElement('div');
      if (!disc.id) {
        disc.id = 'craftBeanMorph';
        disc.className = 'bean-morph';
        disc.innerHTML = '<div class="bean-disc" id="craftBeanDisc"></div><div class="bean-oil" id="craftBeanOil"></div>';
        var bars = panel && panel.querySelector('.w-full.max-w-sm');
        if (bars) bars.parentElement.insertBefore(disc, bars);
      }
      var oil = document.getElementById('craftBeanOil');
      var beanImg = document.getElementById('craftRoastImg');
      ['craftAcidityBar', 'craftBodyBar', 'craftSweetnessBar', 'craftRoastTimeBar'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.transition = 'none';
      });
      var state = { a: 94, b: 65, s: 88, d: 62, va: 0, vb: 0, vs: 0, vd: 0 };
      var target = { a: 94, b: 65, s: 88, d: 62 };
      var springing = false;
      var notes = [
        ['Wild Jasmine', 'White Peach', 'Bergamot Citrus', 'Raw Honey'],
        ['Dark Cocoa Nibs', 'Roasted Hazelnut', 'Raw Panela', 'Brown Sugar'],
        ['Smoked Cacao', 'Spiced Tobacco', 'Toasted Oak', 'Dense Crema']
      ];
      function spring() {
        springing = true;
        var dt = 1 / 60;
        var k = 180, damp = 18;
        var keys = [
          ['a', 'craftAcidityBar'],
          ['b', 'craftBodyBar'],
          ['s', 'craftSweetnessBar'],
          ['d', 'craftRoastTimeBar']
        ];
        var moving = false;
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i][0];
          var force = (target[key] - state[key]) * k;
          state['v' + key] = (state['v' + key] + force * dt) * Math.exp(-damp * dt);
          state[key] += state['v' + key] * dt;
          if (Math.abs(target[key] - state[key]) > 0.15 || Math.abs(state['v' + key]) > 0.15) moving = true;
          var bar = document.getElementById(keys[i][1]);
          if (bar) bar.style.width = clamp(state[key], 0, 100).toFixed(1) + '%';
        }
        if (moving && !reduce) requestAnimationFrame(spring);
        else springing = false;
      }
      window.changeCraftRoastProfile = function (val) {
        var temp = Number(val);
        if (temp < 10) { orig(val); return; }
        var u = clamp((temp - 196) / 39, 0, 1);
        var key = u < 0.34 ? 1 : u < 0.67 ? 2 : 3;
        orig(String(key));
        var acidity = lerp(9.4, 4.1, u);
        var body = lerp(6.5, 9.8, u);
        var sweet = lerp(8.8, 7.6, u);
        var dtr = lerp(14.2, 22.8, u);
        target.a = acidity / 10 * 100;
        target.b = body / 10 * 100;
        target.s = sweet / 10 * 100;
        target.d = (dtr / 22.8) * 100;
        var set = function (id, text) { var n = document.getElementById(id); if (n) n.textContent = text; };
        set('craftAcidityVal', acidity.toFixed(1) + ' / 10');
        set('craftBodyVal', body.toFixed(1) + ' / 10');
        set('craftSweetnessVal', sweet.toFixed(1) + ' / 10');
        set('craftRoastTimeVal', dtr.toFixed(1) + '% DTR');
        slider.setAttribute('aria-valuenow', String(Math.round(temp)));
        var box = document.getElementById('craftRoastNotes');
        if (box) {
          var tint = key === 1 ? '#EDE4FF' : key === 2 ? '#F3E2C4' : '#3A2418';
          var ink = key === 3 ? '#F6E7C1' : '#5B21B6';
          box.innerHTML = notes[key - 1].map(function (n, i) {
            return '<span class="note-pill px-3.5 py-1.5 rounded-full text-xs font-bold" style="background:' + tint + ';color:' + ink + ';animation-delay:-' + (i * 0.7) + 's">' + n + '</span>';
          }).join('');
        }
        var hue = 28 - u * 22;
        disc.style.setProperty('--bean-u', u.toFixed(3));
        if (oil) oil.style.opacity = (0.12 + u * 0.7).toFixed(3);
        if (beanImg) {
          beanImg.style.filter = 'sepia(' + (0.15 + u * 0.45).toFixed(2) + ') brightness(' + (1.08 - u * 0.38).toFixed(2) + ') contrast(' + (1.02 + u * 0.18).toFixed(2) + ') saturate(' + (0.9 + u * 0.35).toFixed(2) + ')';
        }
        var beanDisc = document.getElementById('craftBeanDisc');
        if (beanDisc) {
          beanDisc.style.background = 'radial-gradient(circle at 35% 30%, hsl(' + hue + ',45%,' + (62 - u * 18) + '%), hsl(' + (hue - 10) + ',40%,' + (38 - u * 22) + '%) 70%)';
          beanDisc.style.boxShadow = 'inset 0 0 ' + (8 + u * 18) + 'px rgba(255,220,140,' + (0.15 + u * 0.55) + ')';
        }
        if (!springing) requestAnimationFrame(spring);
      };
      window.changeCraftRoastProfile(196);
    })();

    (function chapters() {
      var stage = document.querySelector('#chapters .stage');
      if (!stage) return;
      var canvas = document.createElement('canvas');
      canvas.className = 'ch-ambient';
      canvas.setAttribute('aria-hidden', 'true');
      stage.prepend(canvas);
      var ctx = canvas.getContext('2d');
      var on = false, raf = 0, seen = false;
      var themes = [
        ['#2A1810', 'rgba(110,68,255,.55)'],
        ['#D8E8D5', 'rgba(31,78,59,.45)'],
        ['#1C1412', 'rgba(200,138,75,.5)']
      ];
      function current() {
        var btns = stage.querySelectorAll('.ch-nav button');
        for (var i = 0; i < btns.length; i++) if (btns[i].getAttribute('aria-current') === 'true') return i;
        return 0;
      }
      function draw(now) {
        raf = 0;
        if (!on) return;
        var i = current();
        var t = themes[i];
        stage.style.setProperty('--surface-tint', t[0]);
        stage.style.setProperty('--accent-glow', t[1]);
        var w = stage.clientWidth, h = stage.clientHeight;
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        ctx.clearRect(0, 0, w, h);
        var n = i === 1 ? 52 : i === 2 ? 18 : 14;
        for (var p = 0; p < n; p++) {
          var x = (Math.sin(p * 12.3 + now / 900) * 0.5 + 0.5) * w;
          var y = (Math.cos(p * 7.1 + now / 1100) * 0.5 + 0.5) * h;
          ctx.fillStyle = i === 1 ? 'rgba(31,78,59,.4)' : i === 2 ? 'rgba(200,138,75,.32)' : 'rgba(110,68,255,.26)';
          ctx.beginPath();
          ctx.arc(x, y, i === 1 ? 1.15 : 2.3, 0, Math.PI * 2);
          ctx.fill();
        }
        if (on) raf = requestAnimationFrame(draw);
      }
      function start() { if (on || reduce || !seen || document.hidden) return; on = true; raf = requestAnimationFrame(draw); }
      function stop() { on = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) { seen = en[0].isIntersecting; seen ? start() : stop(); }).observe(stage);
      } else { seen = true; start(); }
      document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    })();

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button');
      if (!btn) return;
      var card = btn.closest('.d2c-card');
      if (card && /Bag|Subscribe/.test(btn.textContent || '')) flyTo(card, document.getElementById('cartCount'));
    }, true);

    pillCursor([
      ['#craftPanel-extraction', 'Hold to pull shot · 9.2 BAR'],
      ['#scratchCanvas', 'Wipe condensation'],
      ['#productGridContainer', 'Add the roast']
    ]);
    kinetic('#productGridContainer .d2c-card');
  }

  /* ── Deli Chic ───────────────────────────────────────────────── */
  if (document.getElementById('bwalkin')) {
    (function loupeHud() {
      var box = document.getElementById('heroLoupeContainer');
      var glass = document.getElementById('heroLoupeGlass');
      var hud = document.getElementById('loupeHud');
      var read = document.getElementById('loupeReadout');
      var call = document.getElementById('loupeCall');
      if (!box || !hud) return;
      if (!hud.querySelector('svg')) {
        hud.insertAdjacentHTML('afterbegin',
          '<svg class="loupe-reticle" viewBox="0 0 100 100" aria-hidden="true">' +
          '<circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="0.7"/>' +
          '<circle cx="50" cy="50" r="38" fill="none" stroke="rgba(197,154,69,.7)" stroke-width="0.5" stroke-dasharray="3 4"/>' +
          '<path d="M50 8v10M50 82v10M8 50h10M82 50h10" stroke="#FFE6A3" stroke-width="1.1"/>' +
          '</svg>');
      }
      var spots = [
        { x: 0.32, y: 0.42, name: 'Beechwood smoke ring' },
        { x: 0.58, y: 0.48, name: 'Intramuscular marbling' },
        { x: 0.7, y: 0.3, name: 'Tellicherry pepper crust' }
      ];
      var tx = 50, ty = 50, x = 50, y = 50, raf = 0, seen = false, locked = null;
      function loop() {
        raf = 0;
        x += (tx - x) * 0.16;
        y += (ty - y) * 0.16;
        var r = box.getBoundingClientRect();
        var px = x / 100 * r.width, py = y / 100 * r.height;
        var near = null, nearD = 1e9;
        for (var i = 0; i < spots.length; i++) {
          var sx = spots[i].x * r.width, sy = spots[i].y * r.height;
          var d = Math.hypot(px - sx, py - sy);
          if (d < nearD) { nearD = d; near = spots[i]; }
        }
        if (locked) {
          var ld = Math.hypot(px - locked.x * r.width, py - locked.y * r.height);
          if (ld > 48) locked = null;
        } else if (near && nearD < 24) {
          locked = near;
        }
        if (locked) {
          tx += (locked.x * 100 - tx) * 0.22;
          ty += (locked.y * 100 - ty) * 0.22;
        }
        hud.style.transform = 'translate3d(' + px.toFixed(1) + 'px,' + py.toFixed(1) + 'px,0) translate(-50%,-50%)';
        var mmX = (x / 100 * 86).toFixed(1);
        var mmY = (y / 100 * 54).toFixed(1);
        var marble = (18 + (x / 100) * 22).toFixed(0);
        var cold = (2.3 + (y / 100) * 0.2).toFixed(1);
        if (read) read.textContent = 'X ' + mmX + 'mm  Y ' + mmY + 'mm  ·  ' + marble + '% marbling  ·  ' + cold + '°C';
        if (call) {
          call.classList.toggle('on', !!locked);
          if (locked) {
            call.textContent = locked.name;
            call.style.transform = 'translate3d(' + (locked.x * r.width).toFixed(1) + 'px,' + (locked.y * r.height + 18).toFixed(1) + 'px,0)';
          }
        }
        if (seen) raf = requestAnimationFrame(loop);
      }
      box.addEventListener('pointermove', function (e) {
        var r = box.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width) * 100;
        ty = ((e.clientY - r.top) / r.height) * 100;
        hud.style.display = 'block';
        if (glass) glass.classList.add('is-chromatic');
        if (!raf) raf = requestAnimationFrame(loop);
      }, { passive: true });
      box.addEventListener('pointerleave', function () {
        hud.style.display = 'none';
        if (call) call.classList.remove('on');
        if (glass) glass.classList.remove('is-chromatic');
        locked = null;
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) {
          seen = en[0].isIntersecting;
          box.classList.toggle('is-live', seen);
          if (!seen && raf) { cancelAnimationFrame(raf); raf = 0; }
        }).observe(box);
      } else { seen = true; box.classList.add('is-live'); }
    })();

    (function atmo() {
      var stage = document.getElementById('deliStage');
      if (!stage) return;
      var canvas = document.createElement('canvas');
      canvas.className = 'ch-atmo';
      canvas.setAttribute('aria-hidden', 'true');
      stage.prepend(canvas);
      var ctx = canvas.getContext('2d');
      var on = false, raf = 0, seen = false, scan = 0;
      var names = ['primal', 'atelier', 'awadhi'];
      function chapter() {
        var ids = ['deliCh1', 'deliCh2', 'deliCh3'];
        var best = 0, op = -1;
        for (var i = 0; i < ids.length; i++) {
          var el = document.getElementById(ids[i]);
          var o = el ? parseFloat(el.style.opacity || '0') : 0;
          if (o > op) { op = o; best = i; }
        }
        return best;
      }
      function draw(now) {
        raf = 0;
        if (!on) return;
        var ch = chapter();
        stage.dataset.atmo = names[ch];
        var w = stage.clientWidth, h = stage.clientHeight;
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        ctx.clearRect(0, 0, w, h);
        if (ch === 0) {
          scan = (scan + 2.2) % h;
          ctx.strokeStyle = 'rgba(180,230,255,.7)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, scan); ctx.lineTo(w, scan); ctx.stroke();
        } else if (ch === 1) {
          for (var i = 0; i < 18; i++) {
            var y = h - ((now / 28 + i * 38) % (h + 50));
            ctx.fillStyle = 'rgba(255,160,60,' + (0.08 + (i % 4) * 0.03) + ')';
            ctx.beginPath();
            ctx.ellipse(w * (0.28 + (i % 5) * 0.11), y, 34, 16, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          for (var s = 0; s < 26; s++) {
            var x = (Math.sin(s + now / 1400) * 0.5 + 0.5) * w;
            var y2 = (Math.cos(s * 1.7 + now / 1600) * 0.5 + 0.5) * h;
            var fg = s % 3 === 0;
            ctx.globalAlpha = fg ? 0.9 : 0.38;
            ctx.fillStyle = s % 2 ? 'rgba(212,175,55,.85)' : 'rgba(120,40,20,.7)';
            ctx.beginPath();
            ctx.ellipse(x, y2, fg ? (s % 2 ? 7 : 2.2) : 3, fg ? (s % 2 ? 1.6 : 2.2) : 3, s, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (on) raf = requestAnimationFrame(draw);
      }
      function start() { if (on || reduce || !seen || document.hidden) return; on = true; raf = requestAnimationFrame(draw); }
      function stop() { on = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) {
          seen = en[0].isIntersecting;
          stage.classList.toggle('is-live', seen);
          seen ? start() : stop();
        }).observe(stage);
      } else { seen = true; stage.classList.add('is-live'); start(); }
      document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    })();

    (function heritage() {
      var cut = document.getElementById('heritageCut');
      var bench = document.getElementById('bench');
      var heritage = document.getElementById('heritage');
      if (!cut || !bench) return;
      var steps = bench.querySelectorAll('.bench-step');
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'bench-line');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = '<path fill="none" stroke="#C59A45" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>';
      bench.appendChild(svg);
      var path = svg.querySelector('path');

      function layoutLine() {
        var br = bench.getBoundingClientRect();
        if (br.width < 8 || br.height < 8) return;
        svg.setAttribute('viewBox', '0 0 ' + Math.round(br.width) + ' ' + Math.round(br.height));
        svg.style.width = '100%';
        svg.style.height = '100%';
        var d = [];
        for (var i = 0; i < steps.length; i++) {
          var m = steps[i].querySelector('.bench-mark');
          if (!m) continue;
          var r = m.getBoundingClientRect();
          var x = r.left + r.width / 2 - br.left;
          var y = r.top + r.height / 2 - br.top;
          d.push((i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1));
        }
        if (d.length) path.setAttribute('d', d.join(' '));
      }

      function onScroll() {
        layoutLine();
        var host = heritage || bench;
        var r = host.getBoundingClientRect();
        var span = r.height + window.innerHeight * 0.2;
        var p = clamp((-r.top + window.innerHeight * 0.35) / span, 0, 1);
        path.style.strokeDashoffset = String((1 - p) * 100);
        var last = steps[steps.length - 1];
        var lr = last && last.getBoundingClientRect();
        var lastOn = !!(lr && lr.top < window.innerHeight * 0.9 && lr.bottom > 64);
        if (lastOn || p > 0.72) cut.classList.add('is-sealed');
        for (var i = 0; i < steps.length; i++) {
          steps[i].classList.toggle('is-hot', p >= (i / (steps.length - 1 || 1)) - 0.04);
        }
      }

      var ticking = false;
      function request() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { ticking = false; onScroll(); });
      }
      window.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', request);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) {
          if (en[0].isIntersecting) request();
        }, { threshold: 0.15 }).observe(bench);
        var last = steps[steps.length - 1];
        if (last) {
          new IntersectionObserver(function (en) {
            if (en[0].isIntersecting) cut.classList.add('is-sealed');
          }, { threshold: 0.2 }).observe(last);
        }
      }
      onScroll();
    })();

    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('button');
      if (!btn) return;
      var card = btn.closest('#productGrid > div, .deli-card');
      if (card && /Add to Basket/.test(btn.textContent || '')) flyTo(card, document.getElementById('basketCount'));
    }, true);

    var audioBtns = [].slice.call(document.querySelectorAll('[data-deli-audio]'));
    if (audioBtns.length) {
      var actx = null, node = null;
      function setAudio(on) {
        audioBtns.forEach(function (btn) {
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          btn.textContent = on ? 'On' : 'Sound';
        });
      }
      audioBtns[0].addEventListener('click', function () {
        var on = audioBtns[0].getAttribute('aria-pressed') === 'true';
        if (on) {
          if (node) { try { node.stop(); } catch (err) {} node = null; }
          setAudio(false);
          return;
        }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        actx = actx || new AC();
        if (actx.state === 'suspended') actx.resume();
        var buffer = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
        var data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
        node = actx.createBufferSource();
        node.buffer = buffer; node.loop = true;
        var filter = actx.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = 2400; filter.Q.value = 0.7;
        var gain = actx.createGain(); gain.gain.value = 0.04;
        node.connect(filter); filter.connect(gain); gain.connect(actx.destination);
        node.start();
        var osc = actx.createOscillator();
        var g2 = actx.createGain();
        osc.frequency.value = 180;
        g2.gain.setValueAtTime(0.05, actx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.18);
        osc.connect(g2); g2.connect(actx.destination);
        osc.start(); osc.stop(actx.currentTime + 0.2);
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
