/* Prompter Cam - client app (no build step). */
const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const narrow = () => window.innerWidth < 700;

/* ------------------------------------------------------------------ utils */
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function fmt(sec) { sec = Math.max(0, Math.round(sec)); return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
function fmtShort(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 86400 * 7) return Math.floor(s / 86400) + ' d ago';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function countWords(body) {
  return String(body || '').replace(/^\s*#+/gm, ' ').replace(/\[pause\]/gi, ' ').replace(/\*\*/g, '').split(/\s+/).filter(Boolean).length;
}
function slug(s) { return String(s || 'script').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'script'; }
let toastT;
function toast(msg, bad) { const t = $('toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), bad ? 4200 : 2200); }
function debounce(fn, ms) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; d.cancel = () => clearTimeout(t); return d; }

async function api(method, path, body, keepalive) {
  let r;
  try {
    r = await fetch('/api/' + path, { method, credentials: 'same-origin', headers: { 'x-pc': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, keepalive: !!keepalive });
  } catch { throw Object.assign(new Error('No connection. Check your internet and try again.'), { status: 0 }); }
  let data = {}; try { data = await r.json(); } catch {}
  if (!r.ok) {
    if (r.status === 401 && state.user && !path.startsWith('auth/') && path !== 'me' && !path.startsWith('me/')) { state.user = null; showAuth(); }
    throw Object.assign(new Error(data.error || 'Something went wrong (' + r.status + ')'), { status: r.status, data });
  }
  return data;
}

/* ------------------------------------------------------------------ settings model */
const DEFAULTS = {
  wpm: 130, guide: 24, countdown: 3, autoScroll: true, focus: true, showGuide: true, mirrorX: false,
  fontSize: narrow() ? 30 : 44, lineHeight: 1.45, width: 34, font: 'plex', weight: 500, align: 'left',
  textColor: '#f1f4f2', stageColor: '#091815', upper: false,
  layout: 'split', overlayDim: 0.55, pipSize: narrow() ? 's' : 'm', pipPos: 'tr',
  bgMode: 'none', bgBlur: 14, bgColor: '#1f3b33', bgPreset: 'studio', bgImage: null,
  aspect: '16:9', res: '1080', fps: '30', mirrorPreview: true, noise: true
};
const FONTS = {
  plex: '"IBM Plex Sans",system-ui,sans-serif', atkinson: '"Atkinson Hyperlegible",system-ui,sans-serif', sora: '"Sora",system-ui,sans-serif',
  lora: '"Lora",Georgia,serif', mono: '"IBM Plex Mono",ui-monospace,Menlo,monospace', system: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'
};
const state = { user: null, scripts: [], script: null, eff: { ...DEFAULTS }, bgs: [], takes: [], view: null };
function effective() { return { ...DEFAULTS, ...(state.user?.prefs || {}), ...(state.script?.settings || {}) }; }

/* ------------------------------------------------------------------ views */
function showOnly(id) {
  for (const v of ['authView', 'libView', 'studioView']) $(v).hidden = v !== id;
  $('boot').hidden = true; state.view = id;
}
function showAuth() { leaveStudio(true); showOnly('authView'); setTab('in'); }

/* ------------------------------------------------------------------ AUTH */
const CC = [['+91', 'IN +91'], ['+1', 'US/CA +1'], ['+44', 'UK +44'], ['+971', 'AE +971'], ['+61', 'AU +61'], ['+65', 'SG +65'], ['+966', 'SA +966'], ['+974', 'QA +974'], ['+968', 'OM +968'], ['+965', 'KW +965'], ['+973', 'BH +973'], ['+49', 'DE +49'], ['+33', 'FR +33'], ['+31', 'NL +31'], ['+353', 'IE +353'], ['+64', 'NZ +64'], ['+60', 'MY +60'], ['+977', 'NP +977'], ['+94', 'LK +94'], ['+880', 'BD +880'], ['+27', 'ZA +27'], ['+234', 'NG +234'], ['+254', 'KE +254'], ['+81', 'JP +81'], ['+86', 'CN +86'], ['+62', 'ID +62'], ['+63', 'PH +63'], ['+55', 'BR +55'], ['+52', 'MX +52'], ['+7', 'RU +7']];
for (const id of ['inCc', 'upCc', 'rsCc']) {
  const sel = $(id); for (const [v, l] of CC) { const o = document.createElement('option'); o.value = v; o.textContent = l; sel.appendChild(o); }
  sel.value = lsGet('pc.cc', '+91');
}
function phoneOf(ccId, numId) {
  const cc = $(ccId).value; let n = $(numId).value.replace(/\D/g, '');
  if (n.startsWith(cc.slice(1)) && n.length > 10) n = n.slice(cc.length - 1);
  n = n.replace(/^0+/, '');
  const full = cc + n;
  if (!/^\+[1-9]\d{7,14}$/.test(full)) return null;
  if (cc === '+91' && !/^[6-9]\d{9}$/.test(n)) return null;
  return full;
}
function setTab(t) {
  $('tabIn').setAttribute('aria-selected', t === 'in'); $('tabUp').setAttribute('aria-selected', t === 'up');
  $('formIn').hidden = t !== 'in'; $('formUp').hidden = t !== 'up'; $('formReset').hidden = t !== 'reset';
  $('inErr').textContent = $('upErr').textContent = $('rsErr').textContent = '';
}
$('tabIn').onclick = () => setTab('in'); $('tabUp').onclick = () => setTab('up'); $('toUp').onclick = () => setTab('up');
$('toReset').onclick = () => { $('rsCc').value = $('inCc').value; $('rsNum').value = $('inNum').value; setTab('reset'); };
$('rsBack').onclick = () => setTab('in');
qsa('[data-eye]').forEach((b) => b.onclick = () => { const i = $(b.dataset.eye); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; if (b.dataset.eye === 'upPin') $('upPin2').type = i.type; });
qsa('input.pin').forEach((i) => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '').slice(0, 4); }));
async function busy(btn, fn) { const t = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = t; } }

$('formIn').onsubmit = (e) => {
  e.preventDefault(); const err = $('inErr'); err.textContent = '';
  const phone = phoneOf('inCc', 'inNum'); if (!phone) { err.textContent = 'Enter a valid mobile number'; $('inNum').focus(); return; }
  const pin = $('inPin').value; if (!/^\d{4}$/.test(pin)) { err.textContent = 'PIN must be 4 digits'; $('inPin').focus(); return; }
  busy($('inBtn'), async () => {
    try { const d = await api('POST', 'auth/login', { phone, pin }); lsSet('pc.cc', $('inCc').value); $('inPin').value = ''; await signedIn(d.user); }
    catch (x) { err.textContent = x.message + (x.data?.attemptsLeft ? ` (${x.data.attemptsLeft} attempt${x.data.attemptsLeft === 1 ? '' : 's'} left)` : ''); $('inPin').value = ''; $('inPin').focus(); }
  });
};
$('formUp').onsubmit = (e) => {
  e.preventDefault(); const err = $('upErr'); err.textContent = '';
  const phone = phoneOf('upCc', 'upNum'); if (!phone) { err.textContent = 'Enter a valid mobile number'; $('upNum').focus(); return; }
  const pin = $('upPin').value; if (!/^\d{4}$/.test(pin)) { err.textContent = 'PIN must be 4 digits'; $('upPin').focus(); return; }
  if (pin !== $('upPin2').value) { err.textContent = 'PINs do not match'; $('upPin2').focus(); return; }
  busy($('upBtn'), async () => {
    try {
      const d = await api('POST', 'auth/signup', { phone, pin, name: $('upName').value });
      lsSet('pc.cc', $('upCc').value); $('upPin').value = $('upPin2').value = '';
      await showRecovery(d.recoveryCode, 'Your account is ready'); await signedIn(d.user);
    } catch (x) { err.textContent = x.message; }
  });
};
$('formReset').onsubmit = (e) => {
  e.preventDefault(); const err = $('rsErr'); err.textContent = '';
  const phone = phoneOf('rsCc', 'rsNum'); if (!phone) { err.textContent = 'Enter a valid mobile number'; return; }
  const code = $('rsCode').value.trim(); if (code.replace(/[^a-z0-9]/gi, '').length !== 10) { err.textContent = 'Recovery code has 10 letters and numbers'; return; }
  const newPin = $('rsPin').value; if (!/^\d{4}$/.test(newPin)) { err.textContent = 'New PIN must be 4 digits'; return; }
  busy($('rsBtn'), async () => {
    try { const d = await api('POST', 'auth/reset', { phone, recoveryCode: code, newPin }); $('rsCode').value = $('rsPin').value = ''; await showRecovery(d.recoveryCode, 'PIN changed. Here is your new recovery code'); await signedIn(d.user); }
    catch (x) { err.textContent = x.message; }
  });
};

/* ------------------------------------------------------------------ modals */
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = '<div class="card">' + html + '</div>'; document.body.appendChild(m);
  const f = m.querySelector('input,button.primary,button'); setTimeout(() => f && f.focus(), 30); return m;
}
function showRecovery(code, title) {
  return new Promise((resolve) => {
    const m = modal(`<h2>${esc(title)}</h2><p class="small" style="margin:0">This is your <b>recovery code</b>. It is the only way to reset your PIN if you forget it. We cannot show it again.</p>
      <div class="code" id="rcCode">${esc(code)}</div>
      <div class="row"><button type="button" id="rcCopy">Copy</button><button type="button" id="rcDl">Download as text file</button></div>
      <label class="chk"><input type="checkbox" id="rcOk"> I have saved my recovery code</label>
      <button type="button" class="primary" id="rcGo" disabled>Continue</button>`);
    m.querySelector('#rcCopy').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Recovery code copied'); } catch { toast('Select the code and copy it', true); } };
    m.querySelector('#rcDl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`Prompter Cam recovery code\n\n${code}\n\nKeep this safe. Use it with your mobile number to reset your PIN at ${location.origin}\n`], { type: 'text/plain' })); a.download = 'prompter-cam-recovery-code.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
    m.querySelector('#rcOk').onchange = (e) => { m.querySelector('#rcGo').disabled = !e.target.checked; };
    m.querySelector('#rcGo').onclick = () => { m.remove(); resolve(); };
  });
}
function confirmBox(title, text, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    const m = modal(`<h2>${esc(title)}</h2><p class="small" style="margin:0">${esc(text)}</p><div class="row" style="justify-content:flex-end"><button type="button" class="ghost" data-a="0">Cancel</button><button type="button" class="${danger ? 'danger' : 'primary'}" data-a="1">${esc(okLabel)}</button></div>`);
    m.onclick = (e) => { const a = e.target.closest('[data-a]'); if (a || e.target === m) { m.remove(); resolve(!!(a && a.dataset.a === '1')); } };
    m.onkeydown = (e) => { if (e.key === 'Escape') { m.remove(); resolve(false); } };
  });
}
function askPin(title, text) {
  return new Promise((resolve) => {
    const m = modal(`<h2>${esc(title)}</h2><p class="small" style="margin:0">${esc(text)}</p><input class="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" aria-label="PIN"><div class="row" style="justify-content:flex-end"><button type="button" class="ghost" data-a="0">Cancel</button><button type="button" class="primary" data-a="1">Confirm</button></div>`);
    const i = m.querySelector('input'); i.oninput = () => { i.value = i.value.replace(/\D/g, '').slice(0, 4); };
    const done = (v) => { m.remove(); resolve(v); };
    m.onclick = (e) => { const a = e.target.closest('[data-a]'); if (a) done(a.dataset.a === '1' && /^\d{4}$/.test(i.value) ? i.value : null); };
    i.onkeydown = (e) => { if (e.key === 'Enter' && /^\d{4}$/.test(i.value)) done(i.value); if (e.key === 'Escape') done(null); };
  });
}

/* ------------------------------------------------------------------ drawers */
let openDr = null;
function openDrawer(id) {
  if (openDr && openDr !== id) $(openDr).classList.remove('open');
  if (openDr === id) return closeDrawer();
  openDr = id; $(id).classList.add('open');
  if (id === 'drSettings') $('studioView').classList.add('panel'); else $('scrim').classList.add('show');
  setTimeout(() => { const f = $(id).querySelector('input,textarea,select,button:not([data-close])'); if (f && id !== 'drSettings' && id !== 'drTakes') f.focus(); }, 60);
}
function closeDrawer() {
  if (!openDr) return; const id = openDr; $(id).classList.remove('open'); $('scrim').classList.remove('show'); $('studioView').classList.remove('panel'); openDr = null;
  if (id === 'drEdit') { saveScript.flush(); renderText(true); }
}
$('scrim').onclick = closeDrawer;
qsa('[data-close]').forEach((b) => b.onclick = closeDrawer);

/* ------------------------------------------------------------------ session bootstrap */
async function signedIn(user) {
  state.user = user;
  $('whoName').textContent = user.name || user.phone; $('whoAv').textContent = (user.name || '#').trim().charAt(0).toUpperCase() || '#';
  $('acName').value = user.name || ''; $('acPhone').textContent = user.phone;
  await route();
  if (hasPending()) saveScript();
}
async function boot() {
  try { const d = await api('GET', 'me'); if (d.user) return await signedIn(d.user); showAuth(); }
  catch (e) { showOnly('authView'); $('inErr').textContent = e.message; }
}
window.addEventListener('hashchange', () => { if (state.user) route(); });
async function route() {
  const m = /^#\/s\/([0-9a-f-]{36})$/i.exec(location.hash);
  if (m) return openStudio(m[1]);
  leaveStudio(); await openLibrary();
}

/* ------------------------------------------------------------------ LIBRARY */
async function openLibrary() {
  showOnly('libView'); document.title = 'Your scripts - Prompter Cam';
  $('legacyBanner').hidden = !(localStorage.getItem('prompter.script') !== null && !lsGet('pc.legacyDone', false));
  $('libGrid').innerHTML = '<div class="empty"><span class="spinner" style="display:inline-block"></span></div>';
  try { const d = await api('GET', 'scripts'); state.scripts = d.scripts; renderLib(); }
  catch (e) { $('libGrid').innerHTML = `<div class="empty">${esc(e.message)}<br><br><button type="button" id="libRetry">Retry</button></div>`; $('libRetry').onclick = openLibrary; }
}
function renderLib() {
  const q = $('libSearch').value.trim().toLowerCase();
  const list = state.scripts.filter((s) => !q || s.title.toLowerCase().includes(q) || (s.preview || '').toLowerCase().includes(q));
  $('libCount').textContent = state.scripts.length ? `${state.scripts.length} script${state.scripts.length === 1 ? '' : 's'}, newest first` : '';
  const g = $('libGrid'); g.innerHTML = '';
  const nw = document.createElement('button'); nw.type = 'button'; nw.className = 'sc new'; nw.innerHTML = '<svg class="i" viewBox="0 0 24 24" style="width:26px;height:26px"><path d="M12 5v14M5 12h14"/></svg>New script'; nw.onclick = newScript;
  if (!q) g.appendChild(nw);
  if (!list.length && q) { g.innerHTML = '<div class="empty">No scripts match that search.</div>'; return; }
  for (const s of list) {
    const wpm = (s.settings && s.settings.wpm) || state.user?.prefs?.wpm || DEFAULTS.wpm;
    const el = document.createElement('article'); el.className = 'sc'; el.tabIndex = 0; el.setAttribute('aria-label', 'Open ' + s.title);
    el.innerHTML = `<h3>${esc(s.title)}</h3><p>${esc((s.preview || '').replace(/^\s*#+\s*/gm, '').replace(/\*\*/g, '')) || '<i>Empty script</i>'}</p>
      <div class="meta"><span>${s.words} words</span><span>~${fmtShort(s.words / wpm * 60)} at ${wpm} wpm</span><span>${ago(s.updated_at)}</span></div>
      <div class="acts"><button type="button" class="ghost sm" data-act="dup">Duplicate</button><button type="button" class="ghost sm" data-act="del" style="color:var(--danger)">Delete</button></div>`;
    el.onclick = async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) { location.hash = '#/s/' + s.id; return; }
      e.stopPropagation();
      if (b.dataset.act === 'dup') {
        try { const full = await api('GET', 'scripts/' + s.id); await api('POST', 'scripts', { title: full.script.title + ' (copy)', body: full.script.body, settings: full.script.settings }); toast('Duplicated'); openLibrary(); } catch (x) { toast(x.message, true); }
      } else if (await confirmBox('Delete script?', `"${s.title}" will be deleted permanently.`, 'Delete', true)) {
        try { await api('DELETE', 'scripts/' + s.id); state.scripts = state.scripts.filter((x) => x.id !== s.id); renderLib(); toast('Script deleted'); } catch (x) { toast(x.message, true); }
      }
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target === el) location.hash = '#/s/' + s.id; };
    g.appendChild(el);
  }
}
$('libSearch').oninput = renderLib;
$('btnNew').onclick = newScript;
async function newScript() {
  try { const d = await api('POST', 'scripts', { title: 'Untitled script', body: '' }); state.openEditOnLoad = true; location.hash = '#/s/' + d.script.id; }
  catch (x) { toast(x.message, true); }
}
$('btnLegacyNo').onclick = () => { lsSet('pc.legacyDone', true); $('legacyBanner').hidden = true; };
$('btnLegacy').onclick = () => busy($('btnLegacy'), async () => {
  try {
    const { LEGACY } = await import('/legacy.js');
    const custom = lsGet('prompter.custom', {}) || {}; const wpm = lsGet('prompter.wpm', null); const size = lsGet('prompter.size', null);
    const settings = {}; if (wpm) settings.wpm = Number(wpm); if (size) settings.fontSize = Number(size);
    for (const [k, s] of Object.entries(LEGACY)) await api('POST', 'scripts', { title: s.title, body: (custom[k] || s.text).join('\n\n'), settings });
    lsSet('pc.legacyDone', true); $('legacyBanner').hidden = true; toast('Imported ' + Object.keys(LEGACY).length + ' scripts'); openLibrary();
  } catch (x) { toast(x.message, true); }
});

/* ------------------------------------------------------------------ ACCOUNT */
$('btnAccount').onclick = () => openDrawer('drAccount');
$('btnSaveName').onclick = () => busy($('btnSaveName'), async () => { try { const d = await api('PATCH', 'me', { name: $('acName').value }); state.user = d.user; $('whoName').textContent = d.user.name || d.user.phone; $('whoAv').textContent = (d.user.name || '#').charAt(0).toUpperCase(); toast('Name saved'); } catch (x) { toast(x.message, true); } });
$('btnChangePin').onclick = () => {
  const cur = $('acCur').value, nw = $('acNew').value; $('acPinErr').textContent = '';
  if (!/^\d{4}$/.test(cur) || !/^\d{4}$/.test(nw)) { $('acPinErr').textContent = 'Both PINs must be 4 digits'; return; }
  busy($('btnChangePin'), async () => { try { await api('POST', 'me/pin', { currentPin: cur, newPin: nw }); $('acCur').value = $('acNew').value = ''; toast('PIN changed. Other devices are signed out.'); } catch (x) { $('acPinErr').textContent = x.message; } });
};
$('btnNewRecovery').onclick = async () => { const pin = await askPin('New recovery code', 'Enter your PIN to make a new recovery code.'); if (!pin) return; try { const d = await api('POST', 'me/recovery', { pin }); await showRecovery(d.recoveryCode, 'Your new recovery code'); } catch (x) { toast(x.message, true); } };
$('btnLogout').onclick = async () => { if (state.takes.length && !(await confirmBox('Sign out?', 'You have takes that are not downloaded. They will be lost.', 'Sign out', true))) return; try { await api('POST', 'auth/logout'); } catch {} clearTakes(); state.user = null; closeDrawer(); location.hash = ''; showAuth(); };
$('btnDeleteAcc').onclick = async () => {
  if (!(await confirmBox('Delete your account?', 'All your scripts, settings and backgrounds will be permanently deleted.', 'Continue', true))) return;
  const pin = await askPin('Confirm with your PIN', 'Enter your PIN to permanently delete your account.'); if (!pin) return;
  try { await api('DELETE', 'me', { pin }); state.user = null; closeDrawer(); location.hash = ''; showAuth(); toast('Account deleted'); } catch (x) { toast(x.message, true); }
};

/* ------------------------------------------------------------------ STUDIO: load & save */
const saveState = (t) => { $('saveState').textContent = t; };
// Edits are queued per script and sent one PATCH at a time, so a slow request can never overwrite newer text.
const pendingBy = {}; let inflight = null, retryT = 0;
const hasPending = () => Object.keys(pendingBy).length > 0;
async function flushSaves(keepalive) {
  if (inflight) { await inflight; if (!hasPending()) return; }
  if (!hasPending()) return;
  inflight = (async () => {
    for (const id of Object.keys(pendingBy)) {
      const patch = pendingBy[id]; delete pendingBy[id];
      const mine = () => state.script && state.script.id === id;
      if (mine()) saveState('Saving…');
      try {
        const d = await api('PATCH', 'scripts/' + id, patch, JSON.stringify(patch).length < 60000); // keepalive: survives tab close / reload
        if (mine()) { state.script.updated_at = d.script.updated_at; if (!pendingBy[id]) saveState('Saved'); }
      } catch (e) {
        if (e.status === 404) continue; // script deleted elsewhere
        if (e.status === 400) { if (mine()) saveState('Not saved'); toast(e.message, true); continue; } // invalid edit: do not retry forever
        pendingBy[id] = { ...patch, ...(pendingBy[id] || {}) }; // keep newer edits on top
        if (mine()) saveState('Not saved');
        if (e.status !== 401) { clearTimeout(retryT); retryT = setTimeout(() => saveScript(), 5000); }
      }
    }
  })();
  try { await inflight; } finally { inflight = null; }
}
const saveScript = debounce(() => flushSaves(), 700);
function queueSave(patch) { if (!state.script) return; const id = state.script.id; pendingBy[id] = { ...(pendingBy[id] || {}), ...patch }; saveState('Editing'); saveScript(); }
window.addEventListener('beforeunload', (e) => { if (hasPending()) { saveScript.cancel(); flushSaves(true); } if (hasPending() || state.takes.length || recording()) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && hasPending()) { saveScript.cancel(); flushSaves(true); } });

async function openStudio(id) {
  if (state.script && state.script.id === id && state.view === 'studioView') return;
  saveScript.flush(); state.script = null; stopScroll(); closeDrawer();
  showOnly('studioView'); $('txt').innerHTML = ''; $('edTitle').value = $('edBody').value = ''; $('stTitle').textContent = 'Loading…'; saveState('');
  try {
    const [d] = await Promise.all([api('GET', 'scripts/' + id), state.bgs.length ? null : loadBgs()]);
    state.script = d.script;
  } catch (e) { toast(e.message, true); location.hash = ''; return; }
  document.title = state.script.title + ' - Prompter Cam';
  $('stTitle').textContent = state.script.title; $('edTitle').value = state.script.title; $('edBody').value = state.script.body;
  applySettings(true); renderText(); topScroll();
  if (state.openEditOnLoad) { state.openEditOnLoad = false; openDrawer('drEdit'); }
  else if (lsGet('pc.camOn', false) && !cam.stream) startCamera(true);
}
function leaveStudio(force) {
  if (state.view !== 'studioView' && !force) return;
  stopScroll(); if (recording()) stopRecording();
  saveScript.flush(); closeDrawer();
  stopCamera(true); state.script = null;
}
$('btnBack').onclick = () => { location.hash = ''; };
$('stTitle').onclick = () => openDrawer('drEdit');
$('btnEdit').onclick = () => openDrawer('drEdit');
$('btnSettings').onclick = () => openDrawer('drSettings');
$('btnTakes').onclick = () => openDrawer('drTakes');
$('edTitle').oninput = () => { if (!state.script) return; const t = $('edTitle').value; state.script.title = t || 'Untitled script'; $('stTitle').textContent = state.script.title; document.title = state.script.title + ' - Prompter Cam'; queueSave({ title: t }); };
const rerender = debounce(() => renderText(true), 400);
$('edBody').oninput = () => { if (!state.script) return; state.script.body = $('edBody').value; queueSave({ body: state.script.body }); rerender(); };

/* ------------------------------------------------------------------ STUDIO: text render */
function inline(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[pause\]/gi, '<span class="pause">PAUSE</span>');
}
function renderText(keepPos) {
  if (!state.script) return;
  const sc = $('scroll'), keep = keepPos ? sc.scrollTop : 0;
  const body = String(state.script.body || '').replace(/\r/g, '');
  let html = '';
  for (const block of body.split(/\n\s*\n/)) {
    let para = [];
    const flush = () => { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
    for (const line of block.split('\n')) {
      const t = line.trim(); if (!t) continue;
      if (/^#+\s*/.test(t)) { flush(); html += '<div class="cue">' + inline(t.replace(/^#+\s*/, '')) + '</div>'; }
      else para.push(t);
    }
    flush();
  }
  $('txt').innerHTML = html ? html + '<div class="end">End of script</div>' : '<p style="color:var(--dim)">This script is empty. Press <b>Edit</b> to write or paste your script.</p>';
  if (keepPos) sc.scrollTop = keep;
  updateStats();
}
function updateStats() {
  if (!state.script) return;
  const w = countWords(state.script.body); state.words = w;
  $('stWords').textContent = w; $('stTime').textContent = fmtShort(w / state.eff.wpm * 60); $('spdVal').textContent = state.eff.wpm;
}

/* ------------------------------------------------------------------ STUDIO: settings UI */
function setSetting(k, v) {
  if (!state.script) return;
  state.script.settings = { ...(state.script.settings || {}), [k]: v };
  queueSave({ settings: state.script.settings });
  const camKeys = ['aspect', 'res', 'fps', 'noise'];
  applySettings(false, k);
  if (camKeys.includes(k) && cam.stream && k !== 'aspect') $('btnApplyCam').classList.add('primary');
}
function applySettings(full, changed) {
  const S = state.eff = effective(); const r = document.documentElement.style, st = $('stage');
  r.setProperty('--tp-size', S.fontSize + 'px'); r.setProperty('--tp-lh', S.lineHeight); r.setProperty('--tp-font', FONTS[S.font] || FONTS.plex);
  r.setProperty('--tp-weight', S.weight); r.setProperty('--tp-color', S.textColor); r.setProperty('--tp-stage', S.stageColor);
  r.setProperty('--tp-width', S.width + 'ch'); r.setProperty('--tp-align', S.align); r.setProperty('--guide', S.guide + '%');
  st.style.setProperty('--dimv', S.overlayDim);
  st.classList.toggle('focus', !!S.focus); st.classList.toggle('noGuide', !S.showGuide); st.classList.toggle('mirrorX', !!S.mirrorX); st.classList.toggle('upper', !!S.upper);
  st.classList.toggle('split', S.layout === 'split'); st.classList.toggle('overlay', S.layout === 'overlay');
  for (const p of ['tl', 'tr', 'bl', 'br']) st.classList.toggle('pip-' + p, S.pipPos === p);
  for (const p of ['s', 'm', 'l']) st.classList.toggle('pip-' + p, S.pipSize === p);
  $('camLayer').classList.toggle('mirrorPrev', !!S.mirrorPreview);
  const [aw, ah] = S.aspect.split(':').map(Number); st.style.setProperty('--pipar', aw + '/' + ah); st.classList.toggle('portrait', ah > aw);
  // controls
  qsa('#setBody [data-k]').forEach((el) => { const v = S[el.dataset.k]; if (el.type === 'checkbox') el.checked = !!v; else if (document.activeElement !== el) el.value = v; });
  qsa('#setBody output[data-o]').forEach((o) => { const k = o.dataset.o, v = S[k]; o.textContent = k === 'wpm' ? v + ' wpm' : k === 'guide' ? v + '%' : k === 'fontSize' ? v + ' px' : k === 'width' ? v + ' ch' : k === 'overlayDim' ? Math.round(v * 100) + '%' : k === 'bgBlur' ? v + ' px' : String(v); });
  qsa('#setBody [data-seg]').forEach((g) => { const v = String(S[g.dataset.seg]); qsa('button', g).forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === v)); });
  qsa('#setBody [data-show]').forEach((el) => { el.hidden = el.dataset.show !== S.layout; });
  qsa('#setBody [data-showbg]').forEach((el) => { el.hidden = el.dataset.showbg !== S.bgMode; });
  renderBgGrid(); updateStats();
  if (cam.stream && (changed === 'aspect' || changed === 'res' || full)) sizeCanvas();
  if (S.bgMode !== 'none' && cam.stream) ensureSeg();
  camLabel();
  if (changed === 'bgImage' || changed === 'bgMode' || full) prepBgImage();
}
qsa('#setBody [data-k]').forEach((el) => {
  const k = el.dataset.k;
  const handler = () => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'range') v = Number(v);
    setSetting(k, v);
  };
  el.addEventListener(el.type === 'range' || el.type === 'color' ? 'input' : 'change', handler);
});
qsa('#setBody [data-seg]').forEach((g) => g.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (!b) return; const k = g.dataset.seg; const v = ['countdown', 'weight'].includes(k) ? Number(b.dataset.v) : b.dataset.v; setSetting(k, v); }));
$('swapCol').onclick = () => { const light = state.eff.stageColor.toLowerCase() === '#f7f5ef'; state.script.settings = { ...state.script.settings, textColor: light ? '#f1f4f2' : '#111111', stageColor: light ? '#091815' : '#f7f5ef' }; queueSave({ settings: state.script.settings }); applySettings(); };
$('btnSaveDefault').onclick = () => busy($('btnSaveDefault'), async () => {
  const prefs = { ...state.eff }; delete prefs.bgImage;
  try { const d = await api('PATCH', 'me', { prefs }); state.user = d.user; toast('Saved as your default for new scripts'); } catch (x) { toast(x.message, true); }
});
$('btnResetSet').onclick = async () => { if (!(await confirmBox('Reset settings?', 'This script will use your default settings again.', 'Reset'))) return; state.script.settings = {}; queueSave({ settings: {} }); applySettings(true); toast('Settings reset'); };

/* ------------------------------------------------------------------ backgrounds */
const PRESETS = {
  studio: { name: 'Studio', draw(c, W, H) { const g = c.createRadialGradient(W * .5, H * .38, H * .05, W * .5, H * .5, Math.max(W, H) * .75); g.addColorStop(0, '#2f5a4c'); g.addColorStop(.55, '#12312a'); g.addColorStop(1, '#050d0b'); c.fillStyle = g; c.fillRect(0, 0, W, H); } },
  sunset: { name: 'Sunset', draw(c, W, H) { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#f7b267'); g.addColorStop(.5, '#f4845f'); g.addColorStop(1, '#7b2d59'); c.fillStyle = g; c.fillRect(0, 0, W, H); bokeh(c, W, H, 7, 'rgba(255,240,210,'); } },
  ocean: { name: 'Ocean', draw(c, W, H) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b3d5c'); g.addColorStop(1, '#06182a'); c.fillStyle = g; c.fillRect(0, 0, W, H); bokeh(c, W, H, 11, 'rgba(120,200,255,'); } },
  daylight: { name: 'Daylight', draw(c, W, H) { const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#f4f1ea'); g.addColorStop(1, '#d9d4c7'); c.fillStyle = g; c.fillRect(0, 0, W, H); const w = c.createLinearGradient(W * .55, 0, W, H); w.addColorStop(0, 'rgba(255,255,255,.55)'); w.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = w; c.fillRect(W * .55, 0, W * .45, H); } },
  neon: { name: 'Neon night', draw(c, W, H) { c.fillStyle = '#0d0820'; c.fillRect(0, 0, W, H); bokeh(c, W, H, 23, 'rgba(255,80,200,'); bokeh(c, W, H, 5, 'rgba(80,180,255,'); } },
  slate: { name: 'Slate', draw(c, W, H) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#4a5562'); g.addColorStop(1, '#1d232b'); c.fillStyle = g; c.fillRect(0, 0, W, H); } }
};
function bokeh(c, W, H, seed, col) { let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < 26; i++) { const x = rnd() * W, y = rnd() * H, r = (0.02 + rnd() * 0.09) * Math.max(W, H); const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col + (0.18 + rnd() * 0.25) + ')'); g.addColorStop(1, col + '0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); } }
const presetThumbs = {};
function presetThumb(k) { if (!presetThumbs[k]) { const c = document.createElement('canvas'); c.width = 160; c.height = 100; PRESETS[k].draw(c.getContext('2d'), 160, 100); presetThumbs[k] = c.toDataURL('image/jpeg', .8); } return presetThumbs[k]; }
async function loadBgs() { try { const d = await api('GET', 'backgrounds'); state.bgs = d.backgrounds; } catch { state.bgs = []; } }
function renderBgGrid() {
  const S = state.eff, g = $('bgGrid'); if (!g) return;
  const tiles = [
    { mode: 'none', label: 'None', style: 'background:#05100d' },
    { mode: 'blur', label: 'Blur', style: 'background:linear-gradient(135deg,#6e8f84,#2c4a40);filter:saturate(.8)' },
    { mode: 'color', label: 'Colour', style: `background:${S.bgColor}` },
    ...Object.keys(PRESETS).map((k) => ({ mode: 'preset', val: k, label: PRESETS[k].name, style: `background-image:url(${presetThumb(k)})` })),
    ...state.bgs.map((b) => ({ mode: 'image', val: b.id, label: '', style: `background-image:url(/api/backgrounds/${b.id})`, del: true, name: b.name }))
  ];
  g.innerHTML = '';
  for (const t of tiles) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'bgTile'; b.setAttribute('style', t.style); if (t.label) { const lb = document.createElement('span'); lb.className = 'lb'; lb.textContent = t.label; b.appendChild(lb); }
    b.setAttribute('aria-label', 'Background: ' + (t.label || t.name || 'image'));
    const on = S.bgMode === t.mode && (t.mode === 'preset' ? S.bgPreset === t.val : t.mode === 'image' ? S.bgImage === t.val : true);
    b.setAttribute('aria-pressed', on);
    b.onclick = () => { const s = { ...state.script.settings, bgMode: t.mode }; if (t.mode === 'preset') s.bgPreset = t.val; if (t.mode === 'image') s.bgImage = t.val; state.script.settings = s; queueSave({ settings: s }); applySettings(false, 'bgMode'); if (t.mode !== 'none' && !cam.stream) toast('Turn on the camera to see your background'); };
    if (t.del) { const x = document.createElement('span'); x.className = 'x'; x.setAttribute('role', 'button'); x.setAttribute('aria-label', 'Delete background'); x.textContent = '×'; x.onclick = async (e) => { e.stopPropagation(); if (!(await confirmBox('Delete background?', 'This uploaded image will be removed from your account.', 'Delete', true))) return; try { await api('DELETE', 'backgrounds/' + t.val); state.bgs = state.bgs.filter((z) => z.id !== t.val); if (S.bgImage === t.val) setSetting('bgMode', 'none'); else renderBgGrid(); } catch (x2) { toast(x2.message, true); } }; b.appendChild(x); }
    g.appendChild(b);
  }
  if (state.bgs.length < 12) { const a = document.createElement('button'); a.type = 'button'; a.className = 'bgTile add'; a.textContent = '+ Upload'; a.onclick = () => $('bgFile').click(); g.appendChild(a); }
}
$('bgFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast('Use a JPG, PNG or WebP image', true);
  try {
    toast('Uploading background…');
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image')); i.src = URL.createObjectURL(f); });
    const scale = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
    let q = 0.85, url = c.toDataURL('image/jpeg', q); while (url.length * 0.75 > 780000 && q > 0.4) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
    const d = await api('POST', 'backgrounds', { name: f.name.replace(/\.[^.]+$/, ''), dataUrl: url });
    state.bgs.unshift(d.background); state.script.settings = { ...state.script.settings, bgMode: 'image', bgImage: d.background.id }; queueSave({ settings: state.script.settings }); applySettings(false, 'bgImage'); toast('Background added');
  } catch (x) { toast(x.message, true); }
};

/* ------------------------------------------------------------------ scroll engine */
let scrolling = false, raf = 0, lastTs = 0, acc = 0;
function pxPerSec() { const txtH = $('txt').offsetHeight; const sec = (state.words || 1) / state.eff.wpm * 60; return sec > 0 ? txtH / sec : 0; }
function tick(ts) {
  if (!scrolling) return; const sc = $('scroll');
  const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0; lastTs = ts; acc += pxPerSec() * dt;
  const w = Math.floor(acc); if (w > 0) { sc.scrollTop += w; acc -= w; }
  updateProgress();
  if (sc.scrollTop >= $('txt').offsetHeight - 4 || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1) { stopScroll(); return; }
  raf = requestAnimationFrame(tick);
}
function updateProgress() { const sc = $('scroll'), h = $('txt').offsetHeight || 1; $('progress').style.width = Math.min(100, sc.scrollTop / h * 100) + '%'; }
function startScroll() { if (scrolling || !state.script) return; scrolling = true; lastTs = 0; $('playLbl').textContent = 'Pause'; $('playIco').innerHTML = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>'; raf = requestAnimationFrame(tick); wake(true); }
function stopScroll() { scrolling = false; cancelAnimationFrame(raf); $('playLbl').textContent = 'Scroll'; $('playIco').innerHTML = '<path d="M7 4v16l13-8z"/>'; if (!recording()) wake(false); }
function topScroll() { stopScroll(); $('scroll').scrollTop = 0; acc = 0; updateProgress(); }
$('btnPlay').onclick = () => scrolling ? stopScroll() : startScroll();
$('btnTop').onclick = topScroll;
$('scroll').addEventListener('scroll', () => { if (!scrolling) updateProgress(); }, { passive: true });
function nudgeSpeed(d) { const v = Math.max(60, Math.min(260, state.eff.wpm + d)); setSetting('wpm', v); }
$('spdDown').onclick = () => nudgeSpeed(-5); $('spdUp').onclick = () => nudgeSpeed(5);
// tap the text to start / pause (ignores drags)
let pd = null;
$('scroll').addEventListener('pointerdown', (e) => { pd = { x: e.clientX, y: e.clientY, t: Date.now() }; });
$('scroll').addEventListener('pointerup', (e) => { if (!pd) return; const moved = Math.hypot(e.clientX - pd.x, e.clientY - pd.y); if (moved < 8 && Date.now() - pd.t < 350 && !e.target.closest('a,button')) { scrolling ? stopScroll() : startScroll(); } pd = null; });
let wakeLock = null;
async function wake(on) { try { if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch {} }

/* ------------------------------------------------------------------ camera + virtual background */
const cam = { token: 0, starting: false, meterSrc: null, stream: null, raf: 0, seg: null, segLoading: null, segFailed: false, lastVT: -1, audioCtx: null, meterRaf: 0, bgImg: null, bgImgId: null, presetCache: {}, maskData: null };
const out = $('out'); const octx = out.getContext('2d', { alpha: false });
const person = document.createElement('canvas'); const pctx = person.getContext('2d');
const blurC = document.createElement('canvas'); const bctx = blurC.getContext('2d');
const maskC = document.createElement('canvas'); const mctx = maskC.getContext('2d');
const hasFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;
document.addEventListener('pointerdown', () => { if (cam.audioCtx && cam.audioCtx.state === 'suspended') cam.audioCtx.resume(); }, { passive: true });
const video = $('cam'); video.hidden = false; Object.assign(video.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });

function outSize() {
  const S = state.eff, base = Number(S.res) || 1080; const [a, b] = S.aspect.split(':').map(Number);
  let W, H; if (a >= b) { H = base; W = Math.round(base * a / b); } else { W = base; H = Math.round(base * b / a); }
  return [W - (W % 2), H - (H % 2)];
}
function camLabel() {
  if (!cam.stream) return; const s = cam.stream.getVideoTracks()[0]?.getSettings() || {};
  const bg = state.eff.bgMode !== 'none' ? (cam.seg ? ' · bg on' : cam.segFailed ? ' · bg unavailable' : ' · loading bg…') : '';
  $('camLabel').textContent = `${out.width}×${out.height}${s.frameRate ? ' · ' + Math.round(s.frameRate) + 'fps' : ''}${bg}`;
}
function sizeCanvas() { const [W, H] = outSize(); if (out.width !== W || out.height !== H || person.width !== W || person.height !== H) { out.width = W; out.height = H; person.width = W; person.height = H; cam.presetCache = {}; } }
function camErr(msg) { const c = $('camOff'); c.hidden = false; c.classList.add('err'); c.textContent = msg; toast(msg, true); }
function explain(e) {
  const n = (e && e.name) || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Camera or mic is blocked. Click the camera icon in the address bar, allow Camera and Microphone, then try again.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'Your camera is busy in another app (Zoom, Meet, FaceTime). Close it and try again.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera found. Plug one in or choose another camera in Settings.';
  return 'Could not start the camera (' + (n || 'unknown error') + '). Reload and try again.';
}
async function startCamera(quiet) {
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return camErr('This browser cannot use the camera here. Use Chrome, Edge or Safari.');
  if (cam.starting) return; cam.starting = true; const token = ++cam.token;
  stopCamera(true); const S = state.eff; $('btnCam').disabled = true; $('camBtnLbl').textContent = 'Starting…';
  const base = Number(S.res) || 1080, capW = base === 2160 ? 3840 : base === 720 ? 1280 : 1920, capH = base;
  const camId = lsGet('pc.camId', ''), micId = lsGet('pc.micId', '');
  const v = { width: { ideal: capW }, height: { ideal: capH }, frameRate: { ideal: Number(S.fps) || 30 } }; if (camId) v.deviceId = { exact: camId };
  const a = { echoCancellation: !!S.noise, noiseSuppression: !!S.noise, autoGainControl: true }; if (micId) a.deviceId = { exact: micId };
  let stream = null, lastErr = null;
  for (const c of [{ video: v, audio: a }, { video: true, audio: true }, { video: true, audio: false }]) {
    try { stream = await navigator.mediaDevices.getUserMedia(c); if (c.audio === false) toast('No microphone found. Recording video without sound.', true); break; } catch (e) { lastErr = e; if (e.name === 'NotAllowedError') break; }
  }
  $('btnCam').disabled = false; cam.starting = false;
  if (token !== cam.token) { if (stream) stream.getTracks().forEach((t) => t.stop()); return; }
  if (!stream) { $('camBtnLbl').textContent = 'Camera'; lsSet('pc.camOn', false); if (!quiet || lastErr?.name !== 'NotAllowedError') camErr(explain(lastErr)); return; }
  if (state.view !== 'studioView') { stream.getTracks().forEach((t) => t.stop()); return; }
  cam.stream = stream; video.srcObject = stream; try { await video.play(); } catch {}
  $('camOff').hidden = true; $('camOff').classList.remove('err'); $('btnApplyCam').classList.remove('primary');
  $('camBtnLbl').textContent = 'Camera on'; $('btnCam').title = 'Turn camera off'; lsSet('pc.camOn', true);
  sizeCanvas(); camLabel(); cancelAnimationFrame(cam.raf); cam.raf = requestAnimationFrame(drawFrame); startMeter(); listDevices();
  if (S.bgMode !== 'none') ensureSeg();
}
function stopCamera(keepPref) {
  cancelAnimationFrame(cam.raf); cancelAnimationFrame(cam.meterRaf);
  try { cam.meterSrc && cam.meterSrc.disconnect(); } catch {} cam.meterSrc = null;
  if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop()); cam.stream = null; video.srcObject = null;
  $('camOff').hidden = false; $('camOff').classList.remove('err'); $('camOff').innerHTML = 'Tap <b>&nbsp;Camera&nbsp;</b> to turn on your webcam and mic';
  $('camLabel').textContent = 'camera off'; $('camBtnLbl').textContent = 'Camera'; $('btnCam').title = 'Start camera'; $('meter').style.width = '0';
  if (!keepPref && state.view === 'studioView') lsSet('pc.camOn', false);
}
$('btnCam').onclick = () => cam.stream ? (recording() ? toast('Stop recording first', true) : stopCamera()) : startCamera();
$('camOff').onclick = () => startCamera(); $('camOff').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startCamera(); } };
$('btnApplyCam').onclick = () => { if (recording()) return toast('Stop recording first', true); startCamera(); closeDrawer(); };
async function listDevices() {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    for (const [sel, kind, key] of [[$('camSel'), 'videoinput', 'pc.camId'], [$('micSel'), 'audioinput', 'pc.micId']]) {
      const cur = lsGet(key, ''); sel.innerHTML = `<option value="">Default ${kind === 'videoinput' ? 'camera' : 'microphone'}</option>`;
      devs.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default').forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || (kind === 'videoinput' ? 'Camera ' : 'Microphone ') + (i + 1); sel.appendChild(o); });
      sel.value = [...sel.options].some((o) => o.value === cur) ? cur : '';
    }
  } catch {}
}
$('camSel').onchange = () => { lsSet('pc.camId', $('camSel').value); $('btnApplyCam').classList.add('primary'); };
$('micSel').onchange = () => { lsSet('pc.micId', $('micSel').value); $('btnApplyCam').classList.add('primary'); };
navigator.mediaDevices?.addEventListener?.('devicechange', listDevices);
function startMeter() {
  try {
    if (!cam.stream.getAudioTracks().length) return;
    cam.audioCtx = cam.audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (cam.audioCtx.state === 'suspended') cam.audioCtx.resume();
    const an = cam.audioCtx.createAnalyser(); an.fftSize = 512; cam.meterSrc = cam.audioCtx.createMediaStreamSource(cam.stream); cam.meterSrc.connect(an); const data = new Uint8Array(an.frequencyBinCount);
    const loop = () => { an.getByteTimeDomainData(data); let s = 0; for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; s += v * v; } const rms = Math.sqrt(s / data.length); const m = $('meter'); m.style.width = Math.min(100, rms * 320) + '%'; m.style.background = rms > 0.3 ? 'var(--rec)' : 'var(--mint)'; cam.meterRaf = requestAnimationFrame(loop); };
    loop();
  } catch {}
}
async function ensureSeg() {
  if (cam.seg || cam.segFailed) return cam.seg; if (cam.segLoading) return cam.segLoading;
  camLabel();
  cam.segLoading = (async () => {
    try {
      const vision = await import(VISION + '/vision_bundle.mjs');
      const files = await vision.FilesetResolver.forVisionTasks(VISION + '/wasm');
      const opts = (delegate) => ({ baseOptions: { modelAssetPath: '/models/selfie_segmenter.tflite', delegate }, runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true });
      try { cam.seg = await vision.ImageSegmenter.createFromOptions(files, opts('GPU')); } catch { cam.seg = await vision.ImageSegmenter.createFromOptions(files, opts('CPU')); }
      camLabel();
      return cam.seg;
    } catch (e) { console.warn('segmenter', e); cam.segFailed = true; toast('Virtual backgrounds could not load on this browser. Showing your normal camera.', true); return null; }
    finally { cam.segLoading = null; }
  })();
  return cam.segLoading;
}
function onMask(res) {
  const m = res && res.confidenceMasks && res.confidenceMasks[0]; if (!m) return;
  const w = m.width, h = m.height, f = m.getAsFloat32Array();
  if (maskC.width !== w || maskC.height !== h || !cam.maskData) { maskC.width = w; maskC.height = h; cam.maskData = mctx.createImageData(w, h); cam.prev = new Float32Array(w * h); }
  const d = cam.maskData.data, prev = cam.prev;
  for (let i = 0, j = 0; i < f.length; i++, j += 4) { let v = f[i] * 0.7 + prev[i] * 0.3; prev[i] = v; v = (v - 0.3) / 0.45; v = v < 0 ? 0 : v > 1 ? 1 : v; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = v * 255; }
  mctx.putImageData(cam.maskData, 0, 0); cam.hasMask = true;
}
function prepBgImage() {
  const S = state.eff; if (S.bgMode !== 'image' || !S.bgImage || cam.bgImgId === S.bgImage) return;
  const img = new Image(); cam.bgImgId = S.bgImage; img.onload = () => { if (cam.bgImgId === S.bgImage) { cam.bgImg = img; cam.presetCache = {}; } }; img.src = '/api/backgrounds/' + S.bgImage; cam.bgImg = null;
}
function coverDraw(c, img, W, H) { const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; const s = Math.max(W / iw, H / ih), w = iw * s, h = ih * s; c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); }
function staticBg(key, W, H, painter) { const k = key + W + 'x' + H; if (!cam.presetCache[k]) { const c = document.createElement('canvas'); c.width = W; c.height = H; painter(c.getContext('2d'), W, H); cam.presetCache = { [k]: c }; } return cam.presetCache[k]; }
function drawFrame() {
  cam.raf = requestAnimationFrame(drawFrame);
  if (video.readyState < 2 || !video.videoWidth) return;
  const S = state.eff, W = out.width, H = out.height, vw = video.videoWidth, vh = video.videoHeight;
  const sc = Math.max(W / vw, H / vh), sw = W / sc, sh = H / sc, sx = (vw - sw) / 2, sy = (vh - sh) / 2;
  if (S.bgMode === 'none' || !cam.seg) { octx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H); return; }
  if (video.currentTime !== cam.lastVT) { cam.lastVT = video.currentTime; try { cam.seg.segmentForVideo(video, performance.now(), onMask); } catch (e) { console.warn(e); } }
  if (!cam.hasMask) { octx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H); return; }
  // background
  if (S.bgMode === 'blur') {
    const k = hasFilter ? 4 : Math.max(6, S.bgBlur / 1.5); const bw = Math.max(16, Math.round(W / k)), bh = Math.max(9, Math.round(H / k));
    if (blurC.width !== bw || blurC.height !== bh) { blurC.width = bw; blurC.height = bh; }
    if (hasFilter) { bctx.filter = `blur(${(S.bgBlur / k).toFixed(1)}px)`; const p = Math.ceil(S.bgBlur / k) * 2; bctx.drawImage(video, sx, sy, sw, sh, -p, -p, bw + 2 * p, bh + 2 * p); bctx.filter = 'none'; }
    else bctx.drawImage(video, sx, sy, sw, sh, 0, 0, bw, bh);
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high'; octx.drawImage(blurC, 0, 0, W, H);
  } else if (S.bgMode === 'color') { octx.fillStyle = S.bgColor; octx.fillRect(0, 0, W, H); }
  else if (S.bgMode === 'preset') { octx.drawImage(staticBg('p:' + S.bgPreset, W, H, (c, w, h) => (PRESETS[S.bgPreset] || PRESETS.studio).draw(c, w, h)), 0, 0); }
  else if (S.bgMode === 'image') { if (cam.bgImg) octx.drawImage(staticBg('i:' + cam.bgImgId, W, H, (c, w, h) => coverDraw(c, cam.bgImg, w, h)), 0, 0); else { octx.fillStyle = '#0a1f18'; octx.fillRect(0, 0, W, H); } }
  // person cut-out
  pctx.globalCompositeOperation = 'copy'; pctx.drawImage(video, sx, sy, sw, sh, 0, 0, W, H);
  pctx.globalCompositeOperation = 'destination-in'; pctx.imageSmoothingEnabled = true;
  const mw = maskC.width / vw, mh = maskC.height / vh; pctx.drawImage(maskC, sx * mw, sy * mh, sw * mw, sh * mh, 0, 0, W, H);
  pctx.globalCompositeOperation = 'source-over';
  octx.drawImage(person, 0, 0);
}

/* ------------------------------------------------------------------ recording */
let recorder = null, chunks = [], recStart = 0, recTimer = 0, badMime = new Set();
const recording = () => !!(recorder && recorder.state === 'recording');
function pickMime() {
  const c = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of c) if (!badMime.has(m) && window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  return '';
}
function countdown(n) { return new Promise((res) => { if (!n) return res(); const el = $('count'); el.classList.add('show'); const step = (k) => { if (k === 0) { el.classList.remove('show'); return res(); } el.textContent = k; setTimeout(() => step(k - 1), 1000); }; step(n); }); }
async function startRecording() {
  if (!window.MediaRecorder) return toast('This browser cannot record video. Use Chrome, Edge or Safari 14.1+.', true);
  if (!cam.stream) { await startCamera(); if (!cam.stream) return; }
  if (state.eff.bgMode !== 'none' && !cam.seg && !cam.segFailed) { toast('Loading background…'); await ensureSeg(); }
  closeDrawer(); $('btnRec').disabled = true; stopScroll(); if (state.eff.autoScroll) topScroll();
  await countdown(Number(state.eff.countdown) || 0);
  if (!cam.stream) { $('btnRec').disabled = false; return; }
  const fps = Number(state.eff.fps) || 30; let vtracks;
  if (out.captureStream) vtracks = out.captureStream(fps).getVideoTracks();
  else { vtracks = cam.stream.getVideoTracks(); toast('This browser records the plain camera (no background or framing).', true); }
  const ms = new MediaStream([...vtracks, ...cam.stream.getAudioTracks()]);
  const mime = pickMime(); chunks = [];
  const vbps = Math.round(Math.min(30e6, Math.max(3e6, out.width * out.height * fps * 0.12)));
  try { recorder = new MediaRecorder(ms, mime ? { mimeType: mime, videoBitsPerSecond: vbps, audioBitsPerSecond: 128000 } : undefined); }
  catch { try { recorder = new MediaRecorder(ms); } catch (e2) { $('btnRec').disabled = false; return toast('Recorder failed: ' + e2.name, true); } }
  recorder._own = out.captureStream ? vtracks : []; recorder._mime = mime; recorder._script = state.script?.title || 'script'; recorder._dims = out.width + '×' + out.height;
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  recorder.onerror = (ev) => { console.warn('recorder error', ev.error); if (recorder._mime) badMime.add(recorder._mime); toast('Recording stopped because of an encoder error. Press Record again to retry in another format.', true); };
  recorder.onstop = finishRecording;
  recorder.start(1000); recStart = Date.now();
  $('stage').classList.add('recording'); $('timer').classList.add('live'); $('btnRec').classList.add('live'); $('recLbl').textContent = 'Stop'; $('btnRec').disabled = false;
  recTimer = setInterval(() => { $('timer').textContent = fmt((Date.now() - recStart) / 1000); }, 250);
  wake(true); if (state.eff.autoScroll) startScroll();
}
function stopRecording() { if (recording()) recorder.stop(); }
function finishRecording() {
  try { (recorder._own || []).forEach((t) => t.stop()); } catch {}
  clearInterval(recTimer); $('stage').classList.remove('recording'); $('timer').classList.remove('live'); $('btnRec').classList.remove('live'); $('recLbl').textContent = 'Record'; $('timer').textContent = '00:00'; stopScroll();
  const dur = (Date.now() - recStart) / 1000; const type = (recorder && recorder.mimeType) || 'video/webm';
  if (!chunks.length) { toast('Nothing was recorded', true); return; }
  const blob = new Blob(chunks, { type }); const ext = type.includes('mp4') ? 'mp4' : 'webm';
  const n = state.takes.length + 1; const d = new Date(); const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  state.takes.push({ n, name: `${slug(recorder._script)}_take${n}_${stamp}.${ext}`, url: URL.createObjectURL(blob), size: blob.size, dur, type, dims: recorder._dims, script: recorder._script });
  renderTakes(); openDrawer('drTakes'); toast(`Take ${n} ready. Download it to keep it.`);
}
function renderTakes() {
  $('takeCount').textContent = state.takes.length;
  $('takesHelp').textContent = state.takes.length ? 'Play a take, then download the ones you want. Takes are only kept in this tab until you download them.' : 'Nothing recorded yet. Press Record to make your first take.';
  const box = $('takes'); box.innerHTML = '';
  for (const t of state.takes.slice().reverse()) {
    const el = document.createElement('div'); el.className = 'take';
    el.innerHTML = `<video controls playsinline preload="metadata"></video><div class="meta"><span>Take ${t.n}</span><span>${fmt(t.dur)}</span><span>${(t.size / 1048576).toFixed(1)} MB</span><span>${t.dims}</span><span>${t.type.includes('mp4') ? 'MP4' : 'WebM'}</span></div><div class="small" style="margin-top:-4px">${esc(t.script)}</div><div class="row"><a class="dl" href="${t.url}" download="${esc(t.name)}">Download</a><button type="button" class="ghost sm" data-del>Discard</button></div>`;
    el.querySelector('video').src = t.url;
    el.querySelector('[data-del]').onclick = async () => { if (!(await confirmBox('Discard take?', 'Take ' + t.n + ' will be deleted. This cannot be undone.', 'Discard', true))) return; URL.revokeObjectURL(t.url); state.takes = state.takes.filter((x) => x !== t); renderTakes(); };
    box.appendChild(el);
  }
}
function clearTakes() { state.takes.forEach((t) => URL.revokeObjectURL(t.url)); state.takes = []; renderTakes(); }
$('btnRec').onclick = () => recording() ? stopRecording() : startRecording();
$('btnCamHide').onclick = () => $('stage').classList.toggle('camHidden');
const canFull = !!document.documentElement.requestFullscreen; if (!canFull) $('btnFull').hidden = true;
$('btnFull').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); };
document.addEventListener('visibilitychange', () => { if (document.hidden && recording()) toast('Keep this tab visible while recording, or the video will freeze.', true); });

/* ------------------------------------------------------------------ keyboard */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (document.querySelector('.modal')) return; closeDrawer(); return; }
  if (state.view !== 'studioView' || document.querySelector('.modal')) return;
  const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'textarea' || tag === 'input' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (openDr && openDr !== 'drSettings') return;
  const k = e.key;
  if (k === ' ') { e.preventDefault(); scrolling ? stopScroll() : startScroll(); }
  else if (k === 'r' || k === 'R') { e.preventDefault(); $('btnRec').click(); }
  else if (k === 'ArrowDown') { e.preventDefault(); $('scroll').scrollTop += Math.round(state.eff.fontSize * state.eff.lineHeight); }
  else if (k === 'ArrowUp') { e.preventDefault(); $('scroll').scrollTop -= Math.round(state.eff.fontSize * state.eff.lineHeight); }
  else if (k === 'ArrowRight' || k === '+' || k === '=') { e.preventDefault(); nudgeSpeed(5); }
  else if (k === 'ArrowLeft' || k === '-') { e.preventDefault(); nudgeSpeed(-5); }
  else if (k === 'Home') { e.preventDefault(); topScroll(); }
  else if (k === 'h' || k === 'H') $('stage').classList.toggle('camHidden');
  else if (k === 'e' || k === 'E') { e.preventDefault(); openDrawer('drEdit'); }
  else if (k === 's' || k === 'S') { e.preventDefault(); openDrawer('drSettings'); }
  else if ((k === 'f' || k === 'F') && canFull) $('btnFull').click();
});

renderTakes();
boot();
