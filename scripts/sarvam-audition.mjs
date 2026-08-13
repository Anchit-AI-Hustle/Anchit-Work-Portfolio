#!/usr/bin/env node
/**
 * sarvam-audition — render the SAME line in every plausible Sarvam voice so you
 * can pick the one closest to Anchit in a single sitting.
 *
 * Why this exists: Sarvam's REST API cannot speak in a cloned voice. `speaker`
 * is a closed enum of stock voices (see scripts/sarvam-check.mjs and SARVAM.md),
 * so the best available outcome is choosing the nearest stock voice rather than
 * cloning. The site currently uses "shubh" simply because it is the default —
 * not because anyone compared it against the alternatives.
 *
 * The key is read from SARVAM_API_KEY and is never printed, logged or written
 * to disk. Output files contain audio only.
 *
 * Usage:
 *   SARVAM_API_KEY=sk_... node scripts/sarvam-audition.mjs
 *   SARVAM_API_KEY=sk_... node scripts/sarvam-audition.mjs --all
 *   SARVAM_API_KEY=sk_... node scripts/sarvam-audition.mjs --text "Say this instead"
 *
 * Writes audio/audition/<speaker>.wav. Listen, pick one, then set it live:
 *   SARVAM_VOICE=<speaker>   (via scripts/setup-env.sh, or the Vercel dashboard)
 */
import { mkdir, writeFile } from 'node:fs/promises';

const key = process.env.SARVAM_API_KEY;
if (!key) {
  console.error('✗ SARVAM_API_KEY is not set. Run:');
  console.error('    SARVAM_API_KEY=sk_... node scripts/sarvam-audition.mjs');
  process.exit(1);
}

// Male voices on bulbul:v3 — the plausible shortlist for a male speaker. --all
// renders every voice on the model if you want to hear the full set.
const MALE = ['shubh', 'aditya', 'rahul', 'rohan', 'amit', 'dev', 'ratan', 'varun',
  'manan', 'sumit', 'kabir', 'aayan', 'ashutosh', 'advait', 'anand', 'tarun',
  'sunny', 'mani', 'gokul', 'vijay', 'mohit', 'rehan', 'soham'];
const ALL = MALE.concat(['ritu', 'priya', 'neha', 'pooja', 'simran', 'kavya', 'ishita',
  'shreya', 'roopa', 'tanya', 'shruti', 'suhani', 'kavitha', 'rupali']);

const args = process.argv.slice(2);
const speakers = args.includes('--all') ? ALL : MALE;
const ti = args.indexOf('--text');
// A line with the site's own cadence and vocabulary, so the comparison is fair.
const text = ti > -1 && args[ti + 1]
  ? args[ti + 1]
  : "Hey, I'm Anchit Tandon. I scaled assisted sales five times, from fifteen lakh " +
    "to eighty lakh rupees a month. I build systems, then measure them.";

await mkdir('audio/audition', { recursive: true });
console.log(`→ Rendering ${speakers.length} voices into audio/audition/ …\n`);

let ok = 0, failed = [];
for (const speaker of speakers) {
  try {
    const r = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        target_language_code: process.env.SARVAM_LANG || 'en-IN',
        speaker,
        model: process.env.SARVAM_MODEL || 'bulbul:v3',
        speech_sample_rate: 24000,
        output_audio_codec: 'wav',
      }),
    });
    if (!r.ok) { failed.push(`${speaker} (HTTP ${r.status})`); continue; }
    const j = await r.json();
    const b64 = (j.audios && j.audios[0]) || j.audio;
    if (!b64) { failed.push(`${speaker} (no audio in response)`); continue; }
    await writeFile(`audio/audition/${speaker}.wav`, Buffer.from(b64, 'base64'));
    console.log(`  ✓ ${speaker}`);
    ok++;
  } catch (e) {
    failed.push(`${speaker} (${e.message})`);
  }
}

console.log(`\n${ok} rendered, ${failed.length} failed${failed.length ? ': ' + failed.slice(0, 5).join(', ') : ''}`);
if (ok) {
  console.log('\nListen through them, then set the winner live:');
  console.log('    SARVAM_VOICE=<speaker>');
  console.log('  via scripts/setup-env.sh, or the Vercel dashboard, then redeploy.');
  console.log('\nTo audition one against the LIVE site without redeploying:');
  console.log('    curl -s -X POST https://anchit-tandon.com/api/tts \\');
  console.log('      -H "content-type: application/json" \\');
  console.log('      -d \'{"text":"test line","speaker":"aditya"}\' --output test.wav');
}
