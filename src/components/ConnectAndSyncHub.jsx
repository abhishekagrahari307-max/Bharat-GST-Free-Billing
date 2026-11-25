import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Store,
  HardDrive,
  CheckCircle2,
  Wifi,
  Copy,
  Send,
  RefreshCw,
  Download,
  Cpu,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import PageHeader from './PageHeader';
import EnterpriseAiHub from './EnterpriseAiHub';
import {
  getAllBills,
  getAllPurchases,
  getAllExpenses,
  getAllProducts,
  getProfile,
  saveBill,
  exportAllData,
  DATA_SAVED_EVENT,
} from '../store';
import { formatCurrency } from '../utils';
import {
  WebRtcP2pController,
  buildP2pPairingUrl,
  parseP2pParamsFromSearch,
  scrubPinFromBrowserUrl,
  mapProductsToP2pCatalog,
  buildP2pInvoicePayload,
  getP2pOfflineQueue,
} from '../utils/webrtcP2pSync';
import { generateServerlessCatalogLink } from '../utils/autonomousMunimAnd43B';
import { buildShareableB2bCatalogHtml } from '../utils/fifoAndCatalog';
import {
  supportsBrowserFolderBackup,
  pickBrowserBackupDirectory,
  getSavedBrowserBackupDirectory,
  writeBackupToBrowserDirectory,
  readBackupMeta,
  recordBackupCompleted,
} from '../utils/backupManager';
import { triggerTrackedBrowserDownload } from '../utils/trackedDownload';
import { startOperation, updateOperation, finishOperation } from '../utils/operationRegistry';
import { toast } from './Toast';

/**
 * Dedicated Connect & Multi-Device Sync Center (v5.4.0)
 * Sidebar Section: CONNECT & SYNC -> "Mobile ↔ PC Sync & B2B"
 * Implements the clean 3+1 Segmented Sub-Tabs & Step-by-Step Guided Flow:
 *  1. Mobile ↔ Laptop Live Sync (5G WebRTC Host QR + 6-Digit PIN + Client Cart + Offline Queue)
 *  2. WhatsApp B2B Storefront (fflate-compressed #b2b-catalog=z. URL + Offline HTML Catalog)
 *  3. PC Folder & Auto-Backup (BharatGST-Live-Mirror.json via File System Access API + Settings Health)
 *  4. Scale, POS & Tally Import (WebSerial Weighing Scale, Silent USB POS & Tally/Vyapar Importer)
 */
export default function ConnectAndSyncHub({
  activeProfile = null,
  onOpenSettingsData,
  onOpenAllNewFunctions,
  onP2pConnectionChange,
}) {
  const initialP2p = useMemo(
    () => (typeof window !== 'undefined' ? parseP2pParamsFromSearch(window.location.search) : null),
    []
  );

  const [activeTab, setActiveTab] = useState('P2P'); // 'P2P' | 'CATALOG' | 'MIRROR' | 'HARDWARE'
  const [deviceRole, setDeviceRole] = useState(() => (initialP2p ? 'CLIENT' : 'HOST'));

  // Workspace data
  const [bills, setBills] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [products, setProducts] = useState([]);
  const [ownerProfile, setOwnerProfile] = useState(activeProfile);

  const reloadData = useCallback(async () => {
    try {
      const [b, pur, exp, prod, prof] = await Promise.all([
        getAllBills(),
        getAllPurchases(),
        getAllExpenses(),
        getAllProducts(),
        activeProfile ? Promise.resolve(activeProfile) : getProfile(),
      ]);
      setBills(Array.isArray(b) ? b : []);
      setPurchases(Array.isArray(pur) ? pur : []);
      setExpenses(Array.isArray(exp) ? exp : []);
      setProducts(Array.isArray(prod) ? prod : []);
      if (prof) setOwnerProfile(prof);
    } catch { /* ignore transient read */ }
  }, [activeProfile]);

  useEffect(() => {
    reloadData();
    const onSaved = () => reloadData();
    window.addEventListener(DATA_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(DATA_SAVED_EVENT, onSaved);
  }, [reloadData]);

  // 1. Live 5G WebRTC P2P State
  const p2pRef = useRef(null);
  const p2pOpsRef = useRef({});
  const [hostCreds, setHostCreds] = useState(null);
  const [p2pQrUrl, setP2pQrUrl] = useState('');
  const [p2pState, setP2pState] = useState('IDLE');
  const [remoteRoomId, setRemoteRoomId] = useState(() => initialP2p?.roomId || '');
  const [inputPin, setInputPin] = useState(() => initialP2p?.pin || '');
  const [receivedCount, setReceivedCount] = useState(0);
  const [syncedProducts, setSyncedProducts] = useState([]);
  const [p2pCart, setP2pCart] = useState({});
  const [customerName, setCustomerName] = useState('');
  const [offlineQueue, setOfflineQueue] = useState(() => getP2pOfflineQueue());

  useEffect(() => {
    if (initialP2p?.pin) scrubPinFromBrowserUrl();
    return () => {
      if (p2pRef.current) p2pRef.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPeerConnected = p2pState === 'AUTHENTICATED' || p2pState === 'READY';
  useEffect(() => {
    onP2pConnectionChange?.(p2pState === 'AUTHENTICATED');
  }, [p2pState, onP2pConnectionChange]);

  const startHostSession = async () => {
    try {
      if (p2pRef.current) p2pRef.current.destroy();
      const ctrl = new WebRtcP2pController({
        onStatus: (st) => setP2pState(st.state),
        onCatalogRequested: () => mapProductsToP2pCatalog(products),
        onBillReceived: async (billPayload) => {
          await saveBill(billPayload);
          setReceivedCount((c) => c + 1);
          window.dispatchEvent(new Event(DATA_SAVED_EVENT));
          toast(
            `📱 Mobile Bill #${billPayload.invoiceNumber} (${formatCurrency(billPayload.totalAmount)}) saved on Counter PC!`,
            'success'
          );
        },
      });
      p2pRef.current = ctrl;
      setP2pState('CONNECTING');
      const creds = await ctrl.startHost();
      setHostCreds(creds);
      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      const pairUrl = buildP2pPairingUrl(baseUrl, creds.roomId, creds.pin);
      const qr = await QRCode.toDataURL(pairUrl, { width: 190, margin: 1 });
      setP2pQrUrl(qr);
      toast(`Counter PC Host Ready — 6-Digit PIN: ${creds.pin}`, 'success');
    } catch (err) {
      setP2pState('ERROR');
      toast(err?.message || 'Could not start 5G P2P Host', 'error');
    }
  };

  const connectMobileClient = async () => {
    if (!remoteRoomId.trim() || inputPin.trim().length < 4) {
      toast('Laptop ka Counter ID (ya QR scan) aur 6-Digit PIN dono dalein.', 'warning');
      return;
    }
    try {
      if (p2pRef.current) p2pRef.current.destroy();
      const ctrl = new WebRtcP2pController({
        onStatus: (st) => {
          setP2pState(st.state);
          setOfflineQueue(getP2pOfflineQueue());
          if (st.state === 'AUTH_FAILED') {
            toast(st.detail || 'Invalid PIN', 'error');
          }
        },
        onCatalogSynced: (items) => {
          setSyncedProducts(items);
          toast(`Connected! ${items.length} items synced from Counter Laptop.`, 'success');
        },
        onAck: (msg) => {
          setOfflineQueue(getP2pOfflineQueue());
          const opId = msg.queueId && p2pOpsRef.current[msg.queueId];
          if (opId) {
            finishOperation(opId, {
              status: 'success',
              phase: `Saved on Counter Laptop (#${msg.invoiceNumber})`,
            });
            delete p2pOpsRef.current[msg.queueId];
          }
          toast(`✅ Laptop confirmed Bill #${msg.invoiceNumber} saved!`, 'success');
        },
      });
      p2pRef.current = ctrl;
      setP2pState('CONNECTING');
      await ctrl.connectToHost(remoteRoomId.trim().toUpperCase(), inputPin.trim());
    } catch (err) {
      setP2pState('ERROR');
      toast(err?.message || 'Connection failed — check internet/PIN', 'error');
    }
  };

  const pushQuickMobileOrder = () => {
    const list = syncedProducts.length > 0 ? syncedProducts : mapProductsToP2pCatalog(products);
    const chosen = list
      .map((it, idx) => ({ ...it, quantity: Number(p2pCart[it.id || idx] || 0) }))
      .filter((it) => it.quantity > 0);
    if (!chosen.length) {
      toast('कम से कम 1 आइटम की मात्रा (Qty > 0) चुनें।', 'warning');
      return;
    }
    const payload = buildP2pInvoicePayload({
      docType: 'tax-invoice',
      customerName: customerName.trim() || 'Walk-in Customer',
      sellerState: String(ownerProfile?.gstin || '').slice(0, 2),
      items: chosen,
    });
    const opId = startOperation({
      category: 'p2p',
      label: `Mobile Bill #${payload.invoiceNumber}`,
      phase: 'Sending to Counter Laptop…',
      destination: 'Counter Laptop (5G P2P)',
    });
    if (!p2pRef.current) {
      finishOperation(opId, { status: 'failed', error: 'Connect to Counter Laptop first' });
      return;
    }
    const res = p2pRef.current.pushBillSafe(remoteRoomId, payload);
    if (res.queueId) p2pOpsRef.current[res.queueId] = opId;
    setOfflineQueue(getP2pOfflineQueue());
    if (res.sentImmediately) {
      setP2pCart({});
      updateOperation(opId, { status: 'waiting', phase: 'Sent — awaiting Counter Laptop ACK…' });
    } else if (!res.storageError) {
      setP2pCart({});
      updateOperation(opId, {
        status: 'waiting',
        phase: `Queued offline (${res.pendingCount} pending) — auto-syncs on reconnect`,
      });
      toast(`नेटवर्क स्लो है — बिल ऑफ़लाइन क्यू में सुरक्षित (${res.pendingCount} pending)!`, 'info');
    }
  };

  // 2. WhatsApp B2B Storefront State
  const [catalogUrl, setCatalogUrl] = useState('');
  const handleCopyCatalogLink = async () => {
    if (!products.length) {
      toast('पहले Products में कम से कम 1 आइटम जोड़ें (या SOS → Demo Store लोड करें)।', 'warning');
      return;
    }
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const link = generateServerlessCatalogLink(
      baseUrl,
      ownerProfile || { businessName: 'My Store' },
      products
    );
    setCatalogUrl(link);
    try {
      await navigator.clipboard.writeText(link);
      toast('✅ WhatsApp B2B Storefront लिंक कॉपी हो गया!', 'success');
    } catch {
      toast('नीचे दिया गया B2B लिंक कॉपी करें।', 'info');
    }
  };

  const handleDownloadOfflineHtmlCatalog = () => {
    const html = buildShareableB2bCatalogHtml({
      businessName: ownerProfile?.businessName || 'My Business',
      phone: ownerProfile?.phone || '',
      gstin: ownerProfile?.gstin || '',
      products,
    });
    triggerTrackedBrowserDownload({
      content: html,
      mimeType: 'text/html;charset=utf-8',
      filename: `${(ownerProfile?.businessName || 'Store').replace(/[^a-zA-Z0-9]+/g, '-')}-B2B-Catalog.html`,
      category: 'catalog',
      label: 'Shareable HTML B2B Catalog',
    });
  };

  // 3. PC Hard-Drive Live Mirror State
  const [folderConnected, setFolderConnected] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [mirrorBusy, setMirrorBusy] = useState(false);
  const backupMeta = useMemo(() => readBackupMeta(), [folderConnected]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const handle = await getSavedBrowserBackupDirectory();
        if (alive && handle) {
          setFolderConnected(true);
          setFolderName(handle.name || 'Selected PC Folder');
        }
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  const handleConnectPcFolder = async () => {
    if (!supportsBrowserFolderBackup()) {
      toast('PC Folder Live Mirror डेस्कटॉप Chrome, Edge या Brave ब्राउज़र में उपलब्ध है। आप सामान्य JSON बैकअप नीचे से डाउनलोड कर सकते हैं।', 'info');
      return;
    }
    try {
      setMirrorBusy(true);
      const picked = await pickBrowserBackupDirectory();
      if (!picked) return;
      const dirName = picked.name || 'PC Backup Folder';
      setFolderConnected(true);
      setFolderName(dirName);
      const opId = startOperation({
        category: 'backup',
        label: 'PC Folder Live Mirror Sync',
        phase: 'Writing BharatGST-Live-Mirror.json to selected PC folder…',
        destination: dirName,
      });
      const snapshot = await exportAllData();
      await writeBackupToBrowserDirectory(
        'BharatGST-Live-Mirror.json',
        JSON.stringify(snapshot, null, 2),
        { interactive: true }
      );
      recordBackupCompleted({ method: 'folder', destination: dirName });
      finishOperation(opId, {
        status: 'success',
        phase: `Live mirror updated in "${dirName}"`,
      });
      toast(`✅ PC Folder "${dirName}" जुड़ गया और लाइव बैकअप सेव हो गया!`, 'success');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        toast(err?.message || 'PC फ़ोल्डर कनेक्ट नहीं हो सका', 'error');
      }
    } finally {
      setMirrorBusy(false);
    }
  };

  const handleDownloadJsonBackupNow = async () => {
    const snapshot = await exportAllData();
    triggerTrackedBrowserDownload({
      content: JSON.stringify(snapshot, null, 2),
      mimeType: 'application/json',
      filename: `BharatGST-Backup-${new Date().toISOString().slice(0, 10)}.json`,
      category: 'backup',
      label: 'Full JSON Books Backup',
    });
  };

  const availableMobileItems =
    syncedProducts.length > 0 ? syncedProducts : mapProductsToP2pCatalog(products);

  return (
    <div className="dashboard-container">
      <PageHeader
        title="Connect & Multi-Device Sync"
        subtitle="Mobile ↔ Laptop 5G Live Sync, WhatsApp B2B Storefront, PC Folder Mirror & POS Hardware"
        meta={p2pState === 'AUTHENTICATED' ? '📱 Paired & Live' : '6-Digit PIN · Zero Server'}
        primary={
          onOpenAllNewFunctions ? (
            <button type="button" className="btn-gradient" onClick={onOpenAllNewFunctions}>
              <Sparkles size={15} /> All New Functions Hub
            </button>
          ) : null
        }
      />

      {/* Clean Segmented Sub-Tabs */}
      <div
        className="pro-card"
        style={{
          padding: '14px 18px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.06rem', fontWeight: 700 }}>
            Connect &amp; Multi-Device Sync Center
          </h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Mobile billing sync, WhatsApp B2B catalog, PC hard-drive mirror aur POS hardware ek hi jagah
          </p>
        </div>

        <div className="segmented-tabs" role="tablist" aria-label="Connect and Sync sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'P2P'}
            onClick={() => setActiveTab('P2P')}
            className={`segmented-tab${activeTab === 'P2P' ? ' active' : ''}`}
          >
            <Smartphone size={15} /> 1. Mobile ↔ Laptop Sync
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'CATALOG'}
            onClick={() => setActiveTab('CATALOG')}
            className={`segmented-tab${activeTab === 'CATALOG' ? ' active' : ''}`}
          >
            <Store size={15} /> 2. WhatsApp B2B Storefront
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'MIRROR'}
            onClick={() => setActiveTab('MIRROR')}
            className={`segmented-tab${activeTab === 'MIRROR' ? ' active' : ''}`}
          >
            <HardDrive size={15} /> 3. PC Folder &amp; Auto-Backup
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'HARDWARE'}
            onClick={() => setActiveTab('HARDWARE')}
            className={`segmented-tab${activeTab === 'HARDWARE' ? ' active' : ''}`}
          >
            <Cpu size={15} /> 4. Scale, POS &amp; Tally Import
          </button>
        </div>
      </div>

      {/* TAB 1: MOBILE <-> LAPTOP LIVE P2P SYNC */}
      {activeTab === 'P2P' && (
        <div className="pro-card" style={{ padding: '20px' }}>
          {/* Connection Status Banner */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '8px',
              padding: '11px 15px',
              borderRadius: '10px',
              background:
                p2pState === 'AUTHENTICATED'
                  ? 'rgba(16, 185, 129, 0.14)'
                  : isPeerConnected
                    ? 'rgba(37, 99, 235, 0.12)'
                    : 'var(--bg-subtle, #f1f5f9)',
              color:
                p2pState === 'AUTHENTICATED'
                  ? '#059669'
                  : isPeerConnected
                    ? '#2563eb'
                    : 'var(--text-primary)',
              marginBottom: '18px',
              fontSize: '0.84rem',
              fontWeight: 700,
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              {p2pState === 'AUTHENTICATED' ? <CheckCircle2 size={17} /> : <Wifi size={17} />}
              {p2pState === 'AUTHENTICATED'
                ? `Connected & Verified — Live 5G Sync Active (${receivedCount} mobile bill(s) received)`
                : p2pState === 'READY'
                  ? `Host Waiting for Mobile Pairing — Counter ID: ${hostCreds?.roomId}`
                  : 'Status: Ready to Pair (दोनों डिवाइस पर इंटरनेट/हॉटस्पॉट चालू रखें)'}
            </span>
            {offlineQueue.length > 0 && (
              <span className="exec-status-pill exec-status-offline">
                📦 Offline Queue: {offlineQueue.length} pending
              </span>
            )}
          </div>

          {/* Step 1: Choose Device Role */}
          <div style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '8px' }}>
              Step 1: यह डिवाइस कौन-सा है? (Choose Device Role)
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDeviceRole('HOST')}
                className={`btn btn-sm ${deviceRole === 'HOST' ? 'btn-primary' : 'btn-secondary'}`}
              >
                💻 यह Counter Laptop / Main PC है (Host)
              </button>
              <button
                type="button"
                onClick={() => setDeviceRole('CLIENT')}
                className={`btn btn-sm ${deviceRole === 'CLIENT' ? 'btn-primary' : 'btn-secondary'}`}
              >
                📱 यह Staff / Salesman Mobile है (Client)
              </button>
            </div>
          </div>

          {/* Step 2: Host vs Client Guided Flow */}
          {deviceRole === 'HOST' ? (
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                background: 'var(--bg-subtle, #f8fafc)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
              }}
            >
              <div style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: '8px' }}>
                Step 2: Counter Host शुरू करें और मोबाइल से QR स्कैन करें (या 6-Digit PIN डालें)
              </div>

              {!hostCreds ? (
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={startHostSession}
                    className="btn-gradient"
                    disabled={p2pState === 'CONNECTING'}
                  >
                    <Smartphone size={16} />
                    {p2pState === 'CONNECTING'
                      ? 'Starting Counter Host…'
                      : '🚀 Start Counter Laptop Host & Generate 6-Digit PIN'}
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '20px',
                    flexWrap: 'wrap',
                    marginTop: '12px',
                  }}
                >
                  {p2pQrUrl && (
                    <img
                      src={p2pQrUrl}
                      alt="Scan QR on Staff Mobile to pair"
                      style={{
                        width: 152,
                        height: 152,
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        padding: '6px',
                      }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      Counter Room ID: <strong>{hostCreds.roomId}</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '10px 0', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '1.55rem',
                          fontWeight: 800,
                          letterSpacing: '4px',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          border: '1px dashed #3b82f6',
                        }}
                      >
                        {hostCreds.pin}
                      </span>
                      <button
                        type="button"
                        onClick={startHostSession}
                        className="btn btn-secondary btn-xs"
                      >
                        <RefreshCw size={13} /> नया PIN बनाएँ
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={async () => {
                          const baseUrl = `${window.location.origin}${window.location.pathname}`;
                          const url = buildP2pPairingUrl(baseUrl, hostCreds.roomId, hostCreds.pin);
                          await navigator.clipboard.writeText(url).catch(() => {});
                          toast('मोबाइल पेयरिंग लिंक कॉपी हो गया!', 'success');
                        }}
                      >
                        <Copy size={13} /> Copy Pair Link
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      मोबाइल के कैमरे से यह QR स्कैन करें (या मोबाइल में <strong>Connect &amp; Sync → Mobile (Client)</strong> खोलकर ऊपर दिया गया Counter ID और 6-Digit PIN डालें)। मोबाइल से बने सभी बिल सीधे इस लैपटॉप पर सेव होंगे!
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                padding: '16px',
                borderRadius: '12px',
                background: 'var(--bg-subtle, #f8fafc)',
                border: '1px solid var(--border-subtle, #e2e8f0)',
              }}
            >
              <div style={{ fontSize: '0.86rem', fontWeight: 700, marginBottom: '10px' }}>
                Step 2: लैपटॉप स्क्रीन पर दिख रहा Counter Room ID और 6-Digit PIN डालें
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  value={remoteRoomId}
                  onChange={(e) => setRemoteRoomId(e.target.value.trim().toUpperCase())}
                  placeholder="Counter ID (e.g. BGST-AB12CD)"
                  className="form-input"
                  style={{ width: '210px', fontWeight: 700 }}
                />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={inputPin}
                  onChange={(e) => setInputPin(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="6-Digit PIN"
                  className="form-input"
                  style={{ width: '140px', letterSpacing: '3px', fontWeight: 800 }}
                />
                <button
                  type="button"
                  onClick={connectMobileClient}
                  disabled={inputPin.length < 4 || !remoteRoomId.trim()}
                  className="btn-gradient"
                >
                  🔗 Connect to Laptop
                </button>
              </div>

              {/* Quick Mobile Salesman Order Pad */}
              {availableMobileItems.length > 0 && (
                <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.84rem', marginBottom: '8px' }}>
                    Step 3: ग्राहक का नाम और आइटम चुनकर सीधे Counter Laptop पर बिल भेजें
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="ग्राहक का नाम (वैकल्पिक)"
                      className="form-input"
                      style={{ maxWidth: '260px' }}
                    />
                    <button type="button" className="btn btn-primary btn-sm" onClick={pushQuickMobileOrder}>
                      <Send size={14} /> Counter Laptop पर बिल भेजें
                    </button>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                      gap: '8px',
                      maxHeight: '220px',
                      overflowY: 'auto',
                    }}
                  >
                    {availableMobileItems.slice(0, 40).map((it, idx) => {
                      const key = it.id || idx;
                      const qty = Number(p2pCart[key] || 0);
                      return (
                        <div
                          key={key}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-subtle)',
                            background: 'var(--bg-card)',
                            fontSize: '0.79rem',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700 }}>{it.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {formatCurrency(it.sellingPrice || it.price || 0)} · GST {it.taxPercent ?? 0}%
                            </div>
                          </div>
                          <input
                            type="number"
                            min="0"
                            value={qty || ''}
                            placeholder="0"
                            onChange={(e) =>
                              setP2pCart((prev) => ({
                                ...prev,
                                [key]: Math.max(0, Number(e.target.value) || 0),
                              }))
                            }
                            className="form-input"
                            style={{ width: '64px', padding: '4px 6px', textAlign: 'center' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: WHATSAPP B2B STOREFRONT */}
      {activeTab === 'CATALOG' && (
        <div className="pro-card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700 }}>
            Serverless WhatsApp B2B Storefront (`#b2b-catalog=z.`)
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            अपने ग्राहकों और डीलर्स को बिना कोई ऐप इंस्टॉल करवाए लाइव रेट-लिस्ट भेजें ({products.length} आइटम उपलब्ध)। ग्राहक आइटम चुनकर 1-क्लिक में सीधा आपके WhatsApp पर ऑर्डर भेज सकता है।
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={handleCopyCatalogLink} className="btn-gradient">
              <Copy size={15} /> Copy B2B Storefront Link
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                if (!products.length) {
                  toast('पहले Products में कम से कम 1 आइटम जोड़ें।', 'warning');
                  return;
                }
                const baseUrl = `${window.location.origin}${window.location.pathname}`;
                const link = generateServerlessCatalogLink(
                  baseUrl,
                  ownerProfile || { businessName: 'My Store' },
                  products
                );
                setCatalogUrl(link);
                const msg = `🛒 *${ownerProfile?.businessName || 'हमारी दुकान'} — ऑनलाइन रेट लिस्ट व ऑर्डर लिंक:*\nनीचे क्लिक करके आइटम चुनें और सीधे WhatsApp पर ऑर्डर भेजें:\n${link}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
              }}
            >
              <Send size={14} /> Share Storefront on WhatsApp
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadOfflineHtmlCatalog}
            >
              <Download size={14} /> Download Offline HTML Catalog
            </button>
          </div>

          {catalogUrl && (
            <div
              style={{
                marginTop: '14px',
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.75rem',
                wordBreak: 'break-all',
                color: 'var(--text-secondary)',
              }}
            >
              <strong>Generated Link:</strong> {catalogUrl}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PC HARD-DRIVE LIVE MIRROR & AUTO-BACKUP */}
      {activeTab === 'MIRROR' && (
        <div className="pro-card" style={{ padding: '20px' }}>
          <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700 }}>
            PC Hard-Drive Auto-Mirror (`BharatGST-Live-Mirror.json`)
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            हर बिल सेव होते ही आपके कंप्यूटर के चुने हुए फ़ोल्डर में एक लाइव बैकअप फ़ाइल अपने-आप अपडेट होती रहेगी — ब्राउज़र कैश साफ़ होने पर भी आपका डेटा 100% सुरक्षित रहेगा।
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px',
              fontSize: '0.8rem',
              color: folderConnected ? '#059669' : 'var(--text-secondary)',
              fontWeight: 600,
            }}
          >
            <HardDrive size={16} />
            {folderConnected
              ? `✅ Connected PC Folder: "${folderName}"${backupMeta?.lastBackupAt ? ` · Last synced: ${new Date(backupMeta.lastBackupAt).toLocaleString('en-IN')}` : ''}`
              : 'अभी कोई लाइव PC फ़ोल्डर नहीं चुना गया है।'}
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleConnectPcFolder}
              disabled={mirrorBusy}
              className="btn-gradient"
            >
              <HardDrive size={15} />
              {folderConnected ? '✅ PC Folder Connected (Change / Sync Now)' : '📁 Select PC Backup Folder'}
            </button>

            <button
              type="button"
              onClick={handleDownloadJsonBackupNow}
              className="btn btn-secondary btn-sm"
            >
              <Download size={14} /> Download Full .json Backup
            </button>

            {onOpenSettingsData && (
              <button
                type="button"
                onClick={onOpenSettingsData}
                className="btn btn-secondary btn-sm"
              >
                <ExternalLink size={14} /> Settings → Data, .fgsb Vault &amp; System Health
              </button>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: WEIGHING SCALE, THERMAL POS & TALLY/VYAPAR IMPORT */}
      {activeTab === 'HARDWARE' && (
        <EnterpriseAiHub
          bills={bills}
          purchases={purchases}
          expenses={expenses}
          products={products}
          ownerProfile={ownerProfile}
          initialSection="hardware"
          onBillsUpdated={reloadData}
          onProductsUpdated={reloadData}
        />
      )}
    </div>
  );
}
