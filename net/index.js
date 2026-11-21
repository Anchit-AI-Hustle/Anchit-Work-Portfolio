// The online layer for the games: everything under /net/*.
//
//   GET  /net/health                         is the server up
//   POST /net/match/<game>   {mode,max}      quick-match: a public room id
//   POST /net/room/<game>    {mode,max}      a private room with a 5-letter code
//   GET  /net/code/<game>/<CODE>             the room a code points at
//   GET  /net/count/<game>                   players and rooms online now
//   GET  /net/ws/<game>/<room>?id=&nick=     the room's WebSocket
//   POST /net/lb/<game>/run    {id,mode}     a single-use run token
//   POST /net/lb/<game>/submit {id,mode,token,score,nick}
//   POST /net/lb/<game>/top    {id?,mode,period,n}   (GET with ?mode=&period=&n= too)
//   POST /net/lb/<game>/nick   {id,nick}
//
// Bodies are JSON sent as text/plain, so a browser makes no preflight.
// See net/room.js for the room protocol and net/board.js for the boards.
import { gameConfig, LIMITS } from './config.js';
import { cors, fail, json, readBody, validId, validMode, validRoomId, validCode, originAllowed, clientIp, Meter } from './util.js';
export { GameRoom } from './room.js';
export { Lobby } from './lobby.js';
export { Board } from './board.js';

const edgeMeter = new Meter();
const VERSION = 1;

function ns(env, ctx, name) {
  if (env && env[name]) return env[name];
  const cls = { ROOM: 'GameRoom', LOBBY: 'Lobby', BOARD: 'Board' }[name];
  return ctx && ctx.exports && ctx.exports[cls] ? ctx.exports[cls] : null;
}

export async function handleNet(request, env, ctx) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean); // ['net', what, game, ...]
  const h = cors(request);
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: originAllowed(origin) ? 204 : 403, headers: h });
  const what = parts[1];
  if (what === 'health') return json({ ok: true, v: VERSION, now: Date.now() }, 200, h);

  // A write, or a socket, must come from one of the site's own pages; a read
  // may come from anywhere that is not a foreign page.
  const write = request.method === 'POST' || request.headers.get('Upgrade') === 'websocket';
  if (write ? !originAllowed(origin) : (origin && !originAllowed(origin))) return fail('origin', 403, h);
  if (!['GET', 'POST'].includes(request.method)) return fail('method', 405, h);
  const ip = clientIp(request);
  if (!edgeMeter.hit(ip, 240, 60_000)) return fail('rate_limited', 429, h);

  const game = parts[2];
  const cfg = gameConfig(game);
  if (!cfg) return fail('unknown_game', 404, h);
  const ROOM = ns(env, ctx, 'ROOM'), LOBBY = ns(env, ctx, 'LOBBY'), BOARD = ns(env, ctx, 'BOARD');
  if (!ROOM || !LOBBY || !BOARD) return fail('offline', 503, h);
  const out = (r) => json(r, r.ok ? 200 : (r.error === 'rate_limited' ? 429 : 400), h);

  try {
    if (what === 'match' || what === 'room') {
      if (request.method !== 'POST') return fail('method', 405, h);
      if (!cfg.rooms) return fail('no_rooms', 404, h);
      const b = await readBody(request);
      if (!b || !validMode(b.mode)) return fail('bad_request', 400, h);
      const max = Math.max(2, Math.min(cfg.maxPlayers, (b.max | 0) || cfg.maxPlayers));
      const lobby = LOBBY.getByName(game);
      return out(what === 'match' ? await lobby.quick({ game, mode: b.mode, max }) : await lobby.create({ game, mode: b.mode, max }));
    }
    if (what === 'code') {
      const code = String(parts[3] || '').toUpperCase();
      if (!validCode(code)) return fail('bad_code', 400, h);
      return out(await LOBBY.getByName(game).byCode({ code }));
    }
    if (what === 'count') return out(await LOBBY.getByName(game).counts());
    if (what === 'ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return fail('expected_websocket', 426, h);
      if (!cfg.rooms) return fail('no_rooms', 404, h);
      const room = parts[3];
      if (!validRoomId(room) || !validId(url.searchParams.get('id'))) return fail('bad_request', 400, h);
      return ROOM.getByName(game + ':' + room).fetch(request);
    }
    if (what === 'lb') {
      const op = parts[3];
      const board = BOARD.getByName(game);
      if (op === 'top') {
        const b = request.method === 'POST' ? await readBody(request) : Object.fromEntries(url.searchParams);
        if (!b || !validMode(b.mode)) return fail('bad_request', 400, h);
        const period = ['all', 'week', 'day'].includes(b.period) ? b.period : 'all';
        const id = validId(b.id) ? b.id : null;
        return out(await board.top({ game, mode: b.mode, period, n: Math.min(LIMITS.topMax, +b.n || 10), id }));
      }
      if (request.method !== 'POST') return fail('method', 405, h);
      const b = await readBody(request);
      if (!b || !validId(b.id)) return fail('bad_request', 400, h);
      if (op === 'run') {
        if (!validMode(b.mode)) return fail('bad_request', 400, h);
        return out(await board.run({ game, id: b.id, mode: b.mode, ip }));
      }
      if (op === 'submit') {
        if (!validMode(b.mode) || typeof b.token !== 'string' || b.token.length > 64) return fail('bad_request', 400, h);
        return out(await board.submit({ game, id: b.id, mode: b.mode, token: b.token, score: b.score, nick: b.nick, ip }));
      }
      if (op === 'nick') return out(await board.rename({ id: b.id, nick: b.nick }));
    }
  } catch (err) {
    console.error('net', what, err && err.message);
    return fail('server_error', 500, h);
  }
  return fail('not_found', 404, h);
}
