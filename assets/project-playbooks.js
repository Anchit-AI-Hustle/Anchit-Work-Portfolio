/*
 * Anchit Project SkillTree & Guide Library
 *
 * A dependency-free project/workflow layer shared by every built application.
 * It converts every app capability into a trackable project node, then generates
 * an original four-part guide pack for that project: Quickstart, Operator Prompt,
 * Evidence Audit and Improvement Loop.
 *
 * The interaction model borrows the useful organisational ideas of visual skill
 * trees and curated prompt libraries; no third-party prompts, tracking scripts,
 * access tokens or gated reference content are copied or embedded.
 */
(function () {
  'use strict';

  if (window.__ANCHIT_PROJECT_PLAYBOOKS_BOOTED__) return;
  window.__ANCHIT_PROJECT_PLAYBOOKS_BOOTED__ = true;

  var ROOT_ID = 'anchit-project-playbooks-root';
  var STORAGE_KEY = 'anchit-project-playbooks-v1';
  var DEFAULT_CAPABILITIES = ['Plan the work', 'Build the output', 'Review the result', 'Improve the system'];
  var GUIDE_KINDS = [
    {
      id: 'quickstart',
      title: 'Quickstart Guide',
      type: 'Guide',
      model: 'Universal',
      description: 'A concise, ordered path from prerequisites to a checked deliverable.'
    },
    {
      id: 'operator',
      title: 'Operator Mega-Prompt',
      type: 'Prompt',
      model: 'Claude',
      description: 'A role, context, task, constraints and output-format prompt for execution.'
    },
    {
      id: 'audit',
      title: 'Evidence Audit Prompt',
      type: 'Audit',
      model: 'ChatGPT',
      description: 'An evidence-first review that separates verified facts, gaps and corrective actions.'
    },
    {
      id: 'improve',
      title: '9.5/10 Improvement Loop',
      type: 'Workflow',
      model: 'Universal',
      description: 'A structured critique, revision and quality-gate loop with a visible change log.'
    }
  ];

  var FALLBACK_APPS = [
    { id: 'portfolio-os', title: 'Interactive Portfolio OS', path: '/', department: { id: 'portfolio', title: 'Portfolio & Identity' }, capabilities: ['Career narrative', 'Metrics and case studies', 'AI chat and narration', 'Project navigation'] },
    { id: 'video-avatar', title: 'AI Video Avatar', path: '/agent', department: { id: 'portfolio', title: 'Portfolio & Identity' }, capabilities: ['Talking-head responses', 'Voice fallback', 'Mic input', 'Portfolio-grounded Q&A'] },
    { id: 'jobhunt', title: 'JobHunt', path: '/jobhunt', department: { id: 'opportunity', title: 'Opportunity & Productivity' }, capabilities: ['Live job aggregation', 'De-duplication', 'Job matching', 'Direct apply links'] },
    { id: 'd2c-lifecycle-os', title: 'D2C LifeCycle OS', path: '/d2c-lifecycle-os', department: { id: 'intelligence', title: 'Intelligence & Research' }, capabilities: ['Brand and category benchmark', 'Lifecycle blueprint', 'Segment strategy', 'KPI plan'] },
    { id: 'lifecycle-os', title: 'Lifecycle Command Center', path: '/lifecycle-os', department: { id: 'strategy', title: 'Strategy & Planning' }, capabilities: ['Cross-tool orchestration', 'Workflow handoffs', 'Operating dashboard', 'Shared context'] },
    { id: 'lifecycle-studio', title: 'Campaign Studio', path: '/lifecycle-os-studio', department: { id: 'creative', title: 'Creative & Content' }, capabilities: ['Campaign briefs', 'Email variants', 'Production outputs', 'Calendar handoff'] },
    { id: 'lifecycle-connectors', title: 'Connectors', path: '/lifecycle-os-connectors', department: { id: 'automation', title: 'Agents & Automation' }, capabilities: ['Data-source map', 'Authentication plan', 'Schema mapping', 'Sync monitoring'] },
    { id: 'how-to-engine', title: 'Omni How-To Engine', path: '/how-to-2', prefix: true, department: { id: 'learning', title: 'Learning & Enablement' }, capabilities: ['Prompt enhancement', 'Multi-model synthesis', 'Visual step cards', 'Video-generation wrappers'] }
  ];

  var HOST_APP_IDS = {
    'the-third-eye-anchit.vercel.app': 'third-eye',
    'personal-ai-assistant-anchit.vercel.app': 'task-tracker',
    'th-life-engine.vercel.app': 'life-engine',
    'marketing-mailers-html-architect.vercel.app': 'mailer-architect',
    'music-gen-ai-blue.vercel.app': 'musicgenai',
    'ai-tele-suite.vercel.app': 'ai-telesuite',
    'hey-yaara.vercel.app': 'hey-yaara'
  };

  var ROLE_BY_DEPARTMENT = {
    portfolio: 'executive portfolio strategist and conversational experience designer',
    opportunity: 'productivity systems architect and opportunity operations lead',
    intelligence: 'senior growth analyst and evidence-led research director',
    strategy: 'lifecycle strategy director and operating-model architect',
    creative: 'creative director, conversion copywriter and production architect',
    automation: 'principal AI systems architect and workflow automation lead',
    learning: 'instructional design lead specialising in visual, ADHD-friendly learning'
  };

  var state = readState();
  var apps = [];
  var projects = [];
  var guides = [];
  var currentApp = null;
  var root = null;
  var shell = null;
  var launcher = null;
  var content = null;
  var searchInput = null;
  var scopeSelect = null;
  var modelSelect = null;
  var typeSelect = null;
  var summary = null;
  var drawer = null;
  var toast = null;
  var lastFocus = null;
  var activeTab = 'tree';
  var favoriteOnly = false;
  var visibleLimit = 48;
  var selectedGuideId = null;
  var builderProjectId = null;
  var runtimeProjects = [];
  var runtimeGuides = [];

  function readState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        projects: parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {},
        favorites: parsed.favorites && typeof parsed.favorites === 'object' ? parsed.favorites : {},
        copies: parsed.copies && typeof parsed.copies === 'object' ? parsed.copies : {},
        profile: parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {},
        lastGuide: typeof parsed.lastGuide === 'string' ? parsed.lastGuide : null
      };
    } catch (error) {
      return { projects: {}, favorites: {}, copies: {}, profile: {}, lastGuide: null };
    }
  }

  function writeState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      // The experience remains usable when browser storage is unavailable.
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

  function slug(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project';
  }

  function cleanPath(value) {
    var path = String(value || '/').split('?')[0].split('#')[0] || '/';
    path = path.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return path || '/';
  }

  function flattenSkillMap() {
    var api = window.AnchitSkillMap;
    if (!api || typeof api.getMap !== 'function') return FALLBACK_APPS.slice();
    try {
      var map = api.getMap();
      var output = [];
      (map.departments || []).forEach(function (department) {
        (department.apps || []).forEach(function (app) {
          var copy = {};
          Object.keys(app).forEach(function (key) { copy[key] = app[key]; });
          copy.department = { id: department.id, title: department.title };
          output.push(copy);
        });
      });
      return output.length ? output : FALLBACK_APPS.slice();
    } catch (error) {
      return FALLBACK_APPS.slice();
    }
  }

  function findCurrentApp() {
    if (window.AnchitSkillMap && typeof window.AnchitSkillMap.getCurrentApp === 'function') {
      try {
        var mapped = window.AnchitSkillMap.getCurrentApp();
        if (mapped) return appById(mapped.id) || mapped;
      } catch (error) {}
    }
    var hostId = HOST_APP_IDS[String(window.location.hostname || '').toLowerCase()];
    if (hostId) return appById(hostId);
    var actual = cleanPath(window.location.pathname);
    var found = null;
    apps.some(function (app) {
      if (app.external) return false;
      var candidates = [app.path].concat(app.aliases || []).map(cleanPath);
      var matched = candidates.some(function (candidate) {
        if (candidate === '/') return actual === '/';
        if (app.prefix) return actual === candidate || actual.indexOf(candidate + '/') === 0;
        return actual === candidate;
      });
      if (matched) found = app;
      return matched;
    });
    return found;
  }

  function appById(id) {
    return apps.filter(function (app) { return app.id === id; })[0] || null;
  }

  function inferCategory(capability, departmentId) {
    var text = String(capability || '').toLowerCase();
    if (/audit|analysis|benchmark|cohort|data|evidence|intel|research|signal|metric|kpi/.test(text)) return 'Research';
    if (/plan|strategy|calendar|framework|blueprint|orchestration|handoff|context/.test(text)) return 'Strategy';
    if (/creative|copy|music|audio|social|ads|landing|mailer|design|image|video|content/.test(text)) return 'Creative';
    if (/agent|voice|chat|transcription|connector|integration|automation|recommendation|sync|auth/.test(text)) return 'Automation';
    if (/learn|tutorial|step|prompt|guide|instruction/.test(text)) return 'Learning';
    if (departmentId === 'portfolio') return 'Identity';
    if (departmentId === 'opportunity') return 'Productivity';
    return 'Build';
  }

  function actionVerb(capability) {
    var text = String(capability || '').trim();
    if (!text) return 'Deliver';
    if (/^(build|create|design|generate|audit|analyse|analyze|plan|map|review|improve|launch|connect|write|produce|define|develop|track|score|route|synthesi[sz]e|ingest)/i.test(text)) return text;
    return 'Deliver ' + text.charAt(0).toLowerCase() + text.slice(1);
  }

  function projectSummary(app, capability) {
    return actionVerb(capability) + ' inside ' + app.title + ' as a focused, evidence-aware project with a clear input, deliverable and quality gate.';
  }

  function buildProjects() {
    var output = [];
    apps.forEach(function (app) {
      var capabilities = Array.isArray(app.capabilities) && app.capabilities.length ? app.capabilities : DEFAULT_CAPABILITIES;
      var previousId = null;
      capabilities.forEach(function (capability, index) {
        var id = app.id + '--' + slug(capability);
        var department = app.department || { id: 'general', title: 'General' };
        output.push({
          id: id,
          appId: app.id,
          appTitle: app.title,
          appPath: app.path,
          external: !!app.external,
          departmentId: department.id,
          departmentTitle: department.title,
          title: capability,
          summary: projectSummary(app, capability),
          category: inferCategory(capability, department.id),
          stage: index + 1,
          role: ROLE_BY_DEPARTMENT[department.id] || 'senior cross-functional operator',
          inputs: 'the relevant source data, existing assets, user context and success criteria',
          deliverable: 'a decision-ready output with evidence, assumptions, risks, next actions and an explicit QA checklist',
          dependsOn: previousId ? [previousId] : []
        });
        previousId = id;
      });
    });
    runtimeProjects.forEach(function (project) { output.push(project); });
    return output;
  }

  function buildGuides() {
    var output = [];
    projects.forEach(function (project) {
      GUIDE_KINDS.forEach(function (kind) {
        output.push({
          id: project.id + '--' + kind.id,
          projectId: project.id,
          appId: project.appId,
          title: kind.title,
          type: kind.type,
          model: kind.model,
          description: kind.description,
          category: project.category,
          updated: 'Jul 2026'
        });
      });
    });
    runtimeGuides.forEach(function (guide) { output.push(guide); });
    return output;
  }

  function projectById(id) {
    return projects.filter(function (project) { return project.id === id; })[0] || null;
  }

  function guideById(id) {
    return guides.filter(function (guide) { return guide.id === id; })[0] || null;
  }

  function projectStatus(id) {
    return state.projects[id] || 'available';
  }

  function setProjectStatus(id, status) {
    if (!projectById(id)) return false;
    if (status !== 'started' && status !== 'completed') delete state.projects[id];
    else state.projects[id] = status;
    writeState();
    syncAppStatus(projectById(id).appId);
    render();
    updateLauncher();
    dispatch('status-change', { projectId: id, status: projectStatus(id) });
    return true;
  }

  function cycleProjectStatus(id) {
    var current = projectStatus(id);
    setProjectStatus(id, current === 'available' ? 'started' : current === 'started' ? 'completed' : 'available');
  }

  function syncAppStatus(appId) {
    if (!window.AnchitSkillMap || typeof window.AnchitSkillMap.setStatus !== 'function') return;
    var related = projects.filter(function (project) { return project.appId === appId; });
    if (!related.length) return;
    var completed = related.every(function (project) { return projectStatus(project.id) === 'completed'; });
    var started = related.some(function (project) { return projectStatus(project.id) !== 'available'; });
    try {
      window.AnchitSkillMap.setStatus(appId, completed ? 'completed' : started ? 'started' : 'available');
    } catch (error) {}
  }

  function progress() {
    var completed = projects.filter(function (project) { return projectStatus(project.id) === 'completed'; }).length;
    var started = projects.filter(function (project) { return projectStatus(project.id) === 'started'; }).length;
    return { completed: completed, started: started, total: projects.length, guides: guides.length };
  }

  function placeholder(value, fallback) {
    var text = String(value || '').trim();
    return text || '[' + fallback + ']';
  }

  function profileValues(extra) {
    var profile = state.profile || {};
    var values = {
      goal: profile.goal || '',
      context: profile.context || '',
      inputs: profile.inputs || '',
      constraints: profile.constraints || '',
      output: profile.output || ''
    };
    Object.keys(extra || {}).forEach(function (key) { values[key] = extra[key]; });
    return values;
  }

  function guidePrompt(guide, values) {
    var project = projectById(guide.projectId);
    if (!project) return '';
    values = profileValues(values || {});
    var goal = placeholder(values.goal, 'Define the exact outcome and success metric');
    var context = placeholder(values.context, 'Add brand, audience, market, user or operating context');
    var inputs = placeholder(values.inputs, 'Paste or attach the available source material and data');
    var constraints = placeholder(values.constraints, 'List legal, brand, technical, timing and resource constraints');
    var output = placeholder(values.output, project.deliverable);

    if (guide.type === 'Guide') {
      return [
        '# ' + project.appTitle + ' — ' + project.title + ' Quickstart',
        '',
        '## Outcome',
        goal,
        '',
        '## Context',
        context,
        '',
        '## Prerequisites',
        '1. Confirm the source of truth and owner for the work.',
        '2. Gather ' + project.inputs + '.',
        '3. Define what “done” means before producing anything.',
        '',
        '## Execution path',
        '1. Frame the problem in one sentence and separate facts from assumptions.',
        '2. Inspect the supplied inputs: ' + inputs + '.',
        '3. ' + actionVerb(project.title) + ' using the smallest complete sequence of actions.',
        '4. Check the work against the constraints: ' + constraints + '.',
        '5. Produce ' + output + '.',
        '6. Record open questions, evidence gaps and the next recommended action.',
        '',
        '## Common failure modes',
        '- Starting production before the success criterion is measurable.',
        '- Treating missing data as permission to invent facts.',
        '- Delivering an attractive output without an operational next step.',
        '',
        '## Completion checklist',
        '- [ ] Sources and assumptions are visibly separated.',
        '- [ ] The result is usable without additional interpretation.',
        '- [ ] Risks, dependencies and owners are explicit.',
        '- [ ] The final output matches the requested format.'
      ].join('\n');
    }

    if (guide.type === 'Audit') {
      return [
        'ROLE',
        'Act as a forensic ' + project.role + ' and independent quality auditor.',
        '',
        'CONTEXT',
        'Application: ' + project.appTitle,
        'Project: ' + project.title,
        'Operating context: ' + context,
        'Source material: ' + inputs,
        '',
        'TASK',
        'Audit the project output against its stated goal: ' + goal + '.',
        'Recompute or re-check every material claim from the supplied source evidence. Do not trust summaries, scores or conclusions embedded in the output.',
        '',
        'CONSTRAINTS',
        '- Use only verifiable evidence from the supplied material.',
        '- Mark unsupported claims as UNVERIFIED rather than filling gaps with assumptions.',
        '- Separate factual errors, logic errors, UX issues, implementation defects and missing evidence.',
        '- Apply these additional constraints: ' + constraints + '.',
        '',
        'OUTPUT FORMAT',
        '1. Executive verdict and confidence level.',
        '2. PASS / FAIL table for every check, with evidence.',
        '3. Complete anomaly list, root cause and severity.',
        '4. Corrected values or implementation instructions.',
        '5. Prioritized remediation plan.',
        '6. Final audit score with a transparent scoring formula.',
        '',
        'Expected deliverable: ' + output + '.'
      ].join('\n');
    }

    if (guide.type === 'Workflow') {
      return [
        'ROLE',
        'Act as a principal ' + project.role + ' and exacting quality editor.',
        '',
        'CONTEXT',
        'Application: ' + project.appTitle,
        'Project: ' + project.title,
        'Goal: ' + goal,
        'Context: ' + context,
        'Inputs: ' + inputs,
        '',
        'TASK',
        'Evaluate the current output, identify the highest-impact weaknesses, revise it, and repeat the evaluation until the output reaches at least 9.5/10 against the rubric below or until a genuine evidence blocker prevents further improvement.',
        '',
        'QUALITY RUBRIC',
        '- Accuracy and evidence: 25%',
        '- Completeness and edge-case coverage: 20%',
        '- Usability and actionability: 20%',
        '- Clarity and information hierarchy: 15%',
        '- Technical or operational feasibility: 10%',
        '- Originality and craft: 10%',
        '',
        'CONSTRAINTS',
        '- Never inflate the score to pass the gate.',
        '- Do not invent evidence, performance results or completed implementation.',
        '- Preserve working behavior unless a change is necessary and explained.',
        '- Respect: ' + constraints + '.',
        '',
        'OUTPUT FORMAT',
        '1. Initial score by rubric dimension.',
        '2. Ranked weakness list.',
        '3. Revised final output: ' + output + '.',
        '4. Final score by rubric dimension.',
        '5. Concise change log and remaining blockers.'
      ].join('\n');
    }

    return [
      'ROLE',
      'You are a ' + project.role + ' with deep hands-on experience delivering ' + project.title.toLowerCase() + '.',
      '',
      'CONTEXT',
      'Application: ' + project.appTitle,
      'Project: ' + project.title,
      'Desired outcome: ' + goal,
      'Operating context: ' + context,
      'Available inputs: ' + inputs,
      '',
      'TASK',
      actionVerb(project.title) + '. Work from the supplied evidence, break the work into an ordered execution plan, produce the requested deliverable, and include alternative valid paths when the decision genuinely branches.',
      '',
      'CONSTRAINTS',
      '- Do not invent facts, metrics, user research or implementation status.',
      '- Make every assumption explicit and label the evidence needed to verify it.',
      '- Optimize for a user who needs the result to be clear, actionable and ready to use.',
      '- Follow these additional constraints: ' + constraints + '.',
      '',
      'OUTPUT FORMAT',
      '1. Goal and interpretation.',
      '2. Inputs used and missing inputs.',
      '3. Step-by-step execution.',
      '4. Final deliverable: ' + output + '.',
      '5. QA checklist, risks and next action.'
    ].join('\n');
  }

  function guideSearchText(guide) {
    var project = projectById(guide.projectId);
    return [guide.title, guide.type, guide.model, guide.description, guide.category, project && project.title, project && project.appTitle, project && project.departmentTitle]
      .join(' ')
      .toLowerCase();
  }

  function filteredProjects() {
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var scope = scopeSelect ? scopeSelect.value : 'all';
    return projects.filter(function (project) {
      if (scope !== 'all' && project.appId !== scope) return false;
      if (!query) return true;
      return [project.title, project.summary, project.category, project.appTitle, project.departmentTitle]
        .join(' ')
        .toLowerCase()
        .indexOf(query) !== -1;
    });
  }

  function filteredGuides() {
    var query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    var scope = scopeSelect ? scopeSelect.value : 'all';
    var model = modelSelect ? modelSelect.value : 'all';
    var type = typeSelect ? typeSelect.value : 'all';
    return guides.filter(function (guide) {
      if (scope !== 'all' && guide.appId !== scope) return false;
      if (model !== 'all' && guide.model !== model) return false;
      if (type !== 'all' && guide.type !== type) return false;
      if (favoriteOnly && !state.favorites[guide.id]) return false;
      if (query && guideSearchText(guide).indexOf(query) === -1) return false;
      return true;
    });
  }

  function icon(name) {
    var icons = {
      tree: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5M6 21v-4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4"/><circle cx="12" cy="10" r="3"/><path d="M5 7h3M16 7h3"/></svg>',
      close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
      copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></svg>',
      star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3z"/></svg>',
      shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
      arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
      check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
      edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
      external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M10 14 19 5"/><path d="M19 13v6H5V5h6"/></svg>',
      book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>'
    };
    return icons[name] || '';
  }

  function createRoot() {
    if (document.getElementById(ROOT_ID)) return;
    hydrateCatalog();
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.innerHTML = [
      '<button class="ppb-launcher" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="ppb-panel">',
      '  <span class="ppb-launcher-icon">' + icon('book') + '</span>',
      '  <span class="ppb-launcher-copy"><strong>Project Playbooks</strong><small data-ppb-launcher-copy></small></span>',
      '  <span class="ppb-launcher-count" data-ppb-launcher-count></span>',
      '</button>',
      '<div class="ppb-shell" aria-hidden="true">',
      '  <button class="ppb-backdrop" type="button" tabindex="-1" aria-label="Close project playbooks"></button>',
      '  <section class="ppb-panel" id="ppb-panel" role="dialog" aria-modal="true" aria-labelledby="ppb-title">',
      '    <header class="ppb-header">',
      '      <div class="ppb-heading"><span class="ppb-kicker">Project-level capability system</span><h2 id="ppb-title">Project SkillTree &amp; Guide Library</h2><p>Every app capability becomes a project path with ready-to-customize guides, prompts, audits and improvement loops.</p></div>',
      '      <button class="ppb-icon-button ppb-close" type="button" aria-label="Close project playbooks">' + icon('close') + '</button>',
      '      <nav class="ppb-tabs" aria-label="Project playbook views">',
      '        <button type="button" data-ppb-tab="tree" class="is-active">' + icon('tree') + '<span>Project Tree</span></button>',
      '        <button type="button" data-ppb-tab="library">' + icon('book') + '<span>Guide Library</span></button>',
      '        <button type="button" data-ppb-tab="builder">' + icon('edit') + '<span>Prompt Builder</span></button>',
      '      </nav>',
      '    </header>',
      '    <div class="ppb-toolbar">',
      '      <label class="ppb-search">' + icon('search') + '<span class="ppb-sr-only">Search projects and guides</span><input type="search" placeholder="Search projects, outcomes, prompts or capabilities" autocomplete="off"></label>',
      '      <label class="ppb-select"><span>App</span><select data-ppb-scope></select></label>',
      '      <label class="ppb-select"><span>Model</span><select data-ppb-model><option value="all">All models</option><option>Universal</option><option>ChatGPT</option><option>Claude</option><option>Gemini</option></select></label>',
      '      <label class="ppb-select"><span>Type</span><select data-ppb-type><option value="all">All types</option><option>Guide</option><option>Prompt</option><option>Audit</option><option>Workflow</option></select></label>',
      '      <button class="ppb-tool-button ppb-favorites" type="button" aria-pressed="false">' + icon('star') + '<span>Saved</span></button>',
      '      <button class="ppb-tool-button ppb-random" type="button">' + icon('shuffle') + '<span>Surprise me</span></button>',
      '    </div>',
      '    <div class="ppb-summary" aria-live="polite"></div>',
      '    <div class="ppb-content" data-ppb-content></div>',
      '    <footer class="ppb-footer"><span>Shortcut: <kbd>⌘/Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd></span><span>Progress, saved guides and context stay in this browser.</span></footer>',
      '    <aside class="ppb-drawer" aria-hidden="true" data-ppb-drawer></aside>',
      '  </section>',
      '</div>',
      '<div class="ppb-toast" role="status" aria-live="polite"></div>'
    ].join('');
    document.body.appendChild(root);

    launcher = root.querySelector('.ppb-launcher');
    shell = root.querySelector('.ppb-shell');
    content = root.querySelector('[data-ppb-content]');
    searchInput = root.querySelector('.ppb-search input');
    scopeSelect = root.querySelector('[data-ppb-scope]');
    modelSelect = root.querySelector('[data-ppb-model]');
    typeSelect = root.querySelector('[data-ppb-type]');
    summary = root.querySelector('.ppb-summary');
    drawer = root.querySelector('[data-ppb-drawer]');
    toast = root.querySelector('.ppb-toast');

    populateScopeOptions();
    if (currentApp) scopeSelect.value = currentApp.id;
    builderProjectId = (projects.filter(function (project) { return currentApp && project.appId === currentApp.id; })[0] || projects[0] || {}).id || null;

    launcher.addEventListener('click', open);
    root.querySelector('.ppb-backdrop').addEventListener('click', close);
    root.querySelector('.ppb-close').addEventListener('click', close);
    root.addEventListener('click', handleClick);
    root.addEventListener('input', handleInput);
    root.addEventListener('change', handleChange);
    shell.addEventListener('keydown', trapFocus);
    document.addEventListener('keydown', handleGlobalKey);
    window.addEventListener('anchit-skill-map:open', close);

    updateLauncher();
    render();
  }

  function hydrateCatalog() {
    apps = flattenSkillMap();
    currentApp = findCurrentApp();
    projects = buildProjects();
    guides = buildGuides();
  }

  function populateScopeOptions() {
    var options = ['<option value="all">All apps</option>'];
    apps.forEach(function (app) {
      options.push('<option value="' + escapeHtml(app.id) + '">' + escapeHtml(app.title) + '</option>');
    });
    scopeSelect.innerHTML = options.join('');
  }

  function updateLauncher() {
    if (!launcher) return;
    var p = progress();
    var copy = launcher.querySelector('[data-ppb-launcher-copy]');
    var count = launcher.querySelector('[data-ppb-launcher-count]');
    copy.textContent = currentApp ? currentApp.title : p.total + ' projects across the app suite';
    count.textContent = p.completed + '/' + p.total;
    launcher.setAttribute('aria-label', 'Open project playbooks. ' + p.completed + ' of ' + p.total + ' projects completed and ' + p.guides + ' guides available.');
  }

  function open() {
    createRoot();
    if (window.AnchitSkillMap && typeof window.AnchitSkillMap.close === 'function') {
      try { window.AnchitSkillMap.close(); } catch (error) {}
    }
    lastFocus = document.activeElement;
    shell.classList.add('ppb-open');
    shell.setAttribute('aria-hidden', 'false');
    launcher.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('ppb-modal-open');
    render();
    window.setTimeout(function () { if (searchInput) searchInput.focus(); }, 30);
    dispatch('open', { currentApp: currentApp ? currentApp.id : null });
  }

  function close() {
    if (!shell || !shell.classList.contains('ppb-open')) return;
    closeDrawer();
    shell.classList.remove('ppb-open');
    shell.setAttribute('aria-hidden', 'true');
    launcher.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('ppb-modal-open');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    dispatch('close');
  }

  function handleGlobalKey(event) {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && String(event.key).toLowerCase() === 'k') {
      event.preventDefault();
      if (shell && shell.classList.contains('ppb-open')) close(); else open();
      return;
    }
    if (event.key === 'Escape' && shell && shell.classList.contains('ppb-open')) {
      if (drawer && drawer.classList.contains('is-open')) closeDrawer(); else close();
    }
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    var focusable = shell.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
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

  function handleClick(event) {
    var tab = event.target.closest('[data-ppb-tab]');
    if (tab) {
      activeTab = tab.getAttribute('data-ppb-tab');
      visibleLimit = 48;
      render();
      return;
    }
    var cycle = event.target.closest('[data-ppb-cycle-project]');
    if (cycle) {
      cycleProjectStatus(cycle.getAttribute('data-ppb-cycle-project'));
      return;
    }
    var showGuides = event.target.closest('[data-ppb-project-guides]');
    if (showGuides) {
      var project = projectById(showGuides.getAttribute('data-ppb-project-guides'));
      if (project) {
        activeTab = 'library';
        scopeSelect.value = project.appId;
        searchInput.value = project.title;
        visibleLimit = 48;
        render();
      }
      return;
    }
    var favorite = event.target.closest('[data-ppb-favorite]');
    if (favorite) {
      toggleFavorite(favorite.getAttribute('data-ppb-favorite'));
      return;
    }
    var copy = event.target.closest('[data-ppb-copy]');
    if (copy) {
      copyGuide(copy.getAttribute('data-ppb-copy'));
      return;
    }
    var customize = event.target.closest('[data-ppb-customize]');
    if (customize) {
      openDrawer(customize.getAttribute('data-ppb-customize'));
      return;
    }
    var openAppButton = event.target.closest('[data-ppb-open-app]');
    if (openAppButton) {
      openApp(openAppButton.getAttribute('data-ppb-open-app'));
      return;
    }
    if (event.target.closest('.ppb-favorites')) {
      favoriteOnly = !favoriteOnly;
      render();
      return;
    }
    if (event.target.closest('.ppb-random')) {
      openRandomGuide();
      return;
    }
    if (event.target.closest('[data-ppb-more]')) {
      visibleLimit += 48;
      renderLibrary();
      return;
    }
    if (event.target.closest('[data-ppb-drawer-close]')) {
      closeDrawer();
      return;
    }
    if (event.target.closest('[data-ppb-drawer-copy]')) {
      copyGuide(selectedGuideId, drawerValues());
      return;
    }
    if (event.target.closest('[data-ppb-save-profile]')) {
      saveDrawerProfile();
      return;
    }
    if (event.target.closest('[data-ppb-builder-copy]')) {
      copyBuilderPrompt();
      return;
    }
    if (event.target.closest('[data-ppb-builder-reset]')) {
      state.profile = {};
      writeState();
      renderBuilder();
      showToast('Prompt context reset');
    }
  }

  function handleInput(event) {
    if (event.target === searchInput) {
      visibleLimit = 48;
      renderContent();
      updateSummary();
      return;
    }
    if (event.target.closest('[data-ppb-drawer-form]')) {
      updateDrawerPreview();
      return;
    }
    if (event.target.closest('[data-ppb-builder-form]')) {
      updateBuilderPreview();
    }
  }

  function handleChange(event) {
    if (event.target === scopeSelect || event.target === modelSelect || event.target === typeSelect) {
      visibleLimit = 48;
      renderContent();
      updateSummary();
      return;
    }
    if (event.target.matches('[data-ppb-builder-project]')) {
      builderProjectId = event.target.value;
      updateBuilderPreview();
    }
  }

  function render() {
    if (!root) return;
    root.querySelectorAll('[data-ppb-tab]').forEach(function (button) {
      var selected = button.getAttribute('data-ppb-tab') === activeTab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    modelSelect.disabled = activeTab !== 'library';
    typeSelect.disabled = activeTab !== 'library';
    root.querySelector('.ppb-favorites').disabled = activeTab !== 'library';
    root.querySelector('.ppb-favorites').classList.toggle('is-active', favoriteOnly);
    root.querySelector('.ppb-favorites').setAttribute('aria-pressed', String(favoriteOnly));
    renderContent();
    updateSummary();
    updateLauncher();
  }

  function renderContent() {
    if (activeTab === 'library') renderLibrary();
    else if (activeTab === 'builder') renderBuilder();
    else renderTree();
  }

  function updateSummary() {
    var p = progress();
    if (activeTab === 'tree') {
      var projectCount = filteredProjects().length;
      summary.innerHTML = '<strong>' + projectCount + '</strong> visible projects <span>·</span> <strong>' + p.completed + '</strong> completed <span>·</span> each project includes four original playbooks';
    } else if (activeTab === 'library') {
      var guideCount = filteredGuides().length;
      summary.innerHTML = '<strong>' + guideCount + '</strong> matching guides <span>·</span> search by app, project, model or outcome <span>·</span> prompts use a five-part structure';
    } else {
      summary.innerHTML = '<strong>Prompt Builder</strong> <span>·</span> choose any project, add your context and generate a structured execution prompt';
    }
  }

  function renderTree() {
    var filtered = filteredProjects();
    var appIds = [];
    filtered.forEach(function (project) { if (appIds.indexOf(project.appId) === -1) appIds.push(project.appId); });
    var html = appIds.map(function (appId) {
      var app = appById(appId);
      var related = filtered.filter(function (project) { return project.appId === appId; });
      if (!app || !related.length) return '';
      var done = related.filter(function (project) { return projectStatus(project.id) === 'completed'; }).length;
      return [
        '<section class="ppb-app-track' + (currentApp && currentApp.id === app.id ? ' is-current' : '') + '">',
        '  <header class="ppb-app-track-head">',
        '    <div><span class="ppb-app-department">' + escapeHtml((app.department || {}).title || 'App') + '</span><h3>' + escapeHtml(app.title) + '</h3><p>' + escapeHtml(app.description || 'A connected application in the Anchit ecosystem.') + '</p></div>',
        '    <div class="ppb-app-track-actions"><span>' + done + '/' + related.length + ' complete</span><button type="button" data-ppb-open-app="' + escapeHtml(app.id) + '">Open app ' + (app.external ? icon('external') : icon('arrow')) + '</button></div>',
        '  </header>',
        '  <div class="ppb-project-chain">' + related.map(renderProjectNode).join('') + '</div>',
        '</section>'
      ].join('');
    }).join('');
    if (!html) html = '<div class="ppb-empty"><strong>No matching project.</strong><span>Try “analysis”, “voice”, “creative”, “automation” or clear the app filter.</span></div>';
    content.innerHTML = '<div class="ppb-tree-view">' + html + '</div>';
  }

  function renderProjectNode(project, index) {
    var status = projectStatus(project.id);
    var unmet = (project.dependsOn || []).filter(function (id) { return projectStatus(id) !== 'completed'; });
    var statusLabel = status === 'completed' ? 'Completed' : status === 'started' ? 'In progress' : unmet.length ? 'Suggested prerequisite' : 'Available';
    return [
      '<article class="ppb-project-node is-' + status + (unmet.length ? ' has-prerequisite' : '') + '">',
      '  <div class="ppb-project-stage"><span>' + String(project.stage).padStart(2, '0') + '</span><i aria-hidden="true"></i></div>',
      '  <span class="ppb-project-status">' + escapeHtml(statusLabel) + '</span>',
      '  <h4>' + escapeHtml(project.title) + '</h4>',
      '  <p>' + escapeHtml(project.summary) + '</p>',
      '  <div class="ppb-project-meta"><span>' + escapeHtml(project.category) + '</span><span>4 playbooks</span></div>',
      '  <div class="ppb-project-actions">',
      '    <button type="button" data-ppb-project-guides="' + escapeHtml(project.id) + '">View guides</button>',
      '    <button type="button" data-ppb-cycle-project="' + escapeHtml(project.id) + '">' + icon('check') + '<span>' + (status === 'completed' ? 'Reset' : status === 'started' ? 'Complete' : 'Start') + '</span></button>',
      '  </div>',
      '</article>'
    ].join('');
  }

  function renderLibrary() {
    var filtered = filteredGuides();
    var visible = filtered.slice(0, visibleLimit);
    var html = visible.map(renderGuideCard).join('');
    if (!html) html = '<div class="ppb-empty"><strong>No matching guide.</strong><span>Clear a filter or search for an outcome such as “audit”, “campaign”, “voice” or “learning”.</span></div>';
    if (filtered.length > visible.length) {
      html += '<button class="ppb-load-more" type="button" data-ppb-more>Show ' + Math.min(48, filtered.length - visible.length) + ' more guides</button>';
    }
    content.innerHTML = '<div class="ppb-library-grid">' + html + '</div>';
  }

  function renderGuideCard(guide) {
    var project = projectById(guide.projectId);
    if (!project) return '';
    var saved = !!state.favorites[guide.id];
    var copies = state.copies[guide.id] || 0;
    return [
      '<article class="ppb-guide-card">',
      '  <div class="ppb-guide-topline"><span class="ppb-guide-type">' + escapeHtml(guide.type) + '</span><button type="button" class="ppb-save-guide' + (saved ? ' is-saved' : '') + '" data-ppb-favorite="' + escapeHtml(guide.id) + '" aria-label="' + (saved ? 'Remove saved guide' : 'Save guide') + '">' + icon('star') + '</button></div>',
      '  <h3>' + escapeHtml(guide.title) + '</h3>',
      '  <p>' + escapeHtml(guide.description) + '</p>',
      '  <div class="ppb-guide-context"><strong>' + escapeHtml(project.title) + '</strong><span>' + escapeHtml(project.appTitle) + '</span></div>',
      '  <div class="ppb-guide-tags"><span>' + escapeHtml(guide.model) + '</span><span>' + escapeHtml(guide.category) + '</span><span>5-part structure</span><span>Updated ' + escapeHtml(guide.updated) + '</span></div>',
      copies ? '<span class="ppb-copy-count">Copied ' + copies + ' time' + (copies === 1 ? '' : 's') + ' on this device</span>' : '',
      '  <div class="ppb-guide-actions">',
      '    <button type="button" class="ppb-primary" data-ppb-copy="' + escapeHtml(guide.id) + '">' + icon('copy') + '<span>Copy</span></button>',
      '    <button type="button" data-ppb-customize="' + escapeHtml(guide.id) + '">' + icon('edit') + '<span>Customize</span></button>',
      '    <button type="button" data-ppb-open-app="' + escapeHtml(project.appId) + '" aria-label="Open ' + escapeHtml(project.appTitle) + '">' + icon(project.external ? 'external' : 'arrow') + '</button>',
      '  </div>',
      '</article>'
    ].join('');
  }

  function renderBuilder() {
    var selected = projectById(builderProjectId) || filteredProjects()[0] || projects[0];
    if (selected) builderProjectId = selected.id;
    var profile = state.profile || {};
    var options = projects.map(function (project) {
      return '<option value="' + escapeHtml(project.id) + '"' + (project.id === builderProjectId ? ' selected' : '') + '>' + escapeHtml(project.appTitle + ' — ' + project.title) + '</option>';
    }).join('');
    content.innerHTML = [
      '<div class="ppb-builder">',
      '  <form class="ppb-builder-form" data-ppb-builder-form>',
      '    <label><span>Project</span><select data-ppb-builder-project>' + options + '</select></label>',
      '    <label><span>Exact goal</span><textarea name="goal" rows="2" placeholder="What must the output achieve?">' + escapeHtml(profile.goal || '') + '</textarea></label>',
      '    <label><span>Context</span><textarea name="context" rows="3" placeholder="Brand, audience, user, market, stage or operating context">' + escapeHtml(profile.context || '') + '</textarea></label>',
      '    <label><span>Inputs</span><textarea name="inputs" rows="3" placeholder="Files, data, links, source material or prior output">' + escapeHtml(profile.inputs || '') + '</textarea></label>',
      '    <label><span>Constraints</span><textarea name="constraints" rows="3" placeholder="Brand, compliance, technical, timing or resource limits">' + escapeHtml(profile.constraints || '') + '</textarea></label>',
      '    <label><span>Required output</span><textarea name="output" rows="2" placeholder="Format, sections, artifact or acceptance criteria">' + escapeHtml(profile.output || '') + '</textarea></label>',
      '    <div class="ppb-builder-actions"><button type="button" class="ppb-primary" data-ppb-builder-copy>' + icon('copy') + '<span>Copy generated prompt</span></button><button type="button" data-ppb-builder-reset>Reset context</button></div>',
      '  </form>',
      '  <section class="ppb-builder-preview"><div class="ppb-preview-head"><span>Generated operator prompt</span><small>Role · Context · Task · Constraints · Output</small></div><pre data-ppb-builder-preview></pre></section>',
      '</div>'
    ].join('');
    updateBuilderPreview();
  }

  function builderValues() {
    var form = root.querySelector('[data-ppb-builder-form]');
    if (!form) return {};
    return {
      goal: form.elements.goal.value,
      context: form.elements.context.value,
      inputs: form.elements.inputs.value,
      constraints: form.elements.constraints.value,
      output: form.elements.output.value
    };
  }

  function updateBuilderPreview() {
    var preview = root.querySelector('[data-ppb-builder-preview]');
    var project = projectById(builderProjectId);
    if (!preview || !project) return;
    var guide = guideById(project.id + '--operator') || { projectId: project.id, type: 'Prompt' };
    preview.textContent = guidePrompt(guide, builderValues());
  }

  function copyBuilderPrompt() {
    var project = projectById(builderProjectId);
    if (!project) return;
    var values = builderValues();
    state.profile = values;
    writeState();
    var guide = guideById(project.id + '--operator') || { id: project.id + '--operator', projectId: project.id, type: 'Prompt' };
    copyText(guidePrompt(guide, values)).then(function () {
      if (projectStatus(project.id) === 'available') state.projects[project.id] = 'started';
      writeState();
      syncAppStatus(project.appId);
      showToast('Generated prompt copied');
      updateLauncher();
    });
  }

  function openDrawer(guideId) {
    var guide = guideById(guideId);
    var project = guide && projectById(guide.projectId);
    if (!guide || !project) return;
    selectedGuideId = guideId;
    var profile = state.profile || {};
    drawer.innerHTML = [
      '<div class="ppb-drawer-head"><div><span>' + escapeHtml(guide.type + ' · ' + guide.model) + '</span><h3>' + escapeHtml(guide.title) + '</h3><p>' + escapeHtml(project.appTitle + ' — ' + project.title) + '</p></div><button type="button" class="ppb-icon-button" data-ppb-drawer-close aria-label="Close guide customizer">' + icon('close') + '</button></div>',
      '<form class="ppb-drawer-form" data-ppb-drawer-form>',
      '  <label><span>Goal</span><textarea name="goal" rows="2" placeholder="Define the exact outcome">' + escapeHtml(profile.goal || '') + '</textarea></label>',
      '  <label><span>Context</span><textarea name="context" rows="3" placeholder="Add business, audience, user or market context">' + escapeHtml(profile.context || '') + '</textarea></label>',
      '  <label><span>Inputs</span><textarea name="inputs" rows="3" placeholder="List or paste the source material">' + escapeHtml(profile.inputs || '') + '</textarea></label>',
      '  <label><span>Constraints</span><textarea name="constraints" rows="3" placeholder="Add legal, brand, technical or timing constraints">' + escapeHtml(profile.constraints || '') + '</textarea></label>',
      '  <label><span>Output</span><textarea name="output" rows="2" placeholder="Define the required format and acceptance criteria">' + escapeHtml(profile.output || '') + '</textarea></label>',
      '</form>',
      '<div class="ppb-drawer-preview"><pre data-ppb-drawer-preview></pre></div>',
      '<div class="ppb-drawer-actions"><button type="button" data-ppb-save-profile>Save context</button><button type="button" class="ppb-primary" data-ppb-drawer-copy>' + icon('copy') + '<span>Copy customized guide</span></button></div>'
    ].join('');
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    updateDrawerPreview();
    window.setTimeout(function () {
      var first = drawer.querySelector('textarea');
      if (first) first.focus();
    }, 20);
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '';
    selectedGuideId = null;
  }

  function drawerValues() {
    var form = drawer && drawer.querySelector('[data-ppb-drawer-form]');
    if (!form) return {};
    return {
      goal: form.elements.goal.value,
      context: form.elements.context.value,
      inputs: form.elements.inputs.value,
      constraints: form.elements.constraints.value,
      output: form.elements.output.value
    };
  }

  function updateDrawerPreview() {
    var preview = drawer && drawer.querySelector('[data-ppb-drawer-preview]');
    var guide = guideById(selectedGuideId);
    if (preview && guide) preview.textContent = guidePrompt(guide, drawerValues());
  }

  function saveDrawerProfile() {
    state.profile = drawerValues();
    writeState();
    showToast('Context saved on this device');
  }

  function toggleFavorite(guideId) {
    if (!guideById(guideId)) return;
    if (state.favorites[guideId]) delete state.favorites[guideId];
    else state.favorites[guideId] = Date.now();
    writeState();
    renderContent();
    updateSummary();
    showToast(state.favorites[guideId] ? 'Guide saved' : 'Guide removed');
  }

  function copyGuide(guideId, values) {
    var guide = guideById(guideId);
    var project = guide && projectById(guide.projectId);
    if (!guide || !project) return;
    copyText(guidePrompt(guide, values || {})).then(function () {
      state.copies[guide.id] = (state.copies[guide.id] || 0) + 1;
      state.lastGuide = guide.id;
      if (projectStatus(project.id) === 'available') state.projects[project.id] = 'started';
      writeState();
      syncAppStatus(project.appId);
      updateLauncher();
      if (activeTab === 'library') renderLibrary();
      showToast(guide.title + ' copied');
      dispatch('copy', { guideId: guide.id, projectId: project.id, appId: project.appId });
    }).catch(function () {
      showToast('Copy failed — select the text manually');
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      try {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(area);
        if (ok) resolve(); else reject(new Error('copy failed'));
      } catch (error) {
        reject(error);
      }
    });
  }

  function openRandomGuide() {
    var pool = filteredGuides();
    if (!pool.length) pool = guides.slice();
    if (!pool.length) return;
    openDrawer(pool[Math.floor(Math.random() * pool.length)].id);
  }

  function openApp(appId) {
    var app = appById(appId);
    if (!app) return;
    if (window.AnchitSkillMap && typeof window.AnchitSkillMap.setStatus === 'function') {
      try { window.AnchitSkillMap.setStatus(app.id, 'started'); } catch (error) {}
    }
    dispatch('navigate', { appId: app.id, path: app.path, external: !!app.external });
    if (app.external) window.open(app.path, '_blank', 'noopener,noreferrer');
    else if (cleanPath(app.path) === cleanPath(window.location.pathname)) close();
    else window.location.assign(app.path);
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () { toast.classList.remove('is-visible'); }, 2200);
  }

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent('anchit-project-playbooks:' + name, { detail: detail || {} }));
    } catch (error) {}
  }

  function registerProject(appId, project) {
    if (!appId || !project || !project.id || !project.title) return false;
    if (projects.some(function (candidate) { return candidate.id === project.id; })) return false;
    var app = appById(appId);
    if (!app) return false;
    var copy = {};
    Object.keys(project).forEach(function (key) { copy[key] = project[key]; });
    copy.appId = appId;
    copy.appTitle = app.title;
    copy.appPath = app.path;
    copy.external = !!app.external;
    copy.departmentId = copy.departmentId || (app.department || {}).id || 'general';
    copy.departmentTitle = copy.departmentTitle || (app.department || {}).title || 'General';
    copy.category = copy.category || inferCategory(copy.title, copy.departmentId);
    copy.stage = copy.stage || projects.filter(function (candidate) { return candidate.appId === appId; }).length + 1;
    copy.role = copy.role || ROLE_BY_DEPARTMENT[copy.departmentId] || 'senior cross-functional operator';
    copy.summary = copy.summary || projectSummary(app, copy.title);
    copy.inputs = copy.inputs || 'the relevant source material and success criteria';
    copy.deliverable = copy.deliverable || 'a usable output with evidence, risks, QA checks and next actions';
    runtimeProjects.push(copy);
    projects = buildProjects();
    guides = buildGuides();
    if (root) {
      populateScopeOptions();
      render();
    }
    return true;
  }

  function registerGuide(guide) {
    if (!guide || !guide.id || !guide.projectId || !guide.title || !projectById(guide.projectId)) return false;
    if (guides.some(function (candidate) { return candidate.id === guide.id; })) return false;
    var project = projectById(guide.projectId);
    var copy = {};
    Object.keys(guide).forEach(function (key) { copy[key] = guide[key]; });
    copy.appId = project.appId;
    copy.type = copy.type || 'Prompt';
    copy.model = copy.model || 'Universal';
    copy.description = copy.description || 'A reusable guide for this project.';
    copy.category = copy.category || project.category;
    copy.updated = copy.updated || 'Jul 2026';
    runtimeGuides.push(copy);
    guides = buildGuides();
    if (root) render();
    return true;
  }

  window.AnchitProjectPlaybooks = {
    open: open,
    close: close,
    getApps: function () { return JSON.parse(JSON.stringify(apps)); },
    getProjects: function () { return JSON.parse(JSON.stringify(projects)); },
    getGuides: function () { return JSON.parse(JSON.stringify(guides)); },
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    getCurrentApp: function () { return currentApp; },
    setProjectStatus: setProjectStatus,
    registerProject: registerProject,
    registerGuide: registerGuide,
    buildPrompt: function (guideId, values) {
      var guide = guideById(guideId);
      return guide ? guidePrompt(guide, values || {}) : '';
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createRoot, { once: true });
  } else {
    createRoot();
  }
}());
