// Board: the global leaderboards of one game, held in that game's own SQLite
// store. Three periods per mode (all time, this ISO week, today, both in UTC),
// each keeping one best score per player. A score is only taken against a run
// token the same player asked for when the run started, once, and only if it
// is believable for that game (see config.js).
import { DurableObject } from 'cloudflare:workers';
import { gameConfig, LIMITS } from './config.js';
import { cleanNick, defaultNick, randomToken, Meter } from './util.js';

const DAY = 86_400_000;

// UTC day and ISO week keys, plus the moment each bucket began (for pruning).
export function buckets(now) {
  const d = new Date(now);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (d.getUTCDay() + 6) % 7; // Monday 0
  const monday = day - dow * DAY;
  const th = new Date(monday + 3 * DAY); // the ISO year is the Thursday's year
  const y = th.getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1);
  const week = 1 + Math.floor((th.getTime() - jan1) / (7 * DAY));
  return {
    all: { key: 'a', start: 0 },
    week: { key: 'w' + y + '-' + String(week).padStart(2, '0'), start: monday },
    day: { key: 'd' + new Date(day).toISOString().slice(0, 10), start: day },
  };
}

export class Board extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.ipMeter = new Meter();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS runs (token TEXT PRIMARY KEY, pid TEXT NOT NULL, mode TEXT NOT NULL, started INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS scores (mode TEXT NOT NULL, bucket TEXT NOT NULL, pid TEXT NOT NULL, nick TEXT NOT NULL,
        score REAL NOT NULL, at INTEGER NOT NULL, bstart INTEGER NOT NULL, PRIMARY KEY (mode, bucket, pid));
      CREATE INDEX IF NOT EXISTS scores_rank ON scores (mode, bucket, score);
      CREATE INDEX IF NOT EXISTS scores_pid ON scores (pid);
      CREATE TABLE IF NOT EXISTS idrate (pid TEXT NOT NULL, kind TEXT NOT NULL, hour INTEGER NOT NULL, n INTEGER NOT NULL,
        PRIMARY KEY (pid, kind, hour));
      CREATE TABLE IF NOT EXISTS modes (mode TEXT PRIMARY KEY);
    `);
  }

  idLimit(pid, kind, limit) {
    const hour = Math.floor(Date.now() / 3600_000);
    const row = this.sql.exec(
      `INSERT INTO idrate (pid, kind, hour, n) VALUES (?, ?, ?, 1)
       ON CONFLICT (pid, kind, hour) DO UPDATE SET n = n + 1 RETURNING n`, pid, kind, hour).one();
    return row.n <= limit;
  }

  modeKnown(mode) {
    if (this.sql.exec('SELECT 1 AS x FROM modes WHERE mode = ?', mode).toArray().length) return true;
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM modes').one().n;
    if (n >= LIMITS.maxModes) return false;
    this.sql.exec('INSERT OR IGNORE INTO modes (mode) VALUES (?)', mode);
    return true;
  }

  prune(now) {
    this.sql.exec('DELETE FROM runs WHERE started < ?', now - LIMITS.runTokenTtlMs);
    this.sql.exec("DELETE FROM scores WHERE bucket LIKE 'd%' AND bstart < ?", now - 15 * DAY);
    this.sql.exec("DELETE FROM scores WHERE bucket LIKE 'w%' AND bstart < ?", now - 70 * DAY);
    this.sql.exec('DELETE FROM idrate WHERE hour < ?', Math.floor(now / 3600_000) - 2);
  }

  // A run starts: hand out a single-use token tied to this player and mode.
  async run({ game, id, mode, ip }) {
    const cfg = gameConfig(game, this.env);
    if (!cfg) return { ok: false, error: 'unknown_game' };
    if (!this.ipMeter.hit('r' + ip, LIMITS.runsPerIpMin, 60_000)) return { ok: false, error: 'rate_limited' };
    if (!this.idLimit(id, 'run', LIMITS.runsPerIdHour)) return { ok: false, error: 'rate_limited' };
    const now = Date.now();
    const token = randomToken();
    this.sql.exec('INSERT INTO runs (token, pid, mode, started) VALUES (?, ?, ?, ?)', token, id, mode, now);
    if (Math.random() < 0.02) this.prune(now);
    return { ok: true, token, at: now };
  }

  check(cfg, score, elapsed) {
    if (typeof score !== 'number' || !Number.isFinite(score)) return 'bad_score';
    if (score < cfg.floor) return 'below_floor';
    if (score > cfg.ceiling) return 'over_ceiling';
    if (cfg.lower) {
      // A race time in seconds can never be shorter than the run itself took.
      if (cfg.timeUnit === 's' && score * 1000 > elapsed + 2_000) return 'faster_than_clock';
      if (elapsed < cfg.minRunMs) return 'run_too_short';
    } else if (elapsed < cfg.minRunMs && score > cfg.smallMax) {
      return 'run_too_short';
    }
    return null;
  }

  async submit({ game, id, mode, token, score, nick, ip }) {
    const cfg = gameConfig(game, this.env);
    if (!cfg) return { ok: false, error: 'unknown_game' };
    if (!this.ipMeter.hit('s' + ip, LIMITS.submitsPerIpMin, 60_000)) return { ok: false, error: 'rate_limited' };
    const rows = this.sql.exec('SELECT pid, mode, started FROM runs WHERE token = ?', token).toArray();
    if (!rows.length) return { ok: false, error: 'bad_token' };
    // Spent the moment it is shown, whatever happens next: one score per run.
    this.sql.exec('DELETE FROM runs WHERE token = ?', token);
    const run = rows[0];
    const now = Date.now();
    if (run.pid !== id || run.mode !== mode) return { ok: false, error: 'bad_token' };
    if (now - run.started > LIMITS.runTokenTtlMs) return { ok: false, error: 'token_expired' };
    const why = this.check(cfg, score, now - run.started);
    if (why) return { ok: false, error: why };
    if (!this.idLimit(id, 'sub', LIMITS.submitsPerIdHour)) return { ok: false, error: 'rate_limited' };
    if (!this.modeKnown(mode)) return { ok: false, error: 'too_many_modes' };
    const name = cleanNick(nick) || defaultNick(id);
    const b = buckets(now);
    const better = cfg.lower ? 'excluded.score < scores.score' : 'excluded.score > scores.score';
    const out = {};
    for (const period of ['all', 'week', 'day']) {
      const bk = b[period];
      const prev = this.sql.exec('SELECT score FROM scores WHERE mode = ? AND bucket = ? AND pid = ?', mode, bk.key, id).toArray();
      this.sql.exec(
        `INSERT INTO scores (mode, bucket, pid, nick, score, at, bstart) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (mode, bucket, pid) DO UPDATE SET nick = excluded.nick,
           at = CASE WHEN ${better} THEN excluded.at ELSE scores.at END,
           score = CASE WHEN ${better} THEN excluded.score ELSE scores.score END`,
        mode, bk.key, id, name, score, now, bk.start);
      const best = this.sql.exec('SELECT score FROM scores WHERE mode = ? AND bucket = ? AND pid = ?', mode, bk.key, id).one().score;
      out[period] = { best, rank: this.rankOf(cfg, mode, bk.key, best), improved: !prev.length || best !== prev[0].score };
    }
    if (Math.random() < 0.05) this.prune(now);
    return { ok: true, nick: name, periods: out };
  }

  rankOf(cfg, mode, bucket, score) {
    const op = cfg.lower ? '<' : '>';
    return 1 + this.sql.exec(`SELECT COUNT(*) AS n FROM scores WHERE mode = ? AND bucket = ? AND score ${op} ?`, mode, bucket, score).one().n;
  }

  async top({ game, mode, period, n, id }) {
    const cfg = gameConfig(game, this.env);
    if (!cfg) return { ok: false, error: 'unknown_game' };
    const bk = buckets(Date.now())[period];
    if (!bk) return { ok: false, error: 'bad_period' };
    const lim = Math.max(1, Math.min(LIMITS.topMax, n | 0 || 10));
    const order = cfg.lower ? 'ASC' : 'DESC';
    const rows = this.sql.exec(
      `SELECT pid, nick, score, at FROM scores WHERE mode = ? AND bucket = ? ORDER BY score ${order}, at ASC LIMIT ?`,
      mode, bk.key, lim).toArray();
    const top = rows.map((r, i) => ({ rank: i + 1, nick: r.nick, score: r.score, at: r.at, me: !!id && r.pid === id }));
    const total = this.sql.exec('SELECT COUNT(*) AS n FROM scores WHERE mode = ? AND bucket = ?', mode, bk.key).one().n;
    let me = null;
    if (id) {
      const mine = this.sql.exec('SELECT nick, score, at FROM scores WHERE mode = ? AND bucket = ? AND pid = ?', mode, bk.key, id).toArray();
      if (mine.length) me = { nick: mine[0].nick, score: mine[0].score, rank: this.rankOf(cfg, mode, bk.key, mine[0].score) };
    }
    return { ok: true, game, mode, period, lower: cfg.lower, total, top, me };
  }

  // A new nickname replaces the old one on every row this player holds here.
  async rename({ id, nick }) {
    const name = cleanNick(nick);
    if (!name) return { ok: false, error: 'bad_nick' };
    if (!this.idLimit(id, 'nick', 30)) return { ok: false, error: 'rate_limited' };
    this.sql.exec('UPDATE scores SET nick = ? WHERE pid = ?', name, id);
    return { ok: true, nick: name };
  }
}
