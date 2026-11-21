/* Bharat GST Free Billing - Two-Stage Non-Destructive Boot Guard.
   Stage 1: Clears stale offline Service Worker / asset caches once per session
            if a module script fails to load or the app fails to mount.
   Stage 2: If Stage 1 already ran and the app still hasn't mounted within 8s,
            redirects to Safe Mode (?safe=1) while keeping all IndexedDB &
            localStorage business data 100% untouched. */
(function () {
  var RETRY_KEY = 'fgsb-boot-retry';
  var SAFE_KEY = 'bharat_gst_boot_rescue_step';
  var isSafe = false;
  try { isSafe = new URLSearchParams(location.search).get('safe') === '1'; } catch { /* ignore */ }

  if (isSafe && navigator.serviceWorker) {
    navigator.serviceWorker.getRegistrations()
      .then(function (regs) { return Promise.all(regs.map(function (r) { return r.unregister(); })); })
      .catch(function () {});
  }

  function enterSafeMode() {
    if (isSafe) return;
    try {
      if (sessionStorage.getItem(SAFE_KEY) === 'safe') return;
      sessionStorage.setItem(SAFE_KEY, 'safe');
    } catch { return; }
    var next = new URL(location.href);
    next.searchParams.set('safe', '1');
    location.replace(next.toString());
  }

  function clearAndReload() {
    var alreadyRetried = false;
    try {
      alreadyRetried = sessionStorage.getItem(RETRY_KEY) === '1';
      if (!alreadyRetried) sessionStorage.setItem(RETRY_KEY, '1');
    } catch { return; }

    if (alreadyRetried) {
      enterSafeMode();
      return;
    }

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
      .catch(function () {
        fetch('./version.json', { cache: 'no-store' })
          .then(function (r2) { if (r2.ok) clearAndReload(); })
          .catch(function () { /* genuinely offline or server stopped */ });
      });
  }

  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'SCRIPT' && t.type === 'module') recover();
  }, true);
  window.addEventListener('load', function () {
    setTimeout(function () { if (!window.__fgsbBooted) recover(); }, 4500);
    setTimeout(function () { if (!window.__fgsbBooted) enterSafeMode(); }, 8500);
  });
})();
