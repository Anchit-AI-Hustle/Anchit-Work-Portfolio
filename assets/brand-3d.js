/* Brand 3D models, Gram Street Coffee and Deli Chic.
 *
 * Every object here is modelled from what the brands actually serve, never
 * from stock: Gram Street's purple latte, ceremonial matcha and gelato in its
 * lilac-and-chrome palette; Deli Chic's charcuterie, sausages and dim sum on
 * walnut, in burgundy and brass. No textures are downloaded: every surface
 * (latte art, salami marbling, wood grain) is painted on a canvas here, so a
 * model costs one script and the shared three.js copy, nothing else.
 *
 * Two uses:
 *   1. live: <div data-b3d="gram-cup"> becomes a WebGL viewer you can turn.
 *      Lazy: three.js (670 KB, already vendored) is imported only when a viewer
 *      nears the viewport, and the loop runs only while it is on screen and
 *      the tab is visible. Reduced motion gets one still frame and no spin.
 *   2. stills: scripts/render-brand-stills.mjs drives the same builders in
 *      headless Chromium and saves PNG frames, which the pages use where a
 *      photo used to be. One renderer, so the stills and the live model match.
 *
 * House rules: transform/opacity only on the DOM side, nothing written to
 * :root, nothing animating off screen, will-change never left on.
 */
(function () {
  'use strict';

  var THREE_URL = '/assets/vendor/three.module.min.js';
  var threePromise = null;
  function loadThree() {
    if (!threePromise) threePromise = import(THREE_URL);
    return threePromise;
  }

  /* ── palettes, taken from each page's own tokens ──────────────────────── */
  var PAL = {
    gram: { bg: 0xEFE7FF, lilac: 0xCDB8F7, grape: 0x2B1650, chrome: 0xE9E6F2, purple: 0x9B7BE0, foam: 0xF4EEFF, matcha: 0x8DB04F, gelato: 0xF6C9DA, cocoa: 0x4A2B1E },
    deli: { bg: 0x2A0A10, burgundy: 0x4A0E17, crimson: 0xCD2653, brass: 0xC59A45, walnut: 0x5A3A22, linen: 0xFDFBF7, salami: 0x9E2A2F, fat: 0xF3DCCB, sausage: 0xB5652E, dough: 0xF5EEE2 }
  };

  /* ── canvas-painted surfaces ──────────────────────────────────────────── */
  function canvasTex(T, size, paint) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    paint(c.getContext('2d'), size);
    var t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // A rosetta poured into a latte: a heart stack and a pulled stem.
  function latteArt(T, base, foam) {
    return canvasTex(T, 512, function (g, n) {
      var c = n / 2;
      var grd = g.createRadialGradient(c, c, n * 0.05, c, c, n * 0.5);
      grd.addColorStop(0, base); grd.addColorStop(1, shade(base, -0.25));
      g.fillStyle = grd; g.fillRect(0, 0, n, n);
      // a crema ring where the pour met the wall
      g.strokeStyle = shade(base, 0.25); g.lineWidth = n * 0.03;
      g.beginPath(); g.arc(c, c, n * 0.46, 0, Math.PI * 2); g.stroke();
      // rosetta: crescents that shrink up the stem, each one curved like a
      // leaf, then a heart at the tip and the pulled-through line
      g.fillStyle = foam;
      for (var i = 0; i < 8; i++) {
        var y = n * (0.74 - i * 0.055), w = n * (0.25 - i * 0.022), lift = n * (0.075 - i * 0.004);
        g.beginPath(); g.moveTo(c - w, y);
        g.quadraticCurveTo(c, y + lift, c + w, y);
        g.quadraticCurveTo(c, y + lift * 0.35, c - w, y);
        g.fill();
      }
      g.beginPath(); g.moveTo(c, n * 0.30);
      g.bezierCurveTo(c - n * 0.09, n * 0.22, c - n * 0.05, n * 0.15, c, n * 0.2);
      g.bezierCurveTo(c + n * 0.05, n * 0.15, c + n * 0.09, n * 0.22, c, n * 0.30);
      g.fill();
      g.strokeStyle = foam; g.lineWidth = n * 0.01; g.lineCap = 'round';
      g.beginPath(); g.moveTo(c, n * 0.24); g.quadraticCurveTo(c + n * 0.01, n * 0.55, c, n * 0.84); g.stroke();
    });
  }
  function salamiTex(T, seed) {
    var r = rng(seed);
    return canvasTex(T, 256, function (g, n) {
      g.fillStyle = '#9E2A2F'; g.fillRect(0, 0, n, n);
      for (var i = 0; i < 70; i++) {
        g.fillStyle = r() < 0.75 ? 'rgba(243,220,203,0.92)' : 'rgba(110,22,28,0.8)';
        g.beginPath(); g.ellipse(r() * n, r() * n, 3 + r() * 9, 2 + r() * 6, r() * 3, 0, Math.PI * 2); g.fill();
      }
      for (var k = 0; k < 40; k++) { g.fillStyle = 'rgba(20,10,10,0.75)'; g.beginPath(); g.arc(r() * n, r() * n, 1 + r() * 1.6, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = 'rgba(70,12,16,0.9)'; g.lineWidth = n * 0.05; g.beginPath(); g.arc(n / 2, n / 2, n * 0.475, 0, Math.PI * 2); g.stroke();
    });
  }
  function woodTex(T) {
    var r = rng(7);
    return canvasTex(T, 512, function (g, n) {
      g.fillStyle = '#5A3A22'; g.fillRect(0, 0, n, n);
      for (var i = 0; i < 90; i++) {
        var y = r() * n, a = 0.05 + r() * 0.12;
        g.strokeStyle = r() < 0.5 ? 'rgba(30,16,8,' + a + ')' : 'rgba(150,100,60,' + a + ')';
        g.lineWidth = 1 + r() * 3;
        g.beginPath(); g.moveTo(0, y);
        for (var x = 0; x <= n; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * (2 + r() * 4));
        g.stroke();
      }
    });
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    var f = function (v) { return Math.max(0, Math.min(255, Math.round(v + v * amt))); };
    return '#' + ((1 << 24) + (f(r) << 16) + (f(gg) << 8) + f(b)).toString(16).slice(1);
  }

  /* ── a soft studio environment for reflections, built, not downloaded ─── */
  function studioEnv(T, renderer, tint) {
    var pm = new T.PMREMGenerator(renderer);
    var s = new T.Scene();
    var room = new T.Mesh(new T.BoxGeometry(10, 10, 10), new T.MeshBasicMaterial({ color: tint, side: T.BackSide }));
    s.add(room);
    var panel = function (x, y, z, w, h, i) {
      var m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(i, i, i) }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m);
    };
    panel(0, 4.6, 0, 6, 3, 3.2);      // softbox overhead
    panel(-4.6, 1, 1.5, 2, 4, 1.6);   // key strip
    panel(4.6, 0.5, -1, 1.5, 3, 0.9); // rim
    var env = pm.fromScene(s, 0.04).texture;
    pm.dispose();
    return env;
  }

  /* ── Gram Street models ───────────────────────────────────────────────── */
  function lilacCup(T, kind) {
    var p = PAL.gram, g = new T.Group();
    var glaze = new T.MeshPhysicalMaterial({ color: p.lilac, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
    var chrome = new T.MeshStandardMaterial({ color: p.chrome, metalness: 1, roughness: 0.18 });
    // cup wall: a lathe profile, outside then back down the inside
    var pts = [], i;
    var prof = [[0.0, 0.0], [0.62, 0.0], [0.70, 0.08], [0.86, 0.55], [0.98, 1.02], [1.0, 1.08], [0.94, 1.08], [0.92, 1.0], [0.80, 0.56], [0.64, 0.14], [0.0, 0.14]];
    for (i = 0; i < prof.length; i++) pts.push(new T.Vector2(prof[i][0], prof[i][1]));
    var cup = new T.Mesh(new T.LatheGeometry(pts, 96), glaze);
    g.add(cup);
    var handle = new T.Mesh(new T.TorusGeometry(0.28, 0.065, 20, 48, Math.PI * 1.25), glaze);
    handle.position.set(0.98, 0.58, 0); handle.rotation.z = -Math.PI * 0.62;
    g.add(handle);
    // the drink, with its art
    var art = { purple: ['#8E6BD6', '#F4EEFF'], matcha: ['#7FA545', '#F2F6E6'], espresso: ['#6B3E26', '#F3E3CF'] }[kind] || ['#8E6BD6', '#F4EEFF'];
    var top = new T.Mesh(new T.CircleGeometry(0.905, 64), new T.MeshPhysicalMaterial({ map: latteArt(T, art[0], art[1]), roughness: 0.55, clearcoat: 0.4 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.98; top.rotation.z = Math.PI * 0.12;
    g.add(top);
    // chrome saucer, the bar's own accent
    var sp = [[0, 0], [1.42, 0], [1.52, 0.06], [1.56, 0.12], [1.5, 0.13], [1.4, 0.08], [0.75, 0.06], [0.7, 0.09], [0, 0.09]];
    var spts = sp.map(function (q) { return new T.Vector2(q[0], q[1]); });
    var saucer = new T.Mesh(new T.LatheGeometry(spts, 96), chrome);
    saucer.position.y = -0.09;
    g.add(saucer);
    g.position.y = -0.45;
    return g;
  }
  function gelatoCup(T) {
    var p = PAL.gram, g = new T.Group();
    var paper = new T.MeshPhysicalMaterial({ color: 0xA98BEA, roughness: 0.55, sheen: 0.6, sheenColor: new T.Color(0xffffff) });
    var cupPts = [[0, 0], [0.55, 0], [0.82, 0.9], [0.86, 0.92], [0.8, 0.92], [0, 0.9]].map(function (q) { return new T.Vector2(q[0], q[1]); });
    g.add(new T.Mesh(new T.LatheGeometry(cupPts, 72), paper));
    var flavours = [0xEE8FB4, 0x5B3A29, 0x9CC26A];
    flavours.forEach(function (c, i) {
      var scoop = new T.Mesh(new T.SphereGeometry(0.46, 48, 32), new T.MeshPhysicalMaterial({ color: c, roughness: 0.75, sheen: 0.5 }));
      scoop.scale.y = 0.8;
      var a = i * Math.PI * 2 / 3;
      scoop.position.set(Math.cos(a) * 0.3, 1.05 + (i === 0 ? 0.32 : 0), Math.sin(a) * 0.3);
      g.add(scoop);
    });
    var spoon = new T.Mesh(new T.BoxGeometry(0.06, 0.9, 0.16), new T.MeshStandardMaterial({ color: PAL.gram.chrome, metalness: 1, roughness: 0.2 }));
    spoon.position.set(0.35, 1.45, 0.1); spoon.rotation.z = -0.5;
    g.add(spoon);
    g.position.y = -0.9;
    return g;
  }

  /* ── Deli Chic models ─────────────────────────────────────────────────── */
  function charcuterieBoard(T) {
    var p = PAL.deli, g = new T.Group();
    // walnut board with a rounded end and a hang hole
    var s = new T.Shape();
    var w = 2.3, h = 1.25, r = 0.28;
    s.moveTo(-w + r, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
    s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(-w + r, h);
    s.quadraticCurveTo(-w, h, -w, h - r); s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    var hole = new T.Path(); hole.absarc(-w + 0.32, 0, 0.11, 0, Math.PI * 2, true); s.holes.push(hole);
    var board = new T.Mesh(new T.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3 }),
      new T.MeshPhysicalMaterial({ map: woodTex(T), roughness: 0.55, clearcoat: 0.35 }));
    board.rotation.x = -Math.PI / 2;
    g.add(board);
    var topY = 0.2;
    // fanned salami slices
    for (var i = 0; i < 7; i++) {
      var sl = new T.Mesh(new T.CylinderGeometry(0.34, 0.34, 0.03, 40), [
        new T.MeshStandardMaterial({ color: 0x6E161C, roughness: 0.7 }),
        new T.MeshStandardMaterial({ map: salamiTex(T, 11 + i), roughness: 0.6 }),
        new T.MeshStandardMaterial({ map: salamiTex(T, 11 + i), roughness: 0.6 })
      ]);
      sl.position.set(-1.1 + i * 0.2, topY + 0.03 + i * 0.012, -0.35 + Math.sin(i * 0.8) * 0.05);
      sl.rotation.set(-0.12, 0, 0.18);
      g.add(sl);
    }
    // beechwood-smoked frankfurters
    var sausageMat = new T.MeshPhysicalMaterial({ color: p.sausage, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    for (var k = 0; k < 3; k++) {
      var sg = new T.Mesh(new T.CapsuleGeometry(0.13, 0.75, 8, 24), sausageMat);
      sg.rotation.z = Math.PI / 2; sg.rotation.y = 0.25 + k * 0.05;
      sg.position.set(1.15, topY + 0.13, -0.6 + k * 0.32);
      g.add(sg);
    }
    // dim sum, pleated
    var doughMat = new T.MeshPhysicalMaterial({ color: p.dough, roughness: 0.45, transmission: 0.15, thickness: 0.3 });
    var mp = [];
    for (var a = 0; a <= 20; a++) { var t = a / 20; mp.push(new T.Vector2(Math.sin(t * Math.PI) * 0.26 + 0.02, t * 0.34)); }
    for (var d = 0; d < 3; d++) {
      var mo = new T.Mesh(new T.LatheGeometry(mp, 14), doughMat);
      mo.position.set(-0.55 + d * 0.42, topY, 0.65); mo.rotation.y = d;
      g.add(mo);
      var pinch = new T.Mesh(new T.ConeGeometry(0.06, 0.1, 10), doughMat);
      pinch.position.set(-0.55 + d * 0.42, topY + 0.38, 0.65); g.add(pinch);
    }
    // a brass cheese knife, the page's accent
    var brass = new T.MeshStandardMaterial({ color: p.brass, metalness: 1, roughness: 0.25 });
    var blade = new T.Mesh(new T.BoxGeometry(0.9, 0.02, 0.2), brass); blade.position.set(0.2, topY + 0.03, 0.05); blade.rotation.y = 0.5;
    var hdl = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.55, 16), new T.MeshStandardMaterial({ color: p.burgundy, roughness: 0.4 }));
    hdl.rotation.z = Math.PI / 2; hdl.rotation.y = 0.5; hdl.position.set(-0.45, topY + 0.05, 0.42);
    g.add(blade, hdl);
    // rosemary sprig
    var leaf = new T.MeshStandardMaterial({ color: 0x3F6B3A, roughness: 0.8 });
    for (var l = 0; l < 9; l++) { var lf = new T.Mesh(new T.CapsuleGeometry(0.018, 0.14, 4, 8), leaf); lf.position.set(1.45 + l * 0.05, topY + 0.03, 0.55 + (l % 2 ? 0.05 : -0.05)); lf.rotation.set(Math.PI / 2, 0, (l % 2 ? 0.6 : -0.6)); g.add(lf); }
    g.position.y = -0.1;
    return g;
  }

  var MODELS = {
    'gram-cup': { brand: 'gram', build: function (T) { return lilacCup(T, 'purple'); }, cam: [0, 2.7, 3.7], look: [0, 0.05, 0] },
    'gram-matcha': { brand: 'gram', build: function (T) { return lilacCup(T, 'matcha'); }, cam: [0, 2.7, 3.7], look: [0, 0.05, 0] },
    'gram-espresso': { brand: 'gram', build: function (T) { return lilacCup(T, 'espresso'); }, cam: [0, 2.7, 3.7], look: [0, 0.05, 0] },
    'gram-gelato': { brand: 'gram', build: gelatoCup, fit: 0.9, cam: [0, 1.4, 4.1], look: [0, 0.35, 0] },
    'deli-board': { brand: 'deli', build: charcuterieBoard, fit: 0.72, cam: [0, 3.1, 4.4], look: [0, 0, 0] }
  };

  /* ── a scene for one model ────────────────────────────────────────────── */
  function makeScene(T, canvas, name, opts) {
    var M = MODELS[name];
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!opts.still });
    renderer.setPixelRatio(opts.dpr || Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = M.brand === 'deli' ? 1.05 : 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    var scene = new T.Scene();
    scene.environment = studioEnv(T, renderer, M.brand === 'deli' ? 0x3A1A1A : 0xE8DEFF);
    var cam = new T.PerspectiveCamera(32, 1, 0.1, 80);
    var key = new T.DirectionalLight(0xffffff, M.brand === 'deli' ? 2.2 : 1.6);
    key.position.set(2.5, 5, 3); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6; key.shadow.bias = -0.0005;
    scene.add(key, new T.HemisphereLight(M.brand === 'deli' ? 0xFFE6C7 : 0xF4EEFF, M.brand === 'deli' ? 0x2A0A10 : 0x9B7BE0, 0.6));
    var model = M.build(T);
    model.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(model);
    var floor = new T.Mesh(new T.CircleGeometry(4, 48), new T.ShadowMaterial({ opacity: M.brand === 'deli' ? 0.45 : 0.18 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = M.brand === 'deli' ? -0.14 : -0.56; floor.receiveShadow = true;
    scene.add(floor);
    // Frame the model from its own bounds, so every model and every aspect
    // ratio shows the whole object with a margin, never a crop.
    var sphere = new T.Box3().setFromObject(model).getBoundingSphere(new T.Sphere());
    var dir = new T.Vector3().fromArray(M.cam).normalize();
    function size() {
      var w = canvas.clientWidth || opts.w || 600, h = canvas.clientHeight || opts.h || 600;
      renderer.setSize(w, h, false); cam.aspect = w / h;
      var vfov = cam.fov * Math.PI / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
      var dist = sphere.radius * (M.fit || 0.66) / Math.sin(Math.min(vfov, hfov) / 2);
      cam.position.copy(sphere.center).addScaledVector(dir, dist);
      cam.lookAt(sphere.center);
      cam.updateProjectionMatrix();
    }
    size();
    return { renderer: renderer, scene: scene, cam: cam, model: model, size: size };
  }

  /* ── live viewers ─────────────────────────────────────────────────────── */
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function webglOK() {
    try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
  }

  function mount(el) {
    if (el.dataset.b3dReady) return;
    el.dataset.b3dReady = '1';
    var name = el.getAttribute('data-b3d');
    if (!MODELS[name] || !webglOK()) { el.classList.add('b3d-fallback'); return; }
    loadThree().then(function (T) {
      var canvas = document.createElement('canvas');
      canvas.className = 'b3d-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      el.appendChild(canvas);
      var S = makeScene(T, canvas, name, {});
      var yaw = -0.5, pitch = 0, tYaw = yaw, tPitch = 0, dragging = false, lx = 0, ly = 0, lastT = 0;
      var running = false, onScreen = false, raf = 0, idle = !reduced;
      function frame(now) {
        raf = 0;
        if (!running) return;
        var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;
        if (idle && !dragging) tYaw += dt * 0.35;
        // 4D: the model leans with its position through the viewport
        var r = el.getBoundingClientRect(), vh = window.innerHeight || 1;
        var through = Math.max(-1, Math.min(1, ((r.top + r.height / 2) - vh / 2) / vh));
        yaw += (tYaw - yaw) * 0.12; pitch += ((tPitch + through * 0.18) - pitch) * 0.12;
        S.model.rotation.y = yaw; S.model.rotation.x = pitch;
        S.renderer.render(S.scene, S.cam);
        raf = requestAnimationFrame(frame);
      }
      function start() { if (running || !onScreen || document.hidden) return; running = true; lastT = 0; if (!raf) raf = requestAnimationFrame(frame); }
      function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }
      function still() { S.model.rotation.y = yaw; S.renderer.render(S.scene, S.cam); }
      new IntersectionObserver(function (en) { onScreen = en[0].isIntersecting; if (reduced) { if (onScreen) still(); return; } onScreen ? start() : stop(); }).observe(el);
      document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
      new ResizeObserver(function () { S.size(); if (!running) still(); }).observe(el);
      // turn it by hand; vertical drags still scroll the page (touch-action: pan-y)
      el.addEventListener('pointerdown', function (e) { dragging = true; lx = e.clientX; ly = e.clientY; idle = false; el.setPointerCapture && el.setPointerCapture(e.pointerId); });
      el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        tYaw += (e.clientX - lx) * 0.012; tPitch = Math.max(-0.5, Math.min(0.5, tPitch + (e.clientY - ly) * 0.004));
        lx = e.clientX; ly = e.clientY;
        if (reduced) { yaw = tYaw; pitch = tPitch; still(); }
      });
      var end = function () { dragging = false; };
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      el.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { tYaw += (e.key === 'ArrowLeft' ? -0.3 : 0.3); idle = false; if (reduced) { yaw = tYaw; still(); } e.preventDefault(); }
      });
      el.classList.add('b3d-live');
      if (window.BrandSense) window.BrandSense.bind(el);
      still();
    }).catch(function () { el.classList.add('b3d-fallback'); });
  }

  function boot() {
    var els = [].slice.call(document.querySelectorAll('[data-b3d]'));
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(mount); return; }
    var io = new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); mount(e.target); } });
    }, { rootMargin: '300px 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* used by scripts/render-brand-stills.mjs */
  window.BrandStill = function (name, w, h) {
    return loadThree().then(function (T) {
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      document.body.appendChild(canvas);
      var S = makeScene(T, canvas, name, { still: true, dpr: 1, w: w, h: h });
      S.model.rotation.y = -0.55;
      S.renderer.render(S.scene, S.cam);
      return canvas.toDataURL('image/png');
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
