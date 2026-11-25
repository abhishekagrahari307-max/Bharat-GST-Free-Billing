import { useState, useEffect, useMemo } from 'react';
import {
  CalendarCheck2,
  Lock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Package,
  Users,
  BookOpen,
} from 'lucide-react';
import {
  getAllClients,
  getAllDebitNotes,
  getJournalVouchers,
  saveJournalVouchers,
  getPeriodLock,
  setPeriodLock,
  triggerBackup,
} from '../store';
import { formatCurrency } from '../utils';
import { getIndianFinancialYear } from '../utils/canonicalAdapter';
import { getAccountMeta } from '../utils/doubleEntry';
import {
  computeYearEndRolloverPlan,
  buildYearEndRolloverArchive,
} from '../utils/yearEndRolloverEngine';
import { startOperation, updateOperation, finishOperation } from '../utils/operationRegistry';
import { triggerTrackedBrowserDownload } from '../utils/trackedDownload';
import TableExport from './TableExport';
import { confirmAction } from './ConfirmModal';
import { toast } from './Toast';

const FY_CHOICES = ['2024-25', '2025-26', '2026-27', '2027-28'];

export default function YearEndRolloverPanel({
  bills = [],
  purchases = [],
  expenses = [],
  products = [],
  ownerProfile = null,
  onRolloverCompleted,
}) {
  const defaultClosingFy = useMemo(() => {
    const cur = getIndianFinancialYear();
    const startYr = Number(cur.slice(0, 4)) - 1;
    const prevFy = `${startYr}-${String((startYr + 1) % 100).padStart(2, '0')}`;
    return FY_CHOICES.includes(prevFy) ? prevFy : cur;
  }, []);

  const [closingFy, setClosingFy] = useState(defaultClosingFy);
  const [clients, setClients] = useState([]);
  const [debitNotes, setDebitNotes] = useState([]);
  const [manualVouchers, setManualVouchers] = useState([]);
  const [currentLockDate, setCurrentLockDate] = useState('');
  const [lockClosedBooks, setLockClosedBooks] = useState(true);
  const [exportArchiveJson, setExportArchiveJson] = useState(true);
  const [executing, setExecuting] = useState(false);

  const loadAuxRecords = async () => {
    const [cls, dns, jvs, lockRes] = await Promise.all([
      getAllClients().catch(() => []),
      getAllDebitNotes().catch(() => []),
      getJournalVouchers().catch(() => []),
      getPeriodLock().catch(() => ({ upTo: '' })),
    ]);
    setClients(Array.isArray(cls) ? cls : []);
    setDebitNotes(Array.isArray(dns) ? dns : []);
    setManualVouchers(Array.isArray(jvs) ? jvs : []);
    setCurrentLockDate(String(lockRes?.upTo || ''));
  };

  useEffect(() => {
    loadAuxRecords();
  }, []);

  const plan = useMemo(
    () =>
      computeYearEndRolloverPlan({
        closingFy,
        profile: ownerProfile,
        bills,
        purchases,
        expenses,
        debitNotes,
        manualVouchers,
        products,
        clients,
      }),
    [closingFy, ownerProfile, bills, purchases, expenses, debitNotes, manualVouchers, products, clients]
  );

  const handleExecuteRollover = async () => {
    const ok = await confirmAction({
      title: `Close FY ${plan.window.closingFy} & Roll Over to FY ${plan.window.nextFy}?`,
      message: `This will create a pre-rollover safety backup, post a balanced 1-April (${plan.window.nextFyStartDate}) Opening Balance Journal Voucher (₹${plan.accountingSummary.openingTotalDebit.toLocaleString('en-IN')})${lockClosedBooks ? `, and close books up to ${plan.window.endDate}` : ''}. Existing invoices and stock quantities are never deleted.`,
      confirmLabel: `Roll Over to FY ${plan.window.nextFy}`,
      tone: 'warning',
    });
    if (!ok) return;

    setExecuting(true);
    const totalSteps = 4;
    const opId = startOperation({
      category: 'backup',
      label: `FY ${plan.window.closingFy} → ${plan.window.nextFy} Rollover`,
      phase: 'Step 1/4: Creating pre-rollover safety snapshot…',
      destination: 'Local Workspace',
      total: totalSteps,
      completed: 0,
    });

    try {
      await triggerBackup().catch(() => {});
      updateOperation(opId, {
        completed: 1,
        total: totalSteps,
        phase: `Step 2/4: Posting 1-April (${plan.window.nextFyStartDate}) Opening Balance Journal Voucher…`,
      });

      if (plan.accountingSummary.openingVoucher && plan.accountingSummary.openingVoucherValid) {
        const filtered = manualVouchers.filter(
          (v) => v?.id !== plan.accountingSummary.openingVoucher.id
        );
        const updatedVouchers = [...filtered, plan.accountingSummary.openingVoucher];
        await saveJournalVouchers(updatedVouchers);
        setManualVouchers(updatedVouchers);
      }

      updateOperation(opId, {
        completed: 2,
        total: totalSteps,
        phase: lockClosedBooks
          ? `Step 3/4: Locking closed FY books up to ${plan.window.endDate}…`
          : 'Step 3/4: Skipping period lock (kept open by user)…',
      });

      let lockWarning = '';
      if (lockClosedBooks && (!currentLockDate || currentLockDate < plan.window.endDate)) {
        try {
          await setPeriodLock(plan.window.endDate);
          setCurrentLockDate(plan.window.endDate);
        } catch (lockErr) {
          lockWarning = lockErr?.message || 'Period lock requires PIN in Settings -> Data';
        }
      }

      updateOperation(opId, {
        completed: 3,
        total: totalSteps,
        phase: 'Step 4/4: Finalizing Year-End Closing & Opening Schedule…',
      });

      if (exportArchiveJson) {
        const archive = buildYearEndRolloverArchive(plan);
        const slug = String(plan.businessName || 'BharatGST').replace(/[^a-zA-Z0-9_-]+/g, '-');
        triggerTrackedBrowserDownload({
          content: JSON.stringify(archive, null, 2),
          mimeType: 'application/json',
          filename: `${slug}-FY-${plan.window.closingFy}-to-${plan.window.nextFy}-Rollover.json`,
          category: 'backup',
          label: `Year-End Rollover Schedule (FY ${plan.window.closingFy})`,
        });
      }

      finishOperation(opId, {
        status: lockWarning ? 'partial' : 'success',
        completed: totalSteps,
        total: totalSteps,
        phase: lockWarning
          ? `Opening Voucher posted; Period Lock skipped (${lockWarning})`
          : `FY ${plan.window.closingFy} rolled over cleanly to ${plan.window.nextFyStartDate}!`,
      });

      toast(
        `FY ${plan.window.closingFy} closing balances transferred to ${plan.window.nextFyStartDate}!`,
        lockWarning ? 'warning' : 'success'
      );
      if (typeof onRolloverCompleted === 'function') onRolloverCompleted();
    } catch (err) {
      finishOperation(opId, { status: 'failed', error: err });
      toast(err?.message || 'Year-End Rollover failed', 'error');
    } finally {
      setExecuting(false);
    }
  };

  const partyExportRows = plan.partySummary.parties.map((p) => [
    p.partyName,
    p.gstin || 'Unregistered',
    p.isMsme ? `Yes (${p.udyamNo || 'MSME'})` : 'No',
    p.receivableClosing,
    p.payableClosing,
    p.netType === 'DR_RECEIVABLE' ? 'Dr (Receivable)' : 'Cr (Payable)',
  ]);

  const stockExportRows = plan.inventorySummary.items.map((it) => [
    it.name,
    it.hsn || '—',
    it.unit,
    it.closingQty,
    it.unitCostBasis,
    it.closingCostValue,
    it.closingRetailValue,
  ]);

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.8rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <CalendarCheck2 size={19} style={{ color: '#2563eb' }} />
            Multi-Financial Year Rollover (31 मार्च Year-End Closing Wizard)
          </h3>
          <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
            31 मार्च के क्लोजिंग स्टॉक, पार्टी उधारी/लेनदारी (Debtors &amp; Creditors) और लेजर बैलेंस को 1-क्लिक में नए वित्त वर्ष (1 अप्रैल) के संतुलित ओपनिंग वाउचर में ट्रांसफर करें।
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label htmlFor="closing-fy-select" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
            Closing FY:
          </label>
          <select
            id="closing-fy-select"
            value={closingFy}
            onChange={(e) => setClosingFy(e.target.value)}
            className="form-input"
            style={{ width: 'auto', minWidth: '130px' }}
          >
            {FY_CHOICES.map((fy) => (
              <option key={fy} value={fy}>
                FY {fy}
              </option>
            ))}
          </select>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--primary, #2563eb)',
              padding: '0.3rem 0.6rem',
              borderRadius: '8px',
              background: 'rgba(37, 99, 235, 0.1)',
            }}
          >
            <ArrowRight size={14} /> Opens FY {plan.window.nextFy} ({plan.window.nextFyStartDate})
          </span>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="text-muted" style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Package size={13} /> 31-Mar Closing Stock (Cost)
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.12rem', marginTop: '0.2rem' }}>
            {formatCurrency(plan.inventorySummary.closingStockCostValue)}
          </div>
          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
            {plan.inventorySummary.skuCount} SKUs · {plan.inventorySummary.totalUnits} units
          </div>
        </div>

        <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="text-muted" style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Users size={13} /> Sundry Debtors (Receivable)
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.12rem', color: '#059669', marginTop: '0.2rem' }}>
            {formatCurrency(plan.partySummary.totalReceivables)}
          </div>
          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
            Carried forward to 1-Apr Khata
          </div>
        </div>

        <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="text-muted" style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Users size={13} /> Sundry Creditors (Payable)
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.12rem', color: '#d97706', marginTop: '0.2rem' }}>
            {formatCurrency(plan.partySummary.totalPayables)}
          </div>
          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
            {plan.partySummary.msmeYearEndSupplierCount > 0
              ? `⚠️ ${plan.partySummary.msmeYearEndSupplierCount} MSME unpaid`
              : '0 tagged MSME overdue'}
          </div>
        </div>

        <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="text-muted" style={{ fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <BookOpen size={13} /> 1-Apr Opening Voucher (Dr = Cr)
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.12rem', color: '#2563eb', marginTop: '0.2rem' }}>
            {formatCurrency(plan.accountingSummary.openingTotalDebit)}
          </div>
          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
            {plan.alreadyRolledOver ? '✓ Already posted (will update idempotently)' : 'Ready to post OB Journal'}
          </div>
        </div>
      </div>

      {/* Statutory & Rollover Advisories */}
      <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '1rem' }}>
        {plan.advisories.map((adv, idx) => (
          <div
            key={idx}
            style={{
              padding: '0.55rem 0.75rem',
              borderRadius: '8px',
              fontSize: '0.78rem',
              background: adv.includes('43B(h)') ? 'rgba(220, 38, 38, 0.1)' : 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
            }}
          >
            {adv}
          </div>
        ))}
      </div>

      {/* Opening Journal Preview */}
      {plan.accountingSummary.openingVoucher && (
        <div style={{ marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
            📒 1-April ({plan.window.nextFyStartDate}) Opening Balance Journal Preview — <code>{plan.accountingSummary.openingVoucher.voucherNo}</code>
          </h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                  <th style={{ padding: '0.45rem' }}>Ledger Account</th>
                  <th style={{ padding: '0.45rem' }}>Group</th>
                  <th style={{ padding: '0.45rem', textAlign: 'right' }}>Opening Debit (₹)</th>
                  <th style={{ padding: '0.45rem', textAlign: 'right' }}>Opening Credit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {plan.accountingSummary.openingVoucher.lines.map((line) => {
                  const meta = getAccountMeta(line.account);
                  return (
                    <tr key={line.account} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.42rem', fontWeight: 600 }}>{meta.name}</td>
                      <td style={{ padding: '0.42rem' }} className="text-muted">{meta.group}</td>
                      <td style={{ padding: '0.42rem', textAlign: 'right' }}>
                        {line.debit > 0 ? formatCurrency(line.debit) : '—'}
                      </td>
                      <td style={{ padding: '0.42rem', textAlign: 'right' }}>
                        {line.credit > 0 ? formatCurrency(line.credit) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rollover Controls & Schedule Exports */}
      <div
        style={{
          padding: '0.85rem',
          borderRadius: '10px',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.81rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={lockClosedBooks}
            onChange={(e) => setLockClosedBooks(e.target.checked)}
          />
          <span>
            <Lock size={13} style={{ verticalAlign: 'middle' }} />{' '}
            <strong>Close &amp; Lock FY {plan.window.closingFy} books up to {plan.window.endDate}</strong>{' '}
            (पुराने बिलों में बदलाव रोकता है; पुरानी उधारी की पेमेंट एंट्री चालू रहती है)
          </span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.81rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={exportArchiveJson}
            onChange={(e) => setExportArchiveJson(e.target.checked)}
          />
          <span>
            CA और ऑडिट रिकॉर्ड के लिए <strong>Year-End Closing &amp; 1-April Opening Archive (.json)</strong> भी डाउनलोड करें
          </span>
        </label>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.2rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={executing}
            onClick={handleExecuteRollover}
          >
            {plan.alreadyRolledOver ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{' '}
            {executing
              ? 'Rolling Over FY…'
              : plan.alreadyRolledOver
                ? `Re-Sync FY ${plan.window.nextFy} Opening Balances`
                : `Execute FY ${plan.window.closingFy} → ${plan.window.nextFy} Rollover`}
          </button>

          {partyExportRows.length > 0 && (
            <TableExport
              title={`FY ${plan.window.closingFy} Party Closing & Opening Balances`}
              subtitle={`${plan.businessName} · As on ${plan.window.endDate}`}
              headers={['Party Name', 'GSTIN', 'MSME Tagged', 'Receivable Dr (INR)', 'Payable Cr (INR)', 'Net Nature']}
              rows={partyExportRows}
              filename={`Party-Opening-Schedule-FY-${plan.window.nextFy}`}
            />
          )}

          {stockExportRows.length > 0 && (
            <TableExport
              title={`31-March Closing Stock Valuation (${plan.window.closingFy})`}
              subtitle={`${plan.businessName} · Carry forward to ${plan.window.nextFyStartDate} ITR-3 Opening Stock`}
              headers={['Item Name', 'HSN', 'Unit', 'Closing Qty', 'Unit Cost Basis', 'Closing Cost Value', 'Retail Value']}
              rows={stockExportRows}
              filename={`Closing-Stock-FY-${plan.window.closingFy}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
