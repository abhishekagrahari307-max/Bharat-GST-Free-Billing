import { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  X,
  ChevronDown,
  ChevronUp,
  Ban,
  FileText,
  FileSpreadsheet,
  ShieldCheck,
  UploadCloud,
  RefreshCw,
  Bug,
} from 'lucide-react';
import {
  subscribeOperations,
  cancelOperation,
  dismissOperation,
  clearFinishedOperations,
} from '../utils/operationRegistry';

function getCategoryIcon(category) {
  const c = String(category || '').toLowerCase();
  if (c.includes('pdf')) return FileText;
  if (c.includes('gstr') || c.includes('report') || c.includes('import') || c.includes('catalog')) {
    return FileSpreadsheet;
  }
  if (c.includes('backup') || c.includes('restore') || c.includes('ca-package')) {
    return ShieldCheck;
  }
  if (c.includes('p2p')) return UploadCloud;
  return RefreshCw;
}

function statusMeta(status) {
  switch (status) {
    case 'running':
    case 'queued':
      return { color: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)', label: 'चालू (In Progress)' };
    case 'waiting':
      return { color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)', label: 'प्रतीक्षा (Waiting)' };
    case 'success':
      return { color: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)', label: 'पूर्ण (Done)' };
    case 'partial':
      return { color: '#d97706', bg: 'rgba(217, 119, 6, 0.14)', label: 'आंशिक (Partial)' };
    case 'cancelled':
      return { color: '#64748b', bg: 'rgba(100, 116, 139, 0.14)', label: 'रद्द (Cancelled)' };
    case 'failed':
    default:
      return { color: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)', label: 'विफल (Failed)' };
  }
}

function StatusIcon({ status }) {
  if (status === 'running' || status === 'queued') {
    return <Loader2 size={14} style={{ color: '#2563eb', flexShrink: 0 }} />;
  }
  if (status === 'success') {
    return <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0 }} />;
  }
  if (status === 'partial' || status === 'waiting') {
    return <AlertTriangle size={14} style={{ color: '#d97706', flexShrink: 0 }} />;
  }
  if (status === 'cancelled') {
    return <Ban size={14} style={{ color: '#64748b', flexShrink: 0 }} />;
  }
  return <XCircle size={14} style={{ color: '#dc2626', flexShrink: 0 }} />;
}

export default function OperationProgressBar({ onReportError }) {
  const [ops, setOps] = useState([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const unsub = subscribeOperations((list) => {
      setOps(list);
    });
    return unsub;
  }, []);

  // Auto-prune successful single-shot download jobs after 8s so dock never clutters UI,
  // while keeping failed / partial / running / waiting jobs visible until reviewed!
  useEffect(() => {
    const hasAutoClearable = ops.some(
      (o) => o.status === 'success' && o.finishedAtMs && Date.now() - o.finishedAtMs < 8500
    );
    if (!hasAutoClearable) return undefined;
    const t = setTimeout(() => {
      for (const o of ops) {
        if (o.status === 'success' && o.finishedAtMs && Date.now() - o.finishedAtMs >= 7800) {
          dismissOperation(o.id);
        }
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [ops]);

  if (!ops.length) return null;

  const activeCount = ops.filter(
    (o) => o.status === 'running' || o.status === 'queued' || o.status === 'waiting'
  ).length;
  const hasFinished = ops.some(
    (o) => o.status !== 'running' && o.status !== 'queued' && o.status !== 'waiting'
  );
  const latestOp = ops[0];

  return (
    <aside
      aria-label="Global Activity & Download Progress Drawer"
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 9990,
        width: 'min(380px, calc(100vw - 2rem))',
        borderRadius: '12px',
        background: 'var(--bg-card, #ffffff)',
        color: 'var(--text-primary, #0f172a)',
        border: '1px solid var(--border-color, #cbd5e1)',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18)',
        overflow: 'hidden',
        fontSize: '0.8rem',
      }}
    >
      {/* Polite screen-reader status region */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          border: 0,
        }}
      >
        {latestOp ? `${latestOp.label}: ${latestOp.phase}` : ''}
      </div>

      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          padding: '0.55rem 0.75rem',
          background: 'var(--bg-secondary, #f8fafc)',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-color, #e2e8f0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700 }}>
          <Activity size={15} style={{ color: activeCount > 0 ? '#2563eb' : '#16a34a' }} />
          <span>
            गतिविधि व डाउनलोड ({activeCount > 0 ? `${activeCount} चालू` : `${ops.length} हालिया`})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {hasFinished && (
            <button
              type="button"
              onClick={clearFinishedOperations}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color, #cbd5e1)',
                borderRadius: '6px',
                padding: '0.15rem 0.45rem',
                fontSize: '0.7rem',
                color: 'var(--text-secondary, #475569)',
                cursor: 'pointer',
              }}
            >
              साफ़ करें
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand activity drawer' : 'Minimize activity drawer'}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0.2rem',
              cursor: 'pointer',
              color: 'var(--text-secondary, #475569)',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Job list */}
      {!collapsed && (
        <div
          style={{
            maxHeight: '275px',
            overflowY: 'auto',
            padding: '0.5rem 0.7rem',
            display: 'grid',
            gap: '0.5rem',
          }}
        >
          {ops.slice(0, 6).map((op) => {
            const meta = statusMeta(op.status);
            const CatIcon = getCategoryIcon(op.category);
            const hasDeterministicPct = !op.indeterminate && typeof op.percent === 'number';
            // Honest width: NEVER jumps to 100% on failed, partial, or cancelled!
            const barWidth = hasDeterministicPct
              ? `${op.percent}%`
              : op.status === 'success'
                ? '100%'
                : op.status === 'running' || op.status === 'queued'
                  ? '45%'
                  : '0%';

            return (
              <div
                key={op.id}
                style={{
                  padding: '0.55rem 0.65rem',
                  borderRadius: '8px',
                  border: `1px solid ${meta.color}40`,
                  background: 'var(--bg-secondary, #f8fafc)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.38rem', minWidth: 0 }}>
                    <CatIcon size={14} style={{ color: meta.color, flexShrink: 0 }} />
                    <StatusIcon status={op.status} />
                    <span
                      style={{
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {op.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                    <span
                      style={{
                        padding: '0.1rem 0.4rem',
                        borderRadius: '999px',
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        background: meta.bg,
                        color: meta.color,
                      }}
                    >
                      {hasDeterministicPct && op.total
                        ? `${op.completed}/${op.total} (${op.percent}%)`
                        : hasDeterministicPct
                          ? `${op.percent}%`
                          : meta.label}
                    </span>
                    {op.cancellable && (op.status === 'running' || op.status === 'queued') && (
                      <button
                        type="button"
                        onClick={() => cancelOperation(op.id)}
                        style={{
                          background: 'rgba(220, 38, 38, 0.1)',
                          color: '#dc2626',
                          border: '1px solid rgba(220, 38, 38, 0.3)',
                          borderRadius: '5px',
                          padding: '0.1rem 0.38rem',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    )}
                    {op.status !== 'running' && op.status !== 'queued' && (
                      <button
                        type="button"
                        onClick={() => dismissOperation(op.id)}
                        aria-label={`Dismiss ${op.label}`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '0.1rem',
                          cursor: 'pointer',
                          color: 'var(--text-secondary, #64748b)',
                          display: 'inline-flex',
                        }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Accessible WCAG progressbar — omits aria-valuenow when indeterminate */}
                <div
                  role="progressbar"
                  aria-label={op.label}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  {...(hasDeterministicPct ? { 'aria-valuenow': op.percent } : {})}
                  style={{
                    height: 5,
                    borderRadius: 999,
                    background: 'rgba(148, 163, 184, 0.25)',
                    marginTop: '0.4rem',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: barWidth,
                      background: meta.color,
                      borderRadius: 999,
                      transition: 'width 180ms ease-out',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.4rem',
                    marginTop: '0.32rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary, #475569)' }}>
                    {op.phase}
                  </span>

                  {(op.status === 'failed' || op.status === 'partial') &&
                    typeof onReportError === 'function' && (
                      <button
                        type="button"
                        onClick={() => onReportError(op)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.12rem 0.45rem', fontSize: '0.68rem' }}
                      >
                        <Bug size={11} /> रिपोर्ट करें
                      </button>
                    )}
                </div>

                {op.error && (
                  <div
                    style={{
                      fontSize: '0.71rem',
                      color: '#dc2626',
                      fontWeight: 600,
                      marginTop: '0.2rem',
                    }}
                  >
                    Error: {op.error}
                  </div>
                )}

                {Array.isArray(op.destinations) && op.destinations.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.3rem',
                      marginTop: '0.3rem',
                    }}
                  >
                    {op.destinations.map((d, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '0.67rem',
                          padding: '0.08rem 0.38rem',
                          borderRadius: 4,
                          background: 'var(--bg-card, #ffffff)',
                          border: '1px solid var(--border-color, #cbd5e1)',
                        }}
                      >
                        {d.destination}: <b>{d.status}</b>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
