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
  const money = (n, cur) => (cur || '₹') + Math.round(n).toLocaleString('en-IN');

  function GrowthSchool(COURSE, mount) {
    const KEY = 'gs-' + COURSE.id;
    let done = {};
    try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { done = {}; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) {} };

    const chapters = [];
    COURSE.tracks.forEach((t) => t.chapters.forEach((c) => chapters.push({ ...c, track: t.name })));
    let current = 0;
    const firstUndone = chapters.findIndex((c) => !done[c.id]);
    if (firstUndone > 0) current = firstUndone;

    const rail = h('aside', { class: 'gs-rail' });
    const main = h('main', { class: 'gs-main' });
    mount.appendChild(h('div', { class: 'gs-shell' }, [rail, main]));

    // ── rail ───────────────────────────────────────────────────────────────
    function renderRail() {
      rail.innerHTML = '';
      rail.appendChild(h('div', { class: 'gs-kicker' }, COURSE.kicker));
      rail.appendChild(h('div', { class: 'gs-brand', html: COURSE.title }));
      if (COURSE.railSub) rail.appendChild(h('p', { class: 'gs-rail-sub', html: COURSE.railSub }));

      const n = chapters.filter((c) => done[c.id]).length;
      const pct = Math.round((n / chapters.length) * 100);
      const bar = h('div', { class: 'gs-bar' }, h('i'));
      rail.appendChild(h('div', { class: 'gs-progress' }, [
        bar,
        h('div', { class: 'gs-progress-meta' }, [
          h('span', null, n + ' of ' + chapters.length + ' done'),
          h('span', null, pct + '%'),
        ]),
      ]));
      requestAnimationFrame(() => { bar.firstChild.style.width = pct + '%'; });

      COURSE.tracks.forEach((t) => {
        rail.appendChild(h('div', { class: 'gs-track-name' }, t.name));
        const ul = h('ul', { class: 'gs-nav' });
        t.chapters.forEach((c) => {
          const i = chapters.findIndex((x) => x.id === c.id);
          const btn = h('button', {
            type: 'button',
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
    function quizEl(qs) {
      const box = h('div', { class: 'gs-quiz' }, h('h3', { class: 'gs-h3', style: 'margin-top:0' }, 'Check yourself'));
      qs.forEach((q, qi) => {
        const wrap = h('div', { class: 'gs-q' }, h('p', { html: q.q }));
        const opts = h('div', { class: 'gs-opts' });
        const why = h('div', { class: 'gs-why', style: 'display:none' });
        q.options.forEach((opt, oi) => {
          const input = h('input', { type: 'radio', name: COURSE.id + '-q' + qi + '-' + q.q.length });
          const label = h('label', { class: 'gs-opt' }, [input, h('span', { html: opt })]);
          input.addEventListener('change', () => {
            [...opts.children].forEach((c) => c.classList.remove('right', 'wrong'));
            label.classList.add(oi === q.answer ? 'right' : 'wrong');
            if (oi !== q.answer) opts.children[q.answer].classList.add('right');
            why.style.display = '';
            why.innerHTML = (oi === q.answer ? '<strong>Yes.</strong> ' : '<strong>Not quite.</strong> ') + q.why;
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

    // ── chapter ────────────────────────────────────────────────────────────
    function renderChapter() {
      const c = chapters[current];
      main.innerHTML = '';
      const col = h('div', { class: 'gs-col' });

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
      if (c.quiz) col.appendChild(quizEl(c.quiz));
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
      main.scrollIntoView({ block: 'start', behavior: 'instant' });
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
