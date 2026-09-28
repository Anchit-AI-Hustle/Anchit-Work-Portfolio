/* anchit-auth.js — Google sign-in for every project, in one script tag.
 *
 * WHY
 *   Sign-in broke in all eight apps on the same day, because all eight leaned
 *   on one Supabase organisation and that organisation is blocked on an unpaid
 *   invoice. This removes the shared point of failure rather than restoring it.
 *   Google does not charge for sign-in; there is no plan to outgrow, no project
 *   to un-pause, and no invoice that can take every app down at once.
 *
 * USE (two lines in any page, on any origin)
 *   <script src="https://anchit-tandon.com/assets/anchit-auth.js"
 *           data-client-id="<YOUR_GOOGLE_CLIENT_ID>"></script>
 *   <div data-anchit-signin></div>
 *
 *   AnchitAuth.user()                  -> { sub, email, name, picture } or null
 *   AnchitAuth.onChange(fn)            -> called now and on every change
 *   AnchitAuth.signOut()
 *   AnchitAuth.require()               -> Promise that resolves once signed in
 *
 * WHAT IT STORES
 *   One localStorage entry with the verified profile and the token's own expiry.
 *   No password is ever created, sent or stored - which is the main reason to
 *   prefer this over a mobile-and-password form. A password form means salting,
 *   hashing, reset flows, rate limiting, breach handling and a database that
 *   can lapse, to end up strictly less secure than Google's own login.
 *
 * VERIFICATION
 *   The token is verified at /api/auth-verify against Google's public keys,
 *   with the audience checked. Decoding in the browser is NOT verifying: anyone
 *   can mint a JWT with any email in it, so a client-side decode may decide what
 *   a page LOOKS like but must never decide what someone is allowed to see.
 *   If the verifier is unreachable, sign-in fails closed.
 */
(function () {
  'use strict';
  if (window.AnchitAuth) return;

  var script = document.currentScript;
  var CLIENT_ID = (script && script.getAttribute('data-client-id')) || window.ANCHIT_GOOGLE_CLIENT_ID || '';
  // Default to the origin this script was served from, so a project on another
  // domain verifies against the portfolio's function without extra config.
  var API = (script && script.getAttribute('data-verify-url')) ||
    (script && script.src ? new URL(script.src).origin + '/api/auth-verify' : '/api/auth-verify');
  var KEY = 'anchit-auth-user';

  var listeners = [];
  var current = null;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var saved = JSON.parse(raw);
      // Honour the token's own expiry rather than inventing a session length.
      if (!saved || !saved.exp || saved.exp * 1000 < Date.now()) { localStorage.removeItem(KEY); return null; }
      return saved;
    } catch (e) { return null; }   // private mode, blocked storage, corrupt value
  }

  function set(user) {
    current = user;
    try { user ? localStorage.setItem(KEY, JSON.stringify(user)) : localStorage.removeItem(KEY); } catch (e) {}
    listeners.forEach(function (fn) { try { fn(user); } catch (e) {} });
    render();
  }

  function onCredential(resp) {
    fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: resp.credential }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.user) set(d.user);
        else fail('sign-in could not be verified');
      })
      .catch(function () { fail('could not reach the sign-in service'); });
  }

  function fail(msg) {
    set(null);
    document.querySelectorAll('[data-anchit-signin]').forEach(function (el) {
      var p = el.querySelector('.anchit-auth-msg') || document.createElement('p');
      p.className = 'anchit-auth-msg';
      p.style.cssText = 'margin:8px 0 0;font:500 12px/1.4 system-ui,sans-serif;color:#b3261e';
      p.textContent = msg;
      if (!p.parentNode) el.appendChild(p);
    });
  }

  function render() {
    document.querySelectorAll('[data-anchit-signin]').forEach(function (el) {
      el.innerHTML = '';
      if (current) {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:center;gap:10px;font:500 14px/1.2 system-ui,sans-serif';
        if (current.picture) {
          var img = document.createElement('img');
          img.src = current.picture; img.alt = ''; img.width = 28; img.height = 28;
          img.referrerPolicy = 'no-referrer';      // Google blocks hotlinks with a referrer
          img.style.cssText = 'border-radius:50%';
          wrap.appendChild(img);
        }
        var name = document.createElement('span');
        name.textContent = current.name || current.email;
        var out = document.createElement('button');
        out.type = 'button'; out.textContent = 'Sign out';
        out.style.cssText = 'font:inherit;cursor:pointer;background:none;border:0;text-decoration:underline;opacity:.75';
        out.onclick = signOut;
        wrap.appendChild(name); wrap.appendChild(out);
        el.appendChild(wrap);
      } else if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill' });
      }
    });
  }

  function signOut() {
    try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {}
    set(null);
  }

  // Ask the verifier for the client id when the page did not supply one. A
  // server-side environment variable cannot populate a static script tag, so
  // without this a correctly-configured deployment still renders "not
  // configured" - which reads as a Google problem rather than a missing
  // attribute. data-client-id still wins when present.
  function resolveClientId() {
    if (CLIENT_ID) return Promise.resolve(CLIENT_ID);
    return fetch(API, { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (d) { CLIENT_ID = (d && d.clientId) || ''; return CLIENT_ID; })
      .catch(function () { return ''; });
  }

  function init() {
    resolveClientId().then(function (id) {
      if (!id) {
        fail('Sign-in is not configured for this site yet.');
        console.warn('[anchit-auth] no client id: pass data-client-id, or set GOOGLE_CLIENT_ID on the deployment.');
        return;
      }
      start();
    });
  }

  function start() {
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: onCredential,
      auto_select: true,           // returning visitors are not asked twice
      cancel_on_tap_outside: false,
    });
    render();
    if (!current) { try { google.accounts.id.prompt(); } catch (e) {} }
  }

  window.AnchitAuth = {
    user: function () { return current; },
    signOut: signOut,
    onChange: function (fn) { listeners.push(fn); try { fn(current); } catch (e) {} },
    require: function () {
      return new Promise(function (resolve) {
        if (current) return resolve(current);
        listeners.push(function (u) { if (u) resolve(u); });
      });
    },
  };

  current = load();

  var gsi = document.createElement('script');
  gsi.src = 'https://accounts.google.com/gsi/client';
  gsi.async = true; gsi.defer = true;
  gsi.onload = init;
  gsi.onerror = function () { fail('Google sign-in could not load.'); };
  document.head.appendChild(gsi);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
}());
