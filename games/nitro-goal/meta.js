/*
 * Nitro Goal, everything around the match: the Nitro League (clubs, a saved
 * season with a table and playoffs), the player's profile (levels, rank,
 * trophies), the garage of cosmetic unlocks, the training packs, the
 * commentary and quick chat lines, and the rules and controls cards.
 *
 * Pure data and small helpers with no imports, so core.js (shared by the 3D
 * and 2D editions) can use it without a cycle. Every name here is invented.
 */

/* ------------------------------------------------------------ storage */
const KEY = { profile: 'arcade.nitro-goal.profile', season: 'arcade.nitro-goal.season', garage: 'arcade.nitro-goal.garage', train: 'arcade.nitro-goal.training' };
function rd(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function wr(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: play on */ } }
const rnd = Math.random;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------ the Nitro League: eight invented clubs */
// rating 0..1 shifts the bots' form; style nudges how they play (press high, sit back, go up in the air)
export const CLUBS = [
  { name: 'Saffron Comets', short: 'Comets', abbr: 'SAF', rating: 0.55, style: 'press', drivers: ['Kabir', 'Meera'] },
  { name: 'Monsoon Rockets', short: 'Rockets', abbr: 'MON', rating: 0.62, style: 'air', drivers: ['Zoya', 'Arjun', 'Ishaan'] },
  { name: 'Harbour Hornets', short: 'Hornets', abbr: 'HAR', rating: 0.7, style: 'press', drivers: ['Tara', 'Neel', 'Rhea'] },
  { name: 'Deccan Dynamos', short: 'Dynamos', abbr: 'DEC', rating: 0.48, style: 'sit', drivers: ['Omar', 'Pia', 'Varun'] },
  { name: 'Riverbend Raptors', short: 'Raptors', abbr: 'RIV', rating: 0.58, style: 'air', drivers: ['Sana', 'Dev', 'Aman'] },
  { name: 'Coral Cyclones', short: 'Cyclones', abbr: 'COR', rating: 0.44, style: 'sit', drivers: ['Lina', 'Rohan', 'Kiara'] },
  { name: 'Highland Thunder', short: 'Thunder', abbr: 'HIG', rating: 0.66, style: 'sit', drivers: ['Yash', 'Noor', 'Farid'] },
  { name: 'Lotus Lancers', short: 'Lancers', abbr: 'LOT', rating: 0.52, style: 'press', drivers: ['Anya', 'Kunal', 'Tej'] }
];
export const LEAGUE = 'Nitro League';

/* ------------------------------------------------------------ ranks and levels */
// Rank points (RP) move after every match against bots; each tier has three divisions of 100 RP.
export const RANKS = ['Spark', 'Ignite', 'Blaze', 'Inferno', 'Nova', 'Supernova', 'Nitro Legend'];
export function rankOf(rp) {
  rp = Math.max(0, rp | 0);
  const tier = Math.min(RANKS.length - 1, Math.floor(rp / 300));
  if (tier === RANKS.length - 1) return { tier, name: RANKS[tier], div: '', label: RANKS[tier], next: null, floor: tier * 300 };
  const div = Math.floor((rp - tier * 300) / 100);
  return { tier, name: RANKS[tier], div: ['I', 'II', 'III'][div], label: RANKS[tier] + ' ' + ['I', 'II', 'III'][div], next: tier * 300 + (div + 1) * 100, floor: tier * 300 + div * 100 };
}
export const xpFor = (lvl) => 120 + lvl * 60;   // XP from level lvl to lvl + 1
export function loadProfile() {
  const p = rd(KEY.profile, null);
  const base = { v: 1, xp: 0, level: 1, rp: 120, played: 0, wins: 0, losses: 0, goals: 0, saves: 0, assists: 0, demos: 0, mvps: 0, titles: 0, hoops: 0, puck: 0, streak: 0, best: 0 };
  return p && typeof p === 'object' ? Object.assign(base, p) : base;
}
export function saveProfile(p) { wr(KEY.profile, p); }

/* ------------------------------------------------------------ the garage */
// Unlock rules: lvl (profile level), rank (tier index), title (a season title), hoops / puck (wins in that mode)
export const GARAGE = {
  body: [
    { v: 'comet', label: 'Comet', note: 'Balanced wedge', need: {} },
    { v: 'tusker', label: 'Tusker', note: 'Tall and square', need: { lvl: 2 } },
    { v: 'kestrel', label: 'Kestrel', note: 'Low and long', need: { lvl: 4 } },
    { v: 'scarab', label: 'Scarab', note: 'Round shell', need: { lvl: 6 } },
    { v: 'mongoose', label: 'Mongoose', note: 'Twin fins', need: { lvl: 9 } },
    { v: 'jugnu', label: 'Jugnu', note: 'Champions only', need: { title: 1 } }
  ],
  finish: [
    { v: 'gloss', label: 'Gloss', need: {} },
    { v: 'matte', label: 'Matte', need: { lvl: 3 } },
    { v: 'metal', label: 'Metallic', need: { lvl: 5 } },
    { v: 'pearl', label: 'Pearl', need: { lvl: 8 } },
    { v: 'mirror', label: 'Mirror', need: { rank: 4 } }
  ],
  boost: [
    { v: 'team', label: 'Team flame', need: {} },
    { v: 'marigold', label: 'Marigold', need: { lvl: 2 } },
    { v: 'ice', label: 'Glacier', need: { lvl: 5 } },
    { v: 'emerald', label: 'Emerald', need: { lvl: 7 } },
    { v: 'violet', label: 'Violet', need: { hoops: 1 } },
    { v: 'festival', label: 'Festival', need: { title: 1 } }
  ],
  explosion: [
    { v: 'classic', label: 'Classic burst', need: {} },
    { v: 'marigold', label: 'Marigold storm', need: { lvl: 3 } },
    { v: 'thunder', label: 'Thunderclap', need: { lvl: 5 } },
    { v: 'monsoon', label: 'Monsoon wave', need: { puck: 1 } },
    { v: 'diya', label: 'Diya lights', need: { lvl: 10 } },
    { v: 'nova', label: 'Supernova', need: { rank: 5 } }
  ]
};
export const BOOST_COL = { team: null, marigold: '#ffb42a', ice: '#9fe8ff', emerald: '#3dffa0', violet: '#b07aff', festival: '#ff4fa0' };
export const BODY_KEYS = GARAGE.body.map((b) => b.v);
export function unlocked(item, p) {
  const n = item.need || {};
  if (n.lvl && p.level < n.lvl) return false;
  if (n.rank != null && rankOf(p.rp).tier < n.rank) return false;
  if (n.title && p.titles < n.title) return false;
  if (n.hoops && p.hoops < n.hoops) return false;
  if (n.puck && p.puck < n.puck) return false;
  return true;
}
export function needText(item) {
  const n = item.need || {};
  if (n.lvl) return 'Level ' + n.lvl;
  if (n.rank != null) return RANKS[n.rank] + ' rank';
  if (n.title) return 'Win a season';
  if (n.hoops) return 'Win a Hoops match';
  if (n.puck) return 'Win a Snow Puck match';
  return '';
}
export function loadGarage(p) {
  const g = Object.assign({ body: 'comet', finish: 'gloss', boost: 'team', explosion: 'classic' }, rd(KEY.garage, {}) || {});
  // a pick that is no longer unlocked (a cleared profile) falls back to the default
  Object.keys(GARAGE).forEach((k) => { const it = GARAGE[k].find((x) => x.v === g[k]); if (!it || !unlocked(it, p)) g[k] = GARAGE[k][0].v; });
  return g;
}
export function saveGarage(g) { wr(KEY.garage, g); }
// Everything a new level, rank or trophy just unlocked, for the results screen.
export function newUnlocks(before, after) {
  const out = [];
  Object.keys(GARAGE).forEach((k) => GARAGE[k].forEach((it) => { if (!unlocked(it, before) && unlocked(it, after)) out.push(it.label + ' (' + { body: 'car', finish: 'paint finish', boost: 'boost trail', explosion: 'goal explosion' }[k] + ')'); }));
  return out;
}

/* ------------------------------------------------------------ the season */
export function loadSeason() { const s = rd(KEY.season, null); return s && s.v === 1 && Array.isArray(s.rounds) && s.table ? s : null; }
export function saveSeason(s) { wr(KEY.season, s); }
export function clearSeason() { wr(KEY.season, null); }
export function newSeason(club, o) {
  const n = CLUBS.length, arr = CLUBS.map((_, i) => i), rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const ms = [];
    for (let i = 0; i < n / 2; i++) { let h = arr[i], a = arr[n - 1 - i]; if ((r + i) % 2) { const t = h; h = a; a = t; } ms.push([h, a]); }
    rounds.push(ms);
    arr.splice(1, 0, arr.pop());
  }
  const table = {}; for (let i = 0; i < n; i++) table[i] = { p: 0, w: 0, otw: 0, otl: 0, l: 0, gf: 0, ga: 0 };
  return { v: 1, club, size: o.size, diff: o.diff, len: o.len, round: 0, rounds, table, results: [], stage: 'regular', bracket: null, done: false, finish: null };
}
export const ptsOf = (t) => t.w * 3 + t.otw * 2 + t.otl;
export function standings(s) {
  return Object.keys(s.table).map(Number).sort((x, y) => { const a = s.table[x], b = s.table[y]; return ptsOf(b) - ptsOf(a) || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || x - y; });
}
function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L && k < 9); return k - 1; }
// Another fixture played off screen: goals from the clubs' ratings, a draw goes to overtime.
export function simScore(h, a) {
  const rh = CLUBS[h].rating, ra = CLUBS[a].rating;
  let x = poisson(clamp(2.4 + (rh - ra) * 3, 0.8, 4.2)), y = poisson(clamp(2.2 + (ra - rh) * 3, 0.8, 4.2)), ot = false;
  if (x === y) { ot = true; if (rnd() < 0.5 + (rh - ra)) x++; else y++; }
  return [x, y, ot];
}
function tableAdd(t, gf, ga, ot) { t.p++; t.gf += gf; t.ga += ga; if (gf > ga) { if (ot) t.otw++; else t.w++; } else { if (ot) t.otl++; else t.l++; } }
// What the player's next match is: the regular-season fixture or the playoff tie.
export function nextFixture(s) {
  if (s.done) return null;
  if (s.stage === 'regular') { const r = s.rounds[s.round]; const m = r && r.find((x) => x[0] === s.club || x[1] === s.club); return m ? { home: m[0], away: m[1], label: 'Matchday ' + (s.round + 1) + ' of ' + s.rounds.length, playoff: false } : null; }
  const B = s.bracket;
  if (s.stage === 'semi') { const m = B.semis.find((x) => x[0] === s.club || x[1] === s.club); return m ? { home: m[0], away: m[1], label: 'Playoff semi-final', playoff: true } : null; }
  if (s.stage === 'final') return B.final && (B.final[0] === s.club || B.final[1] === s.club) ? { home: B.final[0], away: B.final[1], label: 'Grand final', playoff: true } : null;
  return null;
}
// Record the player's result, play the rest of the round off screen, and move the season on.
// Returns a summary for the results screen.
export function seasonResult(s, my, their, ot) {
  const fx = nextFixture(s); if (!fx) return null;
  const home = fx.home === s.club, gh = home ? my : their, ga = home ? their : my;
  const out = { label: fx.label, won: my > their, line: CLUBS[fx.home].abbr + ' ' + gh + '-' + ga + ' ' + CLUBS[fx.away].abbr + (ot ? ' (OT)' : ''), others: [], stageBefore: s.stage, champion: false, eliminated: false, missed: false };
  if (s.stage === 'regular') {
    tableAdd(s.table[fx.home], gh, ga, ot); tableAdd(s.table[fx.away], ga, gh, ot);
    for (const m of s.rounds[s.round]) {
      if (m[0] === s.club || m[1] === s.club) continue;
      const r = simScore(m[0], m[1]); tableAdd(s.table[m[0]], r[0], r[1], r[2]); tableAdd(s.table[m[1]], r[1], r[0], r[2]);
      out.others.push(CLUBS[m[0]].abbr + ' ' + r[0] + '-' + r[1] + ' ' + CLUBS[m[1]].abbr + (r[2] ? ' OT' : ''));
    }
    s.results.push({ round: s.round, line: out.line, won: out.won });
    s.round++;
    if (s.round >= s.rounds.length) {
      const st = standings(s);
      s.bracket = { semis: [[st[0], st[3]], [st[1], st[2]]], final: null, champ: null, lines: [] };
      if (st.indexOf(s.club) > 3) {
        out.missed = true; playOffRest(s);
      } else s.stage = 'semi';
    }
  } else if (s.stage === 'semi') {
    const B = s.bracket, winners = [];
    B.semis.forEach((m) => {
      if (m[0] === s.club || m[1] === s.club) { winners.push(out.won ? s.club : (m[0] === s.club ? m[1] : m[0])); B.lines.push('Semi: ' + out.line); }
      else { const r = simScore(m[0], m[1]); winners.push(r[0] > r[1] ? m[0] : m[1]); B.lines.push('Semi: ' + CLUBS[m[0]].abbr + ' ' + r[0] + '-' + r[1] + ' ' + CLUBS[m[1]].abbr + (r[2] ? ' OT' : '')); out.others.push(B.lines[B.lines.length - 1]); }
    });
    B.final = winners;
    if (!out.won) { out.eliminated = true; playOffRest(s); } else s.stage = 'final';
  } else if (s.stage === 'final') {
    const B = s.bracket; B.lines.push('Final: ' + out.line);
    B.champ = out.won ? s.club : (B.final[0] === s.club ? B.final[1] : B.final[0]);
    out.champion = out.won; s.stage = 'done'; s.done = true;
  }
  s.finish = s.done ? (out.champion ? 'Champions' : out.eliminated ? 'Out in the ' + (out.stageBefore === 'final' ? 'final' : 'semi-final') : out.missed ? 'Missed the playoffs' : s.finish) : s.finish;
  if (s.done && !out.champion && out.stageBefore === 'final') s.finish = 'Runners-up';
  return out;
}
function playOffRest(s) {
  const B = s.bracket;
  if (!B.final) { B.final = B.semis.map((m) => { const r = simScore(m[0], m[1]); B.lines.push('Semi: ' + CLUBS[m[0]].abbr + ' ' + r[0] + '-' + r[1] + ' ' + CLUBS[m[1]].abbr + (r[2] ? ' OT' : '')); return r[0] > r[1] ? m[0] : m[1]; }); }
  const r = simScore(B.final[0], B.final[1]); B.lines.push('Final: ' + CLUBS[B.final[0]].abbr + ' ' + r[0] + '-' + r[1] + ' ' + CLUBS[B.final[1]].abbr + (r[2] ? ' OT' : ''));
  B.champ = r[0] > r[1] ? B.final[0] : B.final[1];
  s.stage = 'done'; s.done = true;
}
export function tableHtml(s) {
  const st = standings(s);
  const rows = st.map((c, i) => {
    const t = s.table[c], me = c === s.club, cut = i === 3 ? ' style="border-bottom:2px solid var(--primary)"' : '';
    return '<tr class="' + (me ? 'me' : '') + '"' + cut + '><td>' + (i + 1) + '</td><td>' + esc(CLUBS[c].short) + '</td><td>' + t.p + '</td><td>' + t.w + '</td><td>' + t.otw + '</td><td>' + t.otl + '</td><td>' + t.l + '</td><td>' + (t.gf - t.ga > 0 ? '+' : '') + (t.gf - t.ga) + '</td><td><b>' + ptsOf(t) + '</b></td></tr>';
  }).join('');
  return '<table class="ng-res ng-tab"><tr><th>#</th><th>Club</th><th>P</th><th>W</th><th>OTW</th><th>OTL</th><th>L</th><th>GD</th><th>Pts</th></tr>' + rows + '</table><p class="ng-note">Top four reach the playoffs. Win 3, overtime win 2, overtime loss 1.</p>';
}
export function bracketHtml(s) {
  const B = s.bracket; if (!B) return '';
  const nm = (c) => (c == null ? '?' : esc(CLUBS[c].short));
  let h = '<p class="ng-note"><b>Playoffs.</b> ' + B.semis.map((m) => nm(m[0]) + ' v ' + nm(m[1])).join(', ') + (B.final ? '. Final: ' + nm(B.final[0]) + ' v ' + nm(B.final[1]) : '') + (B.champ != null ? '. Champions: <b>' + nm(B.champ) + '</b>' : '') + '.</p>';
  if (B.lines.length) h += '<p class="ng-note">' + B.lines.map(esc).join('<br>') + '</p>';
  return h;
}

/* ------------------------------------------------------------ training packs */
// Coordinates in metres; your side attacks +z. car: [x, z, yaw toward +z = 0]; ball: [x, y, z, vx, vy, vz].
// A save drill names where the shot is aimed (aim) and how long it takes (T); the core works out the velocity.
export const PACKS = {
  basics: {
    name: 'Basics', blurb: 'Learn the moves one at a time: touch, jump, double jump, boost, flip, score.', kind: 'basics', time: 45,
    drills: [
      { car: [0, -28, 0], ball: [0, 2, 0, 0, 0, 0], goal: 'touch', hint: 'Drive into the ball' },
      { car: [0, -20, 0], ball: [0, 2, 10, 0, 0, 0], goal: 'jump', hint: 'Press jump' },
      { car: [0, -20, 0], ball: [0, 2, 10, 0, 0, 0], goal: 'double', hint: 'Jump, then jump again in the air' },
      { car: [0, -40, 0], ball: [0, 2, 30, 0, 0, 0], goal: 'boost', hint: 'Hold boost until you go supersonic' },
      { car: [0, -16, 0], ball: [0, 2, 0, 0, 0, 0], goal: 'flip', hint: 'Jump, then jump again with a direction to flip into the ball' },
      { car: [0, 10, 0], ball: [0, 2, 28, 0, 0, 0], goal: 'score', hint: 'Score a goal' }
    ]
  },
  shooting: {
    name: 'Shooting', blurb: 'Eight shots: rolling, bouncing, crossing and long range. Score each before the timer runs out.', kind: 'score', time: 9,
    drills: [
      { car: [0, 0, 0], ball: [0, 2, 30, 0, 0, 0], hint: 'Drive straight through it' },
      { car: [-24, 10, 0.6], ball: [-14, 2, 34, 0, 0, 0], hint: 'Hit it on its far side to aim' },
      { car: [0, 8, 0], ball: [-26, 2, 36, 9, 0, 0], hint: 'Meet the cross' },
      { car: [0, 4, 0], ball: [6, 10, 30, 0, 2, 2], hint: 'Time the bounce' },
      { car: [-6, -4, 0], ball: [-30, 2, 20, 12, 3, 8], hint: 'Off the side wall' },
      { car: [0, -14, 0], ball: [0, 2, 6, 0, 0, 0], hint: 'Long range: boost and flip into it' },
      { car: [0, 14, 0], ball: [10, 2, 44, -2, 0, -10], hint: 'It is rolling toward you' },
      { car: [0, -2, 0], ball: [0, 2, 20, 0, 13, 6], hint: 'Hit it as it drops' }
    ]
  },
  saving: {
    name: 'Saving', blurb: 'Six shots at your own goal. Touch each one away, or block it.', kind: 'save', time: 6,
    drills: [
      { car: [0, -50, 0], ball: [0, 2, -20], aim: [2, 2, -59], T: 1.8, hint: 'Straight at you' },
      { car: [0, -50, 0], ball: [16, 2, -22], aim: [-9, 3, -59], T: 1.9, hint: 'Across to the far post' },
      { car: [0, -50, 0], ball: [-10, 6, -18], aim: [6, 5, -59], T: 2.0, hint: 'High: jump to block' },
      { car: [-4, -48, 0], ball: [0, 12, -26], aim: [-5, 1.5, -59], T: 2.1, hint: 'A dropping shot' },
      { car: [6, -50, 0], ball: [-30, 6, -32], aim: [8, 4, -59], T: 1.8, hint: 'Off the wall' },
      { car: [0, -50, 0], ball: [8, 2, -12], aim: [-10, 2, -59], T: 1.6, hint: 'Low and fast' }
    ]
  },
  aerial: {
    name: 'Aerials', blurb: 'Six balls in the air. Jump, tilt back, boost and fly into them to score.', kind: 'score', time: 10, boost: 100,
    drills: [
      { car: [0, 8, 0], ball: [0, 12, 32, 0, 5, 0], hint: 'Jump, tilt back, boost' },
      { car: [-4, 10, 0.3], ball: [-12, 14, 36, 2, 4, 0], hint: 'Turn in the air toward it' },
      { car: [4, 14, 0], ball: [10, 16, 40, 0, 2, 0], hint: 'A high one' },
      { car: [0, 16, 0], ball: [0, 18, 44, 0, 3, -2], hint: 'Meet it in front of the goal' },
      { car: [-10, 4, 0.4], ball: [-16, 10, 30, 6, 9, 2], hint: 'It is rising across you' },
      { car: [0, 22, 0], ball: [0, 20, 48, 0, 2, -3], hint: 'Fly high and push it in' }
    ]
  }
};
export const PACK_KEYS = Object.keys(PACKS);
export function trainBest(k) { const b = rd(KEY.train, {}) || {}; return b[k] || 0; }
export function trainSave(k, n) { const b = rd(KEY.train, {}) || {}; if (n > (b[k] || 0)) { b[k] = n; wr(KEY.train, b); return true; } return false; }

/* ------------------------------------------------------------ commentary: two original casters */
export const CASTERS = ['Ira', 'Dev'];
export const LINES = {
  kickoff: ['And we are under way in {arena}.', 'Kickoff! Both sides racing for the ball.', 'Here we go, {home} against {away}.', 'Engines up, boost full, the ball drops.'],
  kickoffAgain: ['Reset and go again.', 'Back to the middle, kickoff number {n}.', 'Fresh kickoff, the crowd is on its feet.'],
  goal: ['Buried by {who}! {kmh} km per hour.', 'In it goes! A finish from {who}.', 'What a strike from {who}!', 'Goal for {team}, and this place erupts!'],
  goalAir: ['Up in the air, and flown home by {who}!', 'An aerial goal from {who}, sensational!'],
  goalFar: ['From distance! A long-range rocket from {who}.', 'All the way from the other half, {who} scores!'],
  goalOwn: ['Oh no, that has gone in off a defender.', 'An own goal, a cruel bounce.'],
  goalHoop: ['Dropped through the hoop by {who}!', 'Swish! A dunk from {who}.'],
  goalPuck: ['Slapped in by {who}!', 'Across the ice and in, a goal for {who}!'],
  goalOT: ['Golden goal from {who}! Overtime is over.', 'It ends in overtime, the winner from {who}!'],
  save: ['Huge save from {who}!', 'A wheel to it from {who}!', 'Kept out, brilliant reading from {who}.', 'Denied! Big stop from {who}.'],
  demo: ['A supersonic bump from {who} takes out {vic}.', 'Flattened! Back to the garage for {vic}.', 'Knockout by {who}!'],
  post: ['Off the post!', 'Rattles the frame and stays out.', 'Inches away from a goal.'],
  shot: ['A shot from {who}.', 'Tested! A strike from {who}.', 'Here comes a shot from {who}.'],
  late: ['Thirty seconds to go.', 'The clock is the enemy now.'],
  final10: ['Ten seconds left!', 'Into the final seconds!'],
  ot: ['We are going to overtime! Next goal wins.', 'Level at full time, sudden death overtime!'],
  win: ['That is full time, and {team} take it.', '{team} hold on for the win.'],
  lose: ['Full time. {team} were just too good today.', 'It ends there, {team} with the result.'],
  comeback: ['{team} are fighting back!', 'Game on! {team} close the gap.'],
  squeeze: ['A minute of overtime, and the rims start to grow!', 'The hoops are widening, somebody end this!']
};
export const CHAT = {
  goalMate: ['Lovely finish!', 'Get in!', 'What a hit!', 'Nice one!'],
  goalSelf: ['All skill.', 'Did you see that?', 'Easy.'],
  conceded: ['My bad.', 'Sorry, that one was mine.', 'Close one.', 'Reset, we got this.'],
  save: ['Huge save!', 'Kept it out!', 'Wall of steel.'],
  attack: ['Mine!', 'Going for it.', 'Shoot it!', 'Crossing it in!'],
  defend: ['I am back.', 'Rotating back.', 'Covering goal.'],
  boost: ['Low on boost.', 'Running on empty.'],
  demoed: ['Ouch.', 'Who was that?'],
  win: ['Good game!', 'Well played all.'],
  lose: ['Good game, next time.', 'So close.']
};
export function pickLine(list, vars) {
  let s = list[Math.floor(rnd() * list.length)];
  if (vars) Object.keys(vars).forEach((k) => { s = s.split('{' + k + '}').join(vars[k]); });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ------------------------------------------------------------ the rules and controls cards */
export const RULES_HTML =
  '<p><b>The match.</b> Two teams of rocket cars push one giant ball. Get the whole ball over the line, between the posts and under the bar, to score. Your side wears orange and attacks the blue goal. After every goal there is a replay and a fresh kickoff from the centre.</p>' +
  '<p><b>Time and overtime.</b> When the clock hits zero the match ends as soon as the ball next touches the ground. Level at that point means sudden death overtime: the next goal wins.</p>' +
  '<p><b>Boost.</b> Six big pads round the edges refill you to 100 and come back after ten seconds. Small pads add 12 and come back after four. Boost runs out in three seconds of holding.</p>' +
  '<p><b>Moves.</b> Jump once, then jump again in the air within about a second for a double jump. Jump again while pushing a direction to flip, which kicks the car (and the ball) hard that way. Boost in the air to fly: that is an aerial. Cars stick to the curved walls and drive up them.</p>' +
  '<p><b>Bumps and knockouts.</b> Drive into a rival at supersonic speed, nose first, to knock them out for three seconds; they respawn by their own goal. Slower contact is just a bump. Knockouts are off for the first seconds of a kickoff.</p>' +
  '<p><b>Points.</b> Goal 100, assist 50, save 50, shot on goal 20, knockout 25, aerial hit 10, and a win bonus of 100. The best player on the winning side is the match MVP.</p>' +
  '<p><b>Hoops.</b> The goals close and a hoop hangs over each end. Drop the ball down through the rival hoop to score. Hits lift the ball more in this arena, and after a minute of overtime the rims slowly widen until somebody scores.</p>' +
  '<p><b>Snow Puck.</b> The ball becomes a heavy puck on an ice rink: it slides low and fast, and your tyres slide too. Same goals, same rules.</p>' +
  '<p><b>Season.</b> Pick a club in the ' + LEAGUE + ' and play seven matchdays, one against each other club. Win 3 points, overtime win 2, overtime loss 1. The top four meet in a semi-final and a grand final. Your season is saved on this device.</p>' +
  '<p><b>Rank and unlocks.</b> Every match moves your rank points: wins add more on harder difficulties, losses take a little away. XP from your match points raises your level, and levels, ranks and trophies unlock new cars, paint, boost trails and goal explosions in the Garage.</p>';
export const CONTROLS_HTML =
  '<table class="ng-res ng-ctl"><tr><th>Action</th><th>Keyboard and mouse</th><th>Touch</th><th>Controller</th></tr>' +
  [['Drive', 'W / S, arrows', 'Drag where to go', 'RT gas, LT reverse'],
   ['Steer, air turn', 'A / D', 'Drag sideways', 'Left stick'],
   ['Air pitch', 'W / S in the air', 'Drag up or down in the air', 'Left stick up or down'],
   ['Jump, double jump', 'Space, left click', 'Tap', 'A'],
   ['Flip', 'Jump again with a direction', 'Tap again after a drag', 'A again with the stick'],
   ['Boost', 'Shift, hold right click', 'Swipe up or hold Boost', 'B'],
   ['Air roll', 'Q / E', 'Assisted for you', 'LB / RB'],
   ['Powerslide', 'X', 'Hard turn slides for you', 'X'],
   ['Ball cam', 'C', 'Tap the camera badge', 'Y'],
   ['Skip replay', 'Space or Enter', 'Tap', 'A'],
   ['Pause', 'Esc or P', 'Pause button', 'Start']].map((r) => '<tr><td>' + r.join('</td><td>') + '</td></tr>').join('') + '</table>' +
  '<p class="ng-note">On touch, help is on: the car lands on its wheels and a boosting car in the air turns toward the ball.</p>';
