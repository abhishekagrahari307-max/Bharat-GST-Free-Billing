// Complete Backup & Auto-Backup Manager (Task 5)
// Tracks Last Backup Date & Time, Days Since Backup, Scheduled Auto-Backup
// (1 / 3 / 7 / 15 / 30 days + every N bills), Retention Rotation, Google Drive
// Auto-Backup & Restore, PC/Laptop Folder Auto-Sync (File System Access API),
// Encrypted `.fgsb` Archives, and CGST Sec. 36 (72-Month) Retention Dates.

import { encryptBackupArchive, decryptBackupArchive, isEncryptedBackupPayload } from './localLock.js';

export const BACKUP_SETTINGS_KEY = 'fgsb_backupSettings_v1';
export const BACKUP_META_KEY = 'fgsb_backupMeta_v1';
export const BACKUP_EVENT = 'fgsb:backup-updated';

const FS_DB_NAME = 'bharat_gst_fs_handles';
const FS_STORE = 'handles';
const FS_DIR_KEY = 'backup_dir';

export const DEFAULT_BACKUP_SETTINGS = {
  autoBackupEnabled: true,
  intervalDays: 1,          // 1 (Daily), 3, 7 (Weekly), 15, 30 (Monthly)
  remindAfterDays: 3,       // Warn in Notification Center & banner after N days without backup
  keepLastCount: 30,        // Rolling local snapshot retention count
  backupEveryNBills: 5,     // Also snapshot automatically every N saved invoices (0 = off)
  autoSyncGoogleDrive: false,
  autoSyncLocalFolder: false,
  encryptAutoDrive: false,
};

export const AUTO_INTERVAL_OPTIONS = [
  { value: 1, label: 'Daily (Every 1 day)' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Weekly (Every 7 days)' },
  { value: 15, label: 'Every 15 days' },
  { value: 30, label: 'Monthly (Every 30 days)' },
];

export const REMINDER_DAY_OPTIONS = [
  { value: 1, label: 'After 1 day' },
  { value: 3, label: 'After 3 days' },
  { value: 7, label: 'After 7 days' },
  { value: 14, label: 'After 14 days' },
  { value: 30, label: 'After 30 days' },
];

export const RETENTION_COUNT_OPTIONS = [
  { value: 7, label: 'Keep last 7 backups' },
  { value: 15, label: 'Keep last 15 backups' },
  { value: 30, label: 'Keep last 30 backups' },
  { value: 60, label: 'Keep last 60 backups' },
  { value: 90, label: 'Keep last 90 backups' },
];

export function readBackupSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(BACKUP_SETTINGS_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        ...DEFAULT_BACKUP_SETTINGS,
        ...raw,
        intervalDays: Math.max(1, Number(raw.intervalDays) || DEFAULT_BACKUP_SETTINGS.intervalDays),
        remindAfterDays: Math.max(1, Number(raw.remindAfterDays) || DEFAULT_BACKUP_SETTINGS.remindAfterDays),
        keepLastCount: Math.max(3, Number(raw.keepLastCount) || DEFAULT_BACKUP_SETTINGS.keepLastCount),
        backupEveryNBills: Math.max(0, Number(raw.backupEveryNBills ?? DEFAULT_BACKUP_SETTINGS.backupEveryNBills)),
      };
    }
  } catch { /* storage unavailable */ }
  return { ...DEFAULT_BACKUP_SETTINGS };
}

export function saveBackupSettings(patch) {
  const next = { ...readBackupSettings(), ...(patch || {}) };
  try {
    localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(BACKUP_EVENT, { detail: next }));
  } catch { /* storage unavailable */ }
  return next;
}

export function readBackupMeta() {
  const base = {
    lastBackupAt: null,
    lastBackupKind: '',
    lastGoogleDriveAt: null,
    lastLocalFolderAt: null,
    localFolderName: '',
    billsSinceLastBackup: 0,
    history: [],
  };
  try {
    const raw = JSON.parse(localStorage.getItem(BACKUP_META_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      return {
        ...base,
        ...raw,
        history: Array.isArray(raw.history) ? raw.history.slice(0, 40) : [],
      };
    }
  } catch { /* storage unavailable */ }
  return base;
}

export function recordBackupCompleted({
  kind = 'manual-json',
  destination = 'Device Download',
  billCount = 0,
  clientCount = 0,
  encrypted = false,
  fileName = '',
  at = new Date().toISOString(),
} = {}) {
  const prev = readBackupMeta();
  const entry = {
    id: `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    at,
    kind,
    destination,
    billCount,
    clientCount,
    encrypted: !!encrypted,
    fileName,
  };
  const next = {
    ...prev,
    lastBackupAt: at,
    lastBackupKind: kind,
    ...(kind.includes('drive') ? { lastGoogleDriveAt: at } : {}),
    ...(kind.includes('folder') ? { lastLocalFolderAt: at } : {}),
    billsSinceLastBackup: 0,
    history: [entry, ...(prev.history || [])].slice(0, 40),
  };
  try {
    localStorage.setItem(BACKUP_META_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BACKUP_EVENT, { detail: next }));
      window.dispatchEvent(new CustomEvent('fgsb:system-notif', {
        detail: {
          id: entry.id,
          title: `Backup saved (${destination})`,
          body: `${billCount} invoice${billCount === 1 ? '' : 's'} backed up${encrypted ? ' (AES-256 Encrypted)' : ''}`,
          at,
          tone: 'success',
        },
      }));
    }
  } catch { /* ignore */ }
  return next;
}

export function incrementBillsSinceBackup() {
  const prev = readBackupMeta();
  const next = { ...prev, billsSinceLastBackup: (Number(prev.billsSinceLastBackup) || 0) + 1 };
  try { localStorage.setItem(BACKUP_META_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

/**
 * Pure calculation of backup freshness, days elapsed, next scheduled date & warning state.
 */
export function computeBackupHealth(meta = {}, settings = DEFAULT_BACKUP_SETTINGS, { billCount = 0, serverBackups = [], now = new Date() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  // Take whichever backup is newest: explicit meta.lastBackupAt OR newest server/IndexedDB daily snapshot
  let latestIso = meta?.lastBackupAt || null;
  if (Array.isArray(serverBackups) && serverBackups.length > 0) {
    const newestSnap = serverBackups[0]?.createdAt || serverBackups[0]?.date || null;
    if (newestSnap) {
      const snapMs = new Date(newestSnap).getTime();
      const curMs = latestIso ? new Date(latestIso).getTime() : 0;
      if (Number.isFinite(snapMs) && snapMs > curMs) latestIso = newestSnap;
    }
  }

  if (!latestIso || Number.isNaN(new Date(latestIso).getTime())) {
    const needsFirstBackup = billCount > 0;
    return {
      hasBackup: false,
      lastBackupAt: null,
      lastBackupFormatted: 'Never backed up',
      daysSinceBackup: null,
      nextAutoBackupDate: settings?.autoBackupEnabled ? new Date(nowMs).toISOString().slice(0, 10) : null,
      daysUntilNextAuto: 0,
      isAutoDue: !!settings?.autoBackupEnabled && billCount > 0,
      isReminderDue: needsFirstBackup,
      tone: needsFirstBackup ? 'warn' : 'good',
      badgeText: needsFirstBackup ? 'No backup yet — Backup recommended' : 'Ready (0 invoices)',
    };
  }

  const lastDate = new Date(latestIso);
  const diffMs = Math.max(0, nowMs - lastDate.getTime());
  const daysSinceBackup = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  const intervalDays = Math.max(1, Number(settings?.intervalDays) || 1);
  const remindAfterDays = Math.max(1, Number(settings?.remindAfterDays) || 3);

  const nextMs = lastDate.getTime() + intervalDays * 24 * 60 * 60 * 1000;
  const nextAutoBackupDate = new Date(nextMs).toISOString().slice(0, 10);
  const daysUntilNextAuto = Math.max(0, Math.ceil((nextMs - nowMs) / (24 * 60 * 60 * 1000)));

  const dueByDays = daysSinceBackup >= intervalDays;
  const dueByBills = Number(settings?.backupEveryNBills) > 0
    && (Number(meta?.billsSinceLastBackup) || 0) >= Number(settings.backupEveryNBills);
  const isAutoDue = !!settings?.autoBackupEnabled && (dueByDays || dueByBills);
  const isReminderDue = daysSinceBackup >= remindAfterDays;

  let tone = 'good';
  if (daysSinceBackup >= remindAfterDays * 2 || daysSinceBackup >= 10) tone = 'danger';
  else if (isReminderDue) tone = 'warn';

  const formatted = lastDate.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const badgeText = daysSinceBackup === 0
    ? `Backed up today (${formatted})`
    : `Last backup: ${daysSinceBackup} day${daysSinceBackup === 1 ? '' : 's'} ago (${formatted})`;

  return {
    hasBackup: true,
    lastBackupAt: latestIso,
    lastBackupFormatted: formatted,
    daysSinceBackup,
    nextAutoBackupDate,
    daysUntilNextAuto,
    isAutoDue,
    isReminderDue,
    isOverdue: isReminderDue,
    tone,
    badgeText,
  };
}

/**
 * CGST Act Section 36 — GST invoices & books must be retained for 72 months (6 years)
 * from the due date of furnishing the Annual Return (31 Dec following the FY).
 * Example: Invoice dated 2026-11-21 -> FY 2026-27 -> Annual Return due 31 Dec 2027
 * -> Legal retention until 31 Dec 2033.
 */
export function computeGstRetentionInfo(bills = []) {
  const validDates = (Array.isArray(bills) ? bills : [])
    .map((b) => String(b?.invoiceDate || b?.data?.details?.invoiceDate || b?.createdAt || '').slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  const fyEndYearOf = (isoDate) => {
    const [y, m] = isoDate.split('-').map(Number);
    return m >= 4 ? y + 1 : y;
  };

  if (!validDates.length) {
    const now = new Date();
    const curEndYear = now.getMonth() + 1 >= 4 ? now.getFullYear() + 1 : now.getFullYear();
    return {
      billCount: 0,
      earliestFy: `${curEndYear - 1}-${String(curEndYear).slice(2)}`,
      latestFy: `${curEndYear - 1}-${String(curEndYear).slice(2)}`,
      retainUntilDate: `31 Dec ${curEndYear + 6}`,
      retainMonths: 72,
    };
  }

  const firstEnd = fyEndYearOf(validDates[0]);
  const lastEnd = fyEndYearOf(validDates[validDates.length - 1]);
  return {
    billCount: validDates.length,
    earliestFy: `${firstEnd - 1}-${String(firstEnd).slice(2)}`,
    latestFy: `${lastEnd - 1}-${String(lastEnd).slice(2)}`,
    earliestRetainUntil: `31 Dec ${firstEnd + 6}`,
    retainUntilDate: `31 Dec ${lastEnd + 6}`,
    retainMonths: 72,
  };
}

/**
 * Parse and verify any backup text (`.json` or encrypted `.fgsb`), returning counts & metadata.
 */
export async function parseAndVerifyBackupText(rawText, passphrase = '') {
  const isEnc = isEncryptedBackupPayload(rawText);
  let data;
  if (isEnc) {
    if (!passphrase) {
      const err = new Error('This backup is encrypted (.fgsb). Enter its password/PIN to unlock.');
      err.code = 'password-required';
      throw err;
    }
    data = await decryptBackupArchive(rawText, passphrase);
  } else {
    data = JSON.parse(rawText);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Backup file does not contain valid JSON records.');
  }
  return {
    encrypted: isEnc,
    data,
    exportedAt: data.exportedAt || null,
    summary: {
      bills: Array.isArray(data.bills) ? data.bills.length : 0,
      clients: Array.isArray(data.clients) ? data.clients.length : 0,
      products: Array.isArray(data.products) ? data.products.length : 0,
      purchases: Array.isArray(data.purchases) ? data.purchases.length : 0,
      expenses: Array.isArray(data.expenses) ? data.expenses.length : 0,
      receipts: Array.isArray(data.receipts) ? data.receipts.length : 0,
      hasProfile: !!(data.profile && Object.keys(data.profile).length),
    },
  };
}

/**
 * Build serialized backup file content (plain `.json` or encrypted `.fgsb`).
 */
export async function serializeBackupPayload(payload, { encrypt = false, passphrase = '' } = {}) {
  const datePart = new Date().toISOString().slice(0, 10);
  if (encrypt) {
    const content = await encryptBackupArchive(payload, passphrase);
    return {
      fileName: `BharatGST-Backup-${datePart}.fgsb`,
      mimeType: 'application/octet-stream',
      content,
      encrypted: true,
    };
  }
  return {
    fileName: `BharatGST-Backup-${datePart}.json`,
    mimeType: 'application/json',
    content: JSON.stringify(payload, null, 2),
    encrypted: false,
  };
}

// ---- Browser File System Access API (Direct PC/Laptop Folder Auto-Backup) ----
function openFsDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(FS_DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(FS_STORE)) req.result.createObjectStore(FS_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export function supportsBrowserFolderBackup() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickBrowserBackupDirectory() {
  if (!supportsBrowserFolderBackup()) {
    throw new Error('Direct folder selection requires Chrome or Edge on Computer/Laptop.');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const db = await openFsDb();
  if (db) {
    await new Promise((resolve) => {
      const tx = db.transaction(FS_STORE, 'readwrite');
      tx.objectStore(FS_STORE).put(handle, FS_DIR_KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }
  const prev = readBackupMeta();
  const next = { ...prev, localFolderName: handle.name || 'Selected Folder' };
  try { localStorage.setItem(BACKUP_META_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return handle;
}

export async function getSavedBrowserBackupDirectory() {
  const db = await openFsDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(FS_STORE, 'readonly');
      const req = tx.objectStore(FS_STORE).get(FS_DIR_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function writeBackupToBrowserDirectory(fileName, content, { interactive = false } = {}) {
  const handle = await getSavedBrowserBackupDirectory();
  if (!handle) throw new Error('No local backup folder chosen yet');
  if (handle.queryPermission) {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && interactive && handle.requestPermission) {
      perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    if (perm !== 'granted') throw new Error('Folder write permission needs re-approval');
  }
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return handle.name || 'Local Folder';
}
