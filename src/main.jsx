import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { installBrowserApiFallback } from './utils/browserApi'
import App from './App.jsx'
import AppLockGate from './components/AppLock.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { toast } from './components/Toast.jsx'
import { logProblem, APP_VERSION } from './utils/problemLog'
import { isChunkLoadError } from './utils/errorReport'
import { restorePrefs, startMirroring } from './utils/prefsMirror'
import { applyAppLook } from './utils/appLook'
import { isSafeModeActive, runSelfHeal } from './utils/selfHeal'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './index.css'

installBrowserApiFallback();

const SAFE_MODE = isSafeModeActive();

// Capture PWA install prompt early so mobile/desktop Install App UI never misses it
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__fgsbDeferredInstallPrompt = e;
  window.dispatchEvent(new CustomEvent('fgsb:pwa-prompt-ready'));
});

// Mark successful JS boot for public/boot-guard.js & request OS-protected persistent IndexedDB storage
window.__fgsbBooted = true;
try {
  sessionStorage.removeItem('fgsb-boot-retry');
  if (!SAFE_MODE) sessionStorage.removeItem('bharat_gst_boot_rescue_step');
  if (navigator.storage?.persist) {
    navigator.storage.persisted().then((already) => {
      if (!already) navigator.storage.persist().catch(() => {});
    }).catch(() => {});
  }
} catch { /* storage blocked */ }

let __updateSW = null;
let __updateNoticeShown = false;
window.__fgsbSwUpdateReady = false;

const hasUnsavedInput = () => {
  try {
    // Check if user is actively on the invoice/purchase editor or typing in a form field
    const activeEl = document.activeElement;
    if (activeEl && /^(INPUT|TEXTAREA|SELECT)$/.test(activeEl.tagName)) return true;
    const inputs = document.querySelectorAll('input:not([type="search"]):not([type="checkbox"]):not([type="radio"]):not([readonly]), textarea:not([readonly]), [contenteditable="true"]');
    for (const el of inputs) {
      if (el.closest?.('.generator-container, .invoice-generator-container, form[data-dirty="1"]')) {
        if (el.value && String(el.value).trim().length > 0) return true;
      }
      if (el.getAttribute?.('contenteditable') === 'true' && el.textContent?.trim().length > 0) return true;
    }
    return false;
  } catch { return false; }
};

if (!SAFE_MODE) {
  __updateSW = registerSW({
    onNeedRefresh() {
      window.__fgsbSwUpdateReady = true;
      window.dispatchEvent(new CustomEvent('fgsb-sw-update-ready'));
      let autoEnabled = true;
      try { autoEnabled = localStorage.getItem('bharat_auto_update_enabled') !== '0'; } catch { /* ignore */ }
      if (autoEnabled && !hasUnsavedInput()) {
        setTimeout(() => {
          if (!hasUnsavedInput()) window.__fgsbApplyUpdate?.();
        }, 600);
        return;
      }
      if (!__updateNoticeShown) {
        __updateNoticeShown = true;
        toast('A new daily update is ready — open Settings → App & updates (or finish your current invoice) to apply safely.', 'info', 8000);
      }
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('fgsb-sw-offline-ready'));
    },
  });
}

// Never force-reload while the user has unsaved invoice input unless explicitly clicked
window.__fgsbApplyUpdate = (force = false) => {
  if (!window.__fgsbSwUpdateReady) return;
  if (!force && hasUnsavedInput()) return;
  window.__fgsbSwUpdateReady = false;
  if (__updateSW) __updateSW(true);
};

// Auto-apply on blur/visibility hide ONLY when no unsaved invoice input exists
window.addEventListener('blur', () => {
  if (window.__fgsbSwUpdateReady && !hasUnsavedInput()) window.__fgsbApplyUpdate();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && window.__fgsbSwUpdateReady && !hasUnsavedInput()) {
    window.__fgsbApplyUpdate();
  }
});

// Gentle check on startup + every 30 min against ./version.json for deployed updates
if (!SAFE_MODE && typeof window !== 'undefined') {
  const checkRemoteVersion = async () => {
    if (!navigator.onLine) return;
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      await reg?.update?.();
      const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      if (data?.version && APP_VERSION && data.version !== APP_VERSION && APP_VERSION !== 'unknown') {
        await reg?.update?.();
      }
    } catch { /* offline or dev mode */ }
  };
  setTimeout(checkRemoteVersion, 1200);
  setInterval(checkRemoteVersion, 30 * 60 * 1000);
}

if (!SAFE_MODE && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;
    if (reg.waiting && !hasUnsavedInput()) {
      try {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      } catch { /* ignore */ }
    }
    let alreadyReloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (alreadyReloaded || !hadController || hasUnsavedInput()) return;
      alreadyReloaded = true;
      window.location.reload();
    });
  }).catch(() => { /* not registered yet */ });

  let chunkReloadFired = false;
  const onChunkFail = (msg) => {
    if (!chunkReloadFired && !hasUnsavedInput() && /dynamically imported module|Loading chunk|Failed to fetch dynamically/i.test(msg)) {
      chunkReloadFired = true;
      setTimeout(() => window.location.reload(), 200);
    }
  };
  window.addEventListener('error', (e) => onChunkFail(String(e?.message || e?.error?.message || '')));
  window.addEventListener('unhandledrejection', (e) => onChunkFail(String(e?.reason?.message || e?.reason || '')));
}

const NOISE = /ResizeObserver loop|^Script error\.?$/i;
const DEV_SERVER = /\/@vite\/client|\/node_modules\/\.vite\//;
let lastProblemToast = 0;
const recordUncaught = (message, stack, alreadyLogged = false) => {
  const msg = String(message || '');
  if (!msg || NOISE.test(msg) || isChunkLoadError(msg) || DEV_SERVER.test(String(stack || ''))) return;
  if (!alreadyLogged) logProblem({ kind: 'uncaught', message: msg, stack });
  if (Date.now() - lastProblemToast > 10_000) {
    lastProblemToast = Date.now();
    toast('Something went wrong. Your data is safe.', 'error');
  }
};
window.addEventListener('error', (e) => {
  try { recordUncaught(e?.error?.message || e?.message, e?.error?.stack); } catch { /* never throw */ }
});
window.addEventListener('unhandledrejection', (e) => {
  try { recordUncaught(e?.reason?.message || e?.reason, e?.reason?.stack, e?.reason?.problemLogged); } catch { /* never throw */ }
});

restorePrefs().then((restored) => {
  startMirroring(restored);
  if (!SAFE_MODE) applyAppLook();
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <AppLockGate>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </AppLockGate>
      </ErrorBoundary>
    </StrictMode>,
  );
  // Run non-destructive startup self-heal in idle time after first paint
  setTimeout(() => {
    runSelfHeal({ repair: true }).catch(() => {});
  }, 1800);
});
