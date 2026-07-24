#!/usr/bin/env node
/**
 * elevenlabs-clone — create an ElevenLabs instant voice clone from your own
 * recording in this repo, and print the resulting voice_id.
 *
 * The API key is read from the ELEVENLABS_API_KEY environment variable and is
 * NEVER printed, logged, or written to disk. Nothing secret is committed.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... node scripts/elevenlabs-clone.mjs
 *   ELEVENLABS_API_KEY=sk_... node scripts/elevenlabs-clone.mjs audio/anchit.m4a "Anchit Tandon"
 *
 * Then set BOTH of these in your Vercel project (Settings → Environment
 * Variables) and redeploy — api/tts.js uses ElevenLabs first in its cascade:
 *   ELEVENLABS_API_KEY = <your key>
 *   ELEVENLABS_VOICE_ID = <the voice_id printed below>
 *
 * Note: instant voice cloning requires an ElevenLabs plan that includes IVC
 * (Starter or above). On the free tier the API returns 401/403 with a
 * can_not_use_instant_voice_cloning message — upgrade, then re-run.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('✗ ELEVENLABS_API_KEY is not set. Run:\n  ELEVENLABS_API_KEY=sk_... node scripts/elevenlabs-clone.mjs');
  process.exit(1);
}

const file = process.argv[2] || 'audio/anchit-xtts-sample.wav';
const name = process.argv[3] || 'Anchit Tandon';
if (!existsSync(file)) { console.error(`✗ Recording not found: ${file}`); process.exit(1); }

const typeFor = (f) => f.endsWith('.m4a') ? 'audio/mp4'
  : f.endsWith('.mp3') ? 'audio/mpeg'
  : f.endsWith('.ogg') ? 'audio/ogg'
  : f.endsWith('.webm') ? 'audio/webm'
  : 'audio/wav';

const buf = await readFile(file);
const form = new FormData();
form.append('name', name);
form.append('description', `Cloned voice of ${name} for anchit-tandon.com narration and the AI avatar.`);
form.append('remove_background_noise', 'true');
form.append('files', new Blob([buf], { type: typeFor(file) }), basename(file));

console.log(`→ Uploading ${file} (${(buf.length / 1024).toFixed(0)} KB) to ElevenLabs as "${name}"…`);
const r = await fetch('https://api.elevenlabs.io/v1/voices/add', {
  method: 'POST',
  headers: { 'xi-api-key': key },   // key only in the request header, never logged
  body: form,
});
const text = await r.text();
if (!r.ok) {
  console.error(`✗ ElevenLabs returned ${r.status}. Response:\n${text}`);
  process.exit(1);
}
let voiceId = '';
try { voiceId = JSON.parse(text).voice_id || ''; } catch {}
if (!voiceId) { console.error(`✗ No voice_id in response:\n${text}`); process.exit(1); }

console.log('\n✓ Voice clone created.');
console.log(`  ELEVENLABS_VOICE_ID = ${voiceId}`);
console.log('\nNext: add ELEVENLABS_API_KEY and the ELEVENLABS_VOICE_ID above to your');
console.log('Vercel env vars and redeploy. Verify with:  GET /api/tts?debug=1');
