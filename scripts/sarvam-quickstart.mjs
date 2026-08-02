#!/usr/bin/env node
// sarvam-quickstart.mjs — prove out the Sarvam APIs end to end in one run.
//
// Does three things, in order, and keeps going if one fails:
//   1. Text to Speech  — synthesises a line with Bulbul and writes a playable file
//   2. Speech to Text  — transcribes your own recording with Saaras
//   3. Translate       — round-trips a line into Hindi
//
// It reads the SAME resolved settings api/tts.js uses, so whatever this script
// produces is exactly what the live site will produce.
//
//   SARVAM_API_KEY=… node scripts/sarvam-quickstart.mjs
//   SARVAM_API_KEY=… node scripts/sarvam-quickstart.mjs --lang hi-IN --speaker ritu
//   SARVAM_API_KEY=… node scripts/sarvam-quickstart.mjs --text "Custom line" --out /tmp/x.wav
//   SARVAM_API_KEY=… node scripts/sarvam-quickstart.mjs --stt audio/anchit.m4a
//
// Get a key at https://dashboard.sarvam.ai — the dashboard shows its value ONCE,
// at creation. The key is read from the environment and never printed here.
//
// ON VOICE CLONING — read this before trying to wire your own voice in:
// Sarvam's TTS `speaker` field is a closed enum of preset voices. There is no
// custom-voice field, so a cloned voice cannot be addressed over this API.
// Sarvam's cloning lives in Creative Studio (dashboard.sarvam.ai), is created by
// recording ~10s live in the browser (no file upload), and the resulting voice
// is reachable from Studio TTS and Dubbing only. Anchit's cloned voice therefore
// runs on ElevenLabs — see scripts/elevenlabs-clone.mjs.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Single source of truth: the same resolver the serverless function uses, so
// this script can't drift from production behaviour.
const { sarvamConfig, SARVAM_LANGS, SARVAM_V3_SPEAKERS, SARVAM_V2_SPEAKERS } =
  require(path.join(ROOT, 'api/tts.js'))._test;

const BASE = 'https://api.sarvam.ai';

// ── args ────────────────────────────────────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
}

// Overrides are applied to the environment BEFORE sarvamConfig() reads it, so
// --lang / --speaker go through the same validation as the deployed settings.
for (const [flag, env] of [['lang', 'SARVAM_LANG'], ['speaker', 'SARVAM_VOICE'], ['model', 'SARVAM_MODEL']]) {
  const v = arg(flag, null);
  if (v) process.env[env] = v;
}

const KEY = (process.env.SARVAM_API_KEY || '').trim();
const HEAD = { 'api-subscription-key': KEY };

const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const bad = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// Sarvam returns a structured { error: { code, message } } body on failure;
// surfacing code + message turns a bare "400" into something actionable.
async function explain(r) {
  const body = await r.text().catch(() => '');
  try {
    const e = JSON.parse(body).error;
    if (e) return `${r.status} ${e.code || ''} — ${e.message || ''}`.trim();
  } catch {}
  return `${r.status} ${body.slice(0, 200)}`;
}

// ── 1. Text to Speech ───────────────────────────────────────────────────────
async function tts() {
  const c = sarvamConfig();
  const text = arg('text', 'Hi, this is a Sarvam voice test for the Anchit Tandon portfolio.');
  const out = arg('out', path.join(ROOT, `sarvam-sample.${c.codec === 'linear16' ? 'wav' : c.codec}`));

  console.log(`\n① Text to Speech  ${dim(`${c.model} · ${c.speaker} · ${c.language} · ${c.codec}`)}`);
  if (text.length > c.limit) console.log(dim(`   text is ${text.length} chars; ${c.model} caps at ${c.limit} — it will be truncated`));

  const body = {
    text: text.slice(0, c.limit),
    language_code: c.language,
    speaker: c.speaker,
    model: c.model,
    pace: c.pace,
    output_audio_codec: c.codec,
    speech_sample_rate: c.sampleRate,
  };
  if (c.v3) body.temperature = c.temperature; else body.enable_preprocessing = true;

  const r = await fetch(`${BASE}/text-to-speech`, {
    method: 'POST',
    headers: { ...HEAD, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) { console.log(bad(`   ✗ ${await explain(r)}`)); return false; }

  const j = await r.json();
  const b64 = Array.isArray(j.audios) && j.audios[0];
  if (!b64) { console.log(bad('   ✗ response carried no audio')); return false; }

  const buf = Buffer.from(b64, 'base64');
  await writeFile(out, buf);
  console.log(ok(`   ✓ ${(buf.length / 1024).toFixed(0)} KB → ${out}`));
  console.log(dim(`     request_id ${j.request_id || 'n/a'}`));
  return true;
}

// ── 2. Speech to Text ───────────────────────────────────────────────────────
// Saaras takes multipart, not JSON. `unknown` lets it auto-detect the language,
// which is the right default for code-mixed Indian English.
async function stt() {
  const rel = arg('stt', 'audio/anchit.m4a');
  const file = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  console.log(`\n② Speech to Text  ${dim(`saaras:v3 · ${rel}`)}`);
  if (!existsSync(file)) { console.log(dim(`   – skipped, no file at ${file}`)); return null; }

  const form = new FormData();
  form.append('file', new Blob([await readFile(file)]), path.basename(file));
  form.append('model', 'saaras:v3');
  form.append('language_code', 'unknown');

  const r = await fetch(`${BASE}/speech-to-text`, { method: 'POST', headers: HEAD, body: form });
  if (!r.ok) { console.log(bad(`   ✗ ${await explain(r)}`)); return false; }

  const j = await r.json();
  const said = (j.transcript || '').trim();
  console.log(ok(`   ✓ detected ${j.language_code || 'n/a'}`));
  console.log(`     "${said.slice(0, 300)}${said.length > 300 ? '…' : ''}"`);
  return true;
}

// ── 3. Translate ────────────────────────────────────────────────────────────
async function translate() {
  const input = arg('translate', 'I build products, scale growth, and create leverage.');
  console.log(`\n③ Translate  ${dim('en → hi-IN')}`);
  const r = await fetch(`${BASE}/translate`, {
    method: 'POST',
    headers: { ...HEAD, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input, source_language_code: 'auto', target_language_code: 'hi-IN', speaker_gender: 'Male',
    }),
  });
  if (!r.ok) { console.log(bad(`   ✗ ${await explain(r)}`)); return false; }
  const j = await r.json();
  console.log(ok(`   ✓ ${j.translated_text || ''}`));
  return true;
}

// ── run ─────────────────────────────────────────────────────────────────────
if (!KEY) {
  console.error(bad('SARVAM_API_KEY is not set.'));
  console.error('  Create one at https://dashboard.sarvam.ai (its value is shown only once), then:');
  console.error('  SARVAM_API_KEY=… node scripts/sarvam-quickstart.mjs');
  process.exit(1);
}

const cfg = sarvamConfig();
console.log('Sarvam quickstart');
console.log(dim(`  resolved: model=${cfg.model} speaker=${cfg.speaker} language=${cfg.language} ` +
                `codec=${cfg.codec} pace=${cfg.pace} rate=${cfg.sampleRate}Hz`));
console.log(dim(`  ${cfg.v3 ? SARVAM_V3_SPEAKERS.size : SARVAM_V2_SPEAKERS.size} preset voices available for ${cfg.model}; ` +
                `${SARVAM_LANGS.size} TTS languages`));

const results = [await tts(), await stt(), await translate()];

console.log('\n' + dim('─'.repeat(64)));
const failed = results.filter((r) => r === false).length;
if (failed === 0) {
  console.log(ok('All calls succeeded. Set SARVAM_API_KEY in Vercel and /api/tts will use Sarvam.'));
  console.log(dim('  bash scripts/setup-env.sh   # then redeploy'));
} else {
  console.log(bad(`${failed} call(s) failed — see the error codes above.`));
  console.log(dim('  invalid_api_key_error → wrong/rotated key · insufficient_quota_error → out of credits'));
}
console.log(dim('Cloned voice: not available over Sarvam\'s API (preset speakers only).'));
console.log(dim('  Anchit\'s clone runs on ElevenLabs → scripts/elevenlabs-clone.mjs'));
process.exit(failed ? 1 : 0);
