// The games' online layer (net/ on the Cloudflare Worker), tested end to end
// on a local Worker (wrangler dev, which runs the real Durable Objects in
// Miniflare). Two kinds of client: the raw room protocol over WebSocket, and
// the shipped browser client games/shared/net.js run in a sandbox per player.
//
//   npm run build && npm run test:net
//   NET_BASE=http://127.0.0.1:8787 node scripts/net-test.mjs   (a server you started)
//   WRANGLER=/path/to/wrangler node scripts/net-test.mjs        (else npx wrangler@4)
//
// The local server runs with short room timers (--var NET_GRACE_MS:1500 and
// NET_EMPTY_MS:2500) and a short minimum run (NET_MIN_RUN_MS:1200) so the
// whole file takes about a minute; production keeps the values in net/config.js.
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url).pathname;
const PORT = +(process.env.NET_PORT || 8788);
let BASE = (process.env.NET_BASE || '').replace(/\/$/, '');
const ORIGIN = () => BASE;
let pass = 0, fail = 0;
const check = (label, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = (n) => Array.from({ length: n || 22 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

let server = null;
async function startServer() {
  if (BASE) return;
  if (!existsSync(join(ROOT, 'www'))) { console.error('www/ is missing: run npm run build first'); process.exit(1); }
  BASE = 'http://127.0.0.1:' + PORT;
  const state = mkdtempSync(join(tmpdir(), 'net-test-'));
  const bin = process.env.WRANGLER || 'npx';
  const args = (process.env.WRANGLER ? [] : ['--yes', 'wrangler@4']).concat(['dev', '--port', String(PORT), '--ip', '127.0.0.1',
    '--persist-to', state, '--var', 'NET_GRACE_MS:1500', '--var', 'NET_EMPTY_MS:2500', '--var', 'NET_MIN_RUN_MS:1200']);
  server = spawn(bin, args, { cwd: ROOT, env: Object.assign({}, process.env, { WRANGLER_SEND_METRICS: 'false' }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(BASE + '/net/health'); if (r.ok) return; } catch (e) { /* not yet */ }
    await sleep(500);
  }
  console.error(log.slice(-3000)); throw new Error('wrangler dev did not start');
}
function stopServer() { if (server) { try { server.kill('SIGTERM'); } catch (e) { /* gone */ } } }

const post = async (path, body, origin) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: { Origin: origin === undefined ? ORIGIN() : origin, 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => null) };
};
const get = async (path) => { const r = await fetch(BASE + path, { headers: { Origin: ORIGIN() } }); return { status: r.status, j: await r.json().catch(() => null) }; };

// A raw protocol client: records every message, can wait for one.
function rawClient(game, room, id, nick, origin) {
  const url = BASE.replace(/^http/, 'ws') + `/net/ws/${game}/${room}?id=${id}&nick=${encodeURIComponent(nick || '')}`;
  const ws = new WebSocket(url, { headers: { Origin: origin || ORIGIN() } });
  const c = { ws, msgs: [], closed: null, waiters: [] };
  ws.onmessage = (e) => {
    if (e.data === 'pong') { c.msgs.push({ t: 'pong' }); } else { try { c.msgs.push(JSON.parse(e.data)); } catch (err) { /* skip */ } }
    c.waiters = c.waiters.filter((w) => { const m = c.msgs.find(w.pred); if (m) { w.res(m); return false; } return true; });
  };
  ws.onclose = (e) => { c.closed = { code: e.code, reason: e.reason }; c.waiters.forEach((w) => w.res(null)); c.waiters = []; };
  ws.onerror = () => { if (!c.closed) { c.closed = { code: 0, reason: 'error' }; c.waiters.forEach((w) => w.res(null)); c.waiters = []; } };
  c.wait = (pred, ms) => {
    const m = c.msgs.find(pred); if (m) return Promise.resolve(m);
    return new Promise((res) => { const w = { pred, res }; c.waiters.push(w); setTimeout(() => { c.waiters = c.waiters.filter((x) => x !== w); res(null); }, ms || 4000); });
  };
  c.send = (m) => ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  c.opened = new Promise((res) => { ws.addEventListener('open', () => res(true)); ws.addEventListener('close', () => res(false)); ws.addEventListener('error', () => res(false)); });
  return c;
}

// The shipped browser client, one sandbox (own storage, own id) per player.
const NET_SRC = readFileSync(join(ROOT, 'games/shared/net.js'), 'utf8');
function browserClient(nick) {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const origin = ORIGIN();
  class OriginWS extends WebSocket { constructor(u, p) { super(u, { headers: { Origin: origin } }); } }
  const pageFetch = (u, o) => { o = Object.assign({}, o || {}); o.headers = Object.assign({ Origin: origin }, o.headers || {}); return fetch(u, o); };
  const win = { localStorage: mem(), sessionStorage: mem(), location: new URL(origin + '/games/kart-mela'), crypto: globalThis.crypto,
    fetch: pageFetch, WebSocket: OriginWS, AbortController, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
    btoa, console, Event: class { constructor(t) { this.type = t; } }, dispatchEvent() {}, ARCADE_NET_BASE: origin };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(NET_SRC, ctx);
  win.ArcadeNet.setNickname(nick);
  return win.ArcadeNet;
}

async function main() {
  await startServer();
  console.log('Online layer against ' + BASE);

  // Basics and the origin rule.
  const h = await get('/net/health');
  check('health answers', h.status === 200 && h.j && h.j.ok);
  const foreign = await post('/net/match/kart-mela', { mode: 'race', max: 4 }, 'https://example.org');
  check('a foreign page cannot open a room', foreign.status === 403, String(foreign.status));
  const noOrigin = await post('/net/lb/rangoli-drop/run', { id: rid(), mode: 'marathon' }, '');
  check('a write with no origin is refused', noOrigin.status === 403, String(noOrigin.status));
  const unknown = await post('/net/lb/not-a-game/run', { id: rid(), mode: 'x' });
  check('an unknown game is refused', unknown.status === 404, String(unknown.status));
  const noRooms = await post('/net/match/rangoli-drop', { mode: 'marathon', max: 4 });
  check('a game without live play opens no room', noRooms.status === 404, String(noRooms.status));

  // Two players quick-match into one room and talk.
  const mode = 'race-' + rid(5);
  const m1 = await post('/net/match/kart-mela', { mode, max: 4 });
  const idA = rid(), idB = rid(), idC = rid();
  const A = rawClient('kart-mela', m1.j.room, idA, 'Asha');
  const wa = await A.wait((m) => m.t === 'welcome');
  const m2 = await post('/net/match/kart-mela', { mode, max: 4 });
  check('quick-match puts the second player in the same room', m1.j.room && m1.j.room === m2.j.room, m1.j.room + ' / ' + m2.j.room);
  // Twenty-one full rooms (seats held by quick-match) must not hide a part-filled one.
  const fm = 'full-' + rid(5);
  for (let i = 0; i < 42; i++) await post('/net/match/kart-mela', { mode: fm, max: 2 });
  const part = await post('/net/match/kart-mela', { mode: fm, max: 2 });
  const join = await post('/net/match/kart-mela', { mode: fm, max: 2 });
  check('quick-match still finds a free seat behind 21 full rooms', part.j && join.j && part.j.fresh && join.j.room === part.j.room, part.j && join.j && (part.j.room + ' / ' + join.j.room));
  const B = rawClient('kart-mela', m2.j.room, idB, 'Bilal');
  const wb = await B.wait((m) => m.t === 'welcome');
  check('both get a welcome with seats 0 and 1', wa && wb && wa.you.seat === 0 && wb.you.seat === 1, wa && wb && wa.you.uid + ',' + wb.you.uid);
  check('the first player is host for both', wa && wb && wa.host === wa.you.uid && wb.host === wa.you.uid);
  check('the welcome never carries another player\'s secret id', wb && !JSON.stringify(wb).includes(idA));
  const jn = await A.wait((m) => m.t === 'join');
  check('the host hears the join', jn && jn.p.uid === wb.you.uid && jn.p.nick === 'Bilal');

  A.send({ t: 's', d: { x: 1.5, y: 2, h: 0.3 }, b: { bot2: { x: 9 } } });
  B.send({ t: 's', d: { x: -4, y: 7 } });
  const snapB = await B.wait((m) => m.t === 'snap' && m.s && m.s[wa.you.uid]);
  check('a state relays to the other player', snapB && snapB.s[wa.you.uid].x === 1.5, snapB && JSON.stringify(snapB.s));
  check('the host\'s bot states relay too', snapB && snapB.b && snapB.b.bot2 && snapB.b.bot2.x === 9);
  const snapA = await A.wait((m) => m.t === 'snap' && m.s && m.s[wb.you.uid]);
  check('and the other way', snapA && snapA.s[wb.you.uid].y === 7);
  B.send({ t: 's', d: { x: 0 }, b: { bot3: { hacked: true } } });
  await sleep(200);
  check('a non-host cannot send bot states', !A.msgs.some((m) => m.t === 'snap' && m.b && m.b.bot3));
  B.send({ t: 'e', d: { k: 'boost' } });
  const evA = await A.wait((m) => m.t === 'snap' && m.e && m.e.some((e) => e[1] && e[1].k === 'boost'));
  check('an event relays with its sender', evA && evA.e.find((e) => e[1].k === 'boost')[0] === wb.you.uid);
  A.send({ t: 'e', d: { k: 'whisper' }, to: wb.you.uid });
  const evB = await B.wait((m) => m.t === 'snap' && m.e && m.e.some((e) => e[1] && e[1].k === 'whisper'));
  check('a direct event reaches its target', !!evB);
  // Ticks: a burst of 30 states in 100 ms becomes a handful of snapshots.
  const before = A.msgs.filter((m) => m.t === 'snap').length;
  for (let i = 0; i < 30; i++) { B.send({ t: 's', d: { x: i } }); await sleep(3); }
  await sleep(400);
  const snaps = A.msgs.filter((m) => m.t === 'snap').slice(before);
  check('a burst is relayed at the room tick, latest wins', snaps.length >= 1 && snaps.length <= 8 && snaps[snaps.length - 1].s[wb.you.uid].x === 29, snaps.length + ' snapshots');
  B.send('ping');
  check('ping is answered pong', !!(await B.wait((m) => m.t === 'pong', 2000)));

  // Score and clock belong to the host.
  B.send({ t: 'sc', add: { [wb.you.uid]: 100 } });
  A.send({ t: 'sc', add: { [wa.you.uid]: 3 } });
  const sc = await B.wait((m) => m.t === 'snap' && m.sc);
  check('only the host changes the score', sc && sc.sc[wa.you.uid] === 3 && !(wb.you.uid in sc.sc), sc && JSON.stringify(sc.sc));
  A.send({ t: 'start', dur: 1200 });
  const st = await B.wait((m) => m.t === 'start');
  check('the host starts a timed match on one clock', st && st.clock.phase === 'live' && st.clock.end - st.clock.start === 1200);
  A.send({ t: 'sc', add: { red: 2 } });
  const end = await B.wait((m) => m.t === 'end', 5000);
  check('the server ends the match on time, with the final score', end && end.scores.red === 2, end && JSON.stringify(end.scores));

  // Reconnect: B drops and comes back to the same seat.
  B.ws.close(3001, 'drop');
  const away = await A.wait((m) => m.t === 'away' && m.uid === wb.you.uid);
  check('a drop shows as away, not gone', !!away);
  const B2 = rawClient('kart-mela', m2.j.room, idB, 'Bilal');
  const wb2 = await B2.wait((m) => m.t === 'welcome');
  check('a reconnect gets the same seat back', wb2 && wb2.back === true && wb2.you.uid === wb.you.uid && wb2.you.seat === 1);
  check('the others hear it is back', !!(await A.wait((m) => m.t === 'back' && m.uid === wb.you.uid)));

  // Host moves when the host leaves for good.
  A.ws.close(1000, 'bye');
  const hostB = await B2.wait((m) => m.t === 'host' && m.uid === wb.you.uid, 4000);
  check('the host role moves to a player still here', !!hostB);
  const leftA = await B2.wait((m) => m.t === 'leave' && m.uid === wa.you.uid, 5000);
  check('after the grace a dropped player leaves for good', !!leftA);

  // Full rooms, private codes.
  const p1 = await post('/net/room/nitro-goal', { mode: '1v1', max: 2 });
  check('a private room has a code', p1.j && /^[A-HJ-NP-Z2-9]{5}$/.test(p1.j.code), p1.j && p1.j.code);
  const byCode = await get('/net/code/nitro-goal/' + p1.j.code);
  check('the code finds the room', byCode.j && byCode.j.room === p1.j.room);
  const pubOther = await post('/net/match/nitro-goal', { mode: '1v1', max: 2 });
  check('quick-match never drops anyone into a private room', pubOther.j && pubOther.j.room !== p1.j.room);
  const C1 = rawClient('nitro-goal', p1.j.room, idA, 'One'); await C1.wait((m) => m.t === 'welcome');
  const C2 = rawClient('nitro-goal', p1.j.room, idB, 'Two'); await C2.wait((m) => m.t === 'welcome');
  const C3 = rawClient('nitro-goal', p1.j.room, idC, 'Three');
  const full = await C3.wait((m) => m.t === 'err');
  await sleep(200);
  check('a third player is turned away from a 2-seat room', full && full.code === 'full' && C3.closed && C3.closed.code === 4001, full && full.code);
  const cnt = await get('/net/count/nitro-goal');
  check('the lobby counts players online', cnt.j && cnt.j.online >= 2, cnt.j && JSON.stringify(cnt.j));
  const badOrigin = rawClient('nitro-goal', p1.j.room, rid(), 'X', 'https://example.org');
  check('a socket from a foreign page is refused', !(await badOrigin.opened));

  // Rooms close once empty.
  C1.ws.close(1000); C2.ws.close(1000); B2.ws.close(1000);
  await sleep(1500 + 2500 + 1500);
  const ghost = rawClient('nitro-goal', p1.j.room, idA, 'One');
  const gone = await ghost.wait((m) => m.t === 'err');
  check('an empty room closes itself', gone && gone.code === 'no_room', gone && gone.code);
  const codeGone = await get('/net/code/nitro-goal/' + p1.j.code);
  check('and its code stops working', codeGone.j && codeGone.j.ok === false);
  const ghost2 = rawClient('kart-mela', m1.j.room, idC, 'Late');
  const gone2 = await ghost2.wait((m) => m.t === 'err');
  check('the quick-match room closed too', gone2 && gone2.code === 'no_room');

  // The shipped browser client: quick-match, bots, interpolation, codes.
  const nA = browserClient('Kiran'), nB = browserClient('Meera');
  const qm = 'cup-' + rid(4);
  const rA = await nA.quickMatch('turf-kings', qm, { maxPlayers: 4, sendHz: 20 });
  check('net.js quickMatch returns a room', !!rA && rA.isHost === true, rA && rA.id);
  const s0 = rA.slots();
  check('one human and three bots fill the seats at once', s0.length === 4 && s0.filter((s) => s.kind === 'bot').length === 3 && rA.myBots().length === 3, rA.myBots().join(','));
  let slotsSeen = null; rA.on('slots', (s) => { slotsSeen = s; });
  const rB = await nB.quickMatch('turf-kings', qm, { maxPlayers: 4, sendHz: 20 });
  check('the second browser joins the same room', rB && rB.id === rA.id && rB.isHost === false);
  await sleep(300);
  check('a joining human replaces a bot', slotsSeen && slotsSeen.filter((s) => s.kind === 'human').length === 2 && rA.myBots().length === 2 && rB.myBots().length === 0);
  let got = 0; rB.on('state', () => { got++; });
  let botGot = 0; rB.on('bot', () => { botGot++; });
  for (let i = 0; i <= 10; i++) { rA.send({ x: i * 10, h: 3.1 }); rA.sendBots({ bot2: { x: -i } }); await sleep(50); }
  await sleep(400);
  check('net.js send arrives at the tick', got >= 3, got + ' states');
  check('host bot states arrive as bot updates', botGot >= 3, botGot + ' bot updates');
  const smp = rB.sample(rA.me.uid, ['h']);
  check('sample() interpolates a remote state', smp && typeof smp.x === 'number' && smp.x > 0 && smp.x <= 100, JSON.stringify(smp));
  await sleep(2300);
  check('net.js measures ping', rB.ping > 0 && rB.ping < 1000, rB.ping + ' ms');
  rA.leave(); rB.leave();
  const pr = await nA.createRoom('turf-kings', 'friendly', { maxPlayers: 2 });
  const jr = pr && await nB.joinCode('turf-kings', pr.code.toLowerCase());
  check('createRoom and joinCode meet in one room', pr && jr && pr.id === jr.id, pr && pr.code);
  if (pr) pr.leave(); if (jr) jr.leave();

  // Leaderboards.
  const L = '/net/lb/rangoli-drop/';
  const me = rid(), you = rid();
  const t1 = await post(L + 'run', { id: me, mode: 'marathon' });
  check('a run token is issued', t1.j && t1.j.ok && typeof t1.j.token === 'string');
  // Made-up mode names never get a board, so nobody can crowd out the game's real modes.
  const bogus = [];
  for (let i = 0; i < 18; i++) bogus.push(await post(L + 'run', { id: rid(), mode: 'junk' + i }));
  check('a mode the game does not offer gets no run token', bogus.every((r) => r.j && r.j.error === 'unknown_mode'), bogus.map((r) => r.j && r.j.error).slice(0, 3).join(','));
  const bogusTop = await post(L + 'top', { mode: 'junk0', period: 'all', n: 5 });
  check('nor a board to read', bogusTop.j && bogusTop.j.error === 'unknown_mode', bogusTop.j && bogusTop.j.error);
  const sprint = await post(L + 'run', { id: rid(), mode: 'sprint' });
  check('the game\'s other real modes still get tokens after that', sprint.j && sprint.j.ok, sprint.j && sprint.j.error);
  // Equal scores share a rank in the list and in each player's own rank.
  const tieIds = [rid(), rid()];
  for (const tid of tieIds) { const tk = await post(L + 'run', { id: tid, mode: 'blitz' }); await post(L + 'submit', { id: tid, mode: 'blitz', token: tk.j.token, score: 300, nick: 'Tie' }); }
  const tieTop = await post(L + 'top', { id: tieIds[1], mode: 'blitz', period: 'all', n: 5 });
  const tr = tieTop.j && tieTop.j.top.filter((r) => r.score === 300).map((r) => r.rank);
  check('tied scores share a rank, and it matches the player\'s own rank', tr && tr.length === 2 && tr[0] === tr[1] && tieTop.j.me && tieTop.j.me.rank === tr[0], JSON.stringify(tr) + ' me ' + (tieTop.j.me && tieTop.j.me.rank));
  const big = await post(L + 'submit', { id: me, mode: 'marathon', token: t1.j.token, score: 90000, nick: 'Asha' });
  check('a big score from a run of a second is rejected', big.j && big.j.error === 'run_too_short', big.j && big.j.error);
  const reuse = await post(L + 'submit', { id: me, mode: 'marathon', token: t1.j.token, score: 10, nick: 'Asha' });
  check('a run token works once only', reuse.j && reuse.j.error === 'bad_token', reuse.j && reuse.j.error);
  const t2 = await post(L + 'run', { id: me, mode: 'marathon' });
  const fake = await post(L + 'submit', { id: me, mode: 'marathon', token: t2.j.token, score: 1e12, nick: 'Asha' });
  check('a score above the game\'s ceiling is rejected', fake.j && fake.j.error === 'over_ceiling', fake.j && fake.j.error);
  const t3 = await post(L + 'run', { id: me, mode: 'marathon' });
  const stolen = await post(L + 'submit', { id: you, mode: 'marathon', token: t3.j.token, score: 100, nick: 'Thief' });
  check('another id cannot spend my token', stolen.j && stolen.j.error === 'bad_token');
  const none = await post(L + 'submit', { id: me, mode: 'marathon', token: 'nope', score: 100 });
  check('a score with no token is rejected', none.j && none.j.error === 'bad_token');
  const t4 = await post(L + 'run', { id: me, mode: 'marathon' });
  await sleep(1300);
  const ok1 = await post(L + 'submit', { id: me, mode: 'marathon', token: t4.j.token, score: 4200, nick: 'Asha' });
  check('a believable score is accepted and ranked', ok1.j && ok1.j.ok && ok1.j.periods.all.rank >= 1, ok1.j && JSON.stringify(ok1.j.periods));
  const t5 = await post(L + 'run', { id: you, mode: 'marathon' });
  await sleep(1300);
  const ok2 = await post(L + 'submit', { id: you, mode: 'marathon', token: t5.j.token, score: 6100, nick: 'sh1thead' });
  check('a rude nickname is replaced by a plain one', ok2.j && ok2.j.ok && /^Player \d{4}$/.test(ok2.j.nick), ok2.j && ok2.j.nick);
  const t6 = await post(L + 'run', { id: me, mode: 'marathon' });
  const low = await post(L + 'submit', { id: me, mode: 'marathon', token: t6.j.token, score: 100, nick: 'Asha' });
  check('a lower score does not replace a best', low.j && low.j.ok && low.j.periods.all.best === 4200);
  for (const period of ['all', 'week', 'day']) {
    const top = await post(L + 'top', { id: me, mode: 'marathon', period, n: 10 });
    const rows = top.j && top.j.top;
    const okRows = rows && rows.length >= 2 && rows[0].score >= rows[1].score && rows.some((r) => r.me && r.nick === 'Asha');
    check(`top 10 (${period}) is ordered and marks my row`, okRows && top.j.me && top.j.me.score === 4200, rows && rows.map((r) => r.nick + ':' + r.score).join(' '));
    check(`top (${period}) never shows anyone's id`, top.j && !JSON.stringify(top.j).includes(me) && !JSON.stringify(top.j).includes(you));
  }
  const ren = await post(L + 'nick', { id: me, nick: 'Asha K' });
  const top2 = await post(L + 'top', { id: me, mode: 'marathon', period: 'all' });
  check('a rename shows on the board', ren.j && ren.j.ok && top2.j.top.some((r) => r.me && r.nick === 'Asha K'));
  const gtop = await get(L + 'top?mode=marathon&period=all&n=3');
  check('the board can be read without an id', gtop.j && gtop.j.ok && gtop.j.top.length >= 2 && gtop.j.me === null);

  // A race time: lower is better, and it cannot beat the wall clock.
  const R = '/net/lb/midnight-apex/';
  const r1 = await post(R + 'run', { id: me, mode: 'time' });
  await sleep(1300);
  const tooQuick = await post(R + 'submit', { id: me, mode: 'time', token: r1.j.token, score: 95.4 });
  check('a race time shorter than the run itself is rejected', tooQuick.j && tooQuick.j.error === 'faster_than_clock', tooQuick.j && tooQuick.j.error);
  const r2 = await post(R + 'run', { id: me, mode: 'time' });
  const tooFast = await post(R + 'submit', { id: me, mode: 'time', token: r2.j.token, score: 3 });
  check('a race time below the believable floor is rejected', tooFast.j && tooFast.j.error === 'below_floor', tooFast.j && tooFast.j.error);

  // net.js leaderboard helpers.
  const tok = await nA.leaderboard.run('laddoo-dash', 'classic');
  await sleep(1300);
  const sub = await nA.leaderboard.submit('laddoo-dash', 'classic', 77, tok);
  const nb = await nA.leaderboard.top('laddoo-dash', 'classic', 'day');
  check('net.js run, submit and top work together', sub && sub.ok && nb && nb.top.some((r) => r.me && r.nick === 'Kiran' && r.score === 77), nb && JSON.stringify(nb.top));
  check('net.js refuses a rude nickname', nA.setNickname('b1tch').ok === false && nA.setNickname('Rahul').ok === true);

  // Rate limits: a flood of run tokens from one id is cut off.
  const flood = rid();
  let limited = 0;
  for (let i = 0; i < 70; i++) { const r = await post(L + 'run', { id: flood, mode: 'sprint' }); if (r.status === 429) limited++; }
  check('a flood of run requests is rate limited', limited > 0, limited + ' of 70 refused');

  console.log(`\n  ${pass}/${pass + fail} passed`);
}

main().then(() => { stopServer(); process.exit(fail ? 1 : 0); }).catch((e) => { console.error(e); stopServer(); process.exit(1); });
