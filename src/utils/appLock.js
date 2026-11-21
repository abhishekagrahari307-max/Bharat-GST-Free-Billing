// Shared constants & helpers for Option A Local Vault Lock, PIN/Passkey screen,
// Auto-Lock inactivity timer, and L2 Staff Role session state.
export const UNLOCKED_KEY = 'gst_unlocked';
export const ACTIVE_USER_KEY = 'gst_active_staff_user';
export const PASSKEY_CRED_KEY = 'fgsb_passkey_cred_v1';
export const LOCK_EVENT = 'freegstbill-lock';
export const LOCK_CHANGED_EVENT = 'freegstbill-lock-changed';
export const STAFF_USER_EVENT = 'fgsb:staff-user-changed';

export function getActiveStaffUser() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(ACTIVE_USER_KEY) || 'null');
    if (raw && typeof raw === 'object' && raw.id) return raw;
  } catch { /* ignore */ }
  return null;
}

export function setActiveStaffUser(user) {
  try {
    if (!user) sessionStorage.removeItem(ACTIVE_USER_KEY);
    else sessionStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('fgsb:staff-user-changed', { detail: user || null }));
}

// Lock the session immediately (clears browser unlock flag + notifies server/browserApi).
export const lockNow = () => {
  try {
    sessionStorage.removeItem(UNLOCKED_KEY);
    sessionStorage.removeItem(ACTIVE_USER_KEY);
  } catch { /* storage blocked */ }
  fetch('/api/lock/lock-session', { method: 'POST' }).catch(() => {});
  window.dispatchEvent(new Event(LOCK_EVENT));
};

export const lockSettingsChanged = () => window.dispatchEvent(new Event(LOCK_CHANGED_EVENT));
