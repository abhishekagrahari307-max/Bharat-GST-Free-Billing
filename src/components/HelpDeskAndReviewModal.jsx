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
  CheckCircle2,
  Rocket,
} from 'lucide-react';
import HelpDictionaryPanel from './HelpDictionaryPanel';
import {
  getOperationsSnapshot,
  sanitizeOperationText,
  startOperation,
  finishOperation,
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
import {
  submitFeedbackWithoutLogin,
  getSubmittedFeedbackHistory,
  getFeedbackBridgeConfig,
  saveFeedbackBridgeConfig,
} from '../utils/zeroLoginFeedback';
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

// Explicit high-contrast field & label styles so text is 100% readable in both Light & Dark themes
const LABEL_STYLE = {
  display: 'block',
  fontSize: '0.81rem',
  fontWeight: 700,
  color: '#1e293b',
  marginBottom: '0.3rem',
};

const INPUT_STYLE = {
  width: '100%',
  background: '#ffffff',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  padding: '0.5rem 0.65rem',
  fontSize: '0.84rem',
};

export default function HelpDeskAndReviewModal({
  appVersion = 'v5.5.2',
  initialTab = 'HELP', // 'HELP' | 'DICTIONARY' | 'ERROR' | 'REVIEW' | 'TOOLS'
  prefilledErrorJob = null,
  recentSafeErrors = [],
  supportWhatsApp = '',
  onDataSeeded,
  onStaffLockChanged,
  onOpenGuide,
  onOpenShortcuts,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState(
    prefilledErrorJob ? 'ERROR' : initialTab
  );
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState(null);
  const [historyList, setHistoryList] = useState(() => getSubmittedFeedbackHistory());

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

  // Shopkeeper Tools & Optional Webhook Bridge State
  const [pinConfigured, setPinConfigured] = useState(() => isAdminPinConfigured());
  const [staffLocked, setStaffLocked] = useState(() => isStaffModeLocked());
  const [pinInput, setPinInput] = useState('');
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [bridgeCfg, setBridgeCfg] = useState(() => getFeedbackBridgeConfig());

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
            .map(
              (e, i) =>
                `${i + 1}. [${sanitizeOperationText(e.code || 'ERR')}] ${sanitizeOperationText(
                  e.phase || ''
                )}`
            )
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

  // ZERO-LOGIN DIRECT SUBMIT (Primary Button for Shopkeepers & CAs!)
  const handleDirectZeroLoginSubmit = async (submitType) => {
    setSubmitting(true);
    const opId = startOperation({
      category: 'support',
      label: submitType === 'ERROR' ? 'Zero-Login Error Report' : `Zero-Login ${rating}★ Review`,
      phase: 'Sanitizing & submitting directly without login…',
      destination: 'In-App Support Inbox',
    });

    try {
      const res = await submitFeedbackWithoutLogin({
        type: submitType,
        appVersion,
        rating,
        roleOrModule: submitType === 'ERROR' ? errorArea : reviewerRole,
        message: submitType === 'ERROR' ? errorDesc : reviewText || `${rating}/5 Star Feedback`,
        stepsToReproduce: submitType === 'ERROR' ? stepsToReproduce : '',
        sanitizedDiagnostics: submitType === 'ERROR' ? buildSafeDiagnosticText() : '',
      });

      setLastSubmitted(res.entry);
      setHistoryList(getSubmittedFeedbackHistory());
      if (submitType === 'ERROR') {
        setErrorDesc('');
        setStepsToReproduce('');
      } else {
        setReviewText('');
      }

      finishOperation(opId, {
        status: 'success',
        phase: res.sentOnline
          ? `Submitted directly (${res.channel}) — ID: ${res.entry.id}`
          : `Saved to Support Inbox (ID: ${res.entry.id}) — zero login required`,
      });

      toast(
        submitType === 'ERROR'
          ? `✅ एरर रिपोर्ट बिना किसी लॉग-इन के सबमिट हो गई! (${res.entry.id})`
          : `✅ आपका ${rating}★ रिव्यू बिना लॉग-इन के दर्ज हो गया! धन्यवाद!`,
        'success'
      );
    } catch (err) {
      finishOperation(opId, { status: 'failed', error: err });
      toast(err?.message || 'सबमिट करने में समस्या आई', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenGitHubIssue = () => {
    const safeShort = sanitizeOperationText(errorDesc).slice(0, 60) || 'Issue Report';
    const title = encodeURIComponent(`[Bug - ${errorArea}] ${safeShort}`);
    const body = encodeURIComponent(buildSafeDiagnosticText());
    window.open(`${REPO_URL}/issues/new?title=${title}&body=${body}`, '_blank', 'noopener,noreferrer');
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

  const handleSendWhatsApp = (text) => {
    const effectivePhone = String(supportWhatsApp || bridgeCfg.supportWhatsApp || '').replace(
      /[^0-9]/g,
      ''
    );
    const base = effectivePhone ? `https://wa.me/${effectivePhone}` : 'https://wa.me/';
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
      message:
        'यह आपके मौजूदा डेटा को मिटाए बिना 3 डेमो आइटम (Basmati Rice, Mustard Oil, LED Bulb), 2 डेमो पार्टियाँ (1 MSME Udyam सप्लायर सहित), 1 डेमो बिल और 1 खरीद बिल जोड़ देगा ताकि आप GSTR, ITR और Section 43B(h) तुरंत टेस्ट कर सकें।',
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
      aria-label="Help Desk, GST Dictionary, Zero-Login Error Support & Reviews"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        zIndex: 9999,
      }}
    >
      {/* Explicit light high-contrast surface so dark-mode never turns text white-on-white */}
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#ffffff',
          color: '#0f172a',
          colorScheme: 'light',
          borderRadius: '14px',
          border: '1px solid #cbd5e1',
          padding: '1.25rem',
          boxShadow: '0 22px 48px rgba(15, 23, 42, 0.35)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.75rem',
            marginBottom: '0.95rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <LifeBuoy size={23} style={{ color: '#2563eb', flexShrink: 0 }} />
            <div>
              <h2 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0f172a' }}>
                Help Desk, GST Dictionary &amp; Support ({appVersion})
              </h2>
              <span style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 500 }}>
                बिना किसी लॉग-इन (Zero-Login) के सीधा सपोर्ट व रिव्यू — कोई बिल, GSTIN या पासवर्ड बाहर नहीं जाता
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {onOpenGuide && (
              <button
                type="button"
                onClick={onOpenGuide}
                style={{
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  border: '1px solid #bfdbfe',
                  borderRadius: '8px',
                  padding: '0.34rem 0.62rem',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Open 35-page User Guide"
              >
                📖 User Guide
              </button>
            )}
            {onOpenShortcuts && (
              <button
                type="button"
                onClick={onOpenShortcuts}
                style={{
                  background: '#f8fafc',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.34rem 0.62rem',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Keyboard Shortcuts (Ctrl+/)"
              >
                ⌨️ Shortcuts
              </button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: '#f1f5f9',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '0.35rem 0.7rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ✕ बंद करें
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[
            { id: 'HELP', label: 'त्वरित समाधान (FAQ)', Icon: HelpCircle },
            { id: 'DICTIONARY', label: 'शब्दकोश (Dictionary)', Icon: BookOpen },
            { id: 'ERROR', label: 'एरर रिपोर्ट करें', Icon: Bug },
            { id: 'REVIEW', label: 'रेटिंग व रिव्यू', Icon: Star },
            { id: 'TOOLS', label: 'Demo Store & PIN', Icon: Wrench },
          ].map((tab) => {
            const TabIcon = tab.Icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setLastSubmitted(null);
                  setActiveTab(tab.id);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.38rem 0.72rem',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: active ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                  background: active ? '#2563eb' : '#f8fafc',
                  color: active ? '#ffffff' : '#1e293b',
                }}
              >
                <TabIcon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Confirmation Banner after Zero-Login Submit */}
        {lastSubmitted && (activeTab === 'ERROR' || activeTab === 'REVIEW') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.55rem',
              padding: '0.7rem 0.85rem',
              marginBottom: '0.9rem',
              borderRadius: '10px',
              background: '#ecfdf5',
              border: '1px solid #86efac',
              color: '#065f46',
              fontSize: '0.8rem',
            }}
          >
            <CheckCircle2 size={18} style={{ color: '#16a34a', flexShrink: 0, marginTop: '1px' }} />
            <div>
              <strong>✅ बिना किसी लॉग-इन के सफलतापूर्वक सबमिट हो गया!</strong>
              <div style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>
                Reference ID: <code>{lastSubmitted.id}</code> · समय:{' '}
                {new Date(lastSubmitted.createdAt).toLocaleTimeString('en-IN')}
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: QUICK SELF-HELP */}
        {activeTab === 'HELP' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {QUICK_TROUBLESHOOT_GUIDES.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '0.8rem',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.87rem', color: '#0f172a', marginBottom: '0.25rem' }}>
                  {idx + 1}. {item.q}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.48 }}>
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: HINGLISH GST & BUSINESS DICTIONARY */}
        {activeTab === 'DICTIONARY' && <HelpDictionaryPanel />}

        {/* TAB 3: ZERO-LOGIN PRIVACY-SAFE ERROR REPORTER */}
        {activeTab === 'ERROR' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 0.8rem',
                borderRadius: '8px',
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1e3a8a',
                fontSize: '0.77rem',
                fontWeight: 600,
              }}
            >
              <ShieldAlert size={16} style={{ flexShrink: 0 }} />
              <span>
                बिना किसी लॉग-इन के सीधे भेजें — रिपोर्ट में कोई इनवॉइस, GSTIN, फ़ोन या पासवर्ड शामिल नहीं होता।
              </span>
            </div>

            <div>
              <label style={LABEL_STYLE}>किस हिस्से में समस्या आ रही है?</label>
              <select
                value={errorArea}
                onChange={(e) => setErrorArea(e.target.value)}
                style={INPUT_STYLE}
              >
                <option>Billing / Invoice PDF</option>
                <option>GSTR-1 / 2B Action Sheet / 3B / 9</option>
                <option>ITR-3/4 / Form 26Q / Sec 43B(h)</option>
                <option>Year-End FY Rollover / CA .bharatca Hub</option>
                <option>5G WebRTC P2P Sync</option>
                <option>Backup / PC Folder Mirror / Restore</option>
                <option>Tally / Vyapar / Excel Import</option>
                <option>B2B WhatsApp Storefront</option>
              </select>
            </div>

            <div>
              <label style={LABEL_STYLE}>क्या एरर दिख रहा है? *</label>
              <textarea
                rows={3}
                placeholder="उदाहरण: GSTR-1 JSON डाउनलोड करते समय पेज अटक रहा है…"
                value={errorDesc}
                onChange={(e) => setErrorDesc(e.target.value)}
                style={INPUT_STYLE}
              />
            </div>

            <div>
              <label style={LABEL_STYLE}>यह एरर कैसे आया? (वैकल्पिक)</label>
              <input
                type="text"
                placeholder="उदाहरण: Credit Note सेव करने के बाद Reports खोलने पर"
                value={stepsToReproduce}
                onChange={(e) => setStepsToReproduce(e.target.value)}
                style={INPUT_STYLE}
              />
            </div>

            {/* Primary = Zero-Login Direct Submit; Secondary = WhatsApp + Copy */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDirectZeroLoginSubmit('ERROR')}
                className="btn btn-primary"
                style={{ fontWeight: 700 }}
              >
                <Rocket size={15} />{' '}
                {submitting ? 'सबमिट हो रहा है…' : '🚀 बिना लॉग-इन सीधे भेजें (Direct Submit)'}
              </button>

              <button
                type="button"
                onClick={() => handleSendWhatsApp(buildSafeDiagnosticText())}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.8rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#0f172a',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Send size={14} /> WhatsApp पर भेजें
              </button>

              <button
                type="button"
                onClick={handleCopyDiagnostic}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.8rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#0f172a',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}{' '}
                {copied ? 'कॉपी हो गया' : 'रिपोर्ट कॉपी करें'}
              </button>
            </div>

            {/* Small optional developer-only link */}
            <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: '0.15rem' }}>
              तकनीकी यूज़र / डेवलपर विकल्प:{' '}
              <button
                type="button"
                onClick={handleOpenGitHubIssue}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#2563eb',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '0.73rem',
                }}
              >
                <ExternalLink size={11} style={{ verticalAlign: 'middle' }} /> Developer / GitHub Issue खोलें (Optional Login)
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: ZERO-LOGIN USER & CA REVIEW SYSTEM */}
        {activeTab === 'REVIEW' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <div>
              <label style={LABEL_STYLE}>आपकी रेटिंग चुनें:</label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setRating(num)}
                    aria-pressed={rating === num}
                    style={{
                      padding: '0.42rem 0.8rem',
                      borderRadius: '8px',
                      border: rating >= num ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                      background: rating >= num ? '#fef3c7' : '#f8fafc',
                      color: '#0f172a',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    ⭐ {num}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={LABEL_STYLE}>आपकी भूमिका (Role):</label>
              <select
                value={reviewerRole}
                onChange={(e) => setReviewerRole(e.target.value)}
                style={INPUT_STYLE}
              >
                <option>Shopkeeper / Business Owner</option>
                <option>Chartered Accountant (CA) / Tax Practitioner</option>
                <option>Accountant / Billing Operator</option>
                <option>Developer / Open-Source Reviewer</option>
              </select>
            </div>

            <div>
              <label style={LABEL_STYLE}>आपका अनुभव या सुझाव:</label>
              <textarea
                rows={3}
                placeholder="कौन-सा फ़ीचर सबसे अच्छा लगा या क्या सुधार होना चाहिए?"
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                style={INPUT_STYLE}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDirectZeroLoginSubmit('REVIEW')}
                className="btn btn-primary"
                style={{ fontWeight: 700 }}
              >
                <Rocket size={15} />{' '}
                {submitting ? 'सबमिट हो रहा है…' : '🚀 बिना लॉग-इन सीधे रिव्यू भेजें (Direct Submit)'}
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSendWhatsApp(
                    `Bharat GST (${appVersion}) Review: ${rating}/5 ⭐ (${reviewerRole}) — ${sanitizeOperationText(
                      reviewText
                    )}`
                  )
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.45rem 0.8rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#0f172a',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Send size={14} /> WhatsApp पर रिव्यू भेजें
              </button>
            </div>

            <div style={{ fontSize: '0.73rem', color: '#64748b' }}>
              वैकल्पिक:{' '}
              <button
                type="button"
                onClick={handleSubmitReviewGitHub}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  color: '#2563eb',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '0.73rem',
                }}
              >
                <ExternalLink size={11} style={{ verticalAlign: 'middle' }} /> Developer / GitHub पर भी साझा करें (Optional)
              </button>
            </div>

            {historyList.length > 0 && (
              <div
                style={{
                  marginTop: '0.35rem',
                  padding: '0.65rem 0.8rem',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.75rem',
                  color: '#334155',
                }}
              >
                <strong>हाल में दर्ज सबमिशन ({historyList.length}):</strong>{' '}
                {historyList.slice(0, 3).map((h) => `${h.type} (${h.id})`).join(' · ')}
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SHOPKEEPER ESSENTIALS (DEMO STORE + SALTED STAFF PIN + WEBHOOK BRIDGE) */}
        {activeTab === 'TOOLS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div
              style={{
                padding: '0.85rem',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                <Sparkles size={16} style={{ color: '#2563eb' }} />
                <span>1-Click Sample / Sandbox Store (नए यूज़र व CA टेस्टिंग के लिए)</span>
              </div>
              <p style={{ margin: '0.35rem 0 0.65rem', fontSize: '0.79rem', color: '#334155' }}>
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
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
                  {staffLocked ? <Lock size={16} style={{ color: '#d97706' }} /> : <Unlock size={16} style={{ color: '#16a34a' }} />}
                  <span>Staff / Operator PIN Guard</span>
                </div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '999px',
                    background: !pinConfigured ? '#e2e8f0' : staffLocked ? '#fef3c7' : '#dcfce7',
                    color: !pinConfigured ? '#334155' : staffLocked ? '#92400e' : '#166534',
                  }}
                >
                  {!pinConfigured ? 'PIN Not Set' : staffLocked ? 'Staff Mode (Restricted)' : 'Admin Unlocked'}
                </span>
              </div>
              <p style={{ margin: '0.35rem 0 0.6rem', fontSize: '0.79rem', color: '#334155' }}>
                4–6 अंकों का Admin PIN लगाने पर ऑपरेटर बिल बना सकता है, लेकिन सेटिंग्स खोलने के लिए Admin PIN मांगा जाएगा (Salted Hash + 5-प्रयास सुरक्षा)।
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
                  style={{ ...INPUT_STYLE, width: '150px' }}
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

            {/* Optional Zero-Login Email / Google Form Webhook Setup */}
            <div
              style={{
                padding: '0.85rem',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#0f172a', marginBottom: '0.25rem' }}>
                📬 Zero-Login Support Bridge (वैकल्पिक ईमेल / Google Sheet / WhatsApp सेटअप)
              </div>
              <p style={{ margin: '0 0 0.55rem', fontSize: '0.76rem', color: '#475569' }}>
                यदि आप चाहते हैं कि Direct Submit किए गए रिव्यू सीधे आपके ईमेल या Google Sheet पर भी आएँ, तो अपनी मुफ़्त Web3Forms Access Key या Google Form URL यहाँ सेव कर सकते हैं:
              </p>
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                <input
                  type="text"
                  value={bridgeCfg.web3FormsKey}
                  onChange={(e) => setBridgeCfg((p) => ({ ...p, web3FormsKey: e.target.value }))}
                  placeholder="Optional Web3Forms Access Key (api.web3forms.com)"
                  style={INPUT_STYLE}
                />
                <input
                  type="url"
                  value={bridgeCfg.googleFormUrl}
                  onChange={(e) => setBridgeCfg((p) => ({ ...p, googleFormUrl: e.target.value }))}
                  placeholder="Optional Google Form formResponse URL"
                  style={INPUT_STYLE}
                />
                <div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const saved = saveFeedbackBridgeConfig(bridgeCfg);
                      setBridgeCfg(saved);
                      toast('Zero-Login Support Bridge कॉन्फ़िगरेशन सेव हो गया!', 'success');
                    }}
                  >
                    ब्रिज सेटिंग सेव करें
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
