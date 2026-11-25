import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck, AlertTriangle, XCircle, HelpCircle, RefreshCw, Wrench, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  getAllProducts,
  getAllBills,
  getAllPurchases,
  getAllClients,
  getProfile,
  DATA_SAVED_EVENT,
} from '../store';
import {
  readBackupMeta,
  readBackupSettings,
  computeBackupHealth,
  BACKUP_EVENT,
} from '../utils/backupManager';
import { getP2pOfflineQueue } from '../utils/webrtcP2pSync';
import { getIndianFinancialYear } from '../utils/canonicalAdapter';
import { evaluateScopedSystemHealth } from '../utils/systemHealthEvaluator';
import { runSelfHeal } from '../utils/selfHeal';
import { startOperation, updateOperation, finishOperation } from '../utils/operationRegistry';
import { confirmAction } from './ConfirmModal';
import { toast } from './Toast';

function badgeStyle(status) {
  switch (status) {
    case 'pass':
      return { color: '#15803d', bg: 'rgba(22, 163, 74, 0.12)', label: 'PASS', Icon: ShieldCheck };
    case 'warn':
      return { color: '#b45309', bg: 'rgba(217, 119, 6, 0.14)', label: 'WARN', Icon: AlertTriangle };
    case 'fail':
      return { color: '#b91c1c', bg: 'rgba(220, 38, 38, 0.12)', label: 'ACTION NEEDED', Icon: XCircle };
    case 'unknown':
    case 'info':
    default:
      return { color: '#475569', bg: 'rgba(100, 116, 139, 0.14)', label: 'UNKNOWN / INFO', Icon: HelpCircle };
  }
}

export default function SystemHealthScorecard({ compactDefault = true }) {
  const [report, setReport] = useState(null);
  const [selfHealReport, setSelfHealReport] = useState(null);
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(!compactDefault);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runDiagnostic = useCallback(async ({ announceJob = false } = {}) => {
    setChecking(true);
    const opId = announceJob
      ? startOperation({
          category: 'health',
          label: 'Workspace System & Hygiene Check',
          phase: 'Loading scoped store records…',
          destination: 'Local Workspace',
          total: 8,
          completed: 0,
        })
      : null;

    try {
      const [products, bills, purchases, clients, profile] = await Promise.all([
        getAllProducts().catch(() => []),
        getAllBills().catch(() => []),
        getAllPurchases().catch(() => []),
        getAllClients().catch(() => []),
        getProfile().catch(() => null),
      ]);

      const backupMeta = readBackupMeta();
      const backupSettings = readBackupSettings();
      const backupHealth = computeBackupHealth(backupMeta, backupSettings);
      const p2pPendingCount = getP2pOfflineQueue().length;

      let swStatus = 'unknown';
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        if (navigator.serviceWorker.controller) {
          swStatus = 'controlled';
        } else {
          const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
          swStatus = regs.length > 0 ? 'registered-uncontrolled' : 'unknown';
        }
      }

      let storageFreeMB = null;
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        try {
          const est = await navigator.storage.estimate();
          if (est && typeof est.quota === 'number') {
            storageFreeMB = Math.max(0, Math.round((est.quota - (est.usage || 0)) / (1024 * 1024)));
          }
        } catch { /* ignore */ }
      }

      const fy = getIndianFinancialYear();
      const evaluated = evaluateScopedSystemHealth({
        products,
        bills,
        purchases,
        clients,
        profile,
        backupHealth,
        backupMeta,
        backupSettings,
        p2pPendingCount,
        swStatus,
        storageFreeMB,
        fy,
        onCheckCompleted: (done, total, entry) => {
          if (opId) {
            updateOperation(opId, {
              completed: done,
              total,
              phase: `Checked ${done}/${total}: ${entry.label}`,
            });
          }
        },
      });

      if (!mountedRef.current) return;
      setReport(evaluated);

      if (opId) {
        finishOperation(opId, {
          status: evaluated.counts.fail > 0 || evaluated.counts.warn > 0 ? 'partial' : 'success',
          completed: evaluated.completedChecks,
          total: evaluated.totalChecks,
          phase: `Completed ${evaluated.completedChecks}/${evaluated.totalChecks} checks (${evaluated.counts.pass} pass, ${evaluated.counts.warn} warn, ${evaluated.counts.fail} fail, ${evaluated.counts.unknown} unknown)`,
        });
      }
    } catch (err) {
      if (opId) {
        finishOperation(opId, { status: 'failed', error: err });
      }
    } finally {
      if (mountedRef.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    runDiagnostic({ announceJob: false });
    if (typeof window !== 'undefined') {
      const onRefresh = () => runDiagnostic({ announceJob: false });
      window.addEventListener(DATA_SAVED_EVENT, onRefresh);
      window.addEventListener(BACKUP_EVENT, onRefresh);
      return () => {
        window.removeEventListener(DATA_SAVED_EVENT, onRefresh);
        window.removeEventListener(BACKUP_EVENT, onRefresh);
      };
    }
    return undefined;
  }, [runDiagnostic]);

  const handleConfirmedSelfHeal = async () => {
    const ok = await confirmAction({
      title: 'Run Safe Workspace Self-Heal?',
      message: 'Checks 9 storage, counter, and print-schema invariants and repairs corrupted print/feature defaults without modifying your saved invoices.',
      confirmLabel: 'Run Self-Heal',
      tone: 'info',
    });
    if (!ok) return;

    const opId = startOperation({
      category: 'health',
      label: '9-Point Storage Self-Heal',
      phase: 'Inspecting IndexedDB, counters & schema…',
      destination: 'Local Workspace',
      total: 9,
      completed: 0,
    });
    try {
      const res = await runSelfHeal({
        repair: true,
        onStep: (done, total, check) => {
          updateOperation(opId, {
            completed: done,
            total,
            phase: `Checked ${done}/${total}: ${check.label}`,
          });
        },
      });
      if (mountedRef.current) setSelfHealReport(res);
      finishOperation(opId, {
        status: res.warnCount > 0 ? 'partial' : 'success',
        completed: 9,
        total: 9,
        phase: `9/9 self-heal checks finished (${res.repairedCount} repaired, ${res.warnCount} warning)`,
      });
      toast(`Self-heal finished: ${res.checks.length} checks completed (${res.repairedCount} repaired).`, 'success');
      runDiagnostic({ announceJob: false });
    } catch (err) {
      finishOperation(opId, { status: 'failed', error: err });
      toast(err?.message || 'Self-heal check failed', 'error');
    }
  };

  if (!report) return null;

  return (
    <section
      className="glass-panel"
      aria-label="Workspace System, Backup & Data Hygiene Scorecard"
      style={{
        padding: '0.9rem 1.1rem',
        marginBottom: '1rem',
        borderLeft: `4px solid ${
          report.counts.fail > 0 ? '#dc2626' : report.counts.warn > 0 ? '#d97706' : '#16a34a'
        }`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.92rem' }}>🩺 System, Backup &amp; Data Hygiene Status</strong>
            <span className="text-muted" style={{ fontSize: '0.75rem' }}>
              ({report.completedChecks}/{report.totalChecks} checks · {report.scopeLabel})
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: '0.35rem', fontSize: '0.75rem' }}>
            <span style={{ padding: '0.12rem 0.5rem', borderRadius: 999, background: 'rgba(22,163,74,0.12)', color: '#15803d', fontWeight: 700 }}>
              ✓ {report.counts.pass} Pass
            </span>
            <span style={{ padding: '0.12rem 0.5rem', borderRadius: 999, background: 'rgba(217,119,6,0.14)', color: '#b45309', fontWeight: 700 }}>
              ⚠ {report.counts.warn} Warn
            </span>
            <span style={{ padding: '0.12rem 0.5rem', borderRadius: 999, background: 'rgba(220,38,38,0.12)', color: '#b91c1c', fontWeight: 700 }}>
              ✗ {report.counts.fail} Action Needed
            </span>
            <span style={{ padding: '0.12rem 0.5rem', borderRadius: 999, background: 'rgba(100,116,139,0.14)', color: '#475569', fontWeight: 700 }}>
              ? {report.counts.unknown} Unknown / Info
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.76rem', padding: '0.32rem 0.65rem' }}
            disabled={checking}
            onClick={() => runDiagnostic({ announceJob: true })}
          >
            <RefreshCw size={13} /> {checking ? 'Checking…' : 'Re-Check'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.76rem', padding: '0.32rem 0.65rem' }}
            onClick={handleConfirmedSelfHeal}
          >
            <Wrench size={13} /> Storage Self-Heal
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '0.76rem', padding: '0.32rem 0.6rem' }}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {expanded ? 'Hide Details' : 'Details'}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.45rem' }}>
          {report.checks.map((c) => {
            const meta = badgeStyle(c.status);
            const IconComp = meta.Icon;
            return (
              <div
                key={c.id}
                style={{
                  padding: '0.55rem 0.75rem',
                  borderRadius: 8,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 260px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.81rem', fontWeight: 700 }}>
                    <IconComp size={14} style={{ color: meta.color, flexShrink: 0 }} />
                    <span>[{c.domain}] {c.label}</span>
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.76rem', marginTop: '0.18rem' }}>
                    {c.detail}
                  </div>
                  {c.action && (
                    <div style={{ fontSize: '0.74rem', color: meta.color, fontWeight: 600, marginTop: '0.18rem' }}>
                      → {c.action}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '0.69rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: 999,
                    background: meta.bg,
                    color: meta.color,
                  }}
                >
                  {meta.label}
                </span>
              </div>
            );
          })}

          {selfHealReport && (
            <div style={{ fontSize: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 8, background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.3)' }}>
              <b>9-Point Storage Self-Heal ({String(selfHealReport.checkedAt).slice(11, 19)}):</b>{' '}
              {selfHealReport.checks.length} checks completed · {selfHealReport.repairedCount} repaired · {selfHealReport.warnCount} warning(s).
            </div>
          )}

          <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
            ℹ️ Checked at {String(report.checkedAt).slice(11, 19)} · {report.methodologyNote}
          </div>
        </div>
      )}
    </section>
  );
}
