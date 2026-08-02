#!/usr/bin/env node
/**
 * sarvam-check — get started with the Sarvam AI APIs, and prove the Sarvam leg
 * of this repo's voice cascade actually works before it ships.
 *
 * The API key is read from SARVAM_API_KEY and is NEVER printed, logged, or
 * written to disk. Nothing secret is committed.
 *
 * Usage:
 *   SARVAM_API_KEY=sk_... node scripts/sarvam-check.mjs
 *   SARVAM_API_KEY=sk_... node scripts/sarvam-check.mjs --lang hi-IN
 *   SARVAM_API_KEY=sk_... node scripts/sarvam-check.mjs --speaker aditya
 *
 * It exercises three endpoints against api.sarvam.ai:
 *   1. GET  /text-to-speech   speakers — confirms the key is live
 *   2. POST /text-to-speech             — synthesizes with the EXACT body
 *                                         api/tts.js sends, so this verifies
 *                                         production and not a lookalike
 *   3. POST /speech-to-text             — transcribes your own voice sample
 *
 * ── On cloning ──────────────────────────────────────────────────────────────
 * Sarvam's REST API cannot speak in your cloned voice. `speaker` is a closed
 * enum of stock voices and there is no cloned-voice id field; voice cloning is
 * a Sarvam Studio (browser) feature. This script says so plainly at the end so
 * nobody wires Sarvam up expecting Anchit's voice. See SARVAM.md.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const key = process.env.SARVAM_API_KEY;
if (!key) {
  console.error('✗ SARVAM_API_KEY is not set. Get one at https://dashboard.sarvam.ai/ then run:');
  console.error('    SARVAM_API_KEY=sk_... node scripts/sarvam-check.mjs');
  process.exit(1);
}

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1] : fallback;
};

// Flags are applied to the environment BEFORE sarvamConfig() reads it, so an
// auditioned voice goes through exactly the same validation as a deployed one.
for (const [flag, env] of [['--lang', 'SARVAM_LANG'], ['--speaker', 'SARVAM_VOICE'], ['--model', 'SARVAM_MODEL']]) {
  const v = arg(flag, null);
  if (v) process.env[env] = v;
}

// Single-source the resolver from the endpoint itself, so this check can never
// drift from what production sends.
const require = createRequire(import.meta.url);
const { sarvamConfig, SARVAM_SPEAKERS, SARVAM_DEFAULT_SPEAKER } = require('../api/tts.js')._test;

const API = 'https://api.sarvam.ai';
const HEAD = { 'api-subscription-key': key, 'Content-Type': 'application/json' };

const c = sarvamConfig();
console.log(`→ Sarvam check — model=${c.model} speaker=${c.speaker} lang=${c.lang} codec=${c.codec} pace=${c.pace} rate=${c.rate}Hz\n`);

if (!c.knownSpeaker) {
  console.log(`  ! "${c.speaker}" is not a known ${c.model} speaker. Sending it anyway —`);
  console.log(`    api/tts.js retries with "${SARVAM_DEFAULT_SPEAKER[c.model]}" if Sarvam rejects it.\n`);
}

let failures = 0;

// ── 1. Text to speech ───────────────────────────────────────────────────────
// Byte-for-byte the body api/tts.js builds, so a pass here means the live
// endpoint passes too.
const line = "Hi, I'm Anchit. This is the Sarvam text to speech API speaking on my portfolio.";
const ttsBody = {
  text: line.slice(0, c.limit),
  target_language_code: c.lang,
  speaker: c.speaker,
  model: c.model,
  pace: c.pace,
  output_audio_codec: c.codec,
  speech_sample_rate: Number(c.rate),
};
if (c.v3) ttsBody.temperature = c.temperature;
else ttsBody.enable_preprocessing = true;

console.log('→ [1/3] POST /text-to-speech …');
try {
  const r = await fetch(`${API}/text-to-speech`, { method: 'POST', headers: HEAD, body: JSON.stringify(ttsBody) });
  if (!r.ok) {
    const why = await r.text();
    console.error(`✗ HTTP ${r.status}: ${why.slice(0, 400)}`);
    if (r.status === 401 || r.status === 403) console.error('  → the key is wrong, or your Sarvam plan does not include this model.');
    if (r.status === 429) console.error('  → rate limited / out of credits. api/tts.js treats this as "skip to next provider".');
    failures++;
  } else {
    const j = await r.json();
    const b64 = Array.isArray(j.audios) && j.audios[0];
    if (!b64) {
      console.error(`✗ 200 OK but no audio in response: ${JSON.stringify(j).slice(0, 300)}`);
      failures++;
    } else {
      const audio = Buffer.from(b64, 'base64');
      const out = `audio/sarvam-test.${c.codec === 'linear16' ? 'wav' : c.codec}`;
      await writeFile(out, audio);
      console.log(`✓ ${(audio.length / 1024).toFixed(0)} KB written to ${out} — play it.`);
      console.log('  This is a Sarvam STOCK voice. It is not you.\n');
    }
  }
} catch (e) {
  console.error(`✗ Request failed: ${e.message}`);
  failures++;
}

// ── 2. Speech to text ───────────────────────────────────────────────────────
// Transcribe Anchit's own sample. The sync endpoint is documented for clips
// under 30s and the sample is 30.7s, so trim it first — in pure JS, because
// requiring ffmpeg just to run a check is a bad trade.
function sliceWav(buf, maxSeconds) {
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let pos = 12, fmt = null, dataOff = 0, dataLen = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ' && size >= 16) {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        byteRate: buf.readUInt32LE(body + 8),
        blockAlign: buf.readUInt16LE(body + 12),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      dataOff = body;
      dataLen = Math.min(size, buf.length - body);
    }
    pos = body + size + (size % 2);   // chunks are word-aligned
  }
  if (!fmt || fmt.format !== 1 || !dataOff || !fmt.blockAlign) return null;   // PCM only
  const want = Math.min(dataLen, Math.floor((fmt.byteRate * maxSeconds) / fmt.blockAlign) * fmt.blockAlign);
  if (want <= 0) return null;

  const out = Buffer.alloc(44 + want);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + want, 4);
  out.write('WAVE', 8, 'ascii');
  out.write('fmt ', 12, 'ascii');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(fmt.channels, 22);
  out.writeUInt32LE(fmt.sampleRate, 24);
  out.writeUInt32LE(fmt.byteRate, 28);
  out.writeUInt16LE(fmt.blockAlign, 32);
  out.writeUInt16LE(fmt.bitsPerSample, 34);
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(want, 40);
  buf.copy(out, 44, dataOff, dataOff + want);
  return { buf: out, seconds: want / fmt.byteRate };
}

console.log('→ [2/3] POST /speech-to-text  (transcribing your own sample) …');
const samplePath = 'audio/anchit-xtts-sample.wav';
if (!existsSync(samplePath)) {
  console.log(`  – skipped: ${samplePath} not found.\n`);
} else {
  try {
    const raw = await readFile(samplePath);
    const clip = sliceWav(raw, 20);
    const payload = clip ? clip.buf : raw;
    if (clip) console.log(`  (trimmed to ${clip.seconds.toFixed(1)}s — the sync endpoint wants < 30s)`);

    const form = new FormData();
    form.append('file', new Blob([payload], { type: 'audio/wav' }), 'anchit.wav');
    form.append('model', 'saarika:v2.5');
    form.append('language_code', 'unknown');   // let Sarvam detect it

    // NOTE: no Content-Type here — FormData sets the multipart boundary itself.
    const r = await fetch(`${API}/speech-to-text`, {
      method: 'POST',
      headers: { 'api-subscription-key': key },
      body: form,
    });
    if (!r.ok) {
      const why = await r.text();
      console.error(`✗ HTTP ${r.status}: ${why.slice(0, 400)}`);
      failures++;
    } else {
      const j = await r.json();
      console.log(`✓ transcript: "${(j.transcript || '').slice(0, 200)}"`);
      if (j.language_code) console.log(`  detected language: ${j.language_code}${j.language_probability ? ` (p=${j.language_probability})` : ''}`);
      console.log('');
    }
  } catch (e) {
    console.error(`✗ Request failed: ${e.message}`);
    failures++;
  }
}

// ── 3. Translate ────────────────────────────────────────────────────────────
console.log('→ [3/3] POST /translate …');
try {
  const r = await fetch(`${API}/translate`, {
    method: 'POST',
    headers: HEAD,
    body: JSON.stringify({
      input: 'I build lifecycle systems for D2C brands.',
      source_language_code: 'en-IN',
      target_language_code: 'hi-IN',
      model: 'mayura:v1',
    }),
  });
  if (!r.ok) {
    const why = await r.text();
    console.log(`  – translate unavailable on this key (HTTP ${r.status}): ${why.slice(0, 200)}`);
    console.log('    Not fatal — the portfolio does not depend on it.\n');
  } else {
    const j = await r.json();
    console.log(`✓ hi-IN: "${(j.translated_text || '').slice(0, 200)}"\n`);
  }
} catch (e) {
  console.log(`  – translate skipped: ${e.message}\n`);
}

// ── Verdict ─────────────────────────────────────────────────────────────────
console.log('─'.repeat(70));
if (failures) {
  console.error(`✗ ${failures} check(s) failed. api/tts.js will skip Sarvam and fall through.`);
} else {
  console.log('✓ Sarvam is wired correctly.');
}
console.log(`
About your cloned voice — read this before wiring Sarvam up as "your" voice:

  Sarvam's REST API CANNOT speak in your cloned voice. The 'speaker' parameter
  accepts only stock voices (${SARVAM_SPEAKERS['bulbul:v3'].size} on bulbul:v3, ${SARVAM_SPEAKERS['bulbul:v2'].size} on bulbul:v2) and the API
  has no cloned-voice id field at all. Cloning is a Sarvam Studio browser
  feature; the clone stays inside Studio.

  So in api/tts.js, Sarvam runs LAST — after ElevenLabs, Cartesia, Fish,
  Hugging Face and your self-hosted XTTS, all of which can be genuinely you.
  Sarvam is the safety net and the Indic/code-mixed voice, not the clone.

  To hear your actual voice on the site, configure one of those instead:
      node scripts/elevenlabs-clone.mjs        (clones audio/anchit-xtts-sample.wav)
      npm run tts:serve                        (self-hosted XTTS, free forever)

  Check what the deployed site is doing:
      curl -s https://anchit-tandon.com/api/tts | jq
      # want: "clonedVoiceReady": true
`);
process.exit(failures ? 1 : 0);
