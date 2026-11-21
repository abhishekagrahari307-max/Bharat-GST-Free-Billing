// Browser-native virtual `/api/*` backend for static web hosting (e.g. GitHub Pages).
// When a real Node Express server (`server.js`) answers `/api/version` with JSON,
// all requests pass straight through to the server untouched. When hosted on a
// static host without Node (such as `*.github.io`), this module seamlessly persists
// all books in IndexedDB (with localStorage fallback) so every feature of
// Bharat GST Free Billing works 100% live in the browser.

import { nextCounterValue } from '../utils.js';
import { STANDARD_TERMS } from './termsDefaults.js';
import { validateCashEntry, cleanCashEntry } from './cashBook.js';

const APP_VERSION = '1.10.86';
const DB_NAME = 'bharat_gst_free_billing_db';
const DB_STORE = 'state';
const DB_KEY = 'books_v1';
const LS_FALLBACK_KEY = 'bharat_gst_books_v1';

const COLLECTIONS = [
  'bills', 'clients', 'templates', 'products', 'productions',
  'expenses', 'recurring', 'receipts', 'purchases', 'purchase-orders',
  'debit-notes', 'stock-adjustments', 'cash-book', 'bank-statements',
  'profiles', 'trash',
];

function emptyState() {
  const cols = {};
  for (const c of COLLECTIONS) cols[c] = {};
  return {
    profile: {},
    meta: {},
    localPrefs: {},
    periodLock: '',
    editHistory: [],
    backups: {},
    collections: cols,
  };
}

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function readPersistedState() {
  const db = await openDb();
  if (db) {
    const fromIdb = await new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(DB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (fromIdb && typeof fromIdb === 'object') return mergeWithDefaults(fromIdb);
  }
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) return mergeWithDefaults(JSON.parse(raw));
  } catch { /* ignore */ }
  return emptyState();
}

function mergeWithDefaults(saved) {
  const base = emptyState();
  const out = { ...base, ...saved, collections: { ...base.collections, ...(saved.collections || {}) } };
  for (const c of COLLECTIONS) {
    if (!out.collections[c] || typeof out.collections[c] !== 'object') out.collections[c] = {};
  }
  if (!Array.isArray(out.editHistory)) out.editHistory = [];
  if (!out.meta || typeof out.meta !== 'object') out.meta = {};
  if (!out.profile || typeof out.profile !== 'object') out.profile = {};
  if (!out.backups || typeof out.backups !== 'object') out.backups = {};
  return out;
}

let stateCache = null;
let saveTimer = null;

async function getState() {
  if (!stateCache) stateCache = await readPersistedState();
  return stateCache;
}

async function flushState() {
  if (!stateCache) return;
  const snapshot = JSON.parse(JSON.stringify(stateCache));
  const db = await openDb();
  if (db) {
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(snapshot, DB_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(snapshot));
  } catch { /* quota or private mode — IndexedDB already holds it */ }
}

function scheduleFlush() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { flushState(); }, 25);
  return flushState();
}

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${String(pin ?? '')}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619);
  return (h >>> 0).toString(16);
}

const unlockedSession = { appUnlocked: false, hiddenKeys: new Map() };

function jsonRes(body, status = 200) {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function listCol(state, name) {
  return Object.values(state.collections[name] || {});
}

function addHistory(state, entry) {
  state.editHistory.unshift({ at: new Date().toISOString(), from: 'web', ...entry });
  if (state.editHistory.length > 500) state.editHistory.length = 500;
}

function withoutLock(meta) {
  const copy = { ...(meta || {}) };
  delete copy.appLock;
  return copy;
}

function snapshotForBackup(state) {
  return {
    bills: listCol(state, 'bills'),
    profile: state.profile || {},
    clients: listCol(state, 'clients'),
    termsTemplates: listCol(state, 'templates'),
    products: listCol(state, 'products'),
    expenses: listCol(state, 'expenses'),
    recurring: listCol(state, 'recurring'),
    receipts: listCol(state, 'receipts'),
    profiles: listCol(state, 'profiles').map((p) => { const copy = { ...p }; delete copy.hideLock; return copy; }),
    purchases: listCol(state, 'purchases'),
    productions: listCol(state, 'productions'),
    purchaseOrders: listCol(state, 'purchase-orders'),
    debitNotes: listCol(state, 'debit-notes'),
    stockAdjustments: listCol(state, 'stock-adjustments'),
    cashBook: listCol(state, 'cash-book'),
    bankStatements: listCol(state, 'bank-statements'),
    meta: withoutLock(state.meta),
    exportedAt: new Date().toISOString(),
  };
}

async function parseBody(init) {
  if (!init || init.body == null) return {};
  if (typeof init.body === 'string') {
    try { return JSON.parse(init.body); } catch { return {}; }
  }
  return {};
}

function extractApiPath(input) {
  const raw = typeof input === 'string' ? input : (input?.url || '');
  try {
    const u = new URL(raw, window.location.href);
    if (u.origin !== window.location.origin) return null;
    const idx = u.pathname.indexOf('/api/');
    if (idx === -1) return null;
    return { path: u.pathname.slice(idx), searchParams: u.searchParams };
  } catch {
    return null;
  }
}

async function handleBrowserApi(path, searchParams, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const state = await getState();

  // ---- Health & Version ----
  if (path === '/api/health') return jsonRes({ ok: true, mode: 'browser' });
  if (path === '/api/version') return jsonRes({ current: APP_VERSION, mode: 'browser', pid: 1, lockId: 'browser', books: 'Browser Storage (IndexedDB)' });
  if (path === '/api/check-update') return jsonRes({ updateAvailable: false, current: APP_VERSION, latest: APP_VERSION });
  if (path === '/api/changelog') {
    return jsonRes({
      markdown: `## [1.10.86] - 2026-11-21\n\n### Added\n- **Bharat GST Free Billing Web Edition**: Full browser + server support with GST invoicing, GSTR-1/3B/2B, e-Way Bill, UPI QR, Inventory, Cash Book, and PDF/Thermal printing.\n`,
    });
  }

  // ---- Local Prefs Mirror ----
  if (path === '/api/local-prefs') {
    if (method === 'GET') return jsonRes({ prefs: state.localPrefs || {} });
    if (method === 'POST') {
      const body = await parseBody(init);
      if (body?.prefs && typeof body.prefs === 'object') {
        state.localPrefs = { ...(state.localPrefs || {}), ...body.prefs };
        await scheduleFlush();
      }
      return jsonRes({ ok: true });
    }
  }

  // ---- App PIN Lock ----
  if (path === '/api/lock') {
    const lock = state.meta?.appLock;
    return jsonRes({ enabled: !!lock, unlocked: !lock || unlockedSession.appUnlocked, pinLength: lock?.length || 6, local: true });
  }
  if (path === '/api/lock/verify' && method === 'POST') {
    const { pin } = await parseBody(init);
    const lock = state.meta?.appLock;
    if (!lock) { unlockedSession.appUnlocked = true; return jsonRes({ ok: true }); }
    const h = await hashPin(pin, lock.salt);
    if (h !== lock.hash) return jsonRes({ ok: false, error: 'Wrong PIN', code: 'wrong-pin', triesLeft: 4 }, 401);
    unlockedSession.appUnlocked = true;
    return jsonRes({ ok: true });
  }
  if (path === '/api/lock/set' && method === 'POST') {
    const { pin, currentPin } = await parseBody(init);
    const existing = state.meta?.appLock;
    if (existing) {
      const check = await hashPin(currentPin, existing.salt);
      if (check !== existing.hash) return jsonRes({ ok: false, error: 'Wrong current PIN', code: 'wrong-pin' }, 401);
    }
    if (pin === null) {
      delete state.meta.appLock;
      unlockedSession.appUnlocked = false;
    } else {
      const s = String(pin ?? '');
      if (!/^\d{4,8}$/.test(s)) return jsonRes({ ok: false, error: 'PIN must be 4–8 digits' }, 400);
      const salt = uid('salt');
      state.meta.appLock = { salt, hash: await hashPin(s, salt), length: s.length };
      unlockedSession.appUnlocked = true;
    }
    await scheduleFlush();
    return jsonRes({ ok: true, enabled: !!state.meta.appLock });
  }

  // ---- Period Lock & Edit History ----
  if (path === '/api/period-lock') {
    if (method === 'GET') return jsonRes({ upTo: state.periodLock || '' });
    if (method === 'POST') {
      const { upTo } = await parseBody(init);
      state.periodLock = String(upTo || '');
      addHistory(state, { kind: 'books', action: state.periodLock ? 'locked' : 'unlocked', id: '', number: '', date: state.periodLock });
      await scheduleFlush();
      return jsonRes({ ok: true, upTo: state.periodLock });
    }
  }
  if (path === '/api/edit-history' && method === 'GET') {
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 200));
    return jsonRes({ entries: (state.editHistory || []).slice(0, limit) });
  }

  // ---- Phone Access & Control Panel ----
  if (path === '/api/phone-access') return jsonRes({ enabled: false, devices: [], urls: [], webMode: true });
  if (path.startsWith('/api/phone-access/')) return jsonRes({ ok: true, devices: [] });
  if (path === '/api/control-panel/status') return jsonRes({ ok: true, webMode: true, browserStorage: true, platform: 'web', installKind: 'web' });
  if (path.startsWith('/api/control-panel/')) return jsonRes({ ok: false, hint: true, error: 'Running as a live web app — updates deploy automatically.' });
  if (path === '/api/errors-log') return jsonRes({ entries: [] });
  if (path === '/api/client-errors') return jsonRes({ ok: true });
  if (path === '/api/save-pdf' || path === '/api/saved-pdf/cancel-mark' || path === '/api/trash-pdf') {
    return jsonRes({ success: true, browserMode: true });
  }

  // ---- Profile (singleton) ----
  if (path === '/api/profile') {
    if (method === 'HEAD') return new Response(null, { status: 200 });
    if (method === 'GET') return jsonRes(state.profile || {});
    if (method === 'POST') {
      state.profile = (await parseBody(init)) || {};
      await scheduleFlush();
      return jsonRes({ success: true });
    }
  }

  // ---- Multi-Business Profiles ----
  if (path === '/api/profiles') {
    if (method === 'GET') {
      const activeGstin = state.profile?.gstin || '';
      const activeName = state.profile?.businessName || '';
      const list = listCol(state, 'profiles').map((p) => {
        const isActive = Boolean((p.gstin && p.gstin === activeGstin) || (!p.gstin && p.businessName && p.businessName === activeName));
        if (p.hideLock) return { id: p.id, hidden: true, isActive };
        return { ...p, isActive };
      });
      list.sort((a, b) => String(a.businessName || '').localeCompare(String(b.businessName || '')));
      return jsonRes(list);
    }
    if (method === 'POST') {
      const { hideLock: _l, hidden: _h, isActive: _a, ...prof } = await parseBody(init);
      if (!prof.id) prof.id = uid('biz');
      const existing = state.collections.profiles[prof.id];
      state.collections.profiles[prof.id] = existing?.hideLock ? { ...prof, hideLock: existing.hideLock } : prof;
      await scheduleFlush();
      return jsonRes({ success: true, id: prof.id });
    }
  }
  if (path === '/api/profiles/unlock' && method === 'POST') {
    const { pin } = await parseBody(init);
    const opened = [];
    for (const p of listCol(state, 'profiles')) {
      if (p.hideLock && (await hashPin(pin, p.hideLock.salt)) === p.hideLock.hash) {
        const key = uid('hkey');
        unlockedSession.hiddenKeys.set(p.id, key);
        const { hideLock: _l, ...pub } = p;
        opened.push({ ...pub, key });
      }
    }
    if (!opened.length) return jsonRes({ ok: false, error: 'wrong-pin', code: 'wrong-pin', triesLeft: 4 }, 401);
    return jsonRes({ ok: true, ids: opened.map((p) => p.id), profiles: opened });
  }
  const profHideMatch = path.match(/^\/api\/profiles\/([^/]+)\/hide-pin$/);
  if (profHideMatch && method === 'POST') {
    const id = decodeURIComponent(profHideMatch[1]);
    const prof = state.collections.profiles[id];
    if (!prof) return jsonRes({ error: 'Not found' }, 404);
    const { pin, currentPin } = await parseBody(init);
    if (prof.hideLock && (await hashPin(currentPin, prof.hideLock.salt)) !== prof.hideLock.hash) {
      return jsonRes({ ok: false, error: 'wrong-pin', code: 'wrong-pin', triesLeft: 4 }, 401);
    }
    const next = { ...prof };
    if (pin === null) {
      delete next.hideLock;
      unlockedSession.hiddenKeys.delete(id);
    } else {
      const salt = uid('salt');
      next.hideLock = { salt, hash: await hashPin(pin, salt), length: String(pin).length };
    }
    state.collections.profiles[id] = next;
    await scheduleFlush();
    const { hideLock: _l, ...pub } = next;
    const key = pin !== null ? uid('hkey') : undefined;
    if (key) unlockedSession.hiddenKeys.set(id, key);
    return jsonRes({ ok: true, hidden: pin !== null, ...(pin !== null ? { key, profile: pub } : {}) });
  }
  const profDelMatch = path.match(/^\/api\/profiles\/([^/]+)$/);
  if (profDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(profDelMatch[1]);
    delete state.collections.profiles[id];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Meta & Atomic Counters ----
  if (path === '/api/number-series/rename' && method === 'POST') {
    const { from, to } = await parseBody(init);
    if (from && to && from !== to && state.meta?.invoiceNumberSeries?.[from]) {
      state.meta.invoiceNumberSeries[to] = state.meta.invoiceNumberSeries[from];
      delete state.meta.invoiceNumberSeries[from];
      await scheduleFlush();
    }
    return jsonRes({ ok: true });
  }
  const metaIncMatch = path.match(/^\/api\/meta\/([^/]+)\/increment$/);
  if (metaIncMatch && method === 'POST') {
    const key = decodeURIComponent(metaIncMatch[1]);
    const { start } = await parseBody(init);
    const next = nextCounterValue(state.meta[key], start);
    state.meta[key] = next;
    await scheduleFlush();
    return jsonRes({ key, value: next });
  }
  const metaRaiseMatch = path.match(/^\/api\/meta\/([^/]+)\/raise$/);
  if (metaRaiseMatch && method === 'POST') {
    const key = decodeURIComponent(metaRaiseMatch[1]);
    const { value } = await parseBody(init);
    const n = Number(value);
    if (Number.isFinite(n) && n > (Number(state.meta[key]) || 0)) {
      state.meta[key] = Math.floor(n);
      await scheduleFlush();
    }
    return jsonRes({ key, value: state.meta[key] ?? 0 });
  }
  const metaMatch = path.match(/^\/api\/meta\/([^/]+)$/);
  if (metaMatch) {
    const key = decodeURIComponent(metaMatch[1]);
    if (key === 'appLock') return jsonRes({ error: 'Forbidden' }, 403);
    if (method === 'GET') return jsonRes({ key, value: state.meta[key] ?? null });
    if (method === 'POST') {
      const { value } = await parseBody(init);
      state.meta[key] = value;
      await scheduleFlush();
      return jsonRes({ success: true, key, value });
    }
  }

  // ---- Bills & Trash ----
  if (path === '/api/bills') {
    if (method === 'GET') {
      const bills = listCol(state, 'bills');
      bills.sort((a, b) => String(b.invoiceDate || b.createdAt || '').localeCompare(String(a.invoiceDate || a.createdAt || '')));
      return jsonRes(bills);
    }
    if (method === 'POST') {
      const bill = await parseBody(init);
      const overwrite = searchParams.get('overwrite') === '1' || searchParams.get('overwrite') === 'true';
      if (!bill.id) bill.id = uid('bill');
      const existingById = state.collections.bills[bill.id];
      if (existingById && !overwrite) {
        return jsonRes({ error: `Invoice "${bill.invoiceNumber || bill.id}" already exists.`, code: 'duplicate-bill' }, 409);
      }
      if (!overwrite && bill.invoiceNumber) {
        const dup = listCol(state, 'bills').find((b) => b.id !== bill.id && b.invoiceNumber === bill.invoiceNumber && (b.invoiceType || 'tax-invoice') === (bill.invoiceType || 'tax-invoice'));
        if (dup) return jsonRes({ error: `Invoice number "${bill.invoiceNumber}" is already used.`, code: 'duplicate-number' }, 409);
      }
      bill.updatedAt = new Date().toISOString();
      if (!bill.createdAt) bill.createdAt = bill.updatedAt;
      state.collections.bills[bill.id] = bill;
      addHistory(state, { kind: 'bill', action: existingById ? 'edited' : 'added', id: bill.id, number: bill.invoiceNumber || '', date: bill.invoiceDate || '', total: bill.totalAmount });
      await scheduleFlush();
      return jsonRes({ success: true, id: bill.id });
    }
  }
  const billDelMatch = path.match(/^\/api\/bills\/([^/]+)$/);
  if (billDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(billDelMatch[1]);
    const existing = state.collections.bills[id];
    if (existing) {
      state.collections.trash[id] = { ...existing, _trashedAt: new Date().toISOString() };
      delete state.collections.bills[id];
      addHistory(state, { kind: 'bill', action: 'deleted', id, number: existing.invoiceNumber || '', date: existing.invoiceDate || '', total: existing.totalAmount });
      await scheduleFlush();
    }
    return jsonRes({ success: true });
  }

  if (path === '/api/trash' && method === 'GET') {
    const list = listCol(state, 'trash');
    list.sort((a, b) => String(b._trashedAt || '').localeCompare(String(a._trashedAt || '')));
    return jsonRes(list);
  }
  const trashRestoreMatch = path.match(/^\/api\/trash\/([^/]+)\/restore$/);
  if (trashRestoreMatch && method === 'POST') {
    const id = decodeURIComponent(trashRestoreMatch[1]);
    const item = state.collections.trash[id];
    if (!item) return jsonRes({ error: 'Not found' }, 404);
    const { _trashedAt: _t, ...restored } = item;
    state.collections.bills[id] = restored;
    delete state.collections.trash[id];
    await scheduleFlush();
    return jsonRes({ success: true, id });
  }
  const trashDelMatch = path.match(/^\/api\/trash\/([^/]+)$/);
  if (trashDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(trashDelMatch[1]);
    delete state.collections.trash[id];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Backups ----
  if (path === '/api/backup-folder') return jsonRes({ path: '' });
  if (path === '/api/backups' && method === 'GET') {
    const dates = Object.keys(state.backups || {}).sort((a, b) => b.localeCompare(a));
    return jsonRes(dates.map((date) => {
      const snap = state.backups[date] || {};
      return { date, createdAt: snap.exportedAt || date, billCount: (snap.bills || []).length, clientCount: (snap.clients || []).length };
    }));
  }
  if (path === '/api/backups/now' && method === 'POST') {
    const today = new Date().toISOString().slice(0, 10);
    state.backups[today] = snapshotForBackup(state);
    await scheduleFlush();
    return jsonRes({ success: true, date: today });
  }
  const backupRestoreMatch = path.match(/^\/api\/backups\/([^/]+)\/restore$/);
  if (backupRestoreMatch && method === 'POST') {
    const date = decodeURIComponent(backupRestoreMatch[1]);
    const snap = state.backups?.[date];
    if (!snap) return jsonRes({ error: 'Backup not found' }, 404);
    await applyImportPayload(state, snap, true);
    await scheduleFlush();
    return jsonRes({ success: true });
  }
  const backupDelMatch = path.match(/^\/api\/backups\/([^/]+)$/);
  if (backupDelMatch && method === 'DELETE') {
    const date = decodeURIComponent(backupDelMatch[1]);
    delete state.backups[date];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Templates (seeds Standard Terms) ----
  if (path === '/api/templates') {
    if (method === 'GET') {
      let list = listCol(state, 'templates');
      if (list.length === 0) {
        const def = { id: 'default', name: 'Standard Terms', content: STANDARD_TERMS };
        state.collections.templates.default = def;
        await scheduleFlush();
        list = [def];
      }
      list.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
      return jsonRes(list);
    }
    if (method === 'POST') {
      const tpl = await parseBody(init);
      if (!tpl.id) tpl.id = uid('tpl');
      state.collections.templates[tpl.id] = tpl;
      await scheduleFlush();
      return jsonRes({ success: true, id: tpl.id });
    }
  }
  const tplDelMatch = path.match(/^\/api\/templates\/([^/]+)$/);
  if (tplDelMatch && method === 'DELETE') {
    delete state.collections.templates[decodeURIComponent(tplDelMatch[1])];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Productions (moves product stock atomically) ----
  if (path === '/api/productions') {
    if (method === 'GET') {
      const rows = listCol(state, 'productions');
      rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return jsonRes(rows);
    }
    if (method === 'POST') {
      const entry = await parseBody(init);
      if (!entry?.id) entry.id = uid('prodn');
      if (state.collections.productions[entry.id]) return jsonRes({ error: 'Already exists' }, 409);
      for (const [pid, delta] of Object.entries(entry.stockApplied || {})) {
        const p = state.collections.products[pid];
        if (p && p.type !== 'service') p.stock = Math.round(((Number(p.stock) || 0) + (Number(delta) || 0)) * 1000) / 1000;
      }
      state.collections.productions[entry.id] = entry;
      await scheduleFlush();
      return jsonRes({ success: true, id: entry.id });
    }
  }
  const prodnDelMatch = path.match(/^\/api\/productions\/([^/]+)$/);
  if (prodnDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(prodnDelMatch[1]);
    const entry = state.collections.productions[id];
    if (!entry) return jsonRes({ error: 'Not found' }, 404);
    for (const [pid, delta] of Object.entries(entry.stockApplied || {})) {
      const p = state.collections.products[pid];
      if (p && p.type !== 'service') p.stock = Math.round(((Number(p.stock) || 0) - (Number(delta) || 0)) * 1000) / 1000;
    }
    delete state.collections.productions[id];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Stock Adjustments ----
  if (path === '/api/stock-adjustments') {
    if (method === 'GET') {
      const list = listCol(state, 'stock-adjustments');
      list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return jsonRes(list);
    }
    if (method === 'POST') {
      const a = await parseBody(init);
      const id = a.id || uid('adj');
      const record = {
        id, date: a.date, productId: a.productId,
        productName: String(a.productName ?? '').slice(0, 200),
        unit: String(a.unit ?? '').slice(0, 20),
        quantity: Number(a.quantity) || 0,
        reason: String(a.reason ?? '').slice(0, 20),
        note: String(a.note ?? '').slice(0, 500),
        stockApplied: { [a.productId]: Number(a.quantity) || 0 },
        createdAt: new Date().toISOString(),
      };
      state.collections['stock-adjustments'][id] = record;
      await scheduleFlush();
      return jsonRes({ success: true, id, record });
    }
  }
  const adjDelMatch = path.match(/^\/api\/stock-adjustments\/([^/]+)$/);
  if (adjDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(adjDelMatch[1]);
    const record = state.collections['stock-adjustments'][id];
    if (!record) return jsonRes({ error: 'Not found' }, 404);
    delete state.collections['stock-adjustments'][id];
    await scheduleFlush();
    return jsonRes({ success: true, record });
  }

  // ---- Cash Book ----
  if (path === '/api/cash-book') {
    if (method === 'GET') {
      const entries = listCol(state, 'cash-book');
      entries.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return jsonRes(entries);
    }
    if (method === 'POST') {
      const body = await parseBody(init);
      const problem = validateCashEntry(body);
      if (problem) return jsonRes({ error: problem, code: 'bad-request' }, 400);
      const entry = cleanCashEntry(body);
      if (!entry.id) entry.id = uid('cash');
      else entry.updatedAt = new Date().toISOString();
      state.collections['cash-book'][entry.id] = entry;
      await scheduleFlush();
      return jsonRes({ success: true, id: entry.id, entry });
    }
  }
  const cashDelMatch = path.match(/^\/api\/cash-book\/([^/]+)$/);
  if (cashDelMatch && method === 'DELETE') {
    delete state.collections['cash-book'][decodeURIComponent(cashDelMatch[1])];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Bulk Product Price/Stock CSV Update ----
  if (path === '/api/products/price-update' && method === 'POST') {
    const { changes = [], allowStock = false } = await parseBody(init);
    let updated = 0;
    for (const ch of changes) {
      const p = state.collections.products[ch.id];
      if (!p) continue;
      if (ch.sellingPrice !== undefined) { p.sellingPrice = ch.sellingPrice; p.rate = ch.sellingPrice; }
      if (ch.purchasePrice !== undefined) p.purchasePrice = ch.purchasePrice;
      if (ch.mrp !== undefined) p.mrp = ch.mrp;
      if (ch.hsn !== undefined) p.hsn = ch.hsn;
      if (ch.levelPrices && typeof ch.levelPrices === 'object') p.levelPrices = { ...(p.levelPrices || {}), ...ch.levelPrices };
      if (allowStock && ch.stock !== undefined && p.type !== 'service') p.stock = ch.stock;
      updated++;
    }
    await scheduleFlush();
    return jsonRes({ ok: true, updated });
  }

  // ---- Generic CRUD Collections ----
  const GENERIC_COLLECTIONS = {
    clients: { prefix: 'cli', sort: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) },
    products: { prefix: 'prod', sort: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) },
    expenses: { prefix: 'exp', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    purchases: { prefix: 'pur', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    'purchase-orders': { prefix: 'po', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    'debit-notes': { prefix: 'dn', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    recurring: { prefix: 'rec', sort: (a, b) => String(a.clientName || '').localeCompare(String(b.clientName || '')) },
    receipts: { prefix: 'rcp', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    'bank-statements': { prefix: 'stmt', sort: (a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')) },
  };

  for (const [col, cfg] of Object.entries(GENERIC_COLLECTIONS)) {
    if (path === `/api/${col}`) {
      if (method === 'GET') {
        const items = listCol(state, col);
        items.sort(cfg.sort);
        return jsonRes(items);
      }
      if (method === 'POST') {
        const item = await parseBody(init);
        if (!item.id) item.id = uid(cfg.prefix);
        state.collections[col][item.id] = item;
        await scheduleFlush();
        return jsonRes({ success: true, id: item.id });
      }
    }
    const delMatch = path.match(new RegExp(`^/api/${col}/([^/]+)$`));
    if (delMatch && method === 'DELETE') {
      delete state.collections[col][decodeURIComponent(delMatch[1])];
      await scheduleFlush();
      return jsonRes({ success: true });
    }
  }

  // ---- Recurring "Generate Now" ----
  const recGenMatch = path.match(/^\/api\/recurring\/([^/]+)\/generate$/);
  if (recGenMatch && method === 'POST') {
    const id = decodeURIComponent(recGenMatch[1]);
    const rec = state.collections.recurring[id];
    if (!rec) return jsonRes({ error: 'Recurring template not found' }, 404);
    const today = new Date().toISOString().slice(0, 10);
    const nextNum = nextCounterValue(state.meta.counter_INV, 1);
    state.meta.counter_INV = nextNum;
    const invoiceNumber = `INV/${String(nextNum).padStart(4, '0')}`;
    const billId = uid('bill');
    const bill = {
      ...(rec.templateData || {}),
      id: billId,
      invoiceNumber,
      invoiceDate: today,
      clientName: rec.clientName || rec.templateData?.client?.name || '',
      totalAmount: rec.amount || rec.templateData?.totalAmount || 0,
      createdAt: new Date().toISOString(),
    };
    state.collections.bills[billId] = bill;
    rec.lastGenerated = today;
    await scheduleFlush();
    return jsonRes({ success: true, id: billId, invoiceNumber });
  }

  // ---- Export & Import ----
  if (path === '/api/export' && method === 'GET') {
    return jsonRes(snapshotForBackup(state));
  }
  if (path === '/api/import' && method === 'POST') {
    const data = await parseBody(init);
    const overwrite = searchParams.get('overwrite') === '1' || searchParams.get('overwrite') === 'true';
    const counts = await applyImportPayload(state, data, overwrite);
    await scheduleFlush();
    return jsonRes({ success: true, ...counts });
  }

  return jsonRes({ error: `Unhandled browser API route: ${method} ${path}` }, 404);
}

async function applyImportPayload(state, data, overwrite) {
  const counts = {
    billCount: 0, clientCount: 0, templateCount: 0, productCount: 0,
    expenseCount: 0, recurringCount: 0, receiptCount: 0, profileCount: 0,
    purchaseCount: 0, productionCount: 0, purchaseOrderCount: 0,
    debitNoteCount: 0, stockAdjustmentCount: 0, cashBookCount: 0, bankStatementCount: 0,
  };
  if (data.profile && (overwrite || !Object.keys(state.profile || {}).length)) {
    state.profile = data.profile;
  }
  const map = [
    ['bills', data.bills, 'billCount'],
    ['clients', data.clients, 'clientCount'],
    ['templates', data.termsTemplates, 'templateCount'],
    ['products', data.products, 'productCount'],
    ['expenses', data.expenses, 'expenseCount'],
    ['recurring', data.recurring, 'recurringCount'],
    ['receipts', data.receipts, 'receiptCount'],
    ['profiles', data.profiles, 'profileCount'],
    ['purchases', data.purchases, 'purchaseCount'],
    ['productions', data.productions, 'productionCount'],
    ['purchase-orders', data.purchaseOrders, 'purchaseOrderCount'],
    ['debit-notes', data.debitNotes, 'debitNoteCount'],
    ['stock-adjustments', data.stockAdjustments, 'stockAdjustmentCount'],
    ['cash-book', data.cashBook, 'cashBookCount'],
    ['bank-statements', data.bankStatements, 'bankStatementCount'],
  ];
  for (const [col, arr, key] of map) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item?.id) continue;
      if (!overwrite && state.collections[col][item.id]) continue;
      state.collections[col][item.id] = item;
      counts[key]++;
    }
  }
  if (data.meta && typeof data.meta === 'object') {
    for (const [k, v] of Object.entries(data.meta)) {
      if (k === 'appLock') continue;
      if (overwrite || state.meta[k] === undefined) state.meta[k] = v;
    }
  }
  return counts;
}

let backendModePromise = null;

export function installBrowserApiFallback() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function' || window.__bharatBrowserApiInstalled) return;
  window.__bharatBrowserApiInstalled = true;
  const origFetch = window.fetch.bind(window);

  const detectMode = () => {
    if (backendModePromise) return backendModePromise;
    // Fast-path known static hosts so first paint never waits on a 404 round-trip.
    if (/\.github\.io$|\.netlify\.app$|\.vercel\.app$|\.pages\.dev$/i.test(window.location.hostname)) {
      backendModePromise = Promise.resolve('browser');
      return backendModePromise;
    }
    backendModePromise = origFetch('./api/version', { cache: 'no-store' })
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        return res.ok && ct.includes('application/json') ? 'server' : 'browser';
      })
      .catch(() => 'browser');
    return backendModePromise;
  };

  window.fetch = async (input, init) => {
    const parsed = extractApiPath(input);
    if (!parsed) return origFetch(input, init);
    const mode = await detectMode();
    if (mode === 'server') return origFetch(input, init);
    return handleBrowserApi(parsed.path, parsed.searchParams, init);
  };
}
