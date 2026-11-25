// Serverless Zero-Login Feedback & Sanitized Error Diagnostic Bridge (v5.3.0)
// Eliminates mandatory GitHub login for shopkeepers & CAs:
// 1. Strictly redacts GSTIN, PAN, Phone, PIN, and Password/Keys before storing or sending.
// 2. Persists immediately in local history (`bharatgst_submitted_feedback`) so offline reports never vanish.
// 3. Delivers silently without any user login via:
//    - Option A: Web3Forms JSON POST (`https://api.web3forms.com/submit`) -> Maintainer Email
//    - Option B: Google Form `no-cors` POST -> Maintainer Google Sheet
//    - Option C: Same-origin `/api/feedback` -> Local Desktop / LAN Server Inbox (`data/feedback-inbox.json`)
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import { sanitizeOperationText } from './operationRegistry.js';

const FEEDBACK_HISTORY_KEY = 'bharatgst_submitted_feedback';
const BRIDGE_CONFIG_KEY = 'bharatgst_feedback_bridge_config';
const MAX_LOCAL_HISTORY = 30;

// Default constants (can be overridden via environment variables or UI Bridge Config in localStorage)
const DEFAULT_WEB3FORMS_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WEB3FORMS_ACCESS_KEY) || '';
const DEFAULT_GOOGLE_FORM_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_FORM_ACTION_URL) || '';

function resolveStorage(customStorage = null) {
  if (customStorage) return customStorage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* ignore */ }
  return null;
}

export function getFeedbackBridgeConfig(customStorage = null) {
  const store = resolveStorage(customStorage);
  let saved = {};
  if (store) {
    try {
      saved = JSON.parse(store.getItem(BRIDGE_CONFIG_KEY) || '{}') || {};
    } catch {
      saved = {};
    }
  }
  return {
    web3FormsKey: String(saved.web3FormsKey ?? DEFAULT_WEB3FORMS_KEY ?? '').trim(),
    googleFormUrl: String(saved.googleFormUrl ?? DEFAULT_GOOGLE_FORM_URL ?? '').trim(),
    googleEntryType: String(saved.googleEntryType || 'entry.111111').trim(),
    googleEntryMeta: String(saved.googleEntryMeta || 'entry.222222').trim(),
    googleEntryBody: String(saved.googleEntryBody || 'entry.333333').trim(),
    supportWhatsApp: String(saved.supportWhatsApp || '').replace(/[^0-9]/g, ''),
  };
}

export function saveFeedbackBridgeConfig(patch = {}, customStorage = null) {
  const store = resolveStorage(customStorage);
  const current = getFeedbackBridgeConfig(store);
  const next = {
    ...current,
    ...patch,
    web3FormsKey: String(patch.web3FormsKey ?? current.web3FormsKey).trim(),
    googleFormUrl: String(patch.googleFormUrl ?? current.googleFormUrl).trim(),
    supportWhatsApp: String(patch.supportWhatsApp ?? current.supportWhatsApp).replace(/[^0-9]/g, ''),
  };
  if (store) {
    try {
      store.setItem(BRIDGE_CONFIG_KEY, JSON.stringify(next));
    } catch { /* ignore quota */ }
  }
  return next;
}

export function getSubmittedFeedbackHistory(customStorage = null) {
  const store = resolveStorage(customStorage);
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(FEEDBACK_HISTORY_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Submits a Review or Sanitized Error Report directly inside the app with ZERO GitHub/Google login.
 */
export async function submitFeedbackWithoutLogin({
  type = 'REVIEW', // 'ERROR' | 'REVIEW'
  appVersion = 'v5.3.0',
  rating = 5,
  roleOrModule = '',
  message = '',
  stepsToReproduce = '',
  sanitizedDiagnostics = '',
  storage = null,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
} = {}) {
  const cleanType = type === 'ERROR' ? 'ERROR' : 'REVIEW';
  const safeRating = Math.min(5, Math.max(1, Number(rating) || 5));
  const safeRoleOrModule = sanitizeOperationText(String(roleOrModule || 'General').trim());
  const safeMessage = sanitizeOperationText(String(message || '').trim());
  const safeSteps = sanitizeOperationText(String(stepsToReproduce || '').trim());
  const safeDiag = sanitizeOperationText(String(sanitizedDiagnostics || '').trim());

  if (!safeMessage && cleanType === 'ERROR') {
    throw new Error('कृपया समस्या का संक्षिप्त विवरण लिखें ताकि हम उसे तुरंत ठीक कर सकें।');
  }

  const store = resolveStorage(storage);
  const cfg = getFeedbackBridgeConfig(store);

  const entry = {
    id: `FB-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    type: cleanType,
    appVersion: String(appVersion || 'v5.3.0'),
    rating: cleanType === 'REVIEW' ? safeRating : null,
    roleOrModule: safeRoleOrModule,
    message: safeMessage || (cleanType === 'REVIEW' ? `${safeRating}/5 Star Rating` : ''),
    stepsToReproduce: safeSteps,
    sanitizedDiagnostics: safeDiag,
    deliveryChannel: 'local-queued',
    createdAt: new Date().toISOString(),
  };

  // 1. Always save locally first so offline shopkeepers never lose their submission
  const prevHistory = getSubmittedFeedbackHistory(store);
  const persistEntry = (updatedEntry) => {
    if (!store) return;
    try {
      const nextList = [updatedEntry, ...prevHistory.filter((x) => x.id !== updatedEntry.id)].slice(
        0,
        MAX_LOCAL_HISTORY
      );
      store.setItem(FEEDBACK_HISTORY_KEY, JSON.stringify(nextList));
    } catch { /* ignore quota */ }
  };
  persistEntry(entry);

  let sentOnline = false;
  let sentChannel = 'local-saved';

  // 2. Option A: Silent Web3Forms POST (Direct Email delivery without user login)
  if (
    fetchImpl &&
    cfg.web3FormsKey &&
    cfg.web3FormsKey !== 'YOUR_FREE_WEB3FORMS_KEY'
  ) {
    try {
      const res = await fetchImpl('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: cfg.web3FormsKey,
          subject: `[Bharat GST ${cleanType} ${entry.appVersion}] ${safeRoleOrModule}${
            cleanType === 'REVIEW' ? ` (${safeRating}/5 ⭐)` : ''
          }`,
          from_name: 'Bharat GST Zero-Login HelpDesk',
          message: [
            entry.message,
            safeSteps ? `Steps: ${safeSteps}` : '',
            safeDiag ? `---\n${safeDiag}` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        sentOnline = true;
        sentChannel = 'web3forms-email';
      }
    } catch { /* fall through to Google Form / local server */ }
  }

  // 3. Option B: Silent Google Form `no-cors` POST (Direct Google Sheet row without login)
  if (!sentOnline && fetchImpl && cfg.googleFormUrl && /^https:\/\/docs\.google\.com\/forms\//i.test(cfg.googleFormUrl)) {
    try {
      const formData = new FormData();
      formData.append(cfg.googleEntryType, cleanType);
      formData.append(
        cfg.googleEntryMeta,
        cleanType === 'REVIEW' ? `${safeRoleOrModule} (${safeRating}/5)` : safeRoleOrModule
      );
      formData.append(
        cfg.googleEntryBody,
        [entry.message, safeSteps ? `Steps: ${safeSteps}` : '', safeDiag].filter(Boolean).join('\n')
      );
      await fetchImpl(cfg.googleFormUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: formData,
      });
      sentOnline = true;
      sentChannel = 'google-form-sheet';
    } catch { /* fall through to same-origin /api/feedback */ }
  }

  // 4. Option C: Same-Origin `/api/feedback` (works out-of-the-box on Desktop / LAN / Node Server!)
  if (!sentOnline && fetchImpl && typeof window !== 'undefined') {
    try {
      const res = await fetchImpl('./api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          type: cleanType,
          version: entry.appVersion,
          rating: entry.rating,
          roleOrModule: safeRoleOrModule,
          message: entry.message,
          steps: safeSteps,
          diagnostics: safeDiag,
        }),
      });
      if (res && res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.ok) {
          sentOnline = true;
          sentChannel = 'server-inbox';
        }
      }
    } catch { /* static GitHub Pages mode — kept safely in local inbox */ }
  }

  const finalEntry = { ...entry, deliveryChannel: sentChannel };
  persistEntry(finalEntry);

  return {
    ok: true,
    sentOnline,
    channel: sentChannel,
    entry: finalEntry,
  };
}
