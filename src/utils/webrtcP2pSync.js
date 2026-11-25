// Hardened Browser-Native WebRTC P2P Mobile-to-PC Live Billing & Stock Sync Engine (v5.2.0 — Audit Hardened)
// Fixes P0-1, P0-5 & P1:
// 1. Canonical Product & Invoice Schema (`taxPercent` + `gstRate`, `data.totals.taxableAmount`, `'tax-invoice'`)
// 2. Verified Storage Persistence (`saveP2pOfflineQueue`) — NEVER claims `{ queued: true }` on QuotaExceededError!
// 3. Persistent Host Deduplication (`bharatgst_p2p_host_ack_map`) across Counter PC reloads/restarts
// 4. 6-Digit Pairing PIN + 5-Attempt Brute-Force Lockout + URL `?pin=` History Scrub Helper
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import {
  resolveProductTaxPercent,
  resolveProductSellingPrice,
  normalizeCanonicalProduct,
} from './canonicalAdapter.js';

export const P2P_QUEUE_STORAGE_KEY = 'bharatgst_p2p_offline_queue';
export const P2P_HOST_ACK_STORAGE_KEY = 'bharatgst_p2p_host_ack_map';
export const MAX_P2P_AUTH_ATTEMPTS = 5;

const nodeOnlyMemoryQueue = [];

function resolveStorageState() {
  // If `localStorage` property exists on globalThis (all browsers + storage quota mocks):
  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    try {
      const st = globalThis.localStorage;
      if (!st || typeof st.getItem !== 'function' || typeof st.setItem !== 'function') {
        return { mode: 'unavailable', storage: null };
      }
      return { mode: 'web', storage: st };
    } catch {
      return { mode: 'unavailable', storage: null };
    }
  }
  // Pure Node.js CLI without DOM/localStorage
  if (typeof window === 'undefined') {
    return { mode: 'node-memory', storage: null };
  }
  return { mode: 'unavailable', storage: null };
}

export function getP2pOfflineQueue() {
  const { mode, storage } = resolveStorageState();
  if (mode === 'node-memory') return [...nodeOnlyMemoryQueue];
  if (mode !== 'web' || !storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(P2P_QUEUE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Writes the offline queue to durable localStorage AND verifies read-back.
 * Never swallows QuotaExceededError silently — returns `{ ok: boolean, error?: string }`.
 */
export function saveP2pOfflineQueue(queue = []) {
  const clean = Array.isArray(queue) ? queue : [];
  const { mode, storage } = resolveStorageState();
  if (mode === 'node-memory') {
    nodeOnlyMemoryQueue.length = 0;
    nodeOnlyMemoryQueue.push(...clean);
    return { ok: true };
  }
  if (mode !== 'web' || !storage) {
    return {
      ok: false,
      error: 'Durable browser storage (localStorage) is blocked or unavailable.',
    };
  }
  try {
    const serialized = JSON.stringify(clean);
    storage.setItem(P2P_QUEUE_STORAGE_KEY, serialized);
    const readBack = storage.getItem(P2P_QUEUE_STORAGE_KEY);
    if (readBack !== serialized) {
      return {
        ok: false,
        error: 'Storage verification read-back mismatch — offline queue could not be persisted.',
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Storage quota exceeded — offline queue could not be persisted.',
    };
  }
}

export function removeP2pQueueItem(queueId) {
  const updated = getP2pOfflineQueue().filter((item) => item?.queueId !== queueId);
  saveP2pOfflineQueue(updated);
  return updated;
}

export function loadPersistedHostAckMap() {
  const { mode, storage } = resolveStorageState();
  if (mode !== 'web' || !storage) return new Map();
  try {
    const entries = JSON.parse(storage.getItem(P2P_HOST_ACK_STORAGE_KEY) || '[]');
    return new Map(Array.isArray(entries) ? entries : []);
  } catch {
    return new Map();
  }
}

export function savePersistedHostAckMap(ackMap) {
  const { mode, storage } = resolveStorageState();
  if (mode !== 'web' || !storage || !(ackMap instanceof Map)) return;
  try {
    const bounded = [...ackMap.entries()].slice(-500);
    storage.setItem(P2P_HOST_ACK_STORAGE_KEY, JSON.stringify(bounded));
  } catch { /* best-effort host dedupe cache */ }
}

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

function randomDigits(len) {
  const arr = new Uint32Array(len);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr, (v) => String(v % 10)).join('');
}

export function generateP2pCredentials() {
  return {
    roomId: `BGST-${randomDigits(6)}`,
    pin: randomDigits(6),
  };
}

export function buildP2pPairingUrl(baseHref = '', { roomId = '', pin = '', includePin = true } = {}) {
  try {
    const u = new URL(baseHref || 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/');
    u.searchParams.set('view', 'reports');
    u.searchParams.set('p2p', String(roomId).trim().toUpperCase());
    if (includePin && pin) u.searchParams.set('pin', String(pin).trim());
    else u.searchParams.delete('pin');
    return u.toString();
  } catch {
    const base = `?view=reports&p2p=${encodeURIComponent(roomId)}`;
    return includePin && pin ? `${base}&pin=${encodeURIComponent(pin)}` : base;
  }
}

export function parseP2pParamsFromSearch(search = '') {
  const params = new URLSearchParams(String(search || ''));
  const roomId = String(params.get('p2p') || '').trim().toUpperCase();
  const pin = String(params.get('pin') || '').trim();
  if (!roomId) return null;
  return { roomId, pin };
}

/**
 * Removes `?pin=` from the browser URL bar after pairing scan so PIN never lingers in history/referrers.
 */
export function scrubPinFromBrowserUrl() {
  try {
    if (typeof window === 'undefined' || !window.location?.search || !window.history?.replaceState) return;
    const u = new URL(window.location.href);
    if (u.searchParams.has('pin')) {
      u.searchParams.delete('pin');
      window.history.replaceState({}, '', u.toString());
    }
  } catch { /* ignore */ }
}

export function mapProductsToP2pCatalog(products = []) {
  return (Array.isArray(products) ? products : [])
    .filter((p) => p && p.name)
    .map((p) => {
      const norm = normalizeCanonicalProduct(p);
      return {
        id: norm.id,
        name: norm.name,
        hsn: norm.hsn,
        unit: norm.unit,
        price: norm.sellingPrice,
        sellingPrice: norm.sellingPrice,
        taxPercent: norm.taxPercent,
        gstRate: norm.gstRate,
        stock: norm.stock,
      };
    });
}

function canonicalInvoiceTypeSlug(docType = 'Tax Invoice') {
  const s = String(docType || 'tax-invoice').trim().toLowerCase().replace(/[_\s]+/g, '-');
  if (s.includes('sales-order') || s === 'order') return 'sales-order';
  if (s.includes('quotation') || s === 'quote') return 'quotation';
  if (s.includes('proforma') || s.includes('estimate')) return 'proforma';
  if (s.includes('credit-note')) return 'credit-note';
  if (s.includes('bill-of-supply')) return 'bill-of-supply';
  return 'tax-invoice';
}

/**
 * Builds a complete GST-compliant canonical invoice payload on the Mobile Staff Order Pad.
 * Populates BOTH `data.totals` (`taxableAmount`, `cgst`, `sgst`, `igst`, `total`) AND legacy fields
 * so Dashboard, P&L, GSTR-1, GSTR-9, and ITR-3/4 read exact taxable & GST figures!
 */
export function buildP2pInvoicePayload({
  invoiceNumber = '',
  docType = 'Tax Invoice',
  customerName = 'Walk-in Customer',
  customerPhone = '',
  customerGstin = '',
  sellerState = '',
  buyerState = '',
  items = [],
  staffNote = 'Synced via 5G Mobile P2P',
} = {}) {
  const cleanGstin = String(customerGstin || '').trim().toUpperCase();
  const inferredBuyerState = buyerState || (cleanGstin.length >= 2 ? cleanGstin.slice(0, 2) : sellerState);
  const isInterState = Boolean(sellerState && inferredBuyerState && sellerState !== inferredBuyerState);
  const typeSlug = canonicalInvoiceTypeSlug(docType);
  const zeroGstDoc = typeSlug === 'bill-of-supply';

  let taxableSubtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const normalizedItems = (Array.isArray(items) ? items : [])
    .filter((it) => it && Number(it.quantity ?? it.qty ?? 0) > 0)
    .map((it) => {
      const quantity = Number(it.quantity ?? it.qty ?? 1);
      const price = resolveProductSellingPrice(it);
      const gstRate = zeroGstDoc ? 0 : resolveProductTaxPercent(it);
      const taxableValue = r2(quantity * price);
      const taxAmt = r2((taxableValue * gstRate) / 100);
      const cgst = isInterState ? 0 : r2(taxAmt / 2);
      const sgst = isInterState ? 0 : r2(taxAmt - cgst);
      const igst = isInterState ? taxAmt : 0;

      taxableSubtotal = r2(taxableSubtotal + taxableValue);
      totalCgst = r2(totalCgst + cgst);
      totalSgst = r2(totalSgst + sgst);
      totalIgst = r2(totalIgst + igst);

      return {
        productId: it.productId || it.id || '',
        name: String(it.name || it.description || 'Item'),
        description: String(it.name || it.description || 'Item'),
        hsn: String(it.hsn || ''),
        unit: String(it.unit || 'PCS'),
        quantity,
        rate: price,
        price,
        taxPercent: gstRate,
        gstRate,
        discount: 0,
        cessPercent: 0,
        taxableValue,
        cgst,
        sgst,
        igst,
        amount: r2(taxableValue + taxAmt),
      };
    });

  const grandTotal = r2(taxableSubtotal + totalCgst + totalSgst + totalIgst);
  const today = new Date().toISOString().slice(0, 10);
  const finalInvNo = String(invoiceNumber || '').trim() || `P2P-${Date.now().toString().slice(-6)}`;
  const cleanCustomer = String(customerName || 'Walk-in Customer').trim() || 'Walk-in Customer';

  return {
    invoiceType: typeSlug,
    invoiceNumber: finalInvNo,
    invoiceDate: today,
    clientName: cleanCustomer,
    clientGstin: cleanGstin,
    totalAmount: grandTotal,
    amountPaid: 0,
    status: 'unpaid',
    data: {
      invoiceType: typeSlug,
      invoiceNumber: finalInvNo,
      invoiceDate: today,
      details: {
        invoiceNumber: finalInvNo,
        invoiceDate: today,
      },
      client: {
        name: cleanCustomer,
        phone: String(customerPhone || '').trim(),
        gstin: cleanGstin,
        state: inferredBuyerState,
      },
      items: normalizedItems,
      totals: {
        subtotal: taxableSubtotal,
        totalDiscount: 0,
        taxableAmount: taxableSubtotal,
        cgst: totalCgst,
        sgst: totalSgst,
        utgst: 0,
        igst: totalIgst,
        cess: 0,
        total: grandTotal,
        isInterstate: isInterState,
      },
      subtotal: taxableSubtotal,
      totalCgst,
      totalSgst,
      totalIgst,
      grandTotal,
      notes: staffNote,
      p2pSyncedAt: new Date().toISOString(),
    },
  };
}

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export class WebRtcP2pController {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.authenticatedPeers = new Set();
    this.failedAuthAttempts = new Map(); // peerId -> count (rate-limit guard)
    this.seenQueueIds = loadPersistedHostAckMap(); // persistent across Counter PC reloads!
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.stoppedManually = false;
  }

  async startHost({
    roomId,
    pin,
    shopName = 'Counter PC',
    getCatalog = () => [],
    onStatus,
    onInvoiceReceived,
  } = {}) {
    this.disconnectAll();
    this.stoppedManually = false;
    this.seenQueueIds = loadPersistedHostAckMap();
    const creds = roomId && pin ? { roomId, pin } : generateP2pCredentials();
    const { default: Peer } = await import('peerjs');

    this.peer = new Peer(creds.roomId, {
      config: { iceServers: DEFAULT_ICE_SERVERS },
    });

    this.peer.on('open', (id) => {
      onStatus?.({ state: 'HOST_READY', message: `Host ready on ${id} (6-digit PIN active)`, peerId: id });
    });

    this.peer.on('disconnected', () => {
      if (this.stoppedManually || !this.peer || this.peer.destroyed) return;
      onStatus?.({ state: 'SIGNALING_RECONNECTING', message: 'Signaling dropped — auto-reconnecting Counter PC…' });
      try { this.peer.reconnect(); } catch { /* ignore */ }
    });

    this.peer.on('error', (err) => {
      onStatus?.({ state: 'ERROR', message: err?.message || 'P2P signaling error' });
    });

    this.peer.on('connection', (conn) => {
      this.connections.set(conn.peer, conn);
      onStatus?.({ state: 'PEER_CONNECTING', message: `Incoming connection from ${conn.peer}…` });

      conn.on('data', async (msg) => {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'AUTH_HELLO') {
          const priorFailures = this.failedAuthAttempts.get(conn.peer) || 0;
          if (priorFailures >= MAX_P2P_AUTH_ATTEMPTS) {
            conn.send({ type: 'AUTH_DENIED', reason: 'Locked out after 5 failed PIN attempts. Restart Counter session.' });
            setTimeout(() => conn.close(), 200);
            return;
          }
          if (String(msg.pin || '').trim() !== String(creds.pin).trim()) {
            const nextFail = priorFailures + 1;
            this.failedAuthAttempts.set(conn.peer, nextFail);
            conn.send({
              type: 'AUTH_DENIED',
              reason: `Incorrect Counter PIN (${Math.max(0, MAX_P2P_AUTH_ATTEMPTS - nextFail)} attempts remaining)`,
            });
            onStatus?.({ state: 'AUTH_REJECTED', message: `Blocked unauthorized peer ${conn.peer} (attempt ${nextFail}/${MAX_P2P_AUTH_ATTEMPTS})` });
            setTimeout(() => conn.close(), 300);
            return;
          }
          this.failedAuthAttempts.delete(conn.peer);
          this.authenticatedPeers.add(conn.peer);
          const catalog = mapProductsToP2pCatalog(getCatalog());
          conn.send({
            type: 'AUTH_OK',
            shopName,
            catalog,
          });
          onStatus?.({
            state: 'DEVICE_AUTHENTICATED',
            message: `Staff device "${msg.deviceName || conn.peer}" paired (${catalog.length} items synced)`,
            connectedCount: this.authenticatedPeers.size,
          });
          return;
        }

        if (!this.authenticatedPeers.has(conn.peer)) {
          conn.send({ type: 'AUTH_DENIED', reason: 'Authenticate with Counter PIN first' });
          return;
        }

        if (msg.type === 'PING') {
          conn.send({ type: 'PONG', ts: Date.now() });
          return;
        }

        if (msg.type === 'PULL_CATALOG') {
          conn.send({ type: 'CATALOG_SNAPSHOT', shopName, catalog: mapProductsToP2pCatalog(getCatalog()) });
          return;
        }

        if (msg.type === 'SYNC_INVOICE' && msg.invoice) {
          if (msg.queueId && this.seenQueueIds.has(msg.queueId)) {
            conn.send({
              type: 'ACK_INVOICE',
              queueId: msg.queueId,
              invoiceNumber: this.seenQueueIds.get(msg.queueId),
              totalAmount: msg.invoice.totalAmount,
              deduplicated: true,
              savedAt: new Date().toISOString(),
            });
            return;
          }

          try {
            const saved = await onInvoiceReceived?.(msg.invoice);
            const savedNo = saved?.invoiceNumber || msg.invoice.invoiceNumber;
            if (msg.queueId) {
              this.seenQueueIds.set(msg.queueId, savedNo);
              savePersistedHostAckMap(this.seenQueueIds);
            }
            conn.send({
              type: 'ACK_INVOICE',
              queueId: msg.queueId || null,
              invoiceNumber: savedNo,
              totalAmount: msg.invoice.totalAmount,
              savedAt: new Date().toISOString(),
            });
            onStatus?.({
              state: 'INVOICE_SYNCED',
              message: `Saved live bill #${savedNo} (₹${Number(msg.invoice.totalAmount || 0).toFixed(2)})`,
            });
          } catch (err) {
            conn.send({ type: 'ERR_INVOICE', queueId: msg.queueId || null, error: err?.message || 'Save failed on Counter PC' });
          }
        }
      });

      conn.on('close', () => {
        this.connections.delete(conn.peer);
        this.authenticatedPeers.delete(conn.peer);
        onStatus?.({
          state: 'DEVICE_DISCONNECTED',
          message: `Device ${conn.peer} disconnected`,
          connectedCount: this.authenticatedPeers.size,
        });
      });
    });

    return creds;
  }

  startHeartbeat(conn) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (conn && conn.open) {
        try { conn.send({ type: 'PING', ts: Date.now() }); } catch { /* ignore */ }
      }
    }, 10000);
  }

  async connectToHost({
    hostRoomId,
    pin,
    deviceName = 'Staff Mobile',
    onStatus,
    onCatalogReceived,
    onAckReceived,
    onQueueChange,
  } = {}) {
    this.disconnectAll();
    this.stoppedManually = false;
    const target = String(hostRoomId || '').trim().toUpperCase();
    if (!target) throw new Error('Enter the Counter PC Session ID (e.g. BGST-123456).');

    const { default: Peer } = await import('peerjs');
    this.peer = new Peer({ config: { iceServers: DEFAULT_ICE_SERVERS } });

    const establishDataChannel = () => {
      if (this.stoppedManually || !this.peer || this.peer.destroyed) return;
      const conn = this.peer.connect(target, { reliable: true });

      conn.on('open', () => {
        onStatus?.({ state: 'AUTHENTICATING', message: `Connected to ${target}, verifying Counter PIN…` });
        conn.send({ type: 'AUTH_HELLO', pin: String(pin || '').trim(), deviceName });
      });

      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'AUTH_DENIED') {
          this.stoppedManually = true;
          onStatus?.({ state: 'AUTH_DENIED', message: msg.reason || 'PIN rejected by Counter PC' });
          return;
        }
        if (msg.type === 'AUTH_OK' || msg.type === 'CATALOG_SNAPSHOT') {
          this.connections.set(target, conn);
          onCatalogReceived?.(Array.isArray(msg.catalog) ? msg.catalog : [], msg.shopName || 'Counter PC');
          onStatus?.({
            state: 'CONNECTED_TO_PC',
            message: `Paired with ${msg.shopName || 'Counter PC'} (${(msg.catalog || []).length} live items ready)`,
          });
          this.startHeartbeat(conn);
          const flushed = this.flushOfflineQueue(target);
          if (flushed > 0) {
            onStatus?.({ state: 'QUEUE_FLUSHING', message: `Auto-flushing ${flushed} queued offline bill(s) to Counter PC…` });
          }
          return;
        }
        if (msg.type === 'ACK_INVOICE') {
          if (msg.queueId) {
            const remaining = removeP2pQueueItem(msg.queueId);
            onQueueChange?.(remaining);
          }
          onAckReceived?.(msg);
          onStatus?.({
            state: 'ACK_INVOICE',
            message: `Counter PC confirmed Bill #${msg.invoiceNumber}!`,
          });
        }
        if (msg.type === 'ERR_INVOICE') {
          onStatus?.({ state: 'ERROR', message: msg.error || 'Counter PC rejected bill' });
        }
      });

      conn.on('close', () => {
        this.connections.delete(target);
        clearInterval(this.heartbeatTimer);
        if (!this.stoppedManually) {
          onStatus?.({ state: 'RECONNECTING_IN_3S', message: 'Link dropped — auto-reconnecting in 3s…' });
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(establishDataChannel, 3000);
        } else {
          onStatus?.({ state: 'DISCONNECTED', message: 'Disconnected from Counter PC' });
        }
      });
    };

    this.peer.on('open', establishDataChannel);

    this.peer.on('disconnected', () => {
      if (this.stoppedManually || !this.peer || this.peer.destroyed) return;
      try { this.peer.reconnect(); } catch { /* ignore */ }
    });

    this.peer.on('error', (err) => {
      onStatus?.({
        state: 'ERROR',
        message: err?.message || 'Could not reach Counter PC (note: symmetric carrier NAT without TURN may require Wi-Fi/hotspot)',
      });
    });
  }

  /**
   * Verified Queue-Safe Bill Push:
   * Persists to localStorage AND verifies read-back BEFORE claiming `queued: true`.
   * If storage fails (e.g. QuotaExceededError) while offline, returns `{ queued: false, storageError: true }`
   * so the UI can block silent data loss and trigger an immediate emergency JSON download!
   */
  pushBillSafe(hostRoomId, invoicePayload) {
    const target = String(hostRoomId || '').trim().toUpperCase();
    const queueId = `Q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const packet = {
      queueId,
      targetRoomId: target,
      queuedAt: new Date().toISOString(),
      type: 'SYNC_INVOICE',
      invoice: invoicePayload,
    };

    const existingQueue = getP2pOfflineQueue();
    const nextQueue = [...existingQueue, packet];
    const saveResult = saveP2pOfflineQueue(nextQueue);
    const actualPersistedQueue = getP2pOfflineQueue();

    const conn = this.connections.get(target);
    if (conn && conn.open) {
      conn.send(packet);
      return {
        queued: false,
        sentImmediately: true,
        storageError: !saveResult.ok,
        warning: saveResult.ok ? null : saveResult.error,
        queueId,
        pendingCount: actualPersistedQueue.length,
        packet,
      };
    }

    if (!saveResult.ok) {
      return {
        queued: false,
        sentImmediately: false,
        storageError: true,
        error: saveResult.error,
        queueId,
        pendingCount: actualPersistedQueue.length,
        packet,
      };
    }

    return {
      queued: true,
      sentImmediately: false,
      storageError: false,
      queueId,
      pendingCount: actualPersistedQueue.length,
      packet,
    };
  }

  flushOfflineQueue(hostRoomId) {
    const target = String(hostRoomId || '').trim().toUpperCase();
    const conn = this.connections.get(target);
    if (!conn || !conn.open) return 0;
    const queue = getP2pOfflineQueue().filter((p) => !p.targetRoomId || p.targetRoomId === target);
    for (const pkt of queue) {
      conn.send(pkt);
    }
    return queue.length;
  }

  sendInvoiceToHost(hostRoomId, invoicePayload) {
    return this.pushBillSafe(hostRoomId, invoicePayload);
  }

  disconnectAll() {
    this.stoppedManually = true;
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.reconnectTimer);
    for (const c of this.connections.values()) {
      try { c.close(); } catch { /* ignore */ }
    }
    this.connections.clear();
    this.authenticatedPeers.clear();
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.peer = null;
  }
}
