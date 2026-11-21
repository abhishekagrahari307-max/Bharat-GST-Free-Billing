// Complete Offline App Center + Startup Health Check & Self-Heal UI
// Provides 1-click Desktop/Laptop & Mobile PWA installation, iOS Safari guide,
// Persistent Offline Storage lock (`navigator.storage.persist()`), Desktop
// Portable Launcher download, lazy QR Code for Phone install, and 9-check Auto-Repair.
import { useEffect, useState } from 'react';
import {
  Monitor, Smartphone, WifiOff, CheckCircle2, Download, HardDrive, Shield, QrCode, Activity, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { toast } from './Toast';
import { runSelfHeal, isSafeModeActive } from '../utils/selfHeal';

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.matchMedia?.('(display-mode: window-controls-overlay)')?.matches
    || window.navigator?.standalone === true;
}

function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function OfflineAppCenter() {
  const [standalone, setStandalone] = useState(isStandaloneMode);
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine !== false : true));
  const [swReady, setSwReady] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(() => (typeof window !== 'undefined' ? window.__fgsbDeferredInstallPrompt || null : null));
  const [persisted, setPersisted] = useState(false);
  const [storageInfo, setStorageInfo] = useState({ usageMB: null, quotaMB: null });
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [healthReport, setHealthReport] = useState(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const safeMode = isSafeModeActive();

  useEffect(() => {
    const onPrompt = () => setDeferredPrompt(window.__fgsbDeferredInstallPrompt || null);
    const onInstalled = () => { setStandalone(true); setDeferredPrompt(null); };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);

    window.addEventListener('fgsb:pwa-prompt-ready', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    if (navigator.serviceWorker) {
      navigator.serviceWorker.ready.then(() => setSwReady(true)).catch(() => {});
      if (navigator.serviceWorker.controller) setSwReady(true);
    }

    if (navigator.storage?.persisted) {
      navigator.storage.persisted().then(setPersisted).catch(() => {});
    }
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((est) => {
        setStorageInfo({
          usageMB: est.usage ? (est.usage / (1024 * 1024)).toFixed(1) : '0.1',
          quotaMB: est.quota ? Math.round(est.quota / (1024 * 1024)) : null,
        });
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener('fgsb:pwa-prompt-ready', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Lazy-load qrcode chunk only when the user actually opens the Phone QR modal
  useEffect(() => {
    if (!showQr || qrDataUrl) return;
    const appUrl = window.location.origin + window.location.pathname;
    import('qrcode')
      .then((m) => (m.default || m).toDataURL(appUrl, { width: 180, margin: 1 }))
      .then(setQrDataUrl)
      .catch(() => {});
  }, [showQr, qrDataUrl]);

  const handleInstallApp = async () => {
    const p = deferredPrompt || window.__fgsbDeferredInstallPrompt;
    if (p) {
      try {
        p.prompt();
        const choice = await p.userChoice;
        if (choice?.outcome === 'accepted') {
          window.__fgsbDeferredInstallPrompt = null;
          setDeferredPrompt(null);
          toast('Bharat GST Free Billing installed! Open it anytime from your Desktop / Home Screen — even without internet.', 'success', 7000);
        }
      } catch { /* ignore */ }
      return;
    }
    if (isIosSafari()) {
      setShowIosGuide(true);
      return;
    }
    toast(
      'To install right now: open your browser menu (⋮ or ⋯ at top-right) → "Install Bharat GST Free Billing" (or on iPhone Safari: Share → Add to Home Screen).',
      'info',
      9000
    );
  };

  const handleRunHealthCheck = async () => {
    setHealthBusy(true);
    try {
      const rep = await runSelfHeal({ repair: true });
      setHealthReport(rep);
      if (rep.repairedCount > 0) {
        toast(`Auto-repaired ${rep.repairedCount} item${rep.repairedCount === 1 ? '' : 's'}. All user data is intact.`, 'success');
      } else if (rep.healthy) {
        toast('All 9 startup & storage health checks passed!', 'success');
      } else {
        toast('Health check finished with warnings — review details below.', 'info');
      }
    } catch {
      toast('Could not complete health check.', 'error');
    } finally {
      setHealthBusy(false);
    }
  };

  const handleExitSafeMode = () => {
    const next = new URL(window.location.href);
    next.searchParams.delete('safe');
    window.location.replace(next.toString());
  };

  const handleLockPersistentStorage = async () => {
    if (!navigator.storage?.persist) {
      toast('Persistent storage is managed automatically by this browser.', 'info');
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      setPersisted(granted);
      if (granted) {
        toast('Offline storage locked! Your browser will never auto-clear your invoices.', 'success');
      } else {
        toast('Install the app to Desktop/Home Screen first so the OS grants permanent storage lock.', 'info', 7000);
      }
    } catch {
      toast('Could not request storage lock', 'warning');
    }
  };

  const handleDownloadDesktopLauncher = () => {
    const targetUrl = window.location.origin + window.location.pathname;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bharat GST Free Billing — Desktop Offline Launcher</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:#0f172a; color:#f8fafc; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
    .card { max-width:520px; width:100%; background:#1e293b; border:1px solid #334155; border-radius:16px; padding:28px; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.45); }
    h1 { margin:0 0 8px; font-size:1.35rem; }
    p { color:#94a3b8; font-size:0.9rem; line-height:1.5; }
    .btn { display:inline-block; margin-top:14px; padding:12px 24px; background:#2563eb; color:#fff; font-weight:700; text-decoration:none; border-radius:10px; }
    .foot { margin-top:20px; font-size:0.75rem; color:#64748b; }
  </style>
  <script>
    setTimeout(function(){ window.location.replace(${JSON.stringify(targetUrl)}); }, 600);
  </script>
</head>
<body>
  <div class="card">
    <h1>🇮🇳 Bharat GST Free Billing</h1>
    <p>Opening your offline-ready GST Billing &amp; Invoicing Workspace…</p>
    <a class="btn" href="${targetUrl}">Launch Bharat GST App Now →</a>
    <div class="foot">Created by Abhishek Agrahari · Works Offline on Windows, Mac, Linux &amp; Mobile</div>
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Bharat-GST-Offline-Desktop-Launcher.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Downloaded Desktop Launcher! Save it on your Desktop for 1-click access.', 'success');
  };

  return (
    <div id="section-offline-app" className="glass-panel p-6 mb-6" style={{ order: 7 }}>
      {safeMode && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: 10, background: 'rgba(245, 158, 11, 0.14)', border: '1px solid #f59e0b' }}>
          <div style={{ fontSize: '0.82rem' }}>
            <strong><AlertTriangle size={15} style={{ verticalAlign: '-2px', marginRight: 5, color: '#d97706' }} />Safe Mode Active (`?safe=1`):</strong>{' '}
            Service Worker &amp; custom theme overrides are paused while keeping your data 100% safe.
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleExitSafeMode}>
            Return to Normal Mode
          </button>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <div>
          <h3 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <WifiOff size={19} style={{ color: 'var(--primary)' }} />
            Complete Offline App (Computer, Laptop &amp; Mobile)
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0' }}>
            Run Bharat GST Free Billing 100% without internet on Windows PC, Mac, Linux Laptop, Android &amp; iPhone.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.74rem', fontWeight: 700,
            background: swReady ? 'rgba(16, 185, 129, 0.14)' : 'var(--bg-secondary)',
            color: swReady ? 'var(--success, #059669)' : 'var(--text-secondary)',
            border: '1px solid var(--border)',
          }}>
            <CheckCircle2 size={14} />
            {swReady ? '100% Offline Cache Ready' : 'Offline Cache Ready'}
          </span>
          <span style={{
            padding: '0.3rem 0.65rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
          }}>
            {online ? '🟢 Internet Connected' : '⚡ Running Offline Now'}
          </span>
        </div>
      </div>

      {/* Two-Column Cards: Computer/Laptop + Mobile/Tablet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(275px, 1fr))', gap: '0.9rem', marginBottom: '0.9rem' }}>
        {/* PC & Laptop Card */}
        <div className="surface-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light, rgba(37,99,235,0.12))', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Monitor size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>For Computer &amp; Laptop</div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>Windows 10/11 · macOS · Ubuntu / Linux</div>
            </div>
          </div>

          <p style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            Installs as a standalone desktop window on your <strong>Desktop, Start Menu &amp; Taskbar</strong>. Generates invoices, A4/Thermal PDFs, UPI QR codes, and GSTR-1/3B JSON completely offline.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 'auto', paddingTop: '0.3rem' }}>
            {standalone ? (
              <span className="btn btn-secondary btn-sm" style={{ pointerEvents: 'none', color: 'var(--success)' }}>
                <CheckCircle2 size={15} /> Installed as Desktop App
              </span>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleInstallApp}>
                <Download size={15} /> {deferredPrompt ? 'Install App (1-Click)' : 'Install on Computer / Laptop'}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleDownloadDesktopLauncher}>
              <HardDrive size={15} /> Save Desktop Shortcut
            </button>
          </div>
        </div>

        {/* Mobile & Tablet Card */}
        <div className="surface-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-light, rgba(37,99,235,0.12))', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Smartphone size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>For Mobile &amp; Tablet</div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>Android App (Chrome) · iPhone &amp; iPad (Safari)</div>
            </div>
          </div>

          <p style={{ fontSize: '0.79rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            Full-screen mobile billing app with 5-tab thumb bar, WhatsApp PDF sharing, thermal Bluetooth printing, and 100% offline IndexedDB vault.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 'auto', paddingTop: '0.3rem' }}>
            {!standalone && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleInstallApp}>
                <Smartphone size={15} /> Install Mobile App
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowIosGuide((v) => !v)}>
              {showIosGuide ? 'Hide iOS Steps' : 'iPhone / iPad Guide'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowQr((v) => !v)}>
              <QrCode size={15} /> {showQr ? 'Hide Phone QR' : 'Scan QR on Phone'}
            </button>
          </div>

          {showIosGuide && (
            <div style={{ marginTop: '0.4rem', padding: '0.65rem 0.75rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '0.76rem', lineHeight: 1.5 }}>
              <strong>Install on iPhone / iPad (Safari):</strong>
              <ol style={{ margin: '0.3rem 0 0', paddingLeft: '1.15rem' }}>
                <li>Open this page in <strong>Safari</strong> on iPhone or iPad.</li>
                <li>Tap the <strong>Share</strong> icon (square with upward arrow ↑).</li>
                <li>Tap <strong>Add to Home Screen</strong> → <strong>Add</strong>.</li>
              </ol>
            </div>
          )}

          {showQr && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem', padding: '0.6rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
              {qrDataUrl && <img src={qrDataUrl} alt="Scan to open on phone" style={{ width: 88, height: 88, borderRadius: 8, background: '#fff', padding: 4 }} />}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <strong>Scan with your Phone Camera</strong><br />
                Opens Bharat GST Free Billing on your Android or iPhone, then tap <strong>Install App</strong> (or Share → Add to Home Screen).
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Offline Storage Protection + 9-Check Self-Heal Diagnostics */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', padding: '0.75rem 0.95rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.79rem' }}>
          <strong><Shield size={14} style={{ verticalAlign: '-2px', marginRight: 5, color: 'var(--primary)' }} />Offline Data Protection &amp; Self-Heal:</strong>{' '}
          {persisted
            ? 'Permanent Offline Storage Lock is ACTIVE.'
            : 'Lock browser storage so Windows/Android never clears offline invoices.'}
          {storageInfo.usageMB !== null && (
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
              (Using {storageInfo.usageMB} MB{storageInfo.quotaMB ? ` of ${storageInfo.quotaMB} MB` : ''})
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          {!persisted && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLockPersistentStorage}>
              Lock Offline Storage
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleRunHealthCheck} disabled={healthBusy}>
            {healthBusy ? <RefreshCw size={14} className="spin" /> : <Activity size={14} />}
            {' '}{healthBusy ? 'Checking…' : 'Health Check & Auto-Repair'}
          </button>
        </div>
      </div>

      {healthReport && (
        <div style={{ marginTop: '0.8rem', padding: '0.85rem 1rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
            <strong style={{ fontSize: '0.82rem' }}>
              9-Point System Health Report ({healthReport.healthy ? 'All Healthy' : `${healthReport.warnCount} Attention`})
            </strong>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Zero data deleted · Checked {new Date(healthReport.checkedAt).toLocaleTimeString('en-IN')}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.45rem' }}>
            {healthReport.checks.map((c) => {
              const badgeColor = c.status === 'ok' ? '#16a34a' : c.status === 'repaired' ? '#2563eb' : '#d97706';
              const badgeText = c.status === 'ok' ? 'OK' : c.status === 'repaired' ? 'REPAIRED' : 'NOTICE';
              return (
                <div key={c.id} style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-primary, transparent)', fontSize: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', fontWeight: 700 }}>
                    <span>{c.label}</span>
                    <span style={{ color: badgeColor, fontSize: '0.68rem' }}>{badgeText}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{c.detail}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
