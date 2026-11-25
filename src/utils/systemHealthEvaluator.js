// Real Scoped System, Backup, Sync, Data-Hygiene & Statutory Advisory Evaluator (v5.2.0)
// Enforces ALL audit rules from Bharat-GST-v5.1-Progress-Health-Gap-Checklist.md:
// 1. Evaluates REAL profile-scoped store records — missing/empty inputs yield `'unknown'`, NEVER `'pass'`!
// 2. NO arbitrary averaged "Overall Tax Score %" that hides critical failures — reports exact `X/Y Checks`
//    plus explicit counts of `pass`, `warn`, `fail`, `unknown` across 5 transparent domains.
// 3. HSN validation enforces strict 4/6/8 numeric digits (`/^\d{4}(\d{2})?(\d{2})?$/`) — `'abcd'` FAILS!
// 4. Folder handle or Service Worker controller alone NEVER claims "100% Safe" or "All features offline".
// 5. Section 43B(h) requires real purchases + Udyam/MSME supplier metadata; otherwise `'unknown'`.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import { filterRecordsByFyAndFirm } from './canonicalAdapter.js';
import { checkSection43BCompliance } from './autonomousMunimAnd43B.js';

const VALID_NUMERIC_HSN_RE = /^\d{4}(?:\d{2})?(?:\d{2})?$/;
const VALID_GSTIN_FORMAT_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i;

export function isValidNumericHsnCode(hsn) {
  return VALID_NUMERIC_HSN_RE.test(String(hsn || '').trim());
}

/**
 * Evaluates 8 deterministic, honest checks across 5 domains with real step-by-step progress callbacks.
 */
export function evaluateScopedSystemHealth({
  products = [],
  bills = [],
  purchases = [],
  clients = [],
  profile = null,
  backupHealth = null,
  backupMeta = null,
  backupSettings = null,
  p2pPendingCount = 0,
  swStatus = 'unknown', // 'controlled' | 'registered-uncontrolled' | 'unsupported' | 'unknown'
  storageFreeMB = null,
  fy = '2026-27',
  onCheckCompleted = null,
} = {}) {
  const ownerGstin = String(profile?.gstin || '').trim().toUpperCase();
  const scopedBills = filterRecordsByFyAndFirm(bills, {
    fy,
    ownerGstin,
    getDate: (b) => b?.invoiceDate || b?.data?.details?.invoiceDate || b?.data?.invoiceDate || b?.date,
    getGstin: (b) => b?.ownerGstin || b?.businessGstin || b?.data?.profile?.gstin,
  });
  const scopedPurchases = filterRecordsByFyAndFirm(purchases, {
    fy,
    ownerGstin,
    getDate: (p) => p?.billDate || p?.date || p?.invoiceDate,
    getGstin: (p) => p?.ownerGstin || p?.businessGstin,
  });

  const totalChecks = 8;
  const checks = [];
  const pushCheck = (entry) => {
    checks.push(entry);
    if (typeof onCheckCompleted === 'function') {
      onCheckCompleted(checks.length, totalChecks, entry);
    }
  };

  // 1. System: Device Storage Headroom
  if (typeof storageFreeMB !== 'number' || !Number.isFinite(storageFreeMB)) {
    pushCheck({
      id: 'storage-quota',
      domain: 'System',
      label: 'Device Storage Quota',
      status: 'unknown',
      detail: 'Browser did not report storage quota estimate on this platform.',
      action: 'Keep free disk space available and download periodic external backups.',
    });
  } else if (storageFreeMB < 15) {
    pushCheck({
      id: 'storage-quota',
      domain: 'System',
      label: 'Device Storage Quota',
      status: 'fail',
      detail: `Critically low storage (${storageFreeMB} MB remaining) — browser eviction or save failures possible.`,
      action: 'Free up device disk space and export an encrypted .fgsb backup immediately.',
    });
  } else if (storageFreeMB < 100) {
    pushCheck({
      id: 'storage-quota',
      domain: 'System',
      label: 'Device Storage Quota',
      status: 'warn',
      detail: `Moderate storage headroom (${storageFreeMB} MB available).`,
      action: 'Monitor free space if storing many embedded logos/stamps.',
    });
  } else {
    pushCheck({
      id: 'storage-quota',
      domain: 'System',
      label: 'Device Storage Quota',
      status: 'pass',
      detail: `${storageFreeMB.toLocaleString('en-IN')} MB estimated browser storage available.`,
      action: null,
    });
  }

  // 2. System: PWA Service Worker Controller (honest scope — never claims 100% offline proof)
  if (swStatus === 'controlled') {
    pushCheck({
      id: 'pwa-controller',
      domain: 'System',
      label: 'Offline App-Shell Controller',
      status: 'pass',
      detail: 'Service Worker controls this tab (app shell cached; cloud/Drive/PeerJS features still require internet).',
      action: null,
    });
  } else if (swStatus === 'registered-uncontrolled') {
    pushCheck({
      id: 'pwa-controller',
      domain: 'System',
      label: 'Offline App-Shell Controller',
      status: 'warn',
      detail: 'Service Worker registered but not controlling this tab yet.',
      action: 'Reload the page once while online before relying on offline mode.',
    });
  } else {
    pushCheck({
      id: 'pwa-controller',
      domain: 'System',
      label: 'Offline App-Shell Controller',
      status: 'unknown',
      detail: 'Service Worker status not active (normal in local Express dev server or private window).',
      action: 'Use installed PWA over HTTPS for offline app-shell caching.',
    });
  }

  // 3. Backup: Freshness & External Copy Distinction
  if (!backupHealth && !backupMeta) {
    pushCheck({
      id: 'backup-freshness',
      domain: 'Backup',
      label: 'External Backup Freshness',
      status: 'unknown',
      detail: 'Backup metadata has not been initialized yet.',
      action: 'Open Settings → Data & Backups and download an encrypted .fgsb backup.',
    });
  } else if (!backupMeta?.lastBackupAt) {
    pushCheck({
      id: 'backup-freshness',
      domain: 'Backup',
      label: 'External Backup Freshness',
      status: scopedBills.length > 0 ? 'fail' : 'warn',
      detail: scopedBills.length > 0
        ? `${scopedBills.length} invoice(s) exist with 0 external backups recorded.`
        : 'No external backup (.fgsb / .json) has been exported yet.',
      action: 'Export an AES-256 encrypted .fgsb file to an external folder or USB/Drive.',
    });
  } else if (backupHealth?.overdue) {
    pushCheck({
      id: 'backup-freshness',
      domain: 'Backup',
      label: 'External Backup Freshness',
      status: 'warn',
      detail: `Last backup (${backupMeta.lastBackupDestination || 'local'}) was ${backupHealth.daysSince ?? '?'} day(s) / ${backupMeta.billsSinceLastBackup || 0} bill(s) ago.`,
      action: 'Download a fresh .fgsb backup and periodically test restore in an isolated profile.',
    });
  } else {
    const isEncrypted = Boolean(backupMeta.lastBackupEncrypted);
    pushCheck({
      id: 'backup-freshness',
      domain: 'Backup',
      label: 'External Backup Freshness',
      status: 'pass',
      detail: `Last backup recorded at ${String(backupMeta.lastBackupAt).slice(0, 16).replace('T', ' ')} via ${backupMeta.lastBackupDestination || 'download'}${isEncrypted ? ' (AES-256 .fgsb)' : ' (plain JSON)'}.`,
      action: isEncrypted ? null : 'Prefer encrypted .fgsb backups when storing outside your PC.',
    });
  }

  // 4. Backup & Sync: PC Hard-Drive Mirror Verification (never equates connected handle with 100% safety)
  if (!backupSettings?.autoSyncLocalFolder) {
    pushCheck({
      id: 'folder-mirror',
      domain: 'Sync',
      label: 'PC Folder Mirror Status',
      status: 'info',
      detail: 'Optional PC folder live mirror is off (data lives in browser storage / server folder).',
      action: 'Link a local PC folder in Settings → Data & Backups if you want plain-JSON live mirroring.',
    });
  } else {
    const dest = String(backupMeta?.lastBackupDestination || '');
    const verifiedWrite = /folder|directory|mirror/i.test(dest);
    pushCheck({
      id: 'folder-mirror',
      domain: 'Sync',
      label: 'PC Folder Mirror Status',
      status: verifiedWrite ? 'pass' : 'warn',
      detail: verifiedWrite
        ? 'Folder mirror enabled with prior write recorded (note: mirror is plain JSON; browser may re-prompt permission after restart).'
        : 'Folder mirror toggle is ON, but write permission has not been verified in recent saves.',
      action: verifiedWrite ? null : 'Re-select backup folder in Settings → Data & Backups to verify write access.',
    });
  }

  // 5. Sync: WebRTC P2P Offline Queue
  if (p2pPendingCount > 0) {
    pushCheck({
      id: 'p2p-queue',
      domain: 'Sync',
      label: 'P2P Mobile-PC Sync Queue',
      status: 'warn',
      detail: `${p2pPendingCount} queued mobile bill(s) waiting for Counter PC ACK confirmation.`,
      action: 'Reconnect Staff Mobile to Counter PC in Reports → 5G Mobile-PC P2P Sync to flush.',
    });
  } else {
    pushCheck({
      id: 'p2p-queue',
      domain: 'Sync',
      label: 'P2P Mobile-PC Sync Queue',
      status: 'pass',
      detail: '0 unconfirmed P2P mobile bills waiting in local queue.',
      action: null,
    });
  }

  // 6. Data Hygiene: Strict Numeric HSN/SAC Check (4/6/8 digits; empty inventory = unknown!)
  const prodList = Array.isArray(products) ? products.filter(Boolean) : [];
  if (prodList.length === 0) {
    pushCheck({
      id: 'hsn-hygiene',
      domain: 'Data Hygiene',
      label: 'Inventory HSN / SAC Format',
      status: 'unknown',
      detail: '0 products in Inventory — cannot evaluate HSN/SAC code completeness yet.',
      action: 'Add products with 4, 6, or 8-digit numeric HSN/SAC codes before GSTR-1 Table 12 export.',
    });
  } else {
    const nonEmptyInvalid = prodList.filter((p) => {
      const h = String(p.hsn || '').trim();
      return h.length > 0 && !VALID_NUMERIC_HSN_RE.test(h);
    });
    const missingHsn = prodList.filter((p) => !String(p.hsn || '').trim());
    if (nonEmptyInvalid.length === 0 && missingHsn.length === 0) {
      pushCheck({
        id: 'hsn-hygiene',
        domain: 'Data Hygiene',
        label: 'Inventory HSN / SAC Format',
        status: 'pass',
        detail: `All ${prodList.length} item(s) have 4/6/8-digit numeric HSN/SAC format (verify exact tariff rate with CA).`,
        action: null,
      });
    } else if (nonEmptyInvalid.length > 0) {
      pushCheck({
        id: 'hsn-hygiene',
        domain: 'Data Hygiene',
        label: 'Inventory HSN / SAC Format',
        status: 'fail',
        detail: `${nonEmptyInvalid.length} invalid numeric HSN/SAC code(s)${missingHsn.length ? ` and ${missingHsn.length} blank HSN(s)` : ''} out of ${prodList.length} product(s).`,
        action: 'Fix non-numeric or 5-digit HSN codes to valid 4, 6, or 8-digit numeric HSN/SAC before GSTR-1 export.',
      });
    } else {
      pushCheck({
        id: 'hsn-hygiene',
        domain: 'Data Hygiene',
        label: 'Inventory HSN / SAC Format',
        status: 'warn',
        detail: `${missingHsn.length} of ${prodList.length} product(s) have blank HSN/SAC codes.`,
        action: 'Add 4, 6, or 8-digit numeric HSN/SAC codes in Products & Stock before GSTR-1 Table 12 export.',
      });
    }
  }

  // 7. Data Hygiene: Business GSTIN & Place of Supply Profile
  if (!profile || (!profile.businessName && !profile.gstin)) {
    pushCheck({
      id: 'profile-hygiene',
      domain: 'Data Hygiene',
      label: 'Business Profile & State',
      status: 'unknown',
      detail: 'Business profile is not configured yet.',
      action: 'Set Business Name, State, and GSTIN (if registered) in Settings → Company.',
    });
  } else if (!String(profile.state || '').trim()) {
    pushCheck({
      id: 'profile-hygiene',
      domain: 'Data Hygiene',
      label: 'Business Profile & State',
      status: 'fail',
      detail: 'Business State is blank — CGST+SGST vs IGST interstate tax split cannot be determined reliably.',
      action: 'Select your State in Settings → Company before issuing GST invoices.',
    });
  } else if (profile.gstin && !VALID_GSTIN_FORMAT_RE.test(String(profile.gstin).trim())) {
    pushCheck({
      id: 'profile-hygiene',
      domain: 'Data Hygiene',
      label: 'Business Profile & State',
      status: 'warn',
      detail: 'Configured GSTIN does not match the 15-character standard format.',
      action: 'Check GSTIN spelling in Settings → Company.',
    });
  } else {
    pushCheck({
      id: 'profile-hygiene',
      domain: 'Data Hygiene',
      label: 'Business Profile & State',
      status: 'pass',
      detail: `State (${profile.state})${profile.gstin ? ' and 15-char GSTIN format' : ' (unregistered/exempt mode)'} configured.`,
      action: null,
    });
  }

  // 8. Compliance Advisory: Scoped Section 43B(h) MSME Payment Check (never passes on empty/untagged data!)
  const clientList = Array.isArray(clients) ? clients.filter(Boolean) : [];
  const hasAnyTaggedMsme =
    clientList.some((c) => Boolean(c.isMsme || c.udyamNo || c.msmeType)) ||
    scopedPurchases.some((p) => Boolean(p.isMsme || p.udyamNo));

  if (scopedPurchases.length === 0) {
    pushCheck({
      id: 'sec-43b-advisory',
      domain: 'Compliance Advisory',
      label: `Sec 43B(h) MSME Dues (${fy})`,
      status: 'unknown',
      detail: `No purchase bills recorded in ${fy} — insufficient data to evaluate MSME 15d/45d timelines.`,
      action: 'Record supplier bills in Purchases and tag MSME Udyam numbers in Clients.',
    });
  } else if (!hasAnyTaggedMsme) {
    pushCheck({
      id: 'sec-43b-advisory',
      domain: 'Compliance Advisory',
      label: `Sec 43B(h) MSME Dues (${fy})`,
      status: 'unknown',
      detail: `${scopedPurchases.length} purchase bill(s) found, but 0 suppliers have Udyam / MSME classification recorded.`,
      action: 'Mark verified Micro/Small suppliers in Clients (or use What-if preview in AI Munim) and review with CA.',
    });
  } else {
    const res43B = checkSection43BCompliance({
      purchases: scopedPurchases,
      clients: clientList,
      treatAllUnpaidSuppliersAsMsmeIfUnmarked: false,
    });
    if (res43B.criticalCount > 0) {
      const hasOverdue = res43B.bills.some((b) => b.daysRemaining < 0);
      pushCheck({
        id: 'sec-43b-advisory',
        domain: 'Compliance Advisory',
        label: `Sec 43B(h) MSME Dues (${fy})`,
        status: hasOverdue ? 'fail' : 'warn',
        detail: `${res43B.criticalCount} verified MSME bill(s) approaching/past 15d/45d limit (₹${res43B.totalAtRiskAmount.toLocaleString('en-IN')} unpaid).`,
        action: 'Review payment dates & written-agreement terms with your CA before 31-March FY close.',
      });
    } else {
      pushCheck({
        id: 'sec-43b-advisory',
        domain: 'Compliance Advisory',
        label: `Sec 43B(h) MSME Dues (${fy})`,
        status: 'pass',
        detail: 'No verified MSME purchase bills currently exceed 15d/45d alert thresholds (advisory only; CA review required).',
        action: null,
      });
    }
  }

  const counts = {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
    unknown: checks.filter((c) => c.status === 'unknown' || c.status === 'info').length,
  };

  return {
    checkedAt: new Date().toISOString(),
    scopeLabel: `${profile?.businessName || 'Current Workspace'} · FY ${fy}`,
    completedChecks: checks.length,
    totalChecks,
    counts,
    hasCriticalFailure: counts.fail > 0,
    checks,
    methodologyNote:
      'Diagnostic & data-hygiene checklist on local workspace data only — does not verify government GST/ITR portal acceptance or substitute Chartered Accountant review.',
  };
}
