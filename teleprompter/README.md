# Prompter Cam (teleprompter platform)

Live at **https://teleprompter.anchit-tandon.com** (Vercel project `anchit-teleprompter`).

This folder is a separate Vercel project. It is **not** part of the portfolio build: `scripts/build-www.mjs` only copies whitelisted pages and folders into `www/`, and this folder is not on that list.

## What it does

- Anyone can sign up and sign in with a **mobile number + 4-digit PIN**. There is no OTP, so a one-time **recovery code** is shown at sign-up and is the only way to reset a forgotten PIN.
- Each person keeps their own **scripts** (title, text, per-script settings), **default settings** and up to 12 uploaded **background images**.
- **Studio**: scrolling teleprompter with speed (WPM), text size, font, weight, line spacing, line width, alignment, colours, ALL CAPS, reading-line position, focus fade, mirror text, countdown, auto-scroll on record, and two layouts (text plus a small preview, or text over the camera).
- **Virtual backgrounds** run on the device with MediaPipe's selfie segmenter: blur, solid colour, six built-in backdrops, or an uploaded image.
- **Recording**: 16:9, 9:16, 1:1 or 4:5 at 720p, 1080p or 4K and 24, 30 or 60 fps. Takes stay in the browser until they are downloaded, so no video is uploaded anywhere.
- Script syntax: `# Heading` becomes a gold section cue, `**word**` is emphasised, and `[pause]` shows a pause marker.

## Layout

```
api/main.js          single serverless function, routed by vercel.json (/api/* -> /api/main?route=*)
api/_lib/auth.js     PIN hashing (HMAC pepper + scrypt), signed session cookie, throttling
api/_lib/db.js       Neon serverless (HTTP) driver
db/schema.sql        tables: users, scripts, backgrounds, throttle
public/              static app (index.html, app.js, legacy.js, models/selfie_segmenter.tflite)
tests/               API acceptance tests, Playwright end-to-end tests, local dev server
```

## Data and environment

- Database: Neon store `store_fg5hZ6hZ2994Kg2A`, in its own database **`prompter`** owned by its own role **`prompter_app`**. It does not share tables with any other app.
- Vercel environment variables (all Sensitive): `DATABASE_URL` (pooled), `SESSION_SECRET` (signs session cookies) and `PIN_PEPPER` (pepper for PIN and recovery-code hashes; **never rotate it without a migration**, or every PIN stops working).
- Security: 5 wrong PINs lock the account for 15 minutes. Attempts are counted atomically, so parallel requests cannot get around the limit, and the same lock applies to signed-in PIN actions. There are per-IP limits on sign-up, login and reset, plus a per-number limit on reset. Writes require an `x-pc: 1` header as CSRF protection. Every query is scoped to the signed-in user.

## Deploy

From this folder: `vercel link --project anchit-teleprompter` (once), then `vercel deploy --prod`.

## Test

```
npm i
node --env-file=.env tests/server.mjs            # local server on :8787 (needs the 3 env vars above)
node tests/api.test.mjs [baseUrl]                # 52 API checks (+8 lockout regressions when PC_DB_URL is set)
node tests/e2e.mjs [baseUrl]                     # Playwright, fake camera, 390 / 820 / 1440 px
```

Sensitive Vercel variables cannot be pulled back with `vercel env pull`, so for local runs set them by hand.
