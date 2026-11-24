// Hardened Browser-Native WebRTC P2P Mobile-to-PC Live Billing & Stock Sync Engine (v3.3.0)
// Includes:
// 1. 4-Digit Counter Security PIN Handshake
// 2. Durable Offline Sync Queue (bharatgst_p2p_offline_queue) — zero lost orders if 5G drops
// 3. Automatic 10s PING/PONG Heartbeat + 3s Auto-Reconnect + Signaling Reconnect + Queue Auto-Flush
// 4. Idempotent queueId De-Duplication on Counter PC
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

export const P2P_QUEUE_STORAGE_KEY = 'bharatgst_p2p_offline_queue';

const memoryQueueFallback = [];

function getStorage() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch { /* ignore */ }
  return null;
}

export function getP2pOfflineQueue() {
  const st = getStorage();
  if (!st) return [...memoryQueueFallback];
  try {
    const parsed = JSON.parse(st.getItem(P2P_QUEUE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveP2pOfflineQueue(queue = []) {
  const clean = Array.isArray(queue) ? queue : [];
  const st = getStorage();
  if (!st) {
    memoryQueueFallback.length = 0;
    memoryQueueFallback.push(...clean);
    return;
  }
  try {
    st.setItem(P2P_QUEUE_STORAGE_KEY, JSON.stringify(clean));
  } catch { /* quota */ }
}

export function removeP2pQueueItem(queueId) {
  const updated = getP2pOfflineQueue().filter((item) => item?.queueId !== queueId);
  saveP2pOfflineQueue(updated);
  return updated;
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
    pin: randomDigits(4),
  };
}

export function buildP2pPairingUrl(baseHref = '', { roomId = '', pin = '' } = {}) {
  try {
    const u = new URL(baseHref || 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/');
    u.searchParams.set('view', 'reports');
    u.searchParams.set('p2p', String(roomId).trim().toUpperCase());
    if (pin) u.searchParams.set('pin', String(pin).trim());
    return u.toString();
  } catch {
    return `?view=reports&p2p=${encodeURIComponent(roomId)}&pin=${encodeURIComponent(pin)}`;
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
 * Builds a complete GST-compliant invoice / sales order payload on the Mobile Staff Order Pad.
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

  let taxableSubtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;

  const normalizedItems = (Array.isArray(items) ? items : [])
    .filter((it) => it && (Number(it.quantity ?? it.qty ?? 0) > 0))
    .map((it) => {
      const quantity = Number(it.quantity ?? it.qty ?? 1);
      const price = r2(Number(it.price ?? it.rate ?? 0));
      const gstRate = Number(it.gstRate ?? it.taxRate ?? 0) || 0;
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
        price,
        gstRate,
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

  return {
    invoiceNumber: finalInvNo,
    invoiceDate: today,
    clientName: String(customerName || 'Walk-in Customer').trim() || 'Walk-in Customer',
    clientGstin: cleanGstin,
    totalAmount: grandTotal,
    amountPaid: 0,
    status: 'unpaid',
    data: {
      invoiceType: docType,
      invoiceNumber: finalInvNo,
      invoiceDate: today,
      client: {
        name: String(customerName || 'Walk-in Customer').trim() || 'Walk-in Customer',
        phone: String(customerPhone || '').trim(),
        gstin: cleanGstin,
        state: inferredBuyerState,
      },
      items: normalizedItems,
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
    this.seenQueueIds = new Map(); // queueId -> saved invoiceNumber (idempotency guard)
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
    const creds = roomId && pin ? { roomId, pin } : generateP2pCredentials();
    const { default: Peer } = await import('peerjs');

    this.peer = new Peer(creds.roomId, {
      config: { iceServers: DEFAULT_ICE_SERVERS },
    });

    this.peer.on('open', (id) => {
      onStatus?.({ state: 'HOST_READY', message: `Host ready on ${id} (PIN: ${creds.pin})`, peerId: id });
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
          if (String(msg.pin || '').trim() !== String(creds.pin).trim()) {
            conn.send({ type: 'AUTH_DENIED', reason: 'Incorrect 4-digit Counter PIN' });
            onStatus?.({ state: 'AUTH_REJECTED', message: `Blocked unauthorized peer ${conn.peer} (wrong PIN)` });
            setTimeout(() => conn.close(), 300);
            return;
          }
          this.authenticatedPeers.add(conn.peer);
          const catalog = getCatalog();
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
          conn.send({ type: 'AUTH_DENIED', reason: 'Authenticate with PIN first' });
          return;
        }

        if (msg.type === 'PING') {
          conn.send({ type: 'PONG', ts: Date.now() });
          return;
        }

        if (msg.type === 'PULL_CATALOG') {
          conn.send({ type: 'CATALOG_SNAPSHOT', shopName, catalog: getCatalog() });
          return;
        }

        if (msg.type === 'SYNC_INVOICE' && msg.invoice) {
          // Idempotent deduplication for retried offline-queue packets
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
            if (msg.queueId) this.seenQueueIds.set(msg.queueId, savedNo);
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
        onStatus?.({ state: 'AUTHENTICATING', message: `Connected to ${target}, verifying PIN…` });
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
          onStatus?.({ state: 'RECONNECTING_IN_3S', message: '5G/Wi-Fi link dropped — auto-reconnecting in 3s (offline queue safe)…' });
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
      onStatus?.({ state: 'ERROR', message: err?.message || 'Could not reach Counter PC — queued bills remain safe offline' });
    });
  }

  /**
   * Queue-Safe Bill Push: saves to durable local Offline Queue BEFORE transmitting.
   * Never loses an order even if 5G drops mid-click; flushes automatically on reconnect!
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

    const queue = getP2pOfflineQueue();
    queue.push(packet);
    saveP2pOfflineQueue(queue);

    const conn = this.connections.get(target);
    if (conn && conn.open) {
      conn.send(packet);
      return { queued: false, sentImmediately: true, queueId, pendingCount: queue.length };
    }
    return { queued: true, sentImmediately: false, queueId, pendingCount: queue.length };
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

  // Backward-compatible alias using queue-safe delivery
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
