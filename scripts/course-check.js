// Does the course actually teach, on both versions?
//
// The two pages are thin shells over one engine and one content file, so the
// thing worth checking is that the shared pieces really do render on both and
// that the interactive parts respond — a course whose quiz does not answer or
// whose simulator does not recompute is a slide deck.
//
// Run against a served build:  node scripts/course-check.js
// MUT=1 breaks the shared engine; every check must fail.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const MUT = process.env.MUT === '1';

const PAGES = [
  ['public course', 'growth-school.html'],
  ['Ayushi❤️ course', 'ayushi/course.html'],
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const results = [];
  const check = (n, ok, d) => results.push([ok ? 'PASS' : 'FAIL', n, d]);

  for (const [label, path] of PAGES) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
    await p.goto(`http://127.0.0.1:8099/${path}`, { waitUntil: 'load', timeout: 25000 });
    if (MUT) await p.evaluate(() => { document.querySelectorAll('.gs-beat, .gs-quiz, .gs-sim, .gs-nav button').forEach((e) => e.remove()); });
    await p.waitForTimeout(900);

    const m = await p.evaluate(() => ({
      chapters: document.querySelectorAll('.gs-nav button').length,
      beats: document.querySelectorAll('.gs-beat').length,
      deeper: document.querySelectorAll('.gs-deeper').length,
      quiz: document.querySelectorAll('.gs-quiz .gs-opt').length,
      progress: !!document.querySelector('.gs-bar'),
      title: (document.querySelector('.gs-brand')?.textContent || '').trim(),
      iframes: document.querySelectorAll('iframe').length,
    }));

    check(`${label}: renders chapters and beats`, m.chapters >= 5 && m.beats >= 2,
      `${m.chapters} chapters, ${m.beats} beats on the opening one`);
    check(`${label}: depth is available inline, not behind a level switch`, m.deeper >= 2,
      `${m.deeper} "go deeper" folds`);
    check(`${label}: no third-party iframe loads with the page`, m.iframes === 0,
      `${m.iframes} iframes before any click`);

    // Answering a quiz option must explain, whether right or wrong.
    const quizWorks = await p.evaluate(() => {
      const opt = document.querySelector('.gs-quiz .gs-opt input');
      if (!opt) return { ok: false, why: 'no quiz on this chapter' };
      opt.click();
      const why = document.querySelector('.gs-quiz .gs-why');
      return { ok: !!why && why.style.display !== 'none' && why.textContent.trim().length > 20,
               why: (why?.textContent || '').slice(0, 44) };
    });
    check(`${label}: the quiz explains the answer`, quizWorks.ok, quizWorks.why);

    // Navigate to a chapter carrying a simulator and prove it recomputes.
    const simWorks = await p.evaluate(async () => {
      const btns = [...document.querySelectorAll('.gs-nav button')];
      for (const btn of btns) {
        btn.click();
        await new Promise((r) => setTimeout(r, 120));
        const sim = document.querySelector('.gs-sim');
        if (!sim) continue;
        // Compare EVERY output, not just the first. The first slider on the
        // payback simulator is the acquisition cost and the first output is
        // margin per order, which does not depend on it — so reading one cell
        // reported "nothing recomputed" on a simulator that was working.
        const read = () => [...document.querySelectorAll('.gs-out .v')].map((e) => e.textContent).join('|');
        const before = read();
        const range = sim.querySelector('input[type=range]');
        range.value = String(Math.min(+range.max, +range.value + (+range.step || 1) * 12));
        range.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((r) => setTimeout(r, 60));
        const after = read();
        const moved = before.split('|').filter((v, i) => v !== after.split('|')[i]).length;
        return { ok: !!before && moved > 0, why: moved + ' of ' + before.split('|').length + ' outputs changed',
                 chapter: btn.textContent.trim().slice(0, 30) };
      }
      return { ok: false, why: 'no simulator found on any chapter' };
    });
    check(`${label}: a simulator recomputes when moved`, simWorks.ok, simWorks.why);

    check(`${label}: no page errors`, errs.length === 0, errs[0] || 'none');
    await ctx.close();
  }

  // The personalisation, and the promise about what her version does not say.
  {
    const p = await (await b.newContext()).newPage();
    await p.goto('http://127.0.0.1:8099/ayushi/course.html', { waitUntil: 'load', timeout: 25000 });
    await p.waitForTimeout(700);
    const t = await p.evaluate(async () => {
      let all = '';
      for (const btn of [...document.querySelectorAll('.gs-nav button')]) {
        btn.click(); await new Promise((r) => setTimeout(r, 90));
        all += ' ' + document.body.innerText;
      }
      return { all, name: (all.match(/Ayushi❤️/g) || []).length };
    });
    check('Ayushi❤️ course uses her name, exactly as given', t.name >= 3, `${t.name} occurrences of "Ayushi❤️"`);
    // She asked for a course about the material, and nothing else.
    const banned = /\badhd\b|attention deficit|neurodiver/i;
    check('Ayushi❤️ course mentions nothing outside the course material',
      !banned.test(t.all), banned.test(t.all) ? 'found a reference it should not carry' : 'clean across every chapter');
    await p.close();
  }

  for (const [ok, n, d] of results) console.log(`  ${ok}  ${n.padEnd(56)} ${d}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await b.close();
  if (MUT) {
    // Content assertions — her name in the rail, the absence of a topic, the
    // lack of an iframe — are not broken by removing rendered nodes, so
    // claiming this mutation covers them would be false.
    const target = results.filter((r) => !/no page errors|nothing outside|no third-party|uses her name/.test(r[1]));
    const wrong = target.filter((r) => r[0] === 'PASS').map((r) => r[1]);
    if (!wrong.length) { console.log(`MUT: all ${target.length} content checks failed, as they must`); process.exit(0); }
    console.log('MUT: still passing — ' + wrong.join('; ')); process.exit(1);
  }
  process.exit(failed ? 1 : 0);
})();
