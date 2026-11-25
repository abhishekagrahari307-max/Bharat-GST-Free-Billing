import { useState, useMemo } from 'react';
import {
  LifeBuoy,
  Bug,
  Star,
  Send,
  Copy,
  Check,
  ShieldAlert,
  ExternalLink,
  HelpCircle,
  BookOpen,
  Wrench,
  Lock,
  Unlock,
  Sparkles,
} from 'lucide-react';
import HelpDictionaryPanel from './HelpDictionaryPanel';
import {
  getOperationsSnapshot,
  sanitizeOperationText,
} from '../utils/operationRegistry';
import {
  setAdminLockPin,
  verifyAdminLockPin,
  clearAdminLockPin,
  isAdminPinConfigured,
  lockAdminSession,
  isStaffModeLocked,
  getSandboxDemoSeed,
} from '../utils/shopEssentials';
import { saveProduct, saveClient, saveBill, savePurchase, triggerBackup } from '../store';
import { confirmAction } from './ConfirmModal';
import { toast } from './Toast';

const REPO_URL = 'https://github.com/abhishekagrahari307-max/Bharat-GST-Free-Billing';

const QUICK_TROUBLESHOOT_GUIDES = [
  {
    q: 'PC Folder Live Mirror या Weighing Scale काम नहीं कर रहा?',
    a: 'यह फीचर केवल डेस्कटॉप पर Google Chrome, Microsoft Edge या Brave ब्राउज़र में (HTTPS या localhost पर) चलता है। Safari या मोबाइल ब्राउज़र पर सामान्य .fgsb / .json बैकअप डाउनलोड का उपयोग करें।',
  },
  {
    q: '5G मोबाइल और Counter PC के बीच P2P Sync कनेक्ट नहीं हो रहा?',
    a: 'सुनिश्चित करें कि दोनों डिवाइस पर इंटरनेट चालू है और 6-अक्षरों का Pairing PIN सही डाला गया है (5 गलत प्रयासों पर सुरक्षा लॉक लग जाता है)। यदि ऑफिस का Wi-Fi/NAT ब्लॉक कर रहा हो, तो मोबाइल डेटा/हॉटस्पॉट पर प्रयास करें।',
  },
  {
    q: 'B2B Storefront लिंक पर नए रेट या आइटम नहीं दिख रहे?',
    a: 'यह लिंक शेयर करते समय का स्टेटिक स्नैपशॉट (अधिकतम 150 आइटम, निर्माण समय के साथ) होता है। जब भी आप रेट या स्टॉक बदलें, नया "Copy B2B Storefront Link" जनरेट करके शेयर करें।',
  },
  {
    q: 'GSTR-1 / GSTR-3B JSON सरकारी पोर्टल पर अपलोड करने से पहले कैसे जाँचें?',
    a: 'ब्राउज़र डाउनलोड का अर्थ सरकारी पोर्टल पर फाइलिंग नहीं है। gst.gov.in से आधिकारिक "Returns Offline Tool" डाउनलोड करें, उसमें JSON जाँचें और अपने CA की समीक्षा के बाद ही पोर्टल पर फाइल करें।',
  },
];

export default function HelpDeskAndReviewModal({
  appVersion = 'v5.2.0',
  initialTab = 'HELP', // 'HELP' | 'DICTIONARY' | 'ERROR' | 'REVIEW' | 'TOOLS'
  prefilledErrorJob = null,
  recentSafeErrors = [],
  supportWhatsApp = '',
  onDataSeeded,
  onStaffLockChanged,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState(
    prefilledErrorJob ? 'ERROR' : initialTab
  );
  const [copied, setCopied] = useState(false);

  // Error Report State
  const [errorArea, setErrorArea] = useState(
    prefilledErrorJob?.category
      ? `Module: ${prefilledErrorJob.category}`
      : 'Billing / Invoice PDF'
  );
  const [errorDesc, setErrorDesc] = useState(
    prefilledErrorJob
      ? `${prefilledErrorJob.label}: ${prefilledErrorJob.error || prefilledErrorJob.phase || ''}`
      : ''
  );
  const [stepsToReproduce, setStepsToReproduce] = useState('');

  // Review State
  const [rating, setRating] = useState(5);
  const [reviewerRole, setReviewerRole] = useState('Shopkeeper / Business Owner');
  const [reviewText, setReviewText] = useState('');

  // Shopkeeper Tools State (Staff Lock PIN & Sandbox Demo Store)
  const [pinConfigured, setPinConfigured] = useState(() => isAdminPinConfigured());
  const [staffLocked, setStaffLocked] = useState(() => isStaffModeLocked());
  const [pinInput, setPinInput] = useState('');
  const [seedingDemo, setSeedingDemo] = useState(false);

  const combinedSafeErrors = useMemo(() => {
    if (Array.isArray(recentSafeErrors) && recentSafeErrors.length > 0) {
      return recentSafeErrors;
    }
    return getOperationsSnapshot()
      .filter((op) => op.status === 'failed' || op.status === 'partial')
      .map((op) => ({
        code: String(op.category || 'OP_ERR').toUpperCase(),
        phase: sanitizeOperationText(`${op.label} — ${op.error || op.phase}`),
      }));
  }, [recentSafeErrors]);

  // Privacy-Safe Diagnostic Builder — strictly redacts any accidental GSTIN/PAN/Phone/PIN/Key!
  const buildSafeDiagnosticText = () => {
    const swStatus =
      typeof navigator !== 'undefined' && navigator.serviceWorker?.controller
        ? 'Active (Controlling Tab)'
        : 'Not Controlling Tab';
    const onlineStatus =
      typeof navigator !== 'undefined' && navigator.onLine ? 'Online' : 'Offline';
    const platform =
      typeof navigator !== 'undefined' ? navigator.platform || 'Browser' : 'Unknown';

    const errorLogs =
      combinedSafeErrors.length > 0
        ? combinedSafeErrors
            .slice(0, 5)
            .map((e, i) => `${i + 1}. [${sanitizeOperationText(e.code || 'ERR')}] ${sanitizeOperationText(e.phase || '')}`)
            .join('\n')
        : 'None recorded in current session';

    return [
      '### Bharat GST Free Billing — Diagnostic & Issue Report',
      `- **App Version:** ${appVersion}`,
      `- **Network / SW:** ${onlineStatus} | ServiceWorker: ${swStatus}`,
      `- **Platform:** ${platform}`,
      `- **Affected Module:** ${sanitizeOperationText(errorArea)}`,
      '',
      '**Problem Description:**',
      sanitizeOperationText(errorDesc.trim()) || '(Not specified)',
      '',
      '**Steps to Reproduce:**',
      sanitizeOperationText(stepsToReproduce.trim()) || '(Not specified)',
      '',
      '**Sanitized System Error Codes (Zero Business/PII Data):**',
      errorLogs,
    ].join('\n');
  };

  const handleOpenGitHubIssue = () => {
    const safeShort = sanitizeOperationText(errorDesc).slice(0, 60) || 'Issue Report';
    const title = encodeURIComponent(`[Bug - ${errorArea}] ${safeShort}`);
    const body = encodeURIComponent(buildSafeDiagnosticText());
    window.open(`${REPO_URL}/issues/new?title=${title}&body=${body}`, '_blank', 'noopener,noreferrer');
  };

  const handleCopyDiagnostic = async () => {
    try {
      await navigator.clipboard.writeText(buildSafeDiagnosticText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast('सुरक्षित डायग्नोस्टिक रिपोर्ट कॉपी हो गई!', 'success');
    } catch {
      toast('क्लिपबोर्ड एक्सेस उपलब्ध नहीं है।', 'warning');
    }
  };

  const handleSubmitReviewGitHub = () => {
    const stars = '⭐'.repeat(rating);
    const title = encodeURIComponent(`[Review ${rating}/5] ${reviewerRole} Feedback`);
    const body = encodeURIComponent(
      [
        `### User / CA Review (${appVersion})`,
        `- **Rating:** ${stars} (${rating}/5)`,
        `- **Role:** ${reviewerRole}`,
        '',
        '**Feedback:**',
        sanitizeOperationText(reviewText.trim()) || '(No comment)',
      ].join('\n')
    );
    window.open(`${REPO_URL}/issues/new?title=${title}&body=${body}`, '_blank', 'noopener,noreferrer');
  };

  const handleSendWhatsApp = (text) => {
    const cleanPhone = String(supportWhatsApp || '').replace(/[^0-9]/g, '');
    const base = cleanPhone ? `https://wa.me/${cleanPhone}` : 'https://wa.me/';
    window.open(`${base}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const refreshLockState = () => {
    const conf = isAdminPinConfigured();
    const locked = isStaffModeLocked();
    setPinConfigured(conf);
    setStaffLocked(locked);
    if (typeof onStaffLockChanged === 'function') onStaffLockChanged(locked);
  };

  const handleSetStaffPin = () => {
    try {
      setAdminLockPin(pinInput);
      setPinInput('');
      refreshLockState();
      toast('Staff Lock PIN सेट हो गया! अब स्टाफ मोड सक्रिय है।', 'success');
    } catch (err) {
      toast(err.message || 'पिन सेट नहीं हो सका', 'error');
    }
  };

  const handleUnlockAdmin = () => {
    const res = verifyAdminLockPin(pinInput);
    if (res.ok) {
      setPinInput('');
      refreshLockState();
      toast('Admin मोड अनलॉक हो गया!', 'success');
    } else {
      toast(res.error || 'गलत पिन', 'error');
    }
  };

  const handleClearPin = () => {
    const res = clearAdminLockPin(pinInput);
    if (res.ok) {
      setPinInput('');
      refreshLockState();
      toast('Staff Lock PIN हटा दिया गया।', 'info');
    } else {
      toast(res.error || 'पिन हटाने के लिए सही वर्तमान पिन डालें', 'error');
    }
  };

  const handleLoadSandboxDemo = async () => {
    const ok = await confirmAction({
      title: '1-Click Demo / Sandbox Store डेटा जोड़ें?',
      message: 'यह आपके मौजूदा डेटा को मिटाए बिना 3 डेमो आइटम (Basmati Rice, Mustard Oil, LED Bulb), 2 डेमो पार्टियाँ (1 MSME Udyam सप्लायर सहित), 1 डेमो बिल और 1 खरीद बिल जोड़ देगा ताकि आप GSTR, ITR और Section 43B(h) तुरंत टेस्ट कर सकें।',
      confirmLabel: 'Load Demo Data',
      tone: 'info',
    });
    if (!ok) return;

    setSeedingDemo(true);
    try {
      await triggerBackup().catch(() => {});
      const seed = getSandboxDemoSeed();
      for (const p of seed.products) await saveProduct(p);
      for (const c of seed.clients) await saveClient(c);
      await saveBill(seed.sampleBill, { overwrite: true });
      await savePurchase(seed.samplePurchase);
      toast('डेमो स्टोर डेटा सफलतापूर्वक लोड हो गया! अब Dashboard, GST Returns और AI Hub देखें।', 'success');
      if (typeof onDataSeeded === 'function') onDataSeeded();
    } catch (err) {
      toast(err?.message || 'डेमो डेटा लोड करने में त्रुटि', 'error');
    } finally {
      setSeedingDemo(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Help Desk, GST Dictionary, Error Reporting & Reviews"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-card, #ffffff)',
          color: 'var(--text-primary, #0f172a)',
          borderRadius: '14px',
          border: '1px solid var(--border-color, #cbd5e1)',
          padding: '1.2rem',
          boxShadow: '0 20px 44px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.75rem',
            marginBottom: '0.9rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <LifeBuoy size={22} style={{ color: '#2563eb', flexShrink: 0 }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                Help Desk, GST Dictionary &amp; Support ({appVersion})
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                100% Privacy-Safe — आपका कोई भी बिल, GSTIN, फ़ोन या पासवर्ड बाहर नहीं जाता
              </span>
            </div>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              ✕ बंद करें
            </button>
          )}
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveTab('HELP')}
            className={`btn btn-sm ${activeTab === 'HELP' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <HelpCircle size={14} /> त्वरित समाधान (FAQ)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('DICTIONARY')}
            className={`btn btn-sm ${activeTab === 'DICTIONARY' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <BookOpen size={14} /> शब्दकोश (Dictionary)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('TOOLS')}
            className={`btn btn-sm ${activeTab === 'TOOLS' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Wrench size={14} /> Demo Store &amp; Staff PIN
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ERROR')}
            className={`btn btn-sm ${activeTab === 'ERROR' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Bug size={14} /> एरर रिपोर्ट करें
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('REVIEW')}
            className={`btn btn-sm ${activeTab === 'REVIEW' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Star size={14} /> रेटिंग व रिव्यू
          </button>
        </div>

        {/* TAB 1: QUICK SELF-HELP */}
        {activeTab === 'HELP' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {QUICK_TROUBLESHOOT_GUIDES.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  background: 'var(--bg-secondary, #f8fafc)',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.86rem', marginBottom: '0.25rem' }}>
                  {idx + 1}. {item.q}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #475569)', lineHeight: 1.45 }}>
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: HINGLISH GST & BUSINESS DICTIONARY */}
        {activeTab === 'DICTIONARY' && <HelpDictionaryPanel />}

        {/* TAB 3: SHOPKEEPER ESSENTIALS (DEMO STORE + SALTED STAFF PIN) */}
        {activeTab === 'TOOLS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div
              style={{
                padding: '0.85rem',
                borderRadius: '10px',
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-secondary, #f8fafc)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.9rem' }}>
                <Sparkles size={16} style={{ color: '#2563eb' }} />
                <span>1-Click Sample / Sandbox Store (नए यूज़र व CA टेस्टिंग के लिए)</span>
              </div>
              <p style={{ margin: '0.35rem 0 0.65rem', fontSize: '0.79rem', color: 'var(--text-secondary, #475569)' }}>
                बिना अपना असली खाता बदले तुरंत 3 सैंपल आइटम, MSME Udyam सप्लायर, और डेमो बिल जोड़कर GSTR-1/3B, ITR-3/4 और Section 43B(h) टेस्ट करें।
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={seedingDemo}
                onClick={handleLoadSandboxDemo}
              >
                <Sparkles size={14} /> {seedingDemo ? 'लोड हो रहा है…' : 'Load 1-Click Demo Store'}
              </button>
            </div>

            <div
              style={{
                padding: '0.85rem',
                borderRadius: '10px',
                border: '1px solid var(--border-color, #e2e8f0)',
                background: 'var(--bg-secondary, #f8fafc)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.9rem' }}>
                  {staffLocked ? <Lock size={16} style={{ color: '#d97706' }} /> : <Unlock size={16} style={{ color: '#16a34a' }} />}
                  <span>Staff / Operator PIN Guard</span>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '999px',
                    background: !pinConfigured
                      ? 'rgba(100,116,139,0.15)'
                      : staffLocked
                        ? 'rgba(217,119,6,0.16)'
                        : 'rgba(22,163,74,0.14)',
                    color: !pinConfigured ? '#475569' : staffLocked ? '#b45309' : '#15803d',
                  }}
                >
                  {!pinConfigured ? 'PIN Not Set' : staffLocked ? 'Staff Mode (Restricted)' : 'Admin Unlocked'}
                </span>
              </div>
              <p style={{ margin: '0.35rem 0 0.6rem', fontSize: '0.79rem', color: 'var(--text-secondary, #475569)' }}>
                4–6 अंकों का Admin PIN लगाने पर ऑपरेटर बिल बना सकता है, लेकिन सेटिंग्स/डिलीट अनलॉक करने के लिए Admin PIN मांगा जाएगा (Salted Hash + 5-प्रयास सुरक्षा)।
              </p>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="4–6 अंकों का PIN"
                  aria-label="Admin Lock PIN"
                  className="form-input"
                  style={{ width: '150px' }}
                />
                {!pinConfigured ? (
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleSetStaffPin}>
                    <Lock size={14} /> PIN सेट करें
                  </button>
                ) : (
                  <>
                    {staffLocked ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={handleUnlockAdmin}>
                        <Unlock size={14} /> Admin अनलॉक करें
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          lockAdminSession();
                          refreshLockState();
                          toast('Staff मोड फिर से लॉक कर दिया गया।', 'info');
                        }}
                      >
                        <Lock size={14} /> Staff लॉक लगाएँ
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleClearPin}>
                      PIN हटाएँ
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PRIVACY-SAFE ERROR REPORTER */}
        {activeTab === 'ERROR' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 0.75rem',
                borderRadius: '8px',
                background: 'rgba(37, 99, 235, 0.1)',
                color: 'var(--primary, #2563eb)',
                fontSize: '0.76rem',
                fontWeight: 600,
              }}
            >
              <ShieldAlert size={16} style={{ flexShrink: 0 }} />
              <span>
                रिपोर्ट में केवल तकनीकी एरर कोड और ब्राउज़र वर्ज़न जुड़ता है—कोई GSTIN, फ़ोन, पासवर्ड या पार्टी डेटा अपने-आप हटा (`[REDACTED]`) दिया जाता है।
              </span>
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                किस हिस्से में समस्या आ रही है?
              </label>
              <select
                value={errorArea}
                onChange={(e) => setErrorArea(e.target.value)}
                className="form-input"
                style={{ width: '100%' }}
              >
                <option>Billing / Invoice PDF</option>
                <option>GSTR-1 / 2B / 3B / 9 Export</option>
                <option>ITR-3/4 / Form 26Q / Sec 43B(h)</option>
                <option>5G WebRTC P2P Sync</option>
                <option>Backup / PC Folder Mirror / Restore</option>
                <option>Tally / Vyapar / Excel Import</option>
                <option>B2B WhatsApp Storefront</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                क्या एरर दिख रहा है? *
              </label>
              <textarea
                rows={3}
                placeholder="उदाहरण: GSTR-1 JSON डाउनलोड करते समय पेज अटक रहा है…"
                value={errorDesc}
                onChange={(e) => setErrorDesc(e.target.value)}
                className="form-input"
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                यह एरर कैसे आया? (वैकल्पिक)
              </label>
              <input
                type="text"
                placeholder="उदाहरण: Credit Note सेव करने के बाद Reports खोलने पर"
                value={stepsToReproduce}
                onChange={(e) => setStepsToReproduce(e.target.value)}
                className="form-input"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              <button type="button" onClick={handleOpenGitHubIssue} className="btn btn-primary btn-sm">
                <ExternalLink size={14} /> GitHub पर एरर भेजें
              </button>
              <button
                type="button"
                onClick={() => handleSendWhatsApp(buildSafeDiagnosticText())}
                className="btn btn-secondary btn-sm"
              >
                <Send size={14} /> WhatsApp पर भेजें
              </button>
              <button type="button" onClick={handleCopyDiagnostic} className="btn btn-secondary btn-sm">
                {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
                {copied ? 'कॉपी हो गया' : 'रिपोर्ट कॉपी करें'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 5: USER & CA REVIEW SYSTEM */}
        {activeTab === 'REVIEW' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label className="form-label" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                आपकी रेटिंग चुनें:
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setRating(num)}
                    aria-pressed={rating === num}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: '8px',
                      border: rating >= num ? '1px solid #f59e0b' : '1px solid var(--border-color, #cbd5e1)',
                      background: rating >= num ? 'rgba(245, 158, 11, 0.18)' : 'var(--bg-secondary, #f8fafc)',
                      color: 'var(--text-primary, #0f172a)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ⭐ {num}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                आपकी भूमिका (Role):
              </label>
              <select
                value={reviewerRole}
                onChange={(e) => setReviewerRole(e.target.value)}
                className="form-input"
                style={{ width: '100%' }}
              >
                <option>Shopkeeper / Business Owner</option>
                <option>Chartered Accountant (CA) / Tax Practitioner</option>
                <option>Accountant / Billing Operator</option>
                <option>Developer / Open-Source Reviewer</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                आपका अनुभव या सुझाव:
              </label>
              <textarea
                rows={3}
                placeholder="कौन-सा फ़ीचर सबसे अच्छा लगा या क्या सुधार होना चाहिए?"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                className="form-input"
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleSubmitReviewGitHub} className="btn btn-primary btn-sm">
                <ExternalLink size={14} /> रिव्यू सबमिट करें (GitHub)
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendWhatsApp(
                    `Bharat GST (${appVersion}) Review: ${rating}/5 ⭐ (${reviewerRole}) — ${sanitizeOperationText(reviewText)}`
                  )
                }
                className="btn btn-secondary btn-sm"
              >
                <Send size={14} /> WhatsApp पर रिव्यू भेजें
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
