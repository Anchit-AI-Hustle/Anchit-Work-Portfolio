/*
 * Super Over: a stadium T20 batting game under floodlights.
 * You bat, the computer bowls and fields. Original art, names and code.
 *
 * Two cameras: a broadcast view from behind and above the batter looking down the
 * pitch (a small perspective projection written here), and a top-down field view
 * once the ball is hit. Everything is drawn on one canvas, no assets.
 *
 * Coordinates
 *   Batting view : x across the pitch (+ = off side), y height, z from the batter's
 *                  stumps toward the bowler (the bowler's stumps are at z = 20.12).
 *   Field view   : x across (+ = off side), z along the pitch (+ = toward the bowler),
 *                  origin at the middle of the pitch, so the batter's stumps are at
 *                  z = -10.06. Field z = batting z - 10.06.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------ helpers */
  const TAU = Math.PI * 2, D2R = Math.PI / 180, GR = 9.8;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hyp = Math.hypot;
  const sgn = (v) => (v < 0 ? -1 : 1);
  let rnd = Math.random;
  const rr = (a, b) => a + (b - a) * rnd();
  const pickOf = (a) => a[(rnd() * a.length) | 0];
  const weighted = (list) => {
    let t = 0; for (const e of list) t += e[1];
    let r = rnd() * t;
    for (const e of list) { r -= e[1]; if (r <= 0) return e[0]; }
    return list[0][0];
  };
  let arc = null;

  const PITCH = 20.12, HALF = 10.06, ROPE = 68, HITZ = 1.0, SWING_LAG = 0.14, SWING_DUR = 0.4;
  const THROW_V = 32, THROW_REL = 0.5;
  const FONT_UI = "'Inter', system-ui, -apple-system, sans-serif";
  const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";
  const FONT_DISP = "'Fraunces', Georgia, serif";
  const C = { ink: '#FBF5EC', dim: '#A39E94', gold: '#c9a96e', warm: '#FFB736', prim: '#FF6940', deep: '#FF4D1F', bg: '#0F0D0A' };

  /* ------------------------------------------------------------ content */
  const BATTERS = [
    { id: 'marlow', label: 'K. Marlow', name: 'Kian Marlow' },
    { id: 'ashby', label: 'T. Ashby', name: 'Tariq Ashby' },
    { id: 'okonkwo', label: 'D. Okonkwo', name: 'Dev Okonkwo' },
    { id: 'lindqvist', label: 'M. Lindqvist', name: 'Mateo Lindqvist' },
    { id: 'sorensen', label: 'A. Sorensen', name: 'Anvi Sorensen' },
    { id: 'fenwick', label: 'S. Fenwick', name: 'Sami Fenwick' },
  ];
  const EXTRA_BATTERS = ['Rhys Calloway', 'Niko Baptiste', 'Yusuf Delacroix', 'Arlo Trevane', 'Jai Holloway'];
  const PACE_BOWLERS = ['Dane Corbin', 'Osei Brandt', 'Rafi Kellner', 'Luka Venn'];
  const SPIN_BOWLERS = ['Emre Castellan', 'Ishaan Pell', 'Bastien Orlov'];
  const ADS = [
    ['ZENVARA', '#e8452c', '#fff4e6'], ['KORVEX', '#1f6feb', '#ffffff'], ['SUNDERLY BANK', '#f2c230', '#1a1405'],
    ['TOMBOLA TEA', '#1b8a5a', '#f4fff8'], ['AXIOMA', '#7c3aed', '#ffffff'], ['BLUMARO', '#06b6d4', '#021417'],
    ['QUILLON AIR', '#d9d9de', '#13161c'], ['PEPPA POPS', '#ec4899', '#ffffff'], ['NORTHGATE', '#111827', '#f5c542'],
    ['HALVEN', '#ff7a1a', '#190a00'], ['LUMOSA', '#f8fafc', '#b4271b'], ['DRIFTWOOD', '#3f6212', '#f7fee7'],
  ];
  const SAY = {
    dot: ['Beaten! Straight past the edge of the bat.', 'Dot ball. The bowler holds his nerve.', 'Left alone, and the keeper gathers.', 'Swing and a miss, the crowd groans.'],
    one: ['Worked away for a quick single.', 'Nudged into the gap, one more on the board.', 'Sharp running, they get through.'],
    two: ['Placed into the gap, an easy two.', 'Hustled back for the second!', 'Two, and the fielder is left chasing.'],
    three: ['Three! Superb running between the wickets.', 'They turn and turn again, three runs.'],
    four: ['Cracked through the gap, that races away!', 'Pure timing, and the rope is shaken.', 'Pierces the field like a needle through silk.', 'Nobody is catching that. Four.'],
    six: ['Launched into the night sky! Gone!', 'Out of the ground and into the car park!', 'Huge! The whole stand is on its feet.', 'Absolutely smoked, six more.'],
    bowled: ['Timber! The stumps are all over the place.', 'Cleaned up! Straight through the gate.'],
    lbw: ['Trapped on the crease, up goes the finger.', 'Plumb in front, no argument at all.'],
    caught: ['Skied, and the fielder settles under it.', 'Straight to the man, he holds on.'],
    behind: ['Thin edge, and the keeper does the rest.', 'A feather of an edge, safely taken.'],
    runout: ['Run out! A direct hit from the deep.', 'Short of the line, and the bails are off.'],
    wide: ['Wide called, an extra run.', 'Too far outside, the umpire stretches his arms.'],
    drop: ['Dropped! A life for the batter.', 'It burst through the hands, what a miss.'],
    overthrow: ['Overthrow! One more trickles away.'],
    inside: ['Inside edge, and it crashes into the stumps!'],
  };
  const sayOf = (k) => pickOf(SAY[k]);

  const DIFFS = {
    club: { label: 'Club', win: { p: 0.062, g: 0.128, m: 0.215 }, pace: [20.5, 23.5], spin: [13, 15.5], swing: 0.65, turn: 0.7, loose: 0.3, wide: 0.07, fspd: 6.2, react: 0.4, catchSk: 0.88, hint: true, target: { super: [14, 16], chase: [24, 30] } },
    pro: { label: 'Pro', win: { p: 0.047, g: 0.102, m: 0.185 }, pace: [23.5, 26.5], spin: [14.5, 17], swing: 0.95, turn: 1.0, loose: 0.16, wide: 0.05, fspd: 7.2, react: 0.3, catchSk: 0.94, hint: false, target: { super: [17, 19], chase: [30, 37] } },
    legend: { label: 'Legend', win: { p: 0.035, g: 0.078, m: 0.145 }, pace: [26.5, 30], spin: [16, 18.5], swing: 1.25, turn: 1.3, loose: 0.07, wide: 0.03, fspd: 8.2, react: 0.22, catchSk: 0.975, hint: false, target: { super: [20, 22], chase: [36, 44] } },
  };

  // [role, x, z] on the field (origin = middle of the pitch, +z toward the bowler, +x off side)
  const LAYOUT_PACE = [
    ['Keeper', 0.5, -24.5], ['Slip', 5.2, -22.5], ['Point', 24, -9], ['Cover', 24, 10], ['Mid-off', 12, 20],
    ['Mid-on', -13, 19], ['Midwicket', -28, 4], ['Fine leg', -36, -48], ['Third man', 40, -44], ['Long-on', -30, 50],
  ];
  const LAYOUT_SPIN = [
    ['Keeper', 0.4, -13.5], ['Slip', 3.6, -14.5], ['Cover', 21, 6], ['Mid-off', 10, 19], ['Mid-on', -10, 18],
    ['Square leg', -24, -6], ['Deep midwicket', -46, 12], ['Deep cover', 50, 12], ['Long-on', -30, 52], ['Long-off', 30, 52],
  ];

  /* ------------------------------------------------------------ deliveries */
  const KINDS = {
    good: { n: 'Good length', zb: [5.2, 6.4], yb: [0.55, 0.95], sp: 1 },
    full: { n: 'Full ball', zb: [3.0, 4.2], yb: [0.25, 0.55], sp: 1 },
    short: { n: 'Bouncer', zb: [8.4, 10.0], yb: [1.3, 1.75], sp: 1 },
    yorker: { n: 'Yorker', zb: [1.5, 1.9], yb: [0.06, 0.2], sp: 1.04 },
    slower: { n: 'Slower ball', zb: [5.4, 7.0], yb: [0.6, 1.15], sp: 0.74 },
    inswing: { n: 'Inswinger', zb: [3.4, 5.4], yb: [0.3, 0.7], sp: 1, sw: -1 },
    outswing: { n: 'Outswinger', zb: [3.4, 5.4], yb: [0.3, 0.7], sp: 1, sw: 1 },
    halfvolley: { n: 'Half-volley', zb: [2.8, 3.4], yb: [0.25, 0.4], sp: 0.9 },
    longhop: { n: 'Long hop', zb: [7.4, 8.2], yb: [0.9, 1.15], sp: 0.85 },
    offspin: { n: 'Off-spin', zb: [4.6, 6.2], yb: [0.55, 0.95], sp: 1, tn: 1 },
    legspin: { n: 'Leg-spin', zb: [4.6, 6.2], yb: [0.55, 0.95], sp: 1, tn: -1 },
    flighted: { n: 'Flighted ball', zb: [3.6, 5.2], yb: [0.35, 0.75], sp: 0.84, tn: 0.4 },
  };

  function pickLine(cfg, kind) {
    if (kind === 'halfvolley') return rr(0.05, 0.45);
    if (kind === 'longhop') return rr(0.15, 0.55);
    if (kind === 'yorker') return rr(-0.12, 0.28);
    if (kind === 'short') return rr(-0.3, 0.45);
    const r = rnd();
    if (r < cfg.wide) return (rnd() < 0.8 ? 1 : -1) * rr(1.02, 1.45);
    if (r < 0.62) return rr(-0.08, 0.38);
    if (r < 0.8) return rr(-0.5, -0.05);
    return rr(0.4, 0.85);
  }

  // One delivery, fully worked out in advance: where it bounces, how fast, when it arrives.
  function makeDelivery(bw, cfg, ramp, lastKind) {
    const pace = bw.pace;
    let kind;
    if (rnd() < cfg.loose) kind = rnd() < 0.5 ? 'halfvolley' : 'longhop';
    else {
      const list = pace
        ? [['good', 28], ['full', 20], ['short', 15], ['yorker', 12], ['slower', 12], ['inswing', 9], ['outswing', 9]]
        : [['offspin', 38], ['legspin', 38], ['flighted', 24]];
      kind = weighted(list);
      if (kind === lastKind && rnd() < 0.7) kind = weighted(list);
    }
    const k = KINDS[kind];
    const D = { kind, name: k.n, pace };
    const v1 = (pace ? rr(cfg.pace[0], cfg.pace[1]) : rr(cfg.spin[0], cfg.spin[1])) * ramp * k.sp;
    const x0 = -0.45 * bw.arm, y0 = pace ? 2.15 : 2.0, z0 = pace ? 17.9 : 17.6;
    const zb = rr(k.zb[0], k.zb[1]);
    const t1 = (z0 - zb) / v1;
    const vy0 = (0.5 * GR * t1 * t1 - y0) / t1;
    const vyb = vy0 - GR * t1;
    const v2 = v1 * (pace ? 0.8 : 0.85);
    const t2 = (zb - HITZ) / v2;
    const yb = rr(k.yb[0], k.yb[1]);
    let vyp = (yb + 0.5 * GR * t2 * t2) / t2;
    const e = clamp(vyp / -vyb, 0.3, 0.95);
    vyp = e * -vyb;
    const line = pickLine(cfg, kind);
    let sw = 0, turn = 0;
    if (k.sw) sw = k.sw * rr(0.28, 0.5) * cfg.swing;
    else if (pace) turn = rr(-0.1, 0.1);
    else turn = k.tn * rr(0.35, 0.8) * cfg.turn;
    const xb = line + turn;
    const us = zb / v2;
    let yS = vyp * us - 0.5 * GR * us * us; if (yS < 0) yS = -yS * 0.4;
    const xS = xb + (line - xb) * (us / t2);
    Object.assign(D, {
      x0, y0, z0, v1, v2, zb, t1, t2, vy0, vyb, vyp, sw, turn, xb, xbS: xb - sw, lineX: line,
      yBat: vyp * t2 - 0.5 * GR * t2 * t2, tArr: t1 + t2, tStump: t1 + us, xS, yS,
      hitsStumps: Math.abs(xS) < 0.125 && yS < 0.74,
      outsideLeg: xb < -0.22, speed: v1, kmh: Math.round(v1 * 5.4), win: cfg.win, arm: bw.arm,
    });
    D.wide = Math.abs(line) > 0.95;
    return D;
  }

  let BX = 0, BY = 0, BZ = 0;
  function ballAt(D, t) {
    if (t <= D.t1) {
      const s = t / D.t1;
      BX = D.x0 + (D.xbS - D.x0) * s + D.sw * s * s;
      BY = D.y0 + D.vy0 * t - 0.5 * GR * t * t;
      BZ = D.z0 - D.v1 * t;
    } else {
      const u = t - D.t1;
      BZ = D.zb - D.v2 * u;
      BX = D.xb + (D.lineX - D.xb) * (u / D.t2);
      let y = D.vyp * u - 0.5 * GR * u * u;
      if (y < 0) y = -y * 0.4;
      BY = y;
    }
  }

  /* ------------------------------------------------------------ shots */
  function decodeDir(ax) {
    return { dx: ax.x < -0.38 ? -1 : ax.x > 0.38 ? 1 : 0, dy: ax.y < -0.45 ? -1 : ax.y > 0.45 ? 1 : 0 };
  }

  // ang: degrees from straight (off side positive), v: exit speed, al: launch angle,
  // psi / psiF: bat angle at contact and at the end of the follow-through (degrees, 0 = down).
  function shotFor(dx, dy, D) {
    const shortB = D.zb > 6.7;
    let s;
    if (dy === 1) {
      if (dx === 0) s = { id: 'defend', name: 'Forward defence', ang: 0, v: 4.5, al: 0, psi: 6, psiF: 0 };
      else if (dx < 0) s = { id: 'glance', name: 'Leg glance', ang: -135, v: 17, al: 3, psi: -20, psiF: -70 };
      else s = { id: 'dab', name: 'Late dab', ang: 130, v: 15, al: 3, psi: 35, psiF: 70 };
    } else if (dy === -1) {
      if (dx === 0) s = { id: 'loftS', name: 'Lofted straight', ang: 0, v: 32, al: 30, psi: 0, psiF: -165 };
      else if (dx > 0) s = shortB ? { id: 'upcut', name: 'Upper cut', ang: 120, v: 29, al: 26, psi: 100, psiF: 150 } : { id: 'loftO', name: 'Lofted cover drive', ang: 38, v: 31, al: 28, psi: 50, psiF: 140 };
      else s = shortB ? { id: 'hook', name: 'Hook', ang: -105, v: 30, al: 22, psi: -100, psiF: -180 } : { id: 'slog', name: 'Slog sweep', ang: -58, v: 32, al: 30, psi: -75, psiF: -175 };
    } else {
      if (dx === 0) s = { id: 'driveS', name: shortB ? 'Swat' : 'Straight drive', ang: 0, v: 30, al: 4, psi: 10, psiF: -160 };
      else if (dx > 0) s = shortB ? { id: 'cut', name: 'Square cut', ang: 88, v: 28, al: 5, psi: 95, psiF: 60 } : { id: 'driveO', name: 'Cover drive', ang: 40, v: 30, al: 4, psi: 55, psiF: 135 };
      else s = shortB ? { id: 'pull', name: 'Pull shot', ang: -82, v: 29, al: 12, psi: -95, psiF: -170 } : { id: 'flick', name: 'Flick', ang: -52, v: 26, al: 5, psi: -45, psiF: -120 };
    }
    s.dx = dx; s.dy = dy; s.loft = dy === -1;
    return s;
  }

  // How well does this shot suit this ball? 0 to 1.
  function fitOf(s, D) {
    const L = D.zb, line = D.lineX, yb = D.yBat;
    const york = L < 2.3, full = L < 4.6, shortB = L >= 6.7, good = !full && !shortB;
    let fl = 1, fs = 1;
    const offLine = line >= 0 ? 1 : 1 - clamp(-line * 1.2, 0, 0.6);
    const legLine = line <= 0.2 ? 1 : 1 - clamp((line - 0.2) * 1.2, 0, 0.7);
    const strLine = 1 - clamp((Math.abs(line) - 0.3) * 1.0, 0, 0.55);
    switch (s.id) {
      case 'defend': fl = york ? 0.8 : 1; fs = 1 - clamp((Math.abs(line) - 0.5) * 0.6, 0, 0.4); break;
      case 'glance': fl = shortB ? 0.5 : york ? 0.6 : 1; fs = line <= 0.15 ? 1 : 1 - clamp((line - 0.15) * 1.3, 0, 0.7); break;
      case 'dab': fl = full ? 0.55 : york ? 0.4 : 1; fs = line >= 0.25 ? 1 : 0.55 + clamp(line + 0.2, 0, 0.45) * 0.9; break;
      case 'driveS': fl = shortB ? 0.28 : york ? 0.35 : good ? 0.8 : 1; fs = strLine; break;
      case 'loftS': fl = shortB ? 0.3 : york ? 0.3 : good ? 0.62 : 1; fs = strLine; break;
      case 'driveO': fl = york ? 0.35 : good ? 0.72 : 1; fs = offLine; break;
      case 'loftO': fl = shortB ? 0.3 : york ? 0.3 : good ? 0.58 : 1; fs = offLine; break;
      case 'flick': fl = york ? 0.45 : 1; fs = legLine; break;
      case 'slog': fl = york ? 0.4 : good ? 0.8 : 1; fs = legLine; break;
      case 'pull': fl = yb >= 0.85 ? 1 : 0.55; fs = line <= 0.3 ? 1 : 1 - clamp((line - 0.3), 0, 0.6); break;
      case 'hook': fl = yb >= 1.1 ? 1 : 0.45; fs = line <= 0.3 ? 1 : 1 - clamp((line - 0.3), 0, 0.6); break;
      case 'cut': fl = yb >= 0.8 ? 1 : 0.5; fs = line >= 0.3 ? 1 : 0.5 + clamp(line + 0.2, 0, 0.5); break;
      case 'upcut': fl = yb >= 1.0 ? 1 : 0.45; fs = line >= 0.35 ? 1 : 0.5; break;
      default: break;
    }
    if (Math.abs(line) > 0.95 && !(s.id === 'cut' || s.id === 'dab' || s.id === 'upcut' || s.id === 'loftO' || s.id === 'driveO')) fs *= 0.45;
    return clamp(fl * fs, 0, 1);
  }

  // Decide what the swing does. dt = contact time minus the moment the ball reaches the crease
  // (negative = early, positive = late).
  function resolveShot(s, D, dt) {
    const W = D.win, adt = Math.abs(dt);
    const timing = adt <= W.p ? 'perfect' : adt <= W.g ? 'good' : dt < 0 ? 'early' : 'late';
    const out = { type: 'miss', timing, dt, s, q: 0, fit: 0, kind: 'miss', why: 'beaten' };
    if (adt > W.m) { out.why = dt < 0 ? 'early' : 'late'; return out; }
    const reach = s.dx > 0 ? 1.35 : s.dx < 0 ? 1.0 : 1.1;
    if (Math.abs(D.lineX) > reach || D.yBat > 2.0) { out.why = 'reach'; return out; }
    const tq = adt <= W.p ? 1 : adt <= W.g ? lerp(0.9, 0.62, (adt - W.p) / (W.g - W.p)) : lerp(0.5, 0.18, (adt - W.g) / (W.m - W.g));
    const fit = fitOf(s, D);
    const q = tq * (0.28 + 0.72 * fit) + rr(-0.04, 0.04);
    out.q = q; out.fit = fit; out.tq = tq;
    if (q < 0.12) return out;
    const late = dt > 0;
    const pf = clamp(0.8 + 0.2 * (D.v1 / 26), 0.8, 1.06);
    const side = s.ang >= 0 ? 1 : -1;
    const dtn = clamp(dt / W.g, -1.6, 1.6);
    let phi = s.ang + side * dtn * 14 + rr(-4, 4);
    if (s.id === 'driveS' || s.id === 'loftS') phi += (D.lineX - 0.1) * 16;
    else if (s.id === 'flick' || s.id === 'slog' || s.id === 'glance') phi += D.lineX * 10;
    else if (s.id === 'driveO' || s.id === 'loftO') phi += (D.lineX - 0.3) * 10;
    let v, al, kind;
    const edge = () => {
      if (s.loft || D.yBat > 1.15) { kind = 'topedge'; al = rr(50, 74); v = rr(12, 22); phi = late ? side * rr(140, 178) : rr(-40, 40); }
      else if (!late) { kind = 'leading'; al = rr(28, 52); v = rr(11, 17); phi = rr(-45, 45) + side * 10; }
      else { kind = 'edge'; al = rr(3, 22); v = rr(15, 25); phi = side > 0 ? rr(154, 178) : -rr(168, 179); }
    };
    if (s.id === 'defend') {
      if (q < 0.3) edge();
      else { kind = 'defend'; v = q > 0.8 && D.zb < 4.6 ? rr(5, 8) : rr(2.5, 6); al = 0; phi = rr(-30, 30); }
    } else if (q >= 0.78) {
      kind = 'middled'; v = s.v * (0.94 + 0.12 * (q - 0.78) / 0.22) * pf; al = s.al * rr(0.9, 1.1);
    } else if (q >= 0.55) {
      kind = 'good'; v = s.v * rr(0.66, 0.84) * pf; al = s.loft ? s.al * rr(0.8, 1.1) : s.al * rr(0.8, 1.4);
    } else if (q >= 0.32) {
      kind = 'mistime'; v = s.v * rr(0.36, 0.55) * pf; al = s.loft ? rr(42, 62) : rr(3, 14); phi += rr(-14, 14);
    } else edge();
    out.type = 'hit'; out.kind = kind; out.v = v; out.al = al; out.phi = phi;
    if ((kind === 'edge' || kind === 'leading') && Math.abs(D.lineX) < 0.28 && s.id !== 'defend' && rnd() < 0.4) out.type = 'inside';
    return out;
  }

  /* ------------------------------------------------------------ audio */
  const snd = {
    ok() { return arc && arc.sfx; },
    bat(q) { if (!this.ok()) return; arc.sfx.noise(0.07, { filter: 'highpass', freq: 2200, vol: 0.12 + 0.4 * q }); arc.sfx.tone(210, 0.08, { type: 'square', slide: 70, vol: 0.06 + 0.2 * q }); },
    dull() { if (!this.ok()) return; arc.sfx.noise(0.09, { filter: 'lowpass', freq: 700, vol: 0.3 }); arc.sfx.tone(120, 0.09, { type: 'triangle', slide: 60, vol: 0.2 }); },
    whoosh() { if (!this.ok()) return; arc.sfx.noise(0.14, { filter: 'bandpass', freq: 1000, vol: 0.12 }); },
    bounce() { if (!this.ok()) return; arc.sfx.tone(130, 0.07, { type: 'sine', slide: 70, vol: 0.16 }); },
    glove() { if (!this.ok()) return; arc.sfx.noise(0.06, { filter: 'lowpass', freq: 900, vol: 0.3 }); arc.sfx.tone(160, 0.06, { type: 'triangle', slide: 80, vol: 0.14 }); },
    stumps() {
      if (!this.ok()) return;
      for (let i = 0; i < 6; i++) setTimeout(() => { if (!arc) return; arc.sfx.noise(0.06, { filter: 'bandpass', freq: 2500 + i * 300, vol: 0.2 }); arc.sfx.tone(700 + Math.random() * 400, 0.05, { type: 'square', slide: 300, vol: 0.08 }); }, i * 55);
    },
    roar(level) {
      if (!this.ok()) return;
      const v = 0.07 + 0.1 * level;
      for (let i = 0; i < 3; i++) setTimeout(() => { if (arc) arc.sfx.noise(0.95, { filter: 'bandpass', freq: 500 + i * 120, vol: v * (1 - i * 0.25) }); }, i * 800);
    },
    drums(n) {
      if (!this.ok()) return;
      for (let i = 0; i < n; i++) setTimeout(() => { if (arc) { arc.sfx.tone(i % 2 ? 78 : 104, 0.16, { type: 'sine', slide: 46, vol: 0.34 }); arc.sfx.noise(0.04, { filter: 'lowpass', freq: 400, vol: 0.12 }); } }, i * 210 + (i % 3 === 2 ? 40 : 0));
    },
    gasp() { if (!this.ok()) return; arc.sfx.noise(0.7, { filter: 'bandpass', freq: 380, vol: 0.12 }); arc.sfx.tone(240, 0.5, { type: 'sine', slide: 130, vol: 0.05 }); },
    whistle() { if (!this.ok()) return; arc.sfx.tone(1900, 0.22, { type: 'sine', slide: 2300, vol: 0.06 }); },
    tick() { if (!this.ok()) return; arc.sfx.tone(900, 0.04, { type: 'square', vol: 0.05 }); },
    pop(i) { if (!this.ok()) return; arc.sfx.noise(0.25, { filter: 'lowpass', freq: 900 + i * 90, vol: 0.14 }); arc.sfx.tone(300 + i * 40, 0.12, { type: 'sine', slide: 90, vol: 0.06 }); },
    win() { if (!this.ok()) return; [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { if (arc) arc.sfx.tone(f, 0.28, { type: 'triangle', vol: 0.12 }); }, i * 120)); },
    lose() { if (!this.ok()) return; [330, 262, 196].forEach((f, i) => setTimeout(() => { if (arc) arc.sfx.tone(f, 0.34, { type: 'triangle', vol: 0.1 }); }, i * 170)); },
  };

  /* ------------------------------------------------------------ match state */
  const G = {
    attract: true, mode: 'super', diff: 'pro', cfg: DIFFS.pro,
    phase: 'runup', t: 0, tb: -1.5, runupDur: 1.5, released: false, view: 'bat',
    D: null, bowler: null, swing: null, pass: null, dir: { dx: 0, dy: 0 },
    runs: 0, wkts: 0, balls: 0, deliveries: 0, ballsTotal: 6, wktsTotal: 2, target: 0,
    chips: [], chipOver: 0, batter: { name: 'Kian Marlow', runs: 0, balls: 0 }, queue: [],
    bowlers: [], lastKind: '', lastResult: '', comment: '', commentT: 0, resultT: 0, resultDur: 1.4,
    result: null, over: false, won: false, signal: '', signalT: 0, stumpsDown: false,
    debris: [], parts: [], floats: [], flash: 0, shake: 0, crowd: 0, punch: 0, fade: 0, trans: 0,
    marker: { x: 0, z: 0, t: -9, on: false }, trail: [], clock: 0, murmur: 0, hintT: 0, bat: 0, first: true,
    celebrate: 0, fireT: 0, track: null,
  };

  const TARGET_TEXT = () => (G.mode === 'nets' ? '' : 'Need ' + Math.max(0, G.target - G.runs) + ' from ' + (G.ballsTotal - G.balls));

  function newBowler(pace) {
    const list = pace ? PACE_BOWLERS : SPIN_BOWLERS;
    return { name: pickOf(list), pace, arm: rnd() < 0.78 ? 1 : -1 };
  }

  function bowlerFor() {
    const over = Math.floor(G.balls / 6);
    let want;
    if (G.mode === 'super') want = true;
    else if (G.mode === 'chase') want = over % 2 === 0;
    else want = over % 2 === 0;
    const key = (want ? 'p' : 's') + over;
    if (!G.bowlers[key]) G.bowlers[key] = newBowler(want);
    return G.bowlers[key];
  }

  function resetMatch(ch) {
    G.attract = false; G.mode = ch.mode || 'super'; G.diff = ch.diff || 'pro'; G.cfg = DIFFS[G.diff];
    rnd = Arcade.rng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    const b = BATTERS.find((x) => x.id === ch.batter) || BATTERS[0];
    G.queue = EXTRA_BATTERS.slice().sort(() => rnd() - 0.5);
    G.batter = { name: b.name, runs: 0, balls: 0 };
    G.runs = 0; G.wkts = 0; G.balls = 0; G.deliveries = 0; G.chips = []; G.chipOver = 0; G.bowlers = {};
    G.lastKind = ''; G.lastResult = ''; G.comment = ''; G.commentT = 0; G.over = false; G.won = false;
    G.signal = ''; G.celebrate = 0; G.parts.length = 0; G.debris.length = 0; G.floats.length = 0; G.first = true;
    const T = G.cfg.target;
    if (G.mode === 'super') { G.ballsTotal = 6; G.wktsTotal = 2; G.target = Math.round(rr(T.super[0], T.super[1])); }
    else if (G.mode === 'chase') { G.ballsTotal = 12; G.wktsTotal = 3; G.target = Math.round(rr(T.chase[0], T.chase[1])); }
    else { G.ballsTotal = 9999; G.wktsTotal = 1; G.target = 0; }
  }

  function startBall() {
    const bw = bowlerFor();
    const overIdx = Math.floor(G.balls / 6);
    const ramp = G.mode === 'nets' ? Math.min(1.2, 1 + 0.03 * overIdx) : 1;
    G.bowler = bw;
    G.D = makeDelivery(bw, G.cfg, ramp, G.lastKind);
    G.lastKind = G.D.kind;
    G.runupDur = bw.pace ? 1.55 : 1.05;
    G.tb = -G.runupDur; G.t = 0; G.released = false; G.swing = null; G.pass = null; G.result = null;
    G.phase = 'runup'; G.view = 'bat'; G.stumpsDown = false; G.signal = ''; G.debris.length = 0;
    G.marker.on = false; G.trail.length = 0; G.track = null; G.chipOver = Math.floor(G.balls / 6);
    G.hintT = 0; G.bounced = false; G.hit = null;
    if (!G.attract) { G.deliveries++; }
    G.dirHold = 0;
  }

  function onRelease() {
    G.released = true; G.phase = G.swing ? 'shot' : 'delivery';
    if (!G.attract) snd.tick();
  }

  /* ------------------------------------------------------------ batting phase */
  function startSwing() {
    const D = G.D;
    const dir = G.dir;
    const s = shotFor(dir.dx, dir.dy, D);
    const contactAt = G.tb + SWING_LAG;
    const dt = contactAt - D.tArr;
    const res = resolveShot(s, D, dt);
    G.swing = { t: 0, s, contactAt, dt, res, applied: false, pressedAt: G.tb };
    G.phase = 'shot';
    snd.whoosh();
  }

  function floatText(text, x, y, color, size, life) {
    G.floats.push({ text, x, y, color, size: size || 20, life: life || 1.1, t: 0 });
  }

  function timingWord(res) {
    if (res.type === 'miss') return res.why === 'early' ? 'Too early' : res.why === 'late' ? 'Too late' : '';
    if (res.timing === 'perfect') return 'PERFECT';
    if (res.timing === 'good') return 'Good timing';
    return res.timing === 'early' ? 'Early' : 'Late';
  }

  function updateBat(dt, input) {
    const D = G.D;
    G.tb += dt; G.t += dt;
    if (!G.released && G.tb >= 0) onRelease();
    // bounce moment: marker, thud
    if (G.released && !G.bounced && G.tb >= D.t1) {
      G.bounced = true;
      ballAt(D, D.t1);
      G.marker.x = BX; G.marker.z = BZ; G.marker.t = G.clock; G.marker.on = true;
      if (!G.attract) snd.bounce();
      spawnDust(BX, BZ);
    }
    // swing input
    if (!G.attract && !G.swing && input.press && G.tb > -G.runupDur * 0.5 && G.tb < D.tArr + 0.2 && !G.pass) startSwing();
    if (G.swing) {
      const sw = G.swing;
      sw.t += dt;
      if (!sw.applied && G.tb >= sw.contactAt) {
        sw.applied = true;
        const r = sw.res;
        const word = timingWord(r);
        if (word) floatText(word, 0, 0, r.timing === 'perfect' ? C.warm : r.type === 'miss' ? '#ff8a7a' : C.ink, r.timing === 'perfect' ? 26 : 20, 1.0);
        if (r.type === 'hit') applyHit(r);
        else if (r.type === 'inside') applyInside(r);
      }
    }
    // ball passes the batter without being hit
    if (!G.pass && G.phase !== 'field' && G.phase !== 'result' && G.tb >= D.tArr + 0.08 && !(G.swing && G.swing.res.type !== 'miss')) resolvePass();
    if (G.pass) {
      const p = G.pass;
      if (!p.fx && G.tb >= p.at) {
        p.fx = true;
        if (p.kind === 'bowled' || p.kind === 'lbw-stumps') breakStumps();
        else if (p.kind === 'keeper') snd.glove();
      }
      if (!p.done && G.tb >= p.at + p.wait) { p.done = true; finishPass(p); }
    }
  }

  function resolvePass() {
    const D = G.D, sw = G.swing;
    const swung = !!sw;
    let kind = 'dot', at = D.tStump, wait = 0.45;
    if (D.hitsStumps && !D.outsideLeg) {
      kind = D.yBat <= 0.62 ? 'lbw' : 'bowled';
      if (kind === 'lbw') at = D.tArr + 0.05; // pad first
      if (kind === 'bowled') { at = D.tStump; wait = 0.7; }
    } else if (D.hitsStumps && D.outsideLeg && D.yBat > 0.62) {
      kind = 'bowled'; at = D.tStump; wait = 0.7;
    } else if (!swung && (D.wide || D.yBat > 1.95)) {
      kind = 'wide'; at = D.tStump;
    } else if (D.yBat > 0.5 && D.yBat < 1.7 && Math.abs(D.lineX + 0.4) < 0.2 && D.zb > 7) {
      kind = 'body'; at = D.tArr + 0.05;
    } else if (D.yBat <= 0.62 && Math.abs(D.lineX + 0.35) < 0.22) {
      kind = 'pad'; at = D.tArr + 0.05;
    } else {
      kind = 'keeper'; at = D.tStump + 0.12;
    }
    if (kind === 'pad' || kind === 'body') { snd.dull(); }
    G.pass = { kind, at, wait, fx: false, done: false, swung };
    if (swung && G.swing.res.type === 'miss' && kind !== 'wide') {
      // a wide that was swung at and missed still counts as a legal ball
    }
  }

  function finishPass(p) {
    const D = G.D;
    if (p.kind === 'bowled') endBall({ runs: 0, wicket: 'Bowled', text: 'BOWLED!', small: 'Through the gate', say: 'bowled', signal: 'out' });
    else if (p.kind === 'lbw') endBall({ runs: 0, wicket: 'LBW', text: 'LBW!', small: 'Plumb in front', say: 'lbw', signal: 'out' });
    else if (p.kind === 'wide') endBall({ runs: 0, extra: 'wide', text: 'WIDE', small: 'Extra run', say: 'wide', signal: 'wide' });
    else if (p.kind === 'pad' || p.kind === 'body') endBall({ runs: 0, text: 'Dot ball', small: p.kind === 'pad' ? 'Off the pad' : 'On the body', say: 'dot' });
    else {
      const sw = G.swing;
      const small = sw ? (sw.res.why === 'early' ? 'Swung too early' : sw.res.why === 'late' ? 'Swung too late' : sw.res.why === 'reach' ? 'Out of reach' : 'Play and miss') : 'Left alone';
      endBall({ runs: 0, text: 'Dot ball', small, say: 'dot' });
    }
    void D;
  }

  function applyInside(r) {
    snd.bat(0.3);
    spawnSparks(0, 0.5, HITZ, 8, '#ffd9a0');
    G.pass = { kind: 'bowled', at: G.tb, wait: 0.75, fx: false, done: false, swung: true, inside: true };
  }

  function breakStumps() {
    if (G.stumpsDown) return;
    G.stumpsDown = true;
    snd.stumps();
    G.shake = arc.reducedMotion ? 0 : 0.5;
    const sx = [-0.1143, 0, 0.1143];
    for (let i = 0; i < 3; i++) G.debris.push({ x: sx[i], y: 0.36, z: -0.05, vx: rr(-1.6, 1.6), vy: rr(1.5, 4.2), vz: rr(-4.5, -1.2), r: rr(0, 6), vr: rr(-9, 9), len: 0.72, col: '#e9dcc0', w: 0.04 });
    for (let i = 0; i < 2; i++) G.debris.push({ x: (i ? 0.06 : -0.06), y: 0.74, z: -0.05, vx: rr(-2.5, 2.5), vy: rr(3, 6), vz: rr(-6, -2), r: rr(0, 6), vr: rr(-14, 14), len: 0.11, col: '#fff1c9', w: 0.03 });
    spawnSparks(0, 0.4, 0.2, 14, '#ffd9a0');
    G.crowd = Math.max(G.crowd, 0.6);
  }

  // The bat meets the ball: hand over to the field camera.
  function applyHit(r) {
    const D = G.D;
    ballAt(D, G.swing.contactAt);
    const q = clamp(r.q, 0, 1);
    if (r.kind === 'middled') snd.bat(1); else if (r.kind === 'good') snd.bat(0.7); else if (r.kind === 'defend') snd.bat(0.25); else snd.dull();
    G.punch = r.kind === 'middled' ? 1 : r.kind === 'good' ? 0.6 : 0.3;
    G.flash = r.kind === 'middled' ? 0.35 : 0;
    G.shake = arc.reducedMotion ? 0 : (r.kind === 'middled' && r.v > 30 ? 0.45 : 0.15);
    spawnSparks(clamp(BX, -1.2, 1.2), clamp(BY, 0.1, 1.6), HITZ, r.kind === 'middled' ? 12 : 6, r.kind === 'middled' ? '#fff3c4' : '#d8c9a8');
    G.hit = { r, q, bx: clamp(BX, -1.2, 1.2), by: BY };
    startField(r);
  }

  /* ------------------------------------------------------------ the field */
  const MAXS = 330, DTS = 1 / 30;
  const SX = new Float32Array(MAXS), SY = new Float32Array(MAXS), SZ = new Float32Array(MAXS), SB = new Uint8Array(MAXS);
  let FN = 0, crossI = -1, crossSix = false;
  let FL = [];
  const FS = { t: 0, fate: 'field', ended: false, finalized: false, endAt: 0, pending: null };
  const RN = { k: 0, state: 'idle', n: 0, t0: 0, t1: 0, push: 0, lastPush: -9 };

  function simulate(x, y, z, v, alDeg, phiDeg) {
    const a = alDeg * D2R, p = phiDeg * D2R;
    const vh = v * Math.cos(a);
    let vx = vh * Math.sin(p), vz = vh * Math.cos(p), vy = v * Math.sin(a);
    let nb = 0, tail = -1;
    FN = 0; crossI = -1; crossSix = false;
    const DT = 1 / 60;
    for (let step = 0; step < 540; step++) {
      if (step % 2 === 0) { if (FN >= MAXS) break; SX[FN] = x; SY[FN] = y; SZ[FN] = z; SB[FN] = nb; FN++; }
      if (tail >= 0 && --tail <= 0) break;
      if (y <= 0.0005 && Math.abs(vy) < 0.05) {
        const sp = hyp(vx, vz);
        if (sp < 0.3) break;
        const ns = Math.max(0, sp - 2.7 * DT);
        vx *= ns / sp; vz *= ns / sp; y = 0; vy = 0;
      } else {
        vy -= GR * DT; const dr = 1 - 0.03 * DT; vx *= dr; vz *= dr;
      }
      x += vx * DT; z += vz * DT; y += vy * DT;
      if (y < 0) {
        y = 0;
        if (vy < -1.6) { vy = -vy * 0.52; vx *= 0.86; vz *= 0.86; nb++; } else vy = 0;
      }
      if (crossI < 0 && hyp(x, z) >= ROPE) { crossI = FN; crossSix = nb === 0; tail = 40; }
    }
    if (FN < MAXS) { SX[FN] = x; SY[FN] = Math.max(0, y); SZ[FN] = z; SB[FN] = nb; FN++; }
  }

  function buildFielders(pace) {
    const lay = pace ? LAYOUT_PACE : LAYOUT_SPIN;
    const cfg = G.cfg;
    FL = lay.map((e) => ({ role: e[0], x0: e[1], z0: e[2], tx: e[1], tz: e[2], sp: cfg.fspd * rr(0.95, 1.05), react: cfg.react + rr(0, 0.1), mv: 1, x: e[1], z: e[2], face: 0 }));
    FL.push({ role: 'Bowler', x0: 3.4, z0: 5, tx: 3.4, tz: 5, sp: cfg.fspd * 0.9, react: cfg.react + 0.3, mv: 1, x: 3.4, z: 5, face: 0 });
    FL[0].sp *= 0.9;
  }

  let FPX = 0, FPZ = 0;
  function fpos(f, t) {
    const dx = f.tx - f.x0, dz = f.tz - f.z0;
    const d = hyp(dx, dz);
    if (d < 0.01) { FPX = f.x0; FPZ = f.z0; return; }
    const tr = clamp((t - f.react) * f.sp * f.mv, 0, d);
    FPX = f.x0 + dx * tr / d; FPZ = f.z0 + dz * tr / d;
  }

  function sampleAt(t) {
    const fi = clamp(t / DTS, 0, FN - 1);
    const i0 = Math.floor(fi), i1 = Math.min(FN - 1, i0 + 1), u = fi - i0;
    FBX = lerp(SX[i0], SX[i1], u); FBY = lerp(SY[i0], SY[i1], u); FBZ = lerp(SZ[i0], SZ[i1], u);
  }
  let FBX = 0, FBY = 0, FBZ = 0;

  function planIntercept() {
    const cfg = G.cfg;
    const last = crossI >= 0 ? crossI : FN - 1;
    let best = null, bestSpd = 0;
    for (let i = 0; i <= last && !best; i++) {
      const t = i * DTS, x = SX[i], y = SY[i], z = SZ[i], nb = SB[i];
      const air = nb === 0 && y > 0.3;
      const catchable = air && y <= 2.6;
      if (air && !catchable) continue;
      const pv = Math.max(0, i - 1);
      const spd = i > 0 ? hyp(x - SX[pv], y - SY[pv], z - SZ[pv]) / DTS : 20;
      // a hard-hit ball is very hard to hold: the fielder must be almost on its line
      const fast = spd >= 24 ? 0.55 : spd >= 15 ? 0.8 : 1;
      let bf = null, bs = -1e9;
      for (let j = 0; j < FL.length; j++) {
        const f = FL[j];
        const d = hyp(x - f.x0, z - f.z0);
        const mt = Math.max(0, t - f.react);
        const reach = (catchable ? (y < 0.9 ? 1.2 : 1.0) * fast : 0.95);
        const slack = f.sp * mt + reach - d;
        if (slack >= 0 && slack > bs) { bs = slack; bf = f; }
      }
      if (bf) { best = { i, f: bf, slack: bs, air: catchable }; bestSpd = spd; }
    }
    FS.fate = 'field'; FS.dropped = false; FS.col = null; FS.catcher = null; FS.six = false;
    if (best) {
      const i = best.i, t = i * DTS;
      if (best.air) {
        const spd = bestSpd;
        let pc = cfg.catchSk * (0.5 + 0.5 * clamp(best.slack / 1.6, 0, 1));
        if (spd > 18) pc *= 0.8;
        if (spd > 26) pc *= 0.7;
        if (SY[i] > 2.1) pc *= 0.9;
        if (best.f.role === 'Keeper' || best.f.role === 'Slip') pc *= 1.04;
        if (best.f.role === 'Bowler') pc *= 0.85;
        pc = Math.min(pc, 0.985);
        FS.catchP = pc;
        if (rnd() < pc) { FS.fate = 'caught'; FS.tFate = t; FS.catcher = best.f; FS.cx = SX[i]; FS.cz = SZ[i]; FS.cy = SY[i]; }
        else { FS.dropped = true; FS.tCatch = t; FS.col = best.f; FS.cx = SX[i]; FS.cz = SZ[i]; FS.tC = t + 0.95; }
      } else { FS.col = best.f; FS.tC = t; FS.cx = SX[i]; FS.cz = SZ[i]; }
    } else if (crossI >= 0) {
      FS.fate = 'boundary'; FS.tFate = crossI * DTS; FS.six = crossSix;
      FS.cx = SX[crossI]; FS.cz = SZ[crossI];
    } else {
      const rx = SX[FN - 1], rz = SZ[FN - 1], tRest = (FN - 1) * DTS;
      let bf = null, bt = 1e9;
      for (const f of FL) { const ta = f.react + hyp(rx - f.x0, rz - f.z0) / f.sp; if (ta < bt) { bt = ta; bf = f; } }
      FS.col = bf; FS.tC = Math.max(tRest, bt); FS.cx = rx; FS.cz = rz;
    }
  }

  function startField(r) {
    const hit = r;
    // keep the last batting frame for the dissolve
    if (G.snapFn) G.snapFn();
    G.phase = 'field'; G.view = 'field'; G.trans = 0;
    buildFielders(G.D.pace);
    const px = clamp(BX, -1.2, 1.2) * 0.3 - 0.3, pz = -HALF + HITZ;
    simulate(px, 0.9, pz, hit.v, hit.al, hit.phi);
    planIntercept();
    FS.t = 0; FS.ended = false; FS.finalized = false; FS.endAt = 0; FS.dropAnn = false; FS.relDone = false; FS.dead = false; FS.thr = null; FS.extra = 0; FS.outcome = null;
    FS.hit = hit; FS.px = px; FS.pz = pz; FS.wicketAnn = false; FS.flag = '';
    RN.k = 0; RN.state = 'idle'; RN.n = 0; RN.t0 = RN.t1 = 0; RN.push = 0; RN.lastPush = -9;
    // everyone starts at home; the keeper and bowler cover the stumps, the nearest others back up
    const keeper = FL[0], bowler = FL[FL.length - 1];
    keeper.tx = 0.3; keeper.tz = -HALF - 1.4; bowler.tx = 0; bowler.tz = HALF + 1.2;
    const chase = (f, x, z, mv) => { f.tx = x; f.tz = z; f.mv = mv || 1; };
    if (FS.fate === 'field' && FS.col) {
      chase(FS.col, FS.cx, FS.cz, 1);
      let f2 = null, bd = 1e9;
      for (const f of FL) { if (f === FS.col || f === keeper || f === bowler) continue; const d = hyp(f.x0 - FS.cx, f.z0 - FS.cz); if (d < bd) { bd = d; f2 = f; } }
      if (f2) chase(f2, FS.cx, FS.cz, 0.8);
    } else if (FS.fate === 'caught') {
      chase(FS.catcher, FS.cx, FS.cz, 1);
    } else if (FS.fate === 'boundary') {
      let f2 = null, bd = 1e9;
      for (const f of FL) { const d = hyp(f.x0 - FS.cx, f.z0 - FS.cz); if (d < bd) { bd = d; f2 = f; } }
      if (f2) chase(f2, FS.cx * 0.98, FS.cz * 0.98, 1);
    }
    FS.trail = [];
    G.fieldCam = null;
    FS.runPrompt = { show: false, margin: 0 };
    FS.label = hit.kind;
  }

  const runDur = (n) => (n === 1 ? 2.35 : 1.95);
  function endZ(n) { return n % 2 === 1 ? HALF : -HALF; }
  function arrivalAt(n) {
    if (FS.fate !== 'field') return 1e9;
    const col = FS.col;
    return FS.tC + THROW_REL + (FS.dropped ? 0.2 : 0) + hyp(FS.cx - 0, FS.cz - endZ(n)) / THROW_V;
  }

  function canStartRun(t) {
    if (FS.fate !== 'field' || FS.thr || FS.dead || RN.k >= 3) return false;
    if (t < 0.3) return false;
    const n = RN.k + 1;
    const margin = arrivalAt(n) - (t + runDur(n));
    FS.runPrompt.margin = margin;
    if (margin >= 0.35) return true;
    if (RN.push > 0) { RN.push--; return true; }
    return false;
  }

  function startRun(t) { RN.n = RN.k + 1; RN.state = 'run'; RN.t0 = t; RN.t1 = t + runDur(RN.n); }

  // positions of the two batters for drawing
  const BP = { sz: -HALF, nz: HALF };
  function batterPos(t) {
    let a = RN.k % 2 === 0 ? -HALF : HALF, b = -a;
    if (RN.state === 'run') {
      const p = clamp((t - RN.t0) / (RN.t1 - RN.t0), 0, 1);
      const e = p * p * (3 - 2 * p);
      const s0 = RN.n % 2 === 1 ? -HALF : HALF;
      a = s0 + (-s0 - s0) * e; b = -a;
    }
    BP.sz = a; BP.nz = b;
  }

  function fieldBall(t) {
    if (FS.fate === 'boundary') { sampleAt(t); return; }
    if (FS.fate === 'caught') {
      if (t < FS.tFate) { sampleAt(t); return; }
      fpos(FS.catcher, t); FBX = FPX; FBZ = FPZ; FBY = 1.4; return;
    }
    const tHold = FS.dropped ? FS.tCatch : FS.tC;
    if (t < tHold) { sampleAt(t); return; }
    if (FS.dropped && t < FS.tC) {
      const u = t - FS.tCatch;
      FBX = FS.cx + u * 0.6; FBZ = FS.cz; FBY = u < 0.4 ? 1.1 * (1 - u / 0.4) * (1 - u / 0.4) : 0;
      return;
    }
    const rel = FS.tC + THROW_REL + (FS.dropped ? 0.2 : 0);
    if (!FS.thr || t < rel) { FBX = FS.cx; FBZ = FS.cz; FBY = 0.85; return; }
    const th = FS.thr;
    const u = clamp((t - th.t0) / (th.t1 - th.t0), 0, 1);
    FBX = lerp(FS.cx, th.ex, u); FBZ = lerp(FS.cz, th.ez, u); FBY = 1.1 + Math.sin(u * Math.PI) * Math.min(3, th.d * 0.06);
  }

  function updateField(dt, input) {
    FS.t += dt;
    const t = FS.t;
    G.trans = Math.min(1, G.trans + dt / 0.5);
    if (FS.ended) {
      if (!FS.finalized && t >= FS.endAt) { FS.finalized = true; finalizeField(); }
      return;
    }
    if (input.run && t > 0.25) { RN.push = Math.min(2, RN.push + 1); RN.lastPush = t; }
    if (RN.push > 0 && t - RN.lastPush > 1.6) RN.push = 0;
    // running between the wickets
    if (RN.state === 'run' && t >= RN.t1) { RN.k++; RN.state = 'idle'; }
    if (RN.state === 'idle' && canStartRun(t)) startRun(t);
    FS.runPrompt.show = FS.fate === 'field' && !FS.thr && !FS.dead && RN.k < 3 && t > 0.2;
    if (FS.runPrompt.show) {
      const n = RN.state === 'run' ? RN.n + 1 : RN.k + 1;
      const st = RN.state === 'run' ? RN.t1 : t;
      FS.runPrompt.margin = arrivalAt(n) - (st + runDur(n));
      if (n > 3) FS.runPrompt.show = false;
    }
    const end = (outcome, delay) => { FS.ended = true; FS.endAt = t + delay; FS.outcome = outcome; announceField(); };
    if (FS.fate === 'boundary') {
      if (t >= FS.tFate) end({ runs: FS.six ? 6 : 4, boundary: FS.six ? 6 : 4 }, 0);
    } else if (FS.fate === 'caught') {
      if (t >= FS.tFate) {
        const role = FS.catcher.role;
        snd.glove();
        end({ runs: 0, wicket: role === 'Keeper' ? 'Caught behind' : role === 'Bowler' ? 'Caught and bowled' : 'Caught at ' + role.toLowerCase(), behind: role === 'Keeper' }, 0);
      }
    } else {
      if (FS.dropped && !FS.dropAnn && t >= FS.tCatch) { FS.dropAnn = true; arc.toast('Dropped!', 'Catch put down', 1100); G.comment = sayOf('drop'); G.commentT = 2.6; snd.gasp(); }
      const rel = FS.tC + THROW_REL + (FS.dropped ? 0.2 : 0);
      if (!FS.relDone && t >= rel) {
        FS.relDone = true;
        if (RN.state === 'run') {
          const ez = endZ(RN.n);
          const d = hyp(FS.cx, FS.cz - ez);
          FS.thr = { ex: 0, ez, t0: rel, t1: rel + d / THROW_V, d, done: false };
        } else FS.dead = true;
      }
      if (FS.thr && !FS.thr.done && t >= FS.thr.t1) {
        FS.thr.done = true;
        snd.glove();
        if (RN.state === 'run' && RN.t1 > t) {
          const p = clamp(0.45 + 0.9 * (RN.t1 - t), 0.45, 0.97);
          if (rnd() < p) {
            RN.state = 'out';
            breakStumpsField();
            end({ runs: RN.k, wicket: 'Run out', runout: true }, 0);
            return;
          }
          if (rnd() < 0.3) { FS.extra = 1; G.comment = sayOf('overthrow'); G.commentT = 2.4; }
        }
      }
      if (FS.relDone && (FS.dead || (FS.thr && FS.thr.done)) && RN.state === 'idle') end({ runs: RN.k + FS.extra }, 0.7);
    }
  }

  function breakStumpsField() { snd.stumps(); G.shake = arc.reducedMotion ? 0 : 0.35; G.fieldFlash = 0.6; }

  function announceField() {
    const o = FS.outcome;
    if (o.boundary === 6) { G.crowd = 1; snd.roar(1); snd.drums(6); snd.whistle(); G.fireShow = 1.4; }
    else if (o.boundary === 4) { G.crowd = 0.8; snd.roar(0.7); snd.drums(4); }
    else if (o.wicket) { G.crowd = 0.7; snd.gasp(); }
  }

  function finalizeField() {
    const o = FS.outcome || { runs: 0 };
    FS.pending = null;
    const h = G.hit.r;
    const sname = h.s.name;
    const kindWord = { middled: 'Middled', good: 'Well timed', mistime: 'Mistimed', defend: 'Defended', edge: 'Edged', topedge: 'Top edge', leading: 'Leading edge' }[h.kind] || '';
    if (o.wicket) {
      const behind = o.behind;
      endBall({ runs: o.runs, wicket: o.wicket, text: o.runout ? 'RUN OUT!' : 'OUT!', small: o.wicket, say: o.runout ? 'runout' : behind ? 'behind' : 'caught', signal: 'out', shot: sname });
    } else if (o.boundary === 6) {
      endBall({ runs: 6, boundary: 6, text: 'SIX!', small: sname, say: 'six', signal: 'six', shot: sname });
    } else if (o.boundary === 4) {
      endBall({ runs: 4, boundary: 4, text: 'FOUR!', small: sname, say: 'four', signal: 'four', shot: sname });
    } else {
      const r = o.runs;
      if (r === 0) endBall({ runs: 0, text: 'Dot ball', small: kindWord ? kindWord + ', ' + sname.toLowerCase() : sname, say: 'dot', shot: sname });
      else endBall({ runs: r, text: r === 1 ? 'One run' : r + ' runs', small: sname, say: r === 1 ? 'one' : r === 2 ? 'two' : 'three', shot: sname });
    }
  }

  /* ------------------------------------------------------------ scoring */
  function endBall(res) {
    const legal = res.extra !== 'wide';
    res.legal = legal;
    G.result = res;
    G.phase = 'result'; G.resultT = 0;
    G.runs += res.runs + (res.extra === 'wide' ? 1 : 0);
    if (legal) { G.balls++; G.batter.balls++; }
    G.batter.runs += res.runs;
    let chip;
    if (res.extra === 'wide') chip = 'Wd'; else if (res.wicket) chip = 'W'; else chip = String(res.runs);
    G.chips.push({ s: chip, ov: G.chipOver });
    if (res.wicket) G.wkts++;
    G.lastResult = res.wicket ? 'W:' + res.wicket : res.extra === 'wide' ? 'wide' : String(res.runs);
    G.comment = sayOf(res.say || 'dot'); G.commentT = 3.2;
    G.signal = res.signal || ''; G.signalT = 0;
    const big = res.boundary || res.wicket;
    G.resultDur = res.boundary === 6 ? 2.4 : res.boundary ? 2.0 : res.wicket ? 2.2 : 1.45;
    if (!G.attract) arc.toast(res.text, res.small, Math.round(G.resultDur * 1000 - 200));
    if (res.boundary === 6 || res.boundary === 4) { G.crowd = 1; }
    if (res.wicket) { G.crowd = 0.7; }
    if (res.wicket && res.wicket !== 'Run out' && G.view === 'bat') snd.gasp();
    void big;
    // match over?
    G.won = false;
    if (G.mode !== 'nets' && G.runs >= G.target) { G.won = true; G.over = true; }
    else if (G.mode !== 'nets' && G.balls >= G.ballsTotal) G.over = true;
    else if (G.wkts >= G.wktsTotal) G.over = true;
    if (G.over) {
      G.resultDur = G.won ? 3.2 : 2.4;
      if (G.won) { G.celebrate = 1; G.fireShow = 3; snd.win(); snd.roar(1); snd.drums(8); }
      else { snd.lose(); }
    }
    if (res.wicket && !G.over) {
      const nm = G.queue.shift() || 'Jai Holloway';
      G.pendingBatter = nm;
    }
  }

  function afterResult() {
    if (G.over) { finishMatch(); return; }
    if (G.pendingBatter) { G.batter = { name: G.pendingBatter, runs: 0, balls: 0 }; G.pendingBatter = null; }
    G.fade = 1;
    startBall();
  }

  function finishMatch() {
    G.phase = 'over';
    const left = G.mode === 'nets' ? 0 : Math.max(0, G.ballsTotal - G.balls);
    const bonus = G.won ? left * 5 : 0;
    const score = G.runs + bonus;
    let title, eyebrow, html;
    if (G.mode === 'nets') {
      eyebrow = 'Nets over'; title = 'You made <em>' + G.runs + '</em>';
      html = '<p>Out after ' + G.balls + ' ball' + (G.balls === 1 ? '' : 's') + ' (' + G.batter.name + ' ' + G.batter.runs + ' off ' + G.batter.balls + ' in the last stand). The bowling gets quicker every over, so see how long you can last.</p>';
    } else if (G.won) {
      const wl = G.wktsTotal - G.wkts;
      eyebrow = 'Chase complete'; title = 'You <em>won</em> it';
      html = '<p>' + G.runs + ' chased down, with ' + left + ' ball' + (left === 1 ? '' : 's') + ' to spare and ' + wl + ' wicket' + (wl === 1 ? '' : 's') + ' in hand. Bonus: ' + bonus + ' (5 per ball left).</p>';
    } else {
      const need = G.target - G.runs;
      eyebrow = G.wkts >= G.wktsTotal ? 'All out' : 'Out of balls'; title = 'Short by <em>' + need + '</em>';
      html = '<p>You finished on ' + G.runs + ' against a target of ' + G.target + '. Pick your shot early and time the swing as the ball reaches the crease.</p>';
    }
    const modeName = { super: 'Super Over', chase: 'T20 Chase', nets: 'Endless Nets' }[G.mode];
    html += '<p style="font-size:13px;color:var(--ink-mute)">' + modeName + ', ' + DIFFS[G.diff].label + '</p>';
    G.finalScore = score;
    arc.over({ score, scoreLabel: 'Score', title, eyebrow, html, again: 'Bat again' });
  }

  /* ------------------------------------------------------------ particles */
  function spawnSparks(x, y, z, n, col) {
    for (let i = 0; i < n; i++) G.parts.push({ k: 'w', x, y, z, vx: rr(-2.5, 2.5), vy: rr(0.5, 3.5), vz: rr(-1.5, 3), life: rr(0.3, 0.6), t: 0, col: col || '#fff', size: rr(1.5, 3) });
    if (G.parts.length > 220) G.parts.splice(0, G.parts.length - 220);
  }
  function spawnDust(x, z) {
    for (let i = 0; i < 7; i++) G.parts.push({ k: 'w', x, y: 0.03, z, vx: rr(-0.8, 0.8), vy: rr(0.3, 1.2), vz: rr(-0.6, 0.6), life: rr(0.3, 0.55), t: 0, col: 'rgba(214,190,150,0.7)', size: rr(2, 4), soft: true });
  }
  function spawnFirework(w, h) {
    const cx = rr(w * 0.15, w * 0.85), cy = rr(h * 0.1, h * 0.45);
    const hue = pickOf(['#FFB736', '#FF6940', '#fff3c4', '#7fd1ff', '#ff7ab6', '#9dffb0']);
    const n = arc.reducedMotion ? 10 : 34;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rr(-0.1, 0.1), sp = rr(60, 170);
      G.parts.push({ k: 's', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rr(0.8, 1.5), t: 0, col: hue, size: rr(1.6, 3) });
    }
    snd.pop(Math.floor(rnd() * 4));
    if (G.parts.length > 260) G.parts.splice(0, G.parts.length - 260);
  }

  /* ============================================================ rendering */
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const WID = 1.525;

  /* ------------------------------------------------------------ camera for the batting view */
  const cam = { x: 0.08, D: 8, H: 4, f: 600, k0: 60, hy: 100, cx: 0, w: 0, h: 0, dirty: true, portrait: false, ropeY: 150, boardY: 140, vig: null, bw: 0 };
  let PX = 0, PY = 0, PK = 0;
  function layout() {
    const w = arc.w, h = arc.h;
    cam.w = w; cam.h = h; cam.dirty = false;
    const portrait = w / h < 0.9;
    cam.portrait = portrait;
    const Wp = portrait ? w * 0.3 : Math.min(w * 0.15, h * 0.28);
    cam.D = portrait ? 8.5 : 6.5;
    cam.k0 = Wp / WID;
    cam.f = cam.k0 * cam.D;
    const span = h * (portrait ? 0.4 : 0.4);
    cam.H = (span * (cam.D + PITCH)) / (cam.k0 * PITCH);
    const batY = h * (portrait ? 0.76 : 0.79);
    cam.hy = batY - cam.H * cam.k0;
    cam.cx = w / 2;
    proj(0, 0, HALF + ROPE);
    cam.ropeY = PY;
    proj(0, 1.0, HALF + ROPE + 1.5);
    cam.boardY = PY;
    // vignette
    cam.vig = null;
  }
  function proj(x, y, z) {
    const dz = z + cam.D;
    if (dz < 0.4) { PK = 0; PX = PY = -99999; return false; }
    const k = cam.f / dz;
    PK = k; PX = cam.cx + (x - cam.x) * k; PY = cam.hy + (cam.H - y) * k;
    return true;
  }

  /* ------------------------------------------------------------ stadium backdrop (pre-rendered) */
  const BW = 1500, BH = 280;
  let BACK = null;
  const CROWD = ['#c0392b', '#e74c3c', '#2c6bd1', '#f1c40f', '#ecf0f1', '#e67e22', '#27ae60', '#8e44ad', '#f5cba7', '#34495e', '#ffffff', '#d35400', '#3498db', '#fd79a8'];
  const topY = (x) => 118 - 40 * Math.pow(Math.abs((x / BW) * 2 - 1), 1.8);
  const TOWERS = [0.09, 0.2, 0.31, 0.69, 0.8, 0.91];
  const FLAGS = [];
  function buildBackdrop() {
    const c = mk(BW, BH), g = c.getContext('2d');
    const r = Arcade.rng(11);
    const sky = g.createLinearGradient(0, 0, 0, BH);
    sky.addColorStop(0, '#03050c'); sky.addColorStop(0.5, '#0a1226'); sky.addColorStop(1, '#1b2442');
    g.fillStyle = sky; g.fillRect(0, 0, BW, BH);
    for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.2 + r() * 0.5) + ')'; g.fillRect(r() * BW, r() * 70, 1.2, 1.2); }
    // stands
    g.fillStyle = '#0b0f17';
    g.beginPath(); g.moveTo(0, BH);
    for (let x = 0; x <= BW; x += 25) g.lineTo(x, topY(x));
    g.lineTo(BW, BH); g.closePath(); g.fill();
    g.save(); g.beginPath(); g.moveTo(0, BH);
    for (let x = 0; x <= BW; x += 25) g.lineTo(x, topY(x));
    g.lineTo(BW, BH); g.closePath(); g.clip();
    for (let y = 80; y < BH; y += 6) {
      const row = (y - 80) / (BH - 80);
      const walkway = ((y - 80) % 66) < 8;
      for (let x = 0; x < BW; x += 6) {
        if (y < topY(x) - 2) continue;
        if (walkway) { g.fillStyle = 'rgba(30,36,50,0.9)'; g.fillRect(x, y, 6, 6); continue; }
        if (r() < 0.07) continue;
        g.globalAlpha = 0.5 + 0.45 * r() * (0.55 + row * 0.45);
        g.fillStyle = CROWD[(r() * CROWD.length) | 0];
        g.fillRect(x + 0.5, y + 0.5, 4, 4.5);
      }
      g.globalAlpha = 1;
    }
    // aisles
    g.fillStyle = 'rgba(8,10,16,0.85)';
    for (let x = 90; x < BW; x += 150) g.fillRect(x, 60, 7, BH);
    // soft light wash from the towers
    g.globalCompositeOperation = 'lighter';
    for (const tx of TOWERS) {
      const gx = tx * BW, gr = g.createRadialGradient(gx, 70, 10, gx, 150, 210);
      gr.addColorStop(0, 'rgba(255,240,200,0.22)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr; g.fillRect(gx - 220, 0, 440, BH);
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
    // roof lip along the top of the stands
    g.strokeStyle = '#1b2230'; g.lineWidth = 5; g.beginPath();
    for (let x = 0; x <= BW; x += 25) { const y = topY(x) - 3; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.strokeStyle = 'rgba(201,169,110,0.55)'; g.lineWidth = 1.5; g.beginPath();
    for (let x = 0; x <= BW; x += 25) { const y = topY(x) - 6; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    // arena sign
    g.font = '700 20px ' + FONT_MONO; g.textAlign = 'center'; g.fillStyle = '#FFB736';
    g.shadowColor = 'rgba(255,183,54,0.9)'; g.shadowBlur = 12;
    g.fillText('MERIDIAN ARENA', BW / 2, topY(BW / 2) - 12);
    g.shadowBlur = 0;
    // sightscreen
    const sx0 = BW * 0.44, sw = BW * 0.12, sy0 = BH - 44;
    g.fillStyle = '#05070b'; g.fillRect(sx0 - 4, sy0 - 4, sw + 8, 46);
    const sg = g.createLinearGradient(0, sy0, 0, sy0 + 40);
    sg.addColorStop(0, '#d9dde6'); sg.addColorStop(1, '#a9b0bf');
    g.fillStyle = sg; g.fillRect(sx0, sy0, sw, 38);
    g.fillStyle = 'rgba(0,0,0,0.14)'; for (let i = 1; i < 5; i++) g.fillRect(sx0 + (sw / 5) * i, sy0, 1.5, 38);
    // towers
    for (const tx of TOWERS) {
      const x = tx * BW, base = topY(x) + 8;
      g.strokeStyle = '#2a303c'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(x - 14, base); g.lineTo(x - 5, 66); g.moveTo(x + 14, base); g.lineTo(x + 5, 66); g.stroke();
      g.lineWidth = 2; g.beginPath(); for (let y = base; y > 70; y -= 20) { g.moveTo(x - 12 + (base - y) * 0.03, y); g.lineTo(x + 12 - (base - y) * 0.03, y - 10); } g.stroke();
      g.fillStyle = '#12151c'; g.fillRect(x - 36, 28, 72, 40);
      for (let ly = 0; ly < 3; ly++) for (let lx = 0; lx < 5; lx++) {
        g.fillStyle = '#fffbe9'; g.beginPath(); g.arc(x - 28 + lx * 14, 36 + ly * 12, 4.6, 0, TAU); g.fill();
      }
      g.globalCompositeOperation = 'lighter';
      const gr = g.createRadialGradient(x, 48, 4, x, 48, 120);
      gr.addColorStop(0, 'rgba(255,248,225,0.85)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.3)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr; g.fillRect(x - 130, -80, 260, 260);
      // beam
      const bg = g.createLinearGradient(0, 60, 0, BH);
      bg.addColorStop(0, 'rgba(255,245,215,0.10)'); bg.addColorStop(1, 'rgba(255,245,215,0)');
      g.fillStyle = bg; g.beginPath(); g.moveTo(x - 30, 66); g.lineTo(x + 30, 66); g.lineTo(x + 170, BH); g.lineTo(x - 170, BH); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    BACK = c;
    FLAGS.length = 0;
    for (let i = 0; i < 18; i++) {
      const x = 40 + (i / 18) * (BW - 80) + r() * 30;
      FLAGS.push({ x, y: topY(x) + 4 + r() * 40, col: CROWD[(r() * CROWD.length) | 0], ph: r() * TAU });
    }
  }

  function drawBackdrop(ctx) {
    const w = arc.w, dh = Math.max(40, cam.boardY);
    const scale = Math.max(dh / BH, w / BW);
    const srcW = w / scale, srcX = (BW - srcW) / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, dh); ctx.clip();
    ctx.translate(-srcX * scale, dh - BH * scale);
    ctx.scale(scale, scale);
    ctx.drawImage(BACK, 0, 0);
    // flags
    const t = G.clock;
    for (const f of FLAGS) {
      const sway = Math.sin(t * (3 + G.crowd * 4) + f.ph) * (6 + G.crowd * 10);
      ctx.strokeStyle = 'rgba(230,230,230,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + sway * 0.2, f.y - 20); ctx.stroke();
      ctx.fillStyle = f.col; ctx.beginPath();
      ctx.moveTo(f.x + sway * 0.2, f.y - 20); ctx.lineTo(f.x + sway * 0.2 + 12 + sway * 0.5, f.y - 17 + sway * 0.3); ctx.lineTo(f.x + sway * 0.2, f.y - 11); ctx.fill();
    }
    // camera flashes in the crowd
    if (!arc.reducedMotion) {
      const n = 8 + Math.round(G.crowd * 26);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < n; i++) {
        const k = Math.floor(t * 9) * 131 + i * 977;
        const rx = ((Math.sin(k) * 43758.5453) % 1 + 1) % 1, ry = ((Math.sin(k * 1.7 + 3) * 24634.6345) % 1 + 1) % 1;
        if (((Math.sin(k * 0.31 + t * 40) + 1) / 2) < 0.55) continue;
        const x = rx * BW, y = 90 + ry * (BH - 120);
        ctx.globalAlpha = 0.7; ctx.fillRect(x, y, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
    // crowd excitement wash
    if (G.crowd > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,200,120,' + (0.12 * G.crowd) + ')';
      ctx.fillRect(0, 70, BW, BH);
      const wave = ((t * 0.7) % 1) * BW;
      const wg = ctx.createLinearGradient(wave - 160, 0, wave + 160, 0);
      wg.addColorStop(0, 'rgba(255,255,255,0)'); wg.addColorStop(0.5, 'rgba(255,255,255,' + (0.16 * G.crowd) + ')'); wg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = wg; ctx.fillRect(wave - 160, 80, 320, BH);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------ ground, boundary, pitch */
  const RING = [];
  for (let a = -84; a <= 84; a += 4) { const r = a * D2R; RING.push([ROPE * Math.sin(r), HALF + ROPE * Math.cos(r)]); }
  const WEAR = [];
  (function () {
    const r = Arcade.rng(5);
    for (let i = 0; i < 9; i++) WEAR.push({ x: -0.55 + r() * 1.3, z: 17.0 + r() * 2.0, rx: 0.14 + r() * 0.22, rz: 0.2 + r() * 0.3, a: 0.16 + r() * 0.2 });
    for (let i = 0; i < 6; i++) WEAR.push({ x: -0.5 + r() * 1.1, z: 0.3 + r() * 1.8, rx: 0.15 + r() * 0.2, rz: 0.18 + r() * 0.25, a: 0.12 + r() * 0.16 });
    for (let i = 0; i < 7; i++) WEAR.push({ x: -0.9 + r() * 1.8, z: 4 + r() * 6, rx: 0.1 + r() * 0.3, rz: 0.2 + r() * 0.5, a: 0.07 + r() * 0.1 });
  })();
  const CRACKS = [];
  (function () {
    const r = Arcade.rng(9);
    for (let i = 0; i < 9; i++) {
      let x = -1.2 + r() * 2.4, z = 3 + r() * 9; const pts = [[x, z]];
      for (let j = 0; j < 3; j++) { x += (r() - 0.5) * 0.35; z += 0.2 + r() * 0.45; pts.push([x, z]); }
      CRACKS.push(pts);
    }
  })();

  function polyW(ctx, pts) {
    let first = true;
    for (let i = 0; i < pts.length; i++) {
      if (!proj(pts[i][0], pts[i][2] === undefined ? 0 : pts[i][2], pts[i][1])) continue;
      if (first) { ctx.moveTo(PX, PY); first = false; } else ctx.lineTo(PX, PY);
    }
  }

  function drawGround(ctx) {
    const w = arc.w, h = arc.h;
    // dark stand base under the lit grass
    ctx.fillStyle = '#0a0e15';
    ctx.fillRect(0, cam.boardY - 2, w, h);
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < RING.length; i++) { proj(RING[i][0], 0, RING[i][1]); if (i === 0) ctx.moveTo(PX, PY); else ctx.lineTo(PX, PY); }
    proj(RING[RING.length - 1][0], 0, RING[RING.length - 1][1]); ctx.lineTo(PX + 4000, h + 80);
    proj(RING[0][0], 0, RING[0][1]); ctx.lineTo(PX - 4000, h + 80);
    ctx.closePath(); ctx.clip();
    // base
    ctx.fillStyle = '#1b5528'; ctx.fillRect(0, cam.ropeY - 4, w, h);
    // mowing stripes along the pitch, in perspective
    const zn = -5.5, zf = HALF + ROPE + 2;
    for (let i = -16; i < 16; i++) {
      const xa = i * 4.6, xb = xa + 4.6;
      ctx.fillStyle = (i & 1) ? '#216430' : '#1a5226';
      ctx.beginPath();
      proj(xa, 0, zn); ctx.moveTo(PX, PY);
      proj(xb, 0, zn); ctx.lineTo(PX, PY);
      proj(xb, 0, zf); ctx.lineTo(PX, PY);
      proj(xa, 0, zf); ctx.lineTo(PX, PY);
      ctx.closePath(); ctx.fill();
    }
    // lit pool and far fade
    proj(0, 0, HALF);
    const lg = ctx.createRadialGradient(PX, PY, 10, PX, PY + 20, Math.max(w, h) * 0.75);
    lg.addColorStop(0, 'rgba(120,170,70,0.20)'); lg.addColorStop(1, 'rgba(0,0,0,0.32)');
    ctx.fillStyle = lg; ctx.fillRect(0, cam.ropeY - 4, w, h);
    const fg = ctx.createLinearGradient(0, cam.ropeY, 0, cam.hy + cam.H * cam.k0 * 0.25 + cam.ropeY * 0.5);
    fg.addColorStop(0, 'rgba(4,10,8,0.5)'); fg.addColorStop(1, 'rgba(4,10,8,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, cam.ropeY - 4, w, h * 0.5);
    // thirty-yard circle
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = Math.max(1, cam.k0 * 0.03);
    ctx.setLineDash([cam.k0 * 0.5, cam.k0 * 0.35]);
    ctx.beginPath();
    for (let a = 0; a <= 72; a++) { const r = (a / 72) * TAU; proj(27.4 * Math.sin(r), 0, HALF + 27.4 * Math.cos(r)); if (a === 0) ctx.moveTo(PX, PY); else ctx.lineTo(PX, PY); }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
  }

  function drawBoundary(ctx) {
    // advertising boards just outside the rope
    const rb = ROPE + 1.6, step = 4.4 / rb;
    const n = Math.round((150 * D2R) / step);
    for (let i = 0; i < n; i++) {
      const a0 = -75 * D2R + i * step, a1 = a0 + step * 0.97;
      const ad = ADS[((i % ADS.length) + ADS.length) % ADS.length];
      if (!proj(rb * Math.sin(a0), 0, HALF + rb * Math.cos(a0))) continue;
      const x0 = PX, y0 = PY;
      proj(rb * Math.sin(a1), 0, HALF + rb * Math.cos(a1)); const x1 = PX, y1 = PY;
      proj(rb * Math.sin(a0), 1.0, HALF + rb * Math.cos(a0)); const xt = PX, yt = PY;
      if (Math.max(x0, x1) < -20 || Math.min(x0, x1) > arc.w + 20) continue;
      const bw = Math.hypot(x1 - x0, y1 - y0);
      if (bw < 3) continue;
      ctx.save();
      // local space: 200 x 40, origin at the top-left corner of the board, y pointing down
      ctx.transform((x1 - x0) / 200, (y1 - y0) / 200, (x0 - xt) / 40, (y0 - yt) / 40, xt, yt);
      const flick = 0.92 + 0.08 * Math.sin(G.clock * 2.2 + i * 1.7);
      ctx.fillStyle = ad[1]; ctx.globalAlpha = flick; ctx.fillRect(0, 0, 200, 40);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(0, 0, 200, 5);
      ctx.fillStyle = ad[2]; ctx.font = '800 24px ' + FONT_UI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(ad[0], 100, 21, 188);
      ctx.restore();
    }
    // the rope
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = Math.max(2, cam.k0 * 0.07) + 1;
    ctx.beginPath(); for (let i = 0; i < RING.length; i++) { proj(RING[i][0], 0, RING[i][1]); if (i === 0) ctx.moveTo(PX, PY + 1); else ctx.lineTo(PX, PY + 1); } ctx.stroke();
    ctx.strokeStyle = '#f4f1e6'; ctx.lineWidth = Math.max(1.6, cam.k0 * 0.05);
    ctx.beginPath(); for (let i = 0; i < RING.length; i++) { proj(RING[i][0], 0, RING[i][1]); if (i === 0) ctx.moveTo(PX, PY); else ctx.lineTo(PX, PY); } ctx.stroke();
  }

  function quadW(ctx, x0, z0, x1, z1) {
    proj(x0, 0, z0); ctx.moveTo(PX, PY);
    proj(x1, 0, z0); ctx.lineTo(PX, PY);
    proj(x1, 0, z1); ctx.lineTo(PX, PY);
    proj(x0, 0, z1); ctx.lineTo(PX, PY);
    ctx.closePath();
  }
  function lineW(ctx, x0, z0, x1, z1, wm) {
    proj(x0, 0, z0); const a = PX, b = PY, k = PK;
    proj(x1, 0, z1);
    ctx.lineWidth = Math.max(1, wm * (k + PK) / 2);
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(PX, PY); ctx.stroke();
  }

  function drawPitch(ctx) {
    // the square: a slightly different cut of grass
    ctx.fillStyle = 'rgba(40,120,60,0.35)';
    ctx.beginPath(); quadW(ctx, -4.2, -5, 4.2, 26); ctx.fill();
    // the strip
    proj(0, 0, -1.2); const yN = PY;
    proj(0, 0, PITCH + 1.2); const yF = PY;
    const pg = ctx.createLinearGradient(0, yN, 0, yF);
    pg.addColorStop(0, '#a47d4d'); pg.addColorStop(0.45, '#c39b64'); pg.addColorStop(1, '#a88356');
    ctx.fillStyle = pg;
    ctx.beginPath(); quadW(ctx, -WID, -1.2, WID, PITCH + 1.2); ctx.fill();
    // soft edges
    ctx.fillStyle = 'rgba(70,45,20,0.18)';
    ctx.beginPath(); quadW(ctx, -WID, -1.2, -WID + 0.3, PITCH + 1.2); ctx.fill();
    ctx.beginPath(); quadW(ctx, WID - 0.3, -1.2, WID, PITCH + 1.2); ctx.fill();
    // wear
    ctx.save();
    ctx.beginPath(); quadW(ctx, -WID, -1.2, WID, PITCH + 1.2); ctx.clip();
    for (const p of WEAR) {
      ctx.fillStyle = 'rgba(66,40,18,' + p.a + ')';
      ctx.beginPath();
      for (let a = 0; a < 10; a++) { const r = (a / 10) * TAU; proj(p.x + Math.cos(r) * p.rx, 0, p.z + Math.sin(r) * p.rz); if (a === 0) ctx.moveTo(PX, PY); else ctx.lineTo(PX, PY); }
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(60,36,16,0.35)';
    for (const c of CRACKS) {
      proj(c[0][0], 0, c[0][1]); ctx.lineWidth = Math.max(0.6, PK * 0.012);
      ctx.beginPath(); ctx.moveTo(PX, PY);
      for (let i = 1; i < c.length; i++) { proj(c[i][0], 0, c[i][1]); ctx.lineTo(PX, PY); }
      ctx.stroke();
    }
    // sheen near the batter
    const sg = ctx.createLinearGradient(0, yN, 0, yN - (yN - yF) * 0.55);
    sg.addColorStop(0, 'rgba(255,240,200,0.14)'); sg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, yF, arc.w, yN - yF);
    ctx.restore();
    // creases
    ctx.strokeStyle = 'rgba(250,248,240,0.92)'; ctx.lineCap = 'butt';
    for (const base of [0, PITCH]) {
      const dir = base === 0 ? 1 : -1;
      lineW(ctx, -1.32, base, 1.32, base, 0.05);
      lineW(ctx, -2.2, base + dir * 1.22, 2.2, base + dir * 1.22, 0.05);
      lineW(ctx, -1.32, base, -1.32, base + dir * 3.2, 0.05);
      lineW(ctx, 1.32, base, 1.32, base + dir * 3.2, 0.05);
    }
  }

  function drawStumpsAt(ctx, z, down) {
    if (down) return;
    for (let i = -1; i <= 1; i++) {
      const x = i * 0.1143;
      proj(x, 0, z); const bx = PX, by = PY, k = PK;
      proj(x, 0.711, z);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = Math.max(2, 0.05 * k);
      ctx.beginPath(); ctx.moveTo(bx + k * 0.03, by); ctx.lineTo(bx + k * 0.03 + 1, by + 1); ctx.stroke();
      ctx.strokeStyle = '#efe3c6'; ctx.lineWidth = Math.max(1.8, 0.042 * k);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(PX, PY); ctx.stroke();
    }
    proj(-0.1143, 0.725, z); const a = PX, b = PY, k = PK;
    proj(0, 0.725, z); const c2 = PX, d2 = PY;
    proj(0.1143, 0.725, z);
    ctx.strokeStyle = '#fff1c9'; ctx.lineWidth = Math.max(1.6, 0.03 * k);
    ctx.beginPath(); ctx.moveTo(a - k * 0.01, b); ctx.lineTo(c2 - 0.5, d2); ctx.moveTo(c2 + 0.5, d2); ctx.lineTo(PX + k * 0.01, PY); ctx.stroke();
  }

  /* ------------------------------------------------------------ people */
  function ln(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  function person(ctx, fx, fy, sc, o) {
    const X = (m) => fx + m * sc, Y = (m) => fy - m * sc;
    const shirt = o.shirt || '#2a5db0', pants = o.pants || '#eeeeea', skin = o.skin || '#c58c62';
    const lean = o.lean || 0, bob = o.bob || 0, ph = o.legT || 0;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(fx + sc * 0.12, fy + sc * 0.01, sc * 0.4, sc * 0.1, 0, 0, TAU); ctx.fill();
    const hipY = 0.95 + bob;
    // legs
    for (let i = 0; i < 2; i++) {
      const lx = i ? 0.09 : -0.09, s = Math.sin(ph + (i ? Math.PI : 0));
      const fxm = lx * 1.3 + s * (o.stride || 0.0), fym = Math.max(0, s) * (o.lift || 0);
      ctx.strokeStyle = pants; ctx.lineWidth = 0.13 * sc;
      ln(ctx, X(lx), Y(hipY), X(fxm), Y(fym + 0.05));
      if (o.pads) {
        ctx.strokeStyle = '#f6f6f1'; ctx.lineWidth = 0.17 * sc;
        ln(ctx, X(lx + (fxm - lx) * 0.5), Y(hipY * 0.52 + fym * 0.5), X(fxm), Y(fym + 0.06));
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.02 * sc;
        ln(ctx, X(lx + (fxm - lx) * 0.5), Y(hipY * 0.5 + fym * 0.5), X(fxm), Y(fym + 0.06));
      }
      ctx.fillStyle = o.shoe || '#f1f1ec';
      ctx.beginPath(); ctx.ellipse(X(fxm), Y(fym + 0.03), 0.09 * sc, 0.045 * sc, 0, 0, TAU); ctx.fill();
    }
    // torso
    const sh = 1.5 + bob, lo = lean * 0.14;
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.moveTo(X(-0.17), Y(hipY)); ctx.lineTo(X(0.17), Y(hipY));
    ctx.lineTo(X(0.25 + lo), Y(sh)); ctx.lineTo(X(-0.25 + lo), Y(sh)); ctx.closePath(); ctx.fill();
    if (o.stripe) {
      ctx.fillStyle = o.stripe;
      ctx.beginPath(); ctx.moveTo(X(-0.2 + lo * 0.6), Y(sh - 0.14)); ctx.lineTo(X(0.2 + lo * 0.6), Y(sh - 0.14)); ctx.lineTo(X(0.22 + lo * 0.7), Y(sh - 0.22)); ctx.lineTo(X(-0.22 + lo * 0.7), Y(sh - 0.22)); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.beginPath(); ctx.moveTo(X(0.05), Y(hipY)); ctx.lineTo(X(0.17), Y(hipY)); ctx.lineTo(X(0.25 + lo), Y(sh)); ctx.lineTo(X(0.08 + lo), Y(sh)); ctx.closePath(); ctx.fill();
    // arms
    const shL = [-0.25 + lo, sh - 0.05], shR = [0.25 + lo, sh - 0.05];
    const arm = (s, a, hand) => {
      let hx, hy;
      if (hand) { hx = hand[0]; hy = hand[1]; } else { hx = s[0] + Math.sin(a) * 0.6; hy = s[1] - Math.cos(a) * 0.6; }
      const mx = lerp(s[0], hx, 0.55), my = lerp(s[1], hy, 0.55);
      ctx.strokeStyle = shirt; ctx.lineWidth = 0.105 * sc; ln(ctx, X(s[0]), Y(s[1]), X(mx), Y(my));
      ctx.strokeStyle = skin; ctx.lineWidth = 0.085 * sc; ln(ctx, X(mx), Y(my), X(hx), Y(hy));
      ctx.fillStyle = o.glove || skin; ctx.beginPath(); ctx.arc(X(hx), Y(hy), 0.055 * sc, 0, TAU); ctx.fill();
    };
    arm(shL, o.aL == null ? -0.12 : o.aL, o.handL);
    arm(shR, o.aR == null ? 0.12 : o.aR, o.handR);
    // head
    const hx = lean * 0.1, hy = 1.68 + bob, hr = 0.115;
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(X(hx), Y(hy), hr * sc, 0, TAU); ctx.fill();
    if (o.back) {
      ctx.fillStyle = '#1d1712'; ctx.beginPath(); ctx.arc(X(hx), Y(hy + 0.01), hr * sc * 1.02, Math.PI * 0.95, TAU * 1.02); ctx.fill();
    } else if (sc > 34) {
      ctx.fillStyle = '#1a120c'; ctx.beginPath(); ctx.arc(X(hx - 0.04), Y(hy + 0.01), 0.011 * sc, 0, TAU); ctx.arc(X(hx + 0.04), Y(hy + 0.01), 0.011 * sc, 0, TAU); ctx.fill();
    }
    if (o.helmet) {
      ctx.fillStyle = o.helmet; ctx.beginPath(); ctx.arc(X(hx), Y(hy + 0.02), hr * sc * 1.2, Math.PI, TAU); ctx.lineTo(X(hx + hr * 1.2), Y(hy - 0.02)); ctx.lineTo(X(hx - hr * 1.2), Y(hy - 0.02)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(1, 0.012 * sc);
      ctx.beginPath(); ctx.arc(X(hx), Y(hy + 0.02), hr * sc * 1.2, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
      if (!o.back) { ctx.strokeStyle = 'rgba(210,210,210,0.8)'; ctx.lineWidth = Math.max(1, 0.012 * sc); for (let i = -1; i <= 1; i++) ln(ctx, X(hx + i * 0.05), Y(hy - 0.02), X(hx + i * 0.06), Y(hy - 0.1)); }
    } else if (o.cap) {
      ctx.fillStyle = o.cap; ctx.beginPath(); ctx.arc(X(hx), Y(hy + 0.02), hr * sc * 1.1, Math.PI, TAU); ctx.closePath(); ctx.fill();
      if (!o.back) ctx.fillRect(X(hx - 0.1), Y(hy + 0.03), 0.2 * sc, 0.03 * sc);
    } else if (o.hat) {
      ctx.fillStyle = o.hat; ctx.beginPath(); ctx.ellipse(X(hx), Y(hy + 0.06), 0.2 * sc, 0.045 * sc, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(X(hx), Y(hy + 0.07), hr * sc * 1.0, Math.PI, TAU); ctx.fill();
    }
  }

  function drawBatShape(ctx, hx, hy, sc, psi, a) {
    const dx = Math.sin(psi), dy = Math.cos(psi), px = Math.cos(psi), py = -Math.sin(psi);
    const g0 = 0.3 * sc, bl = 0.66 * sc, bw = 0.07 * sc;
    ctx.globalAlpha = a == null ? 1 : a;
    ctx.strokeStyle = '#20180f'; ctx.lineWidth = Math.max(1.5, 0.045 * sc); ctx.lineCap = 'round';
    ln(ctx, hx - dx * 0.05 * sc, hy - dy * 0.05 * sc, hx + dx * g0, hy + dy * g0);
    const x1 = hx + dx * g0, y1 = hy + dy * g0, x2 = hx + dx * (g0 + bl), y2 = hy + dy * (g0 + bl);
    ctx.fillStyle = '#dfbf8b';
    ctx.beginPath(); ctx.moveTo(x1 + px * bw * 0.6, y1 + py * bw * 0.6); ctx.lineTo(x2 + px * bw, y2 + py * bw); ctx.lineTo(x2 - px * bw, y2 - py * bw); ctx.lineTo(x1 - px * bw * 0.6, y1 - py * bw * 0.6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,248,226,0.8)'; ctx.lineWidth = Math.max(1, 0.012 * sc);
    ln(ctx, x1 + px * bw * 0.3, y1 + py * bw * 0.3, x2 + px * bw * 0.45, y2 + py * bw * 0.45);
    ctx.fillStyle = 'rgba(80,50,20,0.55)';
    ctx.beginPath(); ctx.moveTo(x2 + px * bw, y2 + py * bw); ctx.lineTo(x2 - px * bw, y2 - py * bw); ctx.lineTo(x2 - px * bw - dx * 0.07 * sc, y2 - py * bw - dy * 0.07 * sc); ctx.lineTo(x2 + px * bw - dx * 0.07 * sc, y2 + py * bw - dy * 0.07 * sc); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  const SHIRT_BAT = '#e8892b', SHIRT_FLD = '#1c6fb5';
  function batPsi() {
    const sw = G.swing, rest = -8 * D2R, lift = 165 * D2R;
    if (!sw) {
      if (G.phase === 'result' || G.phase === 'over') return lerp(lift, rest, sstep(0.1, 0.7, G.resultT));
      return lerp(rest, lift, sstep(-G.runupDur * 0.6, -0.05, G.tb));
    }
    const s = sw.s, t = sw.t / SWING_DUR, cu = SWING_LAG / SWING_DUR;
    const c = s.psi * D2R, f = s.psiF * D2R;
    const b = c < -0.3 ? lift - TAU : lift;
    if (t < cu) { const u = t / cu; return lerp(b, c, Math.pow(u, 1.5)); }
    const u = clamp((t - cu) / (1 - cu), 0, 1);
    return lerp(c, f, 1 - (1 - u) * (1 - u));
  }

  function drawBatter(ctx) {
    const sw = G.swing;
    const bx = -0.45;
    const psi = batPsi();
    const tsw = sw ? sw.t / SWING_DUR : 0;
    const lean = sw ? clamp(sw.s.dx, -1, 1) * 0.6 * sstep(0, 0.4, tsw) : 0;
    const bodyX = bx + lean * 0.1;
    if (!proj(bodyX, 0, HITZ)) return;
    const fx = PX, fy = PY, sc = PK;
    // bat hand position follows the angle
    const hxm = 0.15 + 0.2 * Math.sin(psi), hym = 1.15 - 0.22 * Math.cos(psi);
    const hand = [hxm + lean * 0.12, hym];
    person(ctx, fx, fy, sc, {
      shirt: SHIRT_BAT, pants: '#f0f0ea', back: true, helmet: '#1a2a4a', pads: true, stripe: 'rgba(255,255,255,0.35)',
      lean, handL: [hand[0] - 0.05, hand[1] - 0.02], handR: hand, glove: '#f4f4ef', shoe: '#f1f1ec',
    });
    // motion blur wedge while swinging
    const hx = fx + hand[0] * sc, hy = fy - hand[1] * sc;
    if (sw && tsw > 0.05 && tsw < 0.85 && !arc.reducedMotion) {
      const prev = psi - (psi - (sw._pp == null ? psi : sw._pp)) * 4;
      ctx.fillStyle = 'rgba(255,240,200,0.14)';
      ctx.beginPath(); ctx.moveTo(hx, hy);
      ctx.arc(hx, hy, 0.95 * sc, Math.PI / 2 - psi, Math.PI / 2 - prev, psi < prev);
      ctx.closePath(); ctx.fill();
    }
    if (sw) sw._pp = psi;
    drawBatShape(ctx, hx, hy, sc, psi);
  }

  function drawBowler(ctx) {
    const D = G.D, bw = G.bowler;
    if (!D || !bw) return;
    const tb = G.tb, arm = bw.arm, pace = bw.pace;
    const run = pace ? 13 : 5.5, zRel = 18.5;
    let z, bob = 0, legT = 0, lift = 0.0, stride = 0.0;
    const pre = tb < 0;
    if (pre) {
      const s = clamp(1 + tb / G.runupDur, 0, 1);
      z = zRel + run * (1 - Math.pow(s, 1.25));
      legT = G.runupDur * s * (pace ? 24 : 16) * 1.0;
      lift = 0.22; stride = 0.17; bob = Math.abs(Math.sin(legT)) * 0.045;
    } else {
      z = zRel - 3.2 * (1 - Math.exp(-tb * 2.2));
      legT = 0.5; lift = 0; stride = 0.12;
    }
    const jump = pre ? Math.sin(Math.PI * clamp((tb + 0.3) / 0.32, 0, 1)) * 0.18 : 0;
    const bodyX = -0.23 * arm + (pre ? 0 : -arm * 0.5 * (1 - Math.exp(-tb * 2)));
    if (!proj(bodyX, 0, z)) return;
    const fx = PX, fy = PY - jump * PK, sc = PK;
    // arm angles. In person() an angle of 0 hangs down, +-PI is straight up, negative is toward screen-left.
    const out = -arm; // the bowling arm is on the screen side away from his body centre
    const pump = Math.sin(legT);
    let aBowl, aOther;
    if (pre) {
      const u = clamp((tb + 0.34) / 0.34, 0, 1);
      const target = out > 0 ? Math.PI : -Math.PI;
      const start = out * (0.45 + 0.35 * pump);
      aBowl = lerp(start, target, u * u);
      aOther = -out * (0.45 - 0.35 * pump + u * 0.7);
    } else {
      const u = clamp(tb / 0.3, 0, 1);
      aBowl = out > 0 ? lerp(Math.PI, 0.3, u) : lerp(-Math.PI, -0.3, u);
      aOther = -out * 0.4;
    }
    person(ctx, fx, fy, sc, {
      shirt: '#9b2335', pants: '#f2f2ee', cap: '#7c1a29', legT, lift, stride, bob, lean: pre ? 0 : -0.3,
      aL: arm > 0 ? aBowl : aOther, aR: arm > 0 ? aOther : aBowl, shoe: '#f1f1ec', stripe: 'rgba(255,255,255,0.25)',
    });
    // the ball sits in the bowling hand until it is released
    if (pre) {
      const shx = (arm > 0 ? -0.25 : 0.25), shy = 1.45 + bob;
      drawBall3D(ctx, bodyX + shx + Math.sin(aBowl) * 0.6, shy - Math.cos(aBowl) * 0.6 + jump, z, 1);
    }
  }

  function drawUmpire(ctx) {
    if (!proj(0.95, 0, 21.8)) return;
    const sc = PK, sig = G.signal, t = G.signalT;
    let aL = -0.1, aR = 0.1;
    if (sig === 'out') { aR = Math.PI - 0.1; }
    else if (sig === 'six') { aL = -Math.PI + 0.25; aR = Math.PI - 0.25; }
    else if (sig === 'four') { aR = Math.PI / 2 + Math.sin(t * 10) * 0.8; aL = -0.1; }
    else if (sig === 'wide') { aL = -Math.PI / 2; aR = Math.PI / 2; }
    person(ctx, PX, PY, sc, { shirt: '#e8e6df', pants: '#2a2a2e', hat: '#1b1b1f', aL, aR, shoe: '#222' });
  }

  function drawNonStriker(ctx) {
    if (!proj(1.75, 0, 19.3)) return;
    person(ctx, PX, PY, PK, { shirt: SHIRT_BAT, pants: '#f0f0ea', helmet: '#1a2a4a', pads: true, aL: -0.1, aR: 0.15, shoe: '#f1f1ec' });
  }

  /* ------------------------------------------------------------ ball, markers, effects in the batting view */
  function drawBall3D(ctx, x, y, z, big) {
    if (!proj(x, y, z)) return;
    const r = Math.max(2.8, PK * 0.125) * (big || 1);
    // ground shadow
    if (y > 0.02) {
      const sx = PX, sy0 = PY; proj(x, 0, z);
      ctx.fillStyle = 'rgba(0,0,0,' + clamp(0.4 - y * 0.12, 0.1, 0.4) + ')';
      ctx.beginPath(); ctx.ellipse(PX, PY, r * 1.1, r * 0.4, 0, 0, TAU); ctx.fill();
      proj(x, y, z); void sx; void sy0;
    }
    const gr = ctx.createRadialGradient(PX, PY, r * 0.4, PX, PY, r * 3);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(PX, PY, r * 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(PX, PY, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(25,14,6,0.75)'; ctx.lineWidth = Math.max(1, r * 0.22); ctx.stroke();
    if (r > 3) {
      const a = G.clock * 24 * (G.D && G.D.pace ? 1 : 2.4);
      ctx.strokeStyle = '#d4432b'; ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.beginPath(); ctx.ellipse(PX, PY, r * 0.9, r * 0.35 * Math.abs(Math.cos(a)) + 0.4, a * 0.3, 0, TAU); ctx.stroke();
    }
  }

  function drawBallLayer(ctx) {
    const D = G.D;
    if (!D || !G.released) return;
    const tb = Math.min(G.tb, D.tStump + 0.25);
    ballAt(D, tb);
    if (BZ < -0.8) return;
    // trail
    const tr = G.trail;
    for (let i = 0; i < tr.length; i++) {
      const p = tr[i];
      if (!proj(p[0], p[1], p[2])) continue;
      const a = (i + 1) / (tr.length + 1);
      ctx.fillStyle = 'rgba(255,250,235,' + (0.35 * a) + ')';
      ctx.beginPath(); ctx.arc(PX, PY, Math.max(1.2, PK * 0.07 * a), 0, TAU); ctx.fill();
    }
    drawBall3D(ctx, BX, BY, BZ);
  }

  function drawMarker(ctx) {
    if (!G.marker.on || !G.cfg.hint) return;
    const age = G.clock - G.marker.t;
    if (age > 1.3) return;
    if (!proj(G.marker.x, 0, G.marker.z)) return;
    const a = 1 - age / 1.3, r = (0.28 + age * 0.45) * PK;
    ctx.strokeStyle = 'rgba(255,183,54,' + (0.9 * a) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(PX, PY, r, r * 0.38, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,183,54,' + (0.35 * a) + ')';
    ctx.beginPath(); ctx.ellipse(PX, PY, r * 0.4, r * 0.15, 0, 0, TAU); ctx.fill();
  }

  function drawHitZone(ctx) {
    if (!G.D || G.phase === 'result' || G.phase === 'field') return;
    if (!proj(-0.1, 0, HITZ + 0.4)) return;
    const near = G.D && G.released ? clamp(1 - Math.abs(G.tb + SWING_LAG - G.D.tArr) / 0.35, 0, 1) : 0;
    ctx.strokeStyle = 'rgba(255,183,54,' + (0.14 + near * 0.55) + ')'; ctx.lineWidth = 1.5 + near * 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.ellipse(PX, PY, PK * 0.85, PK * 0.3, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }

  function updateWorldFx(dt) {
    const P = G.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.t += dt;
      if (p.t >= p.life) { P.splice(i, 1); continue; }
      if (p.k === 'w') { p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 6 * dt; if (p.y < 0) { p.y = 0; p.vy *= -0.3; } }
      else { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 90 * dt; p.vx *= 0.99; }
    }
    const Dd = G.debris;
    for (let i = Dd.length - 1; i >= 0; i--) {
      const d = Dd[i]; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.vy -= GR * dt; d.r += d.vr * dt;
      if (d.y < 0.03) { d.y = 0.03; d.vy *= -0.3; d.vx *= 0.7; d.vz *= 0.7; d.vr *= 0.6; }
    }
    const F = G.floats;
    for (let i = F.length - 1; i >= 0; i--) { F[i].t += dt; if (F[i].t > F[i].life) F.splice(i, 1); }
  }

  function drawParts(ctx, world) {
    const P = G.parts;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const a = 1 - p.t / p.life;
      if (p.k === 'w') {
        if (!world) continue;
        if (!proj(p.x, p.y, p.z)) continue;
        ctx.globalAlpha = a; ctx.fillStyle = p.col;
        const r = Math.max(1, p.size * (p.soft ? 0.5 + (1 - a) : 1) * Math.min(2, PK / 40 + 0.6));
        ctx.beginPath(); ctx.arc(PX, PY, r, 0, TAU); ctx.fill();
      } else if (!world) {
        ctx.globalAlpha = a; ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + a * 0.6), 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawDebris(ctx) {
    for (const d of G.debris) {
      if (!proj(d.x, d.y, d.z)) continue;
      const hl = d.len * 0.5 * PK, c = Math.cos(d.r), s = Math.sin(d.r);
      ctx.strokeStyle = d.col; ctx.lineWidth = Math.max(1.5, d.w * PK); ctx.lineCap = 'round';
      ln(ctx, PX - c * hl, PY - s * hl, PX + c * hl, PY + s * hl);
    }
  }

  /* ------------------------------------------------------------ the batting scene */
  function drawBatScene(ctx) {
    const w = arc.w, h = arc.h;
    if (cam.dirty || cam.w !== w || cam.h !== h) layout();
    ctx.save();
    const sh = G.shake * 7;
    if (sh > 0.1) ctx.translate(Math.sin(G.clock * 63) * sh, Math.cos(G.clock * 51) * sh);
    const zm = 1 + (arc.reducedMotion ? 0 : G.punch * 0.02);
    ctx.translate(w / 2, h * 0.72); ctx.scale(zm, zm); ctx.translate(-w / 2, -h * 0.72);
    ctx.fillStyle = '#05070c'; ctx.fillRect(-20, -20, w + 40, h + 40);
    drawBackdrop(ctx);
    drawGround(ctx);
    drawBoundary(ctx);
    drawPitch(ctx);
    drawHitZone(ctx);
    drawMarker(ctx);
    // far to near
    drawUmpire(ctx);
    drawBowler(ctx);
    drawNonStriker(ctx);
    drawStumpsAt(ctx, PITCH, false);
    const D = G.D;
    const ballFar = D && G.released && G.phase !== 'field' ? (ballAt(D, Math.min(G.tb, D.tStump + 0.25)), BZ > HITZ + 0.05) : false;
    if (ballFar) drawBallLayer(ctx);
    drawBatter(ctx);
    drawStumpsAt(ctx, 0, G.stumpsDown);
    if (!ballFar && G.phase !== 'field') drawBallLayer(ctx);
    drawDebris(ctx);
    drawParts(ctx, true);
    drawTracker(ctx);
    ctx.restore();
    // light vignette
    if (!cam.vig) {
      const g = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.8);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); cam.vig = g;
    }
    ctx.fillStyle = cam.vig; ctx.fillRect(0, 0, w, h);
    if (G.flash > 0.01) { ctx.fillStyle = 'rgba(255,248,230,' + G.flash * 0.5 + ')'; ctx.fillRect(0, 0, w, h); }
  }

  // After a miss, trace the delivery like a broadcast ball tracker.
  function drawTracker(ctx) {
    const D = G.D;
    if (!D || G.phase !== 'result' || G.view !== 'bat' || !G.result || G.attract) return;
    const a = clamp(1 - (G.resultT - 0.2) / 1.0, 0, 1) * clamp(G.resultT / 0.15, 0, 1);
    if (a <= 0) return;
    ctx.strokeStyle = 'rgba(255,105,64,' + (0.85 * a) + ')'; ctx.lineWidth = 2.5; ctx.setLineDash([7, 5]);
    ctx.beginPath();
    let first = true;
    for (let t = 0; t <= D.tStump; t += 0.02) {
      ballAt(D, t); if (!proj(BX, BY, BZ)) continue;
      if (first) { ctx.moveTo(PX, PY); first = false; } else ctx.lineTo(PX, PY);
    }
    ctx.stroke(); ctx.setLineDash([]);
    ballAt(D, D.t1); proj(BX, 0, BZ);
    ctx.fillStyle = 'rgba(255,183,54,' + a + ')'; ctx.beginPath(); ctx.arc(PX, PY, 5, 0, TAU); ctx.fill();
  }

  /* ------------------------------------------------------------ the field, seen from above (pre-rendered) */
  const FPS = 6, FHALF = 88;
  let FIELD = null;
  function buildField() {
    const W = FHALF * 2 * FPS, c = mk(W, W), g = c.getContext('2d');
    const X = (m) => (m + FHALF) * FPS, Z = (m) => (FHALF - m) * FPS;
    const r = Arcade.rng(21);
    g.fillStyle = '#06080c'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#10151e'; g.beginPath(); g.arc(W / 2, W / 2, FHALF * FPS, 0, TAU); g.fill();
    for (let i = 0; i < 17000; i++) {
      const ang = r() * TAU, rad = 71 + r() * 16.5;
      g.fillStyle = CROWD[(r() * CROWD.length) | 0]; g.globalAlpha = 0.3 + r() * 0.5;
      g.fillRect(X(rad * Math.cos(ang)), Z(rad * Math.sin(ang)), 2.4, 2.4);
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(6,8,12,0.9)'; g.lineWidth = 0.9 * FPS;
    for (const rad of [76, 81.5]) { g.beginPath(); g.arc(W / 2, W / 2, rad * FPS, 0, TAU); g.stroke(); }
    // boards
    const nb = 56;
    for (let i = 0; i < nb; i++) {
      const a0 = (i / nb) * TAU, a1 = ((i + 0.92) / nb) * TAU;
      g.strokeStyle = ADS[i % ADS.length][1]; g.lineWidth = 1.5 * FPS;
      g.beginPath(); g.arc(W / 2, W / 2, 69.6 * FPS, a0, a1); g.stroke();
    }
    // grass
    g.save(); g.beginPath(); g.arc(W / 2, W / 2, ROPE * FPS, 0, TAU); g.clip();
    g.fillStyle = '#1b5528'; g.fillRect(0, 0, W, W);
    for (let i = -16; i < 16; i++) { g.fillStyle = (i & 1) ? '#216430' : '#1a5226'; g.fillRect(X(i * 5), 0, 5 * FPS, W); }
    g.strokeStyle = 'rgba(255,255,255,0.34)'; g.lineWidth = 0.3 * FPS; g.setLineDash([2.2 * FPS, 1.6 * FPS]);
    g.beginPath(); g.arc(W / 2, W / 2, 27.4 * FPS, 0, TAU); g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(46,130,66,0.5)'; g.fillRect(X(-5.2), Z(HALF + 5), 10.4 * FPS, (PITCH + 10) * FPS);
    // pitch
    const pg = g.createLinearGradient(0, Z(HALF + 1), 0, Z(-HALF - 1));
    pg.addColorStop(0, '#a88356'); pg.addColorStop(0.5, '#c39b64'); pg.addColorStop(1, '#a47d4d');
    g.fillStyle = pg; g.fillRect(X(-WID), Z(HALF + 1.2), 2 * WID * FPS, (PITCH + 2.4) * FPS);
    g.fillStyle = 'rgba(70,42,20,0.18)';
    for (const p of WEAR) { g.beginPath(); g.ellipse(X(p.x), Z(p.z - HALF), p.rx * FPS, p.rz * FPS, 0, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(250,248,240,0.9)'; g.lineWidth = 0.07 * FPS;
    for (const base of [-HALF, HALF]) {
      const dir = base < 0 ? 1 : -1;
      g.beginPath();
      g.moveTo(X(-1.32), Z(base)); g.lineTo(X(1.32), Z(base));
      g.moveTo(X(-2.2), Z(base + dir * 1.22)); g.lineTo(X(2.2), Z(base + dir * 1.22));
      g.moveTo(X(-1.32), Z(base)); g.lineTo(X(-1.32), Z(base + dir * 3.2));
      g.moveTo(X(1.32), Z(base)); g.lineTo(X(1.32), Z(base + dir * 3.2));
      g.stroke();
      g.fillStyle = '#efe3c6'; g.fillRect(X(-0.12), Z(base) - 0.12 * FPS, 0.24 * FPS, 0.24 * FPS);
    }
    const lg = g.createRadialGradient(W / 2, W / 2, 10, W / 2, W / 2, ROPE * FPS);
    lg.addColorStop(0, 'rgba(130,180,80,0.16)'); lg.addColorStop(1, 'rgba(0,0,0,0.26)');
    g.fillStyle = lg; g.fillRect(0, 0, W, W);
    g.restore();
    g.strokeStyle = '#f4f1e6'; g.lineWidth = 0.55 * FPS; g.beginPath(); g.arc(W / 2, W / 2, ROPE * FPS, 0, TAU); g.stroke();
    // floodlight glows on the rim
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const a = (i + 0.5) * Math.PI / 2, x = X(82 * Math.cos(a)), y = Z(82 * Math.sin(a));
      const gr = g.createRadialGradient(x, y, 2, x, y, 16 * FPS);
      gr.addColorStop(0, 'rgba(255,248,225,0.9)'); gr.addColorStop(0.2, 'rgba(255,240,200,0.3)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = gr; g.fillRect(x - 16 * FPS, y - 16 * FPS, 32 * FPS, 32 * FPS);
    }
    g.globalCompositeOperation = 'source-over';
    FIELD = c;
  }

  /* ------------------------------------------------------------ the field scene */
  const FC = { x: 0, z: -9, s: 8 };
  let FSX = 0, FSY = 0;
  function fsc(x, z) { FSX = arc.w / 2 + (x - FC.x) * FC.s; FSY = arc.h / 2 - (z - FC.z) * FC.s; }

  function updateFieldCam(dt, snap) {
    fieldBall(FS.t);
    const bx = FBX, bz = FBZ;
    const dist = hyp(bx, bz + HALF);
    const rm = clamp(dist * 0.55 + 16, 24, 84);
    const w = arc.w, h = arc.h;
    const sT = (Math.min(w, h * 1.0) * 0.5 / rm) * (w > h ? 1.15 : 1);
    const k = snap ? 1 : 1 - Math.exp(-dt * 3.4);
    FC.x += (bx - FC.x) * k; FC.z += (bz - FC.z) * k; FC.s += (sT - FC.s) * k;
    // trail
    const tr = FS.trail;
    if (G.phase === 'field' || G.phase === 'result') {
      if (!tr.length || hyp(tr[tr.length - 1][0] - bx, tr[tr.length - 1][2] - bz) > 0.6) { tr.push([bx, FBY, bz]); if (tr.length > 16) tr.shift(); }
    }
  }

  function drawFielder(ctx, f, t, hot) {
    fpos(f, t); f.x = FPX; f.z = FPZ;
    fsc(FPX, FPZ);
    if (FSX < -30 || FSX > arc.w + 30 || FSY < -30 || FSY > arc.h + 30) return;
    const r = clamp(FC.s * 1.25, 5.5, 14);
    // face the ball
    fieldBall(t);
    const ang = Math.atan2(-(FBZ - FPZ), FBX - FPX);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(FSX + r * 0.2, FSY + r * 0.35, r, r * 0.75, 0, 0, TAU); ctx.fill();
    if (hot) { ctx.strokeStyle = 'rgba(255,183,54,' + (0.55 + 0.35 * Math.sin(G.clock * 9)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(FSX, FSY, r + 4, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = f.role === 'Keeper' ? '#e2c230' : SHIRT_FLD; ctx.beginPath(); ctx.arc(FSX, FSY, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#f2d2b0'; ctx.beginPath(); ctx.arc(FSX + Math.cos(ang) * r * 0.45, FSY + Math.sin(ang) * r * 0.45, r * 0.38, 0, TAU); ctx.fill();
    if (hot && FC.s > 3.5) {
      ctx.font = '600 11px ' + FONT_MONO; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3; ctx.strokeText(f.role, FSX, FSY - r - 7); ctx.fillText(f.role, FSX, FSY - r - 7);
    }
  }

  function drawFieldScene(ctx) {
    const w = arc.w, h = arc.h, s = FC.s;
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, h);
    ctx.save();
    const sh = G.shake * 5;
    if (sh > 0.1) ctx.translate(Math.sin(G.clock * 63) * sh, Math.cos(G.clock * 51) * sh);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(FIELD, w / 2 + (-FHALF - FC.x) * s, h / 2 - (FHALF - FC.z) * s, 2 * FHALF * s, 2 * FHALF * s);
    const t = FS.t;
    // batters between the wickets
    batterPos(t);
    const br = clamp(s * 1.1, 5, 12);
    for (let i = 0; i < 2; i++) {
      const z = i ? BP.nz : BP.sz, x = i ? 0.9 : -0.9;
      fsc(x, z);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(FSX + br * 0.2, FSY + br * 0.35, br, br * 0.75, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = i ? '#f3b27a' : SHIRT_BAT; ctx.beginPath(); ctx.arc(FSX, FSY, br, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#e8cfae'; ctx.beginPath(); ctx.arc(FSX, FSY - br * 0.25, br * 0.38, 0, TAU); ctx.fill();
    }
    // fielders
    for (const f of FL) drawFielder(ctx, f, t, f === FS.col || f === FS.catcher);
    // ball
    const tr = FS.trail;
    for (let i = 0; i < tr.length; i++) {
      fsc(tr[i][0], tr[i][2]);
      const a = (i + 1) / (tr.length + 1);
      ctx.fillStyle = 'rgba(255,250,235,' + (0.3 * a) + ')';
      ctx.beginPath(); ctx.arc(FSX, FSY - tr[i][1] * s * 0.5, 1.4 + a * 2.2, 0, TAU); ctx.fill();
    }
    fieldBall(t);
    fsc(FBX, FBZ);
    const bgx = FSX, bgy = FSY, lift = FBY * s * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,' + clamp(0.5 - FBY * 0.04, 0.18, 0.5) + ')';
    ctx.beginPath(); ctx.ellipse(bgx, bgy, 3.4, 2.2, 0, 0, TAU); ctx.fill();
    if (lift > 2) { ctx.strokeStyle = 'rgba(255,250,235,0.25)'; ctx.lineWidth = 1; ln(ctx, bgx, bgy, bgx, bgy - lift); }
    const brad = 3.3 + FBY * 0.14;
    const gl = ctx.createRadialGradient(bgx, bgy - lift, 1, bgx, bgy - lift, brad * 3.2);
    gl.addColorStop(0, 'rgba(255,255,255,0.5)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(bgx, bgy - lift, brad * 3.2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.arc(bgx, bgy - lift, brad, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#d4432b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bgx, bgy - lift, brad * 0.7, 0.4, 2.6); ctx.stroke();
    // boundary flash
    if (FS.fate === 'boundary' && t >= FS.tFate) {
      const u = clamp((t - FS.tFate) / 0.9, 0, 1);
      fsc(FS.cx, FS.cz);
      ctx.strokeStyle = 'rgba(255,215,120,' + (1 - u) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(FSX, FSY, 10 + u * 70, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    // vignette
    ctx.fillStyle = 'rgba(0,0,0,0.0)';
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    if (G.fieldFlash > 0.01) { ctx.fillStyle = 'rgba(255,240,210,' + G.fieldFlash * 0.4 + ')'; ctx.fillRect(0, 0, w, h); }
  }

  /* ------------------------------------------------------------ HUD */
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function plate(ctx, x, y, w, h, r, a) {
    rrect(ctx, x, y, w, h, r || 10);
    ctx.fillStyle = 'rgba(10,9,7,' + (a == null ? 0.7 : a) + ')'; ctx.fill();
    ctx.strokeStyle = 'rgba(201,169,110,0.38)'; ctx.lineWidth = 1; ctx.stroke();
  }
  function txt(ctx, s, x, y, size, color, weight, align, font) {
    ctx.font = (weight || 500) + ' ' + size + 'px ' + (font || FONT_UI);
    ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  }
  const short = (n) => { const p = n.split(' '); return p.length > 1 ? p[0][0] + '. ' + p.slice(1).join(' ') : n; };
  const MODE_NAME = { super: 'Super Over', chase: 'T20 Chase', nets: 'Endless Nets' };

  function drawChips(ctx, x, y, maxN) {
    const list = G.chips.filter((c) => c.ov === G.chipOver);
    const slots = G.mode === 'nets' ? 6 : 6;
    const n = Math.max(slots, list.length);
    for (let i = 0; i < Math.min(n, maxN); i++) {
      const cx = x + 9 + i * 21;
      const c = list[i];
      if (!c) { ctx.strokeStyle = 'rgba(163,158,148,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, y, 8, 0, TAU); ctx.stroke(); continue; }
      let fill = '#3a3630', col = '#d9d3c8';
      if (c.s === 'W') { fill = '#d33a2c'; col = '#fff'; }
      else if (c.s === '4') { fill = '#FFB736'; col = '#1a1405'; }
      else if (c.s === '6') { fill = '#FF6940'; col = '#1a0a02'; }
      else if (c.s === 'Wd') { fill = '#2f6f58'; col = '#eafff6'; }
      else if (c.s !== '0') { fill = '#6c6455'; col = '#fff'; }
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(cx, y, 8.5, 0, TAU); ctx.fill();
      txt(ctx, c.s === '0' ? '.' : c.s, cx, y + 3.6, c.s === 'Wd' ? 8 : 10, col, 700, 'center', FONT_MONO);
    }
  }

  function drawHUD(ctx) {
    const w = arc.w, h = arc.h;
    const touch = arc.touchMode;
    const Lw = Math.min(244, w * 0.6), Rw = Math.min(176, w - Lw - 28);
    // score plate
    plate(ctx, 10, 8, Lw, 100, 12);
    txt(ctx, (MODE_NAME[G.mode] + ' / ' + DIFFS[G.diff].label).toUpperCase(), 22, 25, 10, C.gold, 600, 'left', FONT_MONO);
    txt(ctx, G.runs + '/' + G.wkts, 22, 60, 34, C.ink, 500, 'left', FONT_DISP);
    const left = G.ballsTotal - G.balls;
    if (G.mode === 'nets') {
      txt(ctx, 'OVER', 10 + Lw - 14, 29, 10, C.dim, 500, 'right', FONT_MONO);
      txt(ctx, Math.floor(G.balls / 6) + '.' + (G.balls % 6), 10 + Lw - 14, 56, 24, C.ink, 500, 'right', FONT_DISP);
      txt(ctx, 'Survive and score', 22, 80, 12, C.dim, 400);
    } else {
      txt(ctx, 'BALLS LEFT', 10 + Lw - 14, 29, 10, C.dim, 500, 'right', FONT_MONO);
      txt(ctx, String(Math.max(0, left)), 10 + Lw - 14, 56, 26, left <= 2 ? C.prim : C.ink, 500, 'right', FONT_DISP);
      const need = Math.max(0, G.target - G.runs);
      const rrr = left > 0 ? (need / left) * 6 : 0;
      txt(ctx, 'Need ' + need + ' to win', 22, 80, 13, C.ink, 600);
      txt(ctx, 'RRR ' + rrr.toFixed(1), 10 + Lw - 14, 80, 12, rrr > 14 ? C.prim : C.warm, 600, 'right', FONT_MONO);
    }
    drawChips(ctx, 14, 95, 8);
    // bowler / batter plate
    if (Rw > 90) {
      const rx = w - 10 - Rw;
      plate(ctx, rx, 8, Rw, 100, 12);
      const bw = G.bowler;
      txt(ctx, bw && bw.pace ? 'PACE' : 'SPIN', rx + 12, 25, 10, C.gold, 600, 'left', FONT_MONO);
      txt(ctx, bw ? short(bw.name) : '', rx + 12, 44, 14, C.ink, 700);
      if (G.D && G.released) {
        txt(ctx, G.D.kmh + ' km/h', rx + 12, 62, 14, C.warm, 600, 'left', FONT_MONO);
        txt(ctx, G.D.name, rx + 12, 78, 12, C.dim, 500);
      } else txt(ctx, 'Run-up...', rx + 12, 62, 12, C.dim, 400);
      txt(ctx, short(G.batter.name) + ' ' + G.batter.runs + ' (' + G.batter.balls + ')', rx + 12, 97, 12, C.ink, 600);
    }
    // commentary
    if (G.commentT > 0 && G.comment) {
      const a = clamp(G.commentT / 0.5, 0, 1);
      ctx.globalAlpha = a;
      const cw = Math.min(w - 24, 460), cy = Math.max(124, h * 0.14 + 76);
      plate(ctx, (w - cw) / 2, cy, cw, 34, 10, 0.62);
      txt(ctx, G.comment, w / 2, cy + 22, 14, C.ink, 400, 'center', FONT_DISP);
      ctx.globalAlpha = 1;
    }
    // bottom cues
    const by = h - (touch ? 176 : 54);
    if (G.phase === 'field') {
      if (FS.runPrompt && FS.runPrompt.show && !FS.ended) {
        const m = FS.runPrompt.margin;
        const col = m >= 0.35 ? '#7ddf8a' : m >= -0.15 ? C.warm : '#ff6a55';
        const word = m >= 0.35 ? 'Safe, running anyway' : m >= -0.15 ? 'Risky, tap Run to push' : 'Very risky';
        ctx.globalAlpha = 0.96;
        plate(ctx, w / 2 - 120, by - 24, 240, 40, 12, 0.72);
        ctx.globalAlpha = 1;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w / 2 - 98, by - 4, 6, 0, TAU); ctx.fill();
        txt(ctx, 'RUN ' + (RN.state === 'run' ? RN.n + 1 : RN.k + 1) + '?', w / 2 - 84, by + 0, 13, C.ink, 700, 'left', FONT_MONO);
        txt(ctx, word, w / 2 - 84, by + 12, 11, col, 600);
      }
      // shot tag
      if (G.hit && FS.t < 1.8) {
        const r = G.hit.r, a = clamp(1.8 - FS.t, 0, 1) * clamp(FS.t / 0.12, 0, 1);
        ctx.globalAlpha = a;
        const kw = { middled: 'MIDDLED', good: 'WELL TIMED', mistime: 'MISTIMED', defend: 'DEFENDED', edge: 'EDGED', topedge: 'TOP EDGE', leading: 'LEADING EDGE' }[r.kind] || '';
        const ty = h * 0.34;
        plate(ctx, w / 2 - 118, ty - 28, 236, 52, 12, 0.6);
        txt(ctx, kw, w / 2, ty - 5, 18, r.kind === 'middled' ? C.warm : C.ink, 700, 'center', FONT_MONO);
        txt(ctx, r.s.name, w / 2, ty + 14, 13, C.dim, 500, 'center');
        ctx.globalAlpha = 1;
      }
    } else if (G.view === 'bat' && (G.phase === 'runup' || G.phase === 'delivery' || G.phase === 'shot')) {
      // the chosen shot
      const d = G.dir;
      if (G.D) {
        const s = shotFor(d.dx, d.dy, G.D);
        const arrows = (d.dx < 0 ? '← ' : '') + (d.dx > 0 ? '→ ' : '') + (d.dy < 0 ? '↑ ' : '') + (d.dy > 0 ? '↓ ' : '');
        ctx.globalAlpha = 0.9;
        plate(ctx, w / 2 - 82, by - 22, 164, 36, 10, 0.6);
        ctx.globalAlpha = 1;
        txt(ctx, (arrows || '↑↓ ') .trim().replace('↑↓', 'straight'), w / 2, by - 8, 10, C.gold, 600, 'center', FONT_MONO);
        txt(ctx, s.name, w / 2, by + 7, 13, C.ink, 700, 'center');
      }
      if (G.first && G.deliveries <= 1 && G.phase !== 'shot') {
        const msg = touch ? 'Hold the stick to pick a shot, tap Bat as the ball arrives' : 'Arrows pick the shot, Space swings as the ball reaches you';
        const mw = Math.min(w - 24, 420);
        plate(ctx, (w - mw) / 2, by - 76, mw, 38, 10, 0.66);
        txt(ctx, msg, w / 2, by - 53, 12, C.ink, 500, 'center');
      }
    }
    // timing floaters
    if (G.view === 'bat') {
      for (const f of G.floats) {
        const u = f.t / f.life;
        proj(-0.45, 2.2, HITZ);
        const fx = clamp(PX - w * 0.0, 80, w - 80), fy = PY - 24 - u * 44;
        ctx.globalAlpha = clamp(1.4 - u * 1.4, 0, 1);
        ctx.font = '800 ' + f.size + 'px ' + FONT_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 5; ctx.strokeText(f.text, fx, fy);
        ctx.fillStyle = f.color; ctx.fillText(f.text, fx, fy);
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ------------------------------------------------------------ loop */
  const SEQ = { fire: 0, murmur: 0 };

  function decay(dt) {
    G.clock += dt;
    G.shake = Math.max(0, G.shake - dt * 1.6);
    G.punch = Math.max(0, G.punch - dt * 3);
    G.flash = Math.max(0, G.flash - dt * 3);
    G.fieldFlash = Math.max(0, (G.fieldFlash || 0) - dt * 2.5);
    G.crowd = Math.max(0, G.crowd - dt * 0.22);
    G.fade = Math.max(0, G.fade - dt * 3.2);
    G.commentT = Math.max(0, G.commentT - dt);
    G.signalT += dt;
    if (G.fireShow > 0) {
      G.fireShow -= dt; SEQ.fire -= dt;
      if (SEQ.fire <= 0 && !G.attract) { spawnFirework(arc.w, arc.h); SEQ.fire = arc.reducedMotion ? 0.8 : 0.28; }
    }
    // screen-space particles
    const P = G.parts;
    for (let i = P.length - 1; i >= 0; i--) { /* handled in updateWorldFx */ void i; }
    updateWorldFx(dt);
    if (G.phase !== 'field' && G.view === 'bat' && G.D && G.released && G.phase !== 'result') {
      const D = G.D; ballAt(D, Math.min(G.tb, D.tStump + 0.25));
      const tr = G.trail;
      if (BZ > -0.8 && (!tr.length || hyp(tr[tr.length - 1][2] - BZ, tr[tr.length - 1][0] - BX) > 0.25)) { tr.push([BX, BY, BZ]); if (tr.length > 9) tr.shift(); }
    }
  }

  function readInput() {
    const inp = arc.input;
    const ax = inp.axis();
    G.dir = decodeDir(ax);
    const space = inp.hit('Space');
    const tap = inp.pointer.pressed;
    return { press: space || tap, space, tap, run: inp.hit('KeyR', 'ShiftLeft', 'ShiftRight') };
  }

  function update(dt) {
    decay(dt);
    const inp = readInput();
    SEQ.murmur -= dt;
    if (SEQ.murmur <= 0) { SEQ.murmur = 1.1; if (arc.sfx) arc.sfx.noise(0.95, { filter: 'bandpass', freq: 420 + G.crowd * 300, vol: 0.02 + 0.05 * G.crowd }); }
    switch (G.phase) {
      case 'runup': case 'delivery': case 'shot':
        updateBat(dt, inp);
        break;
      case 'field':
        updateField(dt, { run: inp.run || ((inp.space || inp.tap) && FS.t > 0.35) });
        updateFieldCam(dt, false);
        break;
      case 'result':
        G.resultT += dt;
        if (G.view === 'field') { updateField(dt, { run: false }); updateFieldCam(dt, false); }
        else if (G.pass) updateBat(dt, { press: false });
        if (G.resultT >= G.resultDur) afterResult();
        break;
      default: break;
    }
  }

  // The menu runs a looping demo behind the panel.
  function idle(dt) {
    if (arc.state === 'menu' && G.attract) {
      decay(dt);
      attractTick(dt);
    } else if (arc.state === 'over') {
      decay(dt);
    } else if (arc.state === 'pause') {
      G.clock += 0; // frozen
    }
  }

  const AT = { swingAt: -9, dirs: [[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [-1, 0]] };
  function startAttract() {
    G.attract = true; G.mode = 'super'; G.diff = 'pro'; G.cfg = DIFFS.pro; rnd = Math.random;
    G.runs = 0; G.wkts = 0; G.balls = 0; G.deliveries = 0; G.bowlers = {}; G.chips = []; G.over = false; G.first = false;
    G.parts.length = 0; G.debris.length = 0; G.floats.length = 0; G.fireShow = 0; G.celebrate = 0; G.signal = ''; G.fade = 0;
    G.batter = { name: 'Kian Marlow', runs: 0, balls: 0 };
    AT.swingAt = -9;
    startBall();
    attractPlan();
  }
  function attractPlan() {
    const D = G.D;
    AT.swingAt = rnd() < 0.55 ? D.tArr - SWING_LAG + rr(-0.03, 0.05) : 99;
    const d = pickOf(AT.dirs); G.dir = { dx: d[0], dy: d[1] };
    AT.dir = G.dir;
  }
  function attractTick(dt) {
    switch (G.phase) {
      case 'runup': case 'delivery': case 'shot': {
        let press = false;
        if (!G.swing && G.tb >= AT.swingAt) press = true;
        G.dir = AT.dir;
        updateBat(dt, { press });
        break;
      }
      case 'field':
        updateField(dt, { run: false }); updateFieldCam(dt, false);
        break;
      case 'result':
        G.resultT += dt;
        if (G.view === 'field') { updateField(dt, { run: false }); updateFieldCam(dt, false); } else if (G.pass) updateBat(dt, { press: false });
        if (G.resultT >= Math.min(G.resultDur, 1.5)) { G.runs = 0; G.wkts = 0; G.balls = 0; G.chips = []; G.over = false; G.fade = 1; startBall(); attractPlan(); }
        break;
      default: break;
    }
  }

  function render(ctx, a) {
    arc = a;
    if (!BACK) buildBackdrop();
    if (!FIELD) buildField();
    const w = arc.w, h = arc.h;
    // idle camera drift behind the menu
    if (arc.state === 'menu') cam.x = 0.08 + Math.sin(G.clock * 0.25) * 0.35; else cam.x = 0.08;
    if (G.view === 'field' && G.phase !== 'runup') {
      drawFieldScene(ctx);
      if (G.snap && G.trans < 1) {
        ctx.globalAlpha = 1 - G.trans; ctx.drawImage(G.snap, 0, 0, w, h); ctx.globalAlpha = 1;
      }
    } else drawBatScene(ctx);
    drawParts(ctx, false);
    if (!G.attract && arc.state !== 'menu') drawHUD(ctx);
    if (G.fade > 0.01) { ctx.fillStyle = 'rgba(5,6,10,' + clamp(G.fade, 0, 1) + ')'; ctx.fillRect(0, 0, w, h); }
  }

  /* ------------------------------------------------------------ boot */
  const OPTIONS = [
    { id: 'mode', label: 'Mode', choices: [{ v: 'super', label: 'Super Over' }, { v: 'chase', label: 'T20 Chase' }, { v: 'nets', label: 'Endless Nets' }] },
    { id: 'diff', label: 'Difficulty', value: 'pro', choices: [{ v: 'club', label: 'Club' }, { v: 'pro', label: 'Pro' }, { v: 'legend', label: 'Legend' }] },
    { id: 'batter', label: 'Your batter', choices: BATTERS.map((b) => ({ v: b.id, label: b.label })) },
  ];
  const MENU = {
    eyebrow: 'Stadium cricket',
    title: 'Super <em>Over</em>',
    html: '<p>Floodlights on, crowd roaring. Pick a shot with the arrows, then swing as the ball reaches the crease. Perfect timing and the right shot for the length clears the rope. After contact, tap Run to push for the extra run if the field is slow to react.</p>',
    options: OPTIONS,
  };

  function boot() {
    arc = Arcade.create({
      slug: 'super-over', title: 'Super Over', genre: 'Stadium cricket',
      hint: 'Arrows pick the shot  |  Space swings  |  R pushes for a run',
      keys: [
        ['Left / Right', 'Leg side / off side'],
        ['Up', 'Loft it'],
        ['Down', 'Defend or play soft'],
        ['Space / tap', 'Swing the bat'],
        ['R / Shift', 'Push for a risky run'],
        ['P', 'Pause'],
      ],
      touch: { stick: true, pads: [{ label: 'Run', key: 'KeyR' }, { label: 'Bat', key: 'Space', big: true, hot: true }] },
      gameKeys: ['KeyR'],
      menu: MENU,
      pauseHtml: () => '<div class="stat"><div>Score<b>' + G.runs + '/' + G.wkts + '</b></div>' + (G.mode === 'nets' ? '' : '<div>Target<b>' + G.target + '</b></div>') + '</div>',
      resize: () => { cam.dirty = true; cam.vig = null; },
      init: (a) => {
        arc = a;
        G.snapC = mk(2, 2);
        G.snap = G.snapC;
        G.snapFn = () => {
          const c = arc.canvas;
          if (G.snapC.width !== c.width || G.snapC.height !== c.height) { G.snapC.width = c.width; G.snapC.height = c.height; }
          const sctx = G.snapC.getContext('2d');
          sctx.setTransform(1, 0, 0, 1, 0, 0);
          sctx.drawImage(c, 0, 0);
        };
        MENU.showKeys = !a.touchMode;
        a.menu();
        startAttract();
      },
      onMenu: () => { if (!G.attract) startAttract(); },
      start: (a, ch) => {
        arc = a;
        resetMatch(ch);
        G.view = 'bat'; G.phase = 'runup'; G.fade = 1; G.parts.length = 0; G.fireShow = 0; G.crowd = 0.2;
        startBall();
        a.toast(G.mode === 'nets' ? 'Endless Nets' : 'Chase ' + G.target, MODE_NAME[G.mode] + ' / ' + DIFFS[G.diff].label, 1900);
      },
      update: (dt) => update(dt),
      idle: (dt) => idle(dt),
      render: (ctx, a) => render(ctx, a),
    });
    arc.debug = () => {
      const D = G.D, W = G.cfg.win;
      return {
        mode: G.mode, difficulty: G.diff, phase: G.phase, view: G.view, ballIndex: G.balls, deliveries: G.deliveries,
        runs: G.runs, wickets: G.wkts, target: G.target, ballsLeft: G.mode === 'nets' ? null : G.ballsTotal - G.balls,
        lastResult: G.lastResult, deliveryType: D ? D.name : null, kmh: D ? D.kmh : null, timingWindow: { perfect: W.p, good: W.g, miss: W.m },
        tb: G.tb, tArr: D ? D.tArr : null, shot: G.swing ? G.swing.s.name : null, shotKind: G.swing ? G.swing.res.kind : null,
        fate: G.phase === 'field' || G.phase === 'result' ? FS.fate : null, runsTaken: RN.k, batter: G.batter.name, bowler: G.bowler ? G.bowler.name : null,
        fieldT: FS.t, over: G.over, won: G.won, score: G.finalScore,
      };
    };
    window.__superover = { G, FS, RN, DIFFS, SWING_LAG, startSwing, FL: () => FL, step: (dt) => { update(dt); arc.input.endFrame(); } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
