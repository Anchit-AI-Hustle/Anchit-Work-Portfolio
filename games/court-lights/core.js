/*
 * Court Lights, the shared core: the Floodlight League, its eight clubs and
 * their players, the rules of five-on-five, the team AI, the season and the
 * playoffs, the three-point and dunk contests, the rooftop shootout, the HUD,
 * the commentary and the arcade shell glue. game3d.js (WebGL) and game.js
 * (the 2D fallback) each give a "view" and call boot(view): both play the
 * same game by the same rules.
 *
 * Everything here is original: the league, the clubs, their crests, every
 * player, the arenas and every line of commentary are invented in code.
 *
 * Court coordinates, in metres: x across the floor (-7.5 .. 7.5), z along it
 * (-14 .. 14, a hoop near each end), y up. The rooftop shootout keeps its own
 * older numbers (x across, z toward its one hoop), see SH below.
 */

export const TAU = Math.PI * 2, PI = Math.PI;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, hypot = Math.hypot, sqrt = Math.sqrt;
const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();
const pick = (a) => a[(rnd() * a.length) | 0];
export const F_DISP = 'Fraunces, Times New Roman, serif';
export const F_UI = 'Inter, sans-serif';
export const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
export const INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';

/* ====================================================================== the court */
export const CT = {
  HW: 7.5, HL: 14,          // half width, half length
  HOOP: 12.425,             // rim centre from midcourt
  RIM_Y: 3.05, RIM_R: 0.229, BR: 0.12,
  BOARD: 12.8, BW: 0.915, BY0: 2.9, BY1: 3.95,
  ARC: 6.75, CORNER: 6.6,   // three point line: arc radius, corner distance
  KEYW: 2.45, FT: 8.2,      // half width of the key, free throw line (z)
  CIRC: 1.8,
};
export const GRAV = 9.81;
// a seeded random, so a roster or a schedule is the same every visit
export function srng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/* ====================================================================== the league */
export const LEAGUE = 'Floodlight League';
// emb: the shape on the crest. style: how the club likes to play.
export const TEAMS = [
  { id: 'HER', city: 'Harbour', name: 'Herons', c1: '#1b7f86', c2: '#f3ead8', c3: '#0b3a3f', emb: 'wing', tier: 0.62, style: { pace: 0.55, three: 0.62, pnr: 0.45, zone: 0.25 } },
  { id: 'KIT', city: 'Saffron', name: 'Kites', c1: '#ef8a22', c2: '#1a2340', c3: '#fff2df', emb: 'kite', tier: 0.7, style: { pace: 0.7, three: 0.55, pnr: 0.6, zone: 0.15 } },
  { id: 'OWL', city: 'Monsoon', name: 'Owls', c1: '#3e4f8c', c2: '#cfd7e6', c3: '#151b33', emb: 'moon', tier: 0.5, style: { pace: 0.4, three: 0.45, pnr: 0.35, zone: 0.55 } },
  { id: 'YAK', city: 'Ridge', name: 'Yaks', c1: '#7a1f2b', c2: '#e3b448', c3: '#2c0b10', emb: 'horn', tier: 0.56, style: { pace: 0.35, three: 0.3, pnr: 0.55, zone: 0.3 } },
  { id: 'MAN', city: 'Delta', name: 'Mantas', c1: '#5b2d84', c2: '#3fd0c6', c3: '#1e0d30', emb: 'wave', tier: 0.6, style: { pace: 0.75, three: 0.6, pnr: 0.4, zone: 0.2 } },
  { id: 'MOT', city: 'Lantern', name: 'Moths', c1: '#c3302a', c2: '#f5c34b', c3: '#3a0e0b', emb: 'flame', tier: 0.66, style: { pace: 0.6, three: 0.5, pnr: 0.5, zone: 0.25 } },
  { id: 'PAN', city: 'Quarry', name: 'Pangolins', c1: '#33363b', c2: '#b4dd48', c3: '#121315', emb: 'scale', tier: 0.45, style: { pace: 0.3, three: 0.35, pnr: 0.4, zone: 0.65 } },
  { id: 'PEA', city: 'Cedar', name: 'Peacocks', c1: '#14634b', c2: '#2aa6c8', c3: '#06261c', emb: 'leaf', tier: 0.53, style: { pace: 0.5, three: 0.58, pnr: 0.5, zone: 0.35 } },
];
export const teamName = (t) => t.city + ' ' + t.name;

const FIRST = ['Arjun', 'Kabir', 'Rohan', 'Dev', 'Ishaan', 'Vikram', 'Nikhil', 'Aarav', 'Siddharth', 'Karan', 'Aditya', 'Farhan', 'Imran', 'Zubin', 'Tenzin', 'Lalit', 'Jaspreet', 'Harish', 'Naveen', 'Pranav', 'Yash', 'Omar', 'Theo', 'Marcus', 'Andre', 'Kofi', 'Leon', 'Mateo', 'Kenji', 'Tomas', 'Elias', 'Samir', 'Ravi', 'Ashwin', 'Varun', 'Dhruv', 'Neel', 'Anand', 'Bilal', 'Chetan', 'Irfan', 'Jai', 'Kunal', 'Mohit', 'Rishabh', 'Sahil', 'Tarun', 'Uday', 'Vivaan', 'Zaid', 'Ayaan', 'Rehan', 'Nolan', 'Felix', 'Hugo', 'Amit', 'Gautam', 'Prakash', 'Sunil', 'Manav', 'Akash', 'Raghav', 'Parth', 'Lakshay'];
const LAST = ['Rao', 'Menon', 'Iyer', 'Kapoor', 'Bhatt', 'Nair', 'Pillai', 'Kulkarni', 'Desai', 'Joshi', 'Banerjee', 'Ghosh', 'Sethi', 'Malhotra', 'Chawla', 'Reddy', 'Naidu', 'Shetty', 'Patil', 'Gill', 'Dhillon', 'Mehta', 'Shah', 'Verma', 'Mishra', 'Pandey', 'Mensah', 'Costa', 'Lindqvist', 'Tanaka', 'Moreau', 'Kowalski', 'Haddad', 'Brennan', 'Sarkar', 'Bose', 'Chatterjee', 'Dutta', 'Kamath', 'Hegde', 'Rathore', 'Bajwa', 'Sandhu', 'Fernandes', 'Pinto', 'DSouza', 'Lobo', 'Thapa', 'Gurung', 'Lepcha', 'Bhutia', 'Ahuja', 'Khanna', 'Saxena', 'Tiwari', 'Yadav', 'Rawat'];
const POS = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'C'];
// how each position weighs the ratings into an overall, and its build
const POSW = {
  PG: { sht3: 1.1, shtm: 1, fin: 0.8, dnk: 0.3, pas: 1.4, hdl: 1.4, def: 0.9, stl: 1, blk: 0.2, reb: 0.3, spd: 1.2, h: [1.82, 1.9] },
  SG: { sht3: 1.4, shtm: 1.2, fin: 0.9, dnk: 0.5, pas: 0.8, hdl: 1.1, def: 0.9, stl: 0.9, blk: 0.3, reb: 0.4, spd: 1.1, h: [1.88, 1.96] },
  SF: { sht3: 1, shtm: 1.1, fin: 1, dnk: 0.8, pas: 0.8, hdl: 0.8, def: 1, stl: 0.8, blk: 0.6, reb: 0.7, spd: 1, h: [1.95, 2.02] },
  PF: { sht3: 0.6, shtm: 0.9, fin: 1.1, dnk: 1, pas: 0.6, hdl: 0.5, def: 1, stl: 0.5, blk: 1, reb: 1.2, spd: 0.8, h: [2.0, 2.07] },
  C: { sht3: 0.3, shtm: 0.6, fin: 1.2, dnk: 1.2, pas: 0.5, hdl: 0.3, def: 1.1, stl: 0.4, blk: 1.4, reb: 1.4, spd: 0.6, h: [2.06, 2.14] },
};
POSW.G = POSW.SG; POSW.F = POSW.SF;
const RKEYS = ['sht3', 'shtm', 'fin', 'dnk', 'pas', 'hdl', 'def', 'stl', 'blk', 'reb', 'spd'];

let ROSTERS = null;
// Every club's eight players, the same every visit: names, numbers, positions, heights, ratings and looks.
export function rosters() {
  if (ROSTERS) return ROSTERS;
  ROSTERS = TEAMS.map((t, ti) => {
    const r = srng(hash('floodlight-' + t.id));
    const used = new Set();
    const list = [];
    for (let i = 0; i < 8; i++) {
      const pos = POS[i], w = POSW[pos];
      let first, last;
      do { first = FIRST[(r() * FIRST.length) | 0]; last = LAST[(r() * LAST.length) | 0]; } while (used.has(last));
      used.add(last);
      let num; do { num = (r() * 45) | 0; } while (list.some((p) => p.num === num));
      // starters a touch better than the bench; the club's tier lifts everyone
      const base = 52 + t.tier * 22 + (i < 5 ? 6 : -2) + (r() - 0.5) * 8;
      const rat = {};
      for (const k of RKEYS) rat[k] = clamp(Math.round(base + (w[k] - 0.85) * 22 + (r() - 0.5) * 18), 30, 98);
      const star = i === ((r() * 3) | 0) + 1 ? 1 : 0; // one standout per club
      if (star) for (const k of RKEYS) rat[k] = clamp(rat[k] + 7, 30, 99);
      rat.sta = clamp(Math.round(60 + r() * 35), 50, 99);
      const h = w.h[0] + r() * (w.h[1] - w.h[0]);
      let tot = 0, wt = 0; for (const k of RKEYS) { tot += rat[k] * w[k]; wt += w[k]; }
      list.push({
        id: t.id + '-' + i, team: ti, slot: i, first, last, name: first + ' ' + last, short: last.toUpperCase(),
        num, pos, h: +h.toFixed(2), rat, ovr: Math.round(tot / wt), star,
        seed: hash(t.id + first + last) % 100000,
        sex: 'm', build: pos === 'C' || pos === 'PF' ? (r() < 0.5 ? 'heavy' : 'athletic') : (r() < 0.3 ? 'slim' : 'athletic'),
        hair: pick(['short', 'buzz', 'curly', 'short', 'bald', 'curly', 'long', 'bun']),
      });
    }
    return list;
  });
  return ROSTERS;
}
export const teamOvr = (ti) => { const R = rosters()[ti]; let s = 0; for (let i = 0; i < 8; i++) s += R[i].ovr * (i < 5 ? 1.2 : 0.6); return Math.round(s / (6 + 1.8)); };

/* ====================================================================== storage */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* private mode */ } },
};
export const UNL = { key: 'court-lights.unlocks', get() { return store.get(this.key, {}) || {}; }, set(k) { const u = this.get(); if (u[k]) return false; u[k] = Date.now(); store.set(this.key, u); return true; } };

/* ====================================================================== the season */
// A round robin of the eight clubs (once or twice), then the top four in the playoffs: semi finals
// (1 v 4, 2 v 3) and a final, one game each. Saved after every game.
const SKEY = 'court-lights.season.v1';
function roundRobin(n) {
  const ids = []; for (let i = 0; i < n; i++) ids.push(i);
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) { const a = ids[i], b = ids[n - 1 - i]; games.push(r % 2 ? [a, b] : [b, a]); }
    rounds.push(games);
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}
export const Season = {
  data: null,
  load() { this.data = store.get(SKEY, null); if (this.data && this.data.v !== 1) this.data = null; return this.data; },
  save() { if (this.data) store.set(SKEY, this.data); },
  reset() { this.data = null; store.del(SKEY); },
  create(team, len, diff, qlen) {
    let rounds = roundRobin(8);
    if (len === 14) rounds = rounds.concat(rounds.map((g) => g.map((p) => [p[1], p[0]])));
    this.data = { v: 1, team, len, diff, qlen, round: 0, rounds: rounds.map((g) => g.map((p) => ({ h: p[0], a: p[1], s: null }))), po: null, champ: null, stats: {}, log: [] };
    this.save(); return this.data;
  },
  active() { return this.data && !this.data.champ ? this.data : null; },
  // the user's next game: { home, away, stage }
  next() {
    const d = this.data; if (!d) return null;
    if (d.champ != null) return null;
    if (d.round < d.rounds.length) {
      const g = d.rounds[d.round].find((x) => x.h === d.team || x.a === d.team);
      return { home: g.h, away: g.a, stage: 'Week ' + (d.round + 1) + ' of ' + d.rounds.length };
    }
    if (!d.po) this.startPlayoffs();
    const po = d.po;
    if (po.out) return null;
    const ser = po.stage === 'semi' ? po.semis.find((s) => s.h === d.team || s.a === d.team) : po.final;
    if (!ser) return null;
    return { home: ser.h, away: ser.a, stage: po.stage === 'semi' ? 'Semi final' : 'The Final' };
  },
  table() {
    const d = this.data, T = TEAMS.map((t, i) => ({ i, w: 0, l: 0, pf: 0, pa: 0, strk: '' }));
    if (!d) return T;
    d.rounds.forEach((r) => r.forEach((g) => {
      if (!g.s) return;
      const a = T[g.h], b = T[g.a];
      a.pf += g.s[0]; a.pa += g.s[1]; b.pf += g.s[1]; b.pa += g.s[0];
      if (g.s[0] > g.s[1]) { a.w++; b.l++; a.strk = (a.strk[0] === 'W' ? 'W' + (+a.strk.slice(1) + 1) : 'W1'); b.strk = (b.strk[0] === 'L' ? 'L' + (+b.strk.slice(1) + 1) : 'L1'); }
      else { b.w++; a.l++; b.strk = (b.strk[0] === 'W' ? 'W' + (+b.strk.slice(1) + 1) : 'W1'); a.strk = (a.strk[0] === 'L' ? 'L' + (+a.strk.slice(1) + 1) : 'L1'); }
    }));
    return T.slice().sort((x, y) => (y.w - x.w) || ((y.pf - y.pa) - (x.pf - x.pa)) || (y.pf - x.pf));
  },
  startPlayoffs() {
    const d = this.data, t = this.table();
    d.po = { stage: 'semi', seeds: t.slice(0, 4).map((x) => x.i), semis: [{ h: t[0].i, a: t[3].i, s: null }, { h: t[1].i, a: t[2].i, s: null }], final: null, out: false };
    if (d.po.seeds.indexOf(d.team) < 0) { d.po.out = true; this.simPlayoffs(); }
    this.save();
  },
  // other clubs' games: a score from both rosters, the home floor and a bit of luck
  sim(h, a) {
    const k = clamp((Season.data ? Season.data.qlen : 3) / 3, 0.6, 2.2);
    const oh = teamOvr(h), oa = teamOvr(a);
    const base = 40 * k;
    let sh = Math.round(base + (oh - oa) * 0.45 * k + 1.5 * k + (rnd() - 0.5) * 18 * k);
    let sa = Math.round(base + (oa - oh) * 0.45 * k + (rnd() - 0.5) * 18 * k);
    if (sh === sa) { if (rnd() < 0.5 + (oh - oa) * 0.02) sh += 2 + ((rnd() * 4) | 0); else sa += 2 + ((rnd() * 4) | 0); }
    return [max(14, sh), max(14, sa)];
  },
  simPlayoffs() {
    const po = this.data.po;
    if (po.stage === 'semi') {
      po.semis.forEach((s) => { if (!s.s) s.s = this.sim(s.h, s.a); });
      const w = po.semis.map((s) => (s.s[0] > s.s[1] ? s.h : s.a));
      po.final = { h: w[0], a: w[1], s: null }; po.stage = 'final';
    }
    if (po.stage === 'final' && !po.final.s) { po.final.s = this.sim(po.final.h, po.final.a); this.data.champ = po.final.s[0] > po.final.s[1] ? po.final.h : po.final.a; po.stage = 'done'; }
  },
  // record the user's game; returns a line saying what it meant
  record(home, away, sh, sa, box) {
    const d = this.data; if (!d) return '';
    const won = (home === d.team ? sh > sa : sa > sh);
    if (box) box.forEach((p) => {
      const s = d.stats[p.id] || (d.stats[p.id] = { g: 0, pts: 0, reb: 0, ast: 0 });
      s.g++; s.pts += p.st.pts; s.reb += p.st.reb; s.ast += p.st.ast;
    });
    let note = '';
    if (d.round < d.rounds.length) {
      d.rounds[d.round].forEach((g) => { if (g.h === home && g.a === away) g.s = [sh, sa]; else if (!g.s) g.s = this.sim(g.h, g.a); });
      d.round++;
      if (d.round >= d.rounds.length) { this.startPlayoffs(); note = d.po.out ? 'The regular season is over. Fifth or lower: no playoffs this time.' : 'Playoffs! You are the ' + ['first', 'second', 'third', 'fourth'][d.po.seeds.indexOf(d.team)] + ' seed.'; }
    } else if (d.po) {
      const po = d.po;
      if (po.stage === 'semi') {
        const s = po.semis.find((x) => x.h === home && x.a === away); if (s) s.s = [sh, sa];
        if (!won) { po.out = true; note = 'Knocked out in the semi final.'; this.simPlayoffs(); }
        else { po.semis.forEach((x) => { if (!x.s) x.s = this.sim(x.h, x.a); }); const w = po.semis.map((x) => (x.s[0] > x.s[1] ? x.h : x.a)); po.final = { h: w[0], a: w[1], s: null }; po.stage = 'final'; note = 'Through to the Final!'; }
      } else if (po.stage === 'final') {
        po.final.s = [sh, sa]; d.champ = won ? d.team : (home === d.team ? away : home); po.stage = 'done';
        note = won ? 'Champions of the ' + LEAGUE + '!' : 'Beaten in the Final. So close.';
        if (won) { const ch = store.get('court-lights.titles', []) || []; ch.push({ team: d.team, at: Date.now() }); store.set('court-lights.titles', ch); UNL.set('champion'); }
      }
    }
    d.log.push({ home, away, s: [sh, sa] });
    this.save();
    return note;
  },
};
export const titles = () => store.get('court-lights.titles', []) || [];

/* ====================================================================== the match */
// Difficulty: how good the computer's players are, how fast they react, how wide the user's release window is.
export const DIFF = {
  rookie: { label: 'Rookie', ai: 0.84, react: [0.34, 0.5], win: 0.15, err: 1.6, steal: 0.7 },
  pro: { label: 'Pro', ai: 0.94, react: [0.24, 0.38], win: 0.11, err: 1.15, steal: 0.9 },
  allstar: { label: 'All-Star', ai: 1.02, react: [0.18, 0.3], win: 0.085, err: 0.85, steal: 1.05 },
  legend: { label: 'Legend', ai: 1.1, react: [0.14, 0.24], win: 0.065, err: 0.6, steal: 1.2 },
};
export const ACT = { '': 0, run: 0, shoot: 1, layup: 2, dunk: 3, pass: 4, catch: 5, cross: 6, spin: 7, block: 8, steal: 9, rebound: 10, fall: 11, celebrate: 12, screen: 13, ft: 14, inbound: 15, stumble: 16, tip: 17, hang: 18, slump: 19, sit: 20, defend: 21 };
export const ACTN = Object.keys(ACT).reduce((o, k) => { if (k) o[ACT[k]] = k; return o; }, {});

export const M = {
  kind: 'game', teams: [0, 1], user: 0, ctrl: null, diff: DIFF.pro, qlen: 180,
  side: [[], []], court: [[], []], all: [],
  ball: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, state: 'dead', holder: null, last: null, lastSide: -1, spin: 0, shot: null, pass: null, rimT: 9, boardT: 9, floorT: 9, guide: false, pumpT: 0 },
  phase: 'off', phaseT: 0, q: 1, clock: 0, shot: 24, score: [0, 0], tf: [0, 0], tos: [3, 3], poss: -1, dir: [1, -1],
  front: false, backT: 0, tipWin: -1, next: null, refs: [], events: [], run: { side: -1, pts: 0 }, noise: 0.3, t: 0,
  off: { set: 'motion', t: 0, screener: null, cut: null, cutT: 0 }, def: ['man', 'man'], match: [[], []],
  slow: 0, replay: null, rec: null, intro: null, banner: null, banT: 0, deadWhy: '', clockRun: false, pending: null,
  qScore: [], last3: 0, lead: 0, stats: null, hot: [0, 0],
};
const B = M.ball;
const view = { ev() {}, cam() {} };
let arc = null;
const evt = (type, a, b, c) => { try { view.ev(type, a, b, c); } catch (e) { /* view effects never stop the game */ } };

function newStats() { return { pts: 0, reb: 0, oreb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, to: 0, pf: 0, sec: 0, dnk: 0 }; }
function mkPlayer(info, side, idx) {
  return {
    info, side, idx, court: false, x: 0, z: 0, vx: 0, vz: 0, yaw: 0, y: 0, vy: 0, h: info.h,
    act: '', actT: 0, actD: 0, ad: null, stam: 1, fouls: 0, st: newStats(), hand: 1, dribT: rnd(), picked: false, pvx: 0, pvz: 0,
    slowT: 0, stumT: 0, conf: 0, ai: { think: rnd() * 0.3, tx: 0, tz: 0, spot: null, react: 0, plan: '', crash: false, lane: 0 },
    spd: 0, sprint: false, guard: null, celebT: 0, lookX: 0, lookZ: 0, react: null, scr: 0,
  };
}
export const hoopZ = (side) => M.dir[side] * CT.HOOP;                      // the hoop a side attacks
const ownZ = (side) => -M.dir[side] * CT.HOOP;                              // the hoop a side defends
const distHoop = (p, side) => hypot(p.x, p.z - hoopZ(side == null ? p.side : side));
// a spot given in "metres from the hoop it attacks": x across, d back toward midcourt
function spotZ(side, d) { return M.dir[side] * (CT.HOOP - d); }
export function isThree(x, z, side) {
  const hz = hoopZ(side), dz = abs(z - hz), behind = (z - hz) * M.dir[side] > 0;
  if (dz < 1.42 || behind) return abs(x) >= CT.CORNER - 0.02;
  return hypot(x, z - hz) >= CT.ARC;
}
const inFront = (p, side) => p.z * M.dir[side] > 0; // in that side's frontcourt
const onCourt = (x, z) => abs(x) <= CT.HW && abs(z) <= CT.HL;
const rat = (p, k) => p.info.rat[k] * (p.side === M.user || M.user < 0 ? 1 : M.diff.ai) / 100;
const fatigue = (p) => 0.8 + 0.2 * p.stam;

// Build both clubs for a game: the starting five on the floor, three on the bench.
export function setupTeams(home, away) {
  const R = rosters();
  M.teams = [home, away];
  M.all = [];
  for (let s = 0; s < 2; s++) {
    M.side[s] = R[M.teams[s]].map((info, i) => mkPlayer(info, s, i));
    M.court[s] = M.side[s].slice(0, 5);
    M.side[s].forEach((p, i) => { p.court = i < 5; M.all.push(p); });
  }
  for (let s = 0; s < 2; s++) M.match[s] = M.court[1 - s].slice();
  M.refs = [{ x: -7.9, z: 3, yaw: 0, vx: 0, vz: 0, act: '', actT: 0 }, { x: 7.9, z: -3, yaw: 0, vx: 0, vz: 0, act: '', actT: 0 }];
}
export const courtPlayers = () => M.court[0].concat(M.court[1]);
const opp = (s) => 1 - s;
function nearest(list, x, z, skip) { let best = null, bd = 1e9; for (const p of list) { if (p === skip) continue; const d = hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } } return best; }
function nearestD(list, x, z, skip) { let bd = 1e9; for (const p of list) { if (p === skip) continue; const d = hypot(p.x - x, p.z - z); if (d < bd) bd = d; } return bd; }

/* ---------------------------------------------------------------------- movement */
const RUN = 4.3, SPRINT = 6.7, ACC = 15;
// Steer a player toward a point. Arrives gently, avoids team mates and opponents, is slowed by screens.
function moveTo(p, tx, tz, k, dt, face) {
  if (p.stumT > 0 || p.act === 'fall') { p.vx *= 0.9; p.vz *= 0.9; return; }
  const dx = tx - p.x, dz = tz - p.z, d = hypot(dx, dz);
  const top = (p.sprint && p.stam > 0.08 ? SPRINT : RUN) * (0.82 + 0.3 * p.info.rat.spd / 100) * k * (p === B.holder ? 0.93 : 1) * (0.86 + 0.14 * p.stam) * (p.slowT > 0 ? 0.3 : 1);
  let sp = d > 0.02 ? min(top, d * 3.2) : 0;
  let wx = d > 0.02 ? dx / d * sp : 0, wz = d > 0.02 ? dz / d * sp : 0;
  steer(p, wx, wz, dt, face);
}
function steer(p, wx, wz, dt, face) {
  // keep a body's width from everyone else on the floor
  for (let s = 0; s < 2; s++) for (const o of M.court[s]) {
    if (o === p) continue;
    const ox = p.x - o.x, oz = p.z - o.z, od = ox * ox + oz * oz;
    if (od < 0.36 && od > 1e-6) { const d = sqrt(od), push = (0.6 - d) * 6; wx += ox / d * push; wz += oz / d * push; }
  }
  const a = ACC * dt;
  let ex = wx - p.vx, ez = wz - p.vz; const el = hypot(ex, ez);
  if (el > a) { ex = ex / el * a; ez = ez / el * a; }
  p.vx += ex; p.vz += ez;
  if (face != null) p.yaw = turn(p.yaw, face, dt * 9);
  else if (hypot(p.vx, p.vz) > 0.4) p.yaw = turn(p.yaw, Math.atan2(p.vx, p.vz), dt * 9);
}
function turn(a, b, k) { let d = b - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return a + clamp(d, -k, k); }
const faceTo = (p, x, z) => Math.atan2(x - p.x, z - p.z);
function integrate(p, dt) {
  p.x += p.vx * dt; p.z += p.vz * dt;
  if (p.y > 0 || p.vy > 0) { p.vy -= GRAV * 1.15 * dt; p.y += p.vy * dt; if (p.y <= 0) { p.y = 0; p.vy = 0; evt('land', p); } }
  // everyone stays on the floor and the apron around it
  p.x = clamp(p.x, -CT.HW - 1.4, CT.HW + 1.4); p.z = clamp(p.z, -CT.HL - 1.4, CT.HL + 1.4);
  p.spd = hypot(p.vx, p.vz);
  const run = p.spd / RUN;
  p.stam = clamp(p.stam - dt * (p.sprint && p.spd > 4.5 ? 0.011 : run > 0.5 ? 0.0036 : -0.004) * (1.25 - p.info.rat.sta / 200) * (M.kind === 'game' ? 1 : 0), 0.05, 1);
  if (p.actD > 0) { p.actT += dt; if (p.actT >= p.actD && p.act !== 'hang' && p.act !== 'screen') { p.act = ''; p.actT = 0; p.actD = 0; p.ad = null; } }
  p.slowT = max(0, p.slowT - dt); p.stumT = max(0, p.stumT - dt); p.celebT = max(0, p.celebT - dt);
  p.dribT += dt * (1.6 + p.spd * 0.28);
  p.st.sec += dt;
}
export function setAct(p, act, dur, ad) { p.act = act; p.actT = 0; p.actD = dur; p.ad = ad || null; }

/* ---------------------------------------------------------------------- the ball */
// Where the ball sits in a holder's hands: a dribble at the side, held at the chest, or raised to shoot.
export function handBall(p, out) {
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = fz, rz = -fx;
  const h = p.h / 1.98;
  if (p.act === 'shoot' || p.act === 'ft') {
    const k = p.act === 'ft' ? clamp(p.actT / 0.55, 0, 1) : clamp(p.actT / 0.3, 0, 1);
    out.x = p.x + fx * 0.18 + rx * 0.06; out.z = p.z + fz * 0.18 + rz * 0.06; out.y = p.y + lerp(1.25, 2.25, ease(k)) * h;
  } else if (p.act === 'layup' || p.act === 'dunk' || p.act === 'hang' || p.act === 'rebound' || p.act === 'tip') {
    const k = clamp(p.actT / (p.act === 'dunk' ? 0.4 : 0.35), 0, 1);
    out.x = p.x + fx * (0.25 + k * 0.2) + rx * 0.12; out.z = p.z + fz * (0.25 + k * 0.2) + rz * 0.12; out.y = p.y + lerp(1.3, 2.45, ease(k)) * h;
  } else if (p.picked || p.act === 'catch' || p.act === 'pass' || p.act === 'inbound' || M.phase !== 'live' || p.act === 'celebrate') {
    out.x = p.x + fx * 0.32; out.z = p.z + fz * 0.32; out.y = p.y + 1.18 * h;
  } else {
    // a live dribble: the hand pushes down, the floor sends it back
    const ph = p.dribT % 1, bounce = abs(sin(ph * PI));
    const side = p.hand * (p.act === 'cross' ? lerp(1, -1, ease(p.actT / 0.3)) : 1);
    out.x = p.x + fx * (0.34 + p.spd * 0.05) + rx * side * 0.3; out.z = p.z + fz * (0.34 + p.spd * 0.05) + rz * side * 0.3;
    out.y = CT.BR + bounce * (0.86 * h - CT.BR);
    if (ph < 0.08 && p.act !== 'cross') evt('dribble', p);
  }
  return out;
}
const _hb = { x: 0, y: 0, z: 0 };
function giveBall(p, how) {
  if (B.holder && B.holder !== p) B.holder.picked = false;
  B.state = 'held'; B.holder = p; B.shot = null; B.pass = null; B.guide = false;
  B.last = p; B.lastSide = p.side; p.picked = false; p.pvx = p.x; p.pvz = p.z;
  // an offensive rebound keeps the ball but still resets the shot clock
  if (M.poss !== p.side || how === 'oreb') changePoss(p.side, how);
  if (M.user === p.side && M.kind !== 'c3' && M.kind !== 'dunk') M.ctrl = p;
  evt('catch', p, how);
}
function looseBall(x, y, z, vx, vy, vz) {
  B.state = 'loose'; B.holder = null; B.x = x; B.y = y; B.z = z; B.vx = vx; B.vy = vy; B.vz = vz; B.pass = null; B.shot = null; B.guide = false; B.looseT = 0;
}
// The ball in flight: gravity, the rim, the glass, the floor, the lines.
function stepBall(dt) {
  if (B.state === 'held' && B.holder) { handBall(B.holder, B); return; }
  if (B.state === 'dead' && !B.free) return;
  B.rimT += dt; B.boardT += dt; B.floorT += dt; B.looseT = (B.looseT || 0) + dt;
  const N = 3, h = dt / N;
  for (let i = 0; i < N; i++) {
    const py = B.y;
    if (B.state === 'pass' && B.pass && B.pass.type !== 'bounce' && B.pass.type !== 'lob') { stepPass(h); continue; }
    B.vy -= GRAV * h; B.x += B.vx * h; B.y += B.vy * h; B.z += B.vz * h;
    for (let s = -1; s <= 1; s += 2) {
      const hz = s * CT.HOOP;
      if (abs(B.z - hz) > 1.2) continue;
      if (B.guide && B.shot && B.shot.hz === hz) {
        const k = 1 - Math.exp(-h * 18);
        B.x = lerp(B.x, 0, k); B.z = lerp(B.z, hz, k); B.vx *= 0.88; B.vz *= 0.88;
        if (B.y < CT.RIM_Y - 0.55) { B.guide = false; B.vx = rr(-0.3, 0.3); B.vz = -s * rr(0.3, 0.9); B.vy = min(B.vy, -2.5); }
        continue;
      }
      // the glass
      const bz = s * CT.BOARD;
      if ((B.z - bz) * s > -CT.BR && (B.z - bz) * s < 0.2 && B.y > CT.BY0 - 0.05 && B.y < CT.BY1 + 0.05 && abs(B.x) < CT.BW + 0.05 && B.vz * s > 0) {
        B.z = bz - s * CT.BR; B.vz *= -0.48; B.vx *= 0.82; B.boardT = 0; evt('board', B.x, B.y, s);
      }
      // the rim: a shot that reaches rim height on the way down is decided here
      if (py > CT.RIM_Y && B.y <= CT.RIM_Y && B.vy < 0) {
        const dx = B.x, dz = B.z - hz, d = hypot(dx, dz);
        if (B.shot && !B.shot.done && B.shot.hz === hz) { resolveShot(d, dx, dz, s); }
        else if (d < CT.RIM_R + CT.BR + 0.04 && d > CT.RIM_R - CT.BR - 0.02) rimBounce(dx, dz, d, s, 0.5);
      }
    }
    if (B.y < CT.BR) {
      B.y = CT.BR;
      if (abs(B.vy) > 0.6) { evt('bounce', B.x, B.z, abs(B.vy)); B.floorT = 0; }
      B.vy *= -0.72; B.vx *= 0.86; B.vz *= 0.86;
      if (B.state === 'pass' && B.pass && B.pass.type === 'bounce') B.pass.bounced = true;
      if (abs(B.vy) < 0.4) B.vy = 0;
      if (B.state === 'shot') { B.state = 'loose'; B.looseT = 0; }
      if (!onCourt(B.x, B.z) && (B.state === 'loose' || B.state === 'pass') && M.phase === 'live') { outOfBounds(); return; }
    }
    if ((abs(B.x) > CT.HW + 2.5 || abs(B.z) > CT.HL + 2.5) && (B.state === 'loose' || B.state === 'pass') && M.phase === 'live') { outOfBounds(); return; }
    if (abs(B.x) > CT.HW + 6) { B.x = Math.sign(B.x) * (CT.HW + 6); B.vx *= -0.3; }
    if (abs(B.z) > CT.HL + 6) { B.z = Math.sign(B.z) * (CT.HL + 6); B.vz *= -0.3; }
  }
  if (B.state === 'pass' && B.pass && (B.pass.type === 'bounce' || B.pass.type === 'lob')) passArrival();
}
function rimBounce(dx, dz, d, s, hard) {
  let nx = dx / (d || 1), nz = dz / (d || 1);
  if (d < 0.02) { nx = rr(-1, 1); nz = -s; const l = hypot(nx, nz); nx /= l; nz /= l; }
  const out = rr(1.1, 2.8) * (0.6 + hard);
  B.vx = nx * out + rr(-0.6, 0.6); B.vz = nz * out + rr(-0.6, 0.6); B.vy = abs(B.vy) * rr(0.25, 0.5) + rr(0.6, 2.2);
  B.x = nx * (CT.RIM_R + CT.BR + 0.02); B.z = s * CT.HOOP + nz * (CT.RIM_R + CT.BR + 0.02); B.y = CT.RIM_Y + 0.02;
  B.rimT = 0; evt('rim', B.x, B.z, hard);
}

/* ---------------------------------------------------------------------- shots */
function nearestDef(p) { return nearest(M.court[opp(p.side)], p.x, p.z); }
// How open a shooter is: distance to the nearest defender, less if he is up in the air contesting.
function openness(p) {
  let o = 9;
  for (const d of M.court[opp(p.side)]) {
    let dd = hypot(d.x - p.x, d.z - p.z);
    const between = ((d.z - p.z) * (hoopZ(p.side) - p.z) + (d.x - p.x) * (0 - p.x)) > 0;
    if (!between) dd *= 1.5;
    if (d.y > 0.15) dd *= 0.7;
    if (d.stumT > 0) dd += 2;
    o = min(o, dd);
  }
  return o;
}
// The chance a shot goes in before timing: distance, the player's rating, how open, legs, confidence.
export function shotChance(p, kind, x, z) {
  const d = hypot(x, z - hoopZ(p.side)), three = isThree(x, z, p.side), open = openness(p);
  let b;
  if (kind === 'dunk') b = 0.86 + rat(p, 'dnk') * 0.12;
  else if (kind === 'layup') b = 0.42 + rat(p, 'fin') * 0.38;
  else if (kind === 'ft') b = 0.48 + rat(p, 'shtm') * 0.44;
  else if (three) b = 0.16 + rat(p, 'sht3') * 0.36 - max(0, d - 7.3) * 0.06;
  else if (d < 3) b = 0.42 + rat(p, 'shtm') * 0.26;
  else b = 0.34 + rat(p, 'shtm') * 0.3 - (d - 3) * 0.012;
  if (kind !== 'ft') { const c = clamp((2.1 - open) / 1.7, 0, 1); b *= 1 - c * (kind === 'dunk' ? 0.2 : kind === 'layup' ? 0.3 : 0.36); }
  b *= fatigue(p);
  b += p.conf * 0.04;
  return { p: clamp(b, 0.02, 0.98), three, d, open };
}
// Start a shot. kind: 'jumper' | 'layup' | 'dunk' | 'ft'. A user's jumper waits for the release.
export function startShot(p, kind, user, extra) {
  const hz = hoopZ(p.side);
  p.picked = true; p.yaw = faceTo(p, 0, hz);
  const ad = Object.assign({ kind, user: !!user, hz, rel: false, timing: user ? 0 : null, charge: 0 }, extra || {});
  if (kind === 'jumper') { setAct(p, 'shoot', 1.25, ad); p.vx *= 0.25; p.vz *= 0.25; }
  else if (kind === 'ft') { setAct(p, 'ft', 9, ad); p.vx = p.vz = 0; }
  else if (kind === 'layup') { setAct(p, 'layup', 1.0, ad); }
  else { setAct(p, 'dunk', 1.45, ad); }
  if (kind === 'jumper' || kind === 'ft') evt('gather', p, kind);
  // a defender who reads it goes up to contest after his reaction time
  if (kind !== 'ft') for (const d of M.court[opp(p.side)]) {
    if (d === M.ctrl) continue;
    const dd = hypot(d.x - p.x, d.z - p.z);
    if (dd < 2.6 && d.act === '' && d.y === 0 && rnd() < 0.85 * M.diff.ai) d.react = { at: M.t + rr(M.diff.react[0], M.diff.react[1]) + (kind === 'jumper' ? 0.12 : 0), what: 'contest', who: p };
  }
}
// The ball leaves the hands. timing: 0..1 for a user's release (1 = perfect), null for the computer.
function releaseShot(p) {
  const ad = p.ad; if (!ad || ad.rel) return;
  ad.rel = true;
  const kind = ad.kind, hz = ad.hz, s = hz > 0 ? 1 : -1;
  const c = shotChance(p, kind, p.x, p.z);
  let prob = c.p;
  if (ad.timing != null && kind !== 'dunk') prob = lerp(prob * 0.45, min(0.97, prob + 0.42), ad.timing);
  if (M.kind === 'c3') prob = ad.timing != null ? lerp(0.06, 0.9, ad.timing) * (0.78 + rat(p, 'sht3') * 0.3) : prob;
  if (M.kind === 'practice' && ad.timing != null) prob = lerp(0.12, 0.95, ad.timing);
  // blocks: a defender in the air near the ball at the release
  let blocked = null, fouler = null;
  if (kind !== 'ft') for (const d of M.court[opp(p.side)]) {
    const dd = hypot(d.x - p.x, d.z - p.z);
    if (dd > 1.6) continue;
    const air = d.act === 'block' ? d.y : 0;
    const reach = d.h * 1.33 + air, shotY = p.h * 1.2 + p.y + (kind === 'jumper' ? 0.15 : 0.3);
    if (air > 0.12 && reach > shotY - 0.25) {
      const k = (rat(d, 'blk') * 0.7 + 0.3) * clamp(1.4 - dd, 0.2, 1) * (kind === 'dunk' ? 0.35 : kind === 'layup' ? 0.75 : 0.5) * clamp((reach - shotY + 0.4) / 0.6, 0, 1) * (d === M.ctrl ? 1.2 : 1);
      if (!blocked && rnd() < k) blocked = d;
    }
    if (!fouler && dd < 0.85 && (d.act === 'block' || d.act === 'steal') && rnd() < (kind === 'jumper' ? 0.16 : 0.26) * (d === M.ctrl ? 1.2 : 1) * (1 - rat(d, 'def') * 0.4)) fouler = d;
  }
  const pts = kind === 'ft' ? 1 : c.three ? 3 : 2;
  if (kind !== 'ft' && M.kind === 'game') { p.st.fga++; if (pts === 3) p.st.tpa++; }
  if (kind === 'ft') p.st.fta++;
  handBall(p, B);
  B.holder = null; B.last = p; B.lastSide = p.side;
  if (blocked) {
    blocked.st.blk++; p.picked = false;
    const away = rr(3, 6);
    looseBall(B.x, B.y, B.z, rr(-2.5, 2.5), rr(0.5, 2.5), -s * away * 0.6);
    B.lastSide = blocked.side; B.last = blocked;
    evt('block', blocked, p); say('block', blocked); M.noise = min(1, M.noise + 0.25);
    if (fouler === blocked) fouler = null;
    if (fouler) callFoul(fouler, p, { shooting: true, pts, made: false });
    return;
  }
  const make = rnd() < prob;
  // where it is aimed: the middle of the rim for a make, the front, back or side iron for a miss
  let tx = 0, tz = hz, ty = CT.RIM_Y + 0.02;
  if (make) { const off = rnd() < 0.55 ? rr(0, 0.05) : rr(0.06, 0.13), a = rnd() * TAU; tx = cos(a) * off; tz = hz + sin(a) * off; }
  else {
    const kindM = rnd(), towards = Math.atan2(p.x, p.z - hz);
    if (ad.timing != null && ad.early) { tx = sin(towards) * rr(0.18, 0.34); tz = hz + cos(towards) * rr(0.18, 0.34); }
    else if (ad.timing != null && ad.late) { tx = -sin(towards) * rr(0.2, 0.38); tz = hz - cos(towards) * rr(0.2, 0.38); }
    else if (kindM < 0.4) { tx = sin(towards) * rr(0.17, 0.32); tz = hz + cos(towards) * rr(0.17, 0.32); }
    else if (kindM < 0.75) { tx = -sin(towards) * rr(0.2, 0.36); tz = hz - cos(towards) * rr(0.2, 0.36); }
    else { const side = rnd() < 0.5 ? 1 : -1; tx = cos(towards) * side * rr(0.22, 0.34); tz = hz - sin(towards) * side * rr(0.22, 0.34); }
  }
  B.state = 'shot'; B.free = true; B.guide = false;
  B.shot = { by: p, side: p.side, pts, make, hz, kind, done: false, timing: ad.timing, buzzer: M.kind === 'game' && M.clock <= 0.01 ? false : true, at: M.t, foul: fouler, x0: p.x, z0: p.z, alley: !!ad.alley, from: ad.from || null };
  if (kind === 'dunk') {
    // the hands take it to the rim
    B.x = tx * 0.4; B.z = hz - s * 0.05; B.y = CT.RIM_Y + 0.22; B.vx = 0; B.vz = 0; B.vy = make ? -3.2 : -1;
    if (!make) { B.shot.done = true; B.vy = 2.2; rimBounce(rr(-0.1, 0.1), -s * 0.1, 0.1, s, 1.2); B.state = 'shot'; }
    if (M.kind === 'game') p.st.dnk += make ? 1 : 0;
  } else {
    const x0 = B.x, y0 = B.y, z0 = B.z;
    const dist = hypot(tx - x0, tz - z0);
    const apex = max(y0, ty) + (kind === 'layup' ? 0.35 : 0.55 + min(1.9, dist * 0.17)) * (ad.timing != null && ad.early ? 0.85 : 1);
    const vy = sqrt(2 * GRAV * (apex - y0)), T = vy / GRAV + sqrt(2 * max(0.02, apex - ty) / GRAV);
    B.vx = (tx - x0) / T; B.vz = (tz - z0) / T; B.vy = vy;
  }
  B.spin = 8;
  if (fouler) callFoul(fouler, p, { shooting: true, pts, pending: true });
  evt('shot', p, B.shot);
  if (kind !== 'ft') {
    say(kind === 'dunk' ? 'dunkgo' : pts === 3 ? 'threego' : 'shotgo', p);
    // the shot is up: bigs crash the glass, the others get back
    for (const q of courtPlayers()) q.ai.crash = q.side === p.side ? (q.info.pos === 'C' || q.info.pos === 'PF' || q.info.pos === 'F') : true;
  }
}
function resolveShot(d, dx, dz, s) {
  const sh = B.shot; sh.done = true;
  if (sh.make) {
    B.guide = true;
    if (d > 0.06 && sh.kind !== 'dunk') { B.rimT = 0; evt('rim', B.x, B.z, 0.25); }
    madeShot(sh);
  } else {
    if (d < CT.RIM_R + CT.BR + 0.16) rimBounce(dx, dz, d, s, sh.kind === 'dunk' ? 1.2 : 0.55);
    missedShot(sh, d > CT.RIM_R + CT.BR + 0.16);
  }
}
function madeShot(sh) {
  const p = sh.by;
  if (M.kind === 'game') {
    if (sh.kind === 'ft') { p.st.ftm++; } else { p.st.fgm++; if (sh.pts === 3) p.st.tpm++; }
    score(p.side, sh.pts, p, sh);
  } else contestMade(sh);
  p.conf = clamp(p.conf + 0.25, -1, 1);
}
function missedShot(sh, air) {
  const p = sh.by;
  p.conf = clamp(p.conf - 0.12, -1, 1);
  if (M.kind !== 'game') { contestMiss(sh, air); return; }
  evt('miss', p, sh);
  if (sh.kind !== 'ft') say(air ? 'airball' : 'miss', p);
  if (sh.foul) { const f = sh.foul; sh.foul = null; afterShootingFoul(f, p, sh.pts, false); return; }
  if (M.ft && sh.kind === 'ft') ftNext(false);
}
// Points on the board: stats, the assist, the run, the noise, and what happens next.
function score(side, pts, p, sh) {
  M.score[side] += pts; p.st.pts += pts;
  if (sh.kind !== 'ft' && p.lastPass && p.lastPass.side === side && M.t - p.catchAt < 4) p.lastPass.st.ast++;
  if (M.run.side === side) M.run.pts += pts; else { M.run.side = side; M.run.pts = pts; }
  const user = side === M.user, home = side === 0;
  M.noise = clamp(M.noise + (home ? 0.18 : 0.06) + (pts === 3 ? 0.08 : 0) + (sh.kind === 'dunk' ? 0.2 : 0), 0, 1);
  const buzzer = M.clock <= 0.01 && sh.kind !== 'ft';
  evt('score', p, sh);
  if (sh.kind === 'ft') say('ftmake', p);
  else if (sh.alley) say('alley', p);
  else if (sh.kind === 'dunk') say(M.posterOf ? 'poster' : 'dunk', p);
  else if (sh.kind === 'layup') say('layup', p);
  else if (pts === 3) say('three', p);
  else say('jumper', p);
  if (M.run.pts >= 8) say('run', p.side);
  if (sh.kind !== 'ft') { p.celebT = 1.2; if (sh.kind === 'dunk' || pts === 3 || buzzer) p.react = { at: M.t + 0.5, what: 'celebrate' }; }
  // a big moment is worth a replay
  if ((sh.kind === 'dunk' || buzzer) && M.kind === 'game') M.wantReplay = { at: M.t + 1.1, why: buzzer ? 'Buzzer beater' : sh.alley ? 'Alley-oop' : 'Dunk', who: p };
  if (buzzer) say('buzzer', p);
  if (sh.foul) { const f = sh.foul; sh.foul = null; afterShootingFoul(f, p, sh.pts, true); return; }
  if (sh.kind === 'ft') { ftNext(true); return; }
  // the other side takes it out from under its own basket
  const o = opp(side);
  dead('made', { type: 'inbound', side: o, base: true }, 1.25, true);
  void user;
}
export const shotInfo = () => B.shot;

/* ---------------------------------------------------------------------- passes */
export function startPass(p, to, type) {
  if (!to || to === p) return false;
  setAct(p, 'pass', 0.34, { to, type });
  p.yaw = faceTo(p, to.x, to.z);
  return true;
}
function releasePass(p) {
  const ad = p.ad; if (!ad || ad.done) return;
  ad.done = true;
  const to = ad.to, type = ad.type;
  handBall(p, B);
  const x0 = B.x, z0 = B.z, y0 = max(1.0, B.y);
  const d0 = hypot(to.x - x0, to.z - z0);
  const sp = type === 'chest' ? 11 : type === 'bounce' ? 8.6 : 7;
  let dur = type === 'lob' ? 0.7 + d0 * 0.055 : d0 / sp;
  // lead the runner
  let ex = to.x + to.vx * dur * 0.9, ez = to.z + to.vz * dur * 0.9;
  if (ad.alley) { ex = 0; ez = hoopZ(p.side) - M.dir[p.side] * 0.55; }
  // a pass under pressure from a poor passer can sail
  const pressure = clamp((1.5 - nearestD(M.court[opp(p.side)], p.x, p.z)) / 1.5, 0, 1);
  const bad = M.kind === 'game' && rnd() < ((1 - rat(p, 'pas')) * 0.09 + pressure * 0.04) * (p.side === M.user ? 0.6 : M.diff.err);
  if (bad) { ex += rr(-2.6, 2.6); ez += rr(-2.6, 2.6); }
  ex = clamp(ex, -CT.HW - 1.2, CT.HW + 1.2); ez = clamp(ez, -CT.HL - 1.2, CT.HL + 1.2);
  const ey = ad.alley ? CT.RIM_Y + 0.25 : type === 'lob' ? 1.9 : 1.15;
  B.holder = null; B.state = 'pass'; B.free = true; B.last = p; B.lastSide = p.side; p.picked = false;
  B.pass = { from: p, to, type, t: 0, dur, sx: x0, sy: y0, sz: z0, ex, ey, ez, tried: new Set(), alley: !!ad.alley, bad };
  if (type === 'bounce' || type === 'lob') {
    dur = max(0.35, dur); B.pass.dur = dur;
    B.x = x0; B.y = y0; B.z = z0; B.vx = (ex - x0) / dur; B.vz = (ez - z0) / dur;
    if (type === 'bounce') { const t1 = dur * 0.55; B.vy = (CT.BR - y0 + 0.5 * GRAV * t1 * t1) / t1; }
    else B.vy = (ey - y0 + 0.5 * GRAV * dur * dur) / dur;
  }
  if (ad.alley) { to.ai.alley = { at: M.t + dur - 0.5 }; }
  if (M.kind === 'practice' && p === M.ctrl) M.pr.s.passes++;
  if (M.phase === 'inbound') { M.phase = 'live'; M.phaseT = 0; }
  evt('pass', p, B.pass);
}
// a chest pass flies straight and fast
function stepPass(h) {
  const P = B.pass; P.t += h;
  const k = clamp(P.t / P.dur, 0, 1);
  B.x = lerp(P.sx, P.ex, k); B.z = lerp(P.sz, P.ez, k); B.y = lerp(P.sy, P.ey, k) + sin(k * PI) * 0.15;
  B.vx = (P.ex - P.sx) / P.dur; B.vz = (P.ez - P.sz) / P.dur; B.vy = 0;
  passArrival();
  if (B.state === 'pass' && k >= 1) {
    // nobody there: it rolls on
    B.state = 'loose'; B.vx *= 0.6; B.vz *= 0.6; B.vy = 0.5; B.looseT = 0;
  }
}
function passArrival() {
  const P = B.pass; if (!P) return;
  P.t2 = (P.t2 || 0) + 0;
  // defenders in the lane can pick it off
  for (const d of M.court[opp(P.from.side)]) {
    if (P.tried.has(d)) continue;
    const dd = hypot(d.x - B.x, d.z - B.z);
    if (dd > 0.75) continue;
    const reach = d.h * 1.25 + d.y + 0.2;
    if (B.y > reach) continue;
    P.tried.add(d);
    const base = P.type === 'chest' ? 0.11 : P.type === 'bounce' ? 0.08 : 0.06;
    const k = base * (0.5 + rat(d, 'stl')) * (d.side === M.user ? M.diff.steal : 1) * (P.bad ? 1.6 : 1) * (d.stumT > 0 ? 0.2 : 1);
    if (rnd() < k) {
      d.st.stl++; P.from.st.to++;
      evt('steal', d, P.from); say('pick', d); M.noise = min(1, M.noise + 0.15);
      setAct(d, 'catch', 0.25); giveBall(d, 'steal');
      return;
    }
  }
  const to = P.to;
  const fx = to.x + sin(to.yaw) * 0.3, fz = to.z + cos(to.yaw) * 0.3;
  const d = hypot(B.x - fx, B.z - fz), reach = to.h * (to.act === 'dunk' ? 1.35 : 1.15) + to.y + 0.2;
  if (d < (P.alley ? 0.9 : 0.75) && B.y < reach && B.y > 0.15 && (P.type !== 'bounce' || P.bounced || P.t > P.dur * 0.6)) {
    to.lastPass = P.from; to.catchAt = M.t;
    if (P.alley && to.act === 'dunk') {
      giveBall(to, 'alley');
      to.ad.alley = true; to.ad.from = P.from;
      return;
    }
    if (to.act === '' || to.act === 'screen') setAct(to, 'catch', 0.22);
    giveBall(to, 'pass');
    if (M.phase === 'inbound') { M.phase = 'live'; M.phaseT = 0; }
  }
}

/* ---------------------------------------------------------------------- possession, fouls, violations */
function changePoss(side, how) {
  const was = M.poss, prevShot = M.shot;
  M.poss = side; M.shot = 24; M.front = false; M.backT = 0;
  if (how === 'oreb') M.shot = max(M.shot, 14);
  if (how === 'oreb' && was === side) M.shot = max(prevShot, 14);
  planOffence(side, how);
  for (const p of courtPlayers()) { p.ai.crash = false; p.ai.alley = null; p.ai.drive = false; if (p.react && p.react.what === 'contest') p.react = null; }
  if (M.user >= 0 && side !== M.user && M.kind === 'game') { const h = B.holder || B; M.ctrl = nearest(M.court[M.user], h.x, h.z); }
  if (was !== side && was >= 0) evt('poss', side, how);
}
// whistles: the ball is dead, something happens next after a beat
function dead(why, next, t, run) {
  M.phase = 'dead'; M.phaseT = 0; M.deadWhy = why; M.next = next; M.deadDur = t || 1.4;
  // after a make the clock keeps running, except in the last minute of the fourth and in overtime
  M.clockRun = !!run && !(M.q >= 4 && M.clock < 60);
  if (B.state === 'held' && B.holder) B.holder.picked = true;
  B.free = true;
  if (B.state === 'pass') { B.state = 'loose'; B.pass = null; }
  if (why !== 'made') evt('whistle', why);
}
function outOfBounds() {
  const side = opp(B.lastSide < 0 ? M.poss : B.lastSide);
  const x = clamp(B.x, -CT.HW, CT.HW), z = clamp(B.z, -CT.HL + 0.5, CT.HL - 0.5);
  say('out');
  B.state = 'out';
  if (B.last && B.last.side !== side && M.kind === 'game') B.last.st.to += B.lastSide === M.poss ? 1 : 0;
  dead('Out of bounds', { type: 'inbound', side, x, z }, 1.4);
}
export function violation(why, side) {
  if (M.phase !== 'live' && M.phase !== 'inbound') return;
  const h = B.holder;
  if (h) h.st.to++;
  const x = h ? clamp(h.x, -CT.HW, CT.HW) : 0, z = h ? clamp(h.z, -CT.HL + 1, CT.HL - 1) : 0;
  M.banner = why; M.banT = 1.8;
  say('violation', why);
  evt('violation', why, h);
  dead(why, { type: 'inbound', side: opp(side), x: abs(x) > 5 ? x : (x < 0 ? -CT.HW : CT.HW), z }, 1.6);
}
function callFoul(def, off, o) {
  if (M.kind !== 'game') return;
  def.fouls++; def.st.pf++; M.tf[def.side]++;
  evt('foul', def, off);
  M.banner = 'Foul on ' + def.info.short + ' (' + def.fouls + ')'; M.banT = 1.8;
  if (o.shooting) {
    if (o.pending) { return; } // decided when the shot lands: an and-one or free throws
    afterShootingFoul(def, off, o.pts, false);
    return;
  }
  say('foul', def);
  const bonus = M.tf[def.side] >= 5;
  if (bonus) dead('Foul', { type: 'ft', shooter: off, n: 2 }, 1.6);
  else dead('Foul', { type: 'inbound', side: off.side, x: off.x < 0 ? -CT.HW : CT.HW, z: clamp(off.z, -CT.HL + 1.5, CT.HL - 1.5) }, 1.6);
  if (def.fouls >= 5) { M.banner = def.info.short + ' fouls out'; say('foulout', def); }
}
function afterShootingFoul(def, shooter, pts, made) {
  if (made) { say('andone', shooter); M.noise = min(1, M.noise + 0.2); }
  else say('shootfoul', def);
  if (def.fouls >= 5) M.banner = def.info.short + ' fouls out';
  dead('Shooting foul', { type: 'ft', shooter, n: made ? 1 : pts }, made ? 2.0 : 1.5);
}

/* ---------------------------------------------------------------------- phases */
function resetBall() { Object.assign(B, { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, state: 'dead', holder: null, last: null, lastSide: -1, shot: null, pass: null, guide: false, free: false }); }
export function startGame(home, away, o) {
  setupTeams(home, away);
  M.kind = 'game'; M.user = o.user == null ? 0 : o.user; M.qlen = (o.qlen || 3) * 60; M.diff = o.diff || DIFF.pro;
  M.q = 1; M.clock = M.qlen; M.shot = 24; M.score = [0, 0]; M.tf = [0, 0]; M.tos = [3, 3]; M.dir = [1, -1]; M.poss = -1; M.tipWin = -1;
  M.run = { side: -1, pts: 0 }; M.noise = 0.35; M.qScore = []; M.ft = null; M.wantReplay = null; M.toReq = -1; M.banner = null; M.banT = 0;
  M.t = 0; M.slow = 0; M.replay = null; M.stage = o.stage || ''; M.subs = o.subs || 'auto'; M.ended = false; M.lead = 0;
  M.def = ['man', 'man']; M.lines = []; M.lastShotSide = -1; M.overShown = false; M.ctrl = M.user >= 0 ? M.court[M.user][0] : null;
  resetBall(); recReset();
  if (o.intro) startIntro(); else startTip();
}
function startIntro() {
  M.phase = 'intro'; M.phaseT = 0;
  const list = M.court[0].concat(M.court[1]);
  M.intro = { list, i: -1, t: 0, dur: [1.55, 1.55, 1.55, 1.55, 1.55, 0.75, 0.75, 0.75, 0.75, 0.75], done: false };
  for (let s = 0; s < 2; s++) M.court[s].forEach((p, i) => {
    p.x = -3.6 + i * 1.8; p.z = (s === 0 ? -1 : 1) * 3.2; p.yaw = s === 0 ? -PI / 2 : -PI / 2; p.vx = p.vz = 0; p.ai.tx = p.x; p.ai.tz = p.z;
  });
  say('welcome');
}
function startTip() {
  M.phase = 'tip'; M.phaseT = 0; M.intro = null;
  for (let s = 0; s < 2; s++) {
    const sg = s === 0 ? -1 : 1;
    M.court[s].forEach((p, i) => {
      const spots = [[2.2, 2.6], [-2.4, 2.4], [3.8, 0.9], [-3.6, 0.9], [0, 0.55]];
      p.x = spots[i][0] * (s ? -1 : 1); p.z = sg * spots[i][1]; p.vx = p.vz = 0; p.yaw = s === 0 ? 0 : PI; p.act = ''; p.y = 0; p.vy = 0;
      p.ai.tx = p.x; p.ai.tz = p.z;
    });
  }
  M.refs[0].x = 0.9; M.refs[0].z = 0; M.refs[0].yaw = -PI / 2;
  resetBall(); B.state = 'dead'; B.x = 0.6; B.y = 1.5; B.z = 0; B.free = false;
  M.tip = { t: 0, user: -1, done: false };
  M.banner = M.q > 4 ? 'Overtime: jump ball' : 'Tip-off'; M.banT = 1.6;
}
function tipUpdate(dt) {
  const T = M.tip; T.t += dt;
  if (M.user >= 0) { const sw = arc.input.swipe(); if (arc.input.hit('Space', 'KeyJ') || (sw && sw.dir === 'up') || arc.input.tap()) T.press = true; }
  const c0 = M.court[0][4], c1 = M.court[1][4];
  const toss = 0.6;
  if (T.t > toss && !T.done) {
    const tt = T.t - toss;
    B.x = 0; B.z = 0; B.y = 1.7 + 6.4 * tt - 0.5 * GRAV * tt * tt;
    // the centres go up for it; the user's centre on the button
    for (const c of [c0, c1]) {
      const user = c.side === M.user;
      if (c.y === 0 && c.act === '' && ((user && T.press) || (!user && tt > 0.38 + rr(-0.06, 0.12)) || (user && tt > 0.78))) {
        setAct(c, 'tip', 0.9); c.vy = 3.6 + rat(c, 'reb') * 0.8; c.ad = { at: tt };
        if (user) T.userAt = tt;
      }
    }
    if (tt >= 0.66) {
      // whoever is highest, best timed, wins it
      const sc = (c) => c.y * 2 + rat(c, 'reb') * 0.6 + (c.h - 2) + (c.ad ? -abs(c.ad.at - 0.42) * 2 : -1) + rnd() * 0.5;
      const w = sc(c0) >= sc(c1) ? c0 : c1;
      T.done = true; M.tipWin = w.side;
      const to = M.court[w.side][0];
      B.state = 'pass'; B.free = true; B.last = w; B.lastSide = w.side;
      B.pass = { from: w, to, type: 'chest', t: 0, dur: 0.55, sx: 0, sy: B.y, sz: 0, ex: to.x, ey: 1.2, ez: to.z, tried: new Set(), alley: false, bad: false };
      M.phase = 'live'; M.phaseT = 0; M.poss = -1;
      evt('tip', w); say('tip', w.side);
    }
  } else if (!T.done) { B.x = 0.55; B.y = 1.4 + T.t * 0.4; B.z = 0; }
  for (const p of courtPlayers()) { integrate(p, dt); p.vx *= 0.8; p.vz *= 0.8; }
}
function setupInbound(nx) {
  const side = nx.side;
  let x, z;
  if (nx.base) { z = -M.dir[side] * (CT.HL + 0.6); x = rnd() < 0.5 ? -1.4 : 1.4; }
  else if (nx.half) { x = -(CT.HW + 0.6); z = 0.1 * M.dir[side]; }
  else {
    x = nx.x == null ? -(CT.HW + 0.6) : nx.x; z = nx.z == null ? 0 : nx.z;
    if (abs(z) > CT.HL - 1.2) { z = Math.sign(z) * (CT.HL + 0.6); x = clamp(x, -CT.HW + 1, CT.HW - 1); } else x = Math.sign(x || -1) * (CT.HW + 0.6);
  }
  const team = M.court[side];
  let by = nx.base ? (team[4].fouls < 9 ? team[4] : team[3]) : nearest(team, x, z);
  if (by === team[0] && !nx.base) by = team[1];
  by.x = x; by.z = z; by.vx = by.vz = 0; by.yaw = faceTo(by, 0, 0);
  M.lastShotSide = -1;
  M.phase = 'inbound'; M.phaseT = 0; M.inb = { by, ready: by.side === M.user ? 2.4 : rr(0.9, 1.6) };
  resetBall(); giveBall(by, 'inbound'); setAct(by, 'inbound', 9);
  if (M.poss !== side) changePoss(side, 'inbound');
  M.shot = 24; M.front = !nx.base && !nx.half ? inFront(by, side) : false; M.backT = 0;
  if (M.user === side) M.ctrl = by;
  else if (M.user >= 0 && (!M.ctrl || M.ctrl.side !== M.user || !M.ctrl.court)) M.ctrl = M.court[M.user][0];
}
function inboundUpdate(dt) {
  const I = M.inb; if (!I || !I.by) return;
  const by = I.by;
  if (by.act === 'pass' || B.holder !== by) return;
  const userGo = by.side === M.user && (arc.input.hit('KeyK') || arc.input.hit('Space') || arc.input.tap());
  if (M.phaseT > I.ready || userGo) {
    let best = null, bv = -9;
    for (const t of M.court[by.side]) { if (t === by) continue; const d = hypot(t.x - by.x, t.z - by.z); if (d > 11) continue; const v = openness(t) * 0.6 - d * 0.08 + (t.slot === 0 || t === M.court[by.side][0] ? 0.6 : 0) + rnd() * 0.3; if (v > bv) { bv = v; best = t; } }
    if (!best) best = M.court[by.side][0] === by ? M.court[by.side][1] : M.court[by.side][0];
    by.act = ''; startPass(by, best, 'chest');
  }
}
function setupFT(shooter, n) {
  const side = shooter.side, o = opp(side), s = M.dir[side];
  M.phase = 'ft'; M.phaseT = 0; M.lastShotSide = -1;
  M.ft = { by: shooter, n, i: 0, t: 0, made: 0, wait: 1.4 };
  shooter.x = 0; shooter.z = s * CT.FT; shooter.yaw = faceTo(shooter, 0, s * CT.HOOP); shooter.vx = shooter.vz = 0;
  const lane = [];
  for (let k = 0; k < 3; k++) for (const sx of [-1, 1]) lane.push([sx * 2.75, s * (CT.HOOP - 1.0 - k * 1.05)]);
  const defs = M.court[o].slice().sort((a, b) => b.info.rat.reb - a.info.rat.reb);
  const offs = M.court[side].filter((p) => p !== shooter).sort((a, b) => b.info.rat.reb - a.info.rat.reb);
  const put = (p, q) => { p.x = q[0]; p.z = q[1]; p.vx = p.vz = 0; p.yaw = faceTo(p, 0, s * CT.HOOP); p.ai.tx = p.x; p.ai.tz = p.z; p.act = ''; };
  put(defs[0], lane[0]); put(defs[1], lane[1]); put(offs[0], lane[2]); put(offs[1], lane[3]); put(defs[2], lane[4]);
  [offs[2], offs[3], defs[3], defs[4]].forEach((p, i) => put(p, [(-4.5 + i * 3), s * (CT.HOOP - 7.6 - (i % 2) * 0.6)]));
  resetBall(); giveBall(shooter, 'ft');
  if (M.poss !== side) { M.poss = side; }
  if (M.user === side) M.ctrl = shooter;
  M.banner = shooter.info.short + ': ' + n + ' free throw' + (n > 1 ? 's' : ''); M.banT = 1.6;
  say('ftline', shooter);
}
function ftUpdate(dt) {
  const F = M.ft; if (!F) return;
  F.t += dt;
  const p = F.by;
  if (B.holder !== p && B.state !== 'shot') {
    if (F.t > 0.9 && F.i < F.n) { resetBall(); giveBall(p, 'ft'); F.t = 0; }
    return;
  }
  if (B.holder === p && p.act === '' && F.t > F.wait) {
    const user = p.side === M.user;
    startShot(p, 'ft', user);
    if (F.i === F.n - 1) F.last = true;
  }
  if (p.act === 'ft' && p.ad && !p.ad.user && p.actT > 0.95 && !p.ad.rel) { releaseShot(p); if (F.last) { M.phase = 'live'; M.phaseT = 0; } }
}
function ftNext(made) {
  const F = M.ft; if (!F) return;
  F.i++; if (made) F.made++;
  if (F.i < F.n) { F.t = 0; M.phase = 'ft'; return; }
  const by = F.by;
  M.ft = null;
  if (made) dead('made', { type: 'inbound', side: opp(by.side), base: true }, 1.2, false);
  // a miss on the last one is live: the lane comes alive
}
function startTimeout(side) {
  M.phase = 'timeout'; M.phaseT = 0; M.tos[side]--; M.toSide = side; M.toReq = -1;
  M.banner = TEAMS[M.teams[side]].name + ' timeout'; M.banT = 2;
  say('timeout', side);
  for (const p of courtPlayers()) { p.stam = clamp(p.stam + 0.2, 0, 1); p.act = ''; }
  for (let s = 0; s < 2; s++) M.side[s].forEach((p) => { if (!p.court) p.stam = clamp(p.stam + 0.12, 0, 1); });
  evt('timeout', side);
}
export function requestTimeout(side) {
  if (M.kind !== 'game' || M.tos[side] <= 0 || M.phase === 'final' || M.phase === 'intro' || M.phase === 'qend') return false;
  // the team with the ball can stop play at once; otherwise at the next whistle
  if (M.phase === 'live' && B.state === 'held' && B.holder && B.holder.side === side) {
    dead('Timeout', { type: 'inbound', side, x: B.holder.x < 0 ? -CT.HW : CT.HW, z: clamp(B.holder.z, -CT.HL + 1.5, CT.HL - 1.5) }, 0.6);
  }
  M.toReq = side;
  M.banner = 'Timeout called'; M.banT = 1.2;
  return true;
}
// Fresh legs at a dead ball: tired players come off for rested ones, fouled-out players must.
function ftShooter() { return M.ft ? M.ft.by : M.next && M.next.type === 'ft' ? M.next.shooter : null; }
export function autoSubs(side, force) {
  if (M.kind !== 'game') return;
  if (side === M.user && M.subs !== 'auto' && !force) { M.court[side].forEach((p, i) => { if (p.fouls >= 5) subIn(side, i, bestBench(side, p)); }); return; }
  M.court[side].forEach((p, i) => {
    // a tired player owed free throws takes them first; only fouling out forces them off
    if (p.fouls < 5 && p === ftShooter()) return;
    if (p.fouls >= 5 || p.stam < 0.55) { const b = bestBench(side, p); if (b && (p.fouls >= 5 || b.stam > p.stam + 0.3)) subIn(side, i, b); }
  });
}
function bestBench(side, out) {
  const g = (q) => (q.info.pos === 'PG' || q.info.pos === 'SG' || q.info.pos === 'G' ? 0 : q.info.pos === 'C' ? 2 : 1);
  let best = null, bv = -9;
  for (const b of M.side[side]) { if (b.court || b.fouls >= 5) continue; const v = b.stam * 2 + b.info.ovr / 100 - abs(g(b) - g(out)) * 0.6; if (v > bv) { bv = v; best = b; } }
  return best;
}
export function subIn(side, i, b) {
  if (!b) return;
  const out = M.court[side][i];
  out.court = false; b.court = true; out.act = ''; out.y = 0; out.vy = 0;
  b.x = -CT.HW - 0.4; b.z = 0.4 * (side === 0 ? -1 : 1); b.vx = b.vz = 0; b.yaw = PI / 2; b.act = ''; b.picked = false;
  M.court[side][i] = b;
  M.match[opp(side)][i] = b;
  if (B.holder === out) giveBall(b, 'sub');
  // free throws owed to a player who leaves are taken by the one who comes in
  if (M.next && M.next.type === 'ft' && M.next.shooter === out) M.next.shooter = b;
  if (M.ft && M.ft.by === out) M.ft.by = b;
  if (M.ctrl === out) M.ctrl = b;
  evt('sub', b, out);
  if (side === M.user || rnd() < 0.5) say('sub', b);
}
// free throws earned at the horn (queued, or partway through the set) are taken before the quarter ends
function ftPending() { return !!M.ft || !!(M.next && M.next.type === 'ft'); }
function endQuarter() {
  M.phase = 'qend'; M.phaseT = 0; M.clock = 0;
  M.qScore.push(M.score.slice());
  for (const p of courtPlayers()) { p.act = p.act === 'hang' ? p.act : ''; }
  evt('buzzer'); say(M.q >= 4 && M.score[0] !== M.score[1] ? 'final' : M.q === 2 ? 'half' : 'qend');
  M.banner = M.q >= 4 && M.score[0] !== M.score[1] ? 'Final' : M.q === 2 ? 'Halftime' : M.q >= 4 ? 'End of regulation, tied' : 'End of the ' + ORD[M.q - 1]; M.banT = 3;
  B.state = B.state === 'held' ? 'held' : 'loose'; B.free = true;
}
const ORD = ['first quarter', 'second quarter', 'third quarter', 'fourth quarter', 'overtime', 'second overtime', 'third overtime'];
export const qName = (q) => (q <= 4 ? 'Q' + q : q === 5 ? 'OT' : (q - 4) + 'OT');
function nextQuarter() {
  if (M.q >= 4 && M.score[0] !== M.score[1]) { startFinal(); return; }
  M.q++;
  M.tf = [0, 0];
  if (M.q === 3) { M.dir = [-M.dir[0], -M.dir[1]]; M.tos = [max(M.tos[0], 2), max(M.tos[1], 2)]; }
  if (M.q > 4) { M.clock = max(60, M.qlen / 2); say('ot'); autoSubs(0); autoSubs(1); startTip(); return; }
  M.clock = M.qlen;
  autoSubs(0); autoSubs(1);
  const side = (M.q === 2 || M.q === 3) ? opp(M.tipWin) : M.tipWin;
  courtPlayers().forEach((p) => { p.act = ''; p.y = 0; p.vy = 0; });
  setupInbound({ side, half: true });
}
function startFinal() {
  M.phase = 'final'; M.phaseT = 0; M.ended = true;
  const w = M.score[0] > M.score[1] ? 0 : 1;
  M.winner = w;
  for (const p of courtPlayers()) p.react = { at: M.t + rr(0.1, 0.6), what: p.side === w ? 'celebrate' : 'slump' };
  M.noise = w === 0 ? 1 : 0.4;
  evt('final', w);
}
// Everything a frame of a game does, in order.
function gameUpdate(dt) {
  M.t += dt; M.phaseT += dt; M.banT = max(0, M.banT - dt);
  M.noise = max(0.18, M.noise - dt * 0.035);
  if (M.replay) { replayUpdate(dt); return; }
  if (M.wantReplay && M.t >= M.wantReplay.at && (M.phase === 'dead' || M.phase === 'inbound' || M.phase === 'ft' || M.phase === 'qend' || M.phase === 'final')) { startReplay(M.wantReplay); M.wantReplay = null; return; }
  recFrame(dt);
  switch (M.phase) {
    case 'intro': introUpdate(dt); return;
    case 'tip': tipUpdate(dt); stepBall(dt); return;
    case 'timeout': {
      for (const p of courtPlayers()) { const bx = -CT.HW - 1.3, bz = (p.side === 0 ? -1 : 1) * 3.4; moveTo(p, bx + (p.court ? 0.9 : 0) + sin(p.idx * 1.3) * 0.5, bz + cos(p.idx * 1.7) * 0.8, 0.5, dt, faceTo(p, bx, bz)); integrate(p, dt); }
      const skip = arc.input.hit('Space') || arc.input.hit('Enter') || arc.input.tap();
      if (M.phaseT > 5 || (skip && M.phaseT > 0.8)) { autoSubs(0); autoSubs(1); const nx = M.next; M.next = null; beginNext(nx); }
      stepBall(dt);
      return;
    }
    case 'qend': for (const p of courtPlayers()) { p.vx *= 0.9; p.vz *= 0.9; integrate(p, dt); } stepBall(dt); if (M.phaseT > 3.2) nextQuarter(); return;
    case 'final': finalUpdate(dt); stepBall(dt); return;
    default: break;
  }
  // clocks
  const live = M.phase === 'live';
  if ((live && B.state !== 'dead') || (M.clockRun && (M.phase === 'dead' || M.phase === 'inbound'))) {
    M.clock -= dt;
    if (live && (B.state === 'held' || B.state === 'pass') && M.poss >= 0) M.shot -= dt;
  }
  if (M.clock <= 0) {
    M.clock = 0;
    const ftOwed = ftPending();
    if (B.state === 'shot' && B.shot && !B.shot.done) { M.buzzWait = true; }
    else if (!ftOwed) { M.buzzWait = false; endQuarter(); return; }
  }
  if (live && M.shot <= 0 && B.state !== 'shot' && M.poss >= 0) { M.shot = 0; violation('Shot clock violation', M.poss); }
  if (M.phase === 'dead') {
    for (const p of courtPlayers()) { aiDead(p, dt); integrate(p, dt); }
    stepBall(dt);
    if (M.phaseT > M.deadDur) {
      // a timeout, a substitution, then the restart
      if (M.toReq >= 0 && M.next && M.next.type !== 'ft') { startTimeout(M.toReq); return; }
      autoMaybeTimeout();
      if (M.phase === 'timeout') return;
      autoSubs(0); autoSubs(1);
      const nx = M.next; M.next = null; beginNext(nx);
    }
    return;
  }
  if (M.phase === 'inbound') inboundUpdate(dt);
  if (M.phase === 'ft') ftUpdate(dt);
  // players
  for (const p of courtPlayers()) {
    if (p.react && M.t >= p.react.at) doReact(p);
    if (p === M.ctrl && M.user >= 0) userTick(p, dt); else aiTick(p, dt);
    actTick(p, dt);
    integrate(p, dt);
  }
  for (let s = 0; s < 2; s++) M.side[s].forEach((p) => { if (!p.court) p.stam = clamp(p.stam + dt * 0.018, 0, 1); });
  stepBall(dt);
  if (M.phase === 'live') { looseCheck(); rulesCheck(dt); }
  if (M.buzzWait && (!B.shot || B.shot.done) && M.phase !== 'dead' && !ftPending()) { M.buzzWait = false; endQuarter(); }
  else if (M.buzzWait && M.phase === 'dead' && B.shot && B.shot.done) { M.buzzWait = false; if (M.next && M.next.type === 'ft') { /* free throws after the horn */ } else endQuarter(); }
  refsUpdate(dt);
}
function beginNext(nx) {
  if (!nx) { setupInbound({ side: M.poss >= 0 ? M.poss : 0, half: true }); return; }
  if (nx.type === 'ft') setupFT(nx.shooter, nx.n);
  else setupInbound(nx);
}
function autoMaybeTimeout() {
  for (let s = 0; s < 2; s++) {
    if (s === M.user || M.tos[s] <= 0) continue;
    const run = M.run.side === opp(s) && M.run.pts >= 8;
    const late = M.q >= 4 && M.clock < 40 && abs(M.score[0] - M.score[1]) <= 3 && M.next && M.next.side === s && rnd() < 0.5;
    if ((run && rnd() < 0.7) || late) { M.run.pts = 0; startTimeout(s); return; }
  }
}
function introUpdate(dt) {
  const I = M.intro;
  I.t += dt;
  const skip = arc.input.hit('Space') || arc.input.hit('Enter') || arc.input.hit('KeyJ') || arc.input.tap() || arc.input.hit('KeyK');
  if (I.i < 0 && I.t > 0.9) { I.i = 0; I.t = 0; evt('intro', I.list[0], 0); say('introduce', I.list[0]); }
  else if (I.i >= 0 && I.t > I.dur[I.i]) {
    I.i++; I.t = 0;
    if (I.i >= I.list.length) { I.done = true; startTip(); return; }
    evt('intro', I.list[I.i], I.i);
    if (I.i === 5) say('introaway', 1);
  }
  if (skip && M.phaseT > 0.3) { evt('introskip'); startTip(); return; }
  for (const p of courtPlayers()) {
    const cur = I.i >= 0 && I.list[I.i] === p;
    const s = p.side, home = s === 0 ? -1 : 1;
    const tz = cur ? home * 1.2 : home * 3.2;
    moveTo(p, p.ai.tx, tz, 0.4, dt, -PI / 2);
    if (cur && I.t > 0.3 && p.act === '' && I.i < 5) setAct(p, 'celebrate', 1.1);
    integrate(p, dt);
  }
}
function finalUpdate(dt) {
  for (const p of courtPlayers()) { if (p.react && M.t >= p.react.at) doReact(p); p.vx *= 0.92; p.vz *= 0.92; integrate(p, dt); }
  if (M.phaseT > 4.2 && !M.overShown) { M.overShown = true; finishGame(); }
}

/* ---------------------------------------------------------------------- actions in motion */
export const RISE = 0.45; // a jump shot's apex, where a perfect release sits
function actTick(p, dt) {
  if (!p.act) return;
  const ad = p.ad || (p.ad = {}), t = p.actT;
  switch (p.act) {
    case 'shoot':
      if (!ad.jumped && t >= 0.17) { ad.jumped = true; p.vy = 3.0 + (p.info.rat.spd > 80 ? 0.2 : 0); }
      if (!ad.user && !ad.rel && t >= RISE + rr(-0.03, 0.03)) releaseShot(p);
      break;
    case 'layup': case 'dunk': {
      const hz = ad.hz, s = hz > 0 ? 1 : -1, take = p.act === 'dunk' ? 0.12 : 0.14;
      if (!ad.jumped && t >= take) {
        ad.jumped = true; p.vy = p.act === 'dunk' ? 4.3 + rat(p, 'dnk') * 0.5 : 3.4;
        const dx = 0 - p.x, dz = hz - s * (p.act === 'dunk' ? 0.42 : 0.6) - p.z, d = hypot(dx, dz) || 1;
        const sp = clamp(d / 0.42, 1.2, 6.5);
        ad.vx = dx / d * sp; ad.vz = dz / d * sp;
      }
      if (ad.jumped && !ad.rel) { p.vx = ad.vx; p.vz = ad.vz; p.yaw = turn(p.yaw, faceTo(p, 0, hz), dt * 10); }
      if (ad.alley && !ad.jumped) { /* waiting in the air for the lob: handled by the pass */ }
      const rel = p.act === 'dunk' ? 0.47 : 0.42;
      if (ad.jumped && !ad.rel && t >= rel && B.holder === p) {
        releaseShot(p);
        if (p.act === 'dunk' && B.shot && B.shot.make) { setAct(p, 'hang', 0.5, { hz }); p.vx *= 0.1; p.vz *= 0.1; p.vy = 0; M.posterOf = null; }
      }
      if (ad.jumped && t > rel + 0.1) { p.vx *= 0.9; p.vz *= 0.9; }
      break;
    }
    case 'hang':
      // a moment on the rim, then down
      p.vx = 0; p.vz = 0;
      if (t < 0.38) { p.vy = 0; p.y = max(p.y, CT.RIM_Y - p.h * 1.28 + 0.1); }
      if (t >= 0.5) { p.act = ''; p.actD = 0; }
      break;
    case 'pass': if (!ad.done && t >= 0.12) releasePass(p); break;
    case 'block': if (!ad || !ad.up) { p.ad = { up: true }; p.vy = 3.2 + rat(p, 'blk') * 1.1; } break;
    case 'rebound': if (!ad || !ad.up) { p.ad = { up: true }; p.vy = 2.9 + rat(p, 'reb') * 0.9; } break;
    case 'steal':
      if (!ad.done && t >= 0.13) { ad.done = true; tryStealNow(p); }
      break;
    case 'cross': case 'spin':
      if (!ad.done) {
        ad.done = true;
        const fx = sin(p.yaw), fz = cos(p.yaw);
        if (p.act === 'cross') { const side = ad.dir || p.hand; p.vx += fz * side * 3.6 + fx * 1.2; p.vz += -fx * side * 3.6 + fz * 1.2; }
        else { p.vx += fx * 4.2; p.vz += fz * 4.2; }
        beatDefender(p, p.act === 'spin' ? 1.1 : 1);
      }
      if (p.act === 'spin') p.yaw += dt * TAU / 0.5;
      break;
    case 'catch': p.vx *= 0.85; p.vz *= 0.85; break;
    default: break;
  }
}
// A crossover or a spin against the man in front: he may bite and lose his feet, or read it and poke the ball.
function beatDefender(p, k) {
  const d = nearestDef(p); if (!d) return;
  const dd = hypot(d.x - p.x, d.z - p.z);
  if (dd > 1.8) return;
  const edge = rat(p, 'hdl') * 1.1 - rat(d, 'def') * 0.9 + (p.sprint ? 0.08 : 0) + (d === M.ctrl ? 0.05 : 0) + rr(-0.25, 0.25);
  if (edge > 0.18 * k) {
    d.stumT = edge > 0.42 ? 1.1 : 0.6; setAct(d, 'stumble', d.stumT);
    if (edge > 0.42) { say('ankles', p); M.noise = min(1, M.noise + 0.15); evt('ankles', p, d); }
  } else if (edge < -0.33 && rnd() < 0.18) {
    // poked loose
    d.st.stl++; p.st.to++;
    looseBall(B.x, 0.6, B.z, rr(-2, 2), 1.5, rr(-2, 2)); B.lastSide = d.side; B.last = d;
    say('pick', d); evt('steal', d, p);
  }
}
function tryStealNow(d) {
  const h = B.holder;
  if (!h || h.side === d.side || B.state !== 'held') return;
  const dx = h.x - d.x, dz = h.z - d.z, dd = hypot(dx, dz);
  if (dd > 1.35) return;
  const facing = cos(Math.atan2(dx, dz) - d.yaw);
  const moving = h.act === 'cross' || h.act === 'spin' ? 0.6 : 1;
  const k = (0.07 + rat(d, 'stl') * 0.28 - rat(h, 'hdl') * 0.22) * (facing > 0.3 ? 1 : 0.4) * (d.side === M.user ? M.diff.steal : 1) * moving * (h.picked ? 1.4 : 1);
  if (rnd() < k) {
    d.st.stl++; h.st.to++;
    looseBall(B.x, 0.5, B.z, (B.x - d.x) * 2 + rr(-1, 1), 1.2, (B.z - d.z) * 2 + rr(-1, 1));
    B.lastSide = d.side; B.last = d;
    say('pick', d); evt('steal', d, h); M.noise = min(1, M.noise + 0.12);
  } else if (rnd() < (facing < 0.2 ? 0.45 : 0.16) * (1.2 - rat(d, 'def') * 0.5)) {
    callFoul(d, h, {});
  }
}
function doReact(p) {
  const r = p.react; p.react = null;
  if (r.what === 'contest') {
    const who = r.who;
    if (p.act === '' && p.y === 0 && who && (who.act === 'shoot' || who.act === 'layup' || who.act === 'dunk') && hypot(who.x - p.x, who.z - p.z) < 2.4) setAct(p, 'block', 0.8);
  } else if (r.what === 'celebrate') { if (p.act === '' || p.act === 'hang') setAct(p, 'celebrate', 1.3); }
  else if (r.what === 'slump') setAct(p, 'slump', 2.5);
}

/* ---------------------------------------------------------------------- team AI */
const SPOTS = {
  motion: [[0, 7.3], [-4.7, 5.4], [4.7, 5.4], [-6.3, 1.0], [1.6, 1.4]],
  iso: [[0, 7.0], [-6.4, 0.8], [6.4, 0.8], [-4.9, 5.6], [4.9, 5.6]],
  pnr: [[0, 7.6], [-6.3, 1.0], [6.3, 1.0], [-4.8, 5.2], [1.2, 6.9]],
  break: [[0, 7.5], [-5.6, 2.6], [5.6, 2.6], [-1.8, 1.4], [0, 9.6]],
};
const ZONE = [[-2.1, 5.6], [2.1, 5.6], [-3.3, 2.1], [3.3, 2.1], [0, 1.3]];
function planOffence(side, how) {
  const st = TEAMS[M.teams[side]].style;
  const fast = (how === 'steal' || how === 'dreb') && rnd() < 0.3 + st.pace * 0.6;
  const r = rnd();
  let set = 'motion';
  if (fast) set = 'break';
  else if (r < st.pnr * 0.7) set = 'pnr';
  else if (r < st.pnr * 0.7 + 0.18) set = 'iso';
  M.off = { side, set, t: 0, screener: null, scrDone: false, scrT: 0, cut: null, cutUntil: 0, nextCutAt: M.t + rr(2, 3.5), startT: M.t, flip: rnd() < 0.5 ? 1 : -1, perm: [0, 1, 2, 3, 4] };
  if (set === 'pnr') M.off.screener = M.court[side][rnd() < 0.7 ? 4 : 3];
  const d = opp(side);
  if (d !== M.user || M.kind !== 'game') M.def[d] = rnd() < TEAMS[M.teams[d]].style.zone * 0.55 ? 'zone' : 'man';
}
export function callScreen(p) {
  if (M.poss !== p.side) return;
  const team = M.court[p.side];
  let best = null, bd = 99;
  for (const t of team) { if (t === p) continue; const d = hypot(t.x - p.x, t.z - p.z) + (t.info.pos === 'C' || t.info.pos === 'PF' ? -2 : 0); if (d < bd) { bd = d; best = t; } }
  if (!best) return;
  M.off.set = 'pnr'; M.off.screener = best; M.off.scrDone = false; M.off.t = 0; M.off.scrFor = p;
  say('screen', best);
}
function offTarget(p, out) {
  const side = p.side, O = M.off, i = M.court[side].indexOf(p);
  const set = SPOTS[O.set] || SPOTS.motion;
  const sp = set[O.perm[i] == null ? i : O.perm[i]];
  let x = sp[0] * O.flip, d = sp[1];
  // a cutter goes to the rim and back out
  if (O.cut === p && M.t < O.cutUntil) { x = O.cutX; d = 0.9; }
  // the screener sets the pick on the ball handler's man, then rolls
  if (O.set === 'pnr' && O.screener === p && B.holder && B.holder.side === side && B.holder !== p) {
    const h = B.holder, dm = M.match[side === 0 ? 1 : 0][M.court[side].indexOf(h)] || nearestDef(h);
    if (!O.scrDone && dm) {
      const hz = hoopZ(side), ax = dm.x - h.x, az = dm.z - h.z, al = hypot(ax, az) || 1;
      const sx = -az / al * O.flip, sz = ax / al * O.flip;
      out.x = dm.x + sx * 0.55; out.z = dm.z + sz * 0.55; void hz;
      if (hypot(p.x - out.x, p.z - out.z) < 0.5) { if (p.act !== 'screen') setAct(p, 'screen', 9); O.scrT = (O.scrT || 0) + 0.016; }
      if (O.scrT > 2.4 || hypot(h.x - p.x, h.z - p.z) < 0.9 && O.scrT > 0.4) { O.scrDone = true; if (p.act === 'screen') p.act = ''; O.rollUntil = M.t + 2.5; }
      return out;
    }
    if (O.scrDone && M.t < (O.rollUntil || 0)) { x = 0.6 * O.flip; d = 1.4; }
  }
  if (!inFront(B.holder || p, side) && O.set !== 'break') d = max(d, 4.5);
  out.x = clamp(x, -CT.HW + 0.35, CT.HW - 0.35); out.z = spotZ(side, d);
  return out;
}
const _t = { x: 0, z: 0 };
function laneOpen(p, tx, tz, w) {
  for (const d of M.court[opp(p.side)]) {
    const ax = tx - p.x, az = tz - p.z, l2 = ax * ax + az * az || 1;
    const u = clamp(((d.x - p.x) * ax + (d.z - p.z) * az) / l2, 0, 1);
    if (u < 0.08) continue;
    if (hypot(p.x + ax * u - d.x, p.z + az * u - d.z) < w) return false;
  }
  return true;
}
function passTarget(p, dirX, dirZ) {
  let best = null, bv = -9;
  for (const t of M.court[p.side]) {
    if (t === p) continue;
    const dx = t.x - p.x, dz = t.z - p.z, d = hypot(dx, dz);
    if (d > 16 || d < 1.2) continue;
    let v;
    if (dirX != null) v = (dx * dirX + dz * dirZ) / d * 2 - d * 0.04;
    else {
      const c = shotChance(t, distHoop(t) < 2.2 ? 'layup' : 'jumper', t.x, t.z);
      v = c.p * (c.three ? 3 : 2) + (openness(t) > 2.2 ? 0.2 : 0) - d * 0.015 + (laneOpen(p, t.x, t.z, 0.8) ? 0.2 : -0.5);
    }
    if (v > bv) { bv = v; best = t; }
  }
  return { t: best, v: bv };
}
function passType(p, t) {
  if (!laneOpen(p, t.x, t.z, 0.75)) return hypot(t.x - p.x, t.z - p.z) > 5 ? 'lob' : 'bounce';
  return 'chest';
}
function canDunk(p) { return p.info.rat.dnk * (p.side === M.user ? 1 : M.diff.ai) > 55 && p.h * 1.33 + 0.75 + rat(p, 'dnk') * 0.25 > CT.RIM_Y + 0.15; }
// Off the dribble: the ball handler weighs the shot he has, the drive, the pass and the play call.
function aiHandler(p, dt) {
  if (p.act && p.act !== 'catch' && p.act !== 'screen') return;
  const side = p.side, hz = hoopZ(side), dh = distHoop(p), open = openness(p);
  const st = TEAMS[M.teams[side]].style;
  p.ai.think -= dt;
  // on the way to the rim
  if (p.ai.drive) {
    p.sprint = true;
    if (dh < 2.3 && !p.picked) { startShot(p, canDunk(p) && rnd() < 0.75 && open > 0.6 ? 'dunk' : 'layup', false); p.ai.drive = false; return; }
    if (!laneOpen(p, 0, hz, 0.7) && dh > 2.6 && p.ai.think <= 0) { p.ai.drive = false; p.ai.think = 0.15; }
    p.ai.tx = 0; p.ai.tz = hz - M.dir[side] * 0.9;
    return;
  }
  // bring it up
  const front = inFront(p, side);
  p.sprint = !front && M.off.set === 'break';
  if (p.ai.think > 0) return;
  p.ai.think = rr(M.diff.react[0], M.diff.react[1]) + (open < 1 ? 0.12 : 0);
  if (!front) { offTarget(p, _t); p.ai.tx = _t.x; p.ai.tz = _t.z; if (M.shot < 6) p.sprint = true; return; }
  // the odd human slip
  if (rnd() < 0.0025 * M.diff.err * (1.4 - rat(p, 'hdl')) && M.kind === 'game' && p.side !== M.user) { violation('Travelling', side); return; }
  const c = shotChance(p, dh < 2.2 ? 'layup' : 'jumper', p.x, p.z), val = c.p * (c.three ? 3 : 2);
  const urgent = M.shot < 4 || (M.clock < 5 && M.clock < M.shot);
  const lane = laneOpen(p, 0, hz, 0.95) && dh < 9.5;
  const pt = passTarget(p);
  const thr = c.three ? 1.05 - st.three * 0.2 : 0.88;
  if (urgent && (dh < 9 || M.shot < 1.6)) { if (dh < 2.4) startShot(p, canDunk(p) ? 'dunk' : 'layup', false); else startShot(p, 'jumper', false); return; }
  if (open > 1.6 && val > thr * (1 - p.conf * 0.08) && dh < 8.2) { startShot(p, 'jumper', false); return; }
  if (lane && rat(p, 'fin') > 0.55 && rnd() < 0.55 + (M.off.set === 'iso' ? 0.2 : 0)) { p.ai.drive = true; return; }
  // the alley-oop when a big is cutting free at the rim
  if (pt.t && distHoop(pt.t) < 3 && canDunk(pt.t) && rnd() < 0.3 && openness(pt.t) > 1.4) { startPass(p, pt.t, 'lob'); p.ad.alley = true; return; }
  if (pt.t && pt.v > val + 0.18 && rnd() < 0.8) { startPass(p, pt.t, passType(p, pt.t)); return; }
  const dd = nearestD(M.court[opp(side)], p.x, p.z);
  if (dd < 1.25 && rat(p, 'hdl') > 0.62 && rnd() < 0.35) { setAct(p, rnd() < 0.7 ? 'cross' : 'spin', rnd() < 0.7 ? 0.36 : 0.5, { dir: rnd() < 0.5 ? 1 : -1 }); p.hand = -p.hand; return; }
  if (pt.t && rnd() < 0.3) { startPass(p, pt.t, passType(p, pt.t)); return; }
  // probe: attack a gap, or work back to the spot
  if (M.off.set === 'pnr' && M.off.screener && M.off.screener.act === 'screen') { const s = M.off.screener; p.ai.tx = s.x + (s.x - p.x) * 1.2; p.ai.tz = s.z + (hz - s.z) * 0.3; p.sprint = true; return; }
  offTarget(p, _t);
  p.ai.tx = clamp(_t.x + rr(-1.5, 1.5), -CT.HW + 0.6, CT.HW - 0.6); p.ai.tz = _t.z + rr(-1, 1) * M.dir[side];
}
function aiOffBall(p, dt) {
  const side = p.side, O = M.off;
  if (p.ai.alley) {
    // timing the jump for the lob
    if (p.act === '' && M.t >= p.ai.alley.at && B.state === 'pass') { startShot(p, 'dunk', false, { alley: true }); p.ad.wait = true; }
    moveTo(p, 0, hoopZ(side) - M.dir[side] * 1.0, 1, dt);
    if (M.t > p.ai.alley.at + 1.5) p.ai.alley = null;
    return;
  }
  if (p.act === 'screen') { p.vx *= 0.6; p.vz *= 0.6; offTarget(p, _t); return; }
  if (B.state === 'shot' || (B.state === 'loose' && M.lastShotSide >= 0)) { rebound(p, dt); return; }
  if (B.state === 'loose') { chase(p, dt); return; }
  // motion: one player cuts every few seconds, the spots rotate
  O.t += dt / 5;
  if (B.holder && B.holder.side === side && inFront(B.holder, side) && M.t > O.nextCutAt && O.set !== 'break') {
    const others = M.court[side].filter((q) => q !== B.holder && q !== O.screener);
    if (others.length) { O.cut = pick(others); O.cutUntil = M.t + rr(1.1, 1.6); O.cutX = rr(-0.8, 0.8); }
    O.nextCutAt = M.t + rr(2.5, 4.5);
    if (rnd() < 0.4) { const a = (rnd() * 5) | 0, b = (rnd() * 5) | 0; const t = O.perm[a]; O.perm[a] = O.perm[b]; O.perm[b] = t; }
  }
  if (O.set === 'break' && M.t - O.startT > 5) { O.set = 'motion'; }
  offTarget(p, _t);
  p.sprint = O.set === 'break' || (O.cut === p && M.t < O.cutUntil);
  moveTo(p, _t.x, _t.z, 0.9, dt);
}
function defTarget(p, out) {
  const s = p.side, o = opp(s), hz = hoopZ(o), i = M.court[s].indexOf(p);
  const h = B.holder;
  const transition = !h || h.side !== o || !inFront(h, o);
  if (M.def[s] === 'zone' && !transition) {
    const z = ZONE[i] || ZONE[4];
    let x = z[0] + clamp(B.x, -5, 5) * 0.3, d = z[1];
    // the zone defender nearest the ball steps out to it
    let near = null, nd = 99;
    for (const q of M.court[s]) { const zz = ZONE[M.court[s].indexOf(q)]; const dd = hypot(zz[0] - h.x, spotZ(o, zz[1]) - h.z); if (dd < nd) { nd = dd; near = q; } }
    if (near === p) { const ax = 0 - h.x, az = hz - h.z, al = hypot(ax, az) || 1; out.x = h.x + ax / al * 1.0; out.z = h.z + az / al * 1.0; return out; }
    out.x = x; out.z = spotZ(o, d); return out;
  }
  const man = M.match[s][i] || nearest(M.court[o], p.x, p.z);
  const onBall = man === h;
  let gap;
  if (onBall) gap = clamp(1.05 - rat(p, 'def') * 0.25 + (distHoop(man, o) > 8 ? 0.6 : 0), 0.6, 1.8);
  else gap = 1.2 + min(3, hypot(man.x - B.x, man.z - B.z) * 0.32);
  if (transition && !onBall) gap += 1.2;
  const ax = 0 - man.x, az = hz - man.z, al = hypot(ax, az) || 1;
  out.x = man.x + ax / al * gap; out.z = man.z + az / al * gap;
  if (!onBall) { out.x = lerp(out.x, B.x, 0.18); out.z = lerp(out.z, B.z, 0.12); }
  // help at the rim on a drive, from the big nearest to it
  if (h && h.side === o && distHoop(h, o) < 3.4 && !onBall && i >= 3 && hypot(p.x, p.z - hz) < 4.5) {
    out.x = lerp(h.x, 0, 0.45); out.z = lerp(h.z, hz, 0.45);
  }
  return out;
}
function aiDefence(p, dt) {
  if (B.state === 'shot' || (B.state === 'loose' && M.lastShotSide >= 0)) { rebound(p, dt); return; }
  if (B.state === 'loose') { chase(p, dt); return; }
  defTarget(p, _t);
  const h = B.holder;
  const onBall = h && h.side !== p.side && hypot(h.x - p.x, h.z - p.z) < 1.6;
  p.sprint = hypot(_t.x - p.x, _t.z - p.z) > 3;
  moveTo(p, _t.x, _t.z, 1, dt, onBall ? faceTo(p, h.x, h.z) : (h ? faceTo(p, lerp(h.x, 0, 0.3), h.z) : null));
  if (p.act === '' && p.y === 0) p.def = onBall ? 1 : 0.4;
  p.ai.think -= dt;
  if (onBall && p.ai.think <= 0 && p.act === '') {
    p.ai.think = rr(M.diff.react[0], M.diff.react[1]) + 0.25;
    if (rnd() < 0.035 * rat(p, 'stl') * (M.shot < 6 ? 1.6 : 1) * (p.side === M.user ? 1 : M.diff.steal)) setAct(p, 'steal', 0.4, {});
  }
}
// The shot is up: bigs fight for position, everyone tracks where it will come down.
function rebound(p, dt) {
  const shooting = M.lastShotSide;
  const hz = B.shot ? B.shot.hz : (B.z > 0 ? CT.HOOP : -CT.HOOP);
  let tx, tz;
  if (p.side === shooting && !p.ai.crash) { tx = p.x * 0.6; tz = -M.dir[p.side] * 2; p.sprint = false; }
  else if (B.state === 'loose') {
    const lead = clamp(0.25 + (B.y > 2 ? 0.3 : 0), 0, 0.6);
    tx = B.x + B.vx * lead; tz = B.z + B.vz * lead; p.sprint = true;
  } else {
    const ang = Math.atan2(p.x, p.z - hz), r = 1.6 + (p.side === shooting ? 0 : -0.25);
    tx = sin(ang) * r; tz = hz + cos(ang) * r * (hz > 0 ? 1 : 1);
    if ((tz - hz) * Math.sign(hz) > 0) tz = hz - Math.sign(hz) * 0.8;
  }
  moveTo(p, tx, tz, 1, dt, faceTo(p, B.x, B.z));
  const dd = hypot(B.x - p.x, B.z - p.z);
  if (p.act === '' && p.y === 0 && dd < 1.3 && B.y < p.h * 1.3 + 0.95 && B.y > p.h * 1.05 && B.vy < 0.5 && (B.state === 'loose' || (B.shot && B.shot.done)) && rnd() < 0.5) setAct(p, 'rebound', 0.75);
}
function chase(p, dt) {
  const team = M.court[p.side];
  // the two nearest of each side go for a loose ball, the rest hold their ground
  let rank = 0; const dme = hypot(B.x - p.x, B.z - p.z);
  for (const q of team) if (q !== p && hypot(B.x - q.x, B.z - q.z) < dme) rank++;
  p.sprint = true;
  if (rank < 2) moveTo(p, B.x + B.vx * 0.2, B.z + B.vz * 0.2, 1, dt);
  else { p.vx *= 0.9; p.vz *= 0.9; }
}
function aiTick(p, dt) {
  if (M.phase === 'ft') { p.vx *= 0.8; p.vz *= 0.8; if (M.ft && p !== M.ft.by && B.state === 'shot' && M.ft.last) rebound(p, dt); return; }
  if (M.phase === 'inbound') {
    if (M.inb && p === M.inb.by) { p.vx = p.vz = 0; return; }
    if (p.side === M.poss) { offTarget(p, _t); moveTo(p, _t.x * 0.8, lerp(_t.z, M.inb ? M.inb.by.z : 0, 0.25), 0.9, dt); }
    else { defTarget(p, _t); moveTo(p, _t.x, _t.z, 1, dt); }
    return;
  }
  if (p.act === 'shoot' || p.act === 'layup' || p.act === 'dunk' || p.act === 'hang' || p.act === 'pass' || p.act === 'stumble' || p.act === 'fall') return;
  if (B.holder === p) { aiHandler(p, dt); if (B.holder === p && (p.act === '' || p.act === 'catch' || p.act === 'cross' || p.act === 'spin')) moveTo(p, p.ai.tx || p.x, p.ai.tz || p.z, p.sprint ? 1 : 0.8, dt); return; }
  if (M.poss === p.side && B.state !== 'loose') aiOffBall(p, dt);
  else if (M.poss === p.side) aiOffBall(p, dt);
  else aiDefence(p, dt);
}
// While the ball is dead players drift to where play restarts.
function aiDead(p, dt) {
  const nx = M.next;
  if (p.act === 'hang' || p.act === 'celebrate' || p.act === 'slump') { p.vx *= 0.9; p.vz *= 0.9; return; }
  if (!nx) { p.vx *= 0.9; p.vz *= 0.9; return; }
  if (nx.type === 'ft') {
    const s = nx.shooter.side, d = M.dir[s];
    if (p === nx.shooter) moveTo(p, 0, d * CT.FT, 0.6, dt);
    else moveTo(p, p.x * 0.7, d * (CT.HOOP - 3), 0.5, dt);
    return;
  }
  const side = nx.side;
  if (p.side === side) { const i = M.court[side].indexOf(p); const sp = SPOTS.motion[i]; moveTo(p, sp[0] * 0.8, spotZ(side, max(6, sp[1] + 3)) * (nx.base ? 0.2 : 1) - (nx.base ? M.dir[side] * 6 : 0), 0.55, dt); }
  else { const i = M.court[p.side].indexOf(p); const sp = ZONE[i]; moveTo(p, sp[0], spotZ(opp(p.side), sp[1] + 1.5), 0.6, dt); }
}
function looseCheck() {
  if (B.state !== 'loose' && !(B.state === 'shot' && B.shot && B.shot.done && !B.shot.make && !B.guide)) return;
  let best = null, bs = -9;
  for (const p of courtPlayers()) {
    if (p.stumT > 0 || p.act === 'fall' || p.act === 'hang') continue;
    const d = hypot(B.x - p.x, B.z - p.z);
    if (d > 0.85) continue;
    const reach = p.h * 1.27 + p.y + (p.act === 'rebound' ? 0.2 : 0);
    if (B.y > reach || (B.vy > 2.5 && B.y > 1.6)) continue;
    const sc = (0.9 - d) + rat(p, 'reb') * 0.8 + p.y * 1.4 + (p.h - 1.95) * 1.2 + rnd() * 0.55 + (p === M.ctrl && p.act === 'rebound' ? 0.3 : 0) + (p.side !== M.lastShotSide ? 0.15 : 0);
    if (sc > bs) { bs = sc; best = p; }
  }
  if (!best) return;
  const fromShot = M.lastShotSide >= 0;
  if (fromShot && M.kind === 'game') {
    best.st.reb++; if (best.side === M.lastShotSide) best.st.oreb++;
    if (best.y > 0.2 || rnd() < 0.4) say(best.side === M.lastShotSide ? 'oreb' : 'dreb', best);
  }
  const how = fromShot ? (best.side === M.lastShotSide ? 'oreb' : 'dreb') : 'loose';
  M.lastShotSide = -1;
  if (best.y > 0.15 && best.act !== 'rebound') setAct(best, 'rebound', 0.4, { up: true });
  giveBall(best, how);
}
// Rules a referee watches during live play: travelling after a pump fake, the backcourt, eight seconds, the lines.
function rulesCheck(dt) {
  const h = B.holder;
  if (B.state === 'shot' && B.shot && !B.shot.counted) { B.shot.counted = true; M.lastShotSide = B.shot.side; }
  if (!h || B.state !== 'held' || M.kind !== 'game') return;
  if (h.side !== M.poss) return;
  if (inFront(h, h.side) && abs(h.z) > 0.15) M.front = true;
  else if (!M.front) { M.backT += dt; if (M.backT > 8) { violation('8-second violation', h.side); return; } }
  if (M.front && h.z * M.dir[h.side] < -0.2 && h.act !== 'inbound') { violation('Backcourt violation', h.side); return; }
  if (h.picked && h.act === '' && hypot(h.x - h.pvx, h.z - h.pvz) > 1.15 && h.y === 0) { violation('Travelling', h.side); return; }
  if (!onCourt(h.x, h.z) && h.act !== 'inbound' && h.y === 0) { violation('Stepped out of bounds', h.side); }
}
function refsUpdate(dt) {
  for (let i = 0; i < M.refs.length; i++) {
    const r = M.refs[i];
    const tz = clamp(B.z + (i ? -3 : 3), -11, 11), tx = (i ? 1 : -1) * (CT.HW + 0.7);
    const dx = tx - r.x, dz = tz - r.z, d = hypot(dx, dz), sp = min(4, d * 1.5);
    const wx = d > 0.05 ? dx / d * sp : 0, wz = d > 0.05 ? dz / d * sp : 0;
    r.vx = lerp(r.vx, wx, 1 - Math.exp(-dt * 5)); r.vz = lerp(r.vz, wz, 1 - Math.exp(-dt * 5));
    r.x += r.vx * dt; r.z += r.vz * dt; r.yaw = turn(r.yaw, Math.atan2(B.x - r.x, B.z - r.z), dt * 4);
    r.actT += dt;
  }
}

/* ---------------------------------------------------------------------- the user's player */
export const U = { lastRel: null, relT: 9, msg: '', msgT: 0, swipe: null, switchT: 0 };
const shootHeld = () => { const i = arc.input; return i.down('Space', 'KeyJ') || (i.pointer.down && i.pointer.type === 'mouse' && !arc.touchMode); };
const shootHit = () => { const i = arc.input; return i.hit('Space', 'KeyJ') || (i.pointer.pressed && i.pointer.type === 'mouse' && !arc.touchMode); };
// timing of a release: 1 inside the window, falling off either side
export function timingOf(m, win) {
  const e = m - 1;
  if (abs(e) <= win) return { t: 1, early: false, late: false, e };
  return { t: clamp(1 - (abs(e) - win) / 0.42, 0, 1), early: e < 0, late: e > 0, e };
}
function userRelease(p, m, preset) {
  const tm = preset || timingOf(m, M.diff.win);
  p.ad.timing = tm.t; p.ad.early = tm.early && tm.t < 0.9; p.ad.late = tm.late && tm.t < 0.9;
  U.lastRel = tm; U.relT = 0;
  U.msg = tm.t >= 0.999 ? 'Perfect release' : tm.t > 0.7 ? (tm.early ? 'Slightly early' : 'Slightly late') : tm.early ? 'Early' : 'Late'; U.msgT = 1.2;
  if (tm.t >= 0.999) evt('perfect', p);
  releaseShot(p);
}
function swipeTiming(sw) { const t = clamp(1 - abs(sw.power - 0.62) / 0.32, 0, 1); return { t: t > 0.86 ? 1 : t, early: sw.power < 0.62, late: sw.power > 0.62 }; }
function rimShot(p, wantDunk) {
  const kind = wantDunk && canDunk(p) && p.spd > 2.2 ? 'dunk' : 'layup';
  startShot(p, kind, true);
}
function userTick(p, dt) {
  const inp = arc.input, ax = inp.axis();
  const w = view.stick(ax.x, ax.y);
  const mag = min(1, hypot(w.x, w.z));
  const tap = inp.tap(), sw = inp.swipe();
  p.sprint = inp.down('ShiftLeft', 'ShiftRight');
  if (inp.hit('KeyT')) { if (requestTimeout(p.side)) return; }
  if (M.phase === 'ft') { userFT(p, dt, sw); return; }
  if (M.phase === 'inbound') { if (M.inb && p === M.inb.by) return; }
  const holder = B.holder === p;
  // a jump shot on the button: rise while held, release at the top
  if (p.act === 'shoot' && p.ad && p.ad.user && !p.ad.rel) {
    const m = p.actT / RISE;
    if (p.ad.swipe) { if (m >= 1) userRelease(p, m, p.ad.swipe); }
    else if (!shootHeld()) {
      if (m < 0.34) { // a pump fake: the dribble is gone, but the defender may have left his feet
        p.act = ''; p.actD = 0; p.ad = null; p.picked = true; p.pvx = p.x; p.pvz = p.z; p.vy = 0;
        U.msg = 'Pump fake'; U.msgT = 0.9; evt('pumpfake', p);
      } else userRelease(p, m);
    } else if (m > 2.1) userRelease(p, m);
    return;
  }
  if (p.act === 'layup' || p.act === 'dunk' || p.act === 'hang' || p.act === 'pass' || p.act === 'stumble' || p.act === 'shoot' || p.act === 'fall') return;
  // move
  if (mag > 0.08 && !(holder && p.picked && p.act === '' && M.kind !== 'practice' && false)) {
    moveTo(p, p.x + w.x / mag * 3, p.z + w.z / mag * 3, mag, dt);
  } else if (M.poss !== p.side && B.state === 'held' && B.holder && B.holder.side !== p.side && M.kind === 'game') {
    defTarget(p, _t); moveTo(p, _t.x, _t.z, 0.85, dt, faceTo(p, B.holder.x, B.holder.z));
  } else steer(p, 0, 0, dt);
  if (holder) {
    const dh = distHoop(p);
    if (shootHit() || (sw && sw.dir === 'up')) {
      if (dh < 2.6 && !p.picked) rimShot(p, p.sprint || (sw && sw.power > 0.75));
      else { startShot(p, 'jumper', true); if (sw) p.ad.swipe = swipeTiming(sw); }
      return;
    }
    if (inp.hit('KeyK') || tap) {
      let t;
      if (mag > 0.35) t = passTarget(p, w.x / mag, w.z / mag).t; else t = passTarget(p).t;
      if (t) startPass(p, t, passType(p, t));
      return;
    }
    if (inp.hit('KeyL')) {
      const t = mag > 0.35 ? passTarget(p, w.x / mag, w.z / mag).t : passTarget(p).t;
      if (t) {
        startPass(p, t, 'lob');
        if (distHoop(t) < 4.2 && canDunk(t)) { p.ad.alley = true; U.msg = 'Alley-oop'; U.msgT = 1; }
      }
      return;
    }
    if (!p.picked && (inp.hit('KeyE') || inp.hit('KeyQ') || (sw && (sw.dir === 'left' || sw.dir === 'right' || sw.dir === 'down')))) {
      const spin = inp.hit('KeyQ') || (sw && sw.dir === 'down') || (inp.hit('KeyE') && p.sprint);
      let dir = -p.hand;
      if (sw && (sw.dir === 'left' || sw.dir === 'right')) { const sx = view.stick(sw.dir === 'left' ? -1 : 1, 0); dir = (sx.x * cos(p.yaw) - sx.z * sin(p.yaw)) > 0 ? 1 : -1; }
      else if (mag > 0.3) dir = (w.x * cos(p.yaw) - w.z * sin(p.yaw)) > 0 ? 1 : -1;
      setAct(p, spin ? 'spin' : 'cross', spin ? 0.5 : 0.36, { dir }); p.hand = dir;
      return;
    }
    if (inp.hit('KeyC')) { callScreen(p); return; }
    return;
  }
  // without the ball
  const theirs = B.state === 'held' && B.holder && B.holder.side !== p.side;
  if (inp.hit('KeyK') || tap) { switchPlayer(p); return; }
  if (shootHit() || (sw && sw.dir === 'up')) {
    if (p.y === 0 && p.act === '') setAct(p, theirs ? 'block' : 'rebound', 0.8);
    return;
  }
  if (theirs && (inp.hit('KeyE') || (sw && (sw.dir === 'left' || sw.dir === 'right')))) { if (p.act === '') setAct(p, 'steal', 0.42, {}); return; }
  if (!theirs && inp.hit('KeyC') && M.poss === p.side && B.holder) { /* off the ball: ask for it */ startPass(B.holder, p, passType(B.holder, p)); }
}
function switchPlayer(p) {
  const team = M.court[p.side];
  const tx = B.holder ? B.holder.x : B.x, tz = B.holder ? B.holder.z : B.z;
  const list = team.filter((q) => q !== p).sort((a, b) => hypot(a.x - tx, a.z - tz) - hypot(b.x - tx, b.z - tz));
  if (list[0]) { M.ctrl = list[0]; evt('switch', list[0]); }
}
function userFT(p, dt, sw) {
  if (p.act !== 'ft' || !p.ad || p.ad.rel) return;
  const ad = p.ad;
  if (sw && sw.dir === 'up') { const tm = swipeTiming(sw); ad.timing = tm.t; U.lastRel = tm; U.relT = 0; U.msg = tm.t >= 0.999 ? 'Perfect release' : tm.t > 0.6 ? 'Good' : 'Off'; U.msgT = 1; releaseShot(p); if (M.ft && M.ft.last) { M.phase = 'live'; M.phaseT = 0; } return; }
  if (!ad.charging && shootHeld()) { ad.charging = true; ad.c0 = p.actT; }
  if (ad.charging) {
    const m = (p.actT - ad.c0) / 0.7;
    ad.m = m;
    if (!shootHeld() || m > 2) { const tm = timingOf(m, M.diff.win * 1.2); ad.timing = tm.t; U.lastRel = tm; U.relT = 0; U.msg = tm.t >= 0.999 ? 'Perfect release' : tm.early ? 'Early' : 'Late'; U.msgT = 1; releaseShot(p); if (M.ft && M.ft.last) { M.phase = 'live'; M.phaseT = 0; } }
  } else if (p.actT > 7) { ad.timing = 0.55; releaseShot(p); if (M.ft && M.ft.last) { M.phase = 'live'; M.phaseT = 0; } }
}

/* ---------------------------------------------------------------------- replays */
// The last few seconds, thirty times a second: every player and the ball, enough to play a moment back slowly.
const REC_HZ = 30, REC_N = 150, REC_P = 10, REC_W = 3 + REC_P * 9;
function recReset() { M.rec = { buf: new Float32Array(REC_N * REC_W), ids: new Int16Array(REC_N * REC_P), head: 0, n: 0, acc: 0 }; M.all.forEach((p, i) => { p.gi = i; }); }
function recFrame(dt) {
  const R = M.rec; if (!R) return;
  R.acc += dt; if (R.acc < 1 / REC_HZ) return; R.acc -= 1 / REC_HZ; if (R.acc > 0.1) R.acc = 0;
  const o = R.head * REC_W, buf = R.buf;
  buf[o] = B.x; buf[o + 1] = B.y; buf[o + 2] = B.z;
  const list = courtPlayers();
  for (let i = 0; i < REC_P; i++) {
    const p = list[i], k = o + 3 + i * 9;
    R.ids[R.head * REC_P + i] = p ? p.gi : -1;
    if (!p) continue;
    buf[k] = p.x; buf[k + 1] = p.z; buf[k + 2] = p.y; buf[k + 3] = p.yaw; buf[k + 4] = ACT[p.act] || 0; buf[k + 5] = p.actT; buf[k + 6] = p.spd; buf[k + 7] = B.holder === p ? 1 : 0; buf[k + 8] = p.hand;
  }
  R.head = (R.head + 1) % REC_N; R.n = min(REC_N, R.n + 1);
}
function startReplay(w) {
  const R = M.rec; if (!R || R.n < 30) return;
  const frames = min(R.n - 2, Math.round(2.8 * REC_HZ));
  const keep = courtPlayers().map((p) => ({ p, x: p.x, z: p.z, y: p.y, yaw: p.yaw, act: p.act, actT: p.actT, actD: p.actD, ad: p.ad, spd: p.spd, vx: p.vx, vz: p.vz, hand: p.hand }));
  M.replay = { t: 0, frames, start: (R.head - frames + REC_N) % REC_N, speed: 0.42, why: w.why, who: w.who, hz: M.kind === 'dunk' ? CT.HOOP : w.who ? hoopZ(w.who.side) : (B.z > 0 ? CT.HOOP : -CT.HOOP), keep, ball: { x: B.x, y: B.y, z: B.z, state: B.state, holder: B.holder, free: B.free } };
  evt('replay', w);
}
function replayUpdate(dt) {
  const Rp = M.replay, R = M.rec;
  Rp.t += dt * Rp.speed;
  const skip = (arc.input.hit('Space') || arc.input.hit('Enter') || arc.input.tap() || arc.input.hit('KeyK')) && Rp.t > 0.25;
  const f = Rp.t * REC_HZ;
  if (f >= Rp.frames - 1 || skip) { endReplay(); return; }
  const f0 = f | 0, a = f - f0;
  const i0 = (Rp.start + f0) % REC_N, i1 = (Rp.start + f0 + 1) % REC_N;
  const o0 = i0 * REC_W, o1 = i1 * REC_W, buf = R.buf;
  B.x = lerp(buf[o0], buf[o1], a); B.y = lerp(buf[o0 + 1], buf[o1 + 1], a); B.z = lerp(buf[o0 + 2], buf[o1 + 2], a);
  B.state = 'replay'; B.holder = null;
  for (let i = 0; i < REC_P; i++) {
    const gi = R.ids[i0 * REC_P + i]; if (gi < 0) continue;
    const p = M.all[gi]; if (!p) continue;
    const k0 = o0 + 3 + i * 9, k1 = o1 + 3 + i * 9;
    const nx = lerp(buf[k0], buf[k1], a), nz = lerp(buf[k0 + 1], buf[k1 + 1], a);
    p.vx = (buf[k1] - buf[k0]) * REC_HZ; p.vz = (buf[k1 + 1] - buf[k0 + 1]) * REC_HZ;
    p.x = nx; p.z = nz; p.y = lerp(buf[k0 + 2], buf[k1 + 2], a);
    let dy = buf[k1 + 3] - buf[k0 + 3]; while (dy > PI) dy -= TAU; while (dy < -PI) dy += TAU; p.yaw = buf[k0 + 3] + dy * a;
    p.act = ACTN[buf[k0 + 4]] || ''; p.actT = buf[k0 + 5] + (buf[k1 + 4] === buf[k0 + 4] ? (buf[k1 + 5] - buf[k0 + 5]) * a : 0); p.spd = lerp(buf[k0 + 6], buf[k1 + 6], a); p.hand = buf[k0 + 8];
    if (buf[k0 + 7] > 0.5) p.repBall = true; else p.repBall = false;
  }
}
function endReplay() {
  const Rp = M.replay; if (!Rp) return;
  Rp.keep.forEach((k) => { Object.assign(k.p, { x: k.x, z: k.z, y: k.y, yaw: k.yaw, act: k.act, actT: k.actT, actD: k.actD, ad: k.ad, spd: k.spd, vx: k.vx, vz: k.vz, hand: k.hand, repBall: false }); });
  Object.assign(B, Rp.ball);
  M.replay = null;
  evt('replayEnd');
}
export const replaying = () => !!M.replay;

/* ---------------------------------------------------------------------- commentary */
// Two voices from the broadcast booth. Every line is original.
const BOOTH = ['Meera Rao', 'Tom Haddad'];
const LINES = {
  welcome: ['Welcome to the {league}. The lights are up and this place is loud.', 'Good evening, and what a crowd we have for this one.'],
  introduce: ['Here come the starters, and the building is shaking.', 'Lights down, spotlight up: here are your starting five.'],
  introaway: ['And the visitors, who will not care much for the noise.'],
  tip: ['And we are under way, the {t} win the tip.', 'Tip-off! First possession to the {t}.'],
  three: ['{n} from deep... yes!', 'Splash. Three for {n}.', 'Way out, and it drops for {n}!', '{n} lets it fly, and it is good.', 'From the parking lights, {n}!'],
  jumper: ['{n} pulls up, and it is money.', 'Nothing but net from {n}.', '{n} rises and knocks it down.', 'Smooth from {n}.'],
  layup: ['{n} kisses it off the glass.', 'Easy two for {n}.', '{n} slices in and lays it up.', 'Finger roll from {n}.'],
  dunk: ['{n} throws it down!', 'A hammer from {n}!', '{n} rises up and slams it home!', 'Oh my, {n} with authority!'],
  poster: ['{n} just dunked right on top of him!'],
  alley: ['Lob, catch, slam! What a connection.', 'The alley-oop to {n}, the roof nearly came off!'],
  dunkgo: [], threego: [], shotgo: [],
  miss: ['{n} cannot find the range.', 'Off the iron.', 'In and out! So close for {n}.', 'Long, and the board takes it.'],
  airball: ['Air ball. {n} will want that one back.', 'That one found nothing at all.'],
  block: ['Rejected! {n} sends it back.', '{n} says not in here!', 'Big block from {n}!', 'Swatted away by {n}!'],
  pick: ['Picked clean by {n}!', '{n} jumps the lane and he is gone.', 'Quick hands from {n}.'],
  ankles: ['{n} with the crossover, his man is on the floor!', 'Look at that handle from {n}. Defender lost his footing.'],
  oreb: ['{n} crashes the glass for another chance.', 'Second chance, {n} with the offensive board.'],
  dreb: ['{n} cleans it up.', 'Rebound {n}.'],
  foul: ['Whistle. Foul on {n}.', '{n} gets caught reaching.', 'Contact, and that is on {n}.'],
  shootfoul: ['Foul on the shot, {n} the culprit.', 'He was hit on the arm, and the whistle goes on {n}.'],
  andone: ['And one! {n} gets the bucket and the foul!', 'Plus the foul! {n} is going to the line.'],
  ftline: ['{n} steps to the line.'], ftmake: ['Good from the line.', 'Calm at the stripe, {n}.'],
  foulout: ['{n} has fouled out of this one.'],
  violation: ['{v}.', 'The referee spots it: {v}.'],
  out: ['Out of bounds.'],
  timeout: ['The {t} call time to regroup.', 'Timeout, {t}. They need to stop this run.'],
  run: ['The {t} are on a {r}-0 run here!', 'This is a {r}-0 burst from the {t}.'],
  qend: ['That is the end of the quarter.', 'And the horn sounds on the quarter.'],
  half: ['Halftime. Both benches have some thinking to do.'],
  ot: ['We are going to overtime!', 'Extra time, and nobody in here is sitting down.'],
  buzzer: ['At the buzzer... it counts!', 'Beat the horn! Unbelievable!'],
  final: ['That is the game!', 'And the final horn goes.'],
  screen: ['{n} comes up to set the screen.'], sub: ['{n} checks in.'],
};
export function say(kind, x) {
  const list = LINES[kind]; if (!list || !list.length || M.replay) return;
  if (M.kind !== 'game' && kind !== 'welcome') return;
  const now = M.t;
  if (M.lineT && now - M.lineT < 1.4 && kind !== 'buzzer' && kind !== 'final' && kind !== 'run') return;
  let s = list[(rnd() * list.length) | 0];
  const n = x && x.info ? x.info.first + ' ' + x.info.last : '';
  const tName = typeof x === 'number' ? TEAMS[M.teams[x]].name : x && x.side != null ? TEAMS[M.teams[x.side]].name : '';
  s = s.replace('{n}', n).replace('{t}', tName).replace('{league}', LEAGUE).replace('{v}', typeof x === 'string' ? x : '').replace('{r}', String(M.run.pts));
  M.lines.push({ who: BOOTH[(rnd() * 2) | 0], text: s, t: now });
  if (M.lines.length > 4) M.lines.shift();
  M.lineT = now;
}

/* ---------------------------------------------------------------------- the box score */
const gameScore = (st) => st.pts + st.reb * 1.1 + st.ast * 1.4 + st.stl * 2 + st.blk * 2 - st.to * 1.4 - (st.fga - st.fgm) * 0.6 - (st.fta - st.ftm) * 0.3;
export function mvp() {
  let best = null, bv = -99;
  const w = M.score[0] >= M.score[1] ? 0 : 1;
  for (const p of M.side[w]) { const v = gameScore(p.st); if (v > bv) { bv = v; best = p; } }
  return best;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function boxHtml(side) {
  const T = TEAMS[M.teams[side]];
  const rows = M.side[side].filter((p) => p.st.sec > 1).sort((a, b) => b.st.pts - a.st.pts || b.st.sec - a.st.sec).map((p) => {
    const s = p.st;
    return '<tr><td>' + esc(p.info.num + ' ' + p.info.short) + '</td><td>' + s.pts + '</td><td>' + s.reb + '</td><td>' + s.ast + '</td><td>' + s.stl + '</td><td>' + s.blk + '</td><td>' + s.fgm + '/' + s.fga + '</td><td>' + s.tpm + '/' + s.tpa + '</td></tr>';
  }).join('');
  return '<div class="cl-box"><div class="cl-box-h"><i style="background:' + T.c1 + '"></i>' + esc(teamName(T)) + '</div><table><thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG</th><th>3P</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
export function lineHtml() {
  const q = M.qScore.map((s, i) => [s[0] - (i ? M.qScore[i - 1][0] : 0), s[1] - (i ? M.qScore[i - 1][1] : 0)]);
  const head = q.map((x, i) => '<th>' + qName(i + 1) + '</th>').join('');
  const row = (s) => '<tr><td>' + esc(TEAMS[M.teams[s]].id) + '</td>' + q.map((x) => '<td>' + x[s] + '</td>').join('') + '<td><b>' + M.score[s] + '</b></td></tr>';
  return '<table class="cl-line"><thead><tr><th></th>' + head + '<th>T</th></tr></thead><tbody>' + row(0) + row(1) + '</tbody></table>';
}
export const STYLE = '<style>.cl-box,.cl-line{font:500 12px/1.35 Inter,sans-serif;color:#FBF5EC;margin:8px 0}.cl-box table,.cl-line{width:100%;border-collapse:collapse}.cl-box th,.cl-box td,.cl-line th,.cl-line td{padding:3px 4px;text-align:right;border-bottom:1px solid rgba(251,245,236,.08);white-space:nowrap}.cl-box th:first-child,.cl-box td:first-child,.cl-line td:first-child,.cl-line th:first-child{text-align:left}.cl-box-h{font:600 12px Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase;margin:6px 0 2px;display:flex;align-items:center;gap:8px}.cl-box-h i{width:10px;height:10px;border-radius:3px;display:inline-block}.cl-scroll{max-height:42vh;overflow:auto;margin:4px 0}.cl-mvp{display:flex;gap:10px;align-items:center;margin:8px 0;padding:8px 10px;border:1px solid rgba(201,169,110,.4);border-radius:12px}.cl-mvp b{color:#FFB736}.cl-tbl{width:100%;border-collapse:collapse;font:500 12px Inter,sans-serif}.cl-tbl td,.cl-tbl th{padding:4px;text-align:right;border-bottom:1px solid rgba(251,245,236,.08)}.cl-tbl td:nth-child(2),.cl-tbl th:nth-child(2){text-align:left}.cl-tbl tr.me td{color:#FFB736;font-weight:700}.cl-note{font:500 12px Inter,sans-serif;color:#c9a96e;margin:6px 0}.cl-rules p,.cl-rules li{font:400 13px/1.45 Inter,sans-serif}.cl-rules h3{font:600 13px Inter,sans-serif;margin:10px 0 4px;color:#FFB736}.cl-rules ul{margin:0;padding-left:18px}.cl-keys{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font:500 12px Inter,sans-serif}.cl-keys kbd{font:600 11px JetBrains Mono,monospace;color:#FFB736;white-space:nowrap}</style>';
function finishGame() {
  const u = M.user;
  const won = u >= 0 && M.score[u] > M.score[opp(u)];
  const m = mvp();
  const T0 = TEAMS[M.teams[0]], T1 = TEAMS[M.teams[1]];
  let note = '';
  if (M.stageKind === 'season') note = Season.record(M.teams[0], M.teams[1], M.score[0], M.score[1], M.side[u].concat([]));
  if (won && M.diff === DIFF.allstar && UNL.set('legend')) note += (note ? ' ' : '') + 'Unlocked: Legend difficulty.';
  if (won && UNL.set('firstwin')) note += (note ? ' ' : '') + 'First win in the ' + LEAGUE + '!';
  const ms = m ? m.st : null;
  const html = STYLE + '<p><b>' + esc(teamName(T0)) + ' ' + M.score[0] + '</b>, ' + esc(teamName(T1)) + ' ' + M.score[1] + (M.q > 4 ? ' (' + qName(M.q) + ')' : '') + '</p>' +
    (note ? '<p class="cl-note">' + esc(note) + '</p>' : '') +
    (m ? '<div class="cl-mvp"><span>MVP</span><div><b>' + esc(m.info.name) + '</b>, ' + esc(TEAMS[M.teams[m.side]].name) + '<br>' + ms.pts + ' pts, ' + ms.reb + ' reb, ' + ms.ast + ' ast' + (ms.stl ? ', ' + ms.stl + ' stl' : '') + (ms.blk ? ', ' + ms.blk + ' blk' : '') + '</div></div>' : '') +
    '<div class="cl-scroll">' + lineHtml() + boxHtml(u >= 0 ? u : 0) + boxHtml(u >= 0 ? opp(u) : 1) + '</div>';
  arc.over({
    eyebrow: (M.stage ? M.stage + ': ' : '') + (won ? 'Win' : 'Loss'), title: won ? 'Lights <em>out</em>' : 'Final <em>horn</em>',
    score: u >= 0 ? M.score[u] : M.score[0], scoreLabel: 'Points', html,
    again: M.stageKind === 'season' ? (Season.next() ? 'Next game' : 'New season') : 'Play again',
  });
}

/* ====================================================================== the three-point contest */
// Five racks around the arc, five balls each, the last of every rack (the money ball) worth two. Sixty seconds.
// each rack's shooting spot, just behind the line: x across, metres back from the rim
export const RACKS = [[-6.92, 0.9], [-5.08, 5.08], [0, 7.2], [5.08, 5.08], [6.92, 0.9]];
export const rackPos = (i) => ({ x: RACKS[i][0] * (RACKS[i][0] ? 1.0 : 0), z: CT.HOOP - RACKS[i][1] });
function leagueBest(key, n, not) {
  const all = []; rosters().forEach((R) => R.forEach((p) => { if (!not || not.indexOf(p.id) < 0) all.push(p); }));
  return all.sort((a, b) => b.rat[key] - a.rat[key]).slice(0, n);
}
export function startC3(team, o) {
  setupTeams(team, (team + 1) % 8);
  M.kind = 'c3'; M.user = 0; M.diff = o.diff || DIFF.pro; M.dir = [1, -1]; M.t = 0;
  const me = M.side[0].slice().sort((a, b) => b.info.rat.sht3 - a.info.rat.sht3)[0];
  M.court = [[me], []]; M.ctrl = me;
  M.side[0].forEach((p) => { p.court = p === me; });
  const riv = leagueBest('sht3', 4, [me.info.id]).slice(0, 3);
  M.c3 = { me, rack: 0, ball: 0, t: 60, pts: 0, phase: 'walk', round: 1, left: [5, 5, 5, 5, 5], made: [], rivals: riv.map((r) => ({ info: r, score: null })), wait: 0, msg: '' };
  const r0 = rackPos(0); me.x = r0.x - 1.2; me.z = r0.z - 1.5; me.yaw = 0;
  resetBall(); recReset();
  M.phase = 'c3'; M.phaseT = 0; M.lines = [];
  M.banner = 'Three-point contest, round 1'; M.banT = 2;
}
function c3Update(dt) {
  const C = M.c3, p = C.me;
  M.t += dt; M.phaseT += dt; M.banT = max(0, M.banT - dt);
  if (C.phase === 'done') { for (const q of M.court[0]) integrate(q, dt); stepBall(dt); if (C.endT > 0) { const air = B.shot && !B.shot.done && (C.holdT = (C.holdT || 0) + dt) < 3; if (!air) { C.endT -= dt; if (C.endT <= 0) c3Finish(); } } return; }
  if (C.phase !== 'intro') C.t -= dt;
  if (C.t <= 0 && C.phase !== 'done') { C.t = 0; c3End(); }
  const r = rackPos(C.rack), hz = CT.HOOP;
  const sx = r.x, sz = r.z; // the shooting spot, just behind the line beside the rack
  const shotSpotX = r.x + (0 - r.x) * 0.0, shotSpotZ = r.z;
  void shotSpotX; void shotSpotZ;
  if (C.phase === 'walk') {
    p.sprint = true; moveTo(p, sx, sz - 0.0, 1, dt, faceTo(p, 0, hz));
    if (hypot(p.x - sx, p.z - sz) < 0.35) { C.phase = 'pick'; C.wait = 0; }
  } else if (C.phase === 'pick') {
    steer(p, 0, 0, dt, faceTo(p, 0, hz));
    C.wait += dt;
    if (C.wait > 0.28 && (B.state !== 'shot' || (B.shot && B.shot.done))) {
      resetBall(); giveBall(p, 'rack'); C.left[C.rack]--; C.phase = 'shoot'; C.money = C.ball === 4;
    }
  } else if (C.phase === 'shoot') {
    steer(p, 0, 0, dt, faceTo(p, 0, hz));
    const inp = arc.input, sw = inp.swipe();
    if (p.act === '' && B.holder === p && (shootHit() || (sw && sw.dir === 'up'))) { startShot(p, 'jumper', true); if (sw) p.ad.swipe = swipeTiming(sw); }
    if (p.act === 'shoot' && p.ad && !p.ad.rel) {
      const m = p.actT / RISE;
      if (p.ad.swipe) { if (m >= 1) userRelease(p, m, p.ad.swipe); }
      else if (!shootHeld() || m > 2.1) userRelease(p, max(m, 0.4));
    }
    if (p.ad && p.ad.rel && B.state === 'shot') {
      if (B.shot) B.shot.money = C.money;
      C.ball++;
      if (C.ball >= 5) { C.ball = 0; C.rack++; if (C.rack >= 5) { C.phase = 'last'; } else C.phase = 'walk'; }
      else { C.phase = 'pick'; C.wait = 0; }
    }
  } else if (C.phase === 'last') {
    if (!B.shot || B.shot.done) { C.lastT = (C.lastT || 0) + dt; if (C.lastT > 0.9) c3End(); }
  }
  actTick(p, dt); integrate(p, dt); stepBall(dt);
}
function contestMade(sh) {
  if (M.kind === 'c3') { const C = M.c3; const v = sh.money ? 2 : 1; C.pts += v; C.made.push(v); evt('score', sh.by, sh); if (v === 2) C.msg = 'Money ball! +2'; else C.msg = '+1'; C.msgT = 0.9; return; }
  if (M.kind === 'dunk') return;
  if (M.kind === 'practice') { evt('score', sh.by, sh); practiceShot(sh, true); }
}
function contestMiss(sh) {
  if (M.kind === 'c3') { M.c3.made.push(0); evt('miss', sh.by, sh); return; }
  if (M.kind === 'practice') { evt('miss', sh.by, sh); practiceShot(sh, false); }
}
function c3End() {
  const C = M.c3; if (C.phase === 'done') return;
  C.phase = 'done';
  // the others shoot their rounds: rated shooters score around their ratings, with a hot or cold day
  C.rivals.forEach((r) => { if (r.score == null) r.score = clamp(Math.round(8 + (r.info.rat.sht3 - 55) * 0.42 * M.diff.ai + rr(-5, 5)), 4, 29); });
  evt('final', 0);
  // run the results beat on the game clock, so a pause during it holds it rather than losing it
  C.endT = 1.8; C.holdT = 0;
}
function c3Finish() {
  const C = M.c3;
  // ranked only now, so a ball released before the horn that drops after it still counts
  const field = [{ me: true, info: C.me.info, score: C.pts }].concat(C.rivals).sort((a, b) => b.score - a.score);
  C.field = field;
  {
    if (arc.state !== 'play' || M.kind !== 'c3') return;
    const place = field.findIndex((f) => f.me) + 1;
    if (C.round === 1 && place <= 2) {
      // the final: the top two shoot again
      const rival = field.find((f) => !f.me);
      C.round = 2; C.r1 = C.pts; C.rivals = [{ info: rival.info, score: null }];
      C.rack = 0; C.ball = 0; C.t = 60; C.pts = 0; C.phase = 'walk'; C.left = [5, 5, 5, 5, 5]; C.made = []; C.lastT = 0;
      M.banner = 'The final: you against ' + rival.info.name; M.banT = 2.6;
      return;
    }
    const won = C.round === 2 && place === 1;
    let note = '';
    if (won && UNL.set('goldball')) note = 'Unlocked: the gold ball.';
    const rows = field.map((f, i) => '<tr class="' + (f.me ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(f.info.name) + ' <small>' + esc(TEAMS[f.info.team].id) + '</small></td><td>' + f.score + '</td></tr>').join('');
    arc.over({
      eyebrow: 'Three-point contest', title: won ? 'Contest <em>champion</em>' : C.round === 2 ? 'Runner <em>up</em>' : 'Out in round <em>one</em>',
      score: C.pts, scoreLabel: 'Points', again: 'Shoot again',
      html: STYLE + '<p>' + (C.round === 2 ? 'Final round' : 'Round one') + ': ' + C.made.filter((x) => x).length + ' makes from 25 balls.</p>' + (note ? '<p class="cl-note">' + note + '</p>' : '') + '<table class="cl-tbl"><thead><tr><th>#</th><th>Shooter</th><th>Pts</th></tr></thead><tbody>' + rows + '</tbody></table>',
    });
  }
}

/* ====================================================================== the dunk contest */
// Three dunkers, two rounds. Run in, take off, add what you dare in the air, then slam on the beat.
// Five judges score each dunk out of ten.
export function startDunk(team, o) {
  setupTeams(team, (team + 1) % 8);
  M.kind = 'dunk'; M.user = 0; M.diff = o.diff || DIFF.pro; M.dir = [1, -1]; M.t = 0;
  const me = M.side[0].slice().sort((a, b) => (b.info.rat.dnk + b.h * 30) - (a.info.rat.dnk + a.h * 30))[0];
  const riv = leagueBest('dnk', 6, [me.info.id]).filter((r) => r.team !== team).slice(0, 2);
  const people = [me].concat(riv.map((info) => mkPlayer(info, 1, 9)));
  M.all = M.side[0].concat(people.slice(1));
  M.court = [[me], []]; M.side[0].forEach((p) => { p.court = p === me; });
  M.dk = { list: people, round: 1, turn: 0, phase: 'ready', t: 0, scores: people.map(() => [null, null]), cur: null, cards: null };
  M.phase = 'dunk'; M.phaseT = 0; M.lines = [];
  resetBall(); recReset();
  dunkTurn();
}
function dunkTurn() {
  const D = M.dk, p = D.list[D.turn];
  D.list.forEach((q) => { q.court = false; q.act = ''; q.y = 0; });
  M.court = [[p], []]; M.ctrl = p;
  p.court = true; p.x = rr(-1.5, 1.5); p.z = -0.5; p.yaw = 0; p.vx = p.vz = 0; p.y = 0; p.vy = 0; p.act = ''; p.stam = 1;
  D.phase = 'ready'; D.t = 0; D.cur = { spins: 0, wind: false, legs: false, rev: false, take: 0, timing: 0, slam: false, made: false, user: D.turn === 0 };
  resetBall(); giveBall(p, 'dunk');
  M.banner = (D.turn === 0 ? 'Your dunk' : D.list[D.turn].info.name) + ', round ' + D.round; M.banT = 1.8;
  if (D.turn !== 0) {
    // the computer's plan: a run-in, a take-off spot and the tricks it trusts itself with
    const sk = p.info.rat.dnk / 100;
    D.plan = { take: rr(1.4, 2.2) + (rnd() < sk * 0.5 ? rr(1.0, 2.2) : 0), spins: rnd() < sk ? (rnd() < sk * 0.6 ? 2 : 1) : 0, wind: rnd() < 0.5, legs: rnd() < sk * 0.45, rev: rnd() < 0.3, timing: clamp(rr(0.45, 1.05) + sk * 0.15, 0, 1), side: rnd() < 0.5 ? -1 : 1 };
  }
}
function dunkUpdate(dt) {
  const D = M.dk, p = D.list[D.turn], C = D.cur, hz = CT.HOOP;
  M.t += dt; M.phaseT += dt; M.banT = max(0, M.banT - dt); D.t += dt;
  if (M.replay) { replayUpdate(dt); return; }
  recFrame(dt);
  const inp = arc.input, sw = inp.swipe();
  const user = C.user;
  if (D.phase === 'ready' || D.phase === 'run') {
    if (D.phase === 'ready' && D.t > 0.9) D.phase = 'run';
    if (D.phase === 'run') {
      const d = hypot(p.x, p.z - hz);
      if (user) {
        const ax = inp.axis(), w = view.stick(ax.x, ax.y), mag = min(1, hypot(w.x, w.z));
        p.sprint = inp.down('ShiftLeft', 'ShiftRight') || true;
        if (mag > 0.1) moveTo(p, p.x + w.x / mag * 3, p.z + w.z / mag * 3, mag, dt);
        else moveTo(p, 0, hz, 0.55, dt);
        if ((shootHit() || (sw && sw.dir === 'up')) && d < 5.2) takeOff(p, d);
        if (d < 0.9 || D.t > 9) takeOff(p, max(d, 1));
      } else {
        const P = D.plan;
        p.sprint = true;
        const ang = P.side * (0.5 + 0.4 * (1 - clamp(D.t / 2, 0, 1)));
        moveTo(p, sin(ang) * (P.take - 0.6), hz - cos(ang) * max(0.3, P.take - 0.6), 1, dt);
        if (d < P.take + 0.15 && D.t > 1.2) { takeOff(p, d); C.spins = P.spins; C.wind = P.wind; C.legs = P.legs; C.rev = P.rev; }
      }
    }
    integrate(p, dt); stepBall(dt);
    return;
  }
  if (D.phase === 'air') {
    const A = D.air; A.t += dt;
    const k = clamp(A.t / A.slamT, 0, 1);
    p.x = lerp(A.x0, A.x1, ease(k)); p.z = lerp(A.z0, A.z1, ease(k));
    p.y = A.H * sin(PI * clamp(A.t / A.air, 0, 1));
    p.yaw = A.yaw0 + PI * C.spins * ease(k) + (C.rev ? PI : 0) * ease(k);
    p.ad = { trick: C.wind ? 'windmill' : C.legs ? 'legs' : C.rev ? 'reverse' : '', k, spin: C.spins };
    p.act = 'dunk'; p.actT = A.t * 0.47 / A.slamT;
    if (user && A.t < A.slamT - 0.12) {
      if (inp.hit('KeyE') || inp.hit('KeyQ') || (sw && (sw.dir === 'left' || sw.dir === 'right'))) C.spins = min(2, C.spins + 1);
      if (inp.hit('KeyK') || (sw && sw.dir === 'down')) C.wind = true;
      if (inp.hit('KeyL')) C.legs = true;
    }
    // the slam: on the beat, as the hands reach the iron
    const win = 0.13 + (M.diff.win - 0.1) * 0.8;
    if (!C.slam && user && (shootHit() || (sw && sw.dir === 'up')) && A.t > 0.08) { C.slam = true; C.timing = clamp(1 - max(0, abs(A.t - A.slamT) - win * 0.35) / win, 0, 1); }
    if (!C.slam && !user && A.t >= A.slamT + (1 - D.plan.timing) * (rnd() < 0.5 ? 0.1 : -0.1)) { C.slam = true; C.timing = D.plan.timing; }
    if (A.t >= A.slamT && !A.done) {
      A.done = true;
      if (!C.slam) { C.timing = 0.15; }
      const hard = C.spins * 0.18 + (C.wind ? 0.08 : 0) + (C.legs ? 0.14 : 0) + max(0, C.take - 3.6) * 0.15;
      C.made = C.timing > 0.35 + hard * 0.5 && C.take < 4.9;
      B.holder = null; B.state = 'shot'; B.free = true;
      B.shot = { by: p, side: 0, pts: 2, make: C.made, hz, kind: 'dunk', done: false, at: M.t };
      B.x = 0; B.z = hz - 0.08; B.y = CT.RIM_Y + 0.25; B.vx = B.vz = 0; B.vy = C.made ? -3.4 : -0.5;
      if (!C.made) { B.shot.done = true; rimBounce(rr(-0.15, 0.15), -0.15, 0.15, 1, 1.4); }
      evt(C.made ? 'score' : 'miss', p, B.shot);
      if (C.made) { setAct(p, 'hang', 0.6, { hz }); p.y = max(p.y, CT.RIM_Y - p.h * 1.28 + 0.1); }
    }
    if (A.done && A.t > A.slamT + (C.made ? 0.55 : 0.1)) { D.phase = 'land'; D.t = 0; if (p.act === 'hang') p.act = ''; p.vy = -1; }
    stepBall(dt);
    return;
  }
  if (D.phase === 'land') {
    integrate(p, dt); stepBall(dt);
    if (D.t > 0.9) { D.phase = 'replay'; D.t = 0; startReplay({ why: C.made ? 'Dunk contest' : 'Missed', who: p }); if (M.replay) M.replay.speed = 0.38; }
    return;
  }
  if (D.phase === 'replay') {
    // the cards come up after the replay
    D.phase = 'judge'; D.t = 0; D.cards = judge(C, p); D.scores[D.turn][D.round - 1] = D.cards.reduce((a, b) => a + b, 0);
    evt('judge', D.cards); M.noise = clamp(D.scores[D.turn][D.round - 1] / 50, 0.3, 1);
    if (D.scores[D.turn][D.round - 1] >= 50) evt('fifty', p);
    return;
  }
  if (D.phase === 'judge') {
    p.vx *= 0.9; p.vz *= 0.9; integrate(p, dt); stepBall(dt);
    if (D.t > 2.6 || ((shootHit() || inp.tap()) && D.t > 0.8)) {
      D.turn++;
      if (D.turn >= D.list.length) { D.turn = 0; D.round++; if (D.round > 2) { dunkEnd(); return; } }
      dunkTurn();
    }
  }
}
function takeOff(p, d) {
  const D = M.dk, C = D.cur, hz = CT.HOOP;
  C.take = d;
  const ax = 0 - p.x, az = hz - p.z, al = hypot(ax, az) || 1;
  const slamT = 0.36 + d * 0.085;
  const H = max(0.8, 3.3 - p.h * 1.33 + 0.3) + min(0.35, d * 0.05);
  D.air = { t: 0, slamT, air: slamT * 1.75, H, x0: p.x, z0: p.z, x1: -ax / al * 0.32, z1: hz - az / al * 0.32, yaw0: Math.atan2(ax, az), done: false };
  D.phase = 'air'; p.vx = p.vz = 0;
  evt('takeoff', p, d);
}
function judge(C, p) {
  void p;
  if (!C.made) return [5, 5, 6, 5, 5].map((x) => x + (rnd() < 0.3 ? 1 : 0));
  const diff = 1.2 + C.spins * 1.3 + (C.wind ? 1.0 : 0) + (C.legs ? 1.7 : 0) + (C.rev ? 0.7 : 0) + (C.take > 4 ? 2.2 : C.take > 3.2 ? 1.0 : 0);
  const base = 6 + min(3.4, diff * 0.55) + C.timing * 0.8;
  return [0, 1, 2, 3, 4].map(() => clamp(Math.round(base + rr(-0.6, 0.6)), 6, 10));
}
function dunkEnd() {
  const D = M.dk;
  const field = D.list.map((p, i) => ({ me: i === 0, info: p.info, score: (D.scores[i][0] || 0) + (D.scores[i][1] || 0), r: D.scores[i] })).sort((a, b) => b.score - a.score);
  const won = field[0].me;
  let note = '';
  if (won && UNL.set('nightcourt')) note = 'Unlocked: Night Court, a laser-lit arena.';
  const rows = field.map((f, i) => '<tr class="' + (f.me ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(f.info.name) + '</td><td>' + f.r[0] + ' + ' + f.r[1] + '</td><td>' + f.score + '</td></tr>').join('');
  M.phase = 'dunkdone';
  arc.over({ eyebrow: 'Dunk contest', title: won ? 'Dunk <em>champion</em>' : 'Judges have <em>spoken</em>', score: field.find((f) => f.me).score, scoreLabel: 'Points', again: 'Dunk again',
    html: STYLE + (note ? '<p class="cl-note">' + note + '</p>' : '') + '<table class="cl-tbl"><thead><tr><th>#</th><th>Dunker</th><th>Rounds</th><th>Total</th></tr></thead><tbody>' + rows + '</tbody></table>' });
}

/* ====================================================================== practice */
// A guided session: each step names a skill, shows the key on every device, and moves on when it is done.
const STEPS = [
  { t: 'Move', k: 'WASD or arrows / drag / left stick', chk: (s) => s.moved > 6 },
  { t: 'Sprint', k: 'hold Shift / Sprint / RT', chk: (s) => s.sprint > 1.2 },
  { t: 'Jump shot: hold, release at the top', k: 'Space or J / Shoot / X', chk: (s) => s.jumpers > 0 },
  { t: 'Perfect release: let go in the gold', k: 'release at the top of the meter', chk: (s) => s.perfect > 0 },
  { t: 'Layup: drive at the rim and shoot', k: 'close to the rim, Space / Shoot / X', chk: (s) => s.layups > 0 },
  { t: 'Dunk: sprint at the rim and shoot', k: 'Shift + Space / Sprint + Shoot / RT + X', chk: (s) => s.dunks > 0 },
  { t: 'Pass to your team mate', k: 'K / tap / A', chk: (s) => s.passes > 0 },
  { t: 'Lob to a cutter for an alley-oop', k: 'L / Lob / Y near the rim', chk: (s) => s.alleys > 0 },
  { t: 'Crossover your defender', k: 'E / swipe sideways / B', chk: (s) => s.crosses > 0 },
  { t: 'Spin move', k: 'Q or Shift + E / swipe down / RT + B', chk: (s) => s.spins > 0 },
  { t: 'Call a screen', k: 'C / Screen / LT', chk: (s) => s.screens > 0 },
];
export function startPractice(team, o) {
  setupTeams(team, (team + 3) % 8);
  M.kind = 'practice'; M.user = 0; M.diff = o.diff || DIFF.pro; M.dir = [1, -1]; M.t = 0; M.qlen = 600;
  const me = M.side[0][0], mate = M.side[0][4], def = M.side[1][4];
  M.court = [[me, mate], [def]]; M.match = [[def], [me, mate]];
  M.all.forEach((p) => { p.court = M.court[0].includes(p) || M.court[1].includes(p); });
  me.x = 0; me.z = 4; mate.x = 3; mate.z = 8; def.x = 0; def.z = 7;
  M.ctrl = me; M.pr = { step: 0, s: { moved: 0, sprint: 0, jumpers: 0, perfect: 0, layups: 0, dunks: 0, passes: 0, alleys: 0, crosses: 0, spins: 0, screens: 0 }, doneT: 0, free: false };
  M.phase = 'live'; M.phaseT = 0; M.poss = 0; M.shot = 24; M.clock = 600; M.lines = []; M.score = [0, 0];
  M.off = { side: 0, set: 'motion', t: 0, screener: null, scrDone: false, scrT: 0, cut: null, cutUntil: 0, nextCutAt: 1e9, startT: 0, flip: 1, perm: [0, 1, 2, 3, 4] };
  M.def = ['man', 'man'];
  resetBall(); recReset(); giveBall(me, 'practice');
}
function practiceShot(sh, made) {
  const S = M.pr.s;
  if (sh.by === M.ctrl) { if (sh.kind === 'jumper') S.jumpers++; if (made && sh.kind === 'layup') S.layups++; if (made && sh.kind === 'dunk') S.dunks++; if (sh.timing >= 0.999) S.perfect++; }
  if (made && sh.alley) S.alleys++;
  M.pr.reset = M.t + 1.2;
}
function practiceUpdate(dt) {
  const P = M.pr, S = P.s, me = M.ctrl;
  M.t += dt; M.phaseT += dt; M.banT = max(0, M.banT - dt);
  const x0 = me.x, z0 = me.z;
  const mate = M.court[0].find((q) => q !== me) || M.court[0][1];
  for (const p of courtPlayers()) {
    if (p.react && M.t >= p.react.at) doReact(p);
    if (p === me) userTick(p, dt);
    else if (p.side === 0) {
      // the team mate cuts to the rim on the lob step, otherwise spots up on the wing
      if (p.ai.alley) aiOffBall(p, dt);
      else if (B.holder === p) { if (p.act === '' && M.t > (p.passBack || 0)) { startPass(p, me, 'chest'); } }
      else if (P.step === 7) { moveTo(p, 1.6 * sin(M.t * 0.9), CT.HOOP - 1.6 - cos(M.t * 0.9), 0.7, dt); }
      else if (M.off.set === 'pnr' && M.off.screener === p) { offTarget(p, _t); moveTo(p, _t.x, _t.z, 1, dt); }
      else moveTo(p, 4.6, CT.HOOP - 5.2, 0.8, dt);
    } else {
      // a light defender: he stays in front, never steals, always gives a look
      if (B.holder === me) { defTarget(p, _t); moveTo(p, _t.x, _t.z, 0.55, dt, faceTo(p, me.x, me.z)); }
      else if (B.state === 'loose' || B.state === 'shot') { if (B.state === 'loose' && hypot(B.x - p.x, B.z - p.z) < 0.9 && B.y < 2.4) { resetBall(); giveBall(me, 'practice'); } else moveTo(p, 0, CT.HOOP - 2.5, 0.6, dt); }
      else moveTo(p, 0, CT.HOOP - 3, 0.6, dt);
    }
    actTick(p, dt); integrate(p, dt);
  }
  stepBall(dt);
  // loose balls come back to you
  if (B.state === 'loose' && hypot(B.x - me.x, B.z - me.z) < 0.85 && B.y < 2.6) { resetBall(); giveBall(me, 'practice'); }
  if (P.reset && M.t > P.reset && B.holder !== me) { P.reset = 0; resetBall(); giveBall(me, 'practice'); }
  if (B.holder && B.holder.side === 1) { resetBall(); giveBall(me, 'practice'); }
  if (B.holder === mate && !mate.passBack) mate.passBack = M.t + 0.9;
  if (B.holder !== mate) mate.passBack = 0;
  S.moved += hypot(me.x - x0, me.z - z0);
  if (me.sprint && me.spd > 4.4) S.sprint += dt;
  if (me.act === 'cross' && me.actT < dt * 1.5) S.crosses++;
  if (me.act === 'spin' && me.actT < dt * 1.5) S.spins++;
  if (M.off.set === 'pnr' && M.off.screener && !P.scrSeen) { P.scrSeen = true; S.screens++; }
  if (M.off.set !== 'pnr') P.scrSeen = false;
  if (!P.free && STEPS[P.step].chk(S)) {
    P.step++; P.doneT = 1.4; evt('step', P.step);
    if (P.step >= STEPS.length) { P.free = true; M.banner = 'Tutorial complete. Free practice: everything is live.'; M.banT = 3; UNL.set('tutorial'); P.step = STEPS.length - 1; }
  }
  P.doneT = max(0, P.doneT - dt);
}
export const practiceStep = () => (M.pr ? { i: M.pr.step, n: STEPS.length, step: STEPS[M.pr.step], free: M.pr.free, done: M.pr.doneT } : null);
// passes in practice count toward the step
const _origRel = releasePass;
void _origRel;

/* ====================================================================== the rooftop shootout */
// The original Court Lights: one shooter, one hoop on a lit rooftop cage, sixty seconds. Hold to charge,
// release in the gold band; a streak adds a point a make. Three variants: sixty seconds, first to 21,
// make or miss. Its numbers are its own (x across, z toward its single hoop); the view draws the roof.
export const SHK = { make() {}, rim() {}, board() {}, board2() {}, dust() {}, clear() {}, win() {}, flash() {}, start() {} };
export const SR = { x: 0, y: 3.05, z: 6.95, r: 0.23 };
export const SBR = 0.12;            // ball radius
export const SGRAV = 14;
export const SWEET = [0.58, 0.78]; // the gold band, as on the HUD
export const SWEET_MID = 0.68;
export const SBOARD_Z = 7.2, SBOARD_Y0 = 2.72, SBOARD_Y1 = 4.05, SBOARD_HW = 0.9;
export const SMAKE_R = 0.4;         // in the band, a ball crossing the rim this close goes down
export const SRIM_HIT = 0.37;       // outside the band, this close the rim rejects it
export const SHAND0 = { x: 0.02, y: 1.62, z: 0.55 };

export const SH = {
  mode: 'sixty', phase: 'aim', time: 60, score: 0, combo: 0, makes: 0, attempts: 0, streak: 0,
  aimX: 0, charge: 0, holding: false, go: 0, t: 0, hintT: 0, tAim: null,
  ball: null, attract: true, pops: [], shotT: 9, slow: 0, flare: 0, swishT: 9, ballIn: 1, lastMiss: '',
  release: { x: SHAND0.x, y: SHAND0.y + 0.6, z: SHAND0.z },
};

/* ====================================================================== rules */
export function shResetBall() {
  SH.ball = { x: SHAND0.x, y: SHAND0.y, z: SHAND0.z, vx: 0, vy: 0, vz: 0, air: false, scored: false, resolved: false, guide: false, dead: 0, flightT: 0, shotCharge: null, bounces: 0, spin: 0 };
  SH.phase = 'aim'; SH.charge = 0; SH.holding = false; SH.ballIn = 0;
}

export function shShoot() {
  if (SH.go > 0 && !SH.attract) return;
  const c = clamp(SH.charge, 0.12, 1);
  const b = SH.ball;
  const rel = SH.release;
  b.x = rel.x; b.y = rel.y; b.z = rel.z;
  b.air = true; b.scored = false; b.resolved = false; b.guide = false; b.flightT = 0; b.dead = 0; b.bounces = 0;
  b.shotCharge = c;
  // Early releases land short of the rim, late ones fly long; the gold band lands on it.
  const zErr = (c - SWEET_MID) * 2.3;
  const xT = SH.aimX * 1.5;
  const H = 4.62 + (c - SWEET_MID) * 0.9;
  const vy = Math.sqrt(2 * SGRAV * Math.max(0.3, H - b.y));
  const T = vy / SGRAV + Math.sqrt(2 * Math.max(0.05, H - SR.y) / SGRAV);
  b.vx = (xT - b.x) / T; b.vz = (SR.z + zErr - b.z) / T; b.vy = vy;
  b.spin = 7 + c * 6;
  SH.phase = 'flight'; SH.attempts++; SH.holding = false; SH.charge = 0; SH.shotT = 0; SH.lastMiss = '';
  if (!SH.attract) {
    arc.haptic('tap', 0.3 + c * 0.4);
    arc.sfx.tone(220 + c * 80, 0.09, { type: 'triangle', vol: 0.12 });
    arc.sfx.noise(0.05, { freq: 900, vol: 0.06 });
  }
}

function shPlaying() { return !SH.attract && arc && arc.state === 'play'; }

function shScore(kind) {
  const b = SH.ball;
  b.scored = true; SH.phase = 'net'; SH.swishT = 0; SH.lastKind = kind;
  SHK.make(kind);
  if (!shPlaying()) return;
  const pts = 3 + SH.combo;
  SH.score += pts; SH.makes++; SH.combo++; SH.streak = max(SH.streak, SH.combo);
  const label = SH.combo >= 3 ? 'Red hot x' + SH.combo : (kind === 'swish' ? 'Swish' : 'Bucket');
  arc.toast(label, '+' + pts, 1100);
  shPop(SR.x, SR.y + 0.5, SR.z, '+' + pts, kind === 'swish' ? WARM : INK, true);
  arc.sfx.tone(kind === 'swish' ? 880 : 520, 0.16, { type: 'sine', vol: 0.16 });
  if (kind === 'swish') arc.sfx.tone(1320, 0.22, { type: 'sine', vol: 0.1, delay: 0.05 });
  arc.sfx.noise(0.18, { freq: 3200, filter: 'highpass', vol: 0.05 });
  arc.haptic(kind === 'swish' || SH.combo >= 3 ? 'success' : 'hit', min(1, 0.55 + SH.combo * 0.1));
  SHK.flash(kind);
  if (SH.combo >= 3 && !arc.reducedMotion) SH.slow = 0.7;
  if (SH.mode === 'twentyone' && SH.score >= 21) { if (!arc.reducedMotion) SH.slow = 0.9; SH.endIn = 1.1; SH.go = 2; }
}

function shMiss() {
  SH.combo = 0; SH.phase = 'miss';
  if (shPlaying()) {
    arc.sfx.tone(140, 0.18, { type: 'sawtooth', slide: 70, vol: 0.1 });
    if (SH.mode === 'sudden' && SH.makes > 0) shFinish('Missed');
  }
}

function shFinish(why) {
  if (SH.phase === 'over' || !shPlaying()) return;
  SH.phase = 'over';
  SHK.win();
  arc.haptic(SH.score >= 21 || SH.makes > 0 ? 'success' : 'fail');
  arc.over({
    eyebrow: why || 'Buzzer', title: SH.score >= 21 ? 'Lights <em>out</em>' : 'Buzzer',
    score: SH.score, scoreLabel: 'Points',
    html: '<p>' + SH.makes + ' makes from ' + SH.attempts + ' shots. Best streak ' + SH.streak + '.</p>',
    again: 'Shoot again',
  });
}

function shPop(x, y, z, text, col, big) { SH.pops.push({ x, y, z, text, col, big: !!big, life: 1.2, t: 0 }); }

// The ball reaches rim height on the way down: in, rattled in, rimmed out or wide.
function shResolveRim() {
  const b = SH.ball;
  const dx = b.x - SR.x, dz = b.z - SR.z, d = hypot(dx, dz);
  const c = b.shotCharge == null ? SWEET_MID : b.shotCharge;
  const inBand = c >= SWEET[0] && c <= SWEET[1];
  b.resolved = true;
  if (inBand && d < SMAKE_R) {
    const swish = d < 0.13;
    if (!swish) { SHK.rim(b.x, b.z, 0.5); if (!SH.attract) arc.sfx.tone(420, 0.04, { type: 'square', vol: 0.05 }); }
    b.guide = true; b.vx *= 0.15; b.vz *= 0.15; b.vy = min(b.vy, -1.4);
    shScore(swish ? 'swish' : 'bank');
    return;
  }
  const why = !inBand ? (c < SWEET[0] ? 'Early' : 'Late') : 'Wide';
  if (d < SRIM_HIT) {
    let nx = dx / (d || 1), nz = dz / (d || 1);
    if (d < 0.02) { nx = 0; nz = -1; }
    b.x = SR.x + nx * (SRIM_HIT + 0.01); b.z = SR.z + nz * (SRIM_HIT + 0.01);
    b.vx = nx * 2.1 + b.vx * 0.2; b.vz = nz * 2.1 + b.vz * 0.2; b.vy = abs(b.vy) * 0.42 + 1.3;
    SHK.rim(b.x, b.z, 1);
    if (!SH.attract) {
      arc.sfx.tone(360, 0.06, { type: 'square', vol: 0.08 }); arc.sfx.tone(190, 0.12, { type: 'triangle', vol: 0.06, delay: 0.02 });
      arc.shake = Math.max(arc.shake, 5); arc.haptic('hit', 0.7);
    }
    SH.lastMiss = why === 'Early' ? 'Early, rimmed out' : why === 'Late' ? 'Late, rimmed out' : 'Rimmed out';
  } else {
    SH.lastMiss = why === 'Early' ? 'Early, short' : why === 'Late' ? 'Late, long' : (b.x > 0 ? 'Wide right' : 'Wide left');
  }
  if (shPlaying()) shPop(SR.x, SR.y + 0.35, SR.z, SH.lastMiss, PRIM, false);
}

function shStepBall(dtIn) {
  const b = SH.ball; if (!b) return;
  if (!b.air) {
    if (SH.phase === 'net' || SH.phase === 'miss') { b.dead += dtIn; if (b.dead > 0.55) shResetBall(); }
    return;
  }
  const dt = dtIn * (SH.slow > 0 ? 0.35 : 1);
  b.flightT += dt;
  const N = 4, h = dt / N;
  for (let s = 0; s < N && b.air; s++) {
    const py = b.y;
    b.vy -= SGRAV * h; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    if (b.guide) {
      // A make: the net takes it, the ball drops straight through the rim.
      const k = 1 - Math.exp(-h * 16);
      b.x = lerp(b.x, SR.x, k); b.z = lerp(b.z, SR.z, k); b.vx *= 0.9; b.vz *= 0.9;
      if (b.y < SR.y - 0.5 && b.vy < -3.2) b.vy = -3.2;
      if (b.y < SR.y - 0.55) { b.guide = false; b.vx = rr(-0.4, 0.4); b.vz = -rr(0.6, 1.4); }
    }
    // backboard
    if (b.vz > 0 && b.z > SBOARD_Z - SBR && b.z < SBOARD_Z + 0.15 && b.y > SBOARD_Y0 - 0.08 && b.y < SBOARD_Y1 + 0.08 && abs(b.x) < SBOARD_HW + 0.05) {
      b.z = SBOARD_Z - SBR; b.vz *= -0.42; b.vx *= 0.85;
      if (!SH.attract) arc.sfx.tone(310, 0.05, { type: 'square', vol: 0.06 });
      SHK.board(b.x, b.y); SHK.board2(b.x, b.y);
    }
    if (!b.resolved && py > SR.y && b.y <= SR.y && b.vy < 0) shResolveRim();
    // the cage keeps the ball on the roof
    if (b.z > 8.75 - SBR && b.vz > 0) { b.z = 8.75 - SBR; b.vz *= -0.4; }
    if (abs(b.x) > 4.7 - SBR) { b.x = Math.sign(b.x) * (4.7 - SBR); b.vx *= -0.4; }
    if (b.z < -2.6) { b.z = -2.6; b.vz *= -0.4; }
    if (b.y < SBR) {
      b.y = SBR;
      if (abs(b.vy) > 1.4) SHK.dust(b.x, b.z, clamp(abs(b.vy) / 6, 0.2, 1));
      if (abs(b.vy) > 1 && !SH.attract) arc.sfx.noise(0.06, { freq: 260, vol: clamp(abs(b.vy) / 30, 0.02, 0.12) });
      b.vy *= -0.62; b.vx *= 0.78; b.vz *= 0.78; b.bounces++;
      if (!b.scored && SH.phase === 'flight') { if (!b.resolved) { b.resolved = true; SH.lastMiss = 'Air ball'; if (shPlaying()) shPop(b.x, 1.2, b.z, 'Air ball', PRIM, false); } shMiss(); }
      if (abs(b.vy) < 1.1) { b.air = false; b.vy = 0; }
    }
  }
  if (SH.phase === 'flight' && b.flightT > 4.2) { shMiss(); shResetBall(); return; }
  if ((SH.phase === 'net' || SH.phase === 'miss') && b.flightT > (b.scored ? 1.7 : 2.4)) shResetBall();
}

export function shGestTouch() {
  const p = arc.input.pointer;
  return !!arc.touchMode && arc.touchStyle === 'gesture' && !!p && p.type !== 'mouse';
}

// Same feel as the flat game: touch and hold to charge, slide to aim
// (relative, so the shot never jumps under the thumb), lift in the gold band.
function shReadAim(dt) {
  const inp = arc.input, ax = inp.axis(), p = inp.pointer, gz = inp.gesture;
  const gt = shGestTouch();
  if (abs(ax.x) > 0.08) {
    SH.aimX = clamp(SH.aimX + ax.x * dt * 1.7, -0.72, 0.72);
  } else if (gt) {
    if (gz.active && gz.type !== 'mouse') {
      if (!SH.tAim) SH.tAim = { x: gz.x, aim: SH.aimX };
      SH.aimX = clamp(SH.tAim.aim + ((gz.x - SH.tAim.x) / max(160, arc.w * 0.45)) * 0.72, -0.72, 0.72);
    } else {
      SH.tAim = null;
      SH.aimX *= Math.exp(-dt * 1.4);
    }
  } else if (p && p.seen) {
    SH.aimX = lerp(SH.aimX, (p.nx - 0.5) * 1.44, 1 - Math.exp(-dt * 10));
  } else if (abs(ax.x) < 0.08) {
    SH.aimX *= Math.exp(-dt * 1.4);
  }
  const down = inp.action();
  if (SH.phase === 'aim' && SH.ballIn > 0.6) {
    if (down) {
      SH.holding = true; SH.charge = min(1, SH.charge + dt * 0.95);
      if (SH.charge >= 1) shShoot();
    } else if (SH.holding) {
      if (gt && SH.charge < 0.1) { SH.holding = false; SH.charge = 0; } else shShoot();
    }
  }
}

export function shNewMatch(ch) {
  SH.mode = (ch && ch.roof) || 'sixty';
  SH.score = 0; SH.combo = 0; SH.makes = 0; SH.attempts = 0; SH.streak = 0; SH.aimX = 0; SH.t = 0; SH.go = 0.8;
  SH.hintT = 0; SH.tAim = null; SH.pops.length = 0; SH.slow = 0; SH.flare = 0; SH.endIn = 0; SH.shotT = 9;
  SH.time = SH.mode === 'sixty' ? 60 : SH.mode === 'sudden' ? 90 : 99;
  SH.attract = false;
  SHK.clear();
  shResetBall(); SH.ballIn = 1;
  SHK.start();
  arc.toast(SH.mode === 'twentyone' ? 'First to 21' : SH.mode === 'sudden' ? 'Make or shMiss' : 'Sixty seconds', 'Court Lights', 1400);
}

function shTick(dt) {
  SH.ballIn = min(1, SH.ballIn + dt * 3.2);
  SH.shotT += dt; SH.swishT += dt;
  SH.slow = max(0, SH.slow - dt); SH.flare = max(0, SH.flare - dt * 1.6);
  for (let i = SH.pops.length - 1; i >= 0; i--) { const p = SH.pops[i]; p.t += dt; if (p.t >= p.life) SH.pops.splice(i, 1); }
}

export function shUpdate(dt) {
  SH.t += dt; SH.go = max(0, SH.go - dt); SH.hintT += dt;
  shTick(dt);
  if (SH.phase === 'over') return;
  if (SH.endIn > 0) { SH.endIn -= dt; if (SH.endIn <= 0) { shFinish('Twenty one'); return; } }
  if (SH.mode === 'sixty' || SH.mode === 'sudden') {
    SH.time -= dt;
    if (SH.time <= 0 && SH.phase !== 'flight') { SH.time = 0; shFinish('Buzzer'); return; }
  }
  shReadAim(dt);
  shStepBall(dt);
}

export function shAttractReset() {
  SH.attract = true; SH.score = 0; SH.combo = 0; SH.makes = 0; SH.attempts = 0; SH.streak = 0;
  SH.aimX = 0; SH.charge = 0; SH.holding = false; SH.go = 0; SH.phase = 'aim'; SH.pops.length = 0; SH.endIn = 0;
  shResetBall(); SH.ballIn = 1;
}

export function shIdle(dt) {
  SH.t += dt; SH.attract = true;
  shTick(dt);
  if (!SH.ball || SH.phase === 'over') shAttractReset();
  if (SH.phase === 'aim') {
    SH.aimX = sin(SH.t * 0.7) * 0.06;
    SH.holding = true;
    SH.charge = min(0.66 + 0.06 * sin(SH.t * 1.3), SH.charge + dt * 0.95);
    if ((SH.t % 2.9) > 2.6 && SH.ballIn >= 1) shShoot();
  }
  shStepBall(dt);
}

/* ====================================================================== crests */
// Each club's crest, drawn in code: a shield in the home colour, a ring, the club's emblem and its letters.
export function drawCrest(g, T, cx, cy, r) {
  g.save(); g.translate(cx, cy);
  g.beginPath();
  g.moveTo(-r * 0.86, -r * 0.82); g.quadraticCurveTo(0, -r * 1.05, r * 0.86, -r * 0.82);
  g.lineTo(r * 0.82, r * 0.12); g.quadraticCurveTo(r * 0.7, r * 0.78, 0, r * 1.02); g.quadraticCurveTo(-r * 0.7, r * 0.78, -r * 0.82, r * 0.12); g.closePath();
  g.fillStyle = T.c3; g.fill();
  g.lineWidth = r * 0.1; g.strokeStyle = T.c2; g.stroke();
  g.save(); g.clip();
  g.fillStyle = T.c1; g.fillRect(-r, -r, r * 2, r * 1.15);
  g.restore();
  g.fillStyle = T.c2; g.strokeStyle = T.c2; g.lineWidth = r * 0.07; g.lineJoin = 'round'; g.lineCap = 'round';
  const e = T.emb, s = r * 0.5;
  g.save(); g.translate(0, -r * 0.18);
  if (e === 'wing') { g.beginPath(); g.moveTo(-s, s * 0.4); g.quadraticCurveTo(-s * 0.2, -s * 1.1, s * 1.05, -s * 0.5); g.quadraticCurveTo(s * 0.2, -s * 0.15, s * 0.6, s * 0.15); g.quadraticCurveTo(0, s * 0.05, s * 0.25, s * 0.55); g.quadraticCurveTo(-s * 0.3, s * 0.25, -s, s * 0.4); g.fill(); }
  else if (e === 'kite') { g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.7, 0); g.lineTo(0, s * 0.9); g.lineTo(-s * 0.7, 0); g.closePath(); g.fill(); g.strokeStyle = T.c1; g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s * 0.9); g.moveTo(-s * 0.7, 0); g.lineTo(s * 0.7, 0); g.stroke(); }
  else if (e === 'moon') { g.beginPath(); g.arc(0, 0, s * 0.85, 0, TAU); g.fill(); g.fillStyle = T.c1; g.beginPath(); g.arc(s * 0.36, -s * 0.2, s * 0.72, 0, TAU); g.fill(); }
  else if (e === 'horn') { g.beginPath(); g.moveTo(-s * 0.95, s * 0.5); g.quadraticCurveTo(-s * 1.0, -s * 0.6, -s * 0.2, -s * 0.95); g.quadraticCurveTo(-s * 0.55, -s * 0.2, -s * 0.35, s * 0.45); g.closePath(); g.fill(); g.beginPath(); g.moveTo(s * 0.95, s * 0.5); g.quadraticCurveTo(s * 1.0, -s * 0.6, s * 0.2, -s * 0.95); g.quadraticCurveTo(s * 0.55, -s * 0.2, s * 0.35, s * 0.45); g.closePath(); g.fill(); g.beginPath(); g.arc(0, s * 0.2, s * 0.38, 0, TAU); g.fill(); }
  else if (e === 'wave') { g.beginPath(); for (let i = 0; i < 3; i++) { const y = -s * 0.6 + i * s * 0.55; g.moveTo(-s, y); g.bezierCurveTo(-s * 0.5, y - s * 0.4, -s * 0.1, y + s * 0.4, s * 0.3, y); g.bezierCurveTo(s * 0.55, y - s * 0.25, s * 0.8, y - s * 0.2, s, y); } g.stroke(); }
  else if (e === 'flame') { g.beginPath(); g.moveTo(0, -s * 1.05); g.bezierCurveTo(s * 0.9, -s * 0.2, s * 0.75, s * 0.9, 0, s * 0.9); g.bezierCurveTo(-s * 0.75, s * 0.9, -s * 0.85, -s * 0.1, -s * 0.2, -s * 0.45); g.bezierCurveTo(-s * 0.2, -s * 0.1, 0, -s * 0.05, 0, -s * 1.05); g.fill(); g.fillStyle = T.c1; g.beginPath(); g.ellipse(0, s * 0.45, s * 0.28, s * 0.4, 0, 0, TAU); g.fill(); }
  else if (e === 'scale') { for (let j = 0; j < 3; j++) for (let i = 0; i < 3 - (j === 2 ? 1 : 0); i++) { g.beginPath(); g.arc(-s * 0.55 + i * s * 0.55 + (j === 2 ? s * 0.27 : 0), -s * 0.45 + j * s * 0.5, s * 0.3, 0, PI); g.stroke(); } }
  else { g.beginPath(); g.moveTo(0, -s); g.bezierCurveTo(s * 0.9, -s * 0.4, s * 0.6, s * 0.7, 0, s * 0.95); g.bezierCurveTo(-s * 0.6, s * 0.7, -s * 0.9, -s * 0.4, 0, -s); g.fill(); g.strokeStyle = T.c1; g.beginPath(); g.moveTo(0, -s * 0.8); g.lineTo(0, s * 0.85); g.stroke(); }
  g.restore();
  g.fillStyle = T.c2; g.font = '800 ' + Math.round(r * 0.36) + 'px Inter, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(T.id, 0, r * 0.62);
  g.restore();
}

/* ====================================================================== the broadcast HUD */
function rr2(c, x, y, w, h, r) { r = min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
export function plate(c, x, y, w, h, r, a) { c.fillStyle = 'rgba(15,13,10,' + (a == null ? 0.72 : a) + ')'; rr2(c, x, y, w, h, r); c.fill(); c.strokeStyle = 'rgba(251,245,236,.12)'; c.lineWidth = 1; c.stroke(); }
export function txt(c, s, x, y, size, col, wgt, align, font) { c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI); c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y); }
const fmtClock = (t) => { t = max(0, t); if (t < 60) return t.toFixed(1); const m = (t / 60) | 0, s = (t | 0) % 60; return m + ':' + (s < 10 ? '0' : '') + s; };
const crestCache = new Map();
function crestImg(ti, size) {
  const k = ti + ':' + size; if (crestCache.has(k)) return crestCache.get(k);
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d');
  drawCrest(g, TEAMS[ti], size / 2, size / 2, size * 0.44); crestCache.set(k, cv); return cv;
}
function scorebug(c) {
  const w = arc.w, pad = arc.hudPad();
  const bw = min(w - 16, 440), bx = (w - bw) / 2, by = pad.top, bh = 44;
  const T0 = TEAMS[M.teams[0]], T1 = TEAMS[M.teams[1]];
  plate(c, bx, by, bw, bh, 10, 0.82);
  const half = bw * 0.33;
  // home on the left, away on the right, the clocks between
  c.fillStyle = T0.c1; rr2(c, bx + 3, by + 3, half - 3, bh - 6, 8); c.fill();
  c.fillStyle = T1.c1; rr2(c, bx + bw - half, by + 3, half - 3, bh - 6, 8); c.fill();
  const cs = 30;
  c.drawImage(crestImg(M.teams[0], 64), bx + 6, by + 7, cs, cs);
  c.drawImage(crestImg(M.teams[1], 64), bx + bw - 6 - cs, by + 7, cs, cs);
  txt(c, T0.id, bx + 40, by + 22, 13, T0.c2, 800, 'left', F_UI);
  txt(c, T1.id, bx + bw - 40, by + 22, 13, T1.c2, 800, 'right', F_UI);
  txt(c, String(M.score[0]), bx + half - 8, by + 23, 24, '#fff', 600, 'right', F_DISP);
  txt(c, String(M.score[1]), bx + bw - half + 8, by + 23, 24, '#fff', 600, 'left', F_DISP);
  const mx = bx + bw / 2;
  const showShot = M.phase !== 'intro' && M.shot < M.clock + 0.5 && M.kind === 'game';
  txt(c, qName(M.q) + '  ' + fmtClock(M.clock), mx, by + 15, 12, INK, 700, 'center', F_MONO);
  if (showShot) txt(c, String(Math.ceil(max(0, M.shot))), mx, by + 32, 15, M.shot <= 5 ? PRIM : WARM, 700, 'center', F_MONO);
  // possession arrow, team fouls, timeouts
  if (M.poss >= 0 && M.phase !== 'intro') { c.fillStyle = WARM; const ax = M.poss === 0 ? bx + half + 3 : bx + bw - half - 3; c.beginPath(); c.arc(ax, by + bh / 2, 3, 0, TAU); c.fill(); }
  const y2 = by + bh + 9;
  for (let s = 0; s < 2; s++) {
    const xx = s === 0 ? bx + 8 : bx + bw - 8, al = s === 0 ? 'left' : 'right';
    const bonus = M.tf[opp(s)] >= 5;
    let str = 'TO ' + '●'.repeat(max(0, M.tos[s])) + (bonus ? '  BONUS' : '');
    txt(c, str, xx, y2, 9, bonus ? WARM : 'rgba(251,245,236,.6)', 600, al, F_MONO);
  }
}
function noiseMeter(c) {
  const w = arc.w, pad = arc.hudPad();
  const x = w - pad.right - 14, y = pad.top + 70, h = 80;
  c.fillStyle = 'rgba(15,13,10,.6)'; rr2(c, x - 5, y - 18, 18, h + 24, 6); c.fill();
  txt(c, 'DB', x + 4, y - 9, 8, GOLD, 700, 'center', F_MONO);
  const n = clamp(M.noise, 0, 1), seg = 8;
  for (let i = 0; i < seg; i++) {
    const on = n * seg > i;
    c.fillStyle = on ? (i > 5 ? PRIM : i > 3 ? WARM : GOLD) : 'rgba(251,245,236,.12)';
    c.fillRect(x, y + h - (i + 1) * (h / seg) + 1, 8, h / seg - 2);
  }
}
function ticker(c) {
  const L = M.lines[M.lines.length - 1]; if (!L) return;
  const age = M.t - L.t; if (age > 3.6) return;
  const w = arc.w, pad = arc.hudPad();
  const a = clamp(min(age / 0.25, (3.6 - age) / 0.5), 0, 1);
  c.save(); c.globalAlpha = a;
  c.font = '500 13px ' + F_UI;
  const msg = L.text, mw = min(w - 24, c.measureText(msg).width + 120);
  const y = arc.h - pad.bottom - (arc.touchMode ? 88 : 30);
  plate(c, (w - mw) / 2, y - 15, mw, 30, 10, 0.72);
  txt(c, L.who.split(' ')[0].toUpperCase(), (w - mw) / 2 + 12, y, 10, GOLD, 700, 'left', F_MONO);
  txt(c, msg, (w - mw) / 2 + 80, y, 13, INK, 500, 'left');
  c.restore();
}
function banner(c) {
  if (!M.banner || M.banT <= 0) return;
  const a = clamp(min(M.banT / 0.3, 1), 0, 1);
  c.save(); c.globalAlpha = a;
  const w = arc.w, y = arc.h * 0.3;
  c.font = 'italic 600 26px ' + F_DISP;
  const mw = min(w - 30, c.measureText(M.banner).width + 50);
  plate(c, (w - mw) / 2, y - 24, mw, 48, 14, 0.66);
  txt(c, M.banner, w / 2, y, 26, INK, 600, 'center', F_DISP);
  c.restore();
}
function playerTag(c, p, label) {
  const s = view.toScreen(p.x, p.y + p.h + 0.42, p.z); if (!s || s.z > 1) return;
  const name = label || p.info.short;
  c.font = '700 11px ' + F_UI; const mw = max(46, c.measureText(name).width + 18);
  plate(c, s.x - mw / 2, s.y - 22, mw, 20, 8, 0.7);
  txt(c, name, s.x, s.y - 12, 11, INK, 700, 'center');
  c.fillStyle = 'rgba(251,245,236,.15)'; c.fillRect(s.x - mw / 2 + 6, s.y - 4, mw - 12, 3);
  c.fillStyle = p.stam > 0.5 ? '#7fd36a' : p.stam > 0.3 ? WARM : PRIM; c.fillRect(s.x - mw / 2 + 6, s.y - 4, (mw - 12) * p.stam, 3);
}
function shotMeter(c, p) {
  const ad = p.ad; if (!ad || ad.rel) return;
  let m;
  if (p.act === 'shoot' && ad.user) m = p.actT / RISE;
  else if (p.act === 'ft' && ad.user && ad.charging) m = ad.m || 0;
  else return;
  const s = view.toScreen(p.x, p.y + p.h * 0.75, p.z); if (!s || s.z > 1) return;
  const mh = 110, mw = 12, x = clamp(s.x + 46, 20, arc.w - 30), y1 = clamp(s.y + 40, 120 + mh, arc.h - 40), y0 = y1 - mh;
  plate(c, x - 9, y0 - 8, mw + 18, mh + 16, 10, 0.7);
  const yb = (v) => y1 - clamp(v / 1.6, 0, 1) * mh;
  const win = p.act === 'ft' ? M.diff.win * 1.2 : M.diff.win;
  c.fillStyle = 'rgba(255,183,54,.35)'; c.fillRect(x, yb(1 + win), mw, yb(1 - win) - yb(1 + win));
  c.strokeStyle = 'rgba(255,183,54,.95)'; c.lineWidth = 1.5; c.strokeRect(x - 3, yb(1 + win), mw + 6, yb(1 - win) - yb(1 + win));
  const inW = abs(m - 1) <= win;
  c.fillStyle = inW ? WARM : m > 1 + win ? PRIM : '#e8dccb'; rr2(c, x + 2, yb(m), mw - 4, y1 - yb(m), 4); c.fill();
}
function relMsg(c) {
  if (U.msgT <= 0 || !M.ctrl) return;
  const p = M.ctrl, s = view.toScreen(p.x, p.y + p.h + 0.9, p.z); if (!s || s.z > 1) return;
  const perfect = U.msg === 'Perfect release';
  c.save(); c.globalAlpha = clamp(U.msgT / 0.3, 0, 1);
  c.font = 'italic 600 18px ' + F_DISP; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 4; c.strokeStyle = 'rgba(15,13,10,.8)'; c.strokeText(U.msg, s.x, s.y - 20);
  c.fillStyle = perfect ? WARM : U.msg === 'Pump fake' || U.msg === 'Alley-oop' ? INK : PRIM; c.fillText(U.msg, s.x, s.y - 20);
  c.restore();
}
function passHint(c) {
  const p = M.ctrl; if (!p || B.holder !== p || p.act !== '' || M.phase !== 'live') return;
  const t = passTarget(p).t; if (!t) return;
  const s = view.toScreen(t.x, t.y + t.h + 0.25, t.z); if (!s || s.z > 1) return;
  const key = arc.gamepad ? 'A' : arc.touchMode ? 'TAP' : 'K';
  c.save(); c.globalAlpha = 0.85;
  c.fillStyle = 'rgba(15,13,10,.7)'; c.beginPath(); c.arc(s.x, s.y - 8, 11, 0, TAU); c.fill();
  c.strokeStyle = WARM; c.lineWidth = 1.5; c.stroke();
  txt(c, key, s.x, s.y - 8, key.length > 1 ? 7 : 10, WARM, 800, 'center', F_MONO);
  c.restore();
}
function introCard(c) {
  const I = M.intro; if (!I || I.i < 0 || I.i >= I.list.length) return;
  const p = I.list[I.i], T = TEAMS[M.teams[p.side]];
  const a = clamp(min(I.t / 0.25, (I.dur[I.i] - I.t) / 0.25), 0, 1);
  const w = arc.w, pad = arc.hudPad();
  const cw = min(w - 24, 380), cx = 12 + (arc.w > 700 ? 30 : 0), cy = arc.h - pad.bottom - (arc.touchMode ? 170 : 130);
  c.save(); c.globalAlpha = a;
  plate(c, cx, cy, cw, 84, 14, 0.82);
  c.fillStyle = T.c1; rr2(c, cx + 4, cy + 4, 70, 76, 10); c.fill();
  txt(c, String(p.info.num), cx + 39, cy + 44, 34, T.c2, 600, 'center', F_DISP);
  txt(c, (p.side === 0 ? 'STARTING  ' : 'VISITORS  ') + p.info.pos + '  ' + p.info.h.toFixed(2) + ' M', cx + 86, cy + 20, 10, GOLD, 700, 'left', F_MONO);
  txt(c, p.info.name, cx + 86, cy + 44, 20, INK, 600, 'left', F_DISP);
  txt(c, teamName(T) + '   OVR ' + p.info.ovr, cx + 86, cy + 66, 11, 'rgba(251,245,236,.7)', 600, 'left');
  c.restore();
  txt(c, arc.touchMode ? 'Tap to skip' : arc.gamepad ? 'A to skip' : 'Space to skip', arc.w - 14, arc.h - pad.bottom - 12, 11, 'rgba(251,245,236,.55)', 600, 'right');
}
function timeoutCard(c) {
  const side = M.toSide, T = TEAMS[M.teams[side]];
  const w = arc.w, cw = min(w - 24, 420), cx = (w - cw) / 2, cy = arc.h * 0.36;
  plate(c, cx, cy, cw, 52 + 5 * 20, 14, 0.84);
  txt(c, 'TIMEOUT  ' + T.name.toUpperCase(), cx + 14, cy + 18, 11, GOLD, 700, 'left', F_MONO);
  txt(c, (arc.touchMode ? 'Tap' : 'Space') + ' to play on', cx + cw - 14, cy + 18, 10, 'rgba(251,245,236,.6)', 600, 'right');
  const list = M.court[M.user >= 0 ? M.user : side];
  list.forEach((p, i) => {
    const y = cy + 42 + i * 20;
    txt(c, p.info.pos + ' ' + p.info.num + ' ' + p.info.short, cx + 14, y, 12, INK, 600, 'left');
    c.fillStyle = 'rgba(251,245,236,.12)'; c.fillRect(cx + cw * 0.55, y - 3, cw * 0.35, 6);
    c.fillStyle = p.stam > 0.5 ? '#7fd36a' : p.stam > 0.3 ? WARM : PRIM; c.fillRect(cx + cw * 0.55, y - 3, cw * 0.35 * p.stam, 6);
    txt(c, 'F' + p.fouls, cx + cw - 12, y, 10, p.fouls >= 4 ? PRIM : 'rgba(251,245,236,.6)', 700, 'right', F_MONO);
  });
}
function replayBug(c) {
  if (!M.replay) return;
  const pad = arc.hudPad();
  plate(c, pad.left, pad.top + (M.kind === 'game' ? 68 : 8), 128, 30, 8, 0.8);
  c.fillStyle = PRIM; c.beginPath(); c.arc(pad.left + 16, pad.top + (M.kind === 'game' ? 83 : 23), 5, 0, TAU); c.fill();
  txt(c, 'REPLAY', pad.left + 28, pad.top + (M.kind === 'game' ? 83 : 23), 12, INK, 800, 'left', F_MONO);
  txt(c, M.replay.why || '', arc.w / 2, arc.h - arc.hudPad().bottom - (arc.touchMode ? 150 : 40), 18, WARM, 600, 'center', F_DISP);
}
function c3Hud(c) {
  const C = M.c3; if (!C) return;
  const w = arc.w, pad = arc.hudPad();
  const bw = min(w - 16, 380), bx = (w - bw) / 2, by = pad.top;
  plate(c, bx, by, bw, 62, 12, 0.82);
  txt(c, (C.round === 2 ? 'FINAL' : 'ROUND 1') + '  ' + C.me.info.short, bx + 12, by + 16, 10, GOLD, 700, 'left', F_MONO);
  txt(c, String(C.pts), bx + 12, by + 42, 26, INK, 600, 'left', F_DISP);
  txt(c, C.t.toFixed(1), bx + bw - 12, by + 30, 22, C.t < 10 ? PRIM : INK, 600, 'right', F_MONO);
  // the racks: a dot a ball, gold for a money ball, ringed if made
  const rx = bx + 70, rw = bw - 150;
  for (let r = 0; r < 5; r++) for (let k = 0; k < 5; k++) {
    const x = rx + r * (rw / 5) + k * (rw / 5 / 6) + 6, y = by + 38;
    const idx = r * 5 + k, res = C.made[idx];
    c.beginPath(); c.arc(x, y, k === 4 ? 4.2 : 3.2, 0, TAU);
    c.fillStyle = res == null ? (k === 4 ? 'rgba(255,183,54,.35)' : 'rgba(251,245,236,.25)') : res ? (k === 4 ? WARM : '#7fd36a') : 'rgba(255,105,64,.6)';
    c.fill();
  }
  if (C.msgT > 0) { C.msgT -= 1 / 60; txt(c, C.msg, w / 2, arc.h * 0.3, 22, C.msg.indexOf('Money') >= 0 ? WARM : INK, 600, 'center', F_DISP); }
}
function dunkHud(c) {
  const D = M.dk; if (!D) return;
  const w = arc.w, pad = arc.hudPad(), p = D.list[D.turn];
  const bw = min(w - 16, 400), bx = (w - bw) / 2, by = pad.top;
  // a narrow screen gives the scores their own line rather than running them into the name
  const narrow = bw < 440;
  plate(c, bx, by, bw, narrow ? 70 : 52, 12, 0.82);
  txt(c, 'DUNK CONTEST  ROUND ' + D.round, bx + 12, by + 15, 10, GOLD, 700, 'left', F_MONO);
  txt(c, p.info.name + (D.turn === 0 ? ' (you)' : ''), bx + 12, by + 36, 16, INK, 600, 'left', F_DISP);
  const tot = D.scores.map((s) => (s[0] || 0) + (s[1] || 0));
  txt(c, D.list.map((q, i) => q.info.short + ' ' + tot[i]).join('   '), narrow ? bx + 12 : bx + bw - 12, by + (narrow ? 58 : 36), 10, 'rgba(251,245,236,.7)', 600, narrow ? 'left' : 'right', F_MONO);
  const C = D.cur;
  if (C && C.user && (D.phase === 'run' || D.phase === 'ready')) {
    const msg = arc.touchMode ? 'Drag to run, swipe up to take off' : arc.gamepad ? 'Stick to run, X to take off' : 'Run in, Space to take off';
    const d = hypot(p.x, p.z - CT.HOOP), yy = arc.h - pad.bottom - (arc.touchMode ? 96 : 40);
    plate(c, w / 2 - 170, yy - 34, 340, 48, 10, 0.72);
    txt(c, msg, w / 2, yy, 13, INK, 600, 'center');
    txt(c, 'Take-off ' + d.toFixed(1) + ' m' + (d > 4.9 ? '  (too far)' : d > 4.0 ? '  (from the line!)' : ''), w / 2, yy - 20, 12, d > 4.9 ? PRIM : WARM, 700, 'center', F_MONO);
  }
  if (C && D.phase === 'air') {
    const tricks = [C.spins ? (C.spins * 180 + 180) + ' spin' : '', C.wind ? 'windmill' : '', C.legs ? 'between the legs' : '', C.rev ? 'reverse' : ''].filter(Boolean).join(' + ');
    if (tricks) txt(c, tricks, w / 2, arc.h * 0.26, 20, WARM, 600, 'center', F_DISP);
    if (C.user && !C.slam) txt(c, arc.touchMode ? 'Swipe up to slam' : 'Space to slam  E spin  K windmill  L legs', w / 2, arc.h - pad.bottom - (arc.touchMode ? 96 : 40), 13, INK, 600, 'center');
  }
  if (D.phase === 'judge' && D.cards) {
    const cw = 46, gap = 8, tw = 5 * cw + 4 * gap, x0 = (w - tw) / 2, y0 = arc.h * 0.42;
    D.cards.forEach((v, i) => {
      const a = clamp((D.t - i * 0.16) / 0.2, 0, 1);
      c.save(); c.globalAlpha = a;
      c.fillStyle = '#fbf5ec'; rr2(c, x0 + i * (cw + gap), y0, cw, 62, 6); c.fill();
      txt(c, String(v), x0 + i * (cw + gap) + cw / 2, y0 + 32, 32, v === 10 ? '#c3302a' : '#1a1410', 700, 'center', F_DISP);
      c.restore();
    });
    const tot2 = D.cards.reduce((a, b) => a + b, 0);
    txt(c, tot2 + (tot2 === 50 ? '  A perfect fifty!' : ''), w / 2, y0 + 88, 20, WARM, 600, 'center', F_DISP);
  }
}
function practiceHud(c) {
  const st = practiceStep(); if (!st) return;
  const w = arc.w, pad = arc.hudPad();
  const bw = min(w - 16, 420), bx = (w - bw) / 2, by = pad.top;
  plate(c, bx, by, bw, 56, 12, 0.82);
  txt(c, st.free ? 'FREE PRACTICE' : 'STEP ' + (st.i + 1) + ' OF ' + st.n, bx + 12, by + 15, 10, GOLD, 700, 'left', F_MONO);
  if (!st.free) {
    txt(c, st.step.t, bx + 12, by + 33, 15, INK, 600, 'left', F_DISP);
    txt(c, st.step.k, bx + 12, by + 48, 10, 'rgba(251,245,236,.7)', 600, 'left', F_MONO);
  } else txt(c, 'Every move is live. Pause for the menu.', bx + 12, by + 36, 13, INK, 600, 'left');
  if (st.done > 0) txt(c, 'Done!', bx + bw - 14, by + 30, 18, '#7fd36a', 700, 'right', F_DISP);
}
export function drawHud(c) {
  if (arc.state !== 'play') return;
  U.msgT = max(0, U.msgT - 1 / 60);
  if (M.kind === 'game') {
    if (M.phase === 'intro') { introCard(c); return; }
    scorebug(c);
    if (!M.replay) noiseMeter(c);
    if (M.phase === 'timeout') timeoutCard(c);
    if (M.ctrl && !M.replay && M.phase !== 'timeout' && M.phase !== 'final') { playerTag(c, M.ctrl); shotMeter(c, M.ctrl); relMsg(c); passHint(c); }
    banner(c); ticker(c); replayBug(c);
    if (M.phase === 'tip' && M.tip && !M.tip.done && M.user >= 0) txt(c, arc.touchMode ? 'Swipe up at the top to win the tip' : 'Space at the top of the toss to win the tip', arc.w / 2, arc.h * 0.62, 13, INK, 600, 'center');
  } else if (M.kind === 'c3') { c3Hud(c); if (M.ctrl) { shotMeter(c, M.ctrl); relMsg(c); } banner(c); }
  else if (M.kind === 'dunk') { dunkHud(c); banner(c); replayBug(c); }
  else if (M.kind === 'practice') { practiceHud(c); if (M.ctrl) { playerTag(c, M.ctrl); shotMeter(c, M.ctrl); relMsg(c); passHint(c); } banner(c); }
}

/* ====================================================================== menus, rules, controls */
const MODES = [{ v: 'quick', label: 'Quick game' }, { v: 'season', label: 'Season' }, { v: 'three', label: '3-point contest' }, { v: 'dunk', label: 'Dunk contest' }, { v: 'roof', label: 'Rooftop shootout' }, { v: 'practice', label: 'Practice' }];
const RULES_HTML = STYLE + '<div class="cl-rules">' +
  '<h3>The game</h3><p>Five on five, four quarters (2, 3 or 5 minutes each, your choice). Tied after four? Overtime until someone wins.</p>' +
  '<h3>Scoring</h3><ul><li>Two points inside the arc, three from beyond it, one for a free throw.</li><li>A made basket gives the ball to the other team, from under their own hoop.</li></ul>' +
  '<h3>The clocks</h3><ul><li>Game clock: runs during live play. After a basket it keeps running, except in the last minute of the fourth and in overtime.</li><li>Shot clock: 24 seconds to shoot; 14 after an offensive rebound. Run out and the ball goes over.</li></ul>' +
  '<h3>Violations</h3><ul><li>Travelling: pick up your dribble (a pump fake does) and move more than a step.</li><li>Eight seconds to bring the ball over half court; once over, you cannot take it back (backcourt).</li><li>Step out of bounds, or touch the ball last before it goes out, and it is the other team’s.</li></ul>' +
  '<h3>Fouls</h3><ul><li>Reaching in, or hitting a shooter, is a foul. A shooter fouled gets two or three free throws; make it anyway and it is an and-one.</li><li>From a team’s fifth foul of a quarter, every foul gives two free throws (the bonus).</li><li>Five personal fouls and a player is out of the game.</li></ul>' +
  '<h3>Timeouts and the bench</h3><ul><li>Three timeouts a team (at least two after halftime). Call one with T, or from the pause menu.</li><li>Players tire as they run and sprint; tired legs shoot worse. Substitutes come in at dead balls: automatically, or by you from the pause menu when subs are manual.</li></ul>' +
  '<h3>Contests</h3><ul><li>Three-point contest: five racks, five balls each, the last one (the money ball) worth two. Sixty seconds. The top two shoot a final.</li><li>Dunk contest: three dunkers, two rounds, five judges out of ten each. Further take-offs, spins, windmills and between the legs score more, if you land the slam on the beat.</li></ul>' +
  '<h3>The rooftop</h3><p>The original Court Lights: one hoop on a lit roof. Hold to charge, release in the gold band; a streak adds a point a make.</p></div>';
const KEYS_HTML = STYLE + '<div class="cl-rules"><h3>Keyboard and mouse</h3><div class="cl-keys">' +
  [['WASD / arrows', 'Move'], ['Shift (hold)', 'Sprint'], ['Space / J / click', 'Shoot: hold, release at the top. Near the rim: layup; sprinting: dunk. Defence: block, rebound'], ['K', 'Pass (aim with the stick). Defence: switch player'], ['L', 'Lob, an alley-oop to a cutter near the rim'], ['E', 'Crossover. With Shift: spin. Defence: steal'], ['Q', 'Spin move'], ['C', 'Call a screen'], ['T', 'Timeout'], ['V', 'Change camera'], ['Esc / P', 'Pause, subs and timeouts']].map((r) => '<kbd>' + r[0] + '</kbd><span>' + r[1] + '</span>').join('') +
  '</div><h3>Touch</h3><div class="cl-keys">' +
  [['Drag anywhere', 'Move (a stick appears under your thumb)'], ['Shoot button (hold)', 'Shoot, release at the top'], ['Swipe up', 'Quick shot; a medium flick is perfect. Defence: block'], ['Tap / Pass button', 'Pass to the marked team mate. Defence: switch'], ['Swipe left or right', 'Crossover. Defence: steal'], ['Swipe down', 'Spin move'], ['Stick & buttons', 'Settings: every action on its own button']].map((r) => '<kbd>' + r[0] + '</kbd><span>' + r[1] + '</span>').join('') +
  '</div><h3>Controller</h3><div class="cl-keys">' +
  [['Left stick / d-pad', 'Move'], ['RT', 'Sprint'], ['X', 'Shoot / block'], ['A', 'Pass / switch'], ['Y', 'Lob, alley-oop'], ['B', 'Crossover (with RT: spin) / steal'], ['LT', 'Call a screen'], ['Start', 'Pause']].map((r) => '<kbd>' + r[0] + '</kbd><span>' + r[1] + '</span>').join('') +
  '</div></div>';
function seasonHtml() {
  const d = Season.data; if (!d) return '<p>No season in progress.</p>';
  const t = Season.table();
  const rows = t.map((r, i) => '<tr class="' + (r.i === d.team ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(teamName(TEAMS[r.i])) + '</td><td>' + r.w + '-' + r.l + '</td><td>' + (r.pf - r.pa > 0 ? '+' : '') + (r.pf - r.pa) + '</td><td>' + (r.strk || '') + '</td></tr>').join('');
  const nx = Season.next();
  let po = '';
  if (d.po) {
    const g = (s) => s ? esc(TEAMS[s.h].id) + ' ' + (s.s ? s.s[0] + '-' + s.s[1] + ' ' : 'v ') + esc(TEAMS[s.a].id) : '';
    po = '<h3>Playoffs</h3><p>' + d.po.semis.map(g).join(' &nbsp; ') + (d.po.final ? '<br>Final: ' + g(d.po.final) : '') + '</p>';
  }
  const leaders = Object.keys(d.stats).map((id) => ({ id, s: d.stats[id] })).filter((x) => x.s.g).sort((a, b) => b.s.pts / b.s.g - a.s.pts / a.s.g).slice(0, 3);
  const lead = leaders.length ? '<h3>Your leaders</h3><p>' + leaders.map((x) => { const p = rosters()[d.team].find((q) => q.id === x.id); return esc(p ? p.name : x.id) + ' ' + (x.s.pts / x.s.g).toFixed(1) + ' ppg'; }).join('<br>') + '</p>' : '';
  return STYLE + '<div class="cl-rules"><p>' + esc(teamName(TEAMS[d.team])) + ', ' + DIFF[d.diff].label + '. ' + (d.champ != null ? 'Champions: ' + esc(teamName(TEAMS[d.champ])) + '.' : nx ? 'Next: ' + nx.stage + ', ' + esc(TEAMS[nx.home].name) + ' v ' + esc(TEAMS[nx.away].name) + '.' : '') + '</p>' +
    '<div class="cl-scroll"><table class="cl-tbl"><thead><tr><th>#</th><th>Club</th><th>W-L</th><th>+/-</th><th>Run</th></tr></thead><tbody>' + rows + '</tbody></table>' + po + lead + '</div></div>';
}
function menuHtml() {
  const d = Season.load();
  const u = UNL.get(), tt = titles();
  let s = '<p>Eight clubs, five on five under the arena lights: quick games, a season and playoffs, the contests, practice, and the rooftop shootout.</p>';
  if (d && d.champ == null) { const nx = Season.next(); s += '<p class="cl-note">Season: ' + esc(TEAMS[d.team].name) + ' ' + (nx ? '(' + nx.stage + ')' : '') + '</p>'; }
  const un = [u.legend ? 'Legend difficulty' : '', u.goldball ? 'Gold ball' : '', u.nightcourt ? 'Night Court' : '', tt.length ? tt.length + ' title banner' + (tt.length > 1 ? 's' : '') : ''].filter(Boolean);
  if (un.length) s += '<p class="cl-note">Unlocked: ' + un.join(', ') + '</p>';
  return STYLE + s;
}
const back = () => arc.menu();
function showPanel(eyebrow, title, html, extra) {
  arc.panel({ eyebrow, title, html, actions: [{ label: 'Back', primary: true, on: back }].concat(extra || []) });
}
function pauseHtml() {
  if (M.kind === 'roof') return '<div class="stat"><div>Score<b>' + SH.score + '</b></div><div>Makes<b>' + SH.makes + '/' + SH.attempts + '</b></div></div>';
  if (M.kind === 'c3') return '<div class="stat"><div>Points<b>' + M.c3.pts + '</b></div><div>Time<b>' + M.c3.t.toFixed(0) + 's</b></div></div>';
  if (M.kind === 'dunk') return '<div class="stat"><div>Round<b>' + M.dk.round + '</b></div></div>';
  if (M.kind === 'practice') return '<p>Practice: ' + (M.pr.free ? 'free play' : 'step ' + (M.pr.step + 1) + ' of ' + STEPS.length) + '.</p>';
  if (M.kind !== 'game' || M.user < 0) return '';
  const u = M.user, T = TEAMS[M.teams[u]];
  let h = STYLE + '<p><b>' + esc(TEAMS[M.teams[0]].id) + ' ' + M.score[0] + ' - ' + M.score[1] + ' ' + esc(TEAMS[M.teams[1]].id) + '</b>, ' + qName(M.q) + ' ' + fmtClock(M.clock) + '</p>';
  h += '<div id="cl-bench">' + benchHtml() + '</div>';
  h += '<p><button type="button" class="arc-btn" data-cl="to"' + (M.tos[u] > 0 ? '' : ' disabled') + '>Call timeout (' + M.tos[u] + ' left)</button> <button type="button" class="arc-btn" data-cl="rules">Rules</button></p>';
  void T;
  return h;
}
function benchHtml() {
  const u = M.user, list = M.side[u];
  return '<table class="cl-tbl"><thead><tr><th></th><th>Player</th><th>Legs</th><th>F</th><th>PTS</th></tr></thead><tbody>' + list.map((p, i) => {
    const on = p.court;
    return '<tr class="' + (on ? 'me' : '') + '"><td>' + (on ? '●' : '') + '</td><td>' + esc(p.info.pos + ' ' + p.info.short) + '</td><td>' + Math.round(p.stam * 100) + '%</td><td>' + p.fouls + '</td><td>' + p.st.pts + ' ' +
      (on ? '' : '<button type="button" class="arc-btn" style="padding:2px 8px;min-height:0" data-cl="sub" data-i="' + i + '">Sub in</button>') + '</td></tr>';
  }).join('') + '</tbody></table><p class="cl-note">Subs: ' + (M.subs === 'auto' ? 'automatic' : 'manual, the player you bring in takes the place of the most tired one at his position') + '. <button type="button" class="arc-btn" style="padding:2px 10px;min-height:0" data-cl="subsmode">' + (M.subs === 'auto' ? 'Make manual' : 'Make automatic') + '</button></p>';
}
function onDocClick(e) {
  const b = e.target.closest && e.target.closest('[data-cl]'); if (!b) return;
  const k = b.getAttribute('data-cl');
  if (k === 'to') { if (requestTimeout(M.user)) arc.resume(); }
  else if (k === 'subsmode') { M.subs = M.subs === 'auto' ? 'manual' : 'auto'; const el = document.getElementById('cl-bench'); if (el) el.innerHTML = benchHtml(); }
  else if (k === 'rules') showPanel('How to play', 'The <em>rules</em>', RULES_HTML, [{ label: 'Resume', on: () => arc.resume() }]);
  else if (k === 'sub') {
    const u = M.user, inP = M.side[u][+b.getAttribute('data-i')];
    if (!inP || inP.court || inP.fouls >= 5) return;
    const g = (q) => (q.info.pos === 'PG' || q.info.pos === 'SG' || q.info.pos === 'G' ? 0 : q.info.pos === 'C' ? 2 : 1);
    let best = 0, bv = 9;
    M.court[u].forEach((p, i) => { const v = p.stam + abs(g(p) - g(inP)) * 0.4 - (p === B.holder ? -2 : 0); if (v < bv) { bv = v; best = i; } });
    M.pendingSub = M.pendingSub || []; M.pendingSub.push([u, best, inP]);
    if (M.phase !== 'live') { subIn(u, best, inP); M.pendingSub.length = 0; }
    const el = document.getElementById('cl-bench'); if (el) el.innerHTML = benchHtml();
  }
}

/* ====================================================================== the shell */
const RT = { mode: 'quick', choices: null };
function teamIdx(id) { const i = TEAMS.findIndex((t) => t.id === id); return i < 0 ? 1 : i; }
function startMode(a, ch) {
  arc = a;
  RT.choices = ch;
  const mode = ch.mode || 'quick';
  RT.mode = mode;
  let diffKey = ch.diff || 'pro';
  if (diffKey === 'legend' && !UNL.get().legend) { diffKey = 'allstar'; a.toast('Legend is locked', 'Win a game on All-Star to unlock it', 2200); }
  const diff = DIFF[diffKey] || DIFF.pro, team = teamIdx(ch.team || 'KIT'), qlen = +(ch.qlen || 3);
  M.stageKind = '';
  let night = ch.arena === 'night';
  if (night && !UNL.get().nightcourt) { night = false; a.toast('Night Court is locked', 'Win the dunk contest to unlock it', 2200); }
  if (view.night) view.night(night);
  view.venue(mode === 'roof' ? 'roof' : 'arena');
  // the reminder along the bottom follows the mode
  const touch = arc.touchMode && arc.touchStyle !== 'pads';
  const HINTS = {
    roof: touch ? 'Hold to charge, slide to aim, lift in the gold' : 'Mouse or arrows aim   hold click or Space, release in the gold',
    three: touch ? 'Hold Shoot or swipe up: release at the top' : 'Hold Space, release at the top of the meter',
    dunk: touch ? 'Drag to run in, swipe up to take off and to slam' : 'Run in, Space to take off, E K L tricks, Space to slam',
  };
  try { const h = document.querySelector('.arc-hint'); if (h) h.textContent = HINTS[mode] || (touch ? arc.opts.gestures.hint : arc.touchMode ? arc.opts.touchHint : arc.opts.hint); } catch (e) { /* no hint bar */ }
  M.slow = 0; M.replay = null; M.lines = [];
  if (mode === 'roof') { M.kind = 'roof'; shNewMatch(ch); return; }
  if (mode === 'three') { startC3(team, { diff }); return; }
  if (mode === 'dunk') { startDunk(team, { diff }); return; }
  if (mode === 'practice') { startPractice(team, { diff }); return; }
  if (mode === 'season') {
    let d = Season.load();
    if (!d || d.champ != null || (d.po && d.po.out && Season.next() == null)) d = Season.create(team, 7, diffKey, qlen);
    const nx = Season.next();
    if (!nx) { Season.create(team, 7, diffKey, qlen); }
    const n2 = Season.next();
    const user = n2.home === Season.data.team ? 0 : 1;
    M.stageKind = 'season';
    startGame(n2.home, n2.away, { user, qlen: Season.data.qlen, diff: DIFF[Season.data.diff] || diff, intro: true, stage: n2.stage, subs: ch.subs || 'auto' });
    return;
  }
  let opp2 = ch.opp && ch.opp !== 'auto' ? teamIdx(ch.opp) : -1;
  if (opp2 < 0 || opp2 === team) { do { opp2 = (Math.random() * 8) | 0; } while (opp2 === team); }
  startGame(team, opp2, { user: 0, qlen, diff, intro: true, subs: ch.subs || 'auto' });
}
// The menu's backdrop: two clubs play it out on their own.
function attract(dt) {
  if (M.kind !== 'game' || M.user !== -1 || M.phase === 'final' || M.phase === 'off') {
    const a = (Math.random() * 8) | 0; let b; do { b = (Math.random() * 8) | 0; } while (b === a);
    startGame(a, b, { user: -1, qlen: 2, diff: DIFF.allstar, intro: false });
    view.venue('arena'); if (view.night) view.night(false);
  }
  if (M.phase === 'qend' && M.phaseT > 2.5) M.phaseT = 3.2;
  gameUpdate(dt);
}
let devHold = false;
function update(dt) {
  if (devHold) return;
  const k = view.timeScale ? view.timeScale() : 1;
  const d = dt * k;
  if (M.kind === 'roof') { shUpdate(dt); return; }
  if (M.kind === 'c3') { c3Update(d); return; }
  if (M.kind === 'dunk') { if (M.phase !== 'dunkdone') dunkUpdate(d); return; }
  if (M.kind === 'practice') { practiceUpdate(d); return; }
  if (M.pendingSub && M.pendingSub.length && M.phase !== 'live') { M.pendingSub.forEach((s) => subIn(s[0], s[1], s[2])); M.pendingSub.length = 0; }
  if (arc.input.hit('KeyV') && view.cycleCam) view.cycleCam();
  gameUpdate(d);
}
function dbg() {
  const base = M.kind === 'roof' ? {
    phase: SH.phase, mode: 'roof:' + SH.mode, score: SH.score, time: +SH.time.toFixed(2), aimX: +SH.aimX.toFixed(3), charge: +SH.charge.toFixed(3), makes: SH.makes, attempts: SH.attempts, attract: !!SH.attract,
  } : {
    kind: M.kind, mode: RT.mode, phase: M.phase, q: M.q, clock: +M.clock.toFixed(2), shot: +M.shot.toFixed(1), score: M.score.slice(), poss: M.poss,
    ball: B.state, bxz: [+B.x.toFixed(2), +B.y.toFixed(2), +B.z.toFixed(2)], ctrl: M.ctrl ? M.ctrl.info.short : null, act: M.ctrl ? M.ctrl.act : '',
    time: +(M.kind === 'c3' && M.c3 ? M.c3.t : M.clock).toFixed(2), c3: M.c3 && M.kind === 'c3' ? M.c3.pts : undefined, dunk: M.dk && M.kind === 'dunk' ? M.dk.phase : undefined,
    step: M.pr && M.kind === 'practice' ? M.pr.step : undefined, attract: M.user === -1,
  };
  return Object.assign(base, view.dbg ? view.dbg() : {}, { touchStyle: arc.touchStyle });
}
export function boot(v) {
  Object.assign(view, v);
  rosters(); Season.load();
  document.addEventListener('click', onDocClick);
  const teamCh = TEAMS.map((t) => ({ v: t.id, label: t.name }));
  window.Arcade.create({
    slug: 'court-lights', title: 'Court Lights', genre: 'Basketball', three: !!v.three,
    hint: 'WASD move  Shift sprint  Space shoot  K pass  L lob  E cross  C screen',
    touchHint: 'Stick moves, Shoot (hold) and Pass',
    keys: [['WASD / arrows', 'Move'], ['Shift (hold)', 'Sprint'], ['Space / J (hold)', 'Shoot, release at the top; block on defence'], ['K', 'Pass / switch player'], ['L', 'Lob, alley-oop'], ['E / Q', 'Crossover / spin; steal on defence'], ['C', 'Call a screen'], ['T', 'Timeout'], ['V', 'Camera']],
    mouse: { cursor: 'default', keys: [['Click (hold)', 'Shoot / block']] },
    touch: { stick: true, pads: [{ label: 'Shoot', key: 'Space', big: true, hot: true, keep: true }, { label: 'Pass', key: 'KeyK', keep: true }, { label: 'Lob', key: 'KeyL' }, { label: 'Cross', key: 'KeyE' }, { label: 'Sprint', key: 'ShiftLeft' }, { label: 'Screen', key: 'KeyC' }] },
    touchKeys: [['Stick', 'Move'], ['Shoot (hold)', 'Shoot / block'], ['Pass', 'Pass / switch'], ['Lob', 'Alley-oop'], ['Cross', 'Crossover / steal'], ['Sprint', 'Sprint'], ['Screen', 'Call a screen']],
    gestures: {
      drag: 'xy',
      hint: 'Drag to move, hold Shoot, tap to pass, swipe up to shoot',
      keys: [['Drag', 'Move'], ['Shoot (hold)', 'Shoot, release at the top'], ['Swipe up', 'Quick shot / block'], ['Tap or Pass', 'Pass / switch'], ['Swipe sideways', 'Crossover / steal'], ['Swipe down', 'Spin']],
    },
    gamepad: { buttons: ['KeyK', 'Space', 'KeyE', 'KeyL'], rt: 'ShiftLeft', lt: 'KeyC' },
    gameKeys: ['KeyK', 'KeyL', 'KeyE', 'KeyQ', 'KeyC', 'KeyT', 'KeyV', 'ShiftLeft', 'ShiftRight'],
    formatScore: (x) => Math.round(x) + ' pts',
    menu: {
      eyebrow: LEAGUE, title: 'Court <em>Lights</em>',
      get html() { return menuHtml(); },
      options: [
        { id: 'mode', label: 'Mode', value: 'quick', choices: MODES },
        { id: 'team', label: 'Your club', value: 'KIT', choices: teamCh },
        { id: 'opp', label: 'Opponent (quick game)', value: 'auto', choices: [{ v: 'auto', label: 'Any' }].concat(teamCh) },
        { id: 'diff', label: 'Difficulty', value: 'pro', choices: [{ v: 'rookie', label: 'Rookie' }, { v: 'pro', label: 'Pro' }, { v: 'allstar', label: 'All-Star' }, { v: 'legend', label: 'Legend' }] },
        { id: 'qlen', label: 'Quarter length', value: '3', choices: [{ v: '2', label: '2 min' }, { v: '3', label: '3 min' }, { v: '5', label: '5 min' }] },
        { id: 'arena', label: 'Arena', value: 'classic', choices: [{ v: 'classic', label: 'Floodlight Arena' }, { v: 'night', label: 'Night Court' }] },
        { id: 'roof', label: 'Rooftop variant', value: 'sixty', choices: [{ v: 'sixty', label: 'Sixty seconds' }, { v: 'twentyone', label: 'First to 21' }, { v: 'sudden', label: 'Make or miss' }] },
      ],
      actions: [
        { label: 'Play', primary: true, on: () => arc.start() },
        { label: 'Season table', on: () => showPanel('Season', 'The <em>table</em>', seasonHtml(), [{ label: 'New season', on: () => { Season.reset(); arc.toast('Season reset', null, 1400); arc.menu(); } }]) },
        { label: 'Rules', on: () => showPanel('How to play', 'The <em>rules</em>', RULES_HTML) },
        { label: 'Controls', on: () => showPanel('Controls', 'Every <em>button</em>', KEYS_HTML) },
        { label: 'All games', href: '/games' },
      ],
    },
    graphics(level) { if (view.graphics) view.graphics(level); },
    resize(a) { arc = a; if (view.resize) view.resize(a); },
    pauseHtml,
    onMenu(a) { arc = a; if (M.kind === 'roof') { M.kind = 'game'; M.user = 0; } M.phase = M.user === -1 ? M.phase : 'off'; view.venue('arena'); },
    onOver(a) { arc = a; },
    init(a) { arc = a; a.debug = dbg; a.dev = Object.assign(view.dev || {}, DEV); if (view.init) view.init(a); M.phase = 'off'; a.menu(); },
    start: (a, ch) => startMode(a, ch),
    update: (dt) => update(dt),
    idle: (dt) => { if (arc.state === 'over') { if (M.kind === 'roof') shIdleOver(dt); else if (M.kind === 'game' && M.phase === 'final') finalIdle(dt); else if (M.kind === 'c3' || M.kind === 'dunk' || M.kind === 'practice') contestIdle(dt); return; } attract(dt); },
    render: (c) => { if (view.render) view.render(c); if (M.kind !== 'roof') drawHud(c); },
  });
}
// test hooks: stage a moment (posters, screenshots, checks)
const DEV = {
  // the user's player gets the ball near the rim and goes up for a dunk
  dunk() { if (M.kind !== 'game' || M.user < 0) return; const p = M.court[M.user][4]; const s = M.dir[M.user]; if (M.phase !== 'live') { M.phase = 'live'; M.intro = null; } p.x = 0.6; p.z = s * (CT.HOOP - 2.2); p.vx = 0; p.vz = s * 4; p.yaw = s > 0 ? 0 : PI; resetBall(); giveBall(p, 'dev'); startShot(p, 'dunk', true); },
  three() { if (M.kind !== 'game' || M.user < 0) return; const p = M.court[M.user][1]; const s = M.dir[M.user]; if (M.phase !== 'live') { M.phase = 'live'; M.intro = null; } p.x = -4.9; p.z = s * (CT.HOOP - 5.2); resetBall(); giveBall(p, 'dev'); startShot(p, 'jumper', false); },
  endGame() { if (M.kind !== 'game') return; M.q = 4; M.clock = min(M.clock, 2.5); if (M.score[0] === M.score[1]) M.score[M.user >= 0 ? M.user : 0] += 2; },
  // a half-court set: side has the ball at the top of the key, the defence matched up
  hold(on) { devHold = !!on; },
  halfcourt(side) {
    if (M.kind !== 'game') return;
    M.intro = null; M.phase = 'live'; M.phaseT = 0; M.next = null; M.ft = null; M.replay = null; M.wantReplay = null;
    const o = opp(side), hz = hoopZ(side);
    M.court[side].forEach((p, i) => { const sp = SPOTS.motion[i]; p.x = sp[0]; p.z = spotZ(side, sp[1]); p.vx = p.vz = 0; p.act = ''; p.y = 0; p.vy = 0; p.yaw = faceTo(p, 0, hz); });
    M.court[o].forEach((p, i) => { const m = M.court[side][i]; const ax = -m.x, az = hz - m.z, al = hypot(ax, az) || 1; p.x = m.x + ax / al * 1.2; p.z = m.z + az / al * 1.2; p.vx = p.vz = 0; p.act = ''; p.y = 0; p.vy = 0; p.yaw = faceTo(p, m.x, m.z); });
    resetBall(); giveBall(M.court[side][0], 'dev'); M.shot = 20; M.front = true; planOffence(side, 'dev');
  },
  live() { if (M.kind === 'game' && (M.phase === 'intro' || M.phase === 'tip')) { M.intro = null; startTip(); M.tip.t = 1.2; } },
  match: () => M,
};
function finalIdle(dt) { M.t += dt; M.phaseT += dt; for (const p of courtPlayers()) { if (p.react && M.t >= p.react.at) doReact(p); p.vx *= 0.92; p.vz *= 0.92; integrate(p, dt); } stepBall(dt); }
function contestIdle(dt) { M.t += dt; for (const p of M.court[0]) { p.vx *= 0.9; p.vz *= 0.9; integrate(p, dt); } stepBall(dt); }
function shIdleOver(dt) { void dt; }
export { M as MATCH, B as BALL, view as VIEW };
