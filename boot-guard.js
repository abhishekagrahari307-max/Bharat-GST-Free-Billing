/* Bharat GST Free Billing - start-up guard.
   Clears stale offline Service Worker caches once per session if a module script
   fails to load while the server is reachable. */
(function () {
  var KEY = 'fgsb-boot-retry';
  function recover() {
    if (/\.github\.io$|\.netlify\.app$|\.vercel\.app$|\.pages\.dev$/i.test(location.hostname)) {
      clearAndReload();
      return;
    }
    fetch('./api/version', { cache: 'no-store' })
      .then(function (r) {
        var ct = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        if (r.ok && ct.indexOf('json') !== -1) clearAndReload();
      })
      .catch(function () { /* server not running */ });
  }
  function clearAndReload() {
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, '1');
    } catch { return; }
    var jobs = [];
    if (navigator.serviceWorker) {
      jobs.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }));
    }
    if (window.caches) {
      jobs.push(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }));
    }
    Promise.all(jobs).catch(function () {}).then(function () { location.reload(); });
  }
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT' && t.type === 'module') recover();
  }, true);
  window.addEventListener('load', function () {
    setTimeout(function () { if (!window.__fgsbBooted) recover(); }, 3500);
  });
})();
