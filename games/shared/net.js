/*
 * Online layer for the games: live rooms and global leaderboards.
 *
 * The server is the site's Cloudflare Worker (/net/*, Durable Objects; see
 * net/ at the root of the source). Every call here fails soft: if the server
 * cannot be reached, a call resolves to null (or { ok: false }) and never
 * throws, so a game plays exactly as it does offline.
 *
 * Identity is anonymous: a random id made in this browser (kept in
 * localStorage, never shown to anyone) and an optional nickname.
 *
 *   ArcadeNet.getId()                 the anonymous id
 *   ArcadeNet.getNickname()           the chosen name, or null
 *   ArcadeNet.setNickname('Ace')      { ok, nick } or { ok: false, reason }
 *   ArcadeNet.available()             Promise<boolean>: is the server up
 *
 * Leaderboards (every game, through the shared shell arcade.js):
 *
 *   const token = await ArcadeNet.leaderboard.run('kart-mela', 'race');   // at run start
 *   const res = await ArcadeNet.leaderboard.submit('kart-mela', 'race', 4200, token);
 *   // res.periods.all.rank, res.periods.week.rank, res.periods.day.rank
 *   const board = await ArcadeNet.leaderboard.top('kart-mela', 'race', 'week', { n: 10 });
 *   // board.top = [{ rank, nick, score, me }], board.me = { rank, score } or null
 *
 * Live multiplayer (flagship games):
 *
 *   const room = await ArcadeNet.quickMatch('kart-mela', 'race', { maxPlayers: 8 });
 *   if (!room) return startOffline();          // server down: play with bots only
 *   room.on('slots', (slots) => {              // humans in, bots fill the rest
 *     slots.forEach((s) => s.kind === 'bot' ? ensureBot(s.id, s.seat) : ensureRacer(s.id, s.seat, s.nick));
 *   });
 *   room.on('state', (uid, st) => {});         // a remote player's latest state
 *   room.on('event', (from, ev) => {});        // a remote event (a goal, a hit)
 *   room.on('bot', (botId, st) => {});         // bot states the host sends
 *   // each frame:
 *   room.send({ x, y, z, h, v });              // sent at room.sendHz, latest wins
 *   if (room.isHost) room.sendBots({ bot3: {...} });
 *   const p = room.sample(uid, ['h']);    // interpolated, 'h' wraps as an angle
 *   room.event({ k: 'goal', team: 1 });
 *   if (room.isHost) room.score({ add: { red: 1 } }); room.startMatch(180000);
 *   room.timeLeft();  room.ping;  room.leave();
 *
 *   const r = await ArcadeNet.createRoom('nitro-goal', '3v3', { maxPlayers: 6 }); // r.code = 'K7QPZ'
 *   const r2 = await ArcadeNet.joinCode('nitro-goal', 'K7QPZ');
 *
 * Bot backfill: a room has `max` seats. room.slots() lists every seat, a
 * human where one sits and a bot ('bot' + seat) everywhere else; the host
 * simulates the bots (room.myBots()). When a human joins a seat its bot goes,
 * so a match can start at once with one person and fill up as people arrive.
 */
(function () {
  'use strict';

  // The Cloudflare Worker that runs /net/*. Pages served by that same Worker
  // (anchit-tandon.com and its workers.dev hosts) talk to their own origin; a
  // page served anywhere else (the Vercel alias) uses this host directly.
  const NET_HOST = 'https://anchit-work-portfolio.anchit-tandon.workers.dev';
  const SITE_HOSTS = /^(www\.)?anchit-tandon\.com$|\.anchit-tandon\.workers\.dev$/;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const now = () => Date.now();

  /* ------------------------------------------------------------ server */
  // Where the server is, or null for "stay offline". A test or a developer
  // can point it anywhere: window.ARCADE_NET_BASE, ?net=<url> or
  // localStorage 'arcade.net.base' (the value 'off' turns it off).
  function candidates() {
    let o = null;
    try { o = window.ARCADE_NET_BASE || new URLSearchParams(location.search).get('net') || ls.get('arcade.net.base'); } catch (e) { o = null; }
    if (o) return o === 'off' ? [] : [String(o).replace(/\/$/, '')];
    const h = location.hostname || '';
    if (SITE_HOSTS.test(h)) return [location.origin, NET_HOST].filter((v, i, a) => a.indexOf(v) === i);
    if (/\.vercel\.app$/.test(h)) return [NET_HOST];
    return []; // a local or unknown host stays offline unless told otherwise
  }

  let baseP = null, baseNow = null;
  function resolveBase() {
    if (baseP) return baseP;
    const list = candidates();
    const cached = ss.get('arcade.net.base');
    if (cached && cached.list === list.join(' ') && now() - cached.at < (cached.base ? 600000 : 120000)) {
      baseNow = cached.base; baseP = Promise.resolve(cached.base); return baseP;
    }
    baseP = (async () => {
      for (const b of list) {
        try {
          const ctl = typeof AbortController === 'function' ? new AbortController() : null;
          const t = ctl ? setTimeout(() => ctl.abort(), 4000) : 0;
          const r = await fetch(b + '/net/health', { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
          clearTimeout(t);
          const j = r.ok ? await r.json() : null;
          if (j && j.ok) { ss.set('arcade.net.base', { list: list.join(' '), base: b, at: now() }); baseNow = b; return b; }
        } catch (e) { /* next */ }
      }
      ss.set('arcade.net.base', { list: list.join(' '), base: null, at: now() });
      baseP = null; // try again on a later call (after the short negative cache)
      return null;
    })();
    return baseP;
  }

  async function call(path, body, method) {
    const b = await resolveBase();
    if (!b) return null;
    try {
      const r = await fetch(b + path, body === undefined && method !== 'POST' ? { cache: 'no-store' } : {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body || {}),
      });
      const j = await r.json().catch(() => null);
      return j || { ok: false, error: 'http_' + r.status };
    } catch (e) { return null; }
  }

  /* -------------------------------------------------------- identity */
  function getId() {
    let id = ls.get('arcade.net.id');
    if (!id || !/^[A-Za-z0-9_-]{16,40}$/.test(id)) {
      const a = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(a);
      id = btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      ls.set('arcade.net.id', id);
    }
    return id;
  }

  // The same check the server runs (net/util.js). The words are ROT13 so this
  // file does not print them.
  const rot13 = (s) => s.replace(/[a-z]/g, (c) => String.fromCharCode((c.charCodeAt(0) - 97 + 13) % 26 + 97));
  const SUB = ('shpx fuvg ovgpu phag chffl jnaxre juber snttbg avttre avttn ergneq cbea encvfg uvgyre ' +
    'puhgvln puhgvlr ynhqn yniqn ourapubq orurapubq znqnepubq ofqx tnnaq unenzv xnzvan cravf intvan obbof').split(' ').map(rot13);
  const WORD = 'qvpx pbpx nff nefr frk gvgf fyhg gjng encr anmv yhaq enaqv snt'.split(' ').map(rot13);
  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };
  function cleanNick(raw) {
    if (typeof raw !== 'string') return { ok: false, reason: 'Type a name.' };
    const s = (raw.normalize ? raw.normalize('NFKC') : raw).replace(/\s+/g, ' ').trim();
    if (s.length < 2 || s.length > 16) return { ok: false, reason: 'Use 2 to 16 characters.' };
    if (!/^[A-Za-z0-9 ._-]+$/.test(s)) return { ok: false, reason: 'Letters, numbers, spaces, dots, dashes and underscores only.' };
    const low = s.toLowerCase().replace(/[0-9@$!]/g, (c) => LEET[c] || c);
    const flat = low.replace(/[^a-z]/g, '');
    if (SUB.some((w) => flat.indexOf(w) >= 0) || low.split(/[^a-z]+/).some((t) => WORD.indexOf(t) >= 0)) return { ok: false, reason: 'Please pick a friendlier name.' };
    return { ok: true, nick: s };
  }
  function defaultNick() {
    const id = getId(); let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return 'Player ' + String(1000 + (h % 9000));
  }
  const getNickname = () => { const n = ls.get('arcade.net.nick'); return n && cleanNick(n).ok ? n : null; };
  function setNickname(n) {
    const c = cleanNick(n);
    if (!c.ok) return c;
    ls.set('arcade.net.nick', c.nick);
    return c;
  }
  const shownNick = () => getNickname() || defaultNick();
  const safeMode = (m) => String(m == null || m === '' ? 'all' : m).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 16) || 'all';

  /* ------------------------------------------------------ leaderboard */
  const topCache = new Map();
  const leaderboard = {
    // Ask for a single-use token as a run starts. Resolves to the token or null.
    async run(game, mode) {
      const r = await call('/net/lb/' + game + '/run', { id: getId(), mode: safeMode(mode) });
      return r && r.ok ? r.token : null;
    },
    // Post a finished run's score. Resolves to { ok, nick, periods } or null / { ok: false, error }.
    async submit(game, mode, score, runToken, meta) {
      if (!runToken || typeof score !== 'number' || !isFinite(score)) return null;
      const r = await call('/net/lb/' + game + '/submit', { id: getId(), mode: safeMode(mode), token: runToken, score, nick: shownNick(), meta: meta || null });
      if (r && r.ok) for (const k of Array.from(topCache.keys())) if (k.indexOf(game + '|') === 0) topCache.delete(k);
      return r;
    },
    // The top n for a period ('all', 'week' or 'day'), with this player's rank.
    async top(game, mode, period, o) {
      o = o || {};
      const key = game + '|' + safeMode(mode) + '|' + (period || 'all') + '|' + (o.n || 10);
      const c = topCache.get(key);
      if (c && now() - c.at < (o.maxAge == null ? 60000 : o.maxAge)) return c.v;
      const r = await call('/net/lb/' + game + '/top', { id: getId(), mode: safeMode(mode), period: period || 'all', n: o.n || 10 });
      if (r && r.ok) topCache.set(key, { at: now(), v: r });
      return r && r.ok ? r : null;
    },
    // Put a new nickname on every score this player holds on one game's boards.
    async rename(game, nick) {
      const c = cleanNick(nick);
      if (!c.ok) return c;
      const r = await call('/net/lb/' + game + '/nick', { id: getId(), nick: c.nick });
      if (r && r.ok) for (const k of Array.from(topCache.keys())) if (k.indexOf(game + '|') === 0) topCache.delete(k);
      return r;
    },
    safeMode,
  };

  /* ---------------------------------------------- snapshots, interpolation */
  // A short history of one remote player's states, sampled a little in the
  // past (delay ms) so motion is smooth between ticks. Numeric fields are
  // blended; a field named in `angles` wraps around 2 PI; anything else snaps.
  function SnapBuffer(delay, size) {
    const buf = []; delay = delay == null ? 100 : delay; size = size || 12;
    return {
      push(t, state) { if (buf.length && t <= buf[buf.length - 1].t) t = buf[buf.length - 1].t + 1; buf.push({ t, s: state }); if (buf.length > size) buf.shift(); },
      latest() { return buf.length ? buf[buf.length - 1].s : null; },
      sample(at, angles) {
        if (!buf.length) return null;
        const t = at - delay;
        if (t <= buf[0].t) return buf[0].s;
        for (let i = buf.length - 1; i > 0; i--) {
          const a = buf[i - 1], b = buf[i];
          if (t >= a.t) {
            if (t >= b.t) return b.s;
            return lerpState(a.s, b.s, (t - a.t) / (b.t - a.t), angles);
          }
        }
        return buf[buf.length - 1].s;
      },
      clear() { buf.length = 0; },
    };
  }
  function lerpAngle(a, b, k) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
  function lerpState(a, b, k, angles) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return k < 0.5 ? a : b;
    const out = Array.isArray(b) ? [] : {};
    for (const key in b) {
      const va = a[key], vb = b[key];
      if (typeof va === 'number' && typeof vb === 'number') out[key] = angles && angles.indexOf(key) >= 0 ? lerpAngle(va, vb, k) : va + (vb - va) * k;
      else if (va && vb && typeof va === 'object') out[key] = lerpState(va, vb, k, angles);
      else out[key] = vb;
    }
    return out;
  }

  /* ------------------------------------------------------------- rooms */
  function wsUrl(base, game, roomId) {
    const u = base.replace(/^http/, 'ws') + '/net/ws/' + game + '/' + roomId;
    return u + '?id=' + encodeURIComponent(getId()) + '&nick=' + encodeURIComponent(shownNick());
  }

  // A live room. Created by quickMatch / createRoom / joinCode / connect.
  function Room(base, game, info, o) {
    o = o || {};
    const handlers = {};
    const remote = new Map(); // uid -> SnapBuffer
    const bots = new Map();   // botId -> SnapBuffer
    const room = {
      id: info.room, code: info.code || null, game, mode: info.mode, max: info.max || 8,
      me: null, host: null, isHost: false, players: [], clock: { phase: 'lobby', start: 0, end: 0 }, scores: {},
      ping: 0, offset: 0, sendHz: o.sendHz || 10, connected: false, closed: false, interpDelay: o.interpDelay == null ? 120 : o.interpDelay,
      on(type, fn) { (handlers[type] = handlers[type] || []).push(fn); return room; },
      off(type, fn) { const l = handlers[type]; if (l) handlers[type] = l.filter((f) => f !== fn); return room; },
      // Latest state wins; sent at most sendHz times a second.
      send(state) { pendingState = state; hasState = true; pump(); },
      sendBots(map) { if (!room.isHost || !map) return; Object.assign(pendingBots, map); hasBots = true; pump(); },
      event(data, toUid) { raw(toUid ? { t: 'e', d: data, to: toUid } : { t: 'e', d: data }); },
      score(change) { if (room.isHost) raw({ t: 'sc', add: change.add, set: change.set }); },
      startMatch(durMs) { if (room.isHost) raw({ t: 'start', dur: durMs || 0 }); },
      endMatch() { if (room.isHost) raw({ t: 'end' }); },
      setNick(n) { const c = cleanNick(n); if (c.ok) raw({ t: 'nick', nick: c.nick }); return c; },
      serverNow() { return now() + room.offset; },
      timeLeft() { return room.clock.phase === 'live' && room.clock.end ? Math.max(0, room.clock.end - room.serverNow()) : null; },
      // Every seat: a human where one sits, else a bot the host runs.
      slots() {
        const bySeat = {};
        room.players.forEach((p) => { bySeat[p.seat] = p; });
        const out = [];
        for (let s = 0; s < room.max; s++) {
          const p = bySeat[s];
          out.push(p ? { seat: s, kind: 'human', id: p.uid, nick: p.nick, me: !!room.me && p.uid === room.me.uid, away: !!p.away }
            : { seat: s, kind: 'bot', id: 'bot' + s, nick: null, me: false, away: false });
        }
        return out;
      },
      myBots() { return room.isHost ? room.slots().filter((s) => s.kind === 'bot').map((s) => s.id) : []; },
      latest(uid) { const b = remote.get(uid) || bots.get(uid); return b ? b.latest() : null; },
      sample(uid, angles) { const b = remote.get(uid) || bots.get(uid); return b ? b.sample(now(), angles) : null; },
      leave() { leaving = true; room.closed = true; clearTimeout(retryT); clearInterval(pingT); try { ws && ws.close(1000, 'leave'); } catch (e) { /* closed */ } emit('close', 'left'); },
    };
    let ws = null, leaving = false, retries = 0, retryT = 0, pingT = 0, pingAt = 0;
    let pendingState = null, hasState = false, pendingBots = {}, hasBots = false, lastSend = 0, sendT = 0;
    let resolveFirst = null;
    const first = new Promise((r) => { resolveFirst = r; });

    function emit(type) {
      const args = Array.prototype.slice.call(arguments, 1);
      (handlers[type] || []).forEach((fn) => { try { fn.apply(null, args); } catch (e) { console.warn(e); } });
    }
    function raw(m) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(m)); } catch (e) { /* closing */ } } }
    function pump() {
      if (sendT) return;
      const gap = 1000 / Math.max(1, Math.min(30, room.sendHz));
      const wait = gap - (now() - lastSend);
      const go = () => {
        sendT = 0;
        if (!hasState && !hasBots) return;
        lastSend = now();
        const m = { t: 's' };
        if (hasState) m.d = pendingState;
        if (hasBots) m.b = pendingBots;
        hasState = false; hasBots = false; pendingBots = {};
        raw(m);
      };
      if (wait <= 0) go(); else sendT = setTimeout(go, wait);
    }
    function setHost(uid) {
      const was = room.isHost;
      room.host = uid; room.isHost = !!room.me && uid === room.me.uid;
      if (was !== room.isHost || uid) emit('host', uid, room.isHost);
    }
    function slotsChanged() { emit('slots', room.slots()); }
    function upsert(p) {
      const i = room.players.findIndex((x) => x.uid === p.uid);
      if (i >= 0) room.players[i] = Object.assign({}, room.players[i], p); else room.players.push(p);
    }

    function onMessage(ev) {
      if (ev.data === 'pong') { room.ping = now() - pingAt; emit('ping', room.ping); return; }
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      switch (m.t) {
        case 'welcome': {
          room.me = m.you; room.players = m.players || []; room.scores = m.scores || {};
          room.mode = m.room.mode; room.max = m.room.max; if (m.room.code) room.code = m.room.code;
          room.offset = m.clock.now - now(); room.clock = m.clock; room.connected = true; retries = 0;
          setHost(m.host);
          emit(m.back ? 'reconnect' : 'welcome', room);
          slotsChanged();
          resolveFirst(room);
          break;
        }
        case 'snap': {
          const t = now();
          room.offset = room.offset * 0.9 + (m.now - t) * 0.1;
          const s = m.s || {};
          for (const uid in s) {
            if (room.me && uid === room.me.uid) continue;
            let b = remote.get(uid); if (!b) { b = SnapBuffer(room.interpDelay); remote.set(uid, b); }
            b.push(t, s[uid]); emit('state', uid, s[uid], m.now);
          }
          if (m.b && !room.isHost) for (const id in m.b) {
            let b = bots.get(id); if (!b) { b = SnapBuffer(room.interpDelay); bots.set(id, b); }
            b.push(t, m.b[id]); emit('bot', id, m.b[id], m.now);
          }
          (m.e || []).forEach((e) => { if (!room.me || e[0] !== room.me.uid) emit('event', e[0], e[1], m.now); });
          if (m.sc) { room.scores = m.sc; emit('score', room.scores); }
          break;
        }
        case 'join': upsert(m.p); emit('join', m.p); slotsChanged(); break;
        case 'back': upsert({ uid: m.uid, nick: m.nick, away: false }); emit('back', m.uid); slotsChanged(); break;
        case 'away': upsert({ uid: m.uid, away: true }); emit('away', m.uid); slotsChanged(); break;
        case 'leave': room.players = room.players.filter((p) => p.uid !== m.uid); remote.delete(m.uid); emit('leave', m.uid); slotsChanged(); break;
        case 'host': setHost(m.uid); slotsChanged(); break;
        case 'nick': upsert({ uid: m.uid, nick: m.nick }); emit('nick', m.uid, m.nick); break;
        case 'start': room.clock = m.clock; room.scores = {}; emit('start', room.clock); break;
        case 'end': room.clock = m.clock; room.scores = m.scores || room.scores; emit('end', room.scores); break;
        case 'err': room.lastError = m.code; break;
        default: break;
      }
    }

    function open() {
      try { ws = new WebSocket(wsUrl(base, game, room.id)); } catch (e) { fail('unreachable'); return; }
      ws.onmessage = onMessage;
      ws.onopen = () => {
        clearInterval(pingT);
        pingT = setInterval(() => { if (ws && ws.readyState === 1) { pingAt = now(); try { ws.send('ping'); } catch (e) { /* closing */ } } }, 2000);
      };
      ws.onclose = (ev) => {
        clearInterval(pingT);
        room.connected = false;
        if (leaving) return;
        // Refused for good: full, gone, or replaced by this player's newer tab.
        if ([4000, 4001, 4002, 4004, 1008].indexOf(ev.code) >= 0 || retries >= 6) { fail(room.lastError || ev.reason || 'closed'); return; }
        retries++;
        emit('reconnecting', retries);
        retryT = setTimeout(open, Math.min(4000, 300 * Math.pow(2, retries - 1)));
      };
      ws.onerror = () => { /* onclose follows */ };
    }
    function fail(why) {
      room.closed = true; room.connected = false;
      resolveFirst(null);
      emit('close', why);
    }
    open();
    const wait = o.timeoutMs || 8000;
    return Promise.race([first, new Promise((r) => setTimeout(() => r(null), wait))]).then((r) => {
      if (!r) { leaving = true; room.closed = true; clearTimeout(retryT); clearInterval(pingT); try { ws && ws.close(); } catch (e) { /* ignore */ } return null; }
      return r;
    });
  }

  async function connect(game, info, o) {
    const b = await resolveBase();
    if (!b || !info || !info.room || typeof WebSocket !== 'function') return null;
    try { return await Room(b, game, info, o); } catch (e) { return null; }
  }
  async function quickMatch(game, mode, o) {
    o = o || {};
    // Two people can be promised the last seat at the same instant; the room
    // turns the second away, and a second try finds or opens another room.
    for (let tries = 0; tries < 3; tries++) {
      const r = await call('/net/match/' + game, { mode: safeMode(mode), max: o.maxPlayers || 8 });
      if (!r || !r.ok) return null;
      const t0 = now();
      const room = await connect(game, r, o);
      if (room) return room;
      if (now() - t0 > 3000) return null; // slow, not full: do not keep the player waiting
    }
    return null;
  }
  async function createRoom(game, mode, o) {
    o = o || {};
    const r = await call('/net/room/' + game, { mode: safeMode(mode), max: o.maxPlayers || 8 });
    return r && r.ok ? connect(game, r, o) : null;
  }
  async function joinCode(game, code, o) {
    const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(c)) return null;
    const r = await call('/net/code/' + game + '/' + c);
    return r && r.ok ? connect(game, r, o) : null;
  }
  async function online(game) { const r = await call('/net/count/' + game); return r && r.ok ? r : null; }

  window.ArcadeNet = {
    version: 1,
    get base() { return baseNow; },
    available: () => resolveBase().then((b) => !!b),
    getId, getNickname, setNickname, cleanNick, defaultNick, shownNick,
    leaderboard, quickMatch, createRoom, joinCode, connect, online,
    SnapBuffer, lerpState, lerpAngle,
  };
  try { window.dispatchEvent(new Event('arcadenet')); } catch (e) { /* old browser */ }
})();
