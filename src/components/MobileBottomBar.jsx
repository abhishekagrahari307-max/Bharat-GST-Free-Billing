import { useState, useEffect } from 'react';
import { LayoutDashboard, Plus, Users, Package, BarChart3, Menu, Download, X, Share } from 'lucide-react';
import { toast } from './Toast';

const DISMISS_INSTALL_KEY = 'fgsb_pwa_install_dismissed';

function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)')?.matches ||
    window.navigator?.standalone === true
  );
}

function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isWebkit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isWebkit;
}

export default function MobileBottomBar({
  currentView,
  onNavigate,
  onNewInvoice,
  onOpenMenu,
  hasInventory = true,
  anyDot = null,
}) {
  const [deferredPrompt, setDeferredPrompt] = useState(() => (typeof window !== 'undefined' ? window.__fgsbDeferredInstallPrompt || null : null));
  const [installed, setInstalled] = useState(isStandalonePwa);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_INSTALL_KEY) === '1'; } catch { return false; }
  });
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      window.__fgsbDeferredInstallPrompt = e;
      setDeferredPrompt(e);
    };
    const onReady = () => {
      if (window.__fgsbDeferredInstallPrompt) setDeferredPrompt(window.__fgsbDeferredInstallPrompt);
    };
    const onInstalled = () => {
      window.__fgsbDeferredInstallPrompt = null;
      setDeferredPrompt(null);
      setInstalled(true);
      toast('Bharat GST App installed on your device!', 'success');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('fgsb:pwa-prompt-ready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('fgsb:pwa-prompt-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Hide bottom bar while virtual keyboard is open on mobile so inputs get maximum screen height
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const checkKeyboard = () => {
      const shrunk = window.innerHeight - vv.height > 140;
      const focusedInput = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
      setKeyboardOpen(shrunk && focusedInput);
    };
    vv.addEventListener('resize', checkKeyboard);
    return () => vv.removeEventListener('resize', checkKeyboard);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
          window.__fgsbDeferredInstallPrompt = null;
          setDeferredPrompt(null);
        }
      } catch { /* user cancelled */ }
      return;
    }
    if (isIosSafari()) {
      setShowIosGuide(true);
    }
  };

  const dismissBanner = () => {
    setDismissed(true);
    try { sessionStorage.setItem(DISMISS_INSTALL_KEY, '1'); } catch { /* ignore */ }
  };

  const canShowInstall = !installed && !dismissed && (!!deferredPrompt || isIosSafari());
  const fourthTab = hasInventory
    ? { id: 'inventory', label: 'Stock', Icon: Package }
    : { id: 'reports', label: 'Reports', Icon: BarChart3 };

  return (
    <>
      {canShowInstall && !keyboardOpen && (
        <div className="pwa-install-float no-print" role="region" aria-label="Install Bharat GST App">
          <div className="pwa-install-float-icon">B</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.8rem', lineHeight: 1.2 }}>Install Bharat GST App</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Works 100% offline • Fast home-screen billing
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={handleInstallClick} style={{ padding: '0.32rem 0.7rem', fontSize: '0.76rem', minHeight: 32 }}>
            <Download size={13} /> Install
          </button>
          <button type="button" className="icon-btn" onClick={dismissBanner} title="Dismiss" aria-label="Dismiss install banner" style={{ padding: 4 }}>
            <X size={15} />
          </button>
        </div>
      )}

      {showIosGuide && (
        <div className="modal-overlay" onClick={() => setShowIosGuide(false)}>
          <div className="modal-content" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Install on iPhone / iPad</h3>
              <button type="button" className="icon-btn" onClick={() => setShowIosGuide(false)} title="Close"><X size={18} /></button>
            </div>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              <li>Tap the Safari <strong>Share</strong> button <Share size={14} style={{ verticalAlign: 'middle' }} /> at the bottom of your screen.</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
              <li>Tap <strong>Add</strong> — <strong>Bharat GST</strong> will open full-screen like a native app, even offline!</li>
            </ol>
          </div>
        </div>
      )}

      <nav className={`mobile-bottom-nav no-print${keyboardOpen ? ' is-hidden' : ''}`} aria-label="Mobile quick navigation">
        <button
          type="button"
          className={`mobile-bottom-tab${currentView === 'dashboard' ? ' active' : ''}`}
          onClick={() => onNavigate('dashboard')}
        >
          <LayoutDashboard size={19} />
          <span>Home</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-tab${currentView === 'clients' ? ' active' : ''}`}
          onClick={() => onNavigate('clients')}
        >
          <Users size={19} />
          <span>Clients</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-fab${currentView === 'new' ? ' active' : ''}`}
          onClick={onNewInvoice}
          aria-label="Create New Bill"
        >
          <span className="mobile-bottom-fab-circle">
            <Plus size={22} strokeWidth={2.5} />
          </span>
          <span>New Bill</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-tab${currentView === fourthTab.id ? ' active' : ''}`}
          onClick={() => onNavigate(fourthTab.id)}
        >
          <fourthTab.Icon size={19} />
          <span>{fourthTab.label}</span>
        </button>

        <button
          type="button"
          className="mobile-bottom-tab"
          onClick={onOpenMenu}
          style={{ position: 'relative' }}
        >
          <Menu size={19} />
          <span>More</span>
          {anyDot && <span className="mobile-tab-dot" aria-hidden="true" />}
        </button>
      </nav>
    </>
  );
}
