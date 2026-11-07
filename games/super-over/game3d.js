import * as THREE from '/games/vendor/three/three.module.min.js';
/*
 * Super Over, in real 3D: a stadium T20 batting game under floodlights.
 * You bat, the computer bowls and fields. Original art, names and code.
 *
 * The rules, deliveries, shots, scoring and field play are the same as the
 * flat version; the presentation is a three.js world: a night stadium with
 * tiered stands and an instanced crowd, floodlight towers, boards with the
 * game's invented sponsors, a worn pitch, animated people, a real 3D ball
 * path, and a camera that cuts from the batting view to a high chase camera.
 *
 * Coordinates
 *   Batting numbers : x across the pitch (+ = off side), y height, z from the
 *                     batter's stumps toward the bowler (bowler's stumps at 20.12).
 *   Field numbers   : x across, z along the pitch (+ toward the bowler), origin
 *                     at the middle of the pitch (field z = batting z - 10.06).
 *   World (three)   : X = x, Y = y, Z = -(field z). The batter's camera looks
 *                     down -Z with +X to the right, so the off side is screen right.
 */
const Arcade = window.Arcade;
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
    club: { label: 'Club', win: { p: 0.062, g: 0.128, m: 0.215 }, pace: [20.5, 23.5], spin: [13, 15.5], swing: 0.65, turn: 0.7, loose: 0.3, wide: 0.07, fspd: 5.8, react: 0.55, catchSk: 0.88, hint: true, target: { super: [14, 16], chase: [24, 30] } },
    pro: { label: 'Pro', win: { p: 0.047, g: 0.102, m: 0.185 }, pace: [23.5, 26.5], spin: [14.5, 17], swing: 0.95, turn: 1.0, loose: 0.16, wide: 0.05, fspd: 6.6, react: 0.42, catchSk: 0.94, hint: false, target: { super: [17, 19], chase: [30, 37] } },
    legend: { label: 'Legend', win: { p: 0.035, g: 0.078, m: 0.145 }, pace: [26.5, 30], spin: [16, 18.5], swing: 1.25, turn: 1.3, loose: 0.07, wide: 0.03, fspd: 7.6, react: 0.3, catchSk: 0.975, hint: false, target: { super: [20, 22], chase: [36, 44] } },
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
    G.signal = ''; G.celebrate = 0; clearFx(); G.floats.length = 0; G.first = true;
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
    setField(overIdx, bw.pace);
    G.D = makeDelivery(bw, G.cfg, ramp, G.lastKind);
    G.lastKind = G.D.kind;
    G.runupDur = bw.pace ? 1.55 : 1.05;
    G.tb = -G.runupDur; G.t = 0; G.released = false; G.swing = null; G.pass = null; G.result = null;
    G.phase = 'runup'; G.view = 'bat'; G.stumpsDown = false; G.signal = ''; resetStumps(); resetVisualBall();
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
    prepSwing(G.swing);
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

  function keeperPos() { const k = G.fieldPos && G.fieldPos[0]; return k ? { x: k[1], zb: k[2] + HALF } : { x: 0.4, zb: -4 }; }
  function keeperTime(D) { const k = keeperPos(); return clamp(Math.hypot(k.x - D.xS, k.zb) / (D.v2 * 0.75), 0.15, 1.0); }

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
      kind = 'keeper'; at = D.tStump + keeperTime(D); wait = 0.3;
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
    kick(0.5);
    breakStumps3(0);
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
    kick(r.kind === 'middled' && r.v > 30 ? 0.45 : 0.15);
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

  // The captain sets a field for the over; it stays put for all six balls so a batter can learn the gaps.
  function setField(over, pace) {
    const key = over + (pace ? 'p' : 's');
    if (G.fieldKey === key && G.fieldPos) return;
    G.fieldKey = key;
    const lay = pace ? LAYOUT_PACE : LAYOUT_SPIN;
    G.fieldPos = lay.map((e, i) => {
      let x = e[1], z = e[2];
      if (i >= 2) {
        const ang = rr(-0.4, 0.4), c = Math.cos(ang), s = Math.sin(ang);
        const k = rr(0.88, 1.08);
        const rx = (x * c + z * s) * k, rz = (-x * s + z * c) * k;
        x = rx; z = rz;
      } else { x += rr(-0.3, 0.3); z += rr(-0.3, 0.3); }
      const rad = hyp(x, z); if (rad > ROPE - 5) { x *= (ROPE - 5) / rad; z *= (ROPE - 5) / rad; }
      return [e[0], x, z];
    });
  }

  function buildFielders(pace) {
    setField(Math.floor(G.balls / 6), pace);
    const cfg = G.cfg;
    FL = G.fieldPos.map((e) => ({ role: e[0], x0: e[1], z0: e[2], tx: e[1], tz: e[2], sp: cfg.fspd * rr(0.95, 1.05), react: cfg.react + rr(0, 0.1), mv: 1, x: e[1], z: e[2], face: 0 }));
    const bsp = bowlerPosField();
    FL.push({ role: 'Bowler', x0: bsp[0], z0: bsp[1], tx: bsp[0], tz: bsp[1], sp: cfg.fspd * 0.9, react: cfg.react + 0.3, mv: 1, x: bsp[0], z: bsp[1], face: 0 });
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
        const reach = (catchable ? (y < 0.9 ? 1.2 : 1.0) * fast : (spd >= 24 ? 0.7 : 0.9));
        const slack = f.sp * mt + reach - d;
        if (slack >= 0 && slack > bs) { bs = slack; bf = f; }
      }
      if (bf) { best = { i, f: bf, slack: bs, air: catchable }; bestSpd = spd; }
    }
    FS.fate = 'field'; FS.dropped = false; FS.col = null; FS.catcher = null; FS.six = false; FS.pickSpd = best ? bestSpd : 0;
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
            breakStumpsField(ez);
            end({ runs: RN.k, wicket: 'Run out', runout: true }, 0);
            return;
          }
          if (rnd() < 0.3) { FS.extra = 1; G.comment = sayOf('overthrow'); G.commentT = 2.4; }
        }
      }
      if (FS.relDone && (FS.dead || (FS.thr && FS.thr.done)) && RN.state === 'idle') end({ runs: RN.k + FS.extra }, 0.7);
    }
  }

  function breakStumpsField(ez) { snd.stumps(); kick(0.35); G.fieldFlash = 0.6; breakStumps3(ez > 0 ? 1 : 0); }

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


/* ====================================================================== 3D: shared bits */
const R3 = { ok: false, lost: false, q: 3, lock: false, renderer: null, scene: null, camera: null, aniso: 4, time: 0, last: 0, accT: 0, accN: 0, accW: 0, key: null, hemi: null, sky: null, fail: '' };
const B2W = (x, y, zb, out) => out.set(x, y, HALF - zb);
const F2W = (x, y, zf, out) => out.set(x, y, -zf);
const SIDE = [1, -1];

function ctex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  if (o.mip === false) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; } else t.anisotropy = R3.aniso;
  return t;
}

function mergeGeos(list) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  let off = 0;
  for (const it of list) {
    const gg = it.m ? it.g.clone().applyMatrix4(it.m) : it.g;
    const p = gg.attributes.position, n = gg.attributes.normal, u = gg.attributes.uv;
    const c = it.c || [1, 1, 1];
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); col.push(c[0], c[1], c[2]);
    }
    if (gg.index) for (let i = 0; i < gg.index.count; i++) idx.push(gg.index.getX(i) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(idx);
  return out;
}
const rgbOf = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const radial = (g, w, h, stops) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  stops.forEach((s) => gr.addColorStop(s[0], s[1]));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
};

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
  for (let i = 0; i < 12; i++) {
    let x = -1.3 + r() * 2.6, z = 3 + r() * 9; const pts = [[x, z]];
    for (let j = 0; j < 4; j++) { x += (r() - 0.5) * 0.35; z += 0.2 + r() * 0.45; pts.push([x, z]); }
    CRACKS.push(pts);
  }
})();

const CROWD = ['#c0392b', '#e74c3c', '#2c6bd1', '#f1c40f', '#ecf0f1', '#e67e22', '#27ae60', '#8e44ad', '#f5cba7', '#34495e', '#ffffff', '#d35400', '#3498db', '#fd79a8'];
const STAND = { n: 24, r0: 74, dr: 1.6, h0: 1.0, dh: 1.05 };
const standR = (i) => STAND.r0 + i * STAND.dr;
const standH = (i) => STAND.h0 + i * STAND.dh;
const WORLD = { crowdU: { uTime: { value: 0 }, uCrowd: { value: 0 } }, boardMat: null, flashU: { uTime: { value: 0 }, uAmt: { value: 0.2 } } };

/* ====================================================================== 3D: the stadium */
function buildWorld() {
  const sc = R3.scene = new THREE.Scene();
  sc.fog = new THREE.FogExp2(0x0b1430, 0.0034);
  const rg = Arcade.rng(7);
  const grp = new THREE.Group(); sc.add(grp);

  /* sky */
  const skyTex = ctex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#02030a'); gr.addColorStop(0.3, '#050b22'); gr.addColorStop(0.45, '#12214a'); gr.addColorStop(0.5, '#2c4075');
    gr.addColorStop(0.53, '#14204a'); gr.addColorStop(1, '#0b1430');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { mip: false });
  R3.sky = new THREE.Mesh(new THREE.SphereGeometry(480, 24, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  R3.sky.renderOrder = -10; R3.sky.frustumCulled = false; sc.add(R3.sky);
  {
    const n = 280, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rg() * TAU, y = 0.1 + rg() * 0.9, rr2 = Math.sqrt(1 - y * y);
      p[i * 3] = Math.cos(a) * rr2 * 460; p[i * 3 + 1] = y * 460; p[i * 3 + 2] = Math.sin(a) * rr2 * 460;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
    stars.renderOrder = -9; stars.frustumCulled = false; sc.add(stars);
  }

  /* lights */
  R3.hemi = new THREE.HemisphereLight(0xaebcff, 0x24462c, 1.15); sc.add(R3.hemi);
  const key = R3.key = new THREE.DirectionalLight(0xfff0d8, 3.1);
  key.position.set(-26, 72, 22); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04;
  const sh = key.shadow.camera; sh.left = -34; sh.right = 34; sh.top = 34; sh.bottom = -34; sh.near = 10; sh.far = 200;
  sc.add(key); sc.add(key.target);
  const fill = new THREE.DirectionalLight(0xbfd0ff, 0.55); fill.position.set(30, 30, -40); sc.add(fill);

  /* grass */
  const grassTex = ctex(512, 512, (g, w, h) => {
    g.fillStyle = '#2d7d33'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#378d3d'; g.fillRect(0, 0, w / 2, h);
    const r = Arcade.rng(3);
    for (let i = 0; i < 16000; i++) {
      const x = r() * w, y = r() * h;
      g.fillStyle = r() < 0.5 ? 'rgba(8,48,14,' + (0.1 + r() * 0.14) + ')' : 'rgba(160,214,104,' + (0.05 + r() * 0.1) + ')';
      g.fillRect(x, y, 1 + r() * 1.6, 1 + r() * 3);
    }
    g.strokeStyle = 'rgba(20,80,28,0.16)'; g.lineWidth = 1;
    for (let i = 0; i < 700; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y - 3 - r() * 5); g.stroke(); }
  }, { repeat: [14.4, 14.4] });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(72, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.96, metalness: 0 }));
  ground.receiveShadow = true; grp.add(ground);

  const decal = (geo, map, y, order, extra) => {
    const m = new THREE.Mesh(geo.rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial(Object.assign({ map, transparent: true, roughness: 0.95, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order }, extra || {})));
    m.position.y = y; m.receiveShadow = true; m.renderOrder = order; grp.add(m); return m;
  };
  // the square and the thirty-yard circle
  const circ = ctex(2048, 2048, (g, w, h) => {
    const X = (m) => (m + 30) / 60 * w, Z = (m) => (30 - m) / 60 * h, S = w / 60;
    g.fillStyle = 'rgba(96,190,104,0.22)'; g.fillRect(X(-4.2), Z(HALF + 5.9), 8.4 * S, (PITCH + 11) * S);
    g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.12 * S; g.setLineDash([0.5 * S, 0.35 * S]);
    g.beginPath(); g.arc(w / 2, h / 2, 27.4 * S, 0, TAU); g.stroke();
  });
  decal(new THREE.PlaneGeometry(60, 60), circ, 0.004, 1);
  // the pool of light: grass falls off toward the edge of the ground
  const vig = ctex(512, 512, (g, w, h) => {
    radial(g, w, h, [[0, 'rgba(0,0,0,0)'], [0.42, 'rgba(0,4,2,0)'], [0.86, 'rgba(0,6,4,0.46)'], [1, 'rgba(0,6,4,0.62)']]);
  }, { mip: false });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(150, 150).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: vig, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.position.y = 0.006; m.renderOrder = 2; grp.add(m); }

  /* the pitch */
  const pitchTex = ctex(256, 1792, (g, w, h) => {
    const r = Arcade.rng(12);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#a4825a'); gr.addColorStop(0.18, '#bf9c67'); gr.addColorStop(0.5, '#c9a670'); gr.addColorStop(0.82, '#bf9c67'); gr.addColorStop(1, '#a4825a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(80,52,24,' + (0.06 + r() * 0.1) + ')' : 'rgba(236,208,150,' + (0.05 + r() * 0.09) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    const PX = (x) => (x + 1.525) / 3.05 * w, PZ = (zf) => (11.16 - zf) / 22.32 * h, sc2 = w / 3.05;
    for (const p of WEAR) {
      const gg = g.createRadialGradient(PX(p.x), PZ(p.z - HALF), 1, PX(p.x), PZ(p.z - HALF), Math.max(p.rx, p.rz * 0.6) * sc2 * 1.6);
      gg.addColorStop(0, 'rgba(70,42,18,' + (p.a + 0.1) + ')'); gg.addColorStop(1, 'rgba(70,42,18,0)');
      g.fillStyle = gg; g.save(); g.translate(PX(p.x), PZ(p.z - HALF)); g.scale(1, p.rz / p.rx * 1.4); g.translate(-PX(p.x), -PZ(p.z - HALF)); g.fillRect(PX(p.x) - 60, PZ(p.z - HALF) - 60, 120, 120); g.restore();
    }
    g.strokeStyle = 'rgba(52,32,14,0.5)'; g.lineWidth = 1.2;
    for (const c of CRACKS) { g.beginPath(); c.forEach((pt, k) => { const x = PX(pt[0]), y = PZ(pt[1] - HALF); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke(); }
    // grass creeping in at the long edges
    const eg = g.createLinearGradient(0, 0, w, 0);
    eg.addColorStop(0, 'rgba(60,110,50,0.5)'); eg.addColorStop(0.07, 'rgba(60,110,50,0)'); eg.addColorStop(0.93, 'rgba(60,110,50,0)'); eg.addColorStop(1, 'rgba(60,110,50,0.5)');
    g.fillStyle = eg; g.fillRect(0, 0, w, h);
  });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 22.32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.82, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.position.y = 0.01; m.receiveShadow = true; grp.add(m); }
  const crease = ctex(512, 2240, (g, w, h) => {
    const X = (x) => (x + 2.8) / 5.6 * w, Z = (zf) => (12.3 - zf) / 24.6 * h, S = w / 5.6;
    g.strokeStyle = 'rgba(250,248,240,0.95)'; g.lineWidth = 0.05 * S; g.lineCap = 'butt';
    for (const base of [-HALF, HALF]) {
      const dir = base < 0 ? 1 : -1;
      g.beginPath();
      g.moveTo(X(-1.32), Z(base)); g.lineTo(X(1.32), Z(base));
      g.moveTo(X(-2.2), Z(base + dir * 1.22)); g.lineTo(X(2.2), Z(base + dir * 1.22));
      g.moveTo(X(-1.32), Z(base)); g.lineTo(X(-1.32), Z(base + dir * 3.2));
      g.moveTo(X(1.32), Z(base)); g.lineTo(X(1.32), Z(base + dir * 3.2));
      g.stroke();
    }
  });
  decal(new THREE.PlaneGeometry(5.6, 24.6), crease, 0.013, 4, { roughness: 0.9 });

  // the rope
  { const m = new THREE.Mesh(new THREE.TorusGeometry(ROPE, 0.09, 6, 160).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.8, emissive: 0x3a3a34 })); m.position.y = 0.09; grp.add(m); }
  // dark run-off between the rope and the boards
  { const m = new THREE.Mesh(new THREE.RingGeometry(ROPE + 0.2, 76, 96, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x14301c, roughness: 1 })); m.position.y = 0.002; m.receiveShadow = true; grp.add(m); }

  /* advertising boards, one atlas of the game's invented sponsors */
  const adTex = ctex(1536, 1050, (g, w, h) => {
    const cw = w / 2, ch = h / 6;
    ADS.forEach((ad, k) => {
      const x = (k % 2) * cw, y = Math.floor(k / 2) * ch;
      g.fillStyle = ad[1]; g.fillRect(x, y, cw, ch);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, cw, ch * 0.12);
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, y + ch * 0.9, cw, ch * 0.1);
      g.fillStyle = ad[2]; g.globalAlpha = 0.16;
      for (let s = 0; s < 4; s++) { g.beginPath(); g.moveTo(x + 8 + s * 22, y + ch); g.lineTo(x + 30 + s * 22, y); g.lineTo(x + 40 + s * 22, y); g.lineTo(x + 18 + s * 22, y + ch); g.fill(); }
      g.globalAlpha = 1;
      g.font = '800 ' + Math.round(ch * 0.55) + 'px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = ad[2]; g.fillText(ad[0], x + cw / 2, y + ch * 0.54, cw * 0.82);
    });
  });
  {
    const nB = 100, rb = 69.8, h1 = 1.05, pos = [], uv = [], idx = [], nor = [];
    for (let i = 0; i < nB; i++) {
      const a0 = i / nB * TAU, a1 = (i + 0.985) / nB * TAU, k = i % ADS.length, c = k % 2, r = Math.floor(k / 2);
      const u0 = c * 0.5 + 0.004, u1 = c * 0.5 + 0.496, v1 = 1 - r / 6 - 0.004, v0 = 1 - (r + 1) / 6 + 0.004;
      const b = pos.length / 3;
      for (const [a, y, u, v] of [[a0, 0.08, u0, v0], [a1, 0.08, u1, v0], [a1, h1, u1, v1], [a0, h1, u0, v1]]) {
        pos.push(Math.cos(a) * rb, y, Math.sin(a) * rb); uv.push(u, v); nor.push(-Math.cos(a), 0, -Math.sin(a));
      }
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); bg.setIndex(idx);
    WORLD.boardMat = new THREE.MeshBasicMaterial({ map: adTex, side: THREE.DoubleSide });
    const m = new THREE.Mesh(bg, WORLD.boardMat); m.castShadow = false; grp.add(m);
    // the dark back of every board
    const back = new THREE.Mesh(new THREE.CylinderGeometry(rb + 0.12, rb + 0.12, h1, 100, 1, true), new THREE.MeshBasicMaterial({ color: 0x0a0d14, side: THREE.DoubleSide }));
    back.position.y = h1 / 2; grp.add(back);
  }

  /* sightscreens */
  const ssTex = ctex(256, 128, (g, w, h) => {
    g.fillStyle = '#dfe3ec'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 1; i < 8; i++) g.fillRect(i * w / 8 - 1, 0, 2, h);
    g.fillStyle = 'rgba(0,0,0,0.10)'; g.fillRect(0, h - 10, w, 10);
  });
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(17, 7.5, 0.5), [0, 1, 2, 3, 4, 5].map((k) => new THREE.MeshStandardMaterial({ map: k === 4 || k === 5 ? ssTex : null, color: k === 4 || k === 5 ? 0xffffff : 0x1b2030, emissive: k === 4 || k === 5 ? 0xaab0c0 : 0x000000, emissiveMap: k === 4 || k === 5 ? ssTex : null, emissiveIntensity: 0.28, roughness: 0.8 })));
    m.position.set(0, 3.9, s * 72.4); grp.add(m);
    const f = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.4, 0.7), new THREE.MeshStandardMaterial({ color: 0x1b2030 })); f.position.set(0, 7.8, s * 72.4); grp.add(f);
  }

  /* the bowl: one sloped surface, painted as a crowd, plus the roof and back wall */
  const bowlTex = ctex(1024, 1024, (g, w, h) => {
    const r = Arcade.rng(31);
    g.fillStyle = '#10151f'; g.fillRect(0, 0, w, h);
    const rows = 8, rh = h / rows;
    for (let k = 0; k < rows; k++) {
      g.fillStyle = k % 2 ? '#161c2a' : '#121826'; g.fillRect(0, k * rh, w, rh);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, k * rh, w, 4);
      for (let x = 6; x < w; x += 15) {
        if (r() < 0.06) continue;
        const col = CROWD[(r() * CROWD.length) | 0];
        g.fillStyle = col; g.globalAlpha = 0.55 + r() * 0.4;
        g.beginPath(); g.ellipse(x + (r() - 0.5) * 3, k * rh + rh * 0.78, 6.4, rh * 0.26, 0, 0, TAU); g.fill();
        g.fillStyle = '#d9a97d'; g.globalAlpha = 0.9; g.beginPath(); g.arc(x, k * rh + rh * 0.46, 3.4, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
  }, { repeat: [34, 1] });
  {
    const S = 144, N = STAND.n, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j <= S; j++) {
      const a = j / S * TAU; pos.push(Math.cos(a) * standR(i), standH(i), Math.sin(a) * standR(i)); uv.push(j / S, i / 8);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < S; j++) {
      const a = i * (S + 1) + j, b = a + 1, c = a + S + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(idx); bg.computeVertexNormals();
    const bowl = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: bowlTex, color: 0x9a9aa6, side: THREE.DoubleSide }));
    bowl.receiveShadow = false; grp.add(bowl);
    // the front wall under the first row
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(standR(0), standR(0), standH(0), 100, 1, true), new THREE.MeshBasicMaterial({ color: 0x151a26, side: THREE.DoubleSide }));
    wall.position.y = standH(0) / 2; grp.add(wall);
    // back wall with lit windows
    const hTop = standH(N), rTop = standR(N);
    const winTex = ctex(512, 128, (g, w, h) => {
      const r = Arcade.rng(8);
      g.fillStyle = '#0c1019'; g.fillRect(0, 0, w, h);
      for (let y = 10; y < h - 6; y += 22) for (let x = 6; x < w; x += 20) { if (r() < 0.25) continue; g.fillStyle = r() < 0.8 ? '#ffe9b0' : '#9fc4ff'; g.globalAlpha = 0.5 + r() * 0.5; g.fillRect(x, y, 10, 11); }
      g.globalAlpha = 1;
    }, { repeat: [16, 1] });
    const back = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 3, rTop + 3, 20, 100, 1, true), new THREE.MeshBasicMaterial({ map: winTex, color: 0xbbbbbb, side: THREE.DoubleSide }));
    back.position.y = hTop + 10 - 1; grp.add(back);
    // roof: a ring that leans in over the top rows, lit along its edge
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 3, rTop - 16, 2.4, 100, 1, true), new THREE.MeshBasicMaterial({ color: 0x1a2030, side: THREE.DoubleSide }));
    roof.position.y = hTop + 15; grp.add(roof);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(rTop - 16, 0.28, 5, 120).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff1cf, fog: false }));
    lip.position.y = hTop + 13.8; grp.add(lip);
    // an arena sign on the far side of the roof
    const sign = ctex(1024, 128, (g, w, h) => {
      g.fillStyle = '#0b0e16'; g.fillRect(0, 0, w, h);
      g.font = '700 74px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(255,183,54,0.95)'; g.shadowBlur = 24; g.fillStyle = '#FFB736'; g.fillText('MERIDIAN ARENA', w / 2, h / 2 + 4);
    });
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(36, 4.5), new THREE.MeshBasicMaterial({ map: sign, fog: false, side: THREE.DoubleSide }));
      m.position.set(0, hTop + 17.2, s * (rTop - 14.5)); m.rotation.y = s > 0 ? Math.PI : 0; grp.add(m);
    }
  }

  /* the crowd: instanced people on every row, bouncing when the ground erupts */
  {
    const torso = new THREE.CylinderGeometry(0.3, 0.38, 0.8, 6, 1, true).translate(0, 0.4, 0).scale(1, 1, 0.72);
    const head = new THREE.OctahedronGeometry(0.2).scale(1, 1.15, 1).translate(0, 1.0, 0);
    const geo = mergeGeos([{ g: torso }, { g: head, c: rgbOf('#e8b996') }]);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    mat.onBeforeCompile = (s) => {
      s.uniforms.uTime = WORLD.crowdU.uTime; s.uniforms.uCrowd = WORLD.crowdU.uCrowd;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uCrowd;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
          float up = max(0.0, sin(uTime * (5.0 + ph * 4.0) + ph * 40.0));
          transformed.y += up * uCrowd * (0.18 + 0.4 * ph) + sin(uTime * 1.3 + ph * 30.0) * 0.015;`);
    };
    const SECT = 14, pts = [], GREY = new THREE.Color(0x777788);
    for (let k = 0; k < SECT; k++) pts.push([]);
    for (let i = 1; i < N_ROWS(); i++) {
      const rr0 = standR(i) + 0.5, n = Math.floor(TAU * rr0 / 2.6);
      for (let j = 0; j < n; j++) {
        if (rg() < 0.08) continue;
        const a = (j + (i % 2) * 0.5 + (rg() - 0.5) * 0.3) / n * TAU;
        pts[Math.floor((((a % TAU) + TAU) % TAU) / TAU * SECT) % SECT].push([Math.cos(a) * rr0, standH(i) + 0.05, Math.sin(a) * rr0, -a, i]);
      }
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();
    for (const list of pts) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((p, k) => {
        const s = 1.45 + rg() * 0.55;
        e.set(0, p[3] - Math.PI / 2, 0); q.setFromEuler(e); sv.set(s, s * (0.9 + rg() * 0.3), s); pv.set(p[0], p[1], p[2]);
        m4.compose(pv, q, sv); im.setMatrixAt(k, m4);
        col.set(CROWD[(rg() * CROWD.length) | 0]); col.lerp(GREY, 0.28).multiplyScalar((0.62 - p[4] / N_ROWS() * 0.3) * (0.55 + rg() * 0.5)); im.setColorAt(k, col);
      });
      grp.add(im);
    }
  }
  /* flags on the stands */
  {
    const fg = new THREE.PlaneGeometry(2.2, 1.4, 8, 1); fg.translate(1.1, 0.7, 0);
    const fm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    fm.onBeforeCompile = (s) => {
      s.uniforms.uTime = WORLD.crowdU.uTime; s.uniforms.uCrowd = WORLD.crowdU.uCrowd;
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uCrowd;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph2 = fract(sin(dot(instanceMatrix[3].xz, vec2(4.1, 17.3))) * 9421.7);
          transformed.z += sin(position.x * 3.2 - uTime * (4.0 + uCrowd * 5.0) + ph2 * 6.0) * 0.28 * position.x;
          transformed.y += sin(position.x * 2.0 - uTime * 3.0 + ph2) * 0.06 * position.x;`);
    };
    const n = 46, fl = new THREE.InstancedMesh(fg, fm, n), pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 4).translate(0, 1.7, 0), new THREE.MeshBasicMaterial({ color: 0xdddddd }), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const i = 6 + Math.floor(rg() * 17), a = rg() * TAU, rr0 = standR(i) + 0.8;
      pv.set(Math.cos(a) * rr0, standH(i), Math.sin(a) * rr0); e.set(0, -a + Math.PI / 2 + (rg() - 0.5), 0); q.setFromEuler(e);
      m4.compose(pv, q, sv); fl.setMatrixAt(k, m4);
      m4.compose(pv, q.identity(), sv); pole.setMatrixAt(k, m4);
      col.set(CROWD[(rg() * CROWD.length) | 0]); fl.setColorAt(k, col);
    }
    // flags sit at the top of their poles
    for (let k = 0; k < n; k++) { fl.getMatrixAt(k, m4); m4.elements[13] += 2.4; fl.setMatrixAt(k, m4); }
    fl.frustumCulled = false; pole.frustumCulled = false; grp.add(fl); grp.add(pole);
  }
  /* camera flashes in the crowd */
  {
    const n = 110, p = new Float32Array(n * 3), sd = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const i = 3 + Math.floor(rg() * 20), a = rg() * TAU, rr0 = standR(i) + 0.4;
      p[k * 3] = Math.cos(a) * rr0; p[k * 3 + 1] = standH(i) + 1.3; p[k * 3 + 2] = Math.sin(a) * rr0; sd[k] = rg();
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(p, 3)); gg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: WORLD.flashU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float aSeed; uniform float uTime; uniform float uAmt; varying float vA; void main(){ float f = step(1.0 - uAmt, fract(sin(floor(uTime*8.0)*91.7 + aSeed*437.0)*43758.5453)); vA = f; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = f*clamp(900.0/(-mv.z), 2.0, 7.0); }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if (vA < 0.5 || d > 0.5) discard; gl_FragColor = vec4(1.0,0.97,0.88,(1.0-d*2.0)); }',
    });
    const pts = new THREE.Points(gg, mat); pts.frustumCulled = false; grp.add(pts);
  }

  /* floodlight towers */
  {
    const lampTex = ctex(256, 128, (g, w, h) => {
      g.fillStyle = '#10141d'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { const gr = g.createRadialGradient(18 + x * 30, 18 + y * 30, 1, 18 + x * 30, 18 + y * 30, 14); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#fff7dc'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(x * 30 + 2, y * 30 + 2, 32, 32); }
    });
    const glowTex = ctex(128, 128, (g, w, h) => radial(g, w, h, [[0, 'rgba(255,248,225,0.95)'], [0.18, 'rgba(255,240,205,0.5)'], [0.5, 'rgba(255,235,190,0.12)'], [1, 'rgba(255,235,190,0)']]), { mip: false });
    R3.glowTex = glowTex;
    const rT = standR(N_ROWS()) + 16, hT = 64;
    for (let k = 0; k < 6; k++) {
      const a = [24, 90, 156, 204, 270, 336][k] * D2R, x = Math.sin(a) * rT, z = -Math.cos(a) * rT;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.5, hT, 8), new THREE.MeshStandardMaterial({ color: 0x2a303c, roughness: 0.6, metalness: 0.4 }));
      pole.position.set(x, hT / 2, z); grp.add(pole);
      const head = new THREE.Mesh(new THREE.PlaneGeometry(17, 8.5), new THREE.MeshBasicMaterial({ map: lampTex, side: THREE.DoubleSide, fog: false }));
      head.position.set(x * 0.985, hT + 2, z * 0.985); head.lookAt(0, hT * 0.55, 0); grp.add(head);
      const back = new THREE.Mesh(new THREE.BoxGeometry(17.6, 9, 0.6), new THREE.MeshStandardMaterial({ color: 0x151922 }));
      back.position.copy(head.position).multiplyScalar(1.004); back.position.y = head.position.y; back.lookAt(0, hT * 0.55, 0); grp.add(back);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
      sp.position.copy(head.position); sp.position.multiplyScalar(0.98); sp.position.y = head.position.y; sp.scale.set(95, 95, 1); grp.add(sp);
    }
  }
  R3.world = grp;
}
function N_ROWS() { return STAND.n; }

/* ====================================================================== 3D: people */
// Every person is a handful of instanced shapes (one draw call per kind of part
// for everybody on the field) posed by a small joint rig: legs and arms are
// two-bone IK, the spine leans and twists, and every limb is a stretched capsule
// laid between two joints.
const NP = 14, P_BAT = 0, P_NON = 1, P_UMP = 2, P_BOWL = 3, P_FLD = 4;
const PPL = { m: {}, st: [], blob: null, tag: null, tagKey: '', bats: [] };
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m4 = new THREE.Matrix4();
const bodyM = new THREE.Matrix4(), _mR = new THREE.Matrix4();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
const KITS = {
  bat: { shirt: '#e8892b', pants: '#f1f1ea', hat: '#1a2a4a', shoe: '#f1f1ec', pad: true, glove: '#f6f6f1', gs: 1.45, hatS: 1.12 },
  fld: { shirt: '#1c72bd', pants: '#15264a', hat: '#0e1c3a', shoe: '#e9e9e4', pad: false, glove: null, gs: 1, hatS: 1 },
  keep: { shirt: '#e5c52e', pants: '#15264a', hat: '#0e1c3a', shoe: '#e9e9e4', pad: true, glove: '#efe3c2', gs: 2.1, hatS: 1 },
  ump: { shirt: '#e8e6de', pants: '#26262c', hat: '#16161a', shoe: '#1a1a1a', pad: false, glove: null, gs: 1, hatS: 1.55 },
};
const SKINS = ['#c58c62', '#a8714a', '#e0b28a', '#8a5a3a', '#d29a70', '#b97d55', '#7a4c30', '#e4b894', '#c08a60', '#9a6540', '#d8a47a', '#b07a52', '#a06c48', '#cf9a70'];

function lathe(pts, seg) { return new THREE.LatheGeometry(pts.map((a) => new THREE.Vector2(a[0], a[1])), seg); }

function buildPeople() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.68, metalness: 0 });
  const matHat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1, vertexColors: true });
  const limbP = [[0, -0.5], [0.55, -0.46], [0.86, -0.36], [1, -0.2], [1, 0.2], [0.86, 0.36], [0.55, 0.46], [0, 0.5]];
  const dome = new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, Math.PI / 2).scale(0.135, 0.125, 0.14);
  const peak = new THREE.BoxGeometry(0.17, 0.014, 0.13).translate(0, 0.012, 0.145);
  const geos = {
    torso: lathe([[0, -0.5], [0.8, -0.5], [0.84, -0.2], [0.95, 0.12], [1, 0.3], [0.8, 0.46], [0, 0.5]], 10),
    pelvis: lathe(limbP, 10), head: lathe([[0, -0.5], [0.6, -0.46], [0.92, -0.3], [1, -0.05], [0.95, 0.2], [0.7, 0.42], [0, 0.5]], 10),
    hat: mergeGeos([{ g: dome, c: [1, 1, 1] }, { g: peak, c: [0.75, 0.75, 0.78] }]),
    uarm: lathe(limbP, 7), farm: lathe(limbP, 7), thigh: lathe(limbP, 8), shin: lathe(limbP, 8),
    hand: new THREE.SphereGeometry(1, 7, 5), shoe: new THREE.BoxGeometry(0.1, 0.075, 0.27), pad: new THREE.BoxGeometry(1, 1, 1),
  };
  const cnt = { torso: 1, pelvis: 1, head: 1, hat: 1, uarm: 2, farm: 2, thigh: 2, shin: 2, hand: 2, shoe: 2, pad: 2 };
  for (const k in geos) {
    const im = new THREE.InstancedMesh(geos[k], k === 'hat' ? matHat : mat, NP * cnt[k]);
    im.frustumCulled = false; im.castShadow = true; im.receiveShadow = false;
    for (let i = 0; i < im.count; i++) { im.setMatrixAt(i, HIDE); im.setColorAt(i, new THREE.Color(1, 1, 1)); }
    PPL.m[k] = im; R3.scene.add(im);
  }
  for (let i = 0; i < NP; i++) {
    PPL.st.push({
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, lean: 0, twist: 0, look: 0, vis: false, kit: '', phase: 0, speed: 0, px: null, pz: 0, tx: 0, tz: 0, face: 0, gs: 1, pad: false,
      fl: [new THREE.Vector3(0.11, 0.08, 0), new THREE.Vector3(-0.11, 0.08, 0)],
      ht: [new THREE.Vector3(0.24, 0.9, 0.1), new THREE.Vector3(-0.24, 0.9, 0.1)],
      hw: [new THREE.Vector3(), new THREE.Vector3()], useW: [false, false], pw: [new THREE.Vector3(), new THREE.Vector3()], usePW: [false, false],
      sh: [new THREE.Vector3(), new THREE.Vector3()], wr: [new THREE.Vector3(), new THREE.Vector3()], head: new THREE.Vector3(), hatS: 1, skin: SKINS[i % SKINS.length],
    });
  }
  // blob shadows keep everybody planted, even outside the shadow map
  const blobTex = ctex(64, 64, (g, w, h) => radial(g, w, h, [[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]), { mip: false });
  PPL.blob = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), NP + 2);
  PPL.blob.frustumCulled = false; PPL.blob.renderOrder = 5; R3.scene.add(PPL.blob);
  // bats
  const bg = mergeGeos([
    { g: new THREE.CylinderGeometry(0.017, 0.019, 0.27, 8).translate(0, 0.015, 0), c: rgbOf('#17171b') },
    { g: new THREE.BoxGeometry(0.07, 0.1, 0.036).translate(0, -0.15, 0), c: rgbOf('#d6b57c') },
    { g: new THREE.BoxGeometry(0.108, 0.68, 0.048).translate(0, -0.49, 0), c: rgbOf('#dcbd88') },
    { g: new THREE.BoxGeometry(0.086, 0.6, 0.012).translate(0, -0.5, 0.028), c: rgbOf('#f1dba8') },
    { g: new THREE.BoxGeometry(0.108, 0.05, 0.05).translate(0, -0.82, 0), c: rgbOf('#7a5430') },
  ]);
  const bm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
  for (let k = 0; k < 2; k++) { const m = new THREE.Mesh(bg, bm); m.castShadow = true; m.frustumCulled = false; m.matrixAutoUpdate = false; m.visible = false; R3.scene.add(m); PPL.bats.push(m); }
  // name and number on the batter's back
  PPL.tag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  PPL.tag.matrixAutoUpdate = false; PPL.tag.frustumCulled = false; PPL.tag.visible = false; R3.scene.add(PPL.tag);
  for (let i = 0; i < NP; i++) dress(i, i === P_BAT || i === P_NON ? 'bat' : i === P_UMP ? 'ump' : i === P_FLD ? 'keep' : 'fld');
}

function tagFor(name) {
  if (PPL.tagKey === name) return;
  PPL.tagKey = name;
  const parts = name.split(' '), sur = (parts[parts.length - 1] || name).toUpperCase();
  let n = 0; for (let i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) % 97;
  const t = ctex(256, 180, (g, w, h) => {
    g.fillStyle = 'rgba(20,32,60,0.82)'; g.beginPath(); g.roundRect ? g.roundRect(4, 4, w - 8, h - 8, 18) : g.rect(4, 4, w - 8, h - 8); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff6e6';
    g.font = '800 44px Inter, system-ui, sans-serif'; g.fillText(sur, w / 2, 38, w - 12);
    g.font = '800 110px Inter, system-ui, sans-serif'; g.fillText(String(n + 3), w / 2, 118);
  }, { mip: false });
  if (PPL.tag.material.map) PPL.tag.material.map.dispose();
  PPL.tag.material.map = t; PPL.tag.material.needsUpdate = true;
}

function dress(i, kitName) {
  const p = PPL.st[i], k = KITS[kitName];
  if (p.kit === kitName) return;
  p.kit = kitName; p.pad = k.pad; p.gs = k.gs; p.hatS = k.hatS;
  const set = (name, idx, col) => { const im = PPL.m[name]; im.setColorAt(idx, new THREE.Color(col)); im.instanceColor.needsUpdate = true; };
  set('torso', i, k.shirt); set('pelvis', i, k.pants); set('head', i, p.skin); set('hat', i, k.hat);
  for (let s = 0; s < 2; s++) {
    set('uarm', i * 2 + s, k.shirt); set('farm', i * 2 + s, p.skin); set('hand', i * 2 + s, k.glove || p.skin);
    set('thigh', i * 2 + s, k.pants); set('shin', i * 2 + s, k.pants); set('shoe', i * 2 + s, k.shoe); set('pad', i * 2 + s, '#f6f6f1');
  }
}

function segMat(mesh, idx, A, B, sx, sz, hint) {
  _y.subVectors(B, A); const len = _y.length();
  if (len < 1e-5) { mesh.setMatrixAt(idx, HIDE); return; }
  _y.multiplyScalar(1 / len);
  _z.copy(hint); _z.addScaledVector(_y, -_z.dot(_y));
  if (_z.lengthSq() < 1e-6) { _z.set(0, 0, 1); _z.addScaledVector(_y, -_y.z); if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0); }
  _z.normalize(); _x.crossVectors(_y, _z);
  const e = _m4.elements;
  e[0] = _x.x * sx; e[1] = _x.y * sx; e[2] = _x.z * sx; e[3] = 0;
  e[4] = _y.x * len; e[5] = _y.y * len; e[6] = _y.z * len; e[7] = 0;
  e[8] = _z.x * sz; e[9] = _z.y * sz; e[10] = _z.z * sz; e[11] = 0;
  e[12] = (A.x + B.x) * 0.5; e[13] = (A.y + B.y) * 0.5; e[14] = (A.z + B.z) * 0.5; e[15] = 1;
  mesh.setMatrixAt(idx, _m4);
}
function basisMat(mesh, idx, pos, xa, ya, za, sx, sy, sz) {
  const e = _m4.elements;
  e[0] = xa.x * sx; e[1] = xa.y * sx; e[2] = xa.z * sx; e[3] = 0;
  e[4] = ya.x * sy; e[5] = ya.y * sy; e[6] = ya.z * sy; e[7] = 0;
  e[8] = za.x * sz; e[9] = za.y * sz; e[10] = za.z * sz; e[11] = 0;
  e[12] = pos.x; e[13] = pos.y; e[14] = pos.z; e[15] = 1;
  mesh.setMatrixAt(idx, _m4);
}

// two-bone IK: the middle joint for a root, a target and a bend hint
function ik2(A, T, l1, l2, pole, outMid, outEnd) {
  _a.subVectors(T, A); let d = _a.length();
  if (d < 1e-5) { _a.set(0, -1, 0); d = 1e-5; } else _a.multiplyScalar(1 / d);
  const dm = Math.min(d, l1 + l2 - 0.002);
  const along = (l1 * l1 - l2 * l2 + dm * dm) / (2 * dm);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  _b.copy(pole); _b.addScaledVector(_a, -_b.dot(_a));
  if (_b.lengthSq() < 1e-6) _b.set(0, 0, 1).addScaledVector(_a, -_a.z);
  _b.normalize();
  outMid.copy(A).addScaledVector(_a, along).addScaledVector(_b, h);
  outEnd.copy(A).addScaledVector(_a, dm);
}

const RIG = { hip: [new THREE.Vector3(), new THREE.Vector3()], knee: [new THREE.Vector3(), new THREE.Vector3()], ank: [new THREE.Vector3(), new THREE.Vector3()], elb: [new THREE.Vector3(), new THREE.Vector3()], fw: new THREE.Vector3(), lf: new THREE.Vector3(), up: new THREE.Vector3(), neck: new THREE.Vector3(), cl: new THREE.Vector3(), cf: new THREE.Vector3(), sd: new THREE.Vector3(), hu: new THREE.Vector3(), hf: new THREE.Vector3(), hx: new THREE.Vector3(), pole: new THREE.Vector3(), T: new THREE.Vector3(), M: new THREE.Vector3(), E: new THREE.Vector3() };

function toWorld(x, y, z, out) { return out.set(x, y, z).applyMatrix4(bodyM); }

// Joint positions only (used to plan reaches); fills p.sh, p.head.
function rigJoints(p) {
  bodyM.makeRotationY(p.yaw); if (p.pitch) { _mR.makeRotationX(p.pitch); bodyM.multiply(_mR); }
  bodyM.setPosition(p.x, p.y, p.z);
  const R = RIG, hipY = 0.93 - p.crouch, lc = Math.cos(p.lean), ls = Math.sin(p.lean);
  toWorld(0, hipY + lc * 0.54, ls * 0.54, R.neck);
  const tc = Math.cos(p.twist), ts = Math.sin(p.twist);
  R.cl.set(tc, 0, -ts).transformDirection(bodyM);
  R.sd.set(0, lc, ls).transformDirection(bodyM);
  for (let s = 0; s < 2; s++) p.sh[s].copy(R.neck).addScaledVector(R.cl, SIDE[s] * 0.21).addScaledVector(R.sd, -0.06);
  p.head.copy(R.neck).addScaledVector(R.sd, 0.2);
}

function rigPerson(i, p) {
  const R = RIG, M = PPL.m;
  if (!p.vis) {
    for (const k in M) { const c = k === 'torso' || k === 'pelvis' || k === 'head' || k === 'hat' ? 1 : 2; for (let s = 0; s < c; s++) M[k].setMatrixAt(i * c + s, HIDE); }
    PPL.blob.setMatrixAt(i, HIDE);
    return;
  }
  rigJoints(p);
  const hipY = 0.93 - p.crouch, lc = Math.cos(p.lean), ls = Math.sin(p.lean);
  R.fw.set(0, 0, 1).transformDirection(bodyM); R.lf.set(1, 0, 0).transformDirection(bodyM); R.up.set(0, 1, 0).transformDirection(bodyM);
  // trunk
  toWorld(0, hipY - 0.1, 0, _c); toWorld(0, hipY + 0.1, 0, _d);
  segMat(M.pelvis, i, _c, _d, 0.2, 0.145, R.fw);
  toWorld(0, hipY + 0.04, 0, _c);
  R.cf.crossVectors(R.cl, R.sd).normalize();
  segMat(M.torso, i, _c, R.neck, 0.235, 0.15, R.cf);
  // head and hat
  const hl = p.twist + p.look, hlc = Math.cos(p.lean * 0.45), hls = Math.sin(p.lean * 0.45);
  R.hu.set(0, hlc, hls).transformDirection(bodyM);
  R.hf.set(Math.sin(hl), 0, Math.cos(hl)).transformDirection(bodyM);
  R.hx.crossVectors(R.hu, R.hf).normalize(); R.hf.crossVectors(R.hx, R.hu).normalize();
  _c.copy(p.head).addScaledVector(R.hu, -0.12); _d.copy(p.head).addScaledVector(R.hu, 0.125);
  segMat(M.head, i, _c, _d, 0.1, 0.112, R.hf);
  _c.copy(p.head).addScaledVector(R.hu, 0.02);
  basisMat(M.hat, i, _c, R.hx, R.hu, R.hf, p.hatS, p.hatS, p.hatS);
  // legs
  for (let s = 0; s < 2; s++) {
    toWorld(SIDE[s] * 0.1, hipY - 0.03, 0, R.hip[s]);
    if (p.usePW[s]) R.T.copy(p.pw[s]); else toWorld(p.fl[s].x, p.fl[s].y, p.fl[s].z, R.T);
    R.pole.copy(R.fw).addScaledVector(R.lf, SIDE[s] * -0.12);
    ik2(R.hip[s], R.T, 0.47, 0.47, R.pole, R.knee[s], R.ank[s]);
    segMat(M.thigh, i * 2 + s, R.hip[s], R.knee[s], 0.078, 0.078, R.fw);
    segMat(M.shin, i * 2 + s, R.knee[s], R.ank[s], 0.055, 0.055, R.fw);
    if (p.pad) { _c.subVectors(R.knee[s], R.ank[s]).normalize(); _d.copy(R.knee[s]).addScaledVector(_c, 0.0); _e.copy(R.ank[s]).addScaledVector(_c, 0.05); segMat(M.pad, i * 2 + s, _d, _e, 0.13, 0.09, R.fw); } else M.pad.setMatrixAt(i * 2 + s, HIDE);
    _c.copy(R.ank[s]).addScaledVector(R.fw, 0.06).addScaledVector(R.up, -0.035);
    basisMat(M.shoe, i * 2 + s, _c, R.lf, R.up, R.fw, 1, 1, 1);
  }
  // arms
  for (let s = 0; s < 2; s++) {
    if (p.useW[s]) R.T.copy(p.hw[s]); else toWorld(p.ht[s].x, p.ht[s].y, p.ht[s].z, R.T);
    R.pole.set(0, 0, 0).addScaledVector(R.fw, -0.7).addScaledVector(R.lf, SIDE[s] * 0.5).addScaledVector(R.up, -0.25);
    ik2(p.sh[s], R.T, 0.3, 0.28, R.pole, R.elb[s], p.wr[s]);
    segMat(M.uarm, i * 2 + s, p.sh[s], R.elb[s], 0.055, 0.055, R.fw);
    segMat(M.farm, i * 2 + s, R.elb[s], p.wr[s], 0.043, 0.043, R.fw);
    _c.subVectors(p.wr[s], R.elb[s]).normalize(); _d.copy(p.wr[s]).addScaledVector(_c, 0.045);
    const hs = 0.05 * p.gs;
    basisMat(M.hand, i * 2 + s, _d, AX, AY, AZ, hs, hs, hs);
  }
  // soft shadow on the grass
  const bs = 0.62 + p.crouch * 0.3 + Math.abs(p.pitch) * 0.9;
  _m4.makeScale(bs, 1, bs).setPosition(p.x + Math.sin(p.yaw) * Math.abs(p.pitch) * 0.7, 0.02, p.z + Math.cos(p.yaw) * Math.abs(p.pitch) * 0.7);
  PPL.blob.setMatrixAt(i, _m4);
}

function flushPeople() {
  for (const k in PPL.m) { PPL.m[k].instanceMatrix.needsUpdate = true; if (PPL.m[k].instanceColor) PPL.m[k].instanceColor.needsUpdate = true; }
  PPL.blob.instanceMatrix.needsUpdate = true;
}

// A bat laid along a direction (grip to toe) with its face toward fdir.
function placeBat(k, grip, bdir, fdir) {
  const m = PPL.bats[k]; m.visible = true;
  _y.copy(bdir).multiplyScalar(-1);
  _z.copy(fdir); _z.addScaledVector(_y, -_z.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, -1);
  _z.normalize(); _x.crossVectors(_y, _z);
  m.matrix.makeBasis(_x, _y, _z).setPosition(grip);
  m.matrixWorldNeedsUpdate = true; m.matrixWorld.copy(m.matrix);
}


/* ====================================================================== 3D: poses */
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const SHIRT_BAT = '#e8892b', SHIRT_FLD = '#1c6fb5';
const BASE_BAT = new THREE.Vector3(-0.45, 0, HALF - HITZ);
const BW = new THREE.Vector3(); // the ball in world space, this frame
const BALL = { vis: false, mode: 'none', held: false };

function resetPose(p) {
  p.y = 0; p.pitch = 0; p.crouch = 0; p.lean = 0.05; p.twist = 0; p.look = 0;
  p.usePW[0] = p.usePW[1] = false; p.useW[0] = p.useW[1] = false;
  p.fl[0].set(0.11, 0.08, 0); p.fl[1].set(-0.11, 0.08, 0);
  p.ht[0].set(0.26, 0.82, 0.04); p.ht[1].set(-0.26, 0.82, 0.04);
}
function shLocal(p, s, out) {
  const lc = Math.cos(p.lean), ls = Math.sin(p.lean), hipY = 0.93 - p.crouch, tc = Math.cos(p.twist), ts = Math.sin(p.twist);
  return out.set(SIDE[s] * 0.21 * tc, hipY + lc * 0.54 - 0.06 * lc, ls * 0.54 - SIDE[s] * 0.21 * ts - 0.06 * ls);
}
function faceTo(p, tx, tz, dt, rate) {
  const want = Math.atan2(tx - p.x, tz - p.z);
  p.yaw += wrapA(want - p.yaw) * (rate ? 1 - Math.exp(-rate * dt) : 1);
}
function ready(p, t, depth) {
  const d = depth == null ? 1 : depth;
  p.crouch = 0.12 * d + Math.sin(t * 1.7 + p.skin.length) * 0.008; p.lean = 0.12 + 0.24 * d;
  p.fl[0].set(0.2, 0.08, 0.04); p.fl[1].set(-0.2, 0.08, -0.04);
  p.ht[0].set(0.2, 0.64 - p.crouch * 0.6, 0.24 + 0.1 * d); p.ht[1].set(-0.2, 0.64 - p.crouch * 0.6, 0.24 + 0.1 * d);
}
function runPose(p, v, dt) {
  const s = clamp(v / 6.2, 0, 1.3), q = Math.min(1, s * 1.6);
  if (s > 0.04) p.phase += v * dt * 2.3;
  p.crouch = 0.05 * q; p.lean = 0.06 + 0.3 * Math.min(1, s);
  for (let k = 0; k < 2; k++) {
    const o = p.phase + (k ? Math.PI : 0), sn = Math.sin(o), cs = Math.cos(o), a = -sn * 0.55 * s;
    p.fl[k].set(SIDE[k] * 0.1, 0.08 + Math.max(0, cs) * 0.3 * q, sn * 0.44 * s);
    p.ht[k].set(SIDE[k] * 0.23, 0.97 - 0.1 * s + Math.max(0, a) * 0.2, a);
  }
  p.y = Math.abs(Math.sin(p.phase)) * 0.035 * s;
}
function standStill(p, t) {
  p.crouch = 0; p.lean = 0.05 + Math.sin(t * 1.3 + p.skin.length) * 0.01;
  p.fl[0].set(0.13, 0.08, 0.02); p.fl[1].set(-0.13, 0.08, -0.02);
  p.ht[0].set(0.27, 0.8, 0.04); p.ht[1].set(-0.27, 0.8, 0.04);
}
const _hv = new THREE.Vector3(), _hv2 = new THREE.Vector3(), _hv3 = new THREE.Vector3();
const FDIR = new THREE.Vector3();

/* ---------------------------------------------------------------- the batter */
const BAT_POSE = {
  grip: new THREE.Vector3(), bdir: new THREE.Vector3(), sx: 0, sz: 0, crouch: 0, lean: 0, twist: 0, step: 0, look: 0,
};
const BP0 = { grip: new THREE.Vector3(), bdir: new THREE.Vector3(), sx: 0, sz: 0, crouch: 0, lean: 0, twist: 0, step: 0 };
const BRest = { grip: new THREE.Vector3(-0.3, 0.62, HALF - HITZ - 0.3), bdir: new THREE.Vector3(0.12, -0.8, -0.58).normalize() };
const BLift = { grip: new THREE.Vector3(-0.4, 1.1, HALF - HITZ + 0.1), bdir: new THREE.Vector3(0.12, 0.84, 0.52).normalize() };
const STANCE_TW = -0.95;

function stanceParams(o, bl, t) {
  o.grip.lerpVectors(BRest.grip, BLift.grip, bl); o.bdir.lerpVectors(BRest.bdir, BLift.bdir, bl).normalize();
  o.sx = 0; o.sz = 0; o.crouch = 0.1 + 0.03 * bl + Math.sin(t * 2.1) * 0.006; o.lean = 0.4 - 0.06 * bl; o.twist = STANCE_TW; o.step = 0;
}

// Plan the whole swing the moment it starts: where the bat meets the ball, how the body gets there.
function prepSwing(sw) {
  const D = G.D, s = sw.s;
  ballAt(D, sw.contactAt);
  const cpx = clamp(BX, -1.1, 1.15), cpy = clamp(BY, 0.12, 1.85), cpz = clamp(BZ, 0.7, 1.9);
  sw.cp = new THREE.Vector3(cpx, cpy, HALF - cpz); sw.cpBat = [cpx, cpy, cpz];
  sw.ballBat = [BX, BY, BZ];
  const ap = clamp(s.ang * D2R * 0.85, -1.75, 1.75);
  sw.f = new THREE.Vector3(Math.sin(ap), 0, -Math.cos(ap));
  const gy = clamp(cpy + 0.46, 0.8, 1.4);
  let phiC = Math.acos(clamp((gy - cpy) / 0.58, -1, 1));
  phiC += s.loft ? 0.2 : (s.id === 'defend' ? 0.05 : -0.06);
  sw.bdirC = new THREE.Vector3().copy(sw.f).multiplyScalar(Math.sin(phiC)).add(new THREE.Vector3(0, -Math.cos(phiC), 0)).normalize();
  sw.gripC = new THREE.Vector3().copy(sw.cp).addScaledVector(sw.bdirC, -0.58);
  const phiF = s.id === 'defend' ? phiC : (s.id === 'cut' || s.id === 'pull' || s.id === 'hook' || s.id === 'upcut' || s.id === 'slog' || s.id === 'flick' || s.id === 'glance' || s.id === 'dab') ? 2.3 : 2.95;
  const af = ap * (s.id === 'defend' ? 1 : 1.25);
  sw.fF = new THREE.Vector3(Math.sin(af), 0, -Math.cos(af));
  sw.bdirF = new THREE.Vector3().copy(sw.fF).multiplyScalar(Math.sin(phiF)).add(new THREE.Vector3(0, -Math.cos(phiF), 0)).normalize();
  // where the bat is when the swing starts
  const bl = sstep(-G.runupDur * 0.6, -0.05, G.tb);
  stanceParams(BP0, bl, G.clock);
  sw.g0 = BP0.grip.clone(); sw.d0 = BP0.bdir.clone();
  // the body: step, crouch and lean until the shoulders can reach the grip
  const p = PPL.st[P_BAT];
  const back = D.zb > 6.7 ? -0.22 : 0, fwd = D.zb < 4.6 ? 0.5 : D.zb < 6.7 ? 0.3 : 0;
  let sx = 0, sz = (s.id === 'defend' ? 0.25 : fwd) + back, cr = 0.1, ln = 0.4;
  p.yaw = Math.PI; p.pitch = 0; p.y = 0;
  const tw = clamp(-ap * 0.9, -1.35, 1.35);
  for (let it = 0; it < 7; it++) {
    p.x = BASE_BAT.x + sx; p.z = BASE_BAT.z - sz; p.crouch = cr; p.lean = ln; p.twist = tw;
    rigJoints(p);
    _hv.addVectors(p.sh[0], p.sh[1]).multiplyScalar(0.5); _hv.subVectors(sw.gripC, _hv);
    const dist = _hv.length();
    if (dist < 0.5) break;
    sx = clamp(sx + _hv.x * 0.6, -0.9, 0.9); sz = clamp(sz - _hv.z * 0.6, -0.6, 0.75);
    if (_hv.y < -0.3) { cr = Math.min(0.46, cr + 0.06); ln = Math.min(1.05, ln + 0.08); }
  }
  sw.body = { sx, sz, cr, ln, tw };
  const tw2 = tw + (s.dx < 0 ? 0.45 : -0.2);
  sw.twF = clamp(tw2, -1.5, 1.5);
  sw.gripF = new THREE.Vector3().copy(sw.gripC).addScaledVector(sw.fF, s.id === 'defend' ? 0.02 : 0.28);
  sw.gripF.y += s.id === 'defend' ? 0.02 : 0.5;
  sw.stance = { x0: BASE_BAT.x, z0: BASE_BAT.z };
  sw.lastBat = [BP0.sx, BP0.sz];
}

function swingParams(o, sw) {
  const LAG = SWING_LAG, DUR = SWING_DUR, t = sw.t;
  const b = sw.body;
  if (t < LAG) {
    const u = t / LAG, e = u * u * (3 - 2 * u);
    const e2 = Math.pow(u, 1.5);
    o.grip.lerpVectors(sw.g0, sw.gripC, e); o.bdir.lerpVectors(sw.d0, sw.bdirC, e2).normalize();
    o.sx = b.sx * e; o.sz = b.sz * e; o.crouch = lerp(0.1, b.cr, e); o.lean = lerp(0.4, b.ln, e); o.twist = lerp(STANCE_TW, b.tw, e); o.step = e;
  } else {
    const u = clamp((t - LAG) / (DUR - LAG), 0, 1), e = 1 - (1 - u) * (1 - u);
    o.grip.lerpVectors(sw.gripC, sw.gripF, e); o.bdir.lerpVectors(sw.bdirC, sw.bdirF, e).normalize();
    o.sx = b.sx; o.sz = b.sz; o.crouch = lerp(b.cr, b.cr * 0.5, e); o.lean = lerp(b.ln, b.ln * 0.5, e); o.twist = lerp(b.tw, sw.twF, e); o.step = 1;
  }
}

function poseBatter(p, dt) {
  const o = BAT_POSE;
  const sw = G.swing;
  resetPose(p);
  const bl = G.phase === 'runup' || G.phase === 'delivery' ? sstep(-G.runupDur * 0.6, -0.05, G.tb) : 0.0;
  if (!sw) {
    stanceParams(o, G.phase === 'result' ? lerp(1, 0, sstep(0.1, 0.8, G.resultT)) : bl, G.clock);
  } else {
    swingParams(o, sw);
    if (G.phase === 'result' && G.view === 'bat') {
      const rec = sstep(0.25, 1.1, G.resultT);
      if (rec > 0) {
        stanceParams(BP0, 0, G.clock);
        o.grip.lerp(BP0.grip, rec); o.bdir.lerp(BP0.bdir, rec).normalize(); o.sx = lerp(o.sx, 0, rec); o.sz = lerp(o.sz, 0, rec);
        o.crouch = lerp(o.crouch, BP0.crouch, rec); o.lean = lerp(o.lean, BP0.lean, rec); o.twist = lerp(o.twist, BP0.twist, rec);
      }
    }
  }
  p.yaw = Math.PI; p.x = BASE_BAT.x + o.sx; p.z = BASE_BAT.z - o.sz;
  p.crouch = o.crouch; p.lean = o.lean; p.twist = o.twist; p.look = -o.twist;
  // feet stay planted: the back foot where it was, the front foot steps toward the shot
  const st = o.step;
  p.pw[1].set(BASE_BAT.x + 0.19, 0.08, BASE_BAT.z + 0.02);
  const sdx = sw ? clamp(sw.s.dx, -1, 1) : 0, sdy = sw ? sw.body.sz : 0;
  p.pw[0].set(BASE_BAT.x - 0.19 + st * (sdx * 0.35 + 0.0), 0.08 + (st > 0 && st < 1 ? 0.04 : 0), BASE_BAT.z - 0.02 - st * Math.max(0, sdy) * 0.9 + (sw && sw.body.sz < 0 ? st * 0.15 : 0));
  p.usePW[0] = p.usePW[1] = true;
  // hands on the handle: the lower hand at the grip, the upper just above it
  p.hw[1].copy(o.grip); p.hw[0].copy(o.grip).addScaledVector(o.bdir, -0.12);
  p.useW[0] = p.useW[1] = true;
  BAT_POSE.fdir = sw ? (sw.t < SWING_LAG ? sw.f : sw.fF) : null;
}

function drawBatterBat() {
  const o = BAT_POSE;
  _hv.set(0, 0, -1);
  if (G.swing) _hv.copy(G.swing.t < SWING_LAG ? G.swing.f : G.swing.fF);
  placeBat(0, o.grip, o.bdir, _hv);
}

/* ---------------------------------------------------------------- the bowler */
function poseBowler(p, dt) {
  const D = G.D, bw = G.bowler; if (!D || !bw) { p.vis = false; return; }
  const tb = G.tb, arm = bw.arm, pace = bw.pace;
  const run = pace ? 13 : 5.5, zRel = pace ? 18.5 : 18.2;
  resetPose(p); p.vis = true;
  const hs = arm > 0 ? 1 : 0, os = 1 - hs;
  let z, bound = 0;
  if (tb < 0) {
    const s = clamp(1 + tb / G.runupDur, 0, 1);
    z = zRel + run * (1 - Math.pow(s, 1.25));
    const v = (run / G.runupDur) * 1.25 * Math.pow(s, 0.25) * (1 - s) ** 0.25;
    const sp = pace ? 8.5 : 5.2;
    p.phase = G.runupDur * s * (pace ? 24 : 16);
    runPose(p, tb < -0.34 ? sp : sp * 0.6, 0);
    p.lean += 0.04; p.y = Math.abs(Math.sin(p.phase)) * 0.045;
    void v;
    bound = Math.sin(Math.PI * clamp((tb + 0.3) / 0.32, 0, 1));
  } else {
    z = zRel - 3.2 * (1 - Math.exp(-tb * 2.2));
    const rl = clamp(tb / 0.9, 0, 1);
    p.phase += 0; runPose(p, lerp(4.5, 0, sstep(0.2, 1.1, tb)), 0);
    p.lean = lerp(0.85, 0.12, sstep(0.1, 1.0, tb)); p.crouch = lerp(0.18, 0, sstep(0.2, 1.0, tb));
    void rl;
  }
  const bodyX = -0.23 * arm + (tb < 0 ? 0 : -arm * 0.5 * (1 - Math.exp(-tb * 2)));
  p.x = bodyX; p.z = HALF - z; p.yaw = 0;
  if (tb < 0) { p.yaw = lerp(0.25 * -arm, 0, sstep(-0.5, -0.05, tb)); }
  p.y += bound * 0.26;
  if (bound > 0.02) { // the bound: front knee up, back leg trailing
    p.fl[os].set(SIDE[os] * 0.1, 0.55 * bound + 0.08, 0.3 * bound); p.fl[hs].set(SIDE[hs] * 0.1, 0.1 + 0.2 * bound, -0.3 * bound);
    p.lean = 0.2 + 0.18 * bound;
  }
  p.twist = tb < 0 ? lerp(-arm * 0.7, 0, sstep(-0.45, -0.02, tb)) : lerp(0, arm * 0.2, sstep(0, 0.4, tb));
  // arms: the bowling arm goes over in a circle and lets go exactly where the ball starts
  const sh = shLocal(p, hs, _hv2), L = 0.56;
  const u = clamp((tb + 0.4) / 0.4, 0, 1);
  const alpha = tb < 0 ? lerp(0.35, 2.85, u * u) : lerp(2.85, 5.6, clamp(tb / 0.35, 0, 1));
  p.ht[hs].set(sh.x + SIDE[hs] * 0.04, sh.y - Math.cos(alpha) * L, sh.z + Math.sin(alpha) * L);
  // the hand at the instant of release is the ball
  const relW = _hv3.set(D.x0, D.y0, HALF - D.z0);
  if (tb > -0.16 && tb < 0.1) {
    const w = tb < 0 ? sstep(-0.16, 0, tb) : 1 - sstep(0, 0.1, tb);
    p.hw[hs].copy(relW); p.useW[hs] = true;
    if (w < 1) { toWorld0(p.ht[hs], _hv); p.hw[hs].copy(_hv).lerp(relW, w); }
  }
  const sh2 = shLocal(p, os, _hv2);
  const k = sstep(-0.4, 0.05, tb);
  p.ht[os].set(sh2.x + SIDE[os] * 0.02, sh2.y + lerp(0.25, -0.38, k), sh2.z + lerp(0.38, 0.12, k));
  // stay out of the batter's way afterward
  p.vis = true;
}
// local pose point to world for a body not yet rigged this frame
function toWorld0(l, out) {
  const p = PPL.st[P_BOWL];
  bodyM.makeRotationY(p.yaw); bodyM.setPosition(p.x, p.y, p.z);
  return out.copy(l).applyMatrix4(bodyM);
}

/* ---------------------------------------------------------------- the others */
function poseUmpire(p) {
  resetPose(p); standStill(p, G.clock);
  p.x = 0.95; p.z = HALF - 21.8; p.yaw = 0;
  const sig = G.signal, t = G.signalT;
  if (!sig) return;
  if (sig === 'out') { if (t > 0.15) p.ht[1].set(-0.12, 2.0, 0.05); }
  else if (sig === 'six') { p.ht[0].set(0.14, 2.0, 0.05); p.ht[1].set(-0.14, 2.0, 0.05); }
  else if (sig === 'four') { p.ht[1].set(-0.28 + Math.sin(t * 9) * 0.3, 1.5, 0.28); }
  else if (sig === 'wide') { p.ht[0].set(0.62, 1.38, 0); p.ht[1].set(-0.62, 1.38, 0); }
}

function poseNonStriker(p, dt) {
  resetPose(p); standStill(p, G.clock);
  p.x = 1.75; p.z = HALF - 19.3; p.yaw = 0.55; p.lean = 0.2; p.crouch = 0.05;
  p.ht[1].set(-0.22, 0.7, 0.3);
}

function poseFieldersBat(dt) {
  const fp = G.fieldPos; if (!fp) return;
  for (let i = 0; i < 10; i++) {
    const p = PPL.st[P_FLD + i], e = fp[i]; if (!e) { p.vis = false; continue; }
    p.vis = true; resetPose(p);
    p.x = e[1]; p.z = -e[2];
    ready(p, G.clock, i === 0 ? 1.9 : i === 1 ? 1.5 : 0.8);
    faceTo(p, 0, BASE_BAT.z, 0, 0);
    if (i === 0) { p.ht[0].set(0.15, 0.4, 0.42); p.ht[1].set(-0.15, 0.4, 0.42); p.crouch = 0.4; p.lean = 0.65; p.fl[0].set(0.2, 0.08, 0.05); p.fl[1].set(-0.2, 0.08, -0.05); }
    p.px = null;
  }
}

// Hands go to the ball when it comes close enough to be caught or picked up.
function reachBall(p, bx, by, bz) {
  const dx = bx - p.x, dz = bz - p.z, d = Math.hypot(dx, dz);
  if (d > 1.9 || by > 2.8) return false;
  _hv.set(bx, by, bz);
  p.hw[0].copy(_hv).x += 0.05; p.hw[1].copy(_hv).x -= 0.05;
  p.useW[0] = p.useW[1] = true;
  if (by < 0.6) { p.crouch = Math.max(p.crouch, 0.42); p.lean = Math.max(p.lean, 0.85); }
  else if (by > 1.7) { p.lean = 0.0; }
  return true;
}

const RUNNERS = [{ x: -0.7 }, { x: 0.7 }];
function poseField(dt) {
  const t = FS.t, hotC = FS.col, hotK = FS.catcher;
  // ball in world space
  fieldBall(t);
  F2W(FBX, FBY + 0.036, FBZ, BW);
  // fielders
  for (let j = 0; j < FL.length; j++) {
    const f = FL[j], pi = j < 10 ? P_FLD + j : P_BOWL, p = PPL.st[pi];
    p.vis = true; resetPose(p);
    fpos(f, t);
    const nx = FPX, nz = -FPZ;
    const v = p.px == null ? 0 : Math.hypot(nx - p.px, nz - p.pz) / Math.max(dt, 1e-3);
    if (v > 0.5) { const want = Math.atan2(nx - p.px, nz - p.pz); p.yaw += wrapA(want - p.yaw) * (1 - Math.exp(-12 * dt)); }
    else faceTo(p, BW.x, BW.z, dt, 5);
    p.px = nx; p.pz = nz; p.x = nx; p.z = nz;
    if (v > 0.5) runPose(p, Math.min(v, 9), dt); else ready(p, G.clock, j === 0 ? 1.5 : 0.7);
    // pick up, catch, throw
    if (f === hotC && FS.fate === 'field') {
      const tc = FS.tC;
      const dive = FS.pickSpd >= 15 && !FS.dropped && FS.col && j !== 10 && (G.view === 'field');
      if (dive && t > tc - 0.42 && t < tc + 1.0) {
        const u = clamp((t - (tc - 0.42)) / 0.42, 0, 1), rec = sstep(tc + 0.45, tc + 1.0, t);
        const w = sstep(0, 1, u) * (1 - rec);
        _hv.set(BW.x - p.x, 0, BW.z - p.z); if (_hv.lengthSq() > 0.01) p.yaw = Math.atan2(_hv.x, _hv.z);
        p.pitch = 1.3 * w; p.crouch = 0; p.lean = 0;
        p.ht[0].set(0.16, 1.75, 0.0); p.ht[1].set(-0.16, 1.75, 0.0);
        p.fl[0].set(0.1, 0.1, -0.1); p.fl[1].set(-0.1, 0.1, -0.1);
        p.x += Math.sin(p.yaw) * 1.5 * w; p.z += Math.cos(p.yaw) * 1.5 * w;
        if (w > 0.05) { p.useW[0] = p.useW[1] = false; }
      }
    }
    if (FS.thr && f === hotC && FS.relDone) {
      const t0 = FS.thr.t0, u = clamp((t - (t0 - 0.32)) / 0.32, 0, 1);
      if (t > t0 - 0.32 && t < t0 + 0.4) {
        const out = clamp((t - t0) / 0.4, 0, 1);
        _hv.set(RUNNERS[0].x, 0, 0);
        p.useW[0] = p.useW[1] = false;
        p.ht[1].set(lerp(-0.34, -0.14, u) , lerp(1.35, 1.78, u) - out * 1.0, lerp(-0.5, 0.55, u));
        p.ht[0].set(0.25, 1.15, 0.3);
        p.twist = lerp(0.9, -0.5, u); p.lean = lerp(0.1, 0.4, u); p.look = -p.twist * 0.6;
        const tx = FS.thr.ex, tz = -FS.thr.ez; p.yaw = Math.atan2(tx - p.x, tz - p.z);
      }
    } else if (hotK && f === hotK && FS.fate === 'caught' && t >= FS.tFate - 0.2) {
      // the catcher keeps the ball
    }
    if (!(p.pitch > 0.05)) {
      if (!(FS.thr && f === hotC && t > FS.thr.t0 - 0.32 && t < FS.thr.t0 + 0.4)) {
        const held = (f === hotC && FS.fate === 'field' && t >= FS.tC) || (f === hotK && t >= FS.tFate - 0.25);
        if (held || reachBall(p, BW.x, BW.y, BW.z)) { reachBall(p, BW.x, held ? Math.max(0.5, BW.y) : BW.y, BW.z); if (held && BW.y < 0.3) { p.crouch = 0.3; p.lean = 0.7; } }
      }
    }
  }
  // batters
  batterPos(t);
  const pos = [BP.sz, BP.nz];
  const p0 = PPL.st[P_BAT], p1 = PPL.st[P_NON];
  for (let k = 0; k < 2; k++) {
    const p = k ? p1 : p0; resetPose(p); p.vis = true;
    const zf = pos[k] * (8.9 / HALF);
    const nx = RUNNERS[k].x, nz = -zf;
    const v = p.px == null ? 0 : Math.hypot(nx - p.px, nz - p.pz) / Math.max(dt, 1e-3);
    if (v > 0.8) { const want = Math.atan2(nx - p.px, nz - p.pz); p.yaw += wrapA(want - p.yaw) * (1 - Math.exp(-12 * dt)); }
    p.px = nx; p.pz = nz; p.x = nx; p.z = nz;
    if (v > 0.8) runPose(p, Math.min(v, 8.5), dt); else { standStill(p, G.clock); p.lean = 0.15; if (k === 0 && p.yaw === 0) p.yaw = Math.PI; }
    p.ht[1].set(-0.2, 0.74, 0.18);
  }
}

/* ====================================================================== 3D: effects, ball, stumps */
const kick = (v) => { if (arc && !arc.reducedMotion) arc.shake = Math.max(arc.shake || 0, v * 18); };

class FxPool {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 3);
    this.sz = new Float32Array(max); this.al = new Float32Array(max); this.life = new Float32Array(max); this.age = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.fade = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.p, 3); this.aC = new THREE.BufferAttribute(this.c, 3); this.aS = new THREE.BufferAttribute(this.sz, 1); this.aA = new THREE.BufferAttribute(this.al, 1);
    this.aP.setUsage(THREE.DynamicDrawUsage); this.aC.setUsage(THREE.DynamicDrawUsage); this.aS.setUsage(THREE.DynamicDrawUsage); this.aA.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('aCol', this.aC); g.setAttribute('aSize', this.aS); g.setAttribute('aAlpha', this.aA);
    g.setDrawRange(0, 0);
    this.u = { uK: { value: 700 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec3 aCol; attribute float aSize; attribute float aAlpha; uniform float uK; varying vec3 vC; varying float vA; void main(){ vC=aCol; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=max(1.6, aSize*uK/max(0.5,-mv.z)); }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0) discard; float a=vA*(1.0-d*d); gl_FragColor=vec4(vC,a); }',
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 8;
    R3.scene.add(this.pts);
  }
  add(x, y, z, vx, vy, vz, life, size, col, alpha, grav, drag) {
    if (this.n >= this.max) { const k = (Math.random() * this.max) | 0; this.kill(k); }
    const i = this.n++, j = i * 3;
    this.p[j] = x; this.p[j + 1] = y; this.p[j + 2] = z; this.v[j] = vx; this.v[j + 1] = vy; this.v[j + 2] = vz;
    this.c[j] = col.r; this.c[j + 1] = col.g; this.c[j + 2] = col.b;
    this.sz[i] = size; this.al[i] = alpha; this.life[i] = life; this.age[i] = 0; this.grav[i] = grav || 0; this.drag[i] = drag == null ? 1 : drag; this.fade[i] = alpha;
  }
  kill(i) {
    const l = --this.n; if (i === l) return;
    const a = i * 3, b = l * 3;
    for (let k = 0; k < 3; k++) { this.p[a + k] = this.p[b + k]; this.v[a + k] = this.v[b + k]; this.c[a + k] = this.c[b + k]; }
    this.sz[i] = this.sz[l]; this.al[i] = this.al[l]; this.life[i] = this.life[l]; this.age[i] = this.age[l]; this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l]; this.fade[i] = this.fade[l];
  }
  step(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) { this.kill(i); continue; }
      const j = i * 3, dr = Math.pow(this.drag[i], dt * 60);
      this.v[j] *= dr; this.v[j + 2] *= dr; this.v[j + 1] = this.v[j + 1] * dr - this.grav[i] * dt;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.02 && this.grav[i] > 0) { this.p[j + 1] = 0.02; this.v[j + 1] *= -0.25; this.v[j] *= 0.7; this.v[j + 2] *= 0.7; }
      const u = this.age[i] / this.life[i];
      this.al[i] = this.fade[i] * (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9);
    }
    this.pts.geometry.setDrawRange(0, this.n);
    this.aP.needsUpdate = this.aC.needsUpdate = this.aS.needsUpdate = this.aA.needsUpdate = true;
  }
  clear() { this.n = 0; this.pts.geometry.setDrawRange(0, 0); }
}
const FX = { add: null, norm: null };
const _col = new THREE.Color();
const colOf = (c) => _col.set(c);
function clearFx() { if (FX.add) { FX.add.clear(); FX.norm.clear(); } }
function spawnSparks(x, y, zb, n, col) {
  if (!FX.add) return;
  const c = new THREE.Color(col || '#fff');
  for (let i = 0; i < n; i++) FX.add.add(x, y, HALF - zb, rr(-2.5, 2.5), rr(0.5, 3.5), rr(-3, 1.5), rr(0.3, 0.6), rr(0.03, 0.06), c, 0.95, 7, 0.98);
}
function spawnDust(x, zb) {
  if (!FX.norm) return;
  const c = new THREE.Color('#cdb48a');
  for (let i = 0; i < 9; i++) FX.norm.add(x + rr(-0.1, 0.1), 0.04, HALF - zb, rr(-0.7, 0.7), rr(0.3, 1.1), rr(-0.6, 0.6), rr(0.4, 0.8), rr(0.1, 0.22), c, 0.5, 1.2, 0.96);
}
function spawnFirework3() {
  if (!FX.add) return;
  const a = rr(0, TAU), rad = rr(95, 130), cx = Math.cos(a) * rad, cz = Math.sin(a) * rad, cy = rr(42, 78);
  const hues = ['#FFB736', '#FF6940', '#fff3c4', '#7fd1ff', '#ff7ab6', '#9dffb0'];
  const c = new THREE.Color(pickOf(hues)), n = arc.reducedMotion ? 14 : 46;
  for (let i = 0; i < n; i++) {
    const u = rr(-1, 1), t = rr(0, TAU), s = Math.sqrt(1 - u * u), sp = rr(10, 22);
    FX.add.add(cx, cy, cz, s * Math.cos(t) * sp, u * sp, s * Math.sin(t) * sp, rr(1.1, 1.9), rr(0.9, 1.7), c, 0.95, 5, 0.965);
  }
  snd.pop(Math.floor(rnd() * 4));
}
function spawnConfetti(n) {
  if (!FX.norm) return;
  const hues = ['#FFB736', '#FF6940', '#ffffff', '#4aa3ff', '#ff7ab6', '#9dffb0'];
  for (let i = 0; i < n; i++) {
    const c = new THREE.Color(pickOf(hues));
    FX.norm.add(rr(-26, 26), rr(14, 22), rr(-28, 26), rr(-1.5, 1.5), rr(-1, 0), rr(-1.5, 1.5), rr(3.5, 5.5), rr(0.14, 0.24), c, 1, 1.4, 0.99);
  }
}

/* ---------------------------------------------------------------- stumps and bails */
const STUMPS = { im: null, bails: null, st: [], rest: [] };
function buildStumps() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xefe3c6, roughness: 0.5 });
  STUMPS.im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.711, 8).translate(0, 0.3555, 0), mat, 6);
  STUMPS.bails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xfff1c9, roughness: 0.5 }), 4);
  for (const im of [STUMPS.im, STUMPS.bails]) { im.castShadow = true; im.frustumCulled = false; R3.scene.add(im); }
  for (let e = 0; e < 2; e++) {
    const Z = e === 0 ? HALF : -HALF;
    for (let i = 0; i < 3; i++) STUMPS.st.push({ rx: (i - 1) * 0.1143, ry: 0, rz: Z, kind: 0 });
    for (let i = 0; i < 2; i++) STUMPS.st.push({ rx: (i ? 0.0572 : -0.0572), ry: 0.7255, rz: Z, kind: 1 });
  }
  resetStumps();
}
function resetStumps() {
  for (const s of STUMPS.st) { s.x = s.rx; s.y = s.ry; s.z = s.rz; s.ax = s.ay = s.az = 0; s.vx = s.vy = s.vz = 0; s.wx = s.wy = s.wz = 0; s.on = false; }
}
function breakStumps3(e) {
  if (!STUMPS.im) return;
  const dir = e === 0 ? 1 : -1;
  for (let k = 0; k < 5; k++) {
    const s = STUMPS.st[e * 5 + k]; s.on = true;
    s.vx = rr(-1.6, 1.6); s.vz = dir * rr(1.2, 4.5); s.wx = rr(-9, 9); s.wy = rr(-4, 4); s.wz = rr(-9, 9);
    if (s.kind === 0) s.vy = rr(1.5, 4.2); else { s.vy = rr(3, 6); s.vz = dir * rr(2, 6); s.wx = rr(-14, 14); }
  }
}
const _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _sv = new THREE.Vector3(1, 1, 1), _pv = new THREE.Vector3(), _mm = new THREE.Matrix4();
function stepStumps(dt) {
  if (!STUMPS.im) return;
  for (let k = 0; k < STUMPS.st.length; k++) {
    const s = STUMPS.st[k];
    if (s.on) {
      s.vy -= GR * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.ax += s.wx * dt; s.ay += s.wy * dt; s.az += s.wz * dt;
      const floor = s.kind === 0 ? 0.02 : 0.011;
      if (s.y < floor) { s.y = floor; s.vy *= -0.32; s.vx *= 0.7; s.vz *= 0.7; s.wx *= 0.6; s.wy *= 0.6; s.wz *= 0.6; if (Math.abs(s.vy) < 0.3) { s.vy = 0; s.wx = s.wy = s.wz = 0; s.on = false; s.ax = Math.round(s.ax / 1.57) * 1.57; s.az = Math.round(s.az / 1.57) * 1.57; } }
    }
    _eu.set(s.ax, s.ay, s.az); _q.setFromEuler(_eu); _pv.set(s.x, s.y, s.z);
    _mm.compose(_pv, _q, _sv);
    const e = k < 5 ? 0 : 1, l = k % 5;
    if (l < 3) STUMPS.im.setMatrixAt(e * 3 + l, _mm); else STUMPS.bails.setMatrixAt(e * 2 + l - 3, _mm);
  }
  STUMPS.im.instanceMatrix.needsUpdate = true; STUMPS.bails.instanceMatrix.needsUpdate = true;
}

/* ---------------------------------------------------------------- the ball */
const VB = { mode: 'none', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, dur: 1, p0: [0, 0, 0], p1: [0, 0, 0], h: 0, next: '' };
function resetVisualBall() { VB.mode = 'bowler'; VB.next = ''; G.stumpsHandled = false; }
function freeBall(vx, vy, vz) { VB.mode = 'free'; VB.vx = vx; VB.vy = vy; VB.vz = vz; }
function lerpBall(p1, dur, h, next) { VB.mode = 'lerp'; VB.p0 = [VB.x, VB.y, VB.z]; VB.p1 = p1; VB.t = 0; VB.dur = Math.max(0.05, dur); VB.h = h || 0; VB.next = next || 'held'; }

function updateVB(dt) {
  const D = G.D; if (!D) return;
  if (VB.mode === 'bowler') { if (G.released) VB.mode = 'path'; }
  if (VB.mode === 'path') {
    if (G.view === 'field' && G.phase !== 'runup') { VB.mode = 'none'; return; }
    const tb = G.tb, pass = G.pass, sw = G.swing;
    ballAt(D, Math.min(tb, D.tStump + 0.02));
    VB.x = BX; VB.y = BY; VB.z = BZ;
    if (sw && sw.cpBat && sw.res.type !== 'miss' && !sw.applied) {
      const w = sstep(sw.contactAt - 0.14, sw.contactAt, tb);
      VB.x = lerp(VB.x, sw.cpBat[0], w); VB.y = lerp(VB.y, sw.cpBat[1], w); VB.z = lerp(VB.z, sw.cpBat[2], w);
    }
    if (pass && !G.stumpsHandled) {
      if (pass.kind === 'bowled' && tb >= pass.at) {
        G.stumpsHandled = true;
        if (pass.inside) lerpBall([0, 0.36, 0.02], 0.1, 0, 'free');
        else freeBall(rr(-0.8, 0.8), rr(0.3, 1.3), -rr(2.5, 4.5));
        VB.vx = rr(-0.8, 0.8);
      } else if ((pass.kind === 'pad' || pass.kind === 'body' || pass.kind === 'lbw') && tb >= pass.at) {
        G.stumpsHandled = true;
        freeBall(rr(-1.2, 1.2), rr(1.2, 2.4), rr(0.5, 1.8));
      } else if ((pass.kind === 'keeper' || pass.kind === 'wide') && tb >= D.tStump) {
        G.stumpsHandled = true;
        const k = keeperPos();
        VB.x = D.xS; VB.y = D.yS; VB.z = 0;
        lerpBall([k.x, 0.75, k.zb + 0.35], keeperTime(D), 0.35, 'held');
      }
    }
  } else if (VB.mode === 'lerp') {
    VB.t += dt; const u = clamp(VB.t / VB.dur, 0, 1);
    VB.x = lerp(VB.p0[0], VB.p1[0], u); VB.z = lerp(VB.p0[2], VB.p1[2], u); VB.y = lerp(VB.p0[1], VB.p1[1], u) + 4 * VB.h * u * (1 - u);
    if (u >= 1) { if (VB.next === 'free') freeBall(rr(-0.5, 0.5), 0.8, -rr(1.5, 3)); else VB.mode = 'held'; }
  } else if (VB.mode === 'free') {
    VB.vy -= GR * dt; VB.x += VB.vx * dt; VB.y += VB.vy * dt; VB.z += VB.vz * dt;
    if (VB.y < 0.036) { VB.y = 0.036; if (VB.vy < -0.8) { VB.vy *= -0.42; VB.vx *= 0.7; VB.vz *= 0.7; } else { VB.vy = 0; const f = Math.max(0, 1 - 2.2 * dt); VB.vx *= f; VB.vz *= f; } }
  }
}

/* ---------------------------------------------------------------- the ball mesh and its shadow */
const BALLM = { mesh: null, glow: null, shadow: null, spin: 0 };
function buildBall() {
  const t = ctex(256, 128, (g, w, h) => {
    g.fillStyle = '#f7f1e4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c93d2a'; g.fillRect(0, h * 0.46, w, h * 0.08);
    g.strokeStyle = 'rgba(60,20,10,0.9)'; g.lineWidth = 1.5;
    for (let x = 0; x < w; x += 7) { g.beginPath(); g.moveTo(x, h * 0.4); g.lineTo(x + 3, h * 0.44); g.moveTo(x, h * 0.6); g.lineTo(x + 3, h * 0.56); g.stroke(); }
  });
  BALLM.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, emissive: 0x555048, emissiveIntensity: 0.6 }));
  BALLM.mesh.castShadow = true; BALLM.mesh.visible = false; R3.scene.add(BALLM.mesh);
  BALLM.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: R3.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false }));
  BALLM.glow.visible = false; R3.scene.add(BALLM.glow);
  const bt = ctex(64, 64, (g, w, h) => radial(g, w, h, [[0, 'rgba(0,0,0,0.6)'], [0.7, 'rgba(0,0,0,0.25)'], [1, 'rgba(0,0,0,0)']]), { mip: false });
  BALLM.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
  BALLM.shadow.renderOrder = 6; BALLM.shadow.visible = false; R3.scene.add(BALLM.shadow);
  // the tracker line after a miss
  BALLM.line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xff6940, dashSize: 0.5, gapSize: 0.32, transparent: true, opacity: 0, depthTest: false }));
  BALLM.line.renderOrder = 9; BALLM.line.frustumCulled = false; BALLM.line.visible = false; R3.scene.add(BALLM.line);
  BALLM.lineFor = null;
  // where the ball pitched
  BALLM.ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb736, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  BALLM.ring.renderOrder = 7; BALLM.ring.visible = false; R3.scene.add(BALLM.ring);
  // the hit zone at the crease
  BALLM.zone = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.68, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb736, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  BALLM.zone.position.set(-0.1, 0.02, HALF - HITZ - 0.4); BALLM.zone.scale.set(1.3, 1, 0.8); BALLM.zone.renderOrder = 7; R3.scene.add(BALLM.zone);
}

/* ====================================================================== 3D: cameras and the frame */
const CAM = { pos: new THREE.Vector3(0, 3.2, 17.5), tgt: new THREE.Vector3(0, 1, -7), fov: 36, view: '', dir: new THREE.Vector3(0, 0, -1), snap: true, aspect: 1 };
const dPos = new THREE.Vector3(), dTgt = new THREE.Vector3();
const prevBW = new THREE.Vector3();
let ballSeen = false;

function toScreen(x, y, z) {
  _hv3.set(x, y, z).project(R3.camera);
  if (_hv3.z > 1 || _hv3.z < -1) return null;
  return { x: (_hv3.x + 1) / 2 * arc.w, y: (1 - _hv3.y) / 2 * arc.h };
}
function headScreen() {
  const p = PPL.st[P_BAT], s = toScreen(p.head.x, p.head.y + 0.3, p.head.z);
  return s || { x: arc.w / 2, y: arc.h * 0.5 };
}

function cameraRig(dt) {
  const cam = R3.camera, asp = arc.w / arc.h, portrait = asp < 0.9;
  const fieldView = G.view === 'field' && G.phase !== 'runup' && FL.length > 0 && FS.hit;
  const want = fieldView ? 'chase' : 'bat';
  if (CAM.view !== want) {
    CAM.view = want; CAM.snap = true;
    if (want === 'chase') {
      const phi = (FS.hit.phi || 0) * D2R; CAM.dir.set(Math.sin(phi), 0, -Math.cos(phi)).normalize();
      if (!arc.reducedMotion) G.cutFlash = 1;
    }
  }
  let fov;
  if (want === 'bat') {
    const drift = arc.state === 'menu' || G.attract ? Math.sin(G.clock * 0.25) * 0.35 : 0;
    dPos.set(0.1 + drift, portrait ? 3.5 : 3.15, BASE_BAT.z + (portrait ? 9.4 : 8.3));
    dTgt.set(0.02, portrait ? 0.95 : 1.0, -6.5);
    if (VB.mode === 'path' || VB.mode === 'lerp') dTgt.x += clamp(BW.x, -2, 2) * 0.12;
    fov = portrait ? 55 : 35;
  } else {
    const bx = BW.x, bz = BW.z, by = BW.y;
    _hv.set(bx - BASE_BAT.x, 0, bz - BASE_BAT.z); const d0 = _hv.length();
    if (d0 > 3.5) { _hv.multiplyScalar(1 / d0); CAM.dir.lerp(_hv, CAM.snap ? 1 : 1 - Math.exp(-dt * 2.2)).normalize(); }
    const back = lerp(8.5, 18, clamp(d0 / 55, 0, 1)) * (portrait ? 1.2 : 1);
    const height = 5.4 + back * 0.3 + by * 0.4;
    dPos.set(bx - CAM.dir.x * back, Math.max(4, height), bz - CAM.dir.z * back);
    const rad = Math.hypot(dPos.x, dPos.z); if (rad > 50) { dPos.x *= 50 / rad; dPos.z *= 50 / rad; }
    dTgt.set(bx + CAM.dir.x * 3.5, by * 0.7 + 0.2, bz + CAM.dir.z * 3.5);
    fov = portrait ? 60 : 46;
  }
  const rate = want === 'bat' ? 7 : 4.2, k = CAM.snap ? 1 : 1 - Math.exp(-dt * rate);
  CAM.pos.lerp(dPos, k); CAM.tgt.lerp(dTgt, CAM.snap ? 1 : 1 - Math.exp(-dt * (rate + 2.5)));
  CAM.fov += (fov - CAM.fov) * (CAM.snap ? 1 : 1 - Math.exp(-dt * 3)); CAM.snap = false;
  cam.position.copy(CAM.pos);
  cam.lookAt(CAM.tgt);
  if (arc.shakeX || arc.shakeY) { cam.translateX(arc.shakeX * 0.006); cam.translateY(arc.shakeY * 0.006); }
  if (Math.abs(cam.fov - CAM.fov) > 0.01 || CAM.aspect !== asp) { cam.fov = CAM.fov; cam.aspect = asp; CAM.aspect = asp; cam.updateProjectionMatrix(); }
  const pr = R3.renderer.getPixelRatio(), K = arc.h * pr / (2 * Math.tan(cam.fov * D2R / 2));
  FX.add.u.uK.value = K; FX.norm.u.uK.value = K;
  // sky follows the camera
  R3.sky.position.copy(cam.position);
}

function rigPersonFrame(p) {
  rigJoints(p);
  const R = RIG, hipY = 0.93 - p.crouch;
  R.fw.set(0, 0, 1).transformDirection(bodyM);
  R.cf.crossVectors(R.cl, R.sd).normalize();
  toWorld(0, hipY + 0.04, 0, _c); _a.addVectors(_c, R.neck).multiplyScalar(0.5);
  _a.addScaledVector(R.cf, -0.158).addScaledVector(R.sd, 0.02);
  _z.copy(R.cf).multiplyScalar(-1); _y.copy(R.sd); _x.crossVectors(_y, _z);
  PPL.tag.matrix.makeBasis(_x, _y, _z).setPosition(_a); PPL.tag.matrixWorld.copy(PPL.tag.matrix);
}

function applyQuality() {
  const r = R3.renderer; if (!r) return;
  const f = [0.55, 0.72, 0.88, 1][R3.q];
  r.setPixelRatio(Math.max(0.6, arc.dpr * f)); r.setSize(arc.w, arc.h, false);
  const key = R3.key, want = R3.q >= 3 ? 2048 : 1024;
  key.castShadow = R3.q >= 1;
  if (key.shadow.mapSize.x !== want) { key.shadow.mapSize.set(want, want); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
}

function frame3D(dt) {
  R3.time += dt;
  const t = R3.time;
  WORLD.crowdU.uTime.value = t; WORLD.crowdU.uCrowd.value = clamp(G.crowd * 1.15, 0, 1) * (arc.reducedMotion ? 0.35 : 1);
  WORLD.flashU.uTime.value = arc.reducedMotion ? 0 : t; WORLD.flashU.uAmt.value = arc.reducedMotion ? 0 : 0.04 + 0.3 * G.crowd;
  WORLD.boardMat.color.setScalar(0.9 + (arc.reducedMotion ? 0 : 0.06 * Math.sin(t * 2.2)));
  const fieldView = G.view === 'field' && G.phase !== 'runup' && FL.length > 0 && FS.hit;

  /* the ball */
  let showBall = false;
  if (fieldView) {
    // poseField computes BW (and the fielders); read it first for the camera
  } else {
    switch (VB.mode) {
      case 'path': case 'lerp': case 'free': case 'held': B2W(VB.x, VB.y, VB.z, BW); showBall = true; break;
      case 'bowler': {
        const bw = G.bowler, hs = bw && bw.arm > 0 ? 1 : 0, p = PPL.st[P_BOWL];
        if (bw && G.phase === 'runup') { BW.copy(p.wr[hs]); BW.y += 0.02; showBall = true; }
        break;
      }
      default: break;
    }
  }

  /* people */
  for (let i = 0; i < NP; i++) PPL.st[i].vis = true;
  if (!fieldView) {
    for (const i of [P_BAT, P_NON, P_BOWL]) PPL.st[i].px = null;
    poseFieldersBat(dt);
    poseBatter(PPL.st[P_BAT], dt);
    poseNonStriker(PPL.st[P_NON], dt);
    poseUmpire(PPL.st[P_UMP]);
    poseBowler(PPL.st[P_BOWL], dt);
    // the keeper gathers the ball
    if (showBall && (VB.mode === 'lerp' || VB.mode === 'held') && PPL.st[P_FLD]) {
      const k = PPL.st[P_FLD]; reachBall(k, BW.x, BW.y, BW.z);
    }
  } else {
    poseField(dt);
    poseUmpire(PPL.st[P_UMP]);
    if (G.signal === '' ) PPL.st[P_UMP].vis = true;
    showBall = true;
    // a four stops at the boards; a six goes into the crowd
    const rad = Math.hypot(BW.x, BW.z);
    if (FS.fate === 'boundary' && !FS.six && rad > ROPE + 1.2) { BW.x *= (ROPE + 1.2) / rad; BW.z *= (ROPE + 1.2) / rad; BW.y = Math.min(BW.y, 0.1); }
    if (rad > ROPE + 5 && FS.six) showBall = false;
    if (rad > ROPE + 22) showBall = false;
  }
  for (let i = 0; i < NP; i++) rigPerson(i, PPL.st[i]);
  // the batter's name and number, on the back of the shirt
  {
    const p = PPL.st[P_BAT];
    tagFor(G.batter.name);
    if (p.vis) {
      rigPersonFrame(p);
      PPL.tag.visible = true;
    } else PPL.tag.visible = false;
  }
  flushPeople();
  // bats
  if (!fieldView) {
    drawBatterBat();
    const ns = PPL.st[P_NON]; _hv.copy(ns.wr[1]); _hv2.set(0.05, -0.97, -0.2).normalize(); _hv3.set(0, 0, -1);
    placeBat(1, _hv, _hv2, _hv3);
  } else {
    for (let k = 0; k < 2; k++) {
      const p = PPL.st[k === 0 ? P_BAT : P_NON], mv = p.px != null ? 1 : 0;
      _hv.copy(p.wr[1]); _hv2.set(Math.sin(p.yaw) * 0.35, -0.93, Math.cos(p.yaw) * 0.35).normalize(); _hv3.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      void mv; placeBat(k, _hv, _hv2, _hv3);
    }
  }

  /* ball mesh, glow, shadow, trail */
  const bm = BALLM.mesh;
  if (showBall) {
    const dist = R3.camera.position.distanceTo(BW);
    const sc = Math.max(1, dist * 0.0033 / 0.036);
    bm.visible = true; bm.position.copy(BW); bm.scale.setScalar(sc);
    BALLM.spin += dt * (G.D && G.D.pace ? 26 : 14); bm.rotation.set(BALLM.spin, 0.4, 0.2);
    BALLM.glow.visible = true; BALLM.glow.position.copy(BW); BALLM.glow.scale.setScalar(Math.max(0.35, dist * 0.016));
    BALLM.shadow.visible = true; BALLM.shadow.position.set(BW.x, 0.03, BW.z); const ss = 0.16 + BW.y * 0.03; BALLM.shadow.scale.set(ss, 1, ss); BALLM.shadow.material.opacity = clamp(0.85 - BW.y * 0.04, 0.2, 0.85);
    if (ballSeen) {
      const n = 3, mvd = prevBW.distanceTo(BW);
      if (mvd > 0.01 && mvd < 6) for (let k = 0; k < n; k++) { const u = k / n; FX.add.add(lerp(prevBW.x, BW.x, u), lerp(prevBW.y, BW.y, u), lerp(prevBW.z, BW.z, u), 0, 0, 0, 0.3, 0.05 + dist * 0.003, TRAILC, 0.42, 0, 1); }
    }
    prevBW.copy(BW); ballSeen = true;
  } else { bm.visible = false; BALLM.glow.visible = false; BALLM.shadow.visible = false; ballSeen = false; }

  /* markers and the tracker */
  const age = G.clock - G.marker.t;
  if (G.marker.on && G.cfg.hint && age < 1.3 && !fieldView && !G.attract) {
    const a = 1 - age / 1.3; BALLM.ring.visible = true; B2W(G.marker.x, 0.03, G.marker.z, BALLM.ring.position); BALLM.ring.scale.setScalar(1 + age * 2.2); BALLM.ring.material.opacity = 0.9 * a;
  } else BALLM.ring.visible = false;
  if (G.D && !fieldView && G.phase !== 'result' && G.phase !== 'field' && !G.attract) {
    const near = G.released ? clamp(1 - Math.abs(G.tb + SWING_LAG - G.D.tArr) / 0.35, 0, 1) : 0;
    BALLM.zone.visible = true; BALLM.zone.material.opacity = 0.12 + near * 0.55; BALLM.zone.scale.set(1.3 + near * 0.2, 1, 0.8 + near * 0.1);
  } else BALLM.zone.visible = false;
  updateTracker();

  /* particles */
  FX.add.step(dt); FX.norm.step(dt);

  cameraRig(dt);
  // the light that casts the shadows follows the action
  const kx = fieldView ? clamp(BW.x, -45, 45) : 0, kz = fieldView ? clamp(BW.z, -45, 45) : 0;
  R3.key.target.position.set(kx, 0, kz); R3.key.position.set(kx - 26, 72, kz + 22);

  // quality auto-scale: measure real frame time (not the capped game step)
  if (!R3.lock && arc.state === 'play') {
    R3.accT += R3.realDt; R3.accN++;
    if (R3.accT > 1.3 && R3.accN >= 3) {
      const avg = R3.accT / R3.accN; R3.fps = Math.round(1 / avg);
      if (R3.settle > 0) R3.settle--; else if (avg > 0.03 && R3.q > 0) { R3.q--; applyQuality(); R3.settle = 1; }
      R3.accT = 0; R3.accN = 0;
    }
  }
}
const TRAILC = new THREE.Color('#fff4dc');

function updateTracker() {
  const D = G.D, L = BALLM.line;
  const show = D && G.phase === 'result' && G.view === 'bat' && G.result && !G.attract && G.swing == null;
  if (!show) { L.visible = false; return; }
  if (BALLM.lineFor !== D) {
    BALLM.lineFor = D;
    const pts = [];
    for (let tt = 0; tt <= D.tStump; tt += 0.02) { ballAt(D, tt); pts.push(new THREE.Vector3(BX, BY, HALF - BZ)); }
    L.geometry.dispose(); L.geometry = new THREE.BufferGeometry().setFromPoints(pts); L.computeLineDistances();
  }
  const a = clamp(1 - (G.resultT - 0.2) / 1.0, 0, 1) * clamp(G.resultT / 0.15, 0, 1);
  L.visible = a > 0; L.material.opacity = 0.85 * a;
}

/* ====================================================================== 3D: boot the renderer */
// A software renderer (no graphics chip) gets a lighter start: no multisampling, lower resolution.
function softwareGL() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch (e) { return false; }
}
function initRenderer() {
  try {
    R3.soft = softwareGL();
    const r = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: !R3.soft, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x0b1430, 1);
    R3.renderer = r; R3.aniso = Math.min(8, r.capabilities.getMaxAnisotropy());
    arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
    arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
    R3.q = R3.soft ? 0 : window.matchMedia && matchMedia('(pointer: coarse)').matches ? 2 : 3;
    const q = /[?&]q=(\d)/.exec(location.search); if (q) { R3.q = clamp(+q[1], 0, 3); R3.lock = true; }
    R3.camera = new THREE.PerspectiveCamera(36, arc.w / arc.h, 0.25, 700);
    buildWorld();
    buildPeople();
    FX.add = new FxPool(1400, true); FX.norm = new FxPool(700, false);
    buildStumps(); buildBall();
    R3.scene.add(R3.camera);
    applyQuality();
    R3.ok = true;
  } catch (err) {
    R3.ok = false; R3.fail = String(err && err.message || err);
    try { console.warn('3D unavailable: ' + R3.fail); } catch (e) { /* ignore */ }
  }
}
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


  function drawMini(ctx, Rw) {
    if (G.view !== 'bat' || !G.fieldPos || G.phase === 'result') return;
    const w = arc.w;
    const R = w > 700 ? 52 : 42;
    const cx = w - 10 - Rw / 2, cy = 132 + R + 4;
    const sc = R / (ROPE + 2);
    const X = (x) => cx + x * sc, Y = (z) => cy - z * sc;
    ctx.fillStyle = 'rgba(10,9,7,0.7)'; ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(201,169,110,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
    ctx.fillStyle = '#1f5a2c'; ctx.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 27.4 * sc, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#b79663'; ctx.fillRect(X(-1.5), Y(HALF), 3 * sc, PITCH * sc);
    if (G.D && (G.phase === 'runup' || G.phase === 'delivery' || G.phase === 'shot')) {
      const s = G.swing ? G.swing.s : shotFor(G.dir.dx, G.dir.dy, G.D);
      const wedge = (ang, half, col) => {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(X(0), Y(-HALF));
        for (let k = 0; k <= 4; k++) { const a = (ang - half + (2 * half * k) / 4) * D2R; ctx.lineTo(X(80 * Math.sin(a)), Y(-HALF + 80 * Math.cos(a))); }
        ctx.closePath(); ctx.fill();
      };
      wedge(s.ang, 13, 'rgba(255,183,54,0.38)');
      ctx.strokeStyle = 'rgba(255,183,54,0.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X(0), Y(-HALF)); ctx.lineTo(X(80 * Math.sin(s.ang * D2R)), Y(-HALF + 80 * Math.cos(s.ang * D2R))); ctx.stroke();
    }
    for (const f of G.fieldPos) {
      ctx.fillStyle = f[0] === 'Keeper' ? '#e2c230' : '#4aa3ff';
      ctx.beginPath(); ctx.arc(X(f[1]), Y(f[2]), 2.6, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#4aa3ff'; ctx.beginPath(); ctx.arc(X(3.4), Y(5), 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = SHIRT_BAT; ctx.beginPath(); ctx.arc(X(0), Y(-HALF + 1), 3.2, 0, TAU); ctx.fill();
    ctx.restore();
    txt(ctx, 'FIELD', cx, cy + R + 14, 9, C.dim, 600, 'center', FONT_MONO);
  }

  function drawHUD(ctx) {
    const w = arc.w, h = arc.h;
    const touch = arc.touchMode;
    const Lw = Math.min(244, w * 0.6), Rw = Math.min(176, w - Lw - 28);
    // score plate
    plate(ctx, 10, 8, Lw, 118, 12);
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
    drawChips(ctx, 22, 108, 8);
    // bowler / batter plate
    if (Rw > 90) {
      const rx = w - 10 - Rw;
      plate(ctx, rx, 8, Rw, 118, 12);
      const bw = G.bowler;
      txt(ctx, bw && bw.pace ? 'PACE' : 'SPIN', rx + 12, 25, 10, C.gold, 600, 'left', FONT_MONO);
      txt(ctx, bw ? short(bw.name) : '', rx + 12, 44, 14, C.ink, 700);
      if (G.D && G.released) {
        txt(ctx, G.D.kmh + ' km/h', rx + 12, 62, 14, C.warm, 600, 'left', FONT_MONO);
        txt(ctx, G.D.name, rx + 12, 78, 12, C.dim, 500);
      } else txt(ctx, 'Run-up...', rx + 12, 62, 12, C.dim, 400);
      txt(ctx, short(G.batter.name) + ' ' + G.batter.runs + ' (' + G.batter.balls + ')', rx + 12, 97, 12, C.ink, 600);
    }
    if (Rw > 90) drawMini(ctx, Rw);
    // commentary
    if (G.commentT > 0 && G.comment) {
      const a = clamp(G.commentT / 0.5, 0, 1);
      ctx.globalAlpha = a;
      const cw = Math.min(w - 24, 460), cy = w < 600 ? 222 : Math.max(124, h * 0.14 + 76);
      plate(ctx, (w - cw) / 2, cy, cw, 34, 10, 0.62);
      txt(ctx, G.comment, w / 2, cy + 22, 14, C.ink, 400, 'center', FONT_DISP);
      ctx.globalAlpha = 1;
    }
    // bottom cues
    const by = h - (touch ? (arc.hudPad ? arc.hudPad().bottom : 188) : 54);
    if (G.phase === 'field') {
      if (FS.runPrompt && FS.runPrompt.show && !FS.ended) {
        const m = FS.runPrompt.margin;
        const col = m >= 0.35 ? '#7ddf8a' : m >= -0.15 ? C.warm : '#ff6a55';
        const word = m >= 0.35 ? 'Safe, running anyway' : m >= -0.15 ? 'Risky, tap to push' : 'Very risky';
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
        const gest = touch && arc.touchStyle === 'gesture';
        const msg = gest ? 'Swipe as the ball arrives: up lofts, sideways drives, down defends. Tap to drive' : touch ? 'Hold the stick to pick a shot, tap Bat as the ball arrives' : 'Arrows pick the shot, Space swings as the ball reaches you';
        const mw = Math.min(w - 24, 440);
        plate(ctx, (w - mw) / 2, by - 84, mw, 46, 10, 0.66);
        wrapTxt(ctx, msg, w / 2, by - 63, mw - 24, 15, 12, C.ink);
      }
    }
    // timing floaters
    if (G.view === 'bat') {
      const hs = headScreen();
      for (const f of G.floats) {
        const u = f.t / f.life;
        const fx = clamp(hs.x, 80, w - 80), fy = hs.y - 30 - u * 44;
        ctx.globalAlpha = clamp(1.4 - u * 1.4, 0, 1);
        ctx.font = '800 ' + f.size + 'px ' + FONT_MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 5; ctx.strokeText(f.text, fx, fy);
        ctx.fillStyle = f.color; ctx.fillText(f.text, fx, fy);
        ctx.globalAlpha = 1;
      }
    }
    // the fielder who is going for it
    if (G.view === 'field' && G.phase === 'field' && FS.col && FS.fate === 'field' && !FS.ended) {
      const f = FS.col, p = PPL.st[FL.indexOf(f) < 10 ? P_FLD + FL.indexOf(f) : P_BOWL];
      const sp = toScreen(p.x, 2.35, p.z);
      if (sp && sp.x > 10 && sp.x < w - 10 && sp.y > 130 && sp.y < h - 40) {
        const a = 0.55 + 0.35 * Math.sin(G.clock * 9);
        ctx.fillStyle = 'rgba(255,183,54,' + a + ')';
        ctx.beginPath(); ctx.moveTo(sp.x, sp.y + 8); ctx.lineTo(sp.x - 6, sp.y - 3); ctx.lineTo(sp.x + 6, sp.y - 3); ctx.closePath(); ctx.fill();
        txt(ctx, f.role, sp.x, sp.y - 8, 11, '#fff', 600, 'center', FONT_MONO);
      }
    }
  }
  const SEQ = { fire: 0, murmur: 0 };

  function decay(dt) {
    G.clock += dt;
    G.punch = Math.max(0, G.punch - dt * 3);
    G.flash = Math.max(0, G.flash - dt * 3);
    G.fieldFlash = Math.max(0, (G.fieldFlash || 0) - dt * 2.5);
    G.crowd = Math.max(0, G.crowd - dt * 0.22);
    G.fade = Math.max(0, G.fade - dt * 3.2);
    G.cutFlash = Math.max(0, (G.cutFlash || 0) - dt * 4);
    G.commentT = Math.max(0, G.commentT - dt);
    G.signalT += dt;
    if (G.fireShow > 0) {
      G.fireShow -= dt; SEQ.fire -= dt;
      if (SEQ.fire <= 0 && !G.attract) { spawnFirework3(); SEQ.fire = arc.reducedMotion ? 0.8 : 0.26; }
    }
    if (G.celebrate > 0 && !G.attract) { G.celebrate -= dt; if (!arc.reducedMotion) spawnConfetti(4); }
    const F = G.floats;
    for (let i = F.length - 1; i >= 0; i--) { F[i].t += dt; if (F[i].t > F[i].life) F.splice(i, 1); }
    updateVB(dt);
    stepStumps(dt);
  }

  // Swipes and taps become shots. A swipe's direction picks the shot, the moment it ends is the swing.
  function dirFromSwipe(sw) {
    const a = sw.angle / D2R; // degrees, 0 = right, 90 = down (screen)
    if (a > -22.5 && a <= 40) return { dx: 1, dy: 0 };
    if (a > 40 && a <= 67.5) return { dx: 1, dy: 1 };
    if (a > 67.5 && a <= 112.5) return { dx: 0, dy: 1 };
    if (a > 112.5 && a <= 140) return { dx: -1, dy: 1 };
    if (a > 140 || a <= -157.5) return { dx: -1, dy: 0 };
    if (a > -157.5 && a <= -112.5) return { dx: -1, dy: -1 };
    if (a > -112.5 && a <= -67.5) return { dx: 0, dy: -1 };
    return { dx: 1, dy: -1 };
  }
  let liveSwipe = null;
  function readInput() {
    const inp = arc.input;
    const gest = arc.touchMode && arc.touchStyle === 'gesture';
    const space = inp.hit('Space');
    let press = false, tap = null, swipe = null;
    if (gest) {
      swipe = inp.swipe(); tap = inp.tap();
      const gz = inp.gesture;
      if (gz.active && Math.hypot(gz.dx, gz.dy) > 14) {
        liveSwipe = dirFromSwipe({ angle: Math.atan2(gz.dy, gz.dx) });
        G.dir = liveSwipe;
      } else if (!swipe) { liveSwipe = null; G.dir = decodeDir(inp.axis()); }
      if (swipe) { G.dir = dirFromSwipe(swipe); liveSwipe = null; press = true; }
      else if (tap) { G.dir = { dx: 0, dy: 0 }; press = true; }
      else if (space) press = true;
    } else {
      G.dir = decodeDir(inp.axis());
      press = space || inp.pointer.pressed;
    }
    const run = inp.hit('KeyR', 'ShiftLeft', 'ShiftRight') || !!tap || !!swipe;
    return { press, space, tap: !!tap || (!gest && inp.pointer.pressed), run };
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
        advanceSwing(dt);
        break;
      case 'result':
        G.resultT += dt;
        if (G.view === 'field') { updateField(dt, { run: false }); advanceSwing(dt); }
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
    clearFx(); G.floats.length = 0; G.fireShow = 0; G.celebrate = 0; G.signal = ''; G.fade = 0;
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
        updateField(dt, { run: false }); advanceSwing(dt);
        break;
      case 'result':
        G.resultT += dt;
        if (G.view === 'field') { updateField(dt, { run: false }); advanceSwing(dt); } else if (G.pass) updateBat(dt, { press: false });
        if (G.resultT >= Math.min(G.resultDur, 1.5)) { G.runs = 0; G.wkts = 0; G.balls = 0; G.chips = []; G.over = false; G.fade = 1; startBall(); attractPlan(); }
        break;
      default: break;
    }
  }

  /* ------------------------------------------------------------ small helpers for the 3D build */
  function bowlerPosField() {
    const bw = G.bowler; if (!bw) return [3.4, 5];
    const tb = Math.max(0, G.tb), zRel = bw.pace ? 18.5 : 18.2;
    const z = zRel - 3.2 * (1 - Math.exp(-tb * 2.2)), x = -0.23 * bw.arm + (-bw.arm * 0.5 * (1 - Math.exp(-tb * 2)));
    return [x, z - HALF];
  }
  function advanceSwing(dt) { if (G.swing && G.swing.t < SWING_DUR + 0.2) G.swing.t += dt; }
  function wrapTxt(ctx, text, x, y, maxW, lh, size, color) {
    ctx.font = '500 ' + size + 'px ' + FONT_UI; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const words = text.split(' '); let line = '', yy = y;
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t;
    }
    ctx.fillText(line, x, yy);
  }
  function drawFail(ctx) {
    const w = arc.w, h = arc.h;
    ctx.fillStyle = '#0b1430'; ctx.fillRect(0, 0, w, h);
    wrapTxt(ctx, '3D graphics are not available in this browser, so the stadium cannot be drawn.', w / 2, h * 0.45, Math.min(w - 40, 420), 22, 16, C.ink);
  }

  function render(ctx, a) {
    arc = a;
    const now = performance.now();
    R3.realDt = R3.last ? (now - R3.last) / 1000 : 1 / 60; const dtr = Math.min(0.05, R3.realDt); R3.last = now;
    const w = arc.w, h = arc.h;
    if (!R3.ok) drawFail(ctx);
    else if (!R3.lost) {
      frame3D(dtr);
      R3.renderer.render(R3.scene, R3.camera);
    }
    if (!G.attract && arc.state !== 'menu') drawHUD(ctx);
    if (G.cutFlash > 0.01) { ctx.fillStyle = 'rgba(255,248,230,' + clamp(G.cutFlash, 0, 1) * 0.6 + ')'; ctx.fillRect(0, 0, w, h); }
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
    html: '<p>Floodlights on, crowd roaring, a full 3D stadium. Swipe as the ball reaches the crease: up lofts it, left and right drive along the ground, down defends, and a plain tap is a straight drive. On a keyboard the arrows pick the shot and Space swings. Perfect timing and the right shot for the length clears the rope. After contact, push for the extra run if the field is slow to react.</p>',
    options: OPTIONS,
  };

  function boot() {
    arc = Arcade.create({
      slug: 'super-over', title: 'Super Over', genre: 'Stadium cricket', three: true,
      hint: 'Arrows pick the shot  |  click or Space swings  |  R to run',
      touchHint: 'Stick picks the shot, Bat pad swings, Run pad for the extra',
      keys: [
        ['Left / Right / A D', 'Leg side / off side'],
        ['Up / W', 'Loft it'],
        ['Down / S', 'Defend or play soft'],
        ['Space / click', 'Swing the bat'],
        ['R / Shift', 'Push for a risky run'],
      ],
      mouse: { cursor: 'pointer', keys: [['Click', 'Swing']] },
      gestures: {
        drag: false,
        hint: 'Swipe to play the shot  |  tap to drive',
        keys: [
          ['Swipe up', 'Lofted straight'],
          ['Swipe up-left / up-right', 'Lofted to leg / off'],
          ['Swipe left / right', 'Along the ground to leg / off'],
          ['Swipe down', 'Defend'],
          ['Tap', 'Straight drive'],
          ['Run pad or tap', 'Push for an extra run'],
        ],
      },
      touch: { stick: true, pads: [{ label: 'Run', key: 'KeyR', keep: true }, { label: 'Bat', key: 'Space', big: true, hot: true }] },
      touchKeys: [['On-screen stick', 'Pick the shot'], ['Bat', 'Swing'], ['Run', 'Push for a run']],
      gameKeys: ['KeyR'],
      menu: MENU,
      pauseHtml: () => '<div class="stat"><div>Score<b>' + G.runs + '/' + G.wkts + '</b></div>' + (G.mode === 'nets' ? '' : '<div>Target<b>' + G.target + '</b></div>') + '</div>',
      resize: (a) => {
        if (!R3.renderer) return;
        applyQuality(); R3.camera.aspect = a.w / a.h; R3.camera.updateProjectionMatrix();
      },
      init: (a) => {
        arc = a;
        initRenderer();
        MENU.showKeys = !a.touchMode;
        a.menu();
        startAttract();
      },
      onMenu: () => { if (!G.attract) startAttract(); },
      start: (a, ch) => {
        arc = a;
        resetMatch(ch);
        G.view = 'bat'; G.phase = 'runup'; G.fade = 1; clearFx(); G.fireShow = 0; G.crowd = 0.2;
        startBall();
        R3.accT = 0; R3.accN = 0; R3.settle = 1;
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
        fieldT: FS.t, over: G.over, won: G.won, score: G.finalScore, touchStyle: arc.touchStyle, quality: R3.q, fps: R3.fps || null, webgl: R3.ok,
      };
    };
    window.__superover = { G, FS, RN, DIFFS, SWING_LAG, startSwing, FL: () => FL, R3, CAM, step: (dt) => { update(dt); arc.input.endFrame(); } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
