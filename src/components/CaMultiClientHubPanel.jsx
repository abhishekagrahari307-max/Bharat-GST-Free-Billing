import { useState, useMemo } from 'react';
import {
  Briefcase,
  Upload,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Search,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatCurrency } from '../utils';
import { getIndianFinancialYear } from '../utils/canonicalAdapter';
import {
  deriveAutoJournalEntries,
  computeTrialBalance,
  computeBalanceSheet,
} from '../utils/doubleEntry';
import {
  buildAuditChainFromVouchers,
  buildCaWorkpaperBundle,
} from '../utils/hashChain';
import { auditInvoicesForGst } from '../utils/gstAudit';
import { checkSection43BCompliance } from '../utils/autonomousMunimAnd43B';
import { computeBusinessITR } from '../utils/itrAndTaxEngine';
import {
  parseAndSummarizeClientCaBundle,
  aggregateMultiClientCaPortfolio,
} from '../utils/caReviewerAnd2bActionEngine';
import { startOperation, updateOperation, finishOperation } from '../utils/operationRegistry';
import TableExport from './TableExport';
import { toast } from './Toast';

function riskBadge(level) {
  if (level === 'CRITICAL') {
    return { color: '#b91c1c', bg: 'rgba(220, 38, 38, 0.14)', label: '🚨 CRITICAL', Icon: ShieldAlert };
  }
  if (level === 'REVIEW') {
    return { color: '#b45309', bg: 'rgba(217, 119, 6, 0.14)', label: '⚠ REVIEW', Icon: AlertTriangle };
  }
  return { color: '#15803d', bg: 'rgba(22, 163, 74, 0.12)', label: '✓ CLEAN', Icon: ShieldCheck };
}

export default function CaMultiClientHubPanel({
  bills = [],
  purchases = [],
  expenses = [],
  ownerProfile = null,
}) {
  const [clientCards, setClientCards] = useState([]);
  const [sharedPassphrase, setSharedPassphrase] = useState('');
  const [filterRisk, setFilterRisk] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKey, setExpandedKey] = useState(null);

  const portfolio = useMemo(
    () => aggregateMultiClientCaPortfolio(clientCards),
    [clientCards]
  );

  const visibleClients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return portfolio.clients.filter((c) => {
      if (filterRisk !== 'ALL' && c.riskLevel !== filterRisk) return false;
      if (!q) return true;
      return (
        c.businessName.toLowerCase().includes(q) ||
        c.gstin.toLowerCase().includes(q) ||
        c.pan.toLowerCase().includes(q) ||
        c.periodLabel.toLowerCase().includes(q)
      );
    });
  }, [portfolio.clients, filterRisk, searchQuery]);

  const handleBatchUploadCaFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const opId = startOperation({
      category: 'ca-package',
      label: `CA Multi-Client Load (${files.length} file${files.length === 1 ? '' : 's'})`,
      phase: `Verifying 0/${files.length} .bharatca packages…`,
      destination: 'CA Practice Hub',
      total: files.length,
      completed: 0,
    });

    const loaded = [];
    let failedCount = 0;

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      updateOperation(opId, {
        completed: i,
        total: files.length,
        phase: `Decrypting & verifying SHA-256 chain (${i + 1}/${files.length}): ${f.name}`,
      });
      try {
        const text = await f.text();
        let card;
        try {
          card = await parseAndSummarizeClientCaBundle(text, sharedPassphrase, f.name);
        } catch (err) {
          if (/encrypted/i.test(err?.message || '')) {
            const pwd = window.prompt(`"${f.name}" एन्क्रिप्टेड (.bharatca) है — इसका CA पासवर्ड डालें:`);
            if (!pwd) throw err;
            card = await parseAndSummarizeClientCaBundle(text, pwd.trim(), f.name);
          } else {
            throw err;
          }
        }
        loaded.push(card);
      } catch {
        failedCount += 1;
      }
      updateOperation(opId, { completed: i + 1, total: files.length });
    }

    if (loaded.length > 0) {
      setClientCards((prev) => [...prev, ...loaded]);
    }

    finishOperation(opId, {
      status: loaded.length === 0 ? 'failed' : failedCount > 0 ? 'partial' : 'success',
      completed: loaded.length,
      total: files.length,
      phase:
        loaded.length === 0
          ? `Could not verify any of the ${files.length} file(s)`
          : `Verified ${loaded.length}/${files.length} client package(s)${failedCount ? ` (${failedCount} skipped/failed)` : ''}`,
    });

    if (loaded.length > 0) {
      toast(
        `Loaded & cryptographically verified ${loaded.length} client .bharatca file(s)!`,
        failedCount > 0 ? 'warning' : 'success'
      );
    } else {
      toast('Could not open selected .bharatca file(s). Check format or password.', 'error');
    }
  };

  const handleLoadActiveWorkspaceCard = async () => {
    try {
      const fy = getIndianFinancialYear();
      const vouchers = deriveAutoJournalEntries({ bills, purchases, expenses });
      const tb = computeTrialBalance(vouchers);
      const bs = computeBalanceSheet(tb);
      const chain = await buildAuditChainFromVouchers(vouchers);
      const gstHealth = auditInvoicesForGst(bills, {
        sellerGstin: ownerProfile?.gstin || '',
        sellerState: ownerProfile?.state || '',
      });
      const res43b = checkSection43BCompliance({ purchases, clients: [] });
      const itrRes = computeBusinessITR({
        bills,
        purchases,
        expenses,
        fy,
        ownerGstin: ownerProfile?.gstin || '',
      });
      const tbRows = tb?.rows || [];
      const outTax = tbRows
        .filter((r) => /^OUTPUT_(CGST|SGST|IGST|CESS)$/.test(r.code))
        .reduce((s, r) => s + (Number(r.closingCredit || 0) - Number(r.closingDebit || 0)), 0);
      const inTax = tbRows
        .filter((r) => /^INPUT_(CGST|SGST|IGST|CESS)$/.test(r.code))
        .reduce((s, r) => s + (Number(r.closingDebit || 0) - Number(r.closingCredit || 0)), 0);

      const bundle = await buildCaWorkpaperBundle({
        profile: ownerProfile || { businessName: 'Current Workspace Firm' },
        periodLabel: `FY ${fy}`,
        trialBalance: tb,
        balanceSheet: bs,
        gstHealth,
        statutorySummary: {
          netGstPayable: Math.max(0, Math.round((outTax - inTax) * 100) / 100),
          sec43bAtRiskAmount: res43b.totalAtRiskAmount || 0,
          sec43bCriticalCount: res43b.criticalCount || 0,
          itrTaxableTurnover: itrRes.grossTurnover || 0,
        },
        vouchers,
        auditChain: chain,
      });

      const card = await parseAndSummarizeClientCaBundle(
        JSON.stringify(bundle),
        '',
        'Active-Workspace.bharatca'
      );
      setClientCards((prev) => [...prev.filter((x) => x.clientKey !== card.clientKey), card]);
      toast('Current workspace added to CA Multi-Client Reviewer Hub!', 'success');
    } catch (err) {
      toast(err?.message || 'Could not build workspace preview card', 'error');
    }
  };

  const exportRows = visibleClients.map((c) => [
    c.businessName,
    c.gstin,
    c.periodLabel,
    c.riskLevel,
    c.auditChainVerified ? `Verified (${c.auditBlocksChecked} blocks)` : `TAMPERED (${c.auditFailureReason || 'Mismatch'})`,
    c.trialBalanceBalanced ? 'Balanced' : 'UNBALANCED',
    c.gstErrors,
    c.gstWarnings,
    c.sec43bAtRiskAmount,
    c.itrTaxableTurnover,
    c.netProfit,
    c.findings.join('; ') || 'Clean',
  ]);

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.85rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Briefcase size={19} style={{ color: '#2563eb' }} />
            CA Multi-Client Reviewer Hub (`.bharatca` Practice Command Center)
          </h3>
          <p className="text-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
            20–50 क्लाइंट्स की <code>.bharatca</code> फ़ाइलें एक साथ अपलोड करें — SHA-256 ऑडिट चेन, Trial Balance, GST त्रुटियाँ, Section 43B(h) अलर्ट और ITR टर्नओवर एक ही स्क्रीन पर जाँचें।
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="password"
            value={sharedPassphrase}
            onChange={(e) => setSharedPassphrase(e.target.value)}
            placeholder="Optional .bharatca Password"
            aria-label="Shared CA package decryption password"
            className="form-input"
            style={{ width: '195px' }}
          />
          <label
            className="btn btn-primary"
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <Upload size={15} /> Upload `.bharatca` Files (Multi)
            <input
              type="file"
              accept=".bharatca,.json"
              multiple
              style={{ display: 'none' }}
              onChange={handleBatchUploadCaFiles}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleLoadActiveWorkspaceCard}
          >
            <Sparkles size={15} /> Preview Active Firm
          </button>
        </div>
      </div>

      {/* Portfolio KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
          gap: '0.65rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="text-muted" style={{ fontSize: '0.73rem' }}>Loaded Clients</div>
          <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{portfolio.totalClients}</div>
        </div>
        <div style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="text-muted" style={{ fontSize: '0.73rem' }}>Critical Priority</div>
          <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#dc2626' }}>{portfolio.criticalClients}</div>
        </div>
        <div style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="text-muted" style={{ fontSize: '0.73rem' }}>Needs Review</div>
          <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#d97706' }}>{portfolio.reviewClients}</div>
        </div>
        <div style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="text-muted" style={{ fontSize: '0.73rem' }}>Clean &amp; Verified</div>
          <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#16a34a' }}>{portfolio.cleanClients}</div>
        </div>
        <div style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div className="text-muted" style={{ fontSize: '0.73rem' }}>Portfolio 43B(h) Risk</div>
          <div style={{ fontWeight: 700, fontSize: '1.08rem', color: '#b91c1c' }}>
            {formatCurrency(portfolio.totalPortfolio43bRisk)}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      {portfolio.totalClients > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.6rem',
            flexWrap: 'wrap',
            marginBottom: '0.9rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {['ALL', 'CRITICAL', 'REVIEW', 'CLEAN'].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setFilterRisk(lvl)}
                className={`btn btn-sm ${filterRisk === lvl ? 'btn-primary' : 'btn-secondary'}`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '9px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)',
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Client / GSTIN / PAN…"
                className="form-input"
                style={{ paddingLeft: '30px', width: '220px' }}
              />
            </div>

            <TableExport
              title="CA Multi-Client Compliance Matrix"
              subtitle={`${visibleClients.length} client(s) · Verified via Bharat GST CA Hub`}
              headers={[
                'Client Name',
                'GSTIN',
                'Period',
                'Risk Status',
                'SHA-256 Audit Chain',
                'Trial Balance',
                'GST Errors',
                'GST Warnings',
                'Sec 43B(h) Risk (INR)',
                'ITR Turnover (INR)',
                'Net Profit (INR)',
                'Findings',
              ]}
              rows={exportRows}
              filename="CA-Multi-Client-Portfolio-Matrix"
              landscape={true}
            />

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setClientCards([])}
            >
              <Trash2 size={13} /> Clear All
            </button>
          </div>
        </div>
      )}

      {/* Client Cards Table / Accordion */}
      {portfolio.totalClients === 0 ? (
        <div
          style={{
            padding: '1.6rem',
            textAlign: 'center',
            borderRadius: '10px',
            border: '1px dashed var(--border-color)',
            color: 'var(--text-secondary)',
            fontSize: '0.84rem',
          }}
        >
          अभी कोई क्लाइंट <code>.bharatca</code> पैकेज लोड नहीं है। ऊपर <strong>Upload `.bharatca` Files (Multi)</strong> पर क्लिक करके क्लाइंट फ़ाइलें चुनें, या <strong>Preview Active Firm</strong> दबाकर तुरंत इस वर्कस्पेस का CA कार्ड देखें।
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          {visibleClients.map((c) => {
            const badge = riskBadge(c.riskLevel);
            const isOpen = expandedKey === c.clientKey;
            return (
              <div
                key={c.clientKey}
                style={{
                  borderRadius: '10px',
                  border: `1px solid ${c.riskLevel === 'CRITICAL' ? 'rgba(220,38,38,0.45)' : 'var(--border-color)'}`,
                  background: 'var(--bg-secondary)',
                  padding: '0.8rem 0.95rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.65rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.92rem' }}>{c.businessName}</strong>
                      <code style={{ fontSize: '0.76rem' }}>{c.gstin}</code>
                      <span className="text-muted" style={{ fontSize: '0.76rem' }}>
                        ({c.periodLabel})
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.12rem 0.48rem',
                          borderRadius: '999px',
                          background: badge.bg,
                          color: badge.color,
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: '0.25rem' }}>
                      SHA-256 Chain:{' '}
                      <strong style={{ color: c.auditChainVerified ? '#15803d' : '#dc2626' }}>
                        {c.auditChainVerified ? `✓ Verified (${c.auditBlocksChecked} blocks)` : `✗ TAMPERED`}
                      </strong>{' '}
                      · TB: <strong>{c.trialBalanceBalanced ? 'Balanced' : 'Unbalanced'}</strong> · GST Errors:{' '}
                      <strong>{c.gstErrors}</strong> · 43B(h) Risk:{' '}
                      <strong>{formatCurrency(c.sec43bAtRiskAmount)}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setExpandedKey(isOpen ? null : c.clientKey)}
                  >
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{' '}
                    {isOpen ? 'Hide Workpapers' : 'Inspect'}
                  </button>
                </div>

                {c.findings.length > 0 && (
                  <div style={{ marginTop: '0.45rem', fontSize: '0.76rem', color: badge.color, fontWeight: 600 }}>
                    → {c.findings.join(' · ')}
                  </div>
                )}

                {isOpen && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      paddingTop: '0.75rem',
                      borderTop: '1px solid var(--border-color)',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                      gap: '0.6rem',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div>
                      <span className="text-muted">Source File:</span>
                      <div><strong>{c.fileName}</strong></div>
                    </div>
                    <div>
                      <span className="text-muted">Trial Balance (Dr / Cr):</span>
                      <div><strong>{formatCurrency(c.totalDebit)} / {formatCurrency(c.totalCredit)}</strong></div>
                    </div>
                    <div>
                      <span className="text-muted">ITR Taxable Turnover:</span>
                      <div><strong>{formatCurrency(c.itrTaxableTurnover)}</strong></div>
                    </div>
                    <div>
                      <span className="text-muted">Net Profit (Books):</span>
                      <div><strong>{formatCurrency(c.netProfit)}</strong></div>
                    </div>
                    <div>
                      <span className="text-muted">Vouchers / Invoices:</span>
                      <div><strong>{c.voucherCount} vouchers · {c.invoiceCount} bills</strong></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
