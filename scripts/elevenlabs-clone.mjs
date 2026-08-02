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
 *   ELEVENLABS_API_KEY=sk_... node scripts/elevenlabs-clone.mjs --push
 *   ELEVENLABS_API_KEY=sk_... node scripts/elevenlabs-clone.mjs audio/anchit.m4a "Anchit Tandon"
 *
 * It clones the voice, proves the clone can actually speak, and with --push
 * writes both variables into Vercel for you (requires `vercel login` + `link`).
 * Without --push, set these two by hand and redeploy — api/tts.js tries
 * ElevenLabs first in its cascade:
 *   ELEVENLABS_API_KEY = <your key>
 *   ELEVENLABS_VOICE_ID = <the voice_id printed below>
 *
 * Note: instant voice cloning requires an ElevenLabs plan that includes IVC
 * (Starter or above). On the free tier the API returns 401/403 with a
 * can_not_use_instant_voice_cloning message — upgrade, then re-run.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';

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

// Prove the clone actually speaks before anyone wires it into the site — a
// created voice is not the same as a working one (quota and plan limits only
// surface at synthesis time).
console.log('\n→ Verifying the clone by synthesizing a test line…');
const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const probe = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voiceId), {
  method: 'POST',
  headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
  body: JSON.stringify({
    text: "Hi, I'm Anchit. This is my cloned voice speaking on my portfolio.",
    model_id: model,
    voice_settings: { stability: 0.4, similarity_boost: 0.85 },   // same settings api/tts.js uses
  }),
});
if (probe.ok) {
  const audio = Buffer.from(await probe.arrayBuffer());
  const out = 'audio/clone-test.mp3';
  await writeFile(out, audio);
  console.log(`✓ Clone speaks — ${(audio.length / 1024).toFixed(0)} KB written to ${out}.`);
  console.log('  Play it to confirm it sounds like you before wiring it up.');
} else {
  const why = await probe.text();
  console.error(`✗ The voice was created but will not synthesize (HTTP ${probe.status}):\n${why}`);
  console.error('  Instant voice cloning needs a Starter plan or above. api/tts.js will');
  console.error('  skip ElevenLabs and fall through to the next provider until this works.');
  process.exit(1);
}

// With --push, finish the job: write both vars straight into Vercel so there is
// no copy-paste step between creating the voice and the site actually using it.
// Values go over stdin, never argv, so they never appear in a process list.
if (process.argv.includes('--push')) {
  const vercelEnv = (name, value) => new Promise((resolve) => {
    const targets = ['production', 'preview', 'development'];
    let done = 0, ok = 0;
    for (const t of targets) {
      // Drop any existing value first; `env add` will not overwrite.
      spawnSync('npx', ['--yes', 'vercel@latest', 'env', 'rm', name, t, '-y'], { stdio: 'ignore' });
      const r = spawnSync('npx', ['--yes', 'vercel@latest', 'env', 'add', name, t], {
        input: value, encoding: 'utf8', stdio: ['pipe', 'ignore', 'ignore'],
      });
      done++; if (r.status === 0) { ok++; console.log(`  ✓ ${name} → ${t}`); }
      else console.log(`  ✗ ${name} → ${t} (failed)`);
      if (done === targets.length) resolve(ok === targets.length);
    }
  });

  console.log('\n→ Writing the voice into Vercel…');
  const a = await vercelEnv('ELEVENLABS_API_KEY', key);
  const b = await vercelEnv('ELEVENLABS_VOICE_ID', voiceId);
  if (a && b) {
    console.log('\n✓ Both variables set. Redeploy for them to take effect:');
    console.log('    npx vercel --prod');
    console.log('  Then confirm:  curl -s https://anchit-tandon.com/api/tts');
    console.log('  You want  "configured": { "elevenlabs": true, ... }');
  } else {
    console.error('\n✗ Could not write to Vercel. Are you logged in and linked?');
    console.error('    npx vercel login && npx vercel link');
    console.error(`  Or set them by hand — ELEVENLABS_VOICE_ID = ${voiceId}`);
    process.exit(1);
  }
} else {
  console.log('\nNext: add ELEVENLABS_API_KEY and the ELEVENLABS_VOICE_ID above to your');
  console.log('Vercel env vars and redeploy — or re-run this with --push to do both');
  console.log('automatically. Verify with:  curl -s https://anchit-tandon.com/api/tts');
}
