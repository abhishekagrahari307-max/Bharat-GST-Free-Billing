import { useEffect, useRef, useState } from 'react';
import {
  LifeBuoy,
  Bug,
  Star,
  BookOpen,
  HelpCircle,
  Wrench,
  X,
  AlertTriangle,
} from 'lucide-react';
import { subscribeOperations } from '../utils/operationRegistry';

const MINIMIZED_STORAGE_KEY = 'bharatgst_sos_fab_minimized';

/**
 * Always-accessible SOS Help, Error Support & Review Quick-Launcher (v5.3.1).
 * - Gives shopkeepers & CAs 1-click access to Zero-Login Error Support, Star Review,
 *   Quick Help FAQ, Hinglish GST Dictionary, and Demo Store / Staff PIN.
 * - Automatically highlights any recent failed background operation for instant 1-tap SOS reporting.
 * - Supports Alt+S keyboard shortcut and compact minimize mode when editing large bills.
 */
export default function SosHelpReviewButton({ onOpenHelpDesk }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [ops, setOps] = useState([]);
  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem(MINIMIZED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const rootRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeOperations((list) => {
      setOps(Array.isArray(list) ? list : []);
    });
    return unsub;
  }, []);

  // Close popover when clicking outside or pressing Escape; Alt+S toggles SOS menu
  useEffect(() => {
    const onDocClick = (e) => {
      if (menuOpen && rootRef.current && !rootRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
      } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setMenuOpen((v) => !v);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const failedJobs = ops.filter((o) => o.status === 'failed' || o.status === 'partial');
  const latestFailedJob = failedJobs[0] || null;
  const hasVisibleActivityDrawer = ops.length > 0;

  const toggleMinimized = (nextVal, e) => {
    if (e) e.stopPropagation();
    setMinimized(nextVal);
    setMenuOpen(false);
    try {
      localStorage.setItem(MINIMIZED_STORAGE_KEY, nextVal ? '1' : '0');
    } catch { /* ignore */ }
  };

  const triggerTab = (tab, job = null) => {
    setMenuOpen(false);
    if (typeof onOpenHelpDesk === 'function') {
      onOpenHelpDesk(tab, job);
    }
  };

  return (
    <div
      ref={rootRef}
      data-sos-open={menuOpen ? '1' : '0'}
      className={`sos-floating-root${hasVisibleActivityDrawer ? ' sos-above-drawer' : ''}`}
      aria-label="SOS Help and Review Quick Launcher"
    >
      {menuOpen && (
        <div
          className="sos-popover-card"
          role="menu"
          aria-label="SOS Help & Review Menu"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              paddingBottom: '0.55rem',
              marginBottom: '0.55rem',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0f172a' }}>
                🆘 SOS सहायता व रिव्यू (Zero-Login)
              </div>
              <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                बिना किसी लॉग-इन के तुरंत मदद लें या अपना सुझाव भेजें
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close SOS menu"
              style={{
                background: '#f1f5f9',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '0.2rem 0.35rem',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>

          {latestFailedJob && (
            <button
              type="button"
              role="menuitem"
              onClick={() => triggerTab('ERROR', latestFailedJob)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 0.65rem',
                marginBottom: '0.45rem',
                borderRadius: '8px',
                border: '1px solid #fca5a5',
                background: '#fef2f2',
                color: '#991b1b',
                fontSize: '0.78rem',
                fontWeight: 700,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0, color: '#dc2626' }} />
              <span>
                हालिया एरर तुरंत रिपोर्ट करें ({failedJobs.length}) — 1 क्लिक में भेजें
              </span>
            </button>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.38rem' }}>
            <button
              type="button"
              role="menuitem"
              onClick={() => triggerTab('ERROR', latestFailedJob)}
              className="sos-menu-item sos-menu-item-urgent"
            >
              <Bug size={16} style={{ color: '#dc2626', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>
                  🚨 समस्या / एरर रिपोर्ट भेजें (SOS)
                </div>
                <div style={{ fontSize: '0.71rem', color: '#475569' }}>
                  बिना लॉग-इन सीधे सबमिट करें या WhatsApp भेजें
                </div>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => triggerTab('REVIEW')}
              className="sos-menu-item sos-menu-item-review"
            >
              <Star size={16} style={{ color: '#d97706', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>
                  ⭐ रेटिंग व रिव्यू दें (Rate &amp; Review)
                </div>
                <div style={{ fontSize: '0.71rem', color: '#475569' }}>
                  1–5 स्टार रेटिंग व अपना अनुभव सीधे साझा करें
                </div>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => triggerTab('HELP')}
              className="sos-menu-item"
            >
              <HelpCircle size={16} style={{ color: '#2563eb', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.81rem', color: '#0f172a' }}>
                  🛟 त्वरित समाधान (Quick Help &amp; FAQ)
                </div>
                <div style={{ fontSize: '0.71rem', color: '#475569' }}>
                  P2P Sync, Backup, GSTR व प्रिंटिंग के तुरंत उत्तर
                </div>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => triggerTab('DICTIONARY')}
              className="sos-menu-item"
            >
              <BookOpen size={16} style={{ color: '#059669', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.81rem', color: '#0f172a' }}>
                  📖 व्यापार व GST शब्दकोश (Dictionary)
                </div>
                <div style={{ fontSize: '0.71rem', color: '#475569' }}>
                  ITC, 2B, 43B(h), 44AD, HSN, Rollover आसान भाषा में
                </div>
              </div>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => triggerTab('TOOLS')}
              className="sos-menu-item"
            >
              <Wrench size={16} style={{ color: '#7c3aed', flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.81rem', color: '#0f172a' }}>
                  🧪 1-Click Demo Store &amp; Staff PIN
                </div>
                <div style={{ fontSize: '0.71rem', color: '#475569' }}>
                  सैंपल बिल लोड करें या ऑपरेटर पिन लॉक लगाएँ
                </div>
              </div>
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '0.55rem',
              paddingTop: '0.45rem',
              borderTop: '1px solid #e2e8f0',
              fontSize: '0.7rem',
              color: '#64748b',
            }}
          >
            <span>शॉर्टकट: Alt + S</span>
            <button
              type="button"
              onClick={(e) => toggleMinimized(true, e)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#475569',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: '0.7rem',
              }}
            >
              छोटा आइकन बनाएँ (Minimize)
            </button>
          </div>
        </div>
      )}

      {minimized ? (
        <button
          type="button"
          className="sos-fab-btn sos-fab-compact"
          onClick={() => {
            toggleMinimized(false);
            setMenuOpen(true);
          }}
          title="SOS Help, Error Support & Review (Alt+S)"
          aria-label="Open SOS Help and Review menu"
          aria-expanded={menuOpen}
        >
          <LifeBuoy size={17} />
          <span>SOS</span>
          {failedJobs.length > 0 && (
            <span className="sos-alert-dot" aria-label={`${failedJobs.length} error`} />
          )}
        </button>
      ) : (
        <button
          type="button"
          className="sos-fab-btn"
          onClick={() => setMenuOpen((v) => !v)}
          title="SOS Help, Zero-Login Error Support & Review (Alt+S)"
          aria-label="SOS Help and Review"
          aria-expanded={menuOpen}
        >
          <span className="sos-pill-tag">SOS</span>
          <span style={{ fontWeight: 700 }}>Help &amp; Review</span>
          <Star size={14} style={{ color: '#fde047', fill: '#fde047', flexShrink: 0 }} />
          {failedJobs.length > 0 && (
            <span className="sos-alert-count">{failedJobs.length}</span>
          )}
        </button>
      )}
    </div>
  );
}
