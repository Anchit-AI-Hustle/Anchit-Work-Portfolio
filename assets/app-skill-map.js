/*
 * Anchit App Skill Map
 * A dependency-free, cross-app capability map inspired by visual skill-tree
 * navigation. It is injected into every built HTML entry point by build-www.mjs.
 * No third-party analytics, credentials, or reference-page tokens are used.
 */
(function () {
  'use strict';

  if (window.__ANCHIT_APP_SKILL_MAP_BOOTED__) return;
  window.__ANCHIT_APP_SKILL_MAP_BOOTED__ = true;

  var STORAGE_KEY = 'anchit-app-skill-map-v1';
  var ROOT_ID = 'anchit-app-skill-map-root';

  var MAP = {
    version: 1,
    title: 'Anchit App Skill Map',
    subtitle: 'Every app, capability and dependency — connected to one shared intelligence layer.',
    brain: {
      id: 'anchit-intelligence',
      title: 'Anchit Intelligence',
      description: 'The shared context layer that helps visitors understand the portfolio, route to the right tool and continue across apps without losing orientation.',
      path: '/#chat',
      capabilities: [
        'Cross-project context',
        'Guided navigation',
        'Portfolio Q&A',
        'Shared progress state'
      ]
    },
    departments: [
      {
        id: 'portfolio',
        title: 'Portfolio & Identity',
        short: 'Who I am, what I built and how to talk to the system.',
        dashboard: 'portfolio-os',
        apps: [
          {
            id: 'portfolio-os',
            title: 'Interactive Portfolio OS',
            description: 'The main product surface for work, metrics, projects, guided navigation, chat and voice.',
            path: '/',
            aliases: ['/index', '/index.html'],
            role: 'Dashboard',
            capabilities: ['Career narrative', 'Metrics and case studies', 'AI chat and narration', 'Project navigation']
          },
          {
            id: 'video-avatar',
            title: 'AI Video Avatar',
            description: 'A talking-head version of Anchit with grounded answers and voice fallback.',
            path: '/agent',
            aliases: ['/agent.html'],
            capabilities: ['Talking-head responses', 'Voice fallback', 'Mic input', 'Portfolio-grounded Q&A'],
            dependsOn: ['portfolio-os']
          },
          {
            id: 'third-eye',
            title: 'The Third Eye',
            description: 'An agent-orchestrated personal AI operating system with memory, tasks, tools and personas.',
            path: 'https://the-third-eye-anchit.vercel.app/',
            external: true,
            capabilities: ['Agent personas', 'Memory and RAG', 'Task orchestration', 'Voice and tools'],
            dependsOn: ['portfolio-os']
          }
        ]
      },
      {
        id: 'opportunity',
        title: 'Opportunity & Productivity',
        short: 'Find opportunities, turn inputs into actions and keep momentum visible.',
        dashboard: 'jobhunt',
        apps: [
          {
            id: 'jobhunt',
            title: 'JobHunt',
            description: 'A live multi-board job search tool with direct apply links and lightweight authentication.',
            path: '/jobhunt',
            aliases: ['/jobhunt.html'],
            role: 'Dashboard',
            capabilities: ['Live job aggregation', 'De-duplication', 'Google sign-in', 'Direct apply links']
          },
          {
            id: 'task-tracker',
            title: 'Task Tracker',
            description: 'Turns meetings, emails and voice notes into movable, prioritized work.',
            path: 'https://personal-ai-assistant-anchit.vercel.app/',
            external: true,
            capabilities: ['Task extraction', 'Drag-and-drop board', 'Priorities and owners', 'Voice capture']
          },
          {
            id: 'life-engine',
            title: 'LifeEngine',
            description: 'A personalized wellness planner that turns goals into a practical daily routine.',
            path: 'https://th-life-engine.vercel.app/',
            external: true,
            capabilities: ['Goal context', 'Daily planning', 'Check-ins', 'Adaptive wellness guidance']
          }
        ]
      },
      {
        id: 'intelligence',
        title: 'Intelligence & Research',
        short: 'Read the market, diagnose performance and identify the real constraint.',
        dashboard: 'd2c-lifecycle-os',
        apps: [
          {
            id: 'd2c-lifecycle-os',
            title: 'D2C LifeCycle OS',
            description: 'The universal entry point for brand benchmarking and lifecycle strategy.',
            path: '/d2c-lifecycle-os',
            aliases: ['/d2c-lifecycle-os.html'],
            role: 'Dashboard',
            capabilities: ['Brand and category benchmark', 'Lifecycle blueprint', 'Segment strategy', 'KPI plan']
          },
          {
            id: 'lifecycle-analysis',
            title: 'Data Analysis',
            description: 'KPI diagnostics, signal detection and revenue decomposition in one workspace.',
            path: '/lifecycle-os-analysis',
            aliases: ['/lifecycle-os-analysis.html'],
            capabilities: ['KPI diagnostics', 'Revenue decomposition', 'Cohort heatmaps', 'CSV export'],
            dependsOn: ['d2c-lifecycle-os']
          },
          {
            id: 'lifecycle-intel',
            title: 'Market Intelligence',
            description: 'Competitive context, market benchmarks and opportunity signals.',
            path: '/lifecycle-os-intel',
            aliases: ['/lifecycle-os-intel.html'],
            capabilities: ['Competitive context', 'Channel benchmarks', 'Category baselines', 'Opportunity signals'],
            dependsOn: ['d2c-lifecycle-os']
          },
          {
            id: 'lifecycle-cohorts',
            title: 'Cohort Intelligence',
            description: 'Retention curves, segment health and lifecycle trigger discovery.',
            path: '/lifecycle-os-cohorts',
            aliases: ['/lifecycle-os-cohorts.html'],
            capabilities: ['Retention curves', 'Segment health', 'Lifecycle triggers', 'Repeat-rate analysis'],
            dependsOn: ['lifecycle-analysis']
          },
          {
            id: 'lifecycle-audit',
            title: 'Lifecycle Audit',
            description: 'Find funnel leakage, journey gaps and the highest-leverage fixes.',
            path: '/lifecycle-os-audit',
            aliases: ['/lifecycle-os-audit.html'],
            capabilities: ['Leak detection', 'Journey gap analysis', 'Prioritized fixes', 'Impact framing'],
            dependsOn: ['lifecycle-analysis', 'lifecycle-intel']
          }
        ]
      },
      {
        id: 'strategy',
        title: 'Strategy & Planning',
        short: 'Turn evidence into an operating plan, sequence and approval loop.',
        dashboard: 'lifecycle-os',
        apps: [
          {
            id: 'lifecycle-os',
            title: 'Lifecycle Command Center',
            description: 'The operating dashboard that connects analysis, planning, creation and execution.',
            path: '/lifecycle-os',
            aliases: ['/lifecycle-os.html'],
            role: 'Dashboard',
            capabilities: ['Cross-tool orchestration', 'Workflow handoffs', 'Operating dashboard', 'Shared context']
          },
          {
            id: 'lifecycle-brain',
            title: 'Smart Brain',
            description: 'Agentic campaign generation with confidence, feasibility and approval controls.',
            path: '/lifecycle-os-brain',
            aliases: ['/lifecycle-os-brain.html'],
            capabilities: ['Agentic generation', 'Confidence scoring', 'Feasibility checks', 'Approve or regenerate'],
            dependsOn: ['lifecycle-analysis', 'lifecycle-intel', 'lifecycle-cohorts']
          },
          {
            id: 'lifecycle-calendar',
            title: 'Marketing Calendar',
            description: 'A rolling campaign plan with dates, assets, rationale and previews.',
            path: '/lifecycle-os-calendar',
            aliases: ['/lifecycle-os-calendar.html'],
            capabilities: ['90-day plan', 'Send schedule', 'Asset readiness', 'Mailer previews'],
            dependsOn: ['lifecycle-brain']
          },
          {
            id: 'lifecycle-playbook',
            title: 'Lifecycle Playbook',
            description: 'Reusable recipes, channel rules and execution checklists.',
            path: '/lifecycle-os-playbook',
            aliases: ['/lifecycle-os-playbook.html'],
            capabilities: ['Lifecycle recipes', 'Channel rules', 'Execution checklists', 'Measurement guidance'],
            dependsOn: ['lifecycle-os']
          },
          {
            id: 'lifecycle-frameworks',
            title: 'Framework Library',
            description: 'Decision models and reusable structures for planning and measurement.',
            path: '/lifecycle-os-frameworks',
            aliases: ['/lifecycle-os-frameworks.html'],
            capabilities: ['Planning frameworks', 'Decision models', 'Templates', 'Measurement structure'],
            dependsOn: ['lifecycle-os']
          },
          {
            id: 'lifecycle-ask',
            title: 'Ask the OS',
            description: 'Natural-language answers and recommended actions across lifecycle tools.',
            path: '/lifecycle-os-ask',
            aliases: ['/lifecycle-os-ask.html'],
            capabilities: ['Natural-language query', 'Cross-tool answers', 'Action recommendations', 'Context recall'],
            dependsOn: ['lifecycle-os']
          }
        ]
      },
      {
        id: 'creative',
        title: 'Creative & Content',
        short: 'Translate strategy into channel-ready copy, pages, assets and media.',
        dashboard: 'lifecycle-studio',
        apps: [
          {
            id: 'lifecycle-studio',
            title: 'Campaign Studio',
            description: 'The production hub for campaign briefs, mailers and channel outputs.',
            path: '/lifecycle-os-studio',
            aliases: ['/lifecycle-os-studio.html'],
            role: 'Dashboard',
            capabilities: ['Campaign briefs', 'Email variants', 'Production outputs', 'Calendar handoff'],
            dependsOn: ['lifecycle-calendar']
          },
          {
            id: 'lifecycle-creative',
            title: 'Creative Lab',
            description: 'Concept generation, asset direction and creative quality review.',
            path: '/lifecycle-os-creative',
            aliases: ['/lifecycle-os-creative.html'],
            capabilities: ['Concept generation', 'Asset direction', 'Creative QA', 'Variant exploration'],
            dependsOn: ['lifecycle-studio']
          },
          {
            id: 'lifecycle-landing',
            title: 'Landing Page Builder',
            description: 'Offer architecture and conversion-focused landing page concepts.',
            path: '/lifecycle-os-landing',
            aliases: ['/lifecycle-os-landing.html'],
            capabilities: ['Offer architecture', 'Page structure', 'Conversion copy', 'Experience preview'],
            dependsOn: ['lifecycle-studio']
          },
          {
            id: 'lifecycle-social',
            title: 'Social Studio',
            description: 'Channel-native social content and coordinated publishing plans.',
            path: '/lifecycle-os-social',
            aliases: ['/lifecycle-os-social.html'],
            capabilities: ['Channel-native posts', 'Content planning', 'Copy variants', 'Campaign alignment'],
            dependsOn: ['lifecycle-studio']
          },
          {
            id: 'lifecycle-ads',
            title: 'Ads Studio',
            description: 'Paid social and search concepts aligned with the lifecycle plan.',
            path: '/lifecycle-os-ads',
            aliases: ['/lifecycle-os-ads.html'],
            capabilities: ['Paid social concepts', 'Search ads', 'Targeting alignment', 'Variant generation'],
            dependsOn: ['lifecycle-studio']
          },
          {
            id: 'lifecycle-music',
            title: 'Music & Audio',
            description: 'Campaign sound, audio concepts and music-led creative direction.',
            path: '/lifecycle-os-music',
            aliases: ['/lifecycle-os-music.html'],
            capabilities: ['Audio concepts', 'Brand sound', 'Campaign soundtrack', 'Creative prompts'],
            dependsOn: ['lifecycle-studio']
          },
          {
            id: 'mailer-architect',
            title: 'Mailer Architect',
            description: 'A universal multi-model HTML email generator for any communication context.',
            path: 'https://marketing-mailers-html-architect.vercel.app/',
            external: true,
            capabilities: ['Context detection', 'Multi-model copy', 'HTML output', 'Quality scoring'],
            dependsOn: ['lifecycle-studio']
          },
          {
            id: 'musicgenai',
            title: 'MusicGenAI',
            description: 'A prompt-to-song pipeline covering lyrics, vocals and generation history.',
            path: 'https://music-gen-ai-blue.vercel.app/',
            external: true,
            capabilities: ['Prompt parsing', 'Lyric generation', 'Vocal synthesis', 'Generation history']
          }
        ]
      },
      {
        id: 'automation',
        title: 'Agents & Automation',
        short: 'Connect data, automate workflows and make complex tools conversational.',
        dashboard: 'lifecycle-connectors',
        apps: [
          {
            id: 'lifecycle-connectors',
            title: 'Connectors',
            description: 'The data-source and system-integration map for the lifecycle suite.',
            path: '/lifecycle-os-connectors',
            aliases: ['/lifecycle-os-connectors.html'],
            role: 'Dashboard',
            capabilities: ['Data-source map', 'ESP connections', 'Analytics connections', 'Context ingestion'],
            dependsOn: ['lifecycle-os']
          },
          {
            id: 'all-in-one-lp-agent',
            title: 'All-in-One LP Agent',
            description: 'One landing-page agent for narration, voice, chat and recommendations.',
            path: '/#project-agentlp',
            capabilities: ['Page narration', 'Two-way voice', 'Grounded chat', 'Product recommendations'],
            dependsOn: ['portfolio-os']
          },
          {
            id: 'ai-telesuite',
            title: 'AI TeleSuite',
            description: 'Real-time transcription, pitch scoring and conversion assistance.',
            path: 'https://ai-tele-suite.vercel.app/',
            external: true,
            capabilities: ['Live transcription', 'Pitch scoring', 'Objection hints', 'Post-call feedback']
          },
          {
            id: 'hey-yaara',
            title: 'Hey Yaara',
            description: 'A voice-first AI companion designed for elderly users.',
            path: 'https://hey-yaara.vercel.app/',
            external: true,
            capabilities: ['One-button voice UX', 'Speech input', 'Spoken replies', 'PWA installation']
          }
        ]
      },
      {
        id: 'learning',
        title: 'Learning & Enablement',
        short: 'Turn any goal into a clear, visual and confidence-building path.',
        dashboard: 'how-to-engine',
        apps: [
          {
            id: 'how-to-engine',
            title: 'Omni How-To Engine',
            description: 'A visual-first learning engine that synthesizes multiple model outputs into one guided tutorial.',
            path: '/how-to-2',
            prefix: true,
            role: 'Dashboard',
            capabilities: ['Prompt enhancement', 'Multi-model synthesis', 'Visual step cards', 'Video-generation wrappers']
          }
        ]
      }
    ]
  };

  var runtimeApps = [];
  var state = readState();
  var root = null;
  var panel = null;
  var launcher = null;
  var searchInput = null;
  var lastFocus = null;
  var currentApp = findCurrentApp();

  if (currentApp) {
    markStarted(currentApp.id, false);
    state.current = currentApp.id;
    writeState();
  }

  function readState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        started: parsed.started && typeof parsed.started === 'object' ? parsed.started : {},
        completed: parsed.completed && typeof parsed.completed === 'object' ? parsed.completed : {},
        lastOpened: typeof parsed.lastOpened === 'string' ? parsed.lastOpened : null,
        current: typeof parsed.current === 'string' ? parsed.current : null
      };
    } catch (error) {
      return { started: {}, completed: {}, lastOpened: null, current: null };
    }
  }

  function writeState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // Storage can be disabled in private or embedded contexts. The map still works.
    }
  }

  function allDepartments() {
    if (!runtimeApps.length) return MAP.departments;
    var copy = MAP.departments.map(function (department) {
      return {
        id: department.id,
        title: department.title,
        short: department.short,
        dashboard: department.dashboard,
        apps: department.apps.slice()
      };
    });
    runtimeApps.forEach(function (entry) {
      var department = copy.filter(function (candidate) { return candidate.id === entry.departmentId; })[0];
      if (department) department.apps.push(entry.app);
    });
    return copy;
  }

  function allApps() {
    var output = [];
    allDepartments().forEach(function (department) {
      department.apps.forEach(function (app) {
        output.push({ app: app, department: department });
      });
    });
    return output;
  }

  function cleanPath(value) {
    var path = String(value || '/').split('?')[0].split('#')[0] || '/';
    path = path.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return path || '/';
  }

  function appMatchesLocation(app) {
    if (!app || app.external) return false;
    var actual = cleanPath(window.location.pathname);
    var candidates = [app.path].concat(app.aliases || []).map(cleanPath);
    return candidates.some(function (candidate) {
      if (candidate === '/') return actual === '/';
      if (app.prefix) return actual === candidate || actual.indexOf(candidate + '/') === 0;
      return actual === candidate;
    });
  }

  function findCurrentApp() {
    var found = null;
    allApps().some(function (entry) {
      if (appMatchesLocation(entry.app)) {
        found = entry.app;
        return true;
      }
      return false;
    });
    return found;
  }

  function markStarted(id, persist) {
    if (!id) return;
    state.started[id] = Date.now();
    if (persist !== false) writeState();
  }

  function cycleStatus(id) {
    if (state.completed[id]) {
      delete state.completed[id];
      delete state.started[id];
    } else if (state.started[id]) {
      state.completed[id] = Date.now();
    } else {
      state.started[id] = Date.now();
    }
    writeState();
    render();
    updateLauncher();
    dispatch('status-change', { appId: id, status: statusOf(id) });
  }

  function statusOf(id) {
    if (state.completed[id]) return 'completed';
    if (currentApp && currentApp.id === id) return 'current';
    if (state.started[id]) return 'started';
    return 'available';
  }

  function progress() {
    var apps = allApps();
    var completed = apps.filter(function (entry) { return !!state.completed[entry.app.id]; }).length;
    var started = apps.filter(function (entry) { return !!state.started[entry.app.id] || !!state.completed[entry.app.id]; }).length;
    return { completed: completed, started: started, total: apps.length };
  }

  function unmetDependencies(app) {
    return (app.dependsOn || []).filter(function (id) { return !state.completed[id]; });
  }

  function recommendedNext() {
    var apps = allApps();
    var eligible = apps.filter(function (entry) {
      return !state.completed[entry.app.id] && unmetDependencies(entry.app).length === 0;
    });
    if (!eligible.length) return apps.filter(function (entry) { return !state.completed[entry.app.id]; })[0] || null;
    var sameDepartment = eligible.filter(function (entry) {
      return currentApp && entry.department.apps.some(function (app) { return app.id === currentApp.id; });
    });
    return sameDepartment[0] || eligible[0] || null;
  }

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent('anchit-skill-map:' + name, { detail: detail || {} }));
    } catch (error) {
      // CustomEvent is not essential for the UI.
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function icon(name) {
    var icons = {
      map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
      search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
      arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
      check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
      reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
      external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M10 14 19 5"/><path d="M19 13v6H5V5h6"/></svg>'
    };
    return icons[name] || '';
  }

  function createRoot() {
    if (document.getElementById(ROOT_ID)) return;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'asm-root';
    root.innerHTML = [
      '<button class="asm-launcher" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="asm-panel">',
      '  <span class="asm-launcher-icon">' + icon('map') + '</span>',
      '  <span class="asm-launcher-copy"><strong>App Skill Map</strong><small data-asm-progress></small></span>',
      '  <span class="asm-launcher-ring" aria-hidden="true"><span></span></span>',
      '</button>',
      '<div class="asm-shell" aria-hidden="true">',
      '  <button class="asm-backdrop" type="button" tabindex="-1" aria-label="Close app skill map"></button>',
      '  <section class="asm-panel" id="asm-panel" role="dialog" aria-modal="true" aria-labelledby="asm-title">',
      '    <header class="asm-header">',
      '      <div class="asm-heading">',
      '        <span class="asm-kicker">Shared capability system</span>',
      '        <h2 id="asm-title">' + escapeHtml(MAP.title) + '</h2>',
      '        <p>' + escapeHtml(MAP.subtitle) + '</p>',
      '      </div>',
      '      <button class="asm-icon-button asm-close" type="button" aria-label="Close app skill map">' + icon('close') + '</button>',
      '    </header>',
      '    <div class="asm-toolbar">',
      '      <label class="asm-search">' + icon('search') + '<span class="asm-sr-only">Search apps and capabilities</span><input type="search" placeholder="Search apps, outcomes or capabilities" autocomplete="off"></label>',
      '      <div class="asm-summary" aria-live="polite"></div>',
      '      <button class="asm-text-button asm-reset" type="button">' + icon('reset') + '<span>Reset progress</span></button>',
      '    </div>',
      '    <div class="asm-recommendation" hidden></div>',
      '    <div class="asm-content">',
      '      <div class="asm-tree" data-asm-tree></div>',
      '    </div>',
      '    <footer class="asm-footer">',
      '      <span>Tip: press <kbd>⌘/Ctrl</kbd> + <kbd>K</kbd> anywhere.</span>',
      '      <span>Progress is stored only in this browser.</span>',
      '    </footer>',
      '  </section>',
      '</div>'
    ].join('');
    document.body.appendChild(root);

    launcher = root.querySelector('.asm-launcher');
    panel = root.querySelector('.asm-shell');
    searchInput = root.querySelector('.asm-search input');

    launcher.addEventListener('click', open);
    root.querySelector('.asm-backdrop').addEventListener('click', close);
    root.querySelector('.asm-close').addEventListener('click', close);
    root.querySelector('.asm-reset').addEventListener('click', resetProgress);
    searchInput.addEventListener('input', render);
    panel.addEventListener('click', handlePanelClick);
    panel.addEventListener('keydown', trapFocus);
    document.addEventListener('keydown', handleGlobalKey);

    updateLauncher();
  }

  function updateLauncher() {
    if (!launcher) return;
    var p = progress();
    var small = launcher.querySelector('[data-asm-progress]');
    var ring = launcher.querySelector('.asm-launcher-ring');
    if (small) small.textContent = p.completed + ' complete · ' + p.started + ' explored';
    if (ring) ring.style.setProperty('--asm-ring-progress', String(p.total ? p.completed / p.total : 0));
    launcher.setAttribute('aria-label', 'Open app skill map. ' + p.completed + ' of ' + p.total + ' apps completed.');
  }

  function open() {
    createRoot();
    lastFocus = document.activeElement;
    panel.classList.add('asm-open');
    panel.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('asm-modal-open');
    render();
    window.setTimeout(function () { if (searchInput) searchInput.focus(); }, 30);
    dispatch('open', { currentApp: currentApp ? currentApp.id : null });
  }

  function close() {
    if (!panel) return;
    panel.classList.remove('asm-open');
    panel.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('asm-modal-open');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    dispatch('close');
  }

  function handleGlobalKey(event) {
    if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      if (panel && panel.classList.contains('asm-open')) close(); else open();
      return;
    }
    if (event.key === 'Escape' && panel && panel.classList.contains('asm-open')) close();
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    var focusable = panel.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function resetProgress() {
    var accepted = window.confirm('Reset explored and completed app progress on this device?');
    if (!accepted) return;
    state = { started: {}, completed: {}, lastOpened: null, current: currentApp ? currentApp.id : null };
    if (currentApp) markStarted(currentApp.id, false);
    writeState();
    render();
    updateLauncher();
    dispatch('reset');
  }

  function searchableText(department, app) {
    return [department.title, department.short, app.title, app.description, app.role]
      .concat(app.capabilities || [])
      .join(' ')
      .toLowerCase();
  }

  function render() {
    if (!root) return;
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var tree = root.querySelector('[data-asm-tree]');
    var p = progress();
    var summary = root.querySelector('.asm-summary');
    var next = recommendedNext();
    var recommendation = root.querySelector('.asm-recommendation');

    summary.innerHTML = '<strong>' + p.completed + '/' + p.total + '</strong> complete <span aria-hidden="true">·</span> <strong>' + p.started + '</strong> explored';

    if (next && !query) {
      recommendation.hidden = false;
      recommendation.innerHTML = '<span><strong>Suggested next:</strong> ' + escapeHtml(next.app.title) + ' — ' + escapeHtml(next.app.description) + '</span><button type="button" data-asm-open="' + escapeHtml(next.app.id) + '">Open ' + icon('arrow') + '</button>';
    } else {
      recommendation.hidden = true;
      recommendation.innerHTML = '';
    }

    var departmentHtml = allDepartments().map(function (department, departmentIndex) {
      var apps = department.apps.filter(function (app) {
        return !query || searchableText(department, app).indexOf(query) !== -1;
      });
      if (!apps.length) return '';
      var completeCount = apps.filter(function (app) { return !!state.completed[app.id]; }).length;
      return [
        '<section class="asm-department" data-asm-department="' + escapeHtml(department.id) + '" style="--asm-branch-index:' + departmentIndex + '">',
        '  <header class="asm-department-head">',
        '    <span class="asm-department-index">' + String(departmentIndex + 1).padStart(2, '0') + '</span>',
        '    <div><h3>' + escapeHtml(department.title) + '</h3><p>' + escapeHtml(department.short) + '</p></div>',
        '    <span class="asm-department-progress">' + completeCount + '/' + apps.length + '</span>',
        '  </header>',
        '  <div class="asm-node-stack">',
        apps.map(function (app) { return renderAppCard(app, department); }).join(''),
        '  </div>',
        '</section>'
      ].join('');
    }).join('');

    if (!departmentHtml) {
      departmentHtml = '<div class="asm-empty"><strong>No matching capability.</strong><span>Try a broader search such as “analytics”, “voice”, “creative” or “learning”.</span></div>';
    }

    tree.innerHTML = [
      '<section class="asm-brain-node">',
      '  <span class="asm-brain-orbit" aria-hidden="true"><i></i><i></i><i></i></span>',
      '  <div class="asm-brain-copy">',
      '    <span class="asm-node-eyebrow">Shared brain</span>',
      '    <h3>' + escapeHtml(MAP.brain.title) + '</h3>',
      '    <p>' + escapeHtml(MAP.brain.description) + '</p>',
      '    <div class="asm-capability-row">' + MAP.brain.capabilities.map(function (capability) { return '<span>' + escapeHtml(capability) + '</span>'; }).join('') + '</div>',
      '  </div>',
      '  <a href="' + escapeHtml(MAP.brain.path) + '" class="asm-brain-action">Talk to the brain ' + icon('arrow') + '</a>',
      '</section>',
      '<div class="asm-trunk" aria-hidden="true"></div>',
      '<div class="asm-departments">' + departmentHtml + '</div>'
    ].join('');
  }

  function renderAppCard(app, department) {
    var status = statusOf(app.id);
    var isCurrent = !!(currentApp && currentApp.id === app.id);
    var unmet = unmetDependencies(app);
    var statusLabel = isCurrent
      ? (status === 'completed' ? 'You are here · Complete' : 'You are here')
      : status === 'completed' ? 'Completed' : status === 'started' ? 'In progress' : 'Available';
    var actionLabel = app.external ? 'Open external app' : (status === 'current' ? 'View current app' : 'Open app');
    var dependencyCopy = unmet.length ? unmet.length + ' suggested prerequisite' + (unmet.length > 1 ? 's' : '') : 'Ready to explore';
    return [
      '<article class="asm-app-node asm-status-' + status + (isCurrent ? ' asm-is-current' : '') + '" data-asm-app="' + escapeHtml(app.id) + '">',
      '  <div class="asm-app-topline">',
      '    <span class="asm-status"><i aria-hidden="true"></i>' + escapeHtml(statusLabel) + '</span>',
      app.role ? '<span class="asm-role">' + escapeHtml(app.role) + '</span>' : '',
      '  </div>',
      '  <h4>' + escapeHtml(app.title) + '</h4>',
      '  <p>' + escapeHtml(app.description) + '</p>',
      '  <div class="asm-capabilities">' + (app.capabilities || []).map(function (capability) { return '<span>' + escapeHtml(capability) + '</span>'; }).join('') + '</div>',
      '  <div class="asm-app-meta">',
      '    <span class="asm-dependency ' + (unmet.length ? 'asm-has-unmet' : '') + '">' + escapeHtml(dependencyCopy) + '</span>',
      '  </div>',
      '  <div class="asm-app-actions">',
      '    <button type="button" class="asm-open-app" data-asm-open="' + escapeHtml(app.id) + '">' + escapeHtml(actionLabel) + (app.external ? icon('external') : icon('arrow')) + '</button>',
      '    <button type="button" class="asm-cycle-status" data-asm-cycle="' + escapeHtml(app.id) + '" aria-label="Change progress for ' + escapeHtml(app.title) + '">' + icon('check') + '<span>' + (status === 'completed' ? 'Reset' : status === 'started' || status === 'current' ? 'Complete' : 'Start') + '</span></button>',
      '  </div>',
      '</article>'
    ].join('');
  }

  function handlePanelClick(event) {
    var cycleButton = event.target.closest('[data-asm-cycle]');
    if (cycleButton) {
      cycleStatus(cycleButton.getAttribute('data-asm-cycle'));
      return;
    }
    var openButton = event.target.closest('[data-asm-open]');
    if (openButton) {
      openApp(openButton.getAttribute('data-asm-open'));
    }
  }

  function openApp(id) {
    var entry = allApps().filter(function (candidate) { return candidate.app.id === id; })[0];
    if (!entry) return;
    var app = entry.app;
    markStarted(app.id, false);
    state.lastOpened = app.id;
    writeState();
    updateLauncher();
    dispatch('navigate', { appId: app.id, path: app.path, external: !!app.external });
    if (app.external) {
      window.open(app.path, '_blank', 'noopener,noreferrer');
      render();
      return;
    }
    if (appMatchesLocation(app)) {
      close();
      if (app.path.indexOf('#') !== -1) window.location.hash = app.path.split('#')[1];
      return;
    }
    window.location.assign(app.path);
  }

  function registerApp(departmentId, app) {
    if (!departmentId || !app || !app.id || !app.title || !app.path) return false;
    var duplicate = allApps().some(function (entry) { return entry.app.id === app.id; });
    if (duplicate) return false;
    runtimeApps.push({ departmentId: departmentId, app: app });
    currentApp = findCurrentApp();
    if (currentApp) markStarted(currentApp.id, true);
    if (root) {
      render();
      updateLauncher();
    }
    return true;
  }

  window.AnchitSkillMap = {
    open: open,
    close: close,
    getMap: function () { return MAP; },
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    getCurrentApp: function () { return currentApp; },
    setStatus: function (id, status) {
      delete state.started[id];
      delete state.completed[id];
      if (status === 'started') state.started[id] = Date.now();
      if (status === 'completed') {
        state.started[id] = Date.now();
        state.completed[id] = Date.now();
      }
      writeState();
      if (root) {
        render();
        updateLauncher();
      }
    },
    registerApp: registerApp
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createRoot, { once: true });
  } else {
    createRoot();
  }
}());
