/* anchit-store.js — per-user storage in the browser, for when there is no
 * database to talk to.
 *
 * WHY
 *   The Supabase organisation behind eight apps is blocked on an unpaid
 *   invoice, so every app lost auth AND its data layer at once. Auth is solved
 *   properly by anchit-auth.js, because Google's login is free and real. Storage
 *   has no equivalent free answer that is also a real backend, so this is
 *   deliberately the honest small one: the browser.
 *
 * READ THIS BEFORE USING IT FOR ANYTHING THAT MATTERS
 *   This is NOT a backend. Data written here:
 *     - lives on ONE device, in ONE browser. It does not sync.
 *     - is erased if the visitor clears site data, and may be evicted by the
 *       browser under storage pressure.
 *     - is visible to anyone who can open devtools on that device, so nothing
 *       secret belongs in it.
 *   It is right for a demo somebody tries once, a draft, a preference, a cart
 *   before checkout. It is wrong for an order history or anything another
 *   person must be able to see. Those need a database; this buys time.
 *
 *   Because of that, export() is not a nice-to-have. It is the only way the
 *   data survives the device, so every app using this should offer it.
 *
 * USE
 *   <script src="https://anchit-tandon.com/assets/anchit-store.js"
 *           data-app="passion-table"></script>
 *
 *   await AnchitStore.set('orders', 'o1', { total: 420 });
 *   await AnchitStore.get('orders', 'o1');
 *   await AnchitStore.list('orders');           -> [{ id, value }, …]
 *   await AnchitStore.remove('orders', 'o1');
 *   await AnchitStore.clear();                  -> this app, this user only
 *   await AnchitStore.export();                 -> a JSON blob the user can keep
 *   await AnchitStore.import(json);
 *
 *   Records are scoped to the signed-in Google user when anchit-auth.js is
 *   present, so two people on a shared laptop do not read each other's data.
 *   Signed out, everything is written under 'anon' and stays there - it is not
 *   silently adopted on sign-in, because guessing that a device's previous
 *   anonymous data belongs to whoever logs in next is how one person's cart
 *   ends up in another person's account. Call adopt() to move it deliberately.
 */
(function () {
  'use strict';
  if (window.AnchitStore) return;

  var script = document.currentScript;
  var APP = (script && script.getAttribute('data-app')) || location.hostname.split('.')[0] || 'app';
  var DB = 'anchit-store';
  var STORE = 'kv';
  var idb = null;
  var idbFailed = false;

  function who() {
    try {
      var u = window.AnchitAuth && window.AnchitAuth.user && window.AnchitAuth.user();
      return (u && u.sub) ? String(u.sub) : 'anon';
    } catch (e) { return 'anon'; }
  }
  function keyFor(collection, id, user) {
    return APP + '\u0000' + (user || who()) + '\u0000' + collection + '\u0000' + id;
  }
  function prefixFor(collection, user) {
    return APP + '\u0000' + (user || who()) + '\u0000' + (collection ? collection + '\u0000' : '');
  }

  // ── IndexedDB, with localStorage behind it ────────────────────────────────
  // Not for capacity alone: localStorage is synchronous, so a large write on a
  // slow phone blocks the main thread and the page stutters. IndexedDB is the
  // right default; localStorage is the fallback when it is unavailable, which
  // it genuinely is in some private-browsing modes.
  function open() {
    if (idbFailed) return Promise.resolve(null);
    if (idb) return Promise.resolve(idb);
    return new Promise(function (resolve) {
      var req;
      try { req = indexedDB.open(DB, 1); } catch (e) { idbFailed = true; return resolve(null); }
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { idb = req.result; resolve(idb); };
      req.onerror = function () { idbFailed = true; resolve(null); };
      // Firefox in permanent-private mode neither resolves nor errors.
      setTimeout(function () { if (!idb) { idbFailed = true; resolve(null); } }, 2000);
    });
  }

  function lsGet(k) { try { var v = localStorage.getItem('as:' + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } }
  function lsSet(k, v) { try { localStorage.setItem('as:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem('as:' + k); } catch (e) {} }
  function lsKeys() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('as:') === 0) out.push(k.slice(3)); } } catch (e) {}
    return out;
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      if (!db) return fn(null);
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var s = t.objectStore(STORE);
        var out = fn(s);
        t.oncomplete = function () { resolve(out && out.__v !== undefined ? out.__v : out); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function get(collection, id) {
    var k = keyFor(collection, id);
    return open().then(function (db) {
      if (!db) return lsGet(k);
      return new Promise(function (resolve) {
        var r = db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { resolve(undefined); };
      });
    });
  }

  function set(collection, id, value) {
    var k = keyFor(collection, id);
    return open().then(function (db) {
      if (!db) { return lsSet(k, value) ? value : Promise.reject(new Error('storage is unavailable')); }
      return new Promise(function (resolve, reject) {
        var r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, k);
        r.onsuccess = function () { resolve(value); };
        // A quota error is the realistic failure here, and it must be visible:
        // silently dropping a write is how an app tells someone their order was
        // saved when it was not.
        r.onerror = function () { reject(r.error || new Error('write failed')); };
      });
    });
  }

  function remove(collection, id) {
    var k = keyFor(collection, id);
    return open().then(function (db) {
      if (!db) { lsDel(k); return true; }
      return new Promise(function (resolve) {
        var r = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(k);
        r.onsuccess = function () { resolve(true); };
        r.onerror = function () { resolve(false); };
      });
    });
  }

  function entries(prefix) {
    return open().then(function (db) {
      if (!db) {
        return lsKeys().filter(function (k) { return k.indexOf(prefix) === 0; })
          .map(function (k) { return { key: k, value: lsGet(k) }; });
      }
      return new Promise(function (resolve) {
        var out = [];
        var r = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
        r.onsuccess = function () {
          var c = r.result;
          if (!c) return resolve(out);
          if (String(c.key).indexOf(prefix) === 0) out.push({ key: String(c.key), value: c.value });
          c.continue();
        };
        r.onerror = function () { resolve(out); };
      });
    });
  }

  function list(collection) {
    return entries(prefixFor(collection)).then(function (rows) {
      return rows.map(function (r) { return { id: r.key.split('\u0000').pop(), value: r.value }; });
    });
  }

  function clear() {
    return entries(prefixFor('')).then(function (rows) {
      return Promise.all(rows.map(function (r) {
        var parts = r.key.split('\u0000');
        return remove(parts[2], parts[3]);
      })).then(function () { return true; });
    });
  }

  function exportAll() {
    return entries(prefixFor('')).then(function (rows) {
      return { app: APP, user: who(), exportedAt: new Date().toISOString(),
        records: rows.map(function (r) {
          var p = r.key.split('\u0000');
          return { collection: p[2], id: p[3], value: r.value };
        }) };
    });
  }

  function importAll(blob) {
    var data = typeof blob === 'string' ? JSON.parse(blob) : blob;
    var rows = (data && data.records) || [];
    return Promise.all(rows.map(function (r) { return set(r.collection, r.id, r.value); }))
      .then(function () { return rows.length; });
  }

  // Move anonymous records to the signed-in user, on purpose and never by
  // default. See the note at the top of this file.
  function adopt() {
    var user = who();
    if (user === 'anon') return Promise.resolve(0);
    return entries(prefixFor('', 'anon')).then(function (rows) {
      return Promise.all(rows.map(function (r) {
        var p = r.key.split('\u0000');
        return set(p[2], p[3], r.value).then(function () { return remove(p[2], p[3]); });
      })).then(function () { return rows.length; });
    });
  }

  function available() {
    return open().then(function (db) {
      if (db) return { ok: true, engine: 'indexeddb' };
      var probe = lsSet('__probe', 1);
      lsDel('__probe');
      return probe ? { ok: true, engine: 'localstorage' } : { ok: false, engine: 'none' };
    });
  }

  window.AnchitStore = {
    app: APP, user: who,
    get: get, set: set, list: list, remove: remove, clear: clear,
    export: exportAll, import: importAll, adopt: adopt, available: available,
  };
}());
