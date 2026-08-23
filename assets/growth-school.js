/* growth-school.js — one engine, two courses.
 *
 * The general course (growth-school.html) and Ayushi❤️'s course
 * (ayushi/course.html) both load this file and pass their own COURSE object.
 * Only the content differs; how learning works is defined once here, so a
 * change to the quiz, the simulators or the progress model lands in both at the
 * same time. That is the rule the lifecycle-os repo applies with
 * brand-context.js and region-context.js: one implementation, every surface.
 *
 * DESIGN DECISIONS WORTH KNOWING
 *
 * One mode, not three. There is no beginner/intermediate/advanced switch.
 * A switch asks people to grade themselves before they know what the grades
 * mean, and it hides the good material behind a guess. Instead every beat has
 * an optional "go deeper" fold on the same page: the plain path is the visible
 * text, the expert detail is one click below it. Nobody chooses a level; the
 * level is whatever they open.
 *
 * One idea per card. Chapters are built from short beats rather than an essay,
 * each with its own heading, so the page can be re-entered anywhere and the
 * thread is never more than a card long.
 *
 * Progress is exact and local. Every chapter completion is stored in
 * localStorage under a key the course names, so returning after a week resumes
 * where it stopped. Nothing is sent anywhere.
 *
 * Videos are click-to-load. No third-party frame is created until the learner
 * asks for it, so the page carries no external embed on first paint.
 */
(function (global) {
  'use strict';

  function h(tag, attrs, kids) {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach((c) =>
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return el;
  }
  // Course copy is authored as small HTML fragments. Two places need it as plain
  // text instead - the search haystack and the notes export. A /<[^>]+>/ strip is
  // the obvious move and the wrong one: it mangles entities, keeps comment bodies,
  // and cuts a tag short at the first `>` inside a quoted attribute. Parse it with
  // DOMParser instead, which builds an inert document - no scripts, no image loads,
  // nothing attached to this page - and read the text back off it.
  function plain(s) {
    if (s == null) return '';
    const str = String(s);
    if (str.indexOf('<') < 0 && str.indexOf('&') < 0) return str;
    try {
      const doc = new DOMParser().parseFromString(str, 'text/html');
      const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      const out = [];
      for (let n = walk.nextNode(); n; n = walk.nextNode()) out.push(n.nodeValue);
      // Join across element boundaries, so two list items stay two words.
      return out.join(' ').replace(/\s+/g, ' ').trim();
    } catch (e) {
      return str;
    }
  }

  const money = (n, cur) => (cur || '₹') + Math.round(n).toLocaleString('en-IN');

  function GrowthSchool(COURSE, mount) {
    const KEY = 'gs-' + COURSE.id;
    // One record per course. Progress was the only thing kept before; a course
    // that cannot tell you what you got wrong, or hand you your notes back,
    // is a document with buttons.
    const SCHEMA = 1;
    const BLANK = () => ({ v: SCHEMA, done: {}, notes: {}, wrong: {}, exam: null, name: '' });

    // Hydrate by TYPE, not by merge. Object.assign copies an explicit null
    // straight over the default, so a record containing {"notes":null} — which
    // a hand-edited or half-written file easily produces — replaced the object
    // with null and the first `S.notes[id]` read killed the whole page. The
    // page rendered nothing at all, and the try/catch around JSON.parse did not
    // help because the JSON was perfectly valid; it was the SHAPE that was wrong.
    function hydrate(raw) {
      const s = BLANK();
      let d = null;
      try { d = JSON.parse(raw || '{}'); } catch (e) { return s; }
      if (!d || typeof d !== 'object' || Array.isArray(d)) return s;
      const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x)) ? x : {};
      s.done = obj(d.done);
      s.notes = obj(d.notes);
      s.wrong = obj(d.wrong);
      s.exam = (d.exam && typeof d.exam === 'object') ? d.exam : null;
      s.name = typeof d.name === 'string' ? d.name : '';
      s.v = SCHEMA;
      return s;
    }
    let S = hydrate(localStorage.getItem(KEY));
    const done = S.done;

    // A failed write used to be swallowed, so a full quota lost notes silently
    // while the UI kept saying "saved". Report it instead.
    let saveOk = true;
    const save = () => {
      try { localStorage.setItem(KEY, JSON.stringify(S)); saveOk = true; }
      catch (e) { saveOk = false; }
      return saveOk;
    };

    const chapters = [];
    COURSE.tracks.forEach((t) => t.chapters.forEach((c) => chapters.push({ ...c, track: t.name })));
    // Review and the assessment are destinations, not asides — if they live in
    // a corner of some chapter nobody meets them.
    const REVIEW_ID = '__review', EXAM_ID = '__exam';
    chapters.push({ id: REVIEW_ID, title: 'Review what you missed', track: 'Finish', synthetic: true });
    chapters.push({ id: EXAM_ID, title: 'Final assessment', track: 'Finish', synthetic: true });
    let current = 0;
    const firstUndone = chapters.findIndex((c) => !done[c.id]);
    if (firstUndone > 0) current = firstUndone;

    const rail = h('aside', { class: 'gs-rail', id: 'gs-rail' });
    const main = h('main', { class: 'gs-main', id: 'gs-main', tabindex: '-1' });

    // Straight past 40-odd rail links to the lesson. Without this the keyboard
    // path to the actual content is the entire table of contents, every time.
    mount.appendChild(h('a', { class: 'gs-skip', href: '#gs-main' }, 'Skip to the lesson'));

    // On a phone the rail was 400px of chapter list stacked above the lesson,
    // so every visit began with a scroll past the index. It is a drawer now.
    const menuBtn = h('button', {
      class: 'gs-menu-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'gs-rail',
      onclick: () => {
        const open = rail.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', String(open));
        menuBtn.lastChild.textContent = open ? 'Hide chapters' : 'Chapters';
      },
    }, [h('span', { class: 'bars' }, '☰'), h('span', null, 'Chapters')]);
    mount.appendChild(menuBtn);
    mount.appendChild(h('div', { class: 'gs-shell' }, [rail, main]));

    let query = '';

    // ── rail ───────────────────────────────────────────────────────────────
    function renderRail() {
      rail.innerHTML = '';
      rail.appendChild(h('div', { class: 'gs-kicker' }, COURSE.kicker));
      rail.appendChild(h('div', { class: 'gs-brand', html: COURSE.title }));
      if (COURSE.railSub) rail.appendChild(h('p', { class: 'gs-rail-sub', html: COURSE.railSub }));

      // Search. Five chapters do not need it; a curriculum does, and the cost
      // of adding it later is every learner who gave up looking in between.
      const box = h('input', {
        type: 'search', value: query, 'aria-label': 'Search the course',
        placeholder: 'Search chapters and ideas…',
        oninput: (e) => { query = e.target.value; applyFilter(); },
      });
      const count = h('div', { class: 'gs-search-count', role: 'status', 'aria-live': 'polite' });
      rail.appendChild(h('div', { class: 'gs-search' }, [h('span', { class: 'ico' }, '⌕'), box]));
      rail.appendChild(count);
      rail.__count = count;

      // Real chapters only. Review and the assessment are destinations, not
      // lessons, and neither can be marked done — so counting them made the
      // bar top out at 9 of 11 (82%). A progress bar that cannot reach the end
      // is worse than no progress bar: it reads as "you have missed something"
      // to someone who has in fact finished.
      const real = chapters.filter((c) => !c.synthetic);
      const n = real.filter((c) => done[c.id]).length;
      const pct = real.length ? Math.round((n / real.length) * 100) : 0;
      const bar = h('div', {
        class: 'gs-bar', role: 'progressbar',
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct),
        'aria-label': 'Course progress: ' + n + ' of ' + real.length + ' chapters complete',
      }, h('i'));
      rail.appendChild(h('div', { class: 'gs-progress' }, [
        bar,
        h('div', { class: 'gs-progress-meta' }, [
          h('span', null, n + ' of ' + real.length + ' done'),
          h('span', null, pct + '%'),
        ]),
      ]));
      requestAnimationFrame(() => { bar.firstChild.style.width = pct + '%'; });

      const groups = COURSE.tracks.concat([{ name: 'Finish', chapters: chapters.filter((c) => c.synthetic) }]);
      groups.forEach((t) => {
        rail.appendChild(h('div', { class: 'gs-track-name' }, t.name));
        const ul = h('ul', { class: 'gs-nav' });
        t.chapters.forEach((c) => {
          const i = chapters.findIndex((x) => x.id === c.id);
          const btn = h('button', {
            type: 'button',
            'data-id': c.id,
            class: done[c.id] ? 'done' : '',
            'aria-current': i === current ? 'true' : 'false',
            onclick: () => go(i),
          }, [
            h('span', { class: 'n' }, String(i + 1).padStart(2, '0')),
            h('span', null, c.title),
            h('span', { class: 'tick' }, '✓'),
          ]);
          ul.appendChild(h('li', null, btn));
        });
        rail.appendChild(ul);
      });
      // Take-aways live at the bottom of the rail so they are reachable from
      // anywhere, not buried on a final screen.
      const imp = h('input', { type: 'file', accept: 'application/json', style: 'display:none',
        onchange: (e) => { if (e.target.files[0]) importProgress(e.target.files[0]); } });
      rail.appendChild(h('div', { style: 'margin-top:28px;display:grid;gap:8px' }, [
        h('button', { class: 'gs-btn', type: 'button', onclick: exportNotes }, 'Export my notes'),
        h('button', { class: 'gs-btn', type: 'button', onclick: exportProgress }, 'Save my progress'),
        h('button', { class: 'gs-btn', type: 'button', onclick: () => imp.click() }, 'Restore progress'),
        imp,
      ]));
      applyFilter();
    }

    function haystack(c) {
      if (c.__hay) return c.__hay;
      const parts = [c.title, c.intro || '', c.promise || ''];
      (c.beats || []).forEach((b) => parts.push(b.title || '', b.body || '', b.deeper || ''));
      (c.quiz || []).forEach((q) => parts.push(q.q || ''));
      c.__hay = parts.map(plain).join(' ').toLowerCase();
      return c.__hay;
    }
    function applyFilter() {
      const q = query.trim().toLowerCase();
      let shown = 0;
      rail.querySelectorAll('.gs-nav li').forEach((li) => {
        const id = li.firstChild && li.firstChild.dataset ? li.firstChild.dataset.id : null;
        const c = chapters.find((x) => x.id === id);
        const hit = !q || (c && haystack(c).indexOf(q) > -1);
        li.classList.toggle('filtered', !hit);
        if (hit) shown++;
      });
      if (rail.__count) rail.__count.textContent = q ? shown + ' of ' + chapters.length + ' match' : '';
    }

    // ── pieces ─────────────────────────────────────────────────────────────
    function beatEl(b) {
      const kids = [];
      if (b.tag) kids.push(h('span', { class: 'tag' }, b.tag));
      if (b.title) kids.push(h('h4', null, b.title));
      kids.push(h('div', { class: 'gs-p', html: b.body }));
      if (b.deeper) {
        kids.push(h('details', { class: 'gs-deeper' }, [
          h('summary', null, b.deeperLabel || 'Go deeper'),
          h('div', { html: b.deeper }),
        ]));
      }
      return h('section', { class: 'gs-beat' }, kids);
    }

    // Click-to-load. The iframe does not exist until this button is pressed,
    // so no third-party embed loads with the page.
    function videoEl(v) {
      const frame = h('div', { class: 'frame' });
      const poster = h('button', {
        class: 'poster', type: 'button',
        'aria-label': 'Play: ' + v.title,
        onclick: () => {
          frame.innerHTML = '';
          frame.appendChild(h('iframe', {
            src: v.src + (v.src.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1&rel=0',
            title: v.title, allow: 'accelerometer; autoplay; encrypted-media; picture-in-picture',
            allowfullscreen: '', referrerpolicy: 'strict-origin-when-cross-origin', loading: 'lazy',
          }));
        },
      }, [
        h('span', { class: 'play' }, '▶'),
        h('span', null, v.title),
        h('span', { class: 'cap' }, v.source + ' · tap to load'),
      ]);
      frame.appendChild(poster);
      return h('div', { class: 'gs-video' }, [frame, h('div', { class: 'cap' }, v.note || '')]);
    }

    function reposEl(list) {
      return h('div', { class: 'gs-repos' }, list.map((r) =>
        h('a', { class: 'gs-repo', href: r.url, target: '_blank', rel: 'noopener' }, [
          h('div', { class: 'nm' }, r.name),
          h('div', { class: 'why', html: r.why }),
        ])));
    }

    // The explanation shows for right AND wrong answers — a tick on its own
    // teaches nothing, and the reason is the part worth remembering.
    function quizEl(qs, chapterId) {
      const box = h('div', { class: 'gs-quiz' }, h('h3', { class: 'gs-h3', style: 'margin-top:0' }, 'Check yourself'));
      // The explanation is announced when it appears, not silently inserted.
      qs.forEach((q, qi) => {
        // A fieldset/legend, so a screen reader announces the question when it
        // reaches the options rather than reading four bare radio labels.
        const wrap = h('fieldset', { class: 'gs-q' });
        wrap.appendChild(h('legend', { html: q.q }));
        const opts = h('div', { class: 'gs-opts', role: 'radiogroup' });
        const why = h('div', { class: 'gs-why', style: 'display:none', role: 'status', 'aria-live': 'polite' });
        q.options.forEach((opt, oi) => {
          // Named from the chapter and the question index. It used to include
          // q.q.length, which is not an identity: two questions of equal length
          // rendered on the same page — as they are on the review list, where
          // each is its own quiz block and qi restarts at 0 — would share a
          // radio group and silently deselect each other.
          const input = h('input', { type: 'radio', name: COURSE.id + '-' + chapterId + '-q' + qi });
          const label = h('label', { class: 'gs-opt' }, [input, h('span', { html: opt })]);
          input.addEventListener('change', () => {
            [...opts.children].forEach((c) => c.classList.remove('right', 'wrong'));
            const right = oi === q.answer;
            label.classList.add(right ? 'right' : 'wrong');
            if (!right) opts.children[q.answer].classList.add('right');
            why.style.display = '';
            why.innerHTML = (right ? '<strong>Yes.</strong> ' : '<strong>Not quite.</strong> ') + q.why;
            // Remember misses. Getting a question wrong and never meeting it
            // again is the single biggest hole in a self-paced course.
            const qk = chapterId + '|' + qi;
            if (right) delete S.wrong[qk]; else S.wrong[qk] = { c: chapterId, i: qi };
            save();
          });
          opts.appendChild(label);
        });
        wrap.appendChild(opts); wrap.appendChild(why);
        box.appendChild(wrap);
      });
      return box;
    }

    function activityEl(a) {
      return h('div', { class: 'gs-activity' }, [
        h('span', { class: 'gs-free' }, 'Do this · free, no account'),
        h('h3', { class: 'gs-h3', style: 'margin-top:8px' }, a.title),
        h('div', { class: 'gs-p', html: a.intro || '' }),
        h('ol', null, a.steps.map((s) => h('li', { html: s }))),
      ]);
    }

    // A course you cannot take anything away from is a course you re-read.
    // Notes are per chapter, saved locally, and exportable as one Markdown file.
    function notesEl(c) {
      const ta = h('textarea', {
        placeholder: 'What does this change about how you work? Write it in your own words — that is what makes it stick.',
        'aria-label': 'Your notes for this chapter',
      });
      ta.value = S.notes[c.id] || '';
      const meta = h('div', { class: 'gs-notes-meta' });
      const paint = () => {
        const w = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
        // Tell the truth about whether the write succeeded. Claiming "saved"
        // while the quota is full is how someone loses an afternoon of notes.
        meta.textContent = w + (w === 1 ? ' word' : ' words') +
          (saveOk ? ' · saved on this device' : ' · NOT SAVED — this browser refused to store it');
        meta.style.color = saveOk ? '' : 'var(--gs-primary)';
      };
      let t;
      ta.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { S.notes[c.id] = ta.value; save(); paint(); }, 400);
      });
      meta.setAttribute('role', 'status');
      meta.setAttribute('aria-live', 'polite');
      paint();
      return h('div', { class: 'gs-notes' }, [
        h('h3', { class: 'gs-h3', style: 'margin-top:0' }, 'Your notes'),
        h('div', { class: 'gs-p' }, 'Only you can see these. They stay on this device, and you can export them all at any time.'),
        ta, meta,
      ]);
    }

    function download(name, text, type) {
      const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name });
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    }
    function exportNotes() {
      const lines = ['# ' + plain(COURSE.title) + ' — my notes', ''];
      chapters.forEach((c, i) => {
        const n = (S.notes[c.id] || '').trim();
        if (!n) return;
        lines.push('## ' + String(i + 1).padStart(2, '0') + '. ' + plain(c.title));
        lines.push('', n, '');
      });
      if (lines.length === 2) lines.push('_No notes yet._');
      download('course-notes.md', lines.join('\n'), 'text/markdown;charset=utf-8');
    }
    // Progress is local by design — no account, nothing sent anywhere. The
    // honest answer to "so I lose it on a new laptop" is a file you control.
    function exportProgress() {
      download('course-progress.json', JSON.stringify({ course: COURSE.id, saved: new Date().toISOString(), state: S }, null, 2), 'application/json');
    }
    function importProgress(file) {
      const r = new FileReader();
      r.onload = () => {
        try {
          const d = JSON.parse(r.result);
          if (!d || d.course !== COURSE.id) return alert('That file is from a different course.');
          Object.assign(S, BLANK, d.state || {});
          save(); renderRail(); renderChapter();
        } catch (e) { alert('That file could not be read.'); }
      };
      r.readAsText(file);
    }

    // ── simulators ─────────────────────────────────────────────────────────
    // Each returns { fields, compute } and the engine renders and wires it, so
    // adding one is a data change rather than a UI change.
    const SIMS = {
      // What does it actually cost to stand up a narrow-catalogue D2C brand?
      capital: {
        title: 'What capital would it take?',
        blurb: 'Move the sliders. Every number below is arithmetic you can check by hand — nothing is hidden.',
        fields: [
          { k: 'skus', label: 'SKUs at launch', min: 10, max: 400, step: 10, val: 60, fmt: (v) => v },
          { k: 'depth', label: 'Units held per SKU', min: 3, max: 40, step: 1, val: 10, fmt: (v) => v },
          { k: 'cost', label: 'Cost per unit', min: 200, max: 6000, step: 100, val: 2200, fmt: (v) => money(v) },
          { k: 'price', label: 'Selling price', min: 500, max: 15000, step: 100, val: 5200, fmt: (v) => money(v) },
          { k: 'cac', label: 'Cost to get one order', min: 100, max: 4000, step: 50, val: 900, fmt: (v) => money(v) },
          { k: 'months', label: 'Months of runway', min: 3, max: 24, step: 1, val: 9, fmt: (v) => v + ' mo' },
          { k: 'fixed', label: 'Fixed cost / month', min: 0, max: 500000, step: 10000, val: 120000, fmt: (v) => money(v) },
          { k: 'orders', label: 'Orders / month by month 6', min: 20, max: 2000, step: 20, val: 300, fmt: (v) => v },
        ],
        compute: (v) => {
          const stock = v.skus * v.depth * v.cost;
          const gross = v.price - v.cost;
          const contribution = gross - v.cac;
          const monthlyBurn = v.fixed + v.orders * v.cac;
          const monthlyContribution = v.orders * gross;
          const netMonthly = monthlyContribution - monthlyBurn;
          const opex = v.fixed * v.months;
          const marketing = v.orders * v.cac * v.months * 0.6;   // ramping, not flat from day one
          const total = stock + opex + marketing;
          // How long before the money comes back. This is the question that
          // follows "what capital would it take?", and the model was computing
          // a half-formed version of it and then throwing it away.
          const monthsToRecover = netMonthly > 0 ? total / netMonthly : Infinity;
          return {
            out: [
              { k: 'Opening stock', v: money(stock), cls: '' },
              { k: 'Margin per order', v: money(gross), cls: gross > 0 ? 'ok' : 'warn' },
              { k: 'After ad cost', v: money(contribution), cls: contribution > 0 ? 'ok' : 'warn' },
              { k: 'Capital needed', v: money(total), cls: 'warn' },
              { k: 'Monthly net at run-rate', v: money(netMonthly), cls: netMonthly >= 0 ? 'ok' : 'warn' },
              { k: 'Months to earn it back', v: isFinite(monthsToRecover) ? Math.ceil(monthsToRecover) + ' mo' : 'never, yet',
                cls: isFinite(monthsToRecover) && monthsToRecover <= 24 ? 'ok' : 'warn' },
            ],
            verdict: contribution <= 0
              ? '<strong>This does not work yet.</strong> Every order loses ' + money(-contribution) +
                ' after the cost of getting it. No amount of capital fixes a negative contribution — it just buys more losses. Raise price, cut unit cost, or get the order cheaper.'
              : '<strong>Each order contributes ' + money(contribution) + '.</strong> You need roughly ' +
                money(total) + ' to open with ' + v.skus + ' SKUs and survive ' + v.months +
                ' months. Stock is ' + Math.round((stock / total) * 100) + '% of that — in a catalogue business it usually is, which is why narrow ranges start cheaper. At ' +
                v.orders + ' orders a month you are ' + (netMonthly >= 0
                  ? 'above water by ' + money(netMonthly) + ' a month, which returns the capital in about ' + Math.ceil(monthsToRecover) + ' months.'
                  : 'still short by ' + money(-netMonthly) + ' a month, so the capital never comes back at this run-rate.'),
          };
        },
      },
      // Do the ads pay for themselves, and when?
      payback: {
        title: 'Does the spend pay for itself?',
        blurb: 'The only two numbers that decide whether growth is a business or a hobby.',
        fields: [
          { k: 'cac', label: 'Cost to get one customer', min: 100, max: 5000, step: 50, val: 900, fmt: (v) => money(v) },
          { k: 'aov', label: 'Average order value', min: 300, max: 15000, step: 100, val: 4200, fmt: (v) => money(v) },
          { k: 'margin', label: 'Gross margin', min: 10, max: 90, step: 1, val: 55, fmt: (v) => v + '%' },
          { k: 'repeat', label: 'Orders per customer per year', min: 1, max: 8, step: 0.5, val: 1.8, fmt: (v) => v },
        ],
        compute: (v) => {
          const perOrder = v.aov * (v.margin / 100);
          const ltv = perOrder * v.repeat;
          const ratio = ltv / v.cac;
          const ordersToPayback = perOrder > 0 ? v.cac / perOrder : Infinity;
          return {
            out: [
              { k: 'Margin per order', v: money(perOrder), cls: '' },
              { k: 'Year-one value', v: money(ltv), cls: '' },
              { k: 'Value ÷ cost', v: ratio.toFixed(2) + '×', cls: ratio >= 3 ? 'ok' : 'warn' },
              { k: 'Orders to break even', v: ordersToPayback.toFixed(1), cls: ordersToPayback <= v.repeat ? 'ok' : 'warn' },
            ],
            verdict: ratio >= 3
              ? '<strong>Healthy.</strong> A customer returns ' + ratio.toFixed(2) + '× what they cost. The common rule of thumb is 3× or better, because that third covers the fixed costs the ratio ignores.'
              : ordersToPayback <= v.repeat
                ? '<strong>It pays back, but thinly.</strong> You recover the acquisition cost inside the year, yet at ' + ratio.toFixed(2) + '× there is little left for salaries, tooling or a bad quarter.'
                : '<strong>It does not pay back inside a year.</strong> You need ' + ordersToPayback.toFixed(1) +
                  ' orders to recover the cost of acquisition and get ' + v.repeat + '. Either the second order has to happen more often, or the first one has to cost less.',
          };
        },
      },
      // Where should a small team put its search effort?
      seo: {
        title: 'Where is the search effort worth it?',
        blurb: 'Search volume is not opportunity. Opportunity is volume you can realistically rank for, times what a visit is worth.',
        fields: [
          { k: 'vol', label: 'Monthly searches', min: 100, max: 100000, step: 100, val: 8000, fmt: (v) => v.toLocaleString('en-IN') },
          { k: 'diff', label: 'How hard to rank (0-100)', min: 1, max: 100, step: 1, val: 45, fmt: (v) => v },
          { k: 'auth', label: 'Your site strength (0-100)', min: 1, max: 100, step: 1, val: 25, fmt: (v) => v },
          { k: 'cvr', label: 'Visit-to-order rate', min: 0.1, max: 10, step: 0.1, val: 1.2, fmt: (v) => v + '%' },
          { k: 'aov', label: 'Average order value', min: 300, max: 15000, step: 100, val: 4200, fmt: (v) => money(v) },
        ],
        compute: (v) => {
          const gap = v.auth - v.diff;
          const share = Math.max(0.002, Math.min(0.32, 0.32 / (1 + Math.exp(-gap / 12))));
          const visits = v.vol * share;
          const orders = visits * (v.cvr / 100);
          const revenue = orders * v.aov;
          const months = gap >= 10 ? 3 : gap >= -10 ? 6 : gap >= -30 ? 12 : 18;
          return {
            out: [
              { k: 'Realistic share', v: (share * 100).toFixed(1) + '%', cls: share > 0.08 ? 'ok' : 'warn' },
              { k: 'Visits / month', v: Math.round(visits).toLocaleString('en-IN'), cls: '' },
              { k: 'Orders / month', v: orders.toFixed(1), cls: '' },
              { k: 'Revenue / month', v: money(revenue), cls: revenue > 0 ? 'ok' : '' },
              { k: 'Time to get there', v: '~' + months + ' mo', cls: months <= 6 ? 'ok' : 'warn' },
            ],
            verdict: gap >= 0
              ? '<strong>Worth doing.</strong> Your site is stronger than this term is hard, so a good page has a real chance. Expect roughly ' + months + ' months before the traffic is steady.'
              : gap >= -30
                ? '<strong>Reachable, slowly.</strong> You are behind the difficulty of this term by ' + (-gap) +
                  ' points. It is winnable with genuinely better material, on about a ' + months + '-month horizon — not a quarter.'
                : '<strong>Not this one, not yet.</strong> The gap is ' + (-gap) +
                  ' points. Volume this big attracts sites far stronger than yours; the same effort spent on narrower terms you can actually win will return sooner.',
          };
        },
      },
    };

    function simEl(name) {
      const sim = SIMS[name];
      if (!sim) return h('div');
      const state = {};
      sim.fields.forEach((f) => { state[f.k] = f.val; });
      const outWrap = h('div', { class: 'gs-out' });
      const verdict = h('div', { class: 'gs-verdict' });

      function recompute() {
        const r = sim.compute(state);
        outWrap.innerHTML = '';
        r.out.forEach((o) => outWrap.appendChild(h('div', null, [
          h('div', { class: 'k' }, o.k),
          h('div', { class: 'v ' + (o.cls || '') }, o.v),
        ])));
        verdict.innerHTML = r.verdict;
      }

      const grid = h('div', { class: 'gs-sim-grid' });
      sim.fields.forEach((f) => {
        const val = h('span', { class: 'val' }, String(f.fmt(f.val)));
        const input = h('input', {
          type: 'range', min: f.min, max: f.max, step: f.step, value: f.val,
          'aria-label': f.label,
          oninput: (e) => { state[f.k] = parseFloat(e.target.value); val.textContent = f.fmt(state[f.k]); recompute(); },
        });
        grid.appendChild(h('div', { class: 'gs-field' }, [h('label', null, f.label), input, val]));
      });

      const box = h('div', { class: 'gs-sim' }, [
        h('h3', { class: 'gs-h3', style: 'margin-top:0' }, sim.title),
        h('div', { class: 'gs-p' }, sim.blurb),
        grid, outWrap, verdict,
      ]);
      recompute();
      return box;
    }

    // Every question in the course, as one graded paper. Reading a chapter and
    // ticking "done" proves attendance; this is the only thing here that
    // attempts to measure whether any of it landed.
    function allQuestions() {
      const out = [];
      chapters.forEach((c) => (c.quiz || []).forEach((q, i) => out.push({ q, chapter: c, i })));
      return out;
    }
    const PASS = 0.8;   // 80%. Low enough to be fair on 12 questions, high enough to mean something.

    function examEl() {
      const pool = allQuestions();
      const answers = {};
      const wrap = h('div');
      const intro = h('div', { class: 'gs-exam-intro' }, [
        h('h3', { class: 'gs-h3', style: 'margin-top:0' }, 'Final assessment'),
        h('div', { class: 'gs-p', html: 'Every question from the course, in one pass — <strong>' + pool.length +
          '</strong> of them. You need <strong>' + Math.round(PASS * 100) + '%</strong>. ' +
          'Nothing is timed and you can retake it; the point is to find the gaps, not to gate you.' }),
      ]);
      wrap.appendChild(intro);

      const paper = h('div', { class: 'gs-quiz' });
      pool.forEach((item, n) => {
        const qq = h('div', { class: 'gs-q' }, h('p', { html: '<strong>' + (n + 1) + '.</strong> ' + item.q.q }));
        const opts = h('div', { class: 'gs-opts' });
        item.q.options.forEach((opt, oi) => {
          const input = h('input', { type: 'radio', name: 'exam-' + n });
          input.addEventListener('change', () => { answers[n] = oi; });
          opts.appendChild(h('label', { class: 'gs-opt' }, [input, h('span', { html: opt })]));
        });
        qq.appendChild(opts);
        paper.appendChild(qq);
      });
      wrap.appendChild(paper);

      const result = h('div');
      wrap.appendChild(result);
      wrap.appendChild(h('div', { class: 'gs-foot' }, [
        h('button', { class: 'gs-btn primary', type: 'button', onclick: () => {
          const answered = Object.keys(answers).length;
          if (answered < pool.length && !confirm((pool.length - answered) + ' unanswered. Mark it anyway?')) return;
          let right = 0; const missed = [];
          pool.forEach((item, n) => { if (answers[n] === item.q.answer) right++; else missed.push(item); });
          const pct = right / pool.length;
          S.exam = { right: right, total: pool.length, pct: pct, at: new Date().toISOString() };
          // Feed misses back into the review queue rather than just scoring them.
          missed.forEach((m) => { S.wrong[m.chapter.id + '|' + m.i] = { c: m.chapter.id, i: m.i }; });
          save(); renderRail();
          result.innerHTML = '';
          result.appendChild(h('div', { class: 'gs-score' }, [
            h('div', null, [h('div', { class: 'k' }, 'Score'), h('div', { class: 'v ' + (pct >= PASS ? 'ok' : 'warn') }, right + '/' + pool.length)]),
            h('div', null, [h('div', { class: 'k' }, 'Percentage'), h('div', { class: 'v ' + (pct >= PASS ? 'ok' : 'warn') }, Math.round(pct * 100) + '%')]),
            h('div', null, [h('div', { class: 'k' }, 'Result'), h('div', { class: 'v ' + (pct >= PASS ? 'ok' : 'warn') }, pct >= PASS ? 'Passed' : 'Not yet')]),
          ]));
          result.appendChild(h('div', { class: 'gs-p', html: pct >= PASS
            ? 'Passed. The certificate is below — and the ' + missed.length + ' you missed have gone into your review list, because a pass is not the same as knowing all of it.'
            : 'Not yet — you need ' + Math.round(PASS * pool.length) + ' of ' + pool.length + '. The ' + missed.length +
              ' you missed are in your review list now. Work through those and come back; nothing is lost.' }));
          if (pct >= PASS) result.appendChild(certEl());
          result.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } }, 'Mark my paper'),
      ]));
      return wrap;
    }

    // A completion record, and deliberately modest about what it is: a local
    // attestation, not an accredited qualification. Claiming more would be a lie
    // a corporate buyer would catch in one question.
    function certEl() {
      const nameIn = h('input', { type: 'text', placeholder: 'Your name', 'aria-label': 'Name for the certificate', value: S.name || '' });
      const who = h('div', { class: 'who' }, S.name || 'Your name');
      nameIn.addEventListener('input', () => { S.name = nameIn.value; who.textContent = nameIn.value || 'Your name'; save(); });
      const ex = S.exam || { right: 0, total: 0, pct: 0, at: new Date().toISOString() };
      const when = new Date(ex.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      const card = h('div', { class: 'gs-cert' }, [
        h('div', { class: 'eyebrow' }, 'Record of completion'),
        h('h3', { html: COURSE.title }),
        who,
        h('div', { class: 'meta', html:
          'scored ' + ex.right + ' of ' + ex.total + ' (' + Math.round(ex.pct * 100) + '%)<br>' +
          // Real chapters only. `chapters` also holds the two synthetic
          // destinations (Review, Final assessment), so counting it told the
          // holder they had completed 11 chapters of a 9-chapter course — an
          // overstatement, on the one artefact whose whole value is being
          // accurate about what was done.
          when + '<br>' + chapters.filter((c) => !c.synthetic).length + ' chapters · ' + allQuestions().length + ' questions' }),
        h('div', { class: 'gs-p', style: 'margin-top:20px;font-size:14px' },
          'This is a self-assessed record generated in your browser. It is honest about being that — it is not an accredited qualification, and nobody has verified it.'),
        nameIn,
        h('div', { class: 'gs-foot', style: 'justify-content:center;border:0;margin-top:8px' }, [
          h('button', { class: 'gs-btn', type: 'button', onclick: () => window.print() }, 'Print / save as PDF'),
        ]),
      ]);
      return card;
    }

    // Spaced review: the questions you got wrong, and only those.
    function reviewEl() {
      const keys = Object.keys(S.wrong);
      if (!keys.length) {
        return h('div', { class: 'gs-review' }, [
          h('h3', { class: 'gs-h3', style: 'margin-top:0' }, 'Nothing to review'),
          h('div', { class: 'gs-p' }, 'Every question you have answered, you got right. Anything you miss will collect here.'),
        ]);
      }
      const items = keys.map((k) => {
        const rec = S.wrong[k];
        const c = chapters.find((x) => x.id === rec.c);
        return c && c.quiz && c.quiz[rec.i] ? { c: c, q: c.quiz[rec.i], i: rec.i } : null;
      }).filter(Boolean);
      const box = h('div', { class: 'gs-review' }, [
        h('div', { class: 'n' }, String(items.length)),
        h('h3', { class: 'gs-h3', style: 'margin-top:0' }, items.length === 1 ? 'question to revisit' : 'questions to revisit'),
        h('div', { class: 'gs-p' }, 'These are the ones you missed. Answer correctly and it leaves the list.'),
      ]);
      items.forEach((it) => box.appendChild(quizEl([it.q], it.c.id)));
      return box;
    }

    // ── chapter ────────────────────────────────────────────────────────────
    function renderChapter() {
      const c = chapters[current];
      main.innerHTML = '';
      const col = h('div', { class: 'gs-col' });

      if (c.synthetic) {
        col.appendChild(h('div', { class: 'gs-kicker' }, 'Finish'));
        col.appendChild(h('h1', { class: 'gs-h1' }, c.title));
        col.appendChild(c.id === EXAM_ID ? examEl() : reviewEl());
        const f2 = h('div', { class: 'gs-foot' }, [
          h('button', { class: 'gs-btn', type: 'button', onclick: () => go(current - 1) }, '← Back'),
          h('span', { class: 'gs-note' }, 'Nothing here is sent anywhere.'),
        ]);
        col.appendChild(f2);
        main.appendChild(col);
        main.focus({ preventScroll: true });
        window.scrollTo(0, 0);
        return;
      }
      col.appendChild(h('div', { class: 'gs-kicker' }, c.track + ' · Chapter ' + String(current + 1).padStart(2, '0') + (c.minutes ? ' · ' + c.minutes + ' min' : '')));
      col.appendChild(h('h1', { class: 'gs-h1', html: c.title }));
      if (c.intro) col.appendChild(h('p', { class: 'gs-p', html: c.intro }));
      if (c.promise) col.appendChild(h('div', { class: 'gs-promise' }, [
        h('span', { class: 'lbl' }, 'By the end you can'),
        h('span', { html: c.promise }),
      ]));

      (c.beats || []).forEach((b) => col.appendChild(beatEl(b)));
      if (c.video) col.appendChild(videoEl(c.video));
      if (c.repos) { col.appendChild(h('h3', { class: 'gs-h3' }, 'Read the real thing')); col.appendChild(reposEl(c.repos)); }
      if (c.sim) col.appendChild(simEl(c.sim));
      if (c.activity) col.appendChild(activityEl(c.activity));
      if (c.quiz) col.appendChild(quizEl(c.quiz, c.id));
      col.appendChild(notesEl(c));
      if (c.outro) col.appendChild(h('p', { class: 'gs-p', html: c.outro }));

      const markBtn = h('button', {
        class: 'gs-btn primary', type: 'button',
        onclick: () => { done[c.id] = 1; save(); renderRail(); if (current < chapters.length - 1) go(current + 1); else renderChapter(); },
      }, done[c.id] ? 'Done ✓ — next chapter' : 'Mark done →');
      const foot = h('div', { class: 'gs-foot' }, [markBtn]);
      if (current > 0) foot.appendChild(h('button', { class: 'gs-btn', type: 'button', onclick: () => go(current - 1) }, '← Back'));
      if (current < chapters.length - 1) foot.appendChild(h('button', { class: 'gs-btn', type: 'button', onclick: () => go(current + 1) }, 'Skip ahead →'));
      foot.appendChild(h('span', { class: 'gs-note' }, 'Progress saves on this device only.'));
      col.appendChild(foot);

      main.appendChild(col);
      main.focus({ preventScroll: true });
      rail.classList.remove('open');
      window.scrollTo(0, 0);
    }

    function go(i) { current = Math.max(0, Math.min(chapters.length - 1, i)); renderRail(); renderChapter(); location.hash = chapters[current].id; }

    const fromHash = chapters.findIndex((c) => c.id === location.hash.slice(1));
    if (fromHash >= 0) current = fromHash;
    renderRail(); renderChapter();
    window.addEventListener('hashchange', () => {
      const i = chapters.findIndex((c) => c.id === location.hash.slice(1));
      if (i >= 0 && i !== current) { current = i; renderRail(); renderChapter(); }
    });

    return { go, chapters };
  }

  global.GrowthSchool = GrowthSchool;
})(window);
