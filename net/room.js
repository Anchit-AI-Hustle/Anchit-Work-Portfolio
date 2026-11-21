// GameRoom: one live match of one game. Up to `max` players (8 or 12) hold a
// WebSocket each; the room relays what they send at a fixed tick, names a
// host (who runs the bots and the shared game logic), keeps the authoritative
// match clock and score, gives a dropped player their seat back for a short
// while, and closes itself once nobody is left.
//
// The WebSocket Hibernation API is used throughout (ctx.acceptWebSocket and
// the webSocket* handlers), so a room with nobody sending costs nothing: the
// sockets stay open while the object sleeps. Everything that must survive a
// sleep lives in SQLite (room meta, the seat list) or in each socket's
// attachment; the relay buffer is in memory, and is only ever non-empty while
// messages are arriving, which keeps the object awake anyway.
//
// Client to server (JSON text frames):
//   {t:'s', d:<state>, b?:{<botId>:<state>}}   my latest state; b only from the host
//   {t:'e', d:<event>, to?:<uid>}              an event, to everyone or to one player
//   {t:'sc', add?:{k:n}, set?:{k:n}}           score change (host only)
//   {t:'start', dur?:ms}  {t:'end'}            match clock (host only)
//   {t:'nick', nick}                           change my shown name
//   the plain text 'ping' is answered 'pong' by the runtime without waking us
// Server to client:
//   welcome, join, leave, away, back, host, nick, start, end, sc, full, err,
//   snap {n, now, s:{uid:state}, b:{botId:state}, e:[[from, event]], sc?}
import { DurableObject } from 'cloudflare:workers';
import { LIMITS, roomTimers } from './config.js';
import { cleanNick, defaultNick } from './util.js';

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS players (uid TEXT PRIMARY KEY, pid TEXT NOT NULL UNIQUE, nick TEXT NOT NULL,
        seat INTEGER NOT NULL, joined INTEGER NOT NULL, connected INTEGER NOT NULL, left_at INTEGER);
    `);
    // A latency ping answered at the edge: no wake, no duration.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.meta = this.loadMeta();
    this.buf = null;       // pending relay: {s, b, e, sc}
    this.timer = 0;
    this.lastFlush = 0;
    this.seq = 0;
    this.rates = new Map(); // uid -> {t, n, over}
    this.timers = roomTimers(env);
  }

  loadMeta() {
    const r = this.sql.exec("SELECT v FROM meta WHERE k = 'room'").toArray();
    return r.length ? JSON.parse(r[0].v) : null;
  }
  saveMeta() { this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('room', ?)", JSON.stringify(this.meta)); }

  // Called once by the Lobby before it hands the room id out.
  async init({ id, game, mode, max, code, public: isPublic }) {
    if (this.meta) return { ok: true };
    const now = Date.now();
    this.meta = { id, game, mode, max, code, public: !!isPublic, created: now, host: null, nextUid: 1,
      phase: 'lobby', start: 0, end: 0, scores: {}, emptySince: now, tickMs: LIMITS.tickMs };
    this.saveMeta();
    await this.schedule();
    return { ok: true };
  }

  players() { return this.sql.exec('SELECT uid, pid, nick, seat, joined, connected, left_at FROM players ORDER BY seat').toArray(); }
  publicPlayers() {
    return this.players().map((p) => ({ uid: p.uid, nick: p.nick, seat: p.seat, away: !p.connected }));
  }
  sockets(uid) { return this.ctx.getWebSockets(uid); }

  send(ws, msg) { try { ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (e) { /* closing */ } }
  broadcast(msg, exceptUid) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (exceptUid && a && a.uid === exceptUid) continue;
      this.send(ws, s);
    }
  }

  async report() {
    if (!this.meta) return;
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM players').one().n;
    try { await this.env.LOBBY.getByName(this.meta.game).report({ id: this.meta.id, players: n }); } catch (e) { /* lobby busy: next change reports again */ }
  }

  // The host is the longest-seated connected player; it moves only when the
  // host drops. `quietUid` is told in its welcome instead of by broadcast.
  pickHost(quietUid) {
    const live = this.players().filter((p) => p.connected);
    const cur = live.find((p) => p.uid === this.meta.host);
    const next = cur ? cur.uid : (live[0] ? live[0].uid : null);
    if (next !== this.meta.host) {
      this.meta.host = next; this.saveMeta();
      if (next) this.broadcast({ t: 'host', uid: next }, quietUid);
    }
  }

  clock() { return { now: Date.now(), phase: this.meta.phase, start: this.meta.start, end: this.meta.end }; }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const url = new URL(request.url);
    const pid = url.searchParams.get('id');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // A refusal is said over the socket (a browser cannot read a failed
    // handshake's reason), then closed. A plain accept: nothing to hibernate.
    const refuse = (code, why) => {
      server.accept();
      this.send(server, { t: 'err', code: why });
      server.close(code, why);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (!this.meta || this.meta.closed) return refuse(4004, 'no_room');
    const now = Date.now();
    let p = this.sql.exec('SELECT uid, nick, seat FROM players WHERE pid = ?', pid).toArray()[0];
    const nick = cleanNick(url.searchParams.get('nick') || '') || defaultNick(pid);
    let back = false;
    if (p) {
      back = true;
      for (const old of this.sockets(p.uid)) { try { old.close(4000, 'replaced'); } catch (e) { /* gone */ } }
      this.sql.exec('UPDATE players SET connected = 1, left_at = NULL, nick = ? WHERE uid = ?', nick, p.uid);
      p.nick = nick;
    } else {
      const taken = new Set(this.players().map((x) => x.seat));
      if (taken.size >= this.meta.max) return refuse(4001, 'full');
      let seat = 0; while (taken.has(seat)) seat++;
      const uid = 'p' + this.meta.nextUid++;
      this.sql.exec('INSERT INTO players (uid, pid, nick, seat, joined, connected, left_at) VALUES (?, ?, ?, ?, ?, 1, NULL)', uid, pid, nick, seat, now);
      p = { uid, nick, seat };
    }
    this.meta.emptySince = 0;
    this.saveMeta();
    this.ctx.acceptWebSocket(server, [p.uid]);
    server.serializeAttachment({ uid: p.uid });
    this.pickHost(p.uid);
    this.send(server, {
      t: 'welcome', you: { uid: p.uid, seat: p.seat, nick: p.nick }, back,
      room: { id: this.meta.id, code: this.meta.public ? null : this.meta.code, game: this.meta.game, mode: this.meta.mode, max: this.meta.max, tickMs: this.meta.tickMs },
      host: this.meta.host, players: this.publicPlayers(), clock: this.clock(), scores: this.meta.scores,
    });
    this.broadcast(back ? { t: 'back', uid: p.uid, nick: p.nick } : { t: 'join', p: { uid: p.uid, nick: p.nick, seat: p.seat, away: false } }, p.uid);
    await this.report();
    await this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  rateOk(uid) {
    const now = Date.now();
    let r = this.rates.get(uid);
    if (!r || now - r.t >= 1000) { r = { t: now, n: 0, over: r ? r.over : 0 }; this.rates.set(uid, r); }
    r.n++;
    if (r.n > LIMITS.msgPerSec) { r.over++; return r.over > 200 ? 'close' : false; }
    return true;
  }

  async webSocketMessage(ws, message) {
    const a = ws.deserializeAttachment();
    if (!a || !a.uid || !this.meta) return;
    const uid = a.uid;
    if (typeof message !== 'string' || message.length > LIMITS.msgBytes) return;
    const ok = this.rateOk(uid);
    if (ok === 'close') { ws.close(1008, 'too_fast'); return; }
    if (!ok) return;
    let m; try { m = JSON.parse(message); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const isHost = uid === this.meta.host;
    const buf = this.buf || (this.buf = { s: {}, b: {}, e: [], sc: false });
    switch (m.t) {
      case 's':
        if (m.d !== undefined) buf.s[uid] = m.d;
        if (isHost && m.b && typeof m.b === 'object') for (const k of Object.keys(m.b).slice(0, 16)) buf.b[k] = m.b[k];
        break;
      case 'e':
        if (buf.e.length < 64) buf.e.push(m.to ? [uid, m.d, String(m.to)] : [uid, m.d]);
        break;
      case 'sc':
        if (!isHost) return;
        this.applyScore(m);
        buf.sc = true;
        break;
      case 'start': {
        if (!isHost) return;
        const now = Date.now();
        const dur = Math.max(0, Math.min(LIMITS.maxMatchMs, +m.dur || 0));
        Object.assign(this.meta, { phase: 'live', start: now, end: dur ? now + dur : 0, scores: {} });
        this.saveMeta();
        this.broadcast({ t: 'start', clock: this.clock() });
        await this.schedule();
        return;
      }
      case 'end':
        if (!isHost) return;
        this.finish();
        await this.schedule();
        return;
      case 'nick': {
        const n = cleanNick(m.nick || '');
        if (!n) return;
        this.sql.exec('UPDATE players SET nick = ? WHERE uid = ?', n, uid);
        this.broadcast({ t: 'nick', uid, nick: n });
        return;
      }
      default:
        return;
    }
    this.queueFlush();
  }

  applyScore(m) {
    const sc = this.meta.scores;
    const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).slice(0, LIMITS.scoreKeys) : []);
    for (const k of keys(m.set)) { const v = +m.set[k]; if (Number.isFinite(v) && k.length <= 16) sc[k] = v; }
    for (const k of keys(m.add)) { const v = +m.add[k]; if (Number.isFinite(v) && k.length <= 16) sc[k] = (sc[k] || 0) + v; }
    if (Object.keys(sc).length > LIMITS.scoreKeys) return;
    this.saveMeta();
  }

  // The tick: the first message after a quiet spell goes out at once, then at
  // most one snapshot per tickMs while messages keep coming, then nothing.
  queueFlush() {
    if (this.timer) return;
    const wait = this.meta.tickMs - (Date.now() - this.lastFlush);
    if (wait <= 0) this.flush();
    else this.timer = setTimeout(() => this.flush(), wait);
  }

  flush() {
    this.timer = 0;
    const buf = this.buf; this.buf = null;
    if (!buf) return;
    this.lastFlush = Date.now();
    const base = { t: 'snap', n: ++this.seq, now: this.lastFlush, s: buf.s };
    if (Object.keys(buf.b).length) base.b = buf.b;
    if (buf.sc) base.sc = this.meta.scores;
    const pub = buf.e.filter((e) => e.length === 2);
    const priv = buf.e.filter((e) => e.length === 3);
    if (pub.length) base.e = pub;
    if (!priv.length) { this.broadcast(base); return; }
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment(); if (!a || !a.uid) continue;
      const mine = priv.filter((e) => e[2] === a.uid).map((e) => [e[0], e[1]]);
      this.send(ws, mine.length ? Object.assign({}, base, { e: (base.e || []).concat(mine) }) : base);
    }
  }

  finish() {
    if (this.meta.phase === 'over') return;
    this.meta.phase = 'over';
    this.meta.end = Date.now();
    this.saveMeta();
    this.flush();
    this.broadcast({ t: 'end', clock: this.clock(), scores: this.meta.scores });
  }

  dropSocket(ws) {
    const a = ws.deserializeAttachment();
    if (!a || !a.uid || !this.meta) return false;
    // Still another live socket for this player (a reconnect replaced this one)?
    if (this.sockets(a.uid).some((s) => s !== ws && s.readyState === 1)) return false;
    this.sql.exec('UPDATE players SET connected = 0, left_at = ? WHERE uid = ?', Date.now(), a.uid);
    this.rates.delete(a.uid);
    this.broadcast({ t: 'away', uid: a.uid }, a.uid);
    if (!this.players().some((p) => p.connected)) { this.meta.emptySince = Date.now(); this.saveMeta(); }
    this.pickHost();
    return true;
  }

  async webSocketClose(ws, code, reason) {
    if (code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)) { try { ws.close(code, reason); } catch (e) { /* closed */ } }
    else { try { ws.close(); } catch (e) { /* closed */ } }
    if (this.dropSocket(ws)) await this.schedule();
  }

  async webSocketError(ws) {
    if (this.dropSocket(ws)) await this.schedule();
  }

  // One alarm covers every timer the room has: the end of a dropped player's
  // grace, the end of a timed match, closing once empty, and the room's life.
  async schedule() {
    if (!this.meta || this.meta.closed) return;
    const times = [this.meta.created + LIMITS.roomLifeMs];
    for (const p of this.players()) if (!p.connected && p.left_at) times.push(p.left_at + this.timers.graceMs);
    if (this.meta.phase === 'live' && this.meta.end) times.push(this.meta.end);
    if (this.meta.emptySince) times.push(this.meta.emptySince + this.timers.emptyCloseMs);
    await this.ctx.storage.setAlarm(Math.min(...times));
  }

  async alarm() {
    if (!this.meta || this.meta.closed) return;
    const now = Date.now();
    let changed = false;
    for (const p of this.players()) {
      if (!p.connected && p.left_at && p.left_at + this.timers.graceMs <= now) {
        this.sql.exec('DELETE FROM players WHERE uid = ?', p.uid);
        this.broadcast({ t: 'leave', uid: p.uid });
        changed = true;
      }
    }
    if (this.meta.phase === 'live' && this.meta.end && now >= this.meta.end) this.finish();
    const count = this.sql.exec('SELECT COUNT(*) AS n FROM players').one().n;
    const expired = now >= this.meta.created + LIMITS.roomLifeMs;
    if (expired || (count === 0 && this.meta.emptySince && now >= this.meta.emptySince + this.timers.emptyCloseMs)) {
      await this.close(expired ? 'room_expired' : 'empty');
      return;
    }
    if (changed) await this.report();
    await this.schedule();
  }

  async close(why) {
    const game = this.meta.game, id = this.meta.id;
    for (const ws of this.ctx.getWebSockets()) { this.send(ws, { t: 'err', code: why }); try { ws.close(4002, why); } catch (e) { /* gone */ } }
    try { await this.env.LOBBY.getByName(game).report({ id, closed: true }); } catch (e) { /* stale rows are pruned anyway */ }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.meta = null;
  }

  // For tests and the router: is this room open, and how full.
  async info() {
    if (!this.meta) return { ok: false, error: 'no_room' };
    return { ok: true, id: this.meta.id, phase: this.meta.phase, max: this.meta.max, players: this.publicPlayers(), host: this.meta.host };
  }
}
