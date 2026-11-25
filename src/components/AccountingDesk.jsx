import { useState, useEffect, useMemo, useCallback } from 'react';
import { BookOpen, Landmark, ShieldCheck, Plus, Trash2, Download, Upload, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { getJournalVouchers, saveJournalVouchers, getAllDebitNotes } from '../store';
import { formatCurrency } from '../utils';
import {
  VOUCHER_TYPES,
  CHART_OF_ACCOUNTS,
  deriveAutoJournalEntries,
  validateManualVoucher,
  computeTrialBalance,
  computeBalanceSheet,
  computeInventoryValuation,
  getAccountMeta,
  r2,
} from '../utils/doubleEntry';
import {
  buildAuditChainFromVouchers,
  verifyAuditChain,
  buildCaWorkpaperBundle,
  sealCaPackage,
  openCaPackage,
} from '../utils/hashChain';
import { auditInvoicesForGst } from '../utils/gstAudit';
import { checkSection43BCompliance } from '../utils/autonomousMunimAnd43B';
import { computeBusinessITR } from '../utils/itrAndTaxEngine';
import { getIndianFinancialYear } from '../utils/canonicalAdapter';
import TableExport from './TableExport';
import { toast } from './Toast';
import { runTrackedExportJob } from '../utils/trackedDownload';

function defaultLinesForType(type) {
  if (type === 'CONTRA') {
    return [
      { account: 'BANK_ACCOUNTS', debit: '', credit: '' },
      { account: 'CASH_IN_HAND', debit: '', credit: '' },
    ];
  }
  if (type === 'PAYMENT') {
    return [
      { account: 'OPERATING_EXPENSES', debit: '', credit: '' },
      { account: 'BANK_ACCOUNTS', debit: '', credit: '' },
    ];
  }
  if (type === 'RECEIPT') {
    return [
      { account: 'BANK_ACCOUNTS', debit: '', credit: '' },
      { account: 'OWNER_CAPITAL', debit: '', credit: '' },
    ];
  }
  return [
    { account: 'DEPRECIATION', debit: '', credit: '' },
    { account: 'FIXED_ASSETS', debit: '', credit: '' },
  ];
}

export default function AccountingDesk({
  mode = 'doubleentry',
  bills = [],
  purchases = [],
  expenses = [],
  products = [],
  ownerProfile = null,
  periodLabel = 'All Periods',
}) {
  const [manualVouchers, setManualVouchers] = useState([]);
  const [debitNotes, setDebitNotes] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [voucherType, setVoucherType] = useState('JOURNAL');
  const [voucherDate, setVoucherDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [voucherNo, setVoucherNo] = useState('');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState(() => defaultLinesForType('JOURNAL'));

  const [auditChain, setAuditChain] = useState([]);
  const [chainVerify, setChainVerify] = useState({ valid: true, checkedCount: 0, headHash: '0'.repeat(64) });
  const [caPassphrase, setCaPassphrase] = useState('');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [inspectedCaPkg, setInspectedCaPkg] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      getJournalVouchers().catch(() => []),
      getAllDebitNotes().catch(() => []),
    ]).then(([jvs, dns]) => {
      if (!active) return;
      setManualVouchers(Array.isArray(jvs) ? jvs : []);
      setDebitNotes(Array.isArray(dns) ? dns : []);
    });
    return () => { active = false; };
  }, []);

  const openVoucherComposer = useCallback((typeCode) => {
    setVoucherType(typeCode);
    setLines(defaultLinesForType(typeCode));
    setVoucherNo('');
    setNarration('');
    setComposerOpen(true);
  }, []);

  // Tally-style F4 / F5 / F6 / F7 shortcuts while viewing Double-Entry tab
  useEffect(() => {
    if (mode !== 'doubleentry') return undefined;
    const onKey = (e) => {
      const map = { F4: 'CONTRA', F5: 'PAYMENT', F6: 'RECEIPT', F7: 'JOURNAL' };
      if (map[e.key]) {
        e.preventDefault();
        openVoucherComposer(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, openVoucherComposer]);

  const autoVouchers = useMemo(
    () => deriveAutoJournalEntries({ bills, purchases, debitNotes, expenses }),
    [bills, purchases, debitNotes, expenses]
  );

  const allVouchers = useMemo(
    () => [...autoVouchers, ...manualVouchers],
    [autoVouchers, manualVouchers]
  );

  const trialBalance = useMemo(() => computeTrialBalance(allVouchers), [allVouchers]);
  const closingStockValue = useMemo(() => computeInventoryValuation(products), [products]);
  const balanceSheet = useMemo(
    () => computeBalanceSheet(trialBalance, { closingStockValue }),
    [trialBalance, closingStockValue]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const chain = await buildAuditChainFromVouchers(allVouchers);
      const res = await verifyAuditChain(chain);
      if (!active) return;
      setAuditChain(chain);
      setChainVerify(res);
    })();
    return () => { active = false; };
  }, [allVouchers]);

  const draftTotals = useMemo(() => {
    const dr = r2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
    const cr = r2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
    return { dr, cr, diff: r2(Math.abs(dr - cr)) };
  }, [lines]);

  const handleLineChange = (idx, field, val) => {
    setLines((prev) => prev.map((row, i) => {
      if (i !== idx) return row;
      if (field === 'debit' && Number(val) > 0) return { ...row, debit: val, credit: '' };
      if (field === 'credit' && Number(val) > 0) return { ...row, credit: val, debit: '' };
      return { ...row, [field]: val };
    }));
  };

  const handleSaveVoucher = async (e) => {
    e.preventDefault();
    const check = validateManualVoucher({
      voucherType,
      voucherNo,
      date: voucherDate,
      narration,
      lines,
    });
    if (!check.valid) {
      toast(check.error, 'error');
      return;
    }
    const updated = [check.voucher, ...manualVouchers];
    try {
      await saveJournalVouchers(updated);
      setManualVouchers(updated);
      setComposerOpen(false);
      toast(`${check.voucher.voucherType} Voucher (${check.voucher.voucherNo}) posted — Debit = Credit ₹${check.totalDebit.toFixed(2)}`, 'success');
    } catch (err) {
      toast(err?.message || 'Could not save voucher', 'error');
    }
  };

  const handleDeleteManualVoucher = async (id) => {
    const updated = manualVouchers.filter((v) => v.id !== id);
    try {
      await saveJournalVouchers(updated);
      setManualVouchers(updated);
      toast('Manual voucher removed', 'info');
    } catch (err) {
      toast(err?.message || 'Could not remove voucher', 'error');
    }
  };

  const handleReverifyChain = async () => {
    const res = await verifyAuditChain(auditChain);
    setChainVerify(res);
    if (res.valid) {
      toast(`SHA-256 Audit Chain verified: ${res.checkedCount} tamper-proof blocks intact.`, 'success');
    } else {
      toast(`Tamper alert: ${res.reason}`, 'error');
    }
  };

  const handleExportCaPackage = async () => {
    try {
      const isEnc = Boolean(caPassphrase.trim());
      const bizSlug = String(ownerProfile?.businessName || 'BharatGST').replace(/[^a-zA-Z0-9_-]+/g, '-');
      await runTrackedExportJob({
        category: 'ca-package',
        label: isEnc ? 'Encrypted CA Package (.bharatca)' : 'CA Workpaper Package (.bharatca)',
        portalAdvisory: 'Contains accounting & GST workpapers — share privately with your CA',
        buildFn: async ({ setPhase }) => {
          setPhase('Auditing GST books & assembling Trial Balance…');
          const gstHealth = auditInvoicesForGst(bills, { sellerGstin: ownerProfile?.gstin || '', sellerState: ownerProfile?.state || '' });
          const fy = getIndianFinancialYear();
          const res43b = checkSection43BCompliance(purchases, []);
          const itrRes = computeBusinessITR({
            bills,
            purchases,
            expenses,
            fy,
            ownerGstin: ownerProfile?.gstin || '',
          });
          const tbRows = trialBalance?.rows || [];
          const outTax = tbRows
            .filter((r) => /^OUTPUT_(CGST|SGST|IGST|CESS)$/.test(r.code))
            .reduce((s, r) => s + (Number(r.closingCredit || 0) - Number(r.closingDebit || 0)), 0);
          const inTax = tbRows
            .filter((r) => /^INPUT_(CGST|SGST|IGST|CESS)$/.test(r.code))
            .reduce((s, r) => s + (Number(r.closingDebit || 0) - Number(r.closingCredit || 0)), 0);
          const bundle = await buildCaWorkpaperBundle({
            profile: ownerProfile || {},
            periodLabel,
            trialBalance,
            balanceSheet,
            gstHealth,
            statutorySummary: {
              netGstPayable: Math.max(0, Math.round((outTax - inTax) * 100) / 100),
              sec43bAtRiskAmount: res43b.totalAtRiskAmount || 0,
              sec43bCriticalCount: res43b.criticalCount || 0,
              itrTaxableTurnover: itrRes.grossTurnover || 0,
            },
            vouchers: allVouchers,
            auditChain,
          });
          setPhase(isEnc ? 'Sealing package with AES-256-GCM…' : 'Serializing .bharatca bundle…');
          const serialized = await sealCaPackage(bundle, caPassphrase);
          return {
            content: serialized,
            mimeType: 'application/json',
            filename: `${bizSlug}-CA-Workpapers-${new Date().toISOString().slice(0, 10)}.bharatca`,
          };
        },
      });
      toast(
        isEnc
          ? 'AES-256-GCM .bharatca ready — browser download initiated!'
          : 'CA Workpaper Package (.bharatca) ready — browser download initiated!',
        'success'
      );
    } catch (err) {
      toast(err?.message || 'Failed to generate CA package', 'error');
    }
  };

  const handleImportCaFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const opened = await openCaPackage(text, importPassphrase);
      const verify = await verifyAuditChain(opened.auditChain || []);
      setInspectedCaPkg({ ...opened, liveVerify: verify });
      toast(`Opened CA Package for ${opened.business?.name || 'Client'} (${verify.checkedCount} SHA-256 blocks)`, 'success');
    } catch (err) {
      toast(err?.message || 'Could not open .bharatca file', 'error');
    }
  };

  if (mode === 'balancesheet') {
    const bsRows = [
      ...balanceSheet.equity.map((r) => ['Equity & Reserves', r.group, r.name, r.amount]),
      ...balanceSheet.liabilities.map((r) => ['Liabilities', r.group, r.name, r.amount]),
      ['TOTAL EQUITY & LIABILITIES', '', '', balanceSheet.totalEquityAndLiabilities],
      ...balanceSheet.assets.map((r) => ['Assets', r.group, r.name, r.amount]),
      ['TOTAL ASSETS', '', '', balanceSheet.totalAssets],
    ];

    return (
      <div>
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Landmark size={18} /> Schedule III Balance Sheet ({periodLabel})
              </h3>
              <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.84rem' }}>
                Auto-compiled from Double-Entry Trial Balance + Inventory Valuation at Cost + Current Period Net Profit/Loss.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  padding: '0.32rem 0.75rem',
                  borderRadius: '999px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  background: balanceSheet.isBalanced ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                  color: balanceSheet.isBalanced ? '#059669' : '#dc2626',
                }}
              >
                {balanceSheet.isBalanced
                  ? `✓ Tallied (Assets = Liabilities ₹${balanceSheet.totalAssets.toLocaleString('en-IN')})`
                  : `Difference: ₹${balanceSheet.difference.toFixed(2)}`}
              </span>
              <TableExport
                title="Schedule III Balance Sheet"
                filename={`Balance-Sheet-${periodLabel}`}
                subtitle={ownerProfile?.businessName || 'Bharat GST Free Billing'}
                headers={['Side', 'Schedule III Group', 'Particulars', 'Amount (INR)']}
                rows={bsRows}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ marginTop: 0, marginBottom: '0.85rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              I. Equity &amp; Liabilities
            </h4>
            <table className="data-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Particulars</th>
                  <th>Group</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {balanceSheet.equity.map((item) => (
                  <tr key={item.code}>
                    <td className="font-medium">{item.name}</td>
                    <td className="text-muted" style={{ fontSize: '0.78rem' }}>{item.group}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                {balanceSheet.liabilities.map((item) => (
                  <tr key={item.code}>
                    <td className="font-medium">{item.name}</td>
                    <td className="text-muted" style={{ fontSize: '0.78rem' }}>{item.group}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-color)' }}>
                  <td colSpan={2}>Total Equity &amp; Liabilities</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(balanceSheet.totalEquityAndLiabilities)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ marginTop: 0, marginBottom: '0.85rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              II. Assets
            </h4>
            <table className="data-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Particulars</th>
                  <th>Group</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {balanceSheet.assets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                      Create an invoice, purchase, or opening Journal Voucher (F7) to populate assets.
                    </td>
                  </tr>
                ) : (
                  balanceSheet.assets.map((item) => (
                    <tr key={item.code}>
                      <td className="font-medium">{item.name}</td>
                      <td className="text-muted" style={{ fontSize: '0.78rem' }}>{item.group}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.amount)}</td>
                    </tr>
                  ))
                )}
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-color)' }}>
                  <td colSpan={2}>Total Assets</td>
                  <td style={{ textAlign: 'right' }}>{formatCurrency(balanceSheet.totalAssets)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'cadesk') {
    return (
      <div>
        <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={19} /> Tamper-Proof SHA-256 Audit Trail (MCA Rule 3(1) Ready)
              </h3>
              <p className="text-muted" style={{ margin: '0.3rem 0 0', fontSize: '0.84rem' }}>
                Every financial voucher is chained cryptographically from Genesis (<code>0000…0000</code>) to HEAD. Any altered amount or date breaks the SHA-256 digest immediately.
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={handleReverifyChain}>
              <CheckCircle2 size={16} /> Verify SHA-256 Chain ({chainVerify.checkedCount} blocks)
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem', marginTop: '1rem' }}>
            <div style={{ padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>Integrity Status</div>
              <div style={{ fontWeight: 700, marginTop: '0.25rem', color: chainVerify.valid ? '#059669' : '#dc2626', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {chainVerify.valid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                {chainVerify.valid ? '100% Verified & Intact' : `Tampered (${chainVerify.reason})`}
              </div>
            </div>
            <div style={{ padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>Chained Vouchers</div>
              <div style={{ fontWeight: 700, fontSize: '1.15rem', marginTop: '0.25rem' }}>{chainVerify.checkedCount}</div>
            </div>
            <div style={{ padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
              <div className="text-muted" style={{ fontSize: '0.76rem' }}>Current HEAD SHA-256 Digest</div>
              <code style={{ display: 'block', fontSize: '0.74rem', marginTop: '0.3rem', wordBreak: 'break-all' }}>
                {chainVerify.headHash}
              </code>
            </div>
          </div>

          {auditChain.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
              <table className="data-table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th>Block #</th>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Prev Hash</th>
                    <th>Block SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {auditChain.slice(-12).reverse().map((b) => (
                    <tr key={b.index}>
                      <td>#{b.index}</td>
                      <td>{b.date}</td>
                      <td className="font-medium">{b.voucherNo}</td>
                      <td><span style={{ fontSize: '0.75rem' }}>{b.voucherType}</span></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(b.totalAmount)}</td>
                      <td><code style={{ fontSize: '0.72rem' }}>{b.prevHash.slice(0, 12)}…</code></td>
                      <td><code style={{ fontSize: '0.72rem', color: '#059669' }}>{b.hash.slice(0, 16)}…</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Download size={17} /> Send Encrypted Workpapers to CA (<code>.bharatca</code>)
            </h4>
            <p className="text-muted" style={{ fontSize: '0.83rem' }}>
              Bundles your Trial Balance, Schedule III Balance Sheet, CA GST Readiness Scorecard, Vouchers, and SHA-256 Audit Chain Proof into one file for WhatsApp/Email.
            </p>
            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Lock size={13} /> Optional AES-256-GCM Password (share with your CA)
              </label>
              <input
                type="password"
                className="form-input"
                placeholder="Leave blank for unencrypted .bharatca JSON"
                value={caPassphrase}
                onChange={(e) => setCaPassphrase(e.target.value)}
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={handleExportCaPackage}>
              <Download size={16} /> Export .bharatca CA Package
            </button>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h4 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Upload size={17} /> CA Accountant Desk — Inspect Client <code>.bharatca</code>
            </h4>
            <p className="text-muted" style={{ fontSize: '0.83rem' }}>
              Chartered Accountants can open any client&apos;s <code>.bharatca</code> package here to verify SHA-256 audit integrity, Trial Balance, and Balance Sheet without overwriting local books.
            </p>
            <div className="form-group" style={{ marginBottom: '0.85rem' }}>
              <label className="form-label">Decryption Password (if client locked the file)</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter client password if encrypted"
                value={importPassphrase}
                onChange={(e) => setImportPassphrase(e.target.value)}
              />
            </div>
            <label className="btn btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <Upload size={16} /> Open Client .bharatca File
              <input type="file" accept=".bharatca,.json" style={{ display: 'none' }} onChange={handleImportCaFile} />
            </label>

            {inspectedCaPkg && (
              <div style={{ marginTop: '1rem', padding: '0.9rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', fontSize: '0.83rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {inspectedCaPkg.business?.name} {inspectedCaPkg.business?.gstin ? `(${inspectedCaPkg.business.gstin})` : ''}
                </div>
                <div className="text-muted" style={{ marginBottom: '0.5rem' }}>
                  Generated: {new Date(inspectedCaPkg.generatedAt).toLocaleString('en-IN')}
                </div>
                <div>• <b>SHA-256 Chain:</b> {inspectedCaPkg.liveVerify?.valid ? `✓ Verified (${inspectedCaPkg.liveVerify.checkedCount} blocks)` : '✗ Tampered'}</div>
                <div>• <b>Trial Balance:</b> Dr {formatCurrency(inspectedCaPkg.trialBalance?.totalDebit || 0)} = Cr {formatCurrency(inspectedCaPkg.trialBalance?.totalCredit || 0)}</div>
                <div>• <b>Balance Sheet Assets:</b> {formatCurrency(inspectedCaPkg.balanceSheet?.totalAssets || 0)} (Net Profit: {formatCurrency(inspectedCaPkg.balanceSheet?.netProfit || 0)})</div>
                {inspectedCaPkg.gstHealthSummary && (
                  <div>• <b>GST Readiness Score:</b> {inspectedCaPkg.gstHealthSummary.score}/100 (Grade {inspectedCaPkg.gstHealthSummary.grade})</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default: mode === 'doubleentry' (Trial Balance + F4-F7 Vouchers)
  return (
    <div>
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={18} /> Double-Entry Ledger &amp; Tally-Style Vouchers
            </h3>
            <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.83rem' }}>
              Sales, Purchases, Debit/Credit Notes &amp; Expenses auto-post into double-entry ledgers. Use F4–F7 below for Contra, Payment, Receipt &amp; Journal adjustments.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {VOUCHER_TYPES.map((vt) => (
              <button
                key={vt.code}
                type="button"
                className={`btn ${composerOpen && voucherType === vt.code ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => openVoucherComposer(vt.code)}
                title={vt.hint}
              >
                <Plus size={14} /> {vt.label}
              </button>
            ))}
          </div>
        </div>

        {composerOpen && (
          <form onSubmit={handleSaveVoucher} style={{ marginTop: '1.15rem', paddingTop: '1.15rem', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Voucher Type</label>
                <select
                  className="form-input"
                  value={voucherType}
                  onChange={(e) => {
                    setVoucherType(e.target.value);
                    setLines(defaultLinesForType(e.target.value));
                  }}
                >
                  {VOUCHER_TYPES.map((vt) => (
                    <option key={vt.code} value={vt.code}>{vt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Voucher Date</label>
                <input type="date" className="form-input" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Voucher No. (optional)</label>
                <input type="text" className="form-input" placeholder="Auto-generated if blank" value={voucherNo} onChange={(e) => setVoucherNo(e.target.value)} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Narration / Particulars</label>
                <input type="text" className="form-input" placeholder="e.g. Cash deposited to HDFC Bank / Capital introduced" value={narration} onChange={(e) => setNarration(e.target.value)} />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ marginBottom: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>Ledger Account</th>
                    <th style={{ width: '160px', textAlign: 'right' }}>Debit (Dr ₹)</th>
                    <th style={{ width: '160px', textAlign: 'right' }}>Credit (Cr ₹)</th>
                    <th style={{ width: '56px' }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <select
                          className="form-input"
                          value={line.account}
                          onChange={(e) => handleLineChange(idx, 'account', e.target.value)}
                        >
                          {CHART_OF_ACCOUNTS.map((acc) => (
                            <option key={acc.code} value={acc.code}>
                              {acc.name} ({acc.group})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-input"
                          style={{ textAlign: 'right' }}
                          placeholder="0.00"
                          value={line.debit}
                          onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="form-input"
                          style={{ textAlign: 'right' }}
                          placeholder="0.00"
                          value={line.credit}
                          onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {lines.length > 2 && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.5rem' }}
                            onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setLines((prev) => [...prev, { account: 'OPERATING_EXPENSES', debit: '', credit: '' }])}
                >
                  <Plus size={14} /> Add Line
                </button>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Total Dr: {formatCurrency(draftTotals.dr)} · Total Cr: {formatCurrency(draftTotals.cr)} ·{' '}
                  <span style={{ color: draftTotals.diff < 0.01 && draftTotals.dr > 0 ? '#059669' : '#dc2626' }}>
                    {draftTotals.diff < 0.01 && draftTotals.dr > 0 ? 'Balanced ✓' : `Diff: ${formatCurrency(draftTotals.diff)}`}
                  </span>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setComposerOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Post Voucher</button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Trial Balance */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
              ⚖️ Trial Balance ({allVouchers.length} vouchers: {autoVouchers.length} auto + {manualVouchers.length} manual)
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '0.3rem 0.75rem',
                borderRadius: '999px',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: trialBalance.isBalanced ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                color: trialBalance.isBalanced ? '#059669' : '#dc2626',
              }}
            >
              {trialBalance.isBalanced ? '✓ Debit = Credit Balanced' : `Diff ₹${trialBalance.difference.toFixed(2)}`}
            </span>
            <TableExport
              title="Trial Balance"
              filename={`Trial-Balance-${periodLabel}`}
              subtitle={ownerProfile?.businessName || 'Bharat GST Free Billing'}
              headers={['Account Head', 'Schedule III Group', 'Closing Debit (INR)', 'Closing Credit (INR)']}
              rows={[
                ...trialBalance.rows.map((r) => [r.name, r.group, r.closingDebit, r.closingCredit]),
                ['TOTAL', '', trialBalance.totalDebit, trialBalance.totalCredit],
              ]}
            />
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ marginBottom: 0 }}>
            <thead>
              <tr>
                <th>Ledger Account</th>
                <th>Accounting Group</th>
                <th style={{ textAlign: 'right' }}>Closing Debit (Dr)</th>
                <th style={{ textAlign: 'right' }}>Closing Credit (Cr)</th>
              </tr>
            </thead>
            <tbody>
              {trialBalance.rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>
                    No ledger postings yet. Create an invoice, purchase, expense, or click Journal (F7) above to enter opening balances.
                  </td>
                </tr>
              ) : (
                trialBalance.rows.map((r) => (
                  <tr key={r.code}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-muted" style={{ fontSize: '0.79rem' }}>{r.group}</td>
                    <td style={{ textAlign: 'right', fontWeight: r.closingDebit > 0 ? 600 : 400 }}>
                      {r.closingDebit > 0 ? formatCurrency(r.closingDebit) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: r.closingCredit > 0 ? 600 : 400 }}>
                      {r.closingCredit > 0 ? formatCurrency(r.closingCredit) : '—'}
                    </td>
                  </tr>
                ))
              )}
              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-color)' }}>
                <td colSpan={2}>Grand Total</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(trialBalance.totalDebit)}</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(trialBalance.totalCredit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Vouchers Register */}
      {manualVouchers.length > 0 && (
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>📒 Manual F4–F7 Voucher Register ({manualVouchers.length})</h4>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Voucher No</th>
                  <th>Type</th>
                  <th>Particulars &amp; Postings</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ width: '56px' }} />
                </tr>
              </thead>
              <tbody>
                {manualVouchers.map((v) => {
                  const amt = r2((v.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0));
                  return (
                    <tr key={v.id}>
                      <td>{v.date}</td>
                      <td className="font-medium">{v.voucherNo}</td>
                      <td>{v.voucherType}</td>
                      <td>
                        <div>{v.narration}</div>
                        <div className="text-muted" style={{ fontSize: '0.76rem' }}>
                          {(v.lines || []).map((l, i) => (
                            <span key={i} style={{ marginRight: '0.75rem' }}>
                              {l.debit > 0 ? 'Dr' : 'Cr'} {getAccountMeta(l.account).name}: {formatCurrency(l.debit || l.credit)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(amt)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.5rem' }}
                          onClick={() => handleDeleteManualVoucher(v.id)}
                          title="Delete manual voucher"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
