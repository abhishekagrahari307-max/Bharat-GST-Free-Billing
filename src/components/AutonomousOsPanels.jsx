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
  const [tdsRows, setTdsRows] = useState([
    { partyName: 'Sample Contractor', pan: 'ABCDE1234F', section: '194C', paymentDate: new Date().toISOString().slice(0, 10), amountPaid: 50000, tdsAmount: 1000, challanBsr: '0510301', challanSerial: '00142' },
  ]);

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

  const form26q = useMemo(() => generateForm26QSummary(tdsRows, 'Q3'), [tdsRows]);

  // --- Module B: Multi-Godown, FEFO, BOM & E-Way Validity state ---
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

  const ewayStatus = useMemo(() => {
    const genIso = new Date(Date.now() - Number(ewayGenHoursAgo || 0) * 3600000).toISOString();
    return estimateEwayBillValidity({ distanceKm: ewayDistKm, generatedAtIso: genIso });
  }, [ewayDistKm, ewayGenHoursAgo]);

  const fefoDemo = useMemo(
    () =>
      allocateBatchesFEFO(
        [
          { batchNo: 'B-OCT27', expiryDate: '2027-10-30', qty: 25, mrp: 120 },
          { batchNo: 'B-JAN27', expiryDate: '2027-01-15', qty: 8, mrp: 115 },
          { batchNo: 'B-APR27', expiryDate: '2027-04-10', qty: 15, mrp: 118 },
        ],
        12
      ),
    []
  );

  // --- Module D: Section 43B(h), Autonomous AI Munim & Serverless #b2b-catalog state ---
  const [treatAllAsMsme, setTreatAllAsMsme] = useState(true);
  const sec43B = useMemo(
    () =>
      checkSection43BCompliance({
        purchases,
        clients,
        treatAllUnpaidSuppliersAsMsmeIfUnmarked: treatAllAsMsme,
      }),
    [purchases, clients, treatAllAsMsme]
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
      toast(err?.message || 'Invalid AIS / TIS JSON file', 'error');
    }
  };

  const handleDownloadJson = (filename, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownload26Q = () => {
    const blob = new Blob([form26q.rpuText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Form26Q-${form26q.quarter}-RPU.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Form 26Q RPU text file downloaded!', 'success');
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
    toast(`Pushed Bill #${payload.invoiceNumber} to Companion Extension (and copied JSON)! Open ewaybillgst.gov.in or gst.gov.in to 1-Click Auto-Fill.`, 'success');
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
                <FileSpreadsheet size={18} /> ITR-3 vs ITR-4 (Sec 44AD / 44ADA) + Income Tax AIS / 26AS Engine
              </h3>
              <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
                Reconciles live Bharat GST Turnover, Purchases &amp; Expenses with Income Tax Portal AIS JSON (AY {itrResult.assessmentYear} New Regime Slabs + Sec 87A ₹12L Rebate).
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Upload size={15} /> Upload AIS / TIS JSON
                <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleAisUpload} />
              </label>
              <button type="button" className="btn btn-primary" onClick={() => handleDownloadJson(`BharatGST-ITR-${itrResult.assessmentYear}.json`, itrResult)}>
                <Download size={15} /> Export ITR Working JSON
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.76rem', fontWeight: 600 }}>Digital Receipts % (6% vs 8% 44AD)</label>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem', marginTop: '1rem' }}>
            <div style={{ padding: '0.95rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>{itrResult.itr3.form}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.2rem' }}>Profit: {formatCurrency(itrResult.itr3.netProfit)}</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Tax: <b>{formatCurrency(itrResult.itr3.grossTaxLiability)}</b> · Net Payable: <b>{formatCurrency(itrResult.itr3.netPayableOrRefund)}</b></div>
            </div>
            <div style={{ padding: '0.95rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>{itrResult.itr4.form} {itrResult.itr4.eligible ? '✓ Eligible' : '✗ Turnover Exceeded'}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.2rem' }}>Presumptive: {formatCurrency(itrResult.itr4.presumptiveProfit)}</div>
              <div style={{ fontSize: '0.82rem', marginTop: '0.25rem' }}>Tax: <b>{formatCurrency(itrResult.itr4.grossTaxLiability)}</b> · Net Payable: <b>{formatCurrency(itrResult.itr4.netPayableOrRefund)}</b></div>
            </div>
            <div style={{ padding: '0.95rem', borderRadius: 10, background: 'rgba(22, 163, 74, 0.09)', border: '1px solid rgba(22, 163, 74, 0.35)' }}>
              <div style={{ fontSize: '0.76rem', color: '#16a34a', fontWeight: 700 }}>AI TAX ENGINE RECOMMENDATION</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: '0.2rem' }}>{itrResult.recommendedForm}</div>
              <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Prepaid AIS TDS/TCS: <b>{formatCurrency(itrResult.prepaidTdsTcs)}</b> · Tax Saved: <b>{formatCurrency(itrResult.taxSavedByRecommendation)}</b></div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1.15rem' }}>
            <h4 style={{ margin: '0 0 0.4rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Zap size={17} style={{ color: '#16a34a' }} /> Zero-GSP Chrome/Edge Portal Auto-Fill Bridge
            </h4>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0 0 0.8rem' }}>
              Load <code>companion-extension/</code> unpacked in Chrome/Edge, then push any invoice here to 1-click auto-fill <code>ewaybillgst.gov.in</code> &amp; <code>gst.gov.in</code>.
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
            <h4 style={{ margin: '0 0 0.4rem' }}>TDS Form 26Q Quarterly RPU Generator ({form26q.quarter})</h4>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
              Deductees: <b>{form26q.deducteeCount}</b> · Paid: <b>{formatCurrency(form26q.totalAmountPaid)}</b> · TDS: <b>{formatCurrency(form26q.totalTdsDeducted)}</b>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setTdsRows((prev) => [
                    ...prev,
                    { partyName: `Vendor ${prev.length + 1}`, pan: 'ABCDE1234F', section: '194Q', paymentDate: new Date().toISOString().slice(0, 10), amountPaid: 100000, tdsAmount: 100, challanBsr: '0510301', challanSerial: '00143' },
                  ])
                }
              >
                + Add 194C/194Q Row
              </button>
              <button type="button" className="btn btn-primary" onClick={handleDownload26Q}>
                <Download size={15} /> Download 26Q RPU (.txt)
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
            <h4 style={{ margin: '0 0 0.35rem' }}>FEFO (First-Expiry First-Out) Batch Engine Ready</h4>
            <p className="text-muted" style={{ fontSize: '0.79rem', margin: '0 0 0.5rem' }}>
              Auto-picks earliest non-expired batches during Pharma / FMCG / Kirana billing (12 units allocated across live batches):
            </p>
            <div style={{ fontSize: '0.8rem', display: 'grid', gap: '0.25rem' }}>
              {fefoDemo.allocations.map((a) => (
                <div key={a.batchNo}>
                  • <b>{a.batchNo}</b> (Exp: {a.expiryDate}) → Pick <b>{a.allocatedQty}</b> pcs @ MRP ₹{a.mrp}
                </div>
              ))}
            </div>
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
                <ShieldAlert size={18} style={{ color: '#dc2626' }} /> Income Tax Section 43B(h) MSME 45-Day Payment Disallowance Shield
              </h3>
              <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
                Protects against 31.2% Income Tax disallowance when MSME (Udyam) supplier bills remain unpaid beyond 45 days.
              </p>
            </div>
            <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={treatAllAsMsme} onChange={(e) => setTreatAllAsMsme(e.target.checked)} />
              Scan all unpaid supplier bills (&ge;30 days)
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.8rem', marginTop: '0.9rem' }}>
            <div style={{ padding: '0.85rem', borderRadius: 10, background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Critical Bills (&ge;30 Days)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{sec43B.criticalCount}</div>
            </div>
            <div style={{ padding: '0.85rem', borderRadius: 10, background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>Unpaid Amount at 43B(h) Risk</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{formatCurrency(sec43B.totalAtRiskAmount)}</div>
            </div>
            <div style={{ padding: '0.85rem', borderRadius: 10, background: 'rgba(220, 38, 38, 0.08)', border: '1px solid rgba(220, 38, 38, 0.3)' }}>
              <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 700 }}>Estimated Extra Tax Hit (31.2%)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>{formatCurrency(sec43B.estimatedTaxImpact30Pct)}</div>
            </div>
          </div>

          {sec43B.bills.length > 0 && (
            <div style={{ marginTop: '0.9rem', display: 'grid', gap: '0.45rem', fontSize: '0.82rem' }}>
              {sec43B.bills.slice(0, 6).map((b, i) => (
                <div key={i} style={{ padding: '0.6rem 0.8rem', borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span><b>{b.supplierName}</b> (#{b.billNumber} · {b.billDate})</span>
                  <span style={{ color: b.daysRemaining < 0 ? '#dc2626' : '#d97706', fontWeight: 700 }}>
                    {b.daysRemaining < 0 ? `OVERDUE BY ${Math.abs(b.daysRemaining)}d (43B(h) Disallowed)` : `${b.daysRemaining} days left to 45d limit`} · {formatCurrency(b.pendingAmount)}
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
              <Share2 size={17} style={{ color: '#16a34a' }} /> Zero-Server WhatsApp B2B Storefront (<code>#b2b-catalog=</code>)
            </h4>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '0 0 0.75rem' }}>
              Compresses your live stock &amp; rates into a self-contained URL hash — buyers open a live Mini E-Commerce Storefront in 1 tap with ₹0 server cost!
            </p>
            <input className="form-input" readOnly value={serverlessLink} onFocus={(e) => e.target.select()} style={{ fontSize: '0.75rem', marginBottom: '0.65rem' }} />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  navigator.clipboard?.writeText(serverlessLink);
                  toast('Serverless B2B Storefront link copied!', 'success');
                }}
              >
                <Copy size={14} /> Copy Storefront Link
              </button>
              <a
                className="btn btn-primary"
                href={`https://wa.me/?text=${encodeURIComponent(`🛒 *Order Online from ${ownerProfile?.businessName || 'Our Store'}* (Live Rates & Instant WhatsApp Cart):\n${serverlessLink}`)}`}
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
