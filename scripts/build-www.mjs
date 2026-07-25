#!/usr/bin/env node
/**
 * Build step for Capacitor/Vercel: mirror static web assets into ./www,
 * compile the standalone How-To Engine into /how-to-2, and attach the shared
 * App Skill Map plus Project SkillTree & Guide Library to every HTML app.
 */
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WWW = join(ROOT, 'www');
const HOW_TO_ROUTE = 'how-to-2';
const HOW_TO_PATH = `/${HOW_TO_ROUTE}`;
const APP_SKILL_MAP_MARKER = 'data-app-skill-map';
const PROJECT_PLAYBOOK_MARKER = 'data-project-playbooks';
const APP_SKILL_MAP_TAGS = [
  `  <link rel="stylesheet" href="/assets/app-skill-map.css" ${APP_SKILL_MAP_MARKER}="styles">`,
  `  <script defer src="/assets/app-skill-map.js" ${APP_SKILL_MAP_MARKER}="runtime"></script>`,
].join('\n');
const PROJECT_PLAYBOOK_TAGS = [
  `  <link rel="stylesheet" href="/assets/project-playbooks.css" ${PROJECT_PLAYBOOK_MARKER}="styles">`,
  `  <script defer src="/assets/project-playbooks.js" ${PROJECT_PLAYBOOK_MARKER}="runtime"></script>`,
].join('\n');

const assets = [
  'index.html',
  'jobhunt.html',
  'task-tracker.html',
  'd2c-lifecycle-os.html',
  'lifecycle-os.html',
  'lifecycle-os-studio.html',
  'lifecycle-os-analysis.html',
  'lifecycle-os-calendar.html',
  'lifecycle-os-intel.html',
  'lifecycle-os-brain.html',
  'lifecycle-os-playbook.html',
  'lifecycle-os-landing.html',
  'lifecycle-os-connectors.html',
  'lifecycle-os-social.html',
  'lifecycle-os-ads.html',
  'lifecycle-os-creative.html',
  'lifecycle-os-cohorts.html',
  'lifecycle-os-ask.html',
  'lifecycle-os-music.html',
  'lifecycle-os-audit.html',
  'lifecycle-os-frameworks.html',
  'lifecycle-os-kit.css',
  'lifecycle-os-kit.js',
  'agent.html',
  'manifest.json',
  'sw.js',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'AnchitTandon-AppLogo.png',
  'icons',
  'assets',
  'audio',
  'cyber',
];

async function copyEntry(src, dest) {
  const s = await stat(src);
  if (!s.isDirectory()) {
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    return;
  }

  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    await copyEntry(join(src, entry.name), join(dest, entry.name));
  }
}

// The source portfolio shell is intentionally a single large HTML document.
// Patch only the generated www copy so the live Side Hustle card points at the
// canonical route without making the root shell build fragile.
async function patchHowToCardRoute() {
  const target = join(WWW, 'index.html');
  if (!existsSync(target)) return;
  const before = await readFile(target, 'utf8');
  const after = before.replace(/href="\/how-to(?:-1)?"/g, `href="${HOW_TO_PATH}"`);
  await writeFile(target, after, 'utf8');
  console.log(`[build-www] how-to: Side Hustle card → ${HOW_TO_PATH}`);
}

// The original Task Tracker source is not in the connected repository set, so
// the portfolio hosts a first-party /task-tracker shell around the live app.
// Patch the generated shared registries so every app navigates to that shell and
// retains the shared map/playbook controls, rather than opening the bare external
// deployment. Source registries remain untouched; production output is canonical.
async function patchSharedTaskTrackerRoute() {
  const skillMapPath = join(WWW, 'assets', 'app-skill-map.js');
  const playbooksPath = join(WWW, 'assets', 'project-playbooks.js');

  if (!existsSync(skillMapPath) || !existsSync(playbooksPath)) {
    throw new Error('shared app registries missing before Task Tracker route patch');
  }

  const skillMapBefore = await readFile(skillMapPath, 'utf8');
  const skillMapPattern = /path: 'https:\/\/personal-ai-assistant-anchit\.vercel\.app\/',\s*external: true,/;
  if (!skillMapPattern.test(skillMapBefore)) {
    throw new Error('Task Tracker entry not found in generated App Skill Map');
  }
  const skillMapAfter = skillMapBefore.replace(
    skillMapPattern,
    "path: '/task-tracker',\n            aliases: ['/task-tracker.html'],",
  );
  await writeFile(skillMapPath, skillMapAfter, 'utf8');

  const playbooksBefore = await readFile(playbooksPath, 'utf8');
  const playbooksPattern = /path: 'https:\/\/personal-ai-assistant-anchit\.vercel\.app\/', department: \{ id: 'opportunity', title: 'Opportunity & Productivity' \}, capabilities:/;
  if (!playbooksPattern.test(playbooksBefore)) {
    throw new Error('Task Tracker fallback entry not found in generated Project Playbooks');
  }
  const playbooksAfter = playbooksBefore.replace(
    playbooksPattern,
    "path: '/task-tracker', aliases: ['/task-tracker.html'], department: { id: 'opportunity', title: 'Opportunity & Productivity' }, capabilities:",
  );
  await writeFile(playbooksPath, playbooksAfter, 'utf8');

  console.log('[build-www] shared-ui: Task Tracker canonical route → /task-tracker');
}

// Build the How-To Engine (standalone Vite + React app under
// side-husle/how-to-1, base '/how-to-2/') and mirror its dist into
// www/how-to-2 so it ships at /how-to-2 on the main static deployment.
// Wrapped so a failure here never takes down the rest of the portfolio.
async function buildHowTo() {
  const engine = join(ROOT, 'side-husle', 'how-to-1');
  if (!existsSync(join(engine, 'package.json'))) {
    console.warn('[build-www] skip how-to: engine not found');
    return;
  }
  try {
    if (!existsSync(join(engine, 'node_modules'))) {
      console.log('[build-www] how-to: installing deps…');
      execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: engine, stdio: 'inherit' });
    }
    console.log(`[build-www] how-to: building for ${HOW_TO_PATH}…`);
    execSync('npm run build', { cwd: engine, stdio: 'inherit' });
    const dist = join(engine, 'dist');
    if (!existsSync(dist)) throw new Error('dist not produced');
    await copyEntry(dist, join(WWW, HOW_TO_ROUTE));
    console.log(`[build-www] how-to: mirrored dist → www/${HOW_TO_ROUTE}`);
  } catch (err) {
    console.warn(`[build-www] how-to build failed (skipping, main build unaffected): ${err?.message || err}`);
  }
}

async function collectHtmlFiles(dir) {
  const output = [];
  if (!existsSync(dir)) return output;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await collectHtmlFiles(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) output.push(path);
  }
  return output;
}

// Shared runtimes are injected after all static files are copied and after the
// nested React app is built. Every first-party HTML entry point therefore gets:
//   1) app-level navigation and dependencies; and
//   2) project-level paths, guide packs, copyable prompts and local progress.
async function injectSharedExperience() {
  const htmlFiles = await collectHtmlFiles(WWW);
  let skillMapInjected = 0;
  let playbooksInjected = 0;
  let skipped = 0;

  for (const file of htmlFiles) {
    const before = await readFile(file, 'utf8');
    if (!/<\/head>/i.test(before)) {
      console.warn(`[build-www] shared-ui: skip HTML without </head>: ${file}`);
      skipped++;
      continue;
    }

    const additions = [];
    if (!before.includes(APP_SKILL_MAP_MARKER)) {
      additions.push(APP_SKILL_MAP_TAGS);
      skillMapInjected++;
    }
    if (!before.includes(PROJECT_PLAYBOOK_MARKER)) {
      additions.push(PROJECT_PLAYBOOK_TAGS);
      playbooksInjected++;
    }
    if (!additions.length) {
      skipped++;
      continue;
    }

    const after = before.replace(/<\/head>/i, `${additions.join('\n')}\n</head>`);
    await writeFile(file, after, 'utf8');
  }

  console.log(`[build-www] shared-ui: skill map injected into ${skillMapInjected}; project playbooks into ${playbooksInjected}${skipped ? `; skipped ${skipped}` : ''}`);
}

async function main() {
  console.log(`[build-www] cleaning ${WWW}`);
  await rm(WWW, { recursive: true, force: true });
  await mkdir(WWW, { recursive: true });

  for (const a of assets) {
    const src = join(ROOT, a);
    if (!existsSync(src)) {
      console.warn(`[build-www] skip (missing): ${a}`);
      continue;
    }
    const dest = join(WWW, a);
    await copyEntry(src, dest);
    console.log(`[build-www] copied ${a}`);
  }

  await patchHowToCardRoute();
  await buildHowTo();
  await patchSharedTaskTrackerRoute();
  await injectSharedExperience();

  console.log(`[build-www] done → ${WWW}`);
}

main().catch(err => { console.error(err); process.exit(1); });
