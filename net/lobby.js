// Lobby: one per game. It knows that game's open rooms, puts a quick-match
// player into the fullest public room of the same mode and size (or opens a
// new one), hands out five-letter codes for private rooms with friends, and
// counts who is playing. Rooms tell it when their head count changes.
import { DurableObject } from 'cloudflare:workers';
import { gameConfig, LIMITS } from './config.js';
import { randomCode, randomRoomId } from './util.js';

const STALE_MS = 10 * 60_000;    // a room that has not reported for this long is not offered
const RESERVE_MS = 15_000;       // a seat promised to a quick-match player is held this long

export class Lobby extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, mode TEXT NOT NULL, max INTEGER NOT NULL,
        players INTEGER NOT NULL DEFAULT 0, reserved INTEGER NOT NULL DEFAULT 0, reserved_at INTEGER NOT NULL DEFAULT 0,
        public INTEGER NOT NULL, code TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS rooms_code ON rooms (code);
      CREATE INDEX IF NOT EXISTS rooms_pick ON rooms (mode, max, public);
    `);
  }

  prune(now) {
    this.sql.exec('DELETE FROM rooms WHERE updated < ? OR created < ?', now - 4 * 3600_000, now - LIMITS.roomLifeMs);
  }

  async open(game, mode, max, isPublic) {
    const now = Date.now();
    const id = randomRoomId();
    let code = null;
    for (let i = 0; i < 6 && !code; i++) {
      const c = randomCode();
      if (!this.sql.exec('SELECT 1 AS x FROM rooms WHERE code = ?', c).toArray().length) code = c;
    }
    const room = this.env.ROOM.getByName(game + ':' + id);
    await room.init({ id, game, mode, max, code, public: isPublic });
    this.sql.exec('INSERT INTO rooms (id, mode, max, players, reserved, reserved_at, public, code, created, updated) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)',
      id, mode, max, isPublic ? 1 : 0, isPublic ? now : 0, isPublic ? 1 : 0, code, now, now);
    return { id, code };
  }

  async quick({ game, mode, max }) {
    const cfg = gameConfig(game);
    if (!cfg || !cfg.rooms) return { ok: false, error: 'no_rooms' };
    const now = Date.now();
    this.prune(now);
    // Only rooms with a free seat are candidates: limiting first let twenty full rooms hide every part-filled one.
    const rows = this.sql.exec(
      `SELECT id, code, players, CASE WHEN reserved_at > ? THEN reserved ELSE 0 END AS held FROM rooms
       WHERE mode = ? AND max = ? AND public = 1 AND updated > ?
         AND players + CASE WHEN reserved_at > ? THEN reserved ELSE 0 END < max
       ORDER BY players DESC, created ASC LIMIT 20`,
      now - RESERVE_MS, mode, max, now - STALE_MS, now - RESERVE_MS).toArray();
    const pick = rows.find((r) => r.players + r.held < max);
    if (pick) {
      this.sql.exec('UPDATE rooms SET reserved = ?, reserved_at = ? WHERE id = ?', pick.held + 1, now, pick.id);
      return { ok: true, room: pick.id, code: pick.code, mode, max, fresh: false };
    }
    const r = await this.open(game, mode, max, true);
    return { ok: true, room: r.id, code: r.code, mode, max, fresh: true };
  }

  async create({ game, mode, max }) {
    const cfg = gameConfig(game);
    if (!cfg || !cfg.rooms) return { ok: false, error: 'no_rooms' };
    this.prune(Date.now());
    const r = await this.open(game, mode, max, false);
    if (!r.code) return { ok: false, error: 'busy' };
    return { ok: true, room: r.id, code: r.code, mode, max };
  }

  async byCode({ code }) {
    const rows = this.sql.exec('SELECT id, mode, max, players FROM rooms WHERE code = ? AND updated > ?', code, Date.now() - 4 * 3600_000).toArray();
    if (!rows.length) return { ok: false, error: 'no_room' };
    const r = rows[0];
    if (r.players >= r.max) return { ok: false, error: 'full' };
    return { ok: true, room: r.id, code, mode: r.mode, max: r.max };
  }

  // Called by a room whenever its head count changes, and once when it closes.
  async report({ id, players, closed }) {
    if (closed) { this.sql.exec('DELETE FROM rooms WHERE id = ?', id); return { ok: true }; }
    this.sql.exec('UPDATE rooms SET players = ?, reserved = 0, reserved_at = 0, updated = ? WHERE id = ?', players | 0, Date.now(), id);
    return { ok: true };
  }

  async counts() {
    const now = Date.now();
    const rows = this.sql.exec('SELECT mode, COUNT(*) AS rooms, SUM(players) AS players FROM rooms WHERE updated > ? AND players > 0 GROUP BY mode', now - STALE_MS).toArray();
    const byMode = {}; let online = 0, rooms = 0;
    for (const r of rows) { byMode[r.mode] = { players: r.players | 0, rooms: r.rooms | 0 }; online += r.players | 0; rooms += r.rooms | 0; }
    return { ok: true, online, rooms, byMode };
  }
}
