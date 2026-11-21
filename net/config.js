// Online layer settings: one entry per game that may post to a global board
// or open a room. A slug that is not listed here is refused, so nobody can
// make the server create storage for a game that does not exist.
//
//   ceiling   highest score the game can plausibly reach in one run
//   floor     lowest believable score (for lower-is-better boards: the
//             fastest believable time, in the game's own unit)
//   minRunMs  a run shorter than this may only post a small score
//   smallMax  the most a run under minRunMs may post
//   lower     true when a smaller score is better (a race time)
//   timeUnit  for lower boards: the score is seconds, so a posted time can
//             never be shorter than the wall clock since the run started
//   rooms     live multiplayer allowed (flagship games)
//   maxPlayers the most players one room may hold
//   modes     the game's menu modes (arc.choices.mode); a board accepts only these and 'all'.
//             scripts/games-check.js fails when a game's menu offers a mode missing here.
const BASE = { ceiling: 5_000_000, floor: 0, minRunMs: 8_000, smallMax: 500, lower: false, rooms: false, maxPlayers: 8 };

const GAMES = {
  'akash-raiders': { modes: ['arcade', 'blitz'] },
  'board-strike': { modes: ['clock', 'clear', 'practice'] },
  'chhat-hopper': { modes: ['adventure', 'single', 'speed'] },
  'court-lights': { modes: ['quick', 'season', 'three', 'dunk', 'roof', 'practice'] },
  'diya-breaker': { modes: ['story', 'endless', 'boss'] },
  'fare-run': { modes: ['bazaar', 'night', 'rush'] },
  'ghat-riders': { ceiling: 50_000_000, modes: ['career', 'quick', 'grudge', 'time', 'practice'] },
  'gully-champs': { modes: ['last', 'chase', 'sunday'] },
  'kart-mela': { rooms: true, maxPlayers: 8, ceiling: 50_000_000, modes: ['gp', 'vs', 'time', 'battle', 'school', 'race'] },
  'laddoo-dash': { modes: ['classic', 'rush'] },
  'mela-pinball': { ceiling: 2_000_000_000, modes: ['classic', 'rush', 'free'] },
  'midnight-apex': { lower: true, timeUnit: 's', floor: 15, ceiling: 7_200, minRunMs: 15_000, rooms: true, modes: ['career', 'race', 'sprint', 'drift', 'drag', 'time', 'pursuit'] },
  'nitro-goal': { rooms: true, maxPlayers: 8, modes: ['quick', 'season', 'hoops', 'puck', 'training', '3v3', '2v2', '1v1'] },
  'paint-ops': { rooms: true, maxPlayers: 12, modes: ['splat', 'ctf', 'campaign'] },
  'rally-cage': { modes: ['lives', 'eleven', 'survival'] },
  'rangoli-drop': { ceiling: 100_000_000, modes: ['marathon', 'sprint', 'blitz'] },
  'ring-rajas': { modes: ['exhibition', 'career', 'practice'] },
  'saffron-city': { ceiling: 2_000_000_000, modes: ['free', 'hustle'] },
  'sultan-bay': { ceiling: 2_000_000_000, modes: ['story', 'free', 'hustle', 'school'] },
  'sky-thread': { modes: ['dusk', 'hunt', 'endless'] },
  'super-over': { modes: ['super', 'chase', 'nets'] },
  'tiffin-dash': { modes: ['street', 'shift', 'rush'] },
  'turf-kings': { rooms: true, maxPlayers: 12, modes: ['friendly', 'league', 'cup', 'pens', 'training'] },
  'yard-catch': { modes: ['load', 'shift', 'clean'] },
  'last-ridge': { rooms: true, maxPlayers: 12, ceiling: 10_000_000, modes: ['campaign', 'mp', 'range'] },
};

export function gameConfig(slug, env) {
  if (typeof slug !== 'string' || !Object.prototype.hasOwnProperty.call(GAMES, slug)) return null;
  const c = Object.assign({ slug }, BASE, GAMES[slug]);
  c.modes = ['all'].concat(GAMES[slug].modes || []);
  // Local tests only (wrangler dev --var NET_MIN_RUN_MS:...): shorten the wait. Never set in production.
  if (env && env.NET_MIN_RUN_MS) c.minRunMs = Math.min(c.minRunMs, +env.NET_MIN_RUN_MS || c.minRunMs);
  return c;
}

export const GAME_SLUGS = Object.keys(GAMES);
export const modeAllowed = (cfg, mode) => !!cfg && typeof mode === 'string' && cfg.modes.includes(mode);

// Room timers can be shortened for local tests the same way (NET_GRACE_MS,
// NET_EMPTY_MS); production uses the values below.
export function roomTimers(env) {
  return {
    graceMs: env && +env.NET_GRACE_MS ? +env.NET_GRACE_MS : LIMITS.graceMs,
    emptyCloseMs: env && +env.NET_EMPTY_MS ? +env.NET_EMPTY_MS : LIMITS.emptyCloseMs,
  };
}

export const LIMITS = {
  tickMs: 50,            // a room relays at 20 Hz while anyone is sending
  minTickMs: 33,
  maxTickMs: 200,
  msgBytes: 8_192,       // one incoming frame
  msgPerSec: 40,         // per socket; more is dropped, far more closes it
  graceMs: 20_000,       // a dropped player keeps their seat this long
  emptyCloseMs: 30_000,  // an empty room closes after this
  roomLifeMs: 3 * 3600_000,
  maxMatchMs: 60 * 60_000,
  scoreKeys: 24,
  runTokenTtlMs: 6 * 3600_000,
  runsPerIdHour: 120,
  submitsPerIdHour: 60,
  submitsPerIpMin: 30,
  runsPerIpMin: 60,
  topMax: 50,
};
