import { useState, useMemo, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Sparkles, ShieldAlert, SearchCheck, TrendingUp, Cpu, ShoppingBag,
  Upload, Download, CheckCircle2, MessageCircle, Scale, Printer, Smartphone, Send, RefreshCw, Database,
  FileSpreadsheet, Warehouse, Brain, CalendarCheck2, Briefcase,
} from 'lucide-react';
import { saveBill, saveClient, saveProduct, deleteBill, deleteClient, deleteProduct } from '../store';
import { formatCurrency } from '../utils';
import { getIndianFinancialYear } from '../utils/canonicalAdapter';
import { runGstNoticeShield, buildGstr9AndCmp08WorkingPapers } from '../utils/gstNoticeShield';
import { reconcileGstr2bFuzzy } from '../utils/fuzzyGstr2b';
import { forecastCashFlowAndInventory } from '../utils/aiForecaster';
import {
  readWeightFromWebSerial,
  buildEscPosReceiptBytes,
  printSilentEscPosWebUsb,
} from '../utils/hardwareBridge';
import {
  computeFifoPaymentAllocation,
  buildShareableB2bCatalogHtml,
  parseWhatsappCatalogOrder,
} from '../utils/fifoAndCatalog';
import {
  WebRtcP2pController,
  buildP2pPairingUrl,
  parseP2pParamsFromSearch,
  scrubPinFromBrowserUrl,
  mapProductsToP2pCatalog,
  buildP2pInvoicePayload,
  getP2pOfflineQueue,
} from '../utils/webrtcP2pSync';
import {
  parseSpreadsheetMigration,
  parseTallyXmlMigration,
} from '../utils/legacyImporter';
import TableExport from './TableExport';
import AutonomousOsPanels from './AutonomousOsPanels';
import YearEndRolloverPanel from './YearEndRolloverPanel';
import CaMultiClientHubPanel from './CaMultiClientHubPanel';
import {
  GSTR2B_ACTIONS,
  GSTR2B_REASON_CODES,
  loadSaved2bActionMap,
  save2bActionDecision,
  buildUnified2bActionRows,
  computeGstr3bTable4FromActions,
  build2bActionExportTable,
} from '../utils/caReviewerAnd2bActionEngine';
import { triggerTrackedBrowserDownload } from '../utils/trackedDownload';
import { startOperation, updateOperation, finishOperation } from '../utils/operationRegistry';
import { toast } from './Toast';

export default function EnterpriseAiHub({
  bills = [],
  purchases = [],
  expenses = [],
  products = [],
  ownerProfile = null,
  onBillsUpdated,
  onProductsUpdated,
  initialSection = null,
  activeSection = null,
  onSectionChange = null,
  hideTopPills = false,
}) {
  const initialP2p = useMemo(
    () => (typeof window !== 'undefined' ? parseP2pParamsFromSearch(window.location.search) : null),
    []
  );
  const [internalSection, setInternalSection] = useState(() =>
    initialP2p ? 'p2p' : initialSection || 'notice'
  );
  const section = activeSection || internalSection;
  const setSection = (nextSec) => {
    setInternalSection(nextSec);
    if (typeof onSectionChange === 'function') onSectionChange(nextSec);
  };
  const [reconResult, setReconResult] = useState(null);
  const [fyFilter, setFyFilter] = useState(() => getIndianFinancialYear());
  const [saved2bDecisions, setSaved2bDecisions] = useState(() =>
    loadSaved2bActionMap(ownerProfile?.gstin || '')
  );
  const [actionFilter, setActionFilter] = useState('ALL');

  useEffect(() => {
    setSaved2bDecisions(loadSaved2bActionMap(ownerProfile?.gstin || ''));
  }, [ownerProfile?.gstin]);

  const actionRows2b = useMemo(
    () => buildUnified2bActionRows(reconResult, saved2bDecisions),
    [reconResult, saved2bDecisions]
  );

  const table4Summary2b = useMemo(
    () => computeGstr3bTable4FromActions(actionRows2b),
    [actionRows2b]
  );

  const handleUpdate2bRowDecision = (rowKey, patch) => {
    const next = save2bActionDecision(ownerProfile?.gstin || '', rowKey, patch);
    setSaved2bDecisions(next);
  };

  const handleLoadSample2bDemo = () => {
    const sample2b = {
      b2b: [
        {
          ctin: purchases[0]?.supplierGstin || '09AAACV5678B1Z2',
          trdnm: purchases[0]?.supplierName || 'Verma Agro Packaging MSME',
          inv: [
            {
              inum: purchases[0]?.billNumber || 'SUP/26-27/0108',
              dt: purchases[0]?.billDate || new Date().toISOString().slice(0, 10),
              val: Number(purchases[0]?.totalAmount || 17010),
              cgst: 405,
              sgst: 405,
              igst: 0,
            },
            {
              inum: 'UNREC-2B-904',
              dt: new Date().toISOString().slice(0, 10),
              val: 11800,
              cgst: 900,
              sgst: 900,
              igst: 0,
            },
          ],
        },
      ],
    };
    const samplePurchases =
      purchases.length > 0
        ? purchases
        : [
            {
              id: 'DEMO-P-108',
              supplierGstin: '09AAACV5678B1Z2',
              supplierName: 'Verma Agro Packaging MSME',
              billNumber: '108',
              billDate: new Date().toISOString().slice(0, 10),
              totalAmount: 17010,
              cgst: 405,
              sgst: 405,
            },
            {
              id: 'DEMO-P-MISS',
              supplierGstin: '09AAACS9999K1Z1',
              supplierName: 'Gupta Hardware Traders',
              phone: '9876500199',
              billNumber: 'GHT-551',
              billDate: new Date().toISOString().slice(0, 10),
              totalAmount: 5900,
              cgst: 450,
              sgst: 450,
            },
          ];
    const res = reconcileGstr2bFuzzy(sample2b, samplePurchases);
    setReconResult(res);
    toast('Loaded interactive GSTR-2B Action Sheet demo!', 'success');
  };

  // WebRTC P2P Mobile <-> PC Live Sync state
  const p2pRef = useRef(null);
  const [p2pRole, setP2pRole] = useState(() => (initialP2p ? 'CLIENT' : 'HOST'));
  const [hostCreds, setHostCreds] = useState(null);
  const [hostQrDataUrl, setHostQrDataUrl] = useState('');
  const [remoteRoomId, setRemoteRoomId] = useState(() => initialP2p?.roomId || '');
  const [remotePin, setRemotePin] = useState(() => initialP2p?.pin || '');
  const [p2pConnected, setP2pConnected] = useState(false);
  const [p2pRemoteShop, setP2pRemoteShop] = useState('');
  const [p2pRemoteCatalog, setP2pRemoteCatalog] = useState([]);
  const [p2pCart, setP2pCart] = useState({});
  const [p2pCustomerName, setP2pCustomerName] = useState('');
  const [p2pCustomerPhone, setP2pCustomerPhone] = useState('');
  const [p2pCustomerGstin, setP2pCustomerGstin] = useState('');
  const [p2pDocType, setP2pDocType] = useState('Tax Invoice');
  const [p2pLogs, setP2pLogs] = useState([]);
  const [offlineQueue, setOfflineQueue] = useState(() => getP2pOfflineQueue());

  // 1-Click Tally XML & Vyapar Excel Migration state
  const [migrationPreview, setMigrationPreview] = useState(null);
  const [importingLegacy, setImportingLegacy] = useState(false);

  useEffect(() => {
    scrubPinFromBrowserUrl();
    p2pRef.current = new WebRtcP2pController();
    return () => {
      p2pRef.current?.disconnectAll();
    };
  }, []);

  const pushP2pLog = (text) => {
    setP2pLogs((prev) => [`[${new Date().toLocaleTimeString('en-IN')}] ${text}`, ...prev.slice(0, 39)]);
  };

  // FIFO state
  const [fifoParty, setFifoParty] = useState('');
  const [fifoAmount, setFifoAmount] = useState('');
  const [fifoMode, setFifoMode] = useState('UPI');
  const [applyingFifo, setApplyingFifo] = useState(false);

  // B2B Catalog WhatsApp parser state
  const [waOrderText, setWaOrderText] = useState('');

  // Hardware Bridge state
  const [capturedWeight, setCapturedWeight] = useState(null);
  const [selectedBillId, setSelectedBillId] = useState('');

  const activeOwnerGstin = String(ownerProfile?.gstin || '').trim().toUpperCase();

  const noticeShield = useMemo(
    () => runGstNoticeShield({ bills, purchases, expenses, fy: fyFilter, ownerGstin: activeOwnerGstin }),
    [bills, purchases, expenses, fyFilter, activeOwnerGstin]
  );

  const annualPapers = useMemo(
    () => buildGstr9AndCmp08WorkingPapers({ bills, purchases, fy: fyFilter, ownerGstin: activeOwnerGstin }),
    [bills, purchases, fyFilter, activeOwnerGstin]
  );

  const forecast = useMemo(
    () => forecastCashFlowAndInventory({ bills, purchases, expenses, products }),
    [bills, purchases, expenses, products]
  );

  const unpaidClientNames = useMemo(() => {
    const names = new Set();
    for (const b of bills) {
      if (!b || b.cancelled || String(b.status || '').toLowerCase() === 'paid') continue;
      const nm = String(b.clientName || b?.data?.client?.name || '').trim();
      if (nm) names.add(nm);
    }
    return [...names].sort();
  }, [bills]);

  const fifoPreview = useMemo(
    () => computeFifoPaymentAllocation(bills, {
      clientName: fifoParty,
      lumpSumAmount: Number(fifoAmount) || 0,
      paymentMode: fifoMode,
    }),
    [bills, fifoParty, fifoAmount, fifoMode]
  );

  const parsedWaItems = useMemo(
    () => parseWhatsappCatalogOrder(waOrderText, products),
    [waOrderText, products]
  );

  const handleUpload2bJson = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const opId = startOperation({
      category: 'gstr2b',
      label: `GSTR-2B Reconciliation (${file.name})`,
      phase: 'Reading & validating portal GSTR-2B JSON…',
      destination: 'Local Workspace',
    });
    try {
      const json = JSON.parse(await file.text());
      updateOperation(opId, { phase: `Matching against ${purchases.length} purchase records…` });
      const res = reconcileGstr2bFuzzy(json, purchases);
      setReconResult(res);
      finishOperation(opId, {
        status: res.summary.mismatchCount > 0 || res.missingIn2b.length > 0 ? 'partial' : 'success',
        phase: `Reconciled ${res.summary.autoReconciledCount} bills (${res.summary.fuzzyRecoveredCount} fuzzy recovered, ${res.missingIn2b.length} missing in 2B)`,
      });
      toast(
        `Reconciled ${res.summary.autoReconciledCount} bills (${res.summary.fuzzyRecoveredCount} AI fuzzy matches recovered)!`,
        'success'
      );
    } catch (err) {
      finishOperation(opId, { status: 'failed', error: err });
      toast(err?.message || 'Invalid GSTR-2B JSON file', 'error');
    }
  };

  const handleApplyFifoSettlement = async () => {
    if (!fifoPreview.allocations.length) {
      toast('Enter a party with unpaid invoices and a positive lump-sum amount.', 'error');
      return;
    }
    setApplyingFifo(true);
    try {
      for (const alloc of fifoPreview.allocations) {
        const orig = bills.find((b) => b.id === alloc.billId);
        if (!orig) continue;
        const prevPayments = Array.isArray(orig.payments)
          ? orig.payments
          : (Array.isArray(orig?.data?.payments) ? orig.data.payments : []);
        const nextPayments = [...prevPayments, alloc.paymentRecord];
        await saveBill(
          {
            ...orig,
            amountPaid: alloc.newAmountPaid,
            status: alloc.newStatus,
            payments: nextPayments,
            data: {
              ...(orig.data || {}),
              amountPaid: alloc.newAmountPaid,
              status: alloc.newStatus,
              payments: nextPayments,
            },
          },
          { overwrite: true }
        );
      }
      toast(
        `Settled ₹${fifoPreview.totalAllocated.toLocaleString('en-IN')} across ${fifoPreview.allocations.length} invoice(s) on FIFO basis!`,
        'success'
      );
      setFifoAmount('');
      if (typeof onBillsUpdated === 'function') onBillsUpdated();
    } catch (err) {
      toast(err?.message || 'Failed to apply FIFO settlement', 'error');
    } finally {
      setApplyingFifo(false);
    }
  };

  const handleDownloadCatalog = () => {
    const html = buildShareableB2bCatalogHtml(products, ownerProfile || {});
    const filename = `${String(ownerProfile?.businessName || 'Bharat-GST').replace(/[^a-zA-Z0-9_-]+/g, '-')}-B2B-Catalog.html`;
    triggerTrackedBrowserDownload({
      content: html,
      mimeType: 'text/html',
      filename,
      category: 'catalog',
      label: `B2B Digital Catalog HTML (${products.length} items)`,
    });
    toast('Shareable B2B Digital Catalog HTML ready — browser download initiated!', 'success');
  };

  const handleReadScale = async () => {
    try {
      const reading = await readWeightFromWebSerial();
      setCapturedWeight(reading);
      toast(`Live scale weight captured: ${reading.weightKg} kg`, 'success');
    } catch (err) {
      toast(err?.message || 'Could not read from WebSerial scale', 'error');
    }
  };

  const handleSilentThermalPrint = async () => {
    const targetBill = bills.find((b) => String(b.id) === String(selectedBillId)) || bills[0];
    if (!targetBill) {
      toast('Create at least one invoice first to test silent ESC/POS printing.', 'error');
      return;
    }
    try {
      const bytes = buildEscPosReceiptBytes(targetBill, ownerProfile || {});
      const info = await printSilentEscPosWebUsb(bytes);
      toast(`Sent ${info.bytesSent} ESC/POS bytes directly via ${info.transport}!`, 'success');
    } catch (err) {
      toast(err?.message || 'Direct ESC/POS hardware print failed', 'error');
    }
  };

  const handleStartP2pHost = async () => {
    try {
      const creds = await p2pRef.current.startHost({
        shopName: ownerProfile?.businessName || 'Counter PC',
        getCatalog: () => mapProductsToP2pCatalog(products),
        onStatus: (st) => {
          pushP2pLog(st.message);
          if (st.state === 'DEVICE_AUTHENTICATED') toast(st.message, 'success');
        },
        onInvoiceReceived: async (incomingBill) => {
          const saved = await saveBill(incomingBill);
          toast(`📲 Live P2P Bill #${incomingBill.invoiceNumber} received & saved!`, 'success');
          if (typeof onBillsUpdated === 'function') onBillsUpdated();
          return saved;
        },
      });
      setHostCreds(creds);
      const pairUrl = buildP2pPairingUrl(window.location.href, creds);
      const qr = await QRCode.toDataURL(pairUrl, { width: 200, margin: 1 });
      setHostQrDataUrl(qr);
      pushP2pLog(`WebRTC session ${creds.roomId} ready (6-digit PIN active; 5-attempt lockout)…`);
    } catch (err) {
      toast(err?.message || 'Could not start WebRTC Host', 'error');
    }
  };

  const p2pOpsByQueueIdRef = useRef({});

  const handleConnectMobileToPc = async () => {
    try {
      await p2pRef.current.connectToHost({
        hostRoomId: remoteRoomId,
        pin: remotePin,
        deviceName: 'Staff Mobile',
        onStatus: (st) => {
          pushP2pLog(st.message);
          if (st.state === 'CONNECTED_TO_PC') {
            setP2pConnected(true);
            toast(st.message, 'success');
          } else if (st.state === 'AUTH_DENIED' || st.state === 'DISCONNECTED') {
            setP2pConnected(false);
          }
        },
        onCatalogReceived: (cat, shop) => {
          setP2pRemoteCatalog(cat);
          setP2pRemoteShop(shop);
        },
        onAckReceived: (ack) => {
          setOfflineQueue(getP2pOfflineQueue());
          const qOpId = ack?.queueId ? p2pOpsByQueueIdRef.current[ack.queueId] : null;
          if (qOpId) {
            finishOperation(qOpId, {
              status: 'success',
              outcome: 'HOST_ACK_VERIFIED',
              phase: `Host ACK verified — Counter PC saved Bill #${ack.invoiceNumber}`,
            });
            delete p2pOpsByQueueIdRef.current[ack.queueId];
          }
          toast(`✓ Counter PC saved Bill #${ack.invoiceNumber}!`, 'success');
          setP2pCart({});
        },
        onQueueChange: (q) => setOfflineQueue(q),
      });
    } catch (err) {
      toast(err?.message || 'Connection failed', 'error');
    }
  };

  const handleSendMobileOrderToPc = () => {
    const sourceItems = p2pRemoteCatalog.length > 0 ? p2pRemoteCatalog : products;
    const chosen = sourceItems
      .map((it, idx) => ({
        ...it,
        quantity: Number(p2pCart[it.id || idx] || 0),
      }))
      .filter((it) => it.quantity > 0);
    if (!chosen.length) {
      toast('Enter quantity > 0 for at least one item before sending to Counter PC.', 'error');
      return;
    }
    try {
      const payload = buildP2pInvoicePayload({
        docType: p2pDocType,
        customerName: p2pCustomerName || 'Walk-in Customer',
        customerPhone: p2pCustomerPhone,
        customerGstin: p2pCustomerGstin,
        sellerState: String(ownerProfile?.gstin || '').slice(0, 2),
        items: chosen,
      });
      const p2pOpId = startOperation({
        category: 'p2p',
        label: `P2P Order #${payload.invoiceNumber}`,
        phase: 'Queueing & sending to Counter PC…',
        destination: 'Counter PC (WebRTC)',
      });
      const delivery = p2pRef.current.pushBillSafe(remoteRoomId, payload);
      if (delivery.queueId) {
        p2pOpsByQueueIdRef.current[delivery.queueId] = p2pOpId;
      }
      setOfflineQueue(getP2pOfflineQueue());
      if (delivery.sentImmediately) {
        updateOperation(p2pOpId, {
          status: 'waiting',
          phase: `Sent #${payload.invoiceNumber} — awaiting Counter PC save ACK…`,
        });
        pushP2pLog(`Sent ${p2pDocType} #${payload.invoiceNumber} (₹${payload.totalAmount.toFixed(2)}) [${delivery.queueId}]…`);
      } else if (delivery.storageError) {
        finishOperation(p2pOpId, {
          status: 'failed',
          phase: 'Offline queue storage full/blocked — emergency JSON download initiated',
          error: delivery.error,
        });
        pushP2pLog(`❌ STORAGE FULL/BLOCKED — #${payload.invoiceNumber} could NOT be queued offline! Downloading emergency JSON…`);
        toast(delivery.error || 'Device storage full/blocked — downloading emergency JSON backup now!', 'error');
        triggerTrackedBrowserDownload({
          content: JSON.stringify(payload, null, 2),
          mimeType: 'application/json',
          filename: `Emergency-Unsent-P2P-${payload.invoiceNumber}.json`,
          category: 'p2p',
          label: `Emergency Unsent P2P Bill (${payload.invoiceNumber})`,
        });
      } else {
        setP2pCart({});
        updateOperation(p2pOpId, {
          status: 'waiting',
          phase: `Queued offline (${delivery.pendingCount} pending) — waiting for Counter PC reconnect & ACK`,
        });
        pushP2pLog(`Offline Queue verified #${payload.invoiceNumber} [${delivery.queueId}] — will auto-push on reconnect!`);
        toast(`Saved #${payload.invoiceNumber} to Offline Queue (${delivery.pendingCount} pending) — will auto-sync on reconnect!`, 'info');
      }
    } catch (err) {
      toast(err?.message || 'Could not queue bill', 'error');
    }
  };

  const handleLegacyFileSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const lower = file.name.toLowerCase();
      const buf = new Uint8Array(await file.arrayBuffer());
      const parsed = lower.endsWith('.xml')
        ? parseTallyXmlMigration(buf)
        : parseSpreadsheetMigration({ bytes: buf, fileName: file.name });
      setMigrationPreview({ fileName: file.name, ...parsed });
      toast(
        `Parsed ${file.name}: ${parsed.clients.length} Parties, ${parsed.products.length} Stock Items, ${parsed.vouchers.length} Vouchers!`,
        'success'
      );
    } catch (err) {
      toast(err?.message || 'Could not parse Tally/Vyapar file', 'error');
    }
  };

  const handleCommitLegacyImport = async () => {
    if (!migrationPreview) return;
    setImportingLegacy(true);
    const totalEntities =
      migrationPreview.clients.length +
      migrationPreview.products.length +
      migrationPreview.vouchers.length;
    const opId = startOperation({
      category: 'import',
      label: `Import ${migrationPreview.fileName || 'Legacy Data'}`,
      phase: 'Saving imported parties, stock items & vouchers…',
      destination: 'Local Workspace',
      total: Math.max(1, totalEntities),
      completed: 0,
    });
    let doneCount = 0;
    const createdClientIds = [];
    const createdProductIds = [];
    const createdBillIds = [];
    try {
      const existingBillKeys = new Set(
        bills.map((b) => `${String(b.invoiceNumber || '').trim().toLowerCase()}|${String(b.invoiceDate || '').slice(0, 10)}`)
      );
      for (const c of migrationPreview.clients) {
        const savedC = await saveClient(c);
        if (savedC?.id) createdClientIds.push(savedC.id);
        doneCount += 1;
        updateOperation(opId, { completed: doneCount, total: Math.max(1, totalEntities), phase: `Saving party ${createdClientIds.length}/${migrationPreview.clients.length}…` });
      }
      for (const p of migrationPreview.products) {
        const savedP = await saveProduct(p);
        if (savedP?.id) createdProductIds.push(savedP.id);
        doneCount += 1;
        updateOperation(opId, { completed: doneCount, total: Math.max(1, totalEntities), phase: `Saving item ${createdProductIds.length}/${migrationPreview.products.length}…` });
      }
      let skippedDuplicates = 0;
      for (const v of migrationPreview.vouchers) {
        const key = `${String(v.invoiceNumber || '').trim().toLowerCase()}|${String(v.invoiceDate || '').slice(0, 10)}`;
        if (existingBillKeys.has(key)) {
          skippedDuplicates += 1;
          doneCount += 1;
          updateOperation(opId, { completed: doneCount, total: Math.max(1, totalEntities) });
          continue;
        }
        const savedB = await saveBill(v);
        if (savedB?.id) createdBillIds.push(savedB.id);
        existingBillKeys.add(key);
        doneCount += 1;
        updateOperation(opId, { completed: doneCount, total: Math.max(1, totalEntities), phase: `Saving voucher ${createdBillIds.length}…` });
      }
      finishOperation(opId, {
        status: (migrationPreview.warnings?.length || 0) > 0 || skippedDuplicates > 0 ? 'partial' : 'success',
        completed: Math.max(1, totalEntities),
        total: Math.max(1, totalEntities),
        summary: {
          parties: createdClientIds.length,
          items: createdProductIds.length,
          bills: createdBillIds.length,
          skippedDuplicates,
          warnings: migrationPreview.warnings?.length || 0,
        },
        phase: `Imported ${createdClientIds.length} Parties, ${createdProductIds.length} Items & ${createdBillIds.length} Bills${skippedDuplicates ? ` (${skippedDuplicates} duplicate skipped)` : ''}`,
      });
      toast(
        `Imported ${createdClientIds.length} Parties, ${createdProductIds.length} Items & ${createdBillIds.length} Bills${skippedDuplicates ? ` (${skippedDuplicates} duplicate skipped)` : ''}!`,
        'success'
      );
      setMigrationPreview(null);
      if (typeof onBillsUpdated === 'function') onBillsUpdated();
      if (typeof onProductsUpdated === 'function') onProductsUpdated();
    } catch (err) {
      // Atomic best-effort rollback of partially committed migration entities
      for (const id of createdBillIds) await deleteBill(id).catch(() => {});
      for (const id of createdProductIds) await deleteProduct(id).catch(() => {});
      for (const id of createdClientIds) await deleteClient(id).catch(() => {});
      finishOperation(opId, {
        status: 'failed',
        phase: 'Import failed — rolled back partial writes cleanly',
        error: err,
      });
      toast(`Migration failed & rolled back cleanly: ${err?.message || 'Storage error'}`, 'error');
    } finally {
      setImportingLegacy(false);
    }
  };

  return (
    <div>
      {/* Sub-navigation pills (hidden when parent dedicated view provides structured navigation) */}
      {!hideTopPills && (
        <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className={`btn ${section === 'notice' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('notice')}>
              <ShieldAlert size={15} /> GST Notice Shield &amp; GSTR-9
            </button>
            <button type="button" className={`btn ${section === 'fuzzy2b' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('fuzzy2b')}>
              <SearchCheck size={15} /> GSTR-2B Matcher &amp; Action Sheet
            </button>
            <button type="button" className={`btn ${section === 'rollover' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('rollover')}>
              <CalendarCheck2 size={15} /> Year-End FY Rollover
            </button>
            <button type="button" className={`btn ${section === 'cahub' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('cahub')}>
              <Briefcase size={15} /> CA Multi-Client Hub
            </button>
            <button type="button" className={`btn ${section === 'forecast' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('forecast')}>
              <TrendingUp size={15} /> 30-Day Cash &amp; Dead-Stock AI
            </button>
            <button type="button" className={`btn ${section === 'fifo' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('fifo')}>
              <ShoppingBag size={15} /> FIFO Settlement &amp; B2B Catalog
            </button>
            <button type="button" className={`btn ${section === 'hardware' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('hardware')}>
              <Cpu size={15} /> WebSerial Scale &amp; Silent POS
            </button>
            <button type="button" className={`btn ${section === 'p2p' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('p2p')}>
              <Smartphone size={15} /> 5G Mobile-PC P2P Sync
            </button>
            <button type="button" className={`btn ${section === 'migrate' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('migrate')}>
              <Database size={15} /> Tally XML &amp; Vyapar Import
            </button>
            <button type="button" className={`btn ${section === 'itr' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('itr')}>
              <FileSpreadsheet size={15} /> ITR-3/4, AIS &amp; Portal Bridge
            </button>
            <button type="button" className={`btn ${section === 'supplychain' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('supplychain')}>
              <Warehouse size={15} /> Multi-Godown, FEFO &amp; BOM
            </button>
            <button type="button" className={`btn ${section === 'munim' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSection('munim')}>
              <Brain size={15} /> AI Munim, Sec 43B(h) &amp; Storefront
            </button>
          </div>
        </div>
      )}

      {section === 'notice' && (
        <div>
          <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <ShieldAlert size={18} /> AI GST Scrutiny &amp; Notice Prevention Engine
                </h3>
                <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.83rem' }}>
                  Automatically scans books for <b>Section 17(5) Blocked ITC</b>, <b>CGST Rule 37 (180-Day Unpaid Supplier ITC Reversal)</b>, and <b>Rule 138 E-Way Bill (&gt;₹50,000)</b> risks.
                </p>
              </div>
              <span
                style={{
                  padding: '0.35rem 0.8rem',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  background: noticeShield.clean ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.16)',
                  color: noticeShield.clean ? '#059669' : '#d97706',
                }}
              >
                {noticeShield.clean ? '✓ Zero Notice Triggers Found' : `${noticeShield.alerts.length} Compliance Alert(s)`}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.85rem', marginTop: '1rem' }}>
              <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div className="text-muted" style={{ fontSize: '0.76rem' }}>Sec 17(5) Blocked ITC Flagged</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '0.25rem' }}>{formatCurrency(noticeShield.blockedItcAmount)}</div>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div className="text-muted" style={{ fontSize: '0.76rem' }}>Rule 37 (&gt;180d Unpaid) ITC Reversal</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '0.25rem' }}>{formatCurrency(noticeShield.rule37ReversalItc)}</div>
              </div>
              <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div className="text-muted" style={{ fontSize: '0.76rem' }}>Est. 18% Interest Exposure</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem', marginTop: '0.25rem' }}>{formatCurrency(noticeShield.rule37InterestEstimate)}</div>
              </div>
            </div>

            {noticeShield.alerts.length > 0 && (
              <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                <table className="data-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th>Rule / Section</th>
                      <th>Document</th>
                      <th>Party</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Actionable Guidance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noticeShield.alerts.map((a, idx) => (
                      <tr key={idx}>
                        <td className="font-medium">{a.clause}</td>
                        <td>{a.docNo}</td>
                        <td>{a.party}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(a.amountAtRisk)}</td>
                        <td style={{ fontSize: '0.8rem' }}>{a.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* GSTR-9 Annual Working Papers + CMP-08 */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>📑 GSTR-9 Annual Return Working Papers &amp; CMP-08 Summary</h3>
                <select
                  className="form-input"
                  style={{ width: 'auto', padding: '0.25rem 0.55rem', fontSize: '0.78rem' }}
                  value={fyFilter}
                  onChange={(e) => setFyFilter(e.target.value)}
                  aria-label="Financial Year"
                >
                  <option value="2026-27">FY 2026-27</option>
                  <option value="2025-26">FY 2025-26</option>
                  <option value="2024-25">FY 2024-25</option>
                  <option value="ALL">All Financial Years</option>
                </select>
              </div>
              <TableExport
                title="GSTR-9 Annual Working Papers"
                filename="GSTR9-CMP08-Working-Papers"
                subtitle={ownerProfile?.businessName || 'Bharat GST Free Billing'}
                headers={['Table', 'Description', 'Taxable Value (INR)', 'Tax / ITC (INR)']}
                rows={[
                  ['Table 4A', 'Outward Supplies to Unregistered (B2C)', annualPapers.gstr9.table4B2C.taxable, annualPapers.gstr9.table4B2C.tax],
                  ['Table 4B', 'Outward Supplies to Registered (B2B)', annualPapers.gstr9.table4B2B.taxable, annualPapers.gstr9.table4B2B.tax],
                  ['Table 4C', 'Zero-Rated Exports (LUT / SEZ)', annualPapers.gstr9.table4Exports.taxable, 0],
                  ['Table 4I', 'Less: Credit Notes Issued', annualPapers.gstr9.table4CreditNotes.taxable, annualPapers.gstr9.table4CreditNotes.tax],
                  ['Table 4N', 'Net Outward Supplies & Output Tax', annualPapers.gstr9.netOutwardTaxable, annualPapers.gstr9.netOutwardTax],
                  ['Table 6', 'Total Input Tax Credit (ITC) Availed from Purchases', annualPapers.gstr9.table6ItcAvailment.inwardTaxable, annualPapers.gstr9.table6ItcAvailment.totalItc],
                  ['Table 9', 'Net Tax Payable in Cash (Output Tax - ITC)', 0, annualPapers.gstr9.table9NetTaxPayableCash],
                  ['CMP-08', `Composition Quarterly Estimate (${annualPapers.cmp08.ratePct}%)`, annualPapers.cmp08.outwardSuppliesTurnover, annualPapers.cmp08.totalCompositionTax],
                ]}
              />
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Return Table</th>
                    <th>Particulars</th>
                    <th style={{ textAlign: 'right' }}>Taxable Turnover</th>
                    <th style={{ textAlign: 'right' }}>GST / ITC Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td>GSTR-9 Table 4A</td><td>B2C Outward Supplies</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.table4B2C.taxable)}</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.table4B2C.tax)}</td></tr>
                  <tr><td>GSTR-9 Table 4B</td><td>B2B Outward Supplies</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.table4B2B.taxable)}</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.table4B2B.tax)}</td></tr>
                  <tr><td>GSTR-9 Table 4I</td><td>Less: Credit Notes</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.table4CreditNotes.taxable)}</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.table4CreditNotes.tax)}</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>GSTR-9 Table 4N</td><td>Net Outward Taxable &amp; Tax</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.netOutwardTaxable)}</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.netOutwardTax)}</td></tr>
                  <tr><td>GSTR-9 Table 6</td><td>Total Purchase ITC Claimed</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.table6ItcAvailment.inwardTaxable)}</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.table6ItcAvailment.totalItc)}</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>GSTR-9 Table 9</td><td>Net Cash GST Liability</td><td style={{ textAlign: 'right' }}>—</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.gstr9.table9NetTaxPayableCash)}</td></tr>
                  <tr><td>CMP-08</td><td>Composition Tax Summary ({annualPapers.cmp08.ratePct}%)</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.cmp08.outwardSuppliesTurnover)}</td><td style={{ textAlign: 'right' }}>{formatCurrency(annualPapers.cmp08.totalCompositionTax)}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'fuzzy2b' && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <SearchCheck size={18} /> AI Fuzzy GSTR-2B Matcher &amp; CA ITC "Action Taken" Sheet
              </h3>
              <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.83rem' }}>
                Matches supplier invoice numbers (<code>INV/26-27/0045</code> ↔ <code>45</code>), lets you &amp; your CA mark every bill as <strong>Accept / Keep Pending / Defer (Sec 16(2)(aa)) / Reject (Sec 17(5))</strong>, computes live <strong>GSTR-3B Table 4</strong>, and exports the signed ITC Reconciliation Statement.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                <Upload size={16} /> Upload Portal GSTR-2B (.json)
                <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleUpload2bJson} />
              </label>
              <button type="button" className="btn btn-secondary" onClick={handleLoadSample2bDemo}>
                <Sparkles size={15} /> Load Sample 2B Sheet
              </button>
            </div>
          </div>

          {reconResult && (() => {
            const filteredActionRows = actionRows2b.filter(
              (r) => actionFilter === 'ALL' || r.action === actionFilter
            );
            const export2b = build2bActionExportTable(filteredActionRows);
            return (
              <div style={{ marginTop: '1.15rem' }}>
                {/* Live GSTR-3B Table 4 Working Summary */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                    <div className="text-muted" style={{ fontSize: '0.74rem' }}>Table 4(A)(5) Accepted ITC</div>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#15803d' }}>
                      {formatCurrency(table4Summary2b.table4A5EligibleItc)}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      {table4Summary2b.acceptedCount} bill(s) marked Accept
                    </div>
                  </div>
                  <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                    <div className="text-muted" style={{ fontSize: '0.74rem' }}>Held Pending / Under Query</div>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#d97706' }}>
                      {formatCurrency(table4Summary2b.heldPendingItc)}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      {table4Summary2b.pendingCount} bill(s) held pending
                    </div>
                  </div>
                  <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                    <div className="text-muted" style={{ fontSize: '0.74rem' }}>Deferred (Missing in 2B)</div>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#2563eb' }}>
                      {formatCurrency(table4Summary2b.deferredMissing2bItc)}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      {table4Summary2b.deferredCount} bill(s) · Sec 16(2)(aa)
                    </div>
                  </div>
                  <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                    <div className="text-muted" style={{ fontSize: '0.74rem' }}>Table 4(D)(2) Rejected / 17(5)</div>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#dc2626' }}>
                      {formatCurrency(table4Summary2b.table4D2IneligibleRejectedItc)}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                      {table4Summary2b.rejectedCount} bill(s) rejected
                    </div>
                  </div>
                </div>

                {table4Summary2b.sec16WarningCount > 0 && (
                  <div
                    style={{
                      padding: '0.6rem 0.85rem',
                      borderRadius: '8px',
                      marginBottom: '0.9rem',
                      background: 'rgba(220, 38, 38, 0.12)',
                      color: '#b91c1c',
                      fontSize: '0.79rem',
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ Section 16(2)(aa) Statutory Alert: {table4Summary2b.sec16WarningCount} invoice(s) missing from portal GSTR-2B are marked &ldquo;Accept ITC&rdquo;. Claiming ITC absent from GSTR-2B may trigger automated Form GST DRC-01C notice.
                  </div>
                )}

                {/* Filter & Export Controls */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.6rem',
                    flexWrap: 'wrap',
                    marginBottom: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setActionFilter('ALL')}
                      className={`btn btn-sm ${actionFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      All ({actionRows2b.length})
                    </button>
                    {GSTR2B_ACTIONS.map((act) => (
                      <button
                        key={act.code}
                        type="button"
                        onClick={() => setActionFilter(act.code)}
                        className={`btn btn-sm ${actionFilter === act.code ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        {act.shortLabel}
                      </button>
                    ))}
                  </div>

                  <TableExport
                    title="GSTR-2B vs Purchase Register — CA ITC Action Statement"
                    subtitle={`${ownerProfile?.businessName || 'Firm'} · Table 4(A)(5) Eligible ITC: ₹${table4Summary2b.table4A5EligibleItc.toLocaleString('en-IN')}`}
                    headers={export2b.headers}
                    rows={export2b.rows}
                    filename="GSTR2B-ITC-Action-Reconciliation-Statement"
                    landscape={true}
                  />
                </div>

                {/* Interactive Action Sheet Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ marginBottom: 0, fontSize: '0.79rem' }}>
                    <thead>
                      <tr>
                        <th>Bucket</th>
                        <th>Supplier &amp; GSTIN</th>
                        <th>2B Inv / Books Inv</th>
                        <th style={{ textAlign: 'right' }}>2B ITC / Books ITC</th>
                        <th>Action Taken</th>
                        <th>Reason &amp; CA Remark</th>
                        <th>Follow-Up</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredActionRows.map((row) => (
                        <tr key={row.rowKey}>
                          <td>
                            <span style={{ fontWeight: 700, fontSize: '0.73rem' }}>{row.bucketLabel}</span>
                            <div className="text-muted" style={{ fontSize: '0.69rem' }}>{row.date}</div>
                          </td>
                          <td>
                            <div className="font-medium">{row.supplierName}</div>
                            <code style={{ fontSize: '0.7rem' }}>{row.supplierGstin}</code>
                          </td>
                          <td>
                            <div>2B: <b>{row.portalInvoiceNo}</b></div>
                            <div className="text-muted">Books: {row.bookInvoiceNo}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div>2B: <b>{formatCurrency(row.portalTax)}</b></div>
                            <div className="text-muted">Books: {formatCurrency(row.bookTax)}</div>
                          </td>
                          <td>
                            <select
                              value={row.action}
                              onChange={(e) => handleUpdate2bRowDecision(row.rowKey, { action: e.target.value })}
                              className="form-input"
                              style={{ minWidth: '165px', fontSize: '0.75rem', padding: '0.28rem 0.45rem' }}
                            >
                              {GSTR2B_ACTIONS.map((a) => (
                                <option key={a.code} value={a.code}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                            {row.statutoryWarning && (
                              <div style={{ color: '#dc2626', fontSize: '0.68rem', fontWeight: 700, marginTop: '0.2rem' }}>
                                ⚠ Sec 16(2)(aa) Risk
                              </div>
                            )}
                          </td>
                          <td>
                            <select
                              value={row.reasonCode}
                              onChange={(e) => handleUpdate2bRowDecision(row.rowKey, { reasonCode: e.target.value })}
                              className="form-input"
                              style={{ minWidth: '185px', fontSize: '0.73rem', padding: '0.24rem 0.4rem', marginBottom: '0.25rem' }}
                            >
                              {GSTR2B_REASON_CODES.map((rc) => (
                                <option key={rc.code} value={rc.code}>
                                  {rc.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={row.remark}
                              onChange={(e) => handleUpdate2bRowDecision(row.rowKey, { remark: e.target.value })}
                              placeholder={row.matchNote || 'CA audit remark…'}
                              className="form-input"
                              style={{ width: '100%', fontSize: '0.73rem', padding: '0.22rem 0.4rem' }}
                            />
                          </td>
                          <td>
                            {row.whatsappFollowUpUrl ? (
                              <a
                                href={row.whatsappFollowUpUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}
                              >
                                <MessageCircle size={12} /> WhatsApp
                              </a>
                            ) : (
                              <span className="text-muted" style={{ fontSize: '0.72rem' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {section === 'rollover' && (
        <YearEndRolloverPanel
          bills={bills}
          purchases={purchases}
          expenses={expenses}
          products={products}
          ownerProfile={ownerProfile}
          onRolloverCompleted={onBillsUpdated}
        />
      )}

      {section === 'cahub' && (
        <CaMultiClientHubPanel
          bills={bills}
          purchases={purchases}
          expenses={expenses}
          ownerProfile={ownerProfile}
        />
      )}

      {section === 'forecast' && (
        <div>
          <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Sparkles size={18} /> On-Device 30-Day Cash-Flow &amp; Inventory Velocity Forecast
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginTop: '1rem' }}>
              <div style={{ padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div className="text-muted" style={{ fontSize: '0.76rem' }}>Projected 30-Day Cash Inflow</div>
                <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#059669', marginTop: '0.25rem' }}>{formatCurrency(forecast.cashFlow.projectedInflow30d)}</div>
              </div>
              <div style={{ padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div className="text-muted" style={{ fontSize: '0.76rem' }}>Projected 30-Day Outflow</div>
                <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#d97706', marginTop: '0.25rem' }}>{formatCurrency(forecast.cashFlow.projectedOutflow30d)}</div>
              </div>
              <div style={{ padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div className="text-muted" style={{ fontSize: '0.76rem' }}>Projected Net Cash Position</div>
                <div style={{ fontWeight: 700, fontSize: '1.15rem', color: forecast.cashFlow.projectedNetCash30d >= 0 ? '#059669' : '#dc2626', marginTop: '0.25rem' }}>
                  {formatCurrency(forecast.cashFlow.projectedNetCash30d)}
                </div>
              </div>
              <div style={{ padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div className="text-muted" style={{ fontSize: '0.76rem' }}>Dead-Stock Locked Capital</div>
                <div style={{ fontWeight: 700, fontSize: '1.15rem', marginTop: '0.25rem' }}>{formatCurrency(forecast.lockedDeadStockCapital)}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ marginTop: 0 }}>📦 Dead-Stock Risk (Unsold 90+ Days)</h4>
              <table className="data-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr><th>Item</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Capital Locked</th></tr>
                </thead>
                <tbody>
                  {forecast.deadStockItems.length === 0 ? (
                    <tr><td colSpan={3} className="text-muted" style={{ textAlign: 'center' }}>Zero dead-stock items!</td></tr>
                  ) : (
                    forecast.deadStockItems.map((d, i) => (
                      <tr key={i}><td className="font-medium">{d.name}</td><td style={{ textAlign: 'right' }}>{d.stock}</td><td style={{ textAlign: 'right' }}>{formatCurrency(d.capitalLocked)}</td></tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ marginTop: 0 }}>⚡ Fast-Moving Stockout Countdown (&le;21 Days Left)</h4>
              <table className="data-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr><th>Item</th><th style={{ textAlign: 'right' }}>Days Left</th><th style={{ textAlign: 'right' }}>Suggested Order</th></tr>
                </thead>
                <tbody>
                  {forecast.reorderSoonItems.length === 0 ? (
                    <tr><td colSpan={3} className="text-muted" style={{ textAlign: 'center' }}>All fast-moving items have &gt;21 days of stock.</td></tr>
                  ) : (
                    forecast.reorderSoonItems.map((r, i) => (
                      <tr key={i}><td className="font-medium">{r.name}</td><td style={{ textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{r.daysLeft}d</td><td style={{ textAlign: 'right' }}>+{r.suggestedOrderQty}</td></tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {section === 'fifo' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '1.25rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.05rem' }}>💰 Smart FIFO Lump-Sum Payment Allocator</h3>
            <p className="text-muted" style={{ fontSize: '0.82rem' }}>
              Enter a customer&apos;s lump-sum payment to automatically clear their oldest unpaid invoices first (First-In, First-Out).
            </p>
            <div className="form-group">
              <label className="form-label">Select Customer with Pending Dues</label>
              <select className="form-input" value={fifoParty} onChange={(e) => setFifoParty(e.target.value)}>
                <option value="">-- Choose Customer --</option>
                {unpaidClientNames.map((nm) => <option key={nm} value={nm}>{nm}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Lump-Sum Received (₹)</label>
                <input type="number" min="0" step="0.01" className="form-input" value={fifoAmount} onChange={(e) => setFifoAmount(e.target.value)} placeholder="e.g. 25000" />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select className="form-input" value={fifoMode} onChange={(e) => setFifoMode(e.target.value)}>
                  <option value="UPI">UPI</option>
                  <option value="Bank Transfer">NEFT / RTGS / IMPS</option>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>

            {fifoPreview.allocations.length > 0 && (
              <div style={{ marginBottom: '0.85rem', fontSize: '0.82rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>
                  FIFO Allocation Preview ({formatCurrency(fifoPreview.totalAllocated)} applied):
                </div>
                {fifoPreview.allocations.map((a) => (
                  <div key={a.billId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px dashed var(--border-color)' }}>
                    <span>{a.invoiceNumber} ({a.invoiceDate}) → <b>{a.newStatus.toUpperCase()}</b></span>
                    <span>{formatCurrency(a.appliedAmount)}</span>
                  </div>
                ))}
              </div>
            )}

            <button type="button" className="btn btn-primary" disabled={applyingFifo} onClick={handleApplyFifoSettlement}>
              <CheckCircle2 size={15} /> {applyingFifo ? 'Settling…' : 'Apply FIFO Settlement'}
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0, fontSize: '1.05rem' }}>🛍️ Instant B2B Digital Catalog &amp; WhatsApp Order Importer</h3>
            <p className="text-muted" style={{ fontSize: '0.82rem' }}>
              Export a standalone mobile-friendly HTML Digital Catalog of your inventory ({products.length} items). Customers pick quantities and send structured WhatsApp orders with zero server cost!
            </p>
            <button type="button" className="btn btn-primary" style={{ marginBottom: '1rem' }} onClick={handleDownloadCatalog}>
              <Download size={15} /> Download Shareable B2B Catalog (.html)
            </button>

            <div className="form-group" style={{ marginBottom: '0.5rem' }}>
              <label className="form-label">Paste Customer&apos;s WhatsApp Order Message to Parse</label>
              <textarea
                rows={3}
                className="form-input"
                placeholder={'BHARAT_ORDER | My Store\n5 x Basmati Rice @ 1200\n2 x Mustard Oil @ 210'}
                value={waOrderText}
                onChange={(e) => setWaOrderText(e.target.value)}
              />
            </div>
            {parsedWaItems.length > 0 && (
              <div style={{ fontSize: '0.82rem', padding: '0.65rem', borderRadius: '8px', background: 'var(--bg-secondary)' }}>
                <b>✓ Parsed {parsedWaItems.length} Order Line(s):</b>
                {parsedWaItems.map((it, idx) => (
                  <div key={idx}>• {it.quantity} × {it.name} @ {formatCurrency(it.price)} ({it.gstRate}% GST)</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'hardware' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '1.05rem' }}>
              <Scale size={18} /> Electronic Weighing Scale Bridge (WebSerial API)
            </h3>
            <p className="text-muted" style={{ fontSize: '0.83rem' }}>
              Connect RS-232 / USB-Serial retail, kirana, sweet-shop, or jewellery weighing scales directly in Chrome / Edge without installing third-party drivers.
            </p>
            <button type="button" className="btn btn-primary" onClick={handleReadScale}>
              <Scale size={15} /> Capture Live Weight from Scale
            </button>
            {capturedWeight && (
              <div style={{ marginTop: '0.85rem', fontWeight: 700, color: '#059669' }}>
                Live Reading: {capturedWeight.weightKg} kg (raw: <code>{capturedWeight.raw}</code>)
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '1.05rem' }}>
              <Printer size={18} /> Direct ESC/POS Silent Thermal Printer (WebUSB / WebSerial)
            </h3>
            <p className="text-muted" style={{ fontSize: '0.83rem' }}>
              Streams native ESC/POS commands (bold shop header, itemized lines, GST total &amp; auto-cutter <code>GS V</code>) directly to 58mm/80mm USB thermal printers in 0.2s — bypassing browser print dialogs.
            </p>
            <div className="form-group">
              <label className="form-label">Select Invoice to Print</label>
              <select className="form-input" value={selectedBillId} onChange={(e) => setSelectedBillId(e.target.value)}>
                {bills.slice(0, 30).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.invoiceNumber || b?.data?.invoiceNumber || 'INV'} — {formatCurrency(b.totalAmount ?? b?.data?.grandTotal ?? 0)}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleSilentThermalPrint}>
              <Printer size={15} /> Silent Print Receipt (ESC/POS)
            </button>
          </div>
        </div>
      )}

      {section === 'p2p' && (
        <div>
          <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Smartphone size={18} /> Serverless WebRTC P2P Mobile &harr; PC Live Sync (Works Over 5G &amp; Broadband!)
                </h3>
                <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.83rem' }}>
                  Godown or floor staff can take live orders on 5G mobile data while your Counter PC is on broadband — protected by a 4-digit Counter PIN with ₹0 server cost.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className={`btn ${p2pRole === 'HOST' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setP2pRole('HOST')}>
                  🖥️ Counter PC (Receive Bills)
                </button>
                <button type="button" className={`btn ${p2pRole === 'CLIENT' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setP2pRole('CLIENT')}>
                  📱 Staff Mobile (Send Orders)
                </button>
              </div>
            </div>

            {p2pRole === 'HOST' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: '0.85rem', marginTop: 0 }}>
                    Click below on your Counter PC to open an encrypted WebRTC DataChannel. Staff phones scan the QR (or enter Session ID + 4-digit PIN) to pull live stock and push instant bills directly into your IndexedDB &amp; Hard-Drive Mirror!
                  </p>
                  <button type="button" className="btn btn-primary" onClick={handleStartP2pHost}>
                    Generate Pairing QR &amp; Start Counter Receiver
                  </button>
                  {hostCreds && (
                    <div style={{ marginTop: '0.9rem', padding: '0.8rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', fontSize: '0.85rem' }}>
                      <div>Session ID: <strong style={{ fontFamily: 'monospace', fontSize: '0.95rem' }}>{hostCreds.roomId}</strong></div>
                      <div style={{ marginTop: '0.25rem' }}>4-Digit Security PIN: <strong style={{ fontFamily: 'monospace', fontSize: '0.95rem', color: '#059669' }}>{hostCreds.pin}</strong></div>
                    </div>
                  )}
                </div>

                {hostQrDataUrl && (
                  <div style={{ textAlign: 'center', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: '#fff', color: '#0f172a' }}>
                    <img src={hostQrDataUrl} alt="WebRTC P2P Pairing QR" style={{ width: '176px', height: '176px' }} />
                    <div style={{ fontSize: '0.76rem', fontWeight: 600, marginTop: '0.35rem' }}>Scan with Staff Phone Camera (5G or Wi-Fi)</div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Counter PC Session ID</label>
                    <input type="text" className="form-input" placeholder="BGST-123456" value={remoteRoomId} onChange={(e) => setRemoteRoomId(e.target.value.toUpperCase())} />
                  </div>
                  <div className="form-group" style={{ margin: 0, width: '130px' }}>
                    <label className="form-label">4-Digit PIN</label>
                    <input type="text" maxLength={6} className="form-input" placeholder="1234" value={remotePin} onChange={(e) => setRemotePin(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-primary" onClick={handleConnectMobileToPc}>
                    {p2pConnected ? `✓ Paired (${p2pRemoteShop || 'PC'})` : 'Connect to Counter PC'}
                  </button>
                </div>

                {/* Staff Mobile Order Pad */}
                <div style={{ padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                  <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                    📝 Godown / Floor Quick Order Pad ({(p2pRemoteCatalog.length || products.length)} items available)
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem', marginBottom: '0.85rem' }}>
                    <select className="form-input" value={p2pDocType} onChange={(e) => setP2pDocType(e.target.value)}>
                      <option value="Tax Invoice">Tax Invoice</option>
                      <option value="Sales Order">Sales Order</option>
                      <option value="Quotation">Estimate / Quotation</option>
                    </select>
                    <input type="text" className="form-input" placeholder="Customer Name" value={p2pCustomerName} onChange={(e) => setP2pCustomerName(e.target.value)} />
                    <input type="tel" className="form-input" placeholder="Customer Phone" value={p2pCustomerPhone} onChange={(e) => setP2pCustomerPhone(e.target.value)} />
                    <input type="text" className="form-input" placeholder="Party GSTIN (optional)" value={p2pCustomerGstin} onChange={(e) => setP2pCustomerGstin(e.target.value.toUpperCase())} />
                  </div>

                  <div style={{ maxHeight: '220px', overflowY: 'auto', marginBottom: '0.85rem' }}>
                    <table className="data-table" style={{ marginBottom: 0 }}>
                      <thead>
                        <tr><th>Item</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ width: '95px', textAlign: 'right' }}>Order Qty</th></tr>
                      </thead>
                      <tbody>
                        {(p2pRemoteCatalog.length > 0 ? p2pRemoteCatalog : products).slice(0, 40).map((it, idx) => {
                          const key = it.id || idx;
                          const price = Number(it.price ?? it.sellingPrice ?? 0) || 0;
                          const stock = Number(it.stock ?? it.currentStock ?? 0) || 0;
                          return (
                            <tr key={key}>
                              <td className="font-medium">{it.name}</td>
                              <td style={{ textAlign: 'right' }}>{stock}</td>
                              <td style={{ textAlign: 'right' }}>{formatCurrency(price)}</td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  className="form-input"
                                  style={{ textAlign: 'right', padding: '0.3rem 0.45rem' }}
                                  value={p2pCart[key] || ''}
                                  onChange={(e) => setP2pCart((prev) => ({ ...prev, [key]: e.target.value }))}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary" onClick={handleSendMobileOrderToPc}>
                      <Send size={15} /> Push Live Bill to Counter PC (Offline-Queue Safe)
                    </button>
                    {offlineQueue.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          const n = p2pRef.current?.flushOfflineQueue(remoteRoomId) || 0;
                          toast(n > 0 ? `Flushing ${n} queued bill(s)…` : 'Waiting for Counter PC link — bills are safe in local queue.', 'info');
                        }}
                      >
                        <RefreshCw size={14} /> Offline Queue: {offlineQueue.length} Pending (Auto-Flush Active)
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.78rem', maxHeight: '160px', overflowY: 'auto' }}>
            <div className="text-muted" style={{ marginBottom: '0.35rem' }}>// Live Resilient WebRTC P2P Activity Log (10s Heartbeat + 3s Auto-Reconnect)</div>
            {p2pLogs.length === 0 ? (
              <div className="text-muted">Ready — start Counter PC Receiver or connect from Staff Mobile above.</div>
            ) : (
              p2pLogs.map((ln, idx) => <div key={idx}>{ln}</div>)
            )}
          </div>
        </div>
      )}

      {section === 'migrate' && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Database size={18} /> 1-Click TallyPrime XML &amp; Vyapar Excel / CSV Migration Bridge
              </h3>
              <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.83rem' }}>
                Upload Tally <code>Masters.xml</code> / <code>DayBook.xml</code> (UTF-8 or UTF-16LE) or Vyapar / Excel <code>.xlsx</code> / <code>.csv</code> sheets to import Customers, HSN Stock Items &amp; Opening Balances in one click.
              </p>
            </div>
            <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <Upload size={16} /> Choose Tally .XML / Vyapar .XLSX / .CSV
              <input type="file" accept=".xml,.xlsx,.csv" style={{ display: 'none' }} onChange={handleLegacyFileSelect} />
            </label>
          </div>

          {migrationPreview && (
            <div style={{ marginTop: '1.15rem', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{migrationPreview.fileName} ({migrationPreview.source})</div>
                  <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: '0.2rem' }}>
                    Ready to import: <b>{migrationPreview.clients.length}</b> Parties · <b>{migrationPreview.products.length}</b> Stock Items · <b>{migrationPreview.vouchers.length}</b> Sales Vouchers
                  </div>
                  {Array.isArray(migrationPreview.warnings) && migrationPreview.warnings.length > 0 && (
                    <div style={{ marginTop: '0.45rem', fontSize: '0.77rem', color: '#d97706', fontWeight: 600 }}>
                      ⚠️ {migrationPreview.warnings.slice(0, 3).join(' | ')}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setMigrationPreview(null)}>Cancel</button>
                  <button type="button" className="btn btn-primary" disabled={importingLegacy} onClick={handleCommitLegacyImport}>
                    <CheckCircle2 size={15} /> {importingLegacy ? 'Importing…' : 'Confirm 1-Click Import'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {(section === 'itr' || section === 'supplychain' || section === 'munim') && (
        <AutonomousOsPanels
          section={section}
          bills={bills}
          purchases={purchases}
          expenses={expenses}
          products={products}
          ownerProfile={ownerProfile}
          fy={fyFilter}
          onFyChange={setFyFilter}
          onProductsUpdated={onProductsUpdated}
        />
      )}
    </div>
  );
}
