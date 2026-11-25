// CA Pre-Filing GST Health & Compliance Auditor Card (mounted in GST Returns)
// Gives businesses & CAs a 0-100% GST Portal Readiness Score across 6 CGST rules.
import { useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { auditInvoicesForGst } from '../utils/gstAudit';
import { triggerTrackedBrowserDownload } from '../utils/trackedDownload';

export default function GstHealthAuditor({ bills = [], periodLabel = '' }) {
  const [expanded, setExpanded] = useState(false);
  const report = useMemo(() => auditInvoicesForGst(bills), [bills]);

  const badgeColor = report.errorCount > 0
    ? '#dc2626'
    : report.warningCount > 0
      ? '#d97706'
      : '#16a34a';

  const exportCsv = () => {
    const header = ['Severity', 'Code', 'Invoice Number', 'Issue', 'Recommended Fix'];
    const rows = report.issues.map((i) => [
      i.severity.toUpperCase(),
      i.code,
      i.invoiceNumber,
      i.title,
      i.fix,
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    triggerTrackedBrowserDownload({
      content: csv,
      mimeType: 'text/csv;charset=utf-8;',
      filename: `BharatGST-CA-Audit-${(periodLabel || 'Report').replace(/\s+/g, '-')}.csv`,
      category: 'gstr',
      label: `GST Pre-Check CSV (${rows.length} findings)`,
      allowEmpty: true,
    });
  };

  return (
    <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', borderLeft: `4px solid ${badgeColor}` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: `${badgeColor}18`, color: badgeColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '0.92rem', flexShrink: 0,
          }}>
            {report.score}%
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '0.96rem' }}>
                Pre-Filing CA GST Audit &amp; Portal Readiness
              </h3>
              <span style={{
                fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.55rem', borderRadius: 999,
                background: `${badgeColor}1a`, color: badgeColor,
              }}>
                {report.errorCount > 0
                  ? `${report.errorCount} Portal Error${report.errorCount > 1 ? 's' : ''}`
                  : report.warningCount > 0
                    ? `${report.warningCount} Advisory Check${report.warningCount > 1 ? 's' : ''}`
                    : '100% GSTR-1 Ready'}
              </span>
            </div>
            <p style={{ margin: '0.18rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Checked <b>{report.totalAudited}</b> invoice{report.totalAudited === 1 ? '' : 's'} {periodLabel ? `for ${periodLabel}` : ''} across GSTIN Mod-36 checksums, HSN/SAC 4-digit rules, State/POS match, Rule 46 gapless numbering &amp; e-Way Bill thresholds.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {report.issues.length > 0 && (
            <button type="button" className="btn btn-secondary" onClick={exportCsv} style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}>
              <Download size={14} /> Audit CSV
            </button>
          )}
          {report.issues.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setExpanded((v) => !v)}
              style={{ padding: '0.35rem 0.7rem', fontSize: '0.78rem' }}
            >
              {expanded ? <><ChevronUp size={14} /> Hide Details</> : <><ChevronDown size={14} /> View {report.issues.length} Check{report.issues.length > 1 ? 's' : ''}</>}
            </button>
          )}
        </div>
      </div>

      {expanded && report.issues.length > 0 && (
        <div style={{ marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border)', display: 'grid', gap: '0.5rem' }}>
          {report.issues.map((iss, idx) => {
            const Icon = iss.severity === 'error' ? AlertCircle : iss.severity === 'warning' ? AlertTriangle : Info;
            const col = iss.severity === 'error' ? '#dc2626' : iss.severity === 'warning' ? '#d97706' : '#2563eb';
            return (
              <div key={idx} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', padding: '0.6rem 0.75rem', borderRadius: 8, background: 'var(--bg-secondary)', fontSize: '0.8rem' }}>
                <Icon size={16} style={{ color: col, flexShrink: 0, marginTop: 2 }} />
                <div style={{ minWidth: 0 }}>
                  <div>
                    <b style={{ color: col }}>[{iss.invoiceNumber}]</b> <b>{iss.title}</b>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{iss.detail}</div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: 2, fontWeight: 500 }}>Fix: {iss.fix}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {report.issues.length === 0 && report.totalAudited > 0 && (
        <div style={{ marginTop: '0.65rem', fontSize: '0.79rem', color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
          <ShieldCheck size={15} /> Zero GSTIN, HSN, Place-of-Supply, or numbering sequence errors found — ready for GST Portal JSON upload!
        </div>
      )}
    </div>
  );
}
