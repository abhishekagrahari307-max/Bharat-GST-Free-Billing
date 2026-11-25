import { useState, useMemo, useEffect } from 'react';
import {
  Upload, Download, Zap, Warehouse, Factory, Brain, ShieldAlert,
  Share2, Copy, CheckCircle2, Truck, FileSpreadsheet,
} from 'lucide-react';
import { saveProduct, getAllClients, getAllProfiles } from '../store';
import { formatCurrency } from '../utils';
import {
  parseAISJson,
  computeBusinessITR,
  extractTdsDeductionsFromBooks,
  generateForm26QSummary,
  buildPortalBridgePayload,
} from '../utils/itrAndTaxEngine';
import {
  computeGodownStockTransfer,
  allocateBatchesFEFO,
  computeManufacturingBOM,
  estimateEwayBillValidity,
} from '../utils/godownAndManufacturing';
import {
  checkSection43BCompliance,
  runAutonomousMunimAdvisor,
  generateServerlessCatalogLink,
  computeMultiFirmConsolidation,
} from '../utils/autonomousMunimAnd43B';
import { toast } from './Toast';

export default function AutonomousOsPanels({
  section,
  bills = [],
  purchases = [],
  expenses = [],
  products = [],
  ownerProfile = null,
  onProductsUpdated,
}) {
  const [clients, setClients] = useState([]);
  const [profiles, setProfiles] = useState([]);
  useEffect(() => {
    getAllClients().then((c) => setClients(Array.isArray(c) ? c : [])).catch(() => {});
    getAllProfiles().then((p) => setProfiles(Array.isArray(p) ? p : [])).catch(() => {});
  }, []);

  // --- Module A: ITR-3/4, AIS & TDS 26Q + Portal Bridge state ---
  const [aisSummary, setAisSummary] = useState({ tdsEntries: [], sftTransactions: [], totalTdsCredit: 0, totalTcsCredit: 0 });
  const [digitalPct, setDigitalPct] = useState(95);
  const [otherIncome, setOtherIncome] = useState(0);
  const [is44ADA, setIs44ADA] = useState(false);
  const [portalBillId, setPortalBillId] = useState('');
  const [portalVehicle, setPortalVehicle] = useState('');
  const [portalDistance, setPortalDistance] = useState(120);
  const [selectedQuarter, setSelectedQuarter] = useState('Q3');
  const [manualTdsRows, setManualTdsRows] = useState([]);
  const [newTdsParty, setNewTdsParty] = useState('');
  const [newTdsPan, setNewTdsPan] = useState('');
  const [newTdsSection, setNewTdsSection] = useState('194C');
  const [newTdsPaid, setNewTdsPaid] = useState('');
  const [newTdsAmt, setNewTdsAmt] = useState('');

  const itrResult = useMemo(
    () =>
      computeBusinessITR({
        bills,
        purchases,
        expenses,
        digitalReceiptPercent: digitalPct,
        otherIncome,
        isProfession44ADA: is44ADA,
        aisSummary,
      }),
    [bills, purchases, expenses, digitalPct, otherIncome, is44ADA, aisSummary]
  );

  const combinedTdsRows = useMemo(
    () => [...extractTdsDeductionsFromBooks({ purchases, expenses }), ...manualTdsRows],
    [purchases, expenses, manualTdsRows]
  );
  const form26q = useMemo(
    () => generateForm26QSummary(combinedTdsRows, selectedQuarter),
    [combinedTdsRows, selectedQuarter]
  );

  // --- Module B: Multi-Godown, Real-Inventory FEFO, BOM & E-Way Validity state ---
  const [gdProductId, setGdProductId] = useState('');
  const [fromGodown, setFromGodown] = useState('MAIN');
  const [toGodown, setToGodown] = useState('GODOWN_A');
  const [gdQty, setGdQty] = useState(5);
  const [lastChallan, setLastChallan] = useState(null);

  const [bomFinishedId, setBomFinishedId] = useState('');
  const [bomRawId, setBomRawId] = useState('');
  const [bomRawQtyPerUnit, setBomRawQtyPerUnit] = useState(1.05);
  const [bomWastagePct, setBomWastagePct] = useState(2);
  const [bomProducedQty, setBomProducedQty] = useState(10);
  const [bomOverhead, setBomOverhead] = useState(200);
  const [lastBomResult, setLastBomResult] = useState(null);

  const [ewayDistKm, setEwayDistKm] = useState(340);
  const [ewayGenHoursAgo, setEwayGenHoursAgo] = useState(43);

  const [fefoProductId, setFefoProductId] = useState('');
  const [fefoReqQty, setFefoReqQty] = useState(10);
  const [batchCodeInput, setBatchCodeInput] = useState('');
  const [batchExpInput, setBatchExpInput] = useState('');
  const [batchQtyInput, setBatchQtyInput] = useState('');

  const selectedFefoProduct = useMemo(
    () => products.find((p) => String(p.id) === String(fefoProductId)) || products[0] || null,
    [products, fefoProductId]
  );

  const liveProductBatches = useMemo(() => {
    if (!selectedFefoProduct) return [];
    if (Array.isArray(selectedFefoProduct.batches) && selectedFefoProduct.batches.length > 0) {
      return selectedFefoProduct.batches;
    }
    return [];
  }, [selectedFefoProduct]);

  const fefoAllocation = useMemo(
    () => allocateBatchesFEFO(liveProductBatches, Number(fefoReqQty) || 0),
    [liveProductBatches, fefoReqQty]
  );

  const ewayStatus = useMemo(() => {
    const refMs = new Date().getTime();
    const genIso = new Date(refMs - Number(ewayGenHoursAgo || 0) * 3600000).toISOString();
    return estimateEwayBillValidity({ distanceKm: ewayDistKm, generatedAtIso: genIso, nowIso: new Date(refMs).toISOString() });
  }, [ewayDistKm, ewayGenHoursAgo]);

  // --- Module D: Section 43B(h) (Strict Verified MSME Default + 15d vs 45d Rule), AI Munim & fflate Storefront ---
  const [treatAllAsMsme, setTreatAllAsMsme] = useState(false);
  const [hasWrittenAgreement, setHasWrittenAgreement] = useState(true);
  const [agreedDays, setAgreedDays] = useState(45);

  const sec43B = useMemo(
    () =>
      checkSection43BCompliance({
        purchases,
        clients,
        hasWrittenAgreementDefault: hasWrittenAgreement,
        agreedCreditDaysDefault: agreedDays,
        treatAllUnpaidSuppliersAsMsmeIfUnmarked: treatAllAsMsme,
      }),
    [purchases, clients, hasWrittenAgreement, agreedDays, treatAllAsMsme]
  );

  const munim = useMemo(
    () => runAutonomousMunimAdvisor({ bills, purchases, products, minMarginPercent: 12, creditLimitPerParty: 50000 }),
    [bills, purchases, products]
  );

  const serverlessLink = useMemo(() => {
    const originUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/';
    return generateServerlessCatalogLink(originUrl, ownerProfile || {}, products);
  }, [ownerProfile, products]);

  const groupConsolidated = useMemo(
    () => computeMultiFirmConsolidation({ profiles, bills, purchases, expenses }),
    [profiles, bills, purchases, expenses]
  );

  const handleAisUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseAISJson(text);
      setAisSummary(parsed);
      toast(`AIS JSON parsed: ₹${parsed.totalTdsCredit} TDS + ₹${parsed.totalTcsCredit} TCS (${parsed.tdsEntries.length} rows)!`, 'success');
    } catch (err) {
      toast(err?.message || 'Unsupported AIS / TIS JSON file', 'error');
    }
  };

  const handleDownloadText = (filename, content, mime = 'text/plain') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleAddManualTdsRow = () => {
    if (!newTdsParty.trim() || !(Number(newTdsAmt) > 0)) {
      toast('Enter Deductee Name and TDS Amount (> ₹0).', 'error');
      return;
    }
    setManualTdsRows((prev) => [
      ...prev,
      {
        partyName: newTdsParty.trim(),
        pan: (newTdsPan || 'PANNOTAVBL').trim().toUpperCase(),
        section: newTdsSection,
        paymentDate: new Date().toISOString().slice(0, 10),
        amountPaid: Number(newTdsPaid || 0),
        tdsAmount: Number(newTdsAmt || 0),
      },
    ]);
    setNewTdsParty('');
    setNewTdsPan('');
    setNewTdsPaid('');
    setNewTdsAmt('');
  };

  const handleAddProductBatch = async () => {
    if (!selectedFefoProduct) {
      toast('Create a product in Inventory first.', 'error');
      return;
    }
    if (!batchCodeInput.trim() || !batchExpInput || !(Number(batchQtyInput) > 0)) {
      toast('Enter Batch No, Expiry Date, and Qty (> 0).', 'error');
      return;
    }
    const nextBatches = [
      ...liveProductBatches,
      {
        batchNo: batchCodeInput.trim().toUpperCase(),
        expiryDate: batchExpInput,
        qty: Number(batchQtyInput),
        mrp: Number(selectedFefoProduct.sellingPrice ?? selectedFefoProduct.price ?? 0),
      },
    ];
    await saveProduct({ ...selectedFefoProduct, batches: nextBatches });
    setBatchCodeInput('');
    setBatchExpInput('');
    setBatchQtyInput('');
    onProductsUpdated?.();
    toast(`Saved Batch ${batchCodeInput.toUpperCase()} on ${selectedFefoProduct.name}!`, 'success');
  };

  const handlePushToPortalExtension = () => {
    const bill = bills.find((b) => String(b.id) === String(portalBillId)) || bills[0];
    if (!bill) {
      toast('Create at least one invoice first to push to GST / E-Way Portal.', 'error');
      return;
    }
    const payload = buildPortalBridgePayload(bill, { vehicleNo: portalVehicle, distanceKm: portalDistance });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('BHARATGST_PUSH_PORTAL_PAYLOAD', { detail: payload }));
      navigator.clipboard?.writeText(JSON.stringify(payload, null, 2)).catch(() => {});
    }
    toast(`Pushed Bill #${payload.invoiceNumber} to Companion Extension (and copied JSON)!`, 'success');
  };

  const handleGodownTransfer = async () => {
    try {
      const prod = products.find((p) => String(p.id) === String(gdProductId)) || products[0];
      const res = computeGodownStockTransfer(prod, { fromGodown, toGodown, qty: gdQty });
      await saveProduct(res.updatedProduct);
      setLastChallan(res.challan);
      onProductsUpdated?.();
      toast(`Transferred ${gdQty} ${prod.unit || 'PCS'} of ${prod.name} (${res.challan.fromGodown} -> ${res.challan.toGodown})!`, 'success');
    } catch (err) {
      toast(err?.message || 'Godown transfer failed', 'error');
    }
  };

  const handleRunBom = async () => {
    try {
      const fin = products.find((p) => String(p.id) === String(bomFinishedId)) || products[0];
      const raw = products.find((p) => String(p.id) === String(bomRawId)) || products[1] || products[0];
      if (!fin || !raw || fin.id === raw.id) {
        toast('Select two distinct products (1 Raw Material and 1 Finished Good) in Inventory first.', 'error');
        return;
      }
      const res = computeManufacturingBOM({
        finishedItem: fin,
        producedQty: bomProducedQty,
        rawMaterials: [{ product: raw, qtyPerUnit: bomRawQtyPerUnit, wastagePercent: bomWastagePct }],
        additionalOverheadCost: bomOverhead,
      });
      for (const rp of res.updatedRawProducts) await saveProduct(rp);
      await saveProduct(res.updatedFinishedProduct);
      setLastBomResult(res);
      onProductsUpdated?.();
      toast(`Produced ${res.producedQty} ${fin.name} | Landed Cost: ₹${res.landedCostPerUnit}/unit!`, 'success');
    } catch (err) {
      toast(err?.message || 'Manufacturing BOM failed', 'error');
    }
  };

  const handleAutoReprice = async (alertItem) => {
    const prod = products.find((p) => String(p.id) === String(alertItem.itemId));
    if (!prod) return;
    await saveProduct({ ...prod, sellingPrice: alertItem.suggestedSaleRate, price: alertItem.suggestedSaleRate });
    onProductsUpdated?.();
    toast(`Updated "${prod.name}" selling price to ₹${alertItem.suggestedSaleRate}!`, 'success');
  };

  if (section === 'itr') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <FileSpreadsheet size={18} /> Statutory ITR-3 vs ITR-4 (Sec 44AD / 44ADA) + AIS / 26AS Engine
              </h3>
              <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                Enforces 5% cash-receipt cap for ₹3Cr (44AD) / ₹75L (44ADA) limits + CBDT Section 87A Marginal Relief above ₹12,00,000 + Surcharge.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Upload size={15} /> Upload Official AIS / TIS JSON
                <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleAisUpload} />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleDownloadText(`BharatGST-ITR-${itrResult.assessmentYear}.json`, JSON.stringify(itrResult, null, 2), 'application/json')}
              >
                <Download size={15} /> Export ITR Working JSON
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 600 }}>Digital Receipts % (Cash: {itrResult.cashReceiptPercent}%)</label>
              <input type="number" className="form-input" min="0" max="100" value={digitalPct} onChange={(e) => setDigitalPct(Number(e.target.value))} />
            </div>
            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 600 }}>Other Income (FD / Interest ₹)</label>
              <input type="number" className="form-input" min="0" value={otherIncome} onChange={(e) => setOtherIncome(Number(e.target.value))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.82rem', cursor: 'pointer', paddingBottom: '0.55rem' }}>
                <input type="checkbox" checked={is44ADA} onChange={(e) => setIs44ADA(e.target.checked)} />
                Profession Sec 44ADA (50% profit)
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: '0.85rem', marginTop: '1rem' }}>
            <div style={{ padding: '0.95rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>{itrResult.itr3.form}</div>
              <div style={{ fontSize: '1.12rem', fontWeight: 700, marginTop: '0.2rem' }}>Profit: {formatCurrency(itrResult.itr3.netProfit)}</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                Tax: <b>{formatCurrency(itrResult.itr3.grossTaxLiability)}</b> · Net: <b>{formatCurrency(itrResult.itr3.netPayableOrRefund)}</b>
              </div>
              {itrResult.itr3.marginalRelief87A > 0 && (
                <div style={{ fontSize: '0.73rem', color: '#16a34a', marginTop: '0.2rem' }}>
                  ✓ Sec 87A Marginal Relief applied: {formatCurrency(itrResult.itr3.marginalRelief87A)}
                </div>
              )}
            </div>

            <div style={{ padding: '0.95rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                {itrResult.itr4.form} — Limit: {formatCurrency(itrResult.itr4.applicableLimit)}{' '}
                <strong style={{ color: itrResult.itr4.eligible ? '#16a34a' : '#dc2626' }}>
                  {itrResult.itr4.eligible ? '✓ Eligible' : '✗ Ineligible'}
                </strong>
              </div>
              <div style={{ fontSize: '1.12rem', fontWeight: 700, marginTop: '0.2rem' }}>Presumptive: {formatCurrency(itrResult.itr4.presumptiveProfit)}</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                Tax: <b>{formatCurrency(itrResult.itr4.grossTaxLiability)}</b> · Net: <b>{formatCurrency(itrResult.itr4.netPayableOrRefund)}</b>
              </div>
              {!itrResult.itr4.eligible && itrResult.itr4.ineligibilityReason && (
                <div style={{ fontSize: '0.73rem', color: '#dc2626', marginTop: '0.25rem', fontWeight: 600 }}>
                  {itrResult.itr4.ineligibilityReason}
                </div>
              )}
              {itrResult.itr4.marginalRelief87A > 0 && (
                <div style={{ fontSize: '0.73rem', color: '#16a34a', marginTop: '0.2rem' }}>
                  ✓ Sec 87A Marginal Relief applied: {formatCurrency(itrResult.itr4.marginalRelief87A)}
                </div>
              )}
            </div>

            <div style={{ padding: '0.95rem', borderRadius: 10, background: 'rgba(22, 163, 74, 0.09)', border: '1px solid rgba(22, 163, 74, 0.35)' }}>
              <div style={{ fontSize: '0.76rem', color: '#16a34a', fontWeight: 700 }}>RECOMMENDED WORKING FORM</div>
              <div style={{ fontSize: '1.08rem', fontWeight: 800, marginTop: '0.2rem' }}>{itrResult.recommendedForm}</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                AIS TDS/TCS: <b>{formatCurrency(itrResult.prepaidTdsTcs)}</b> · Diff: <b>{formatCurrency(itrResult.taxSavedByRecommendation)}</b>
              </div>
            </div>
          </div>
          <div className="text-muted" style={{ fontSize: '0.74rem', marginTop: '0.7rem' }}>
            ℹ️ {itrResult.disclaimer}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1.15rem' }}>
            <h4 style={{ margin: '0 0 0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Zap size={17} style={{ color: '#16a34a' }} /> Zero-GSP Chrome/Edge Portal Auto-Fill Bridge
            </h4>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0 0 0.8rem' }}>
              Load <code>companion-extension/</code> unpacked in Chrome/Edge to 1-click auto-fill <code>ewaybillgst.gov.in</code> &amp; <code>gst.gov.in</code>.
            </p>
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              <select className="form-input" value={portalBillId} onChange={(e) => setPortalBillId(e.target.value)}>
                {bills.map((b) => (
                  <option key={b.id} value={b.id}>#{b.invoiceNumber} — {b.clientName} ({formatCurrency(b.totalAmount || 0)})</option>
                ))}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <input className="form-input" placeholder="Vehicle No (e.g. UP32AB1234)" value={portalVehicle} onChange={(e) => setPortalVehicle(e.target.value)} />
                <input type="number" className="form-input" placeholder="Distance (km)" value={portalDistance} onChange={(e) => setPortalDistance(e.target.value)} />
              </div>
              <button type="button" className="btn btn-primary" onClick={handlePushToPortalExtension}>
                <Zap size={15} /> Push Bill to GST / E-Way Portal Extension
              </button>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.15rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <h4 style={{ margin: 0 }}>TDS Form 26Q Working Schedule</h4>
              <select className="form-input" style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.78rem' }} value={selectedQuarter} onChange={(e) => setSelectedQuarter(e.target.value)}>
                <option value="Q1">Q1 (Apr–Jun)</option>
                <option value="Q2">Q2 (Jul–Sep)</option>
                <option value="Q3">Q3 (Oct–Dec)</option>
                <option value="Q4">Q4 (Jan–Mar)</option>
              </select>
            </div>
            <p className="text-muted" style={{ fontSize: '0.77rem', margin: '0 0 0.65rem' }}>
              Live Books Deductees: <b>{form26q.deducteeCount}</b> · Paid: <b>{formatCurrency(form26q.totalAmountPaid)}</b> · TDS: <b>{formatCurrency(form26q.totalTdsDeducted)}</b>
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.7fr 0.8fr 0.8fr', gap: '0.35rem', marginBottom: '0.55rem' }}>
              <input className="form-input" placeholder="Party" value={newTdsParty} onChange={(e) => setNewTdsParty(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
              <input className="form-input" placeholder="PAN" value={newTdsPan} onChange={(e) => setNewTdsPan(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
              <input className="form-input" placeholder="194C" value={newTdsSection} onChange={(e) => setNewTdsSection(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
              <input type="number" className="form-input" placeholder="Paid ₹" value={newTdsPaid} onChange={(e) => setNewTdsPaid(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
              <input type="number" className="form-input" placeholder="TDS ₹" value={newTdsAmt} onChange={(e) => setNewTdsAmt(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={handleAddManualTdsRow}>
                + Add Deductee
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={form26q.deducteeCount === 0}
                onClick={() => handleDownloadText(`Form26Q-${form26q.quarter}-Working.csv`, form26q.csvText, 'text/csv')}
              >
                <Download size={14} /> Export 26Q CSV (Validate in NSDL RPU)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'supplychain') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1.15rem' }}>
            <h4 style={{ margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Warehouse size={17} /> Multi-Godown Stock Transfer Challan
            </h4>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
              Move stock cleanly between Main Shop, Mandi Godown &amp; Branch Warehouses with live godown-wise ledger tracking.
            </p>
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              <select className="form-input" value={gdProductId} onChange={(e) => setGdProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (Total: {p.stock ?? 0} {p.unit || 'PCS'})</option>
                ))}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: '0.5rem' }}>
                <input className="form-input" value={fromGodown} onChange={(e) => setFromGodown(e.target.value)} placeholder="From (MAIN)" />
                <input className="form-input" value={toGodown} onChange={(e) => setToGodown(e.target.value)} placeholder="To (GODOWN_A)" />
                <input type="number" className="form-input" value={gdQty} onChange={(e) => setGdQty(e.target.value)} placeholder="Qty" />
              </div>
              <button type="button" className="btn btn-primary" onClick={handleGodownTransfer}>
                Transfer Godown Stock &amp; Generate Challan
              </button>
              {lastChallan && (
                <div style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>
                  ✓ Challan #{lastChallan.challanNo}: {lastChallan.qty} moved ({lastChallan.fromGodown} → {lastChallan.toGodown})
                </div>
              )}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.15rem' }}>
            <h4 style={{ margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Factory size={17} /> Bill of Materials (BOM) &amp; Manufacturing Costing
            </h4>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
              Convert Raw Material → Wastage % → Finished Goods and auto-update exact Landed Cost per Unit.
            </p>
            <div style={{ display: 'grid', gap: '0.55rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <select className="form-input" value={bomRawId} onChange={(e) => setBomRawId(e.target.value)}>
                  <option value="">Raw Material…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>Raw: {p.name}</option>)}
                </select>
                <select className="form-input" value={bomFinishedId} onChange={(e) => setBomFinishedId(e.target.value)}>
                  <option value="">Finished Good…</option>
                  {products.map((p) => <option key={p.id} value={p.id}>Finished: {p.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.45rem' }}>
                <input type="number" className="form-input" value={bomProducedQty} onChange={(e) => setBomProducedQty(e.target.value)} title="Produced Qty" placeholder="Out Qty" />
                <input type="number" step="0.01" className="form-input" value={bomRawQtyPerUnit} onChange={(e) => setBomRawQtyPerUnit(e.target.value)} title="Raw/Unit" placeholder="Raw/u" />
                <input type="number" className="form-input" value={bomWastagePct} onChange={(e) => setBomWastagePct(e.target.value)} title="Wastage %" placeholder="Waste%" />
                <input type="number" className="form-input" value={bomOverhead} onChange={(e) => setBomOverhead(e.target.value)} title="Overhead ₹" placeholder="Extra ₹" />
              </div>
              <button type="button" className="btn btn-primary" onClick={handleRunBom}>
                Execute BOM Production Journal
              </button>
              {lastBomResult && (
                <div style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>
                  ✓ Produced {lastBomResult.producedQty} {lastBomResult.finishedItem} · Landed Cost: ₹{lastBomResult.landedCostPerUnit}/unit
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1.15rem' }}>
            <h4 style={{ margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Truck size={17} /> E-Way Bill Validity &amp; 6-Hour Auto-Extend Tracker
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem', marginTop: '0.6rem' }}>
              <div>
                <label style={{ fontSize: '0.74rem' }}>Pin-to-Pin Distance (km)</label>
                <input type="number" className="form-input" value={ewayDistKm} onChange={(e) => setEwayDistKm(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.74rem' }}>Hours Elapsed Since Generation</label>
                <input type="number" className="form-input" value={ewayGenHoursAgo} onChange={(e) => setEwayGenHoursAgo(e.target.value)} />
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.83rem' }}>
              Statutory Validity: <b>{ewayStatus.validityDays} Day(s)</b> (200 km/day) · Remaining: <b>{ewayStatus.hoursRemaining} hrs</b> · Status:{' '}
              <span style={{ fontWeight: 700, color: ewayStatus.needsExtensionAlert ? '#dc2626' : '#16a34a' }}>
                {ewayStatus.status}
              </span>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.15rem' }}>
            <h4 style={{ margin: '0 0 0.35rem' }}>Live Product Batch &amp; Expiry FEFO Allocator</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '0.45rem', marginBottom: '0.5rem' }}>
              <select className="form-input" value={fefoProductId} onChange={(e) => setFefoProductId(e.target.value)}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" className="form-input" value={fefoReqQty} onChange={(e) => setFefoReqQty(e.target.value)} title="Required Qty" placeholder="Need Qty" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 75px auto', gap: '0.35rem', marginBottom: '0.55rem' }}>
              <input className="form-input" placeholder="Batch No" value={batchCodeInput} onChange={(e) => setBatchCodeInput(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
              <input type="date" className="form-input" value={batchExpInput} onChange={(e) => setBatchExpInput(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
              <input type="number" className="form-input" placeholder="Qty" value={batchQtyInput} onChange={(e) => setBatchQtyInput(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.35rem' }} />
              <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }} onClick={handleAddProductBatch}>
                + Batch
              </button>
            </div>
            {liveProductBatches.length === 0 ? (
              <div className="text-muted" style={{ fontSize: '0.77rem' }}>
                No batches recorded on {selectedFefoProduct?.name || 'this item'} yet — add a Batch No &amp; Expiry above to run live FEFO allocation.
              </div>
            ) : (
              <div style={{ fontSize: '0.79rem', display: 'grid', gap: '0.22rem' }}>
                {fefoAllocation.allocations.map((a) => (
                  <div key={a.batchNo}>
                    • <b>{a.batchNo}</b> (Exp: {a.expiryDate}) → Pick <b>{a.allocatedQty}</b> pcs
                  </div>
                ))}
                {!fefoAllocation.fulfilled && (
                  <div style={{ color: '#dc2626', fontWeight: 600 }}>Shortfall of {fefoAllocation.shortfall} non-expired units.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (section === 'munim') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <ShieldAlert size={18} style={{ color: '#dc2626' }} /> Section 43B(h) + MSMED Sec 15 (15-Day / Max 45-Day) Shield
              </h3>
              <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.79rem' }}>
                {sec43B.advisoryNote}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={hasWrittenAgreement} onChange={(e) => setHasWrittenAgreement(e.target.checked)} />
                Written Agreement ({hasWrittenAgreement ? `Max ${Math.min(45, agreedDays)}d` : '15d Statutory'})
              </label>
              {hasWrittenAgreement && (
                <input
                  type="number"
                  min="1"
                  max="45"
                  className="form-input"
                  style={{ width: 72, padding: '0.25rem 0.45rem', fontSize: '0.78rem' }}
                  value={agreedDays}
                  onChange={(e) => setAgreedDays(Math.min(45, Math.max(1, Number(e.target.value) || 45)))}
                  title="Agreed Credit Days (Max 45 u/s 15 MSMED Act)"
                />
              )}
              <label style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={treatAllAsMsme} onChange={(e) => setTreatAllAsMsme(e.target.checked)} />
                What-if: Preview unmarked suppliers
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.8rem', marginTop: '0.9rem' }}>
            <div style={{ padding: '0.85rem', borderRadius: 10, background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>MSME Bills Approaching / Past Limit</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{sec43B.criticalCount}</div>
            </div>
            <div style={{ padding: '0.85rem', borderRadius: 10, background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Unpaid MSME Liability</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{formatCurrency(sec43B.totalAtRiskAmount)}</div>
            </div>
            <div style={{ padding: '0.85rem', borderRadius: 10, background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.3)' }}>
              <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 700 }}>Max 31.2% FY-Close Disallowance Risk</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>{formatCurrency(sec43B.estimatedTaxImpact30Pct)}</div>
            </div>
          </div>

          {sec43B.bills.length > 0 && (
            <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.45rem', fontSize: '0.82rem' }}>
              {sec43B.bills.slice(0, 6).map((b, i) => (
                <div key={i} style={{ padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span>
                    <b>{b.supplierName}</b> (#{b.billNumber} · {b.billDate} · {b.statutoryLimitDays}d rule)
                  </span>
                  <span style={{ color: b.daysRemaining < 0 ? '#dc2626' : '#d97706', fontWeight: 700 }}>
                    {b.daysRemaining < 0 ? `OVERDUE BY ${Math.abs(b.daysRemaining)}d` : `${b.daysRemaining}d left`} · {formatCurrency(b.pendingAmount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1.15rem' }}>
            <h4 style={{ margin: '0 0 0.45rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Brain size={17} style={{ color: 'var(--primary)' }} /> Autonomous AI Munim &amp; Margin Arbitrage Radar
            </h4>
            <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.82rem' }}>
              {munim.advisories.map((adv, idx) => (
                <div key={idx} style={{ padding: '0.65rem 0.8rem', borderRadius: 8, background: 'var(--bg-secondary)' }}>
                  • {adv.message}
                </div>
              ))}
              {munim.marginAlerts.slice(0, 3).map((m) => (
                <div key={m.itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.75rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.79rem' }}><b>{m.itemName}</b> ({m.newMarginPercent}% margin)</span>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} onClick={() => handleAutoReprice(m)}>
                    <CheckCircle2 size={13} /> Set ₹{m.suggestedSaleRate}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.15rem' }}>
            <h4 style={{ margin: '0 0 0.45rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Share2 size={17} style={{ color: '#16a34a' }} /> fflate-Compressed B2B Storefront (<code>#b2b-catalog=z.</code>)
            </h4>
            <p className="text-muted" style={{ fontSize: '0.78rem', margin: '0 0 0.65rem' }}>
              65% shorter <code>fflate</code> deflate URL supporting up to <b>150 in-stock items</b>. Static price snapshot — re-share link after updating item rates.
            </p>
            <input className="form-input" readOnly value={serverlessLink} onFocus={(e) => e.target.select()} style={{ fontSize: '0.75rem', marginBottom: '0.65rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(serverlessLink);
                  toast('Compressed Serverless B2B Storefront link copied!', 'success');
                }}
              >
                <Copy size={14} /> Copy Storefront Link
              </button>
              <a
                className="btn btn-primary"
                href={`https://wa.me/?text=${encodeURIComponent(`🛒 *Order Online from ${ownerProfile?.businessName || 'Our Store'}* (Live Cart & Rates):\n${serverlessLink}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Share2 size={14} /> Share Storefront on WhatsApp
              </a>
            </div>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.15rem' }}>
          <h4 style={{ margin: '0 0 0.35rem' }}>
            🏢 Multi-Firm Group Consolidated P&amp;L &amp; Balance Sheet ({groupConsolidated.firmCount} Firm Workspace{groupConsolidated.firmCount === 1 ? '' : 's'})
          </h4>
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0 0 0.8rem' }}>
            Automatically sums all GSTIN workspaces and eliminates inter-firm sales/purchases within your business group.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.7rem', fontSize: '0.82rem' }}>
            <div style={{ padding: '0.75rem', borderRadius: 8, background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.73rem' }}>Net Consolidated Revenue</div>
              <div style={{ fontWeight: 800, fontSize: '1.02rem' }}>{formatCurrency(groupConsolidated.netConsolidatedSales)}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Inter-Firm Eliminated: {formatCurrency(groupConsolidated.interFirmEliminated)}</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: 8, background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.73rem' }}>Net Consolidated Purchases</div>
              <div style={{ fontWeight: 800, fontSize: '1.02rem' }}>{formatCurrency(groupConsolidated.netConsolidatedPurchases)}</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: 8, background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.73rem' }}>Group Net Profit</div>
              <div style={{ fontWeight: 800, fontSize: '1.02rem', color: '#16a34a' }}>{formatCurrency(groupConsolidated.consolidatedNetProfit)}</div>
            </div>
            <div style={{ padding: '0.75rem', borderRadius: 8, background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.73rem' }}>Group Receivables / Payables</div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                Dr {formatCurrency(groupConsolidated.totalReceivables)} · Cr {formatCurrency(groupConsolidated.totalPayables)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
