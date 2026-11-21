// Complete Notification System Engine (Task 4)
// Combines live business attention alerts (Overdue Invoices, Due Soon, Low/Out of Stock,
// GST Filing Deadlines, Recurring Invoices, Backup Overdue Alerts) with a persistent
// System/Backup Activity Feed, Category Filtering, Per-Item Read/Snooze, Desktop/Mobile
// OS Push Notifications (`Notification` API), and optional soft alert chime.

import { trackedStock } from '../utils.js';

export const NOTIF_PREFS_KEY = 'fgsb_notifPrefs_v1';
export const NOTIF_FEED_KEY = 'fgsb_notifFeed_v1';
export const NOTIF_SNOOZE_KEY = 'fgsb_notifSnooze_v1';
export const NOTIF_EVENT = 'fgsb:notif-updated';

export const DEFAULT_NOTIF_PREFS = {
  browserPushEnabled: false,
  soundEnabled: false,
  overdueEnabled: true,
  dueSoonEnabled: true,
  lowStockEnabled: true,
  gstFilingEnabled: true,
  recurringEnabled: true,
  backupReminderEnabled: true,
};

export function readNotifPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || 'null');
    if (raw && typeof raw === 'object') return { ...DEFAULT_NOTIF_PREFS, ...raw };
  } catch { /* ignore */ }
  return { ...DEFAULT_NOTIF_PREFS };
}

export function saveNotifPrefs(patch) {
  const next = { ...readNotifPrefs(), ...(patch || {}) };
  try {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(next));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fgsb:notif-prefs-changed', { detail: next }));
      window.dispatchEvent(new CustomEvent(NOTIF_EVENT, { detail: next }));
    }
  } catch { /* ignore */ }
  return next;
}

export function readSystemNotifFeed() {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIF_FEED_KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function pushSystemNotif({ title, body = '', tone = 'info', category = 'system', actionView = '', at = new Date().toISOString() }) {
  if (!title) return null;
  const item = {
    id: `sys_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: String(title),
    body: String(body || ''),
    tone,
    category,
    actionView,
    at,
    read: false,
  };
  const feed = [item, ...readSystemNotifFeed()].slice(0, 50);
  try {
    localStorage.setItem(NOTIF_FEED_KEY, JSON.stringify(feed));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fgsb:notif-feed-updated', { detail: feed }));
      window.dispatchEvent(new CustomEvent(NOTIF_EVENT, { detail: feed }));
    }
  } catch { /* ignore */ }
  maybeFireOsNotification(item.title, item.body);
  return item;
}

export function markFeedItemRead(id) {
  const feed = readSystemNotifFeed().map((n) => (n.id === id ? { ...n, read: true } : n));
  try { localStorage.setItem(NOTIF_FEED_KEY, JSON.stringify(feed)); } catch { /* ignore */ }
  return feed;
}

export function markAllFeedItemsRead() {
  const feed = readSystemNotifFeed().map((n) => ({ ...n, read: true }));
  try { localStorage.setItem(NOTIF_FEED_KEY, JSON.stringify(feed)); } catch { /* ignore */ }
  return feed;
}

export function clearSystemNotifFeed() {
  try { localStorage.setItem(NOTIF_FEED_KEY, '[]'); } catch { /* ignore */ }
  return [];
}

export function readSnoozedMap() {
  try {
    return JSON.parse(localStorage.getItem(NOTIF_SNOOZE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function snoozeNotifSection(sectionKey, hours = 24) {
  const map = readSnoozedMap();
  map[sectionKey] = Date.now() + hours * 3600 * 1000;
  try {
    localStorage.setItem(NOTIF_SNOOZE_KEY, JSON.stringify(map));
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NOTIF_EVENT, { detail: map }));
  } catch { /* ignore */ }
  return map;
}

export function isSectionSnoozed(sectionKey, snoozeMap = {}, nowMs = Date.now()) {
  const until = Number(snoozeMap?.[sectionKey] || 0);
  return until > nowMs;
}

/**
 * Build unified, categorized notification cards from live app data + backup health + system feed.
 */
export function buildUnifiedNotifications({
  notifications,
  attention,
  backupHealth = null,
  prefs = DEFAULT_NOTIF_PREFS,
  dismissed = {},
  signatures: customSignatures = null,
  snoozed = {},
  feed = [],
  nowMs = Date.now(),
} = {}) {
  const src = notifications || attention || {};
  const computedSigs = {
    overdue: (src.overdue || []).map((b) => b.invoiceNumber || b.id).sort().join('|'),
    dueSoon: (src.dueSoon || []).map((b) => b.invoiceNumber || b.id).sort().join('|'),
    lowStock: (src.lowStock || []).map((p) => `${p.id || p.name}:${p.stock ?? ''}`).sort().join('|'),
    filings: (src.filings || []).map((f) => f.label || f.id || String(f)).sort().join('|'),
    autoFire: src.autoFire?.count > 0 ? `autofire:${src.autoFire.count}` : '',
    recurringDue: (src.recurringDue || []).map((t) => `${t.id}:${t.nextDate}`).sort().join('|'),
    backupDue: backupHealth?.isReminderDue
      ? (!backupHealth.hasBackup ? 'backup:never' : `backup:${backupHealth.daysSinceBackup}`)
      : '',
  };
  const signatures = customSignatures ? { ...computedSigs, ...customSignatures } : computedSigs;
  const notificationsObj = src;
  const cards = [];

  const isSectionActive = (key, enabledFlag = true) => {
    if (!enabledFlag) return false;
    if (isSectionSnoozed(key, snoozed, nowMs)) return false;
    const sig = signatures[key];
    if (!sig) return false;
    return dismissed[key] !== sig;
  };

  // 1. Overdue Invoices (Payments)
  if (isSectionActive('overdue', prefs.overdueEnabled) && notificationsObj.overdue?.length) {
    const list = notificationsObj.overdue;
    cards.push({
      key: 'overdue',
      category: 'payments',
      priority: 1,
      tone: 'danger',
      icon: '⚠️',
      count: list.length,
      title: `${list.length} overdue invoice${list.length === 1 ? '' : 's'} pending payment`,
      subtitle: list.slice(0, 3).map((b) => `${b.invoiceNumber || 'Invoice'}${b.clientName ? ` (${b.clientName})` : ''}`).join(' · ')
        + (list.length > 3 ? ` · +${list.length - 3} more` : ''),
      actionLabel: 'View Invoices',
      targetView: 'dashboard',
    });
  }

  // 2. Backup Reminder / Overdue (Backups & Security)
  if (isSectionActive('backupDue', prefs.backupReminderEnabled) && backupHealth?.isReminderDue) {
    const never = !backupHealth.hasBackup;
    cards.push({
      key: 'backupDue',
      category: 'backups',
      priority: 2,
      tone: backupHealth.tone === 'danger' ? 'danger' : 'warn',
      icon: '🛡️',
      count: 1,
      title: never
        ? 'No data backup taken yet — protect your GST bills'
        : `Data backup overdue (${backupHealth.daysSinceBackup} day${backupHealth.daysSinceBackup === 1 ? '' : 's'} since last backup)`,
      subtitle: never
        ? 'Save a local, Google Drive, or encrypted .fgsb backup in 1 click.'
        : `Last backup: ${backupHealth.lastBackupFormatted}. Take a fresh backup or verify Auto-Backup.`,
      actionLabel: 'Open Backup Center',
      targetView: 'settings',
      settingsSection: 'section-data',
    });
  }

  // 3. Invoices Due Soon (Payments)
  if (isSectionActive('dueSoon', prefs.dueSoonEnabled) && notificationsObj.dueSoon?.length) {
    const list = notificationsObj.dueSoon;
    cards.push({
      key: 'dueSoon',
      category: 'payments',
      priority: 3,
      tone: 'warn',
      icon: '⏰',
      count: list.length,
      title: `${list.length} invoice${list.length === 1 ? '' : 's'} due within 3 days`,
      subtitle: list.slice(0, 3).map((b) => `${b.invoiceNumber} (${b.clientName || 'Client'})`).join(' · '),
      actionLabel: 'Review Due Bills',
      targetView: 'dashboard',
    });
  }

  // 4. Recurring Invoices Due / Auto-Generated
  if (isSectionActive('recurringDue', prefs.recurringEnabled) && notificationsObj.recurringDue?.length) {
    const list = notificationsObj.recurringDue;
    cards.push({
      key: 'recurringDue',
      category: 'payments',
      priority: 4,
      tone: 'warn',
      icon: '🔁',
      count: list.length,
      title: `${list.length} recurring invoice${list.length === 1 ? '' : 's'} ready to generate`,
      subtitle: list.slice(0, 3).map((t) => t.clientName || 'Template').join(' · '),
      actionLabel: 'Open Recurring',
      targetView: 'recurring',
    });
  }

  if (isSectionActive('autoFire', prefs.recurringEnabled) && notificationsObj.autoFire?.count > 0) {
    cards.push({
      key: 'autoFire',
      category: 'payments',
      priority: 5,
      tone: 'info',
      icon: '✨',
      count: notificationsObj.autoFire.count,
      title: `${notificationsObj.autoFire.count} recurring invoice${notificationsObj.autoFire.count === 1 ? '' : 's'} auto-generated today`,
      subtitle: 'Review and share PDFs from the Dashboard.',
      actionLabel: 'View Dashboard',
      targetView: 'dashboard',
    });
  }

  // 5. GST Filing Deadlines (Stock & GST)
  if (isSectionActive('filings', prefs.gstFilingEnabled) && notificationsObj.filings?.length) {
    const list = notificationsObj.filings;
    cards.push({
      key: 'filings',
      category: 'gst_stock',
      priority: 6,
      tone: 'info',
      icon: '📋',
      count: list.length,
      title: `${list.length} GST return deadline${list.length === 1 ? '' : 's'} in next 10 days`,
      subtitle: list.slice(0, 3).map((f) => `${f.label} (${f.daysAway === 0 ? 'Due Today!' : `in ${f.daysAway}d`})`).join(' · '),
      actionLabel: 'Open GST Returns',
      targetView: 'filing',
    });
  }

  // 6. Low / Out of Stock (Stock & GST)
  if (isSectionActive('lowStock', prefs.lowStockEnabled) && notificationsObj.lowStock?.length) {
    const list = notificationsObj.lowStock;
    const outCount = list.filter((p) => Number(trackedStock(p)) <= 0).length;
    cards.push({
      key: 'lowStock',
      category: 'gst_stock',
      priority: 7,
      tone: outCount > 0 ? 'warn' : 'note',
      icon: '📦',
      count: list.length,
      title: `${list.length} product${list.length === 1 ? '' : 's'} low on stock${outCount > 0 ? ` (${outCount} out of stock)` : ''}`,
      subtitle: list.slice(0, 3).map((p) => `${p.name} (${trackedStock(p)} left)`).join(' · '),
      actionLabel: 'Open Inventory',
      targetView: 'inventory',
    });
  }

  // Unread feed count
  const unreadFeedCount = (Array.isArray(feed) ? feed : []).filter((f) => !f.read).length;
  const liveAlertCount = cards.reduce((sum, c) => sum + (Number(c.count) || 1), 0);

  return {
    cards: cards.sort((a, b) => a.priority - b.priority),
    signatures,
    unreadFeedCount,
    totalBadgeCount: liveAlertCount + unreadFeedCount,
    totalUnread: liveAlertCount + unreadFeedCount,
  };
}

export async function requestOsNotificationPermission() {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission || 'denied';
  }
}

export function playSoftAlertChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, ctx.currentTime); // G5
    osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.12); // C6
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close().catch(() => {}), 450);
  } catch { /* audio blocked */ }
}

export function maybeFireOsNotification(title, body = '') {
  if (typeof window === 'undefined') return;
  const prefs = readNotifPrefs();
  if (prefs.soundEnabled) playSoftAlertChime();
  if (!prefs.browserPushEnabled) return;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
      });
    } catch { /* mobile SW-only notification fallback */ }
  }
}
