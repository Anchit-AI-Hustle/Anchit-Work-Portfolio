// Keep every published game and every quality gate in sync.
// Run before the expensive browser tests so a missing game cannot disappear
// from coverage unnoticed.
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const hub = read('games/index.html');
const games = [...hub.matchAll(/<article\b[^>]*\bdata-slug="([a-z0-9-]+)"/g)].map((m) => m[1]);
assert.equal(games.length, 24, 'The hub must list all 24 playable games');
assert.equal(new Set(games).size, games.length, 'Game slugs must be unique');
assert.match(hub, /Twenty-four original browser games:/, 'The metadata must report the correct number of games');
assert.match(hub, /Twenty-four games I built/, 'The introductory copy must report the correct number of games');

for (const slug of games) {
  const base = path.join('games', slug);
  const html = read(path.join(base, 'index.html'));
  for (const file of ['game.js', 'game3d.js', 'index.html']) {
    assert.ok(fs.existsSync(path.join(ROOT, base, file)), slug + ': missing ' + file);
  }
  assert.ok(html.includes('/games/shared/arcade.js'), slug + ': shared input/shell missing');
  assert.ok(html.includes('/games/' + slug + '/game.js'), slug + ': no 2D fallback loader');
  assert.ok(html.includes('/games/' + slug + '/game3d.js'), slug + ': no 3D game loader');
  assert.ok(hub.includes('href="/games/' + slug + '"'), slug + ': not linked from hub');
}

for (const filename of ['scripts/games-check.js', 'scripts/perf-budget.js', 'scripts/games-posters.js']) {
  const src = read(filename);
  const match = src.match(/const (?:ALL_GAMES|GAMES) = \[([^\]]+)\]/);
  assert.ok(match, filename + ': static game coverage list not found');
  const actual = [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
  assert.deepEqual(actual, games, filename + ': game coverage differs from the live hub');
}
console.log('PASS game catalog: all ' + games.length + ' games and 2D/3D entry points match every automated check.');
