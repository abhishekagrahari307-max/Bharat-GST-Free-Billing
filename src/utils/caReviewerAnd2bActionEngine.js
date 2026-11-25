// CA Multi-Client .bharatca Reviewer Hub & GSTR-2B "Action Taken" ITC Engine (v5.3.0)
// 1. Decrypts, hash-chain-verifies, and aggregates 20–50+ client `.bharatca` packages into a
//    prioritized CA Practice Compliance Matrix (flagging tampered chains, unbalanced TB, 43B(h) risk).
// 2. Transforms GSTR-2B vs Purchase Register reconciliation into an interactive CA Action Sheet
//    (`ACCEPT_ITC`, `KEEP_PENDING`, `DEFER_NEXT_PERIOD`, `REJECT_INELIGIBLE`) with strict
//    Section 16(2)(aa) & Section 17(5) guards and live GSTR-3B Table 4 computation.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import { openCaPackage, verifyAuditChain, buildAuditChainFromVouchers } from './hashChain.js';
import { r2 } from './doubleEntry.js';

export const GSTR2B_ACTIONS = [
  {
    code: 'ACCEPT_ITC',
    label: 'Accept ITC (Table 4A)',
    shortLabel: 'Accept',
    color: '#15803d',
    bg: 'rgba(22, 163, 74, 0.12)',
  },
  {
    code: 'KEEP_PENDING',
    label: 'Keep Pending / Hold',
    shortLabel: 'Pending',
    color: '#b45309',
    bg: 'rgba(217, 119, 6, 0.14)',
  },
  {
    code: 'DEFER_NEXT_PERIOD',
    label: 'Defer (Not in 2B - Sec 16(2)(aa))',
    shortLabel: 'Defer (No 2B)',
    color: '#2563eb',
    bg: 'rgba(37, 99, 235, 0.12)',
  },
  {
    code: 'REJECT_INELIGIBLE',
    label: 'Reject / Ineligible (Table 4D / Sec 17(5))',
    shortLabel: 'Reject',
    color: '#b91c1c',
    bg: 'rgba(220, 38, 38, 0.12)',
  },
];

export const GSTR2B_REASON_CODES = [
  { code: 'ELIGIBLE_VERIFIED', label: 'Eligible business purchase & tax invoice verified' },
  { code: 'AWAITING_SUPPLIER_GSTR1', label: 'Missing in 2B — supplier yet to file GSTR-1 (Sec 16(2)(aa))' },
  { code: 'VALUE_OR_TAX_DIFF', label: 'Tax / invoice value mismatch — awaiting CN/DN or vendor amendment' },
  { code: 'GOODS_NOT_RECEIVED', label: 'Goods/services in transit — Sec 16(2)(b) receipt pending' },
  { code: 'SEC_17_5_BLOCKED', label: 'Blocked credit under Section 17(5) (personal / food / motor vehicle)' },
  { code: 'WRONG_GSTIN_UPLOAD', label: 'Not our purchase — wrongly uploaded on our GSTIN by supplier' },
];

const ACTIONS_STORAGE_KEY = 'bharatgst_gstr2b_actions_v1';

function resolveLocalStore(customStorage = null) {
  if (customStorage) return customStorage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* ignore */ }
  return null;
}

export function loadSaved2bActionMap(ownerGstin = '', customStorage = null) {
  const store = resolveLocalStore(customStorage);
  if (!store) return {};
  try {
    const all = JSON.parse(store.getItem(ACTIONS_STORAGE_KEY) || '{}');
    const scope = String(ownerGstin || 'DEFAULT').trim().toUpperCase() || 'DEFAULT';
    return all[scope] && typeof all[scope] === 'object' ? all[scope] : {};
  } catch {
    return {};
  }
}

export function save2bActionDecision(
  ownerGstin = '',
  rowKey,
  decisionPatch,
  customStorage = null
) {
  const store = resolveLocalStore(customStorage);
  if (!store || !rowKey) return {};
  const scope = String(ownerGstin || 'DEFAULT').trim().toUpperCase() || 'DEFAULT';
  let all = {};
  try {
    all = JSON.parse(store.getItem(ACTIONS_STORAGE_KEY) || '{}') || {};
  } catch {
    all = {};
  }
  const prevScope = all[scope] && typeof all[scope] === 'object' ? all[scope] : {};
  const nextScope = {
    ...prevScope,
    [rowKey]: {
      ...(prevScope[rowKey] || {}),
      ...decisionPatch,
      updatedAt: new Date().toISOString(),
    },
  };
  all[scope] = nextScope;
  try {
    store.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore quota */ }
  return nextScope;
}

/**
 * Converts `reconcileGstr2bFuzzy` output into a unified, stateful CA ITC Action Sheet.
 */
export function buildUnified2bActionRows(reconResult, savedDecisions = {}) {
  if (!reconResult) return [];
  const rows = [];

  const pushRow = ({
    bucket,
    bucketLabel,
    supplierGstin,
    supplierName,
    portalInvoiceNo,
    bookInvoiceNo,
    date,
    portalValue,
    bookValue,
    portalTax,
    bookTax,
    defaultAction,
    defaultReason,
    whatsappFollowUpUrl = '',
    matchNote = '',
  }) => {
    const cleanGstin = String(supplierGstin || 'UNREG').trim().toUpperCase();
    const invRef = String(portalInvoiceNo || bookInvoiceNo || 'NA').trim().toUpperCase();
    const rowKey = `${bucket}::${cleanGstin}::${invRef}`;
    const saved = savedDecisions?.[rowKey] || {};
    const action = saved.action || defaultAction;
    const reasonCode = saved.reasonCode || defaultReason;
    const remark = String(saved.remark || '').trim();

    // Statutory guard: claiming ITC when invoice is absent from GSTR-2B violates Sec 16(2)(aa) CGST Act!
    const statutoryWarning =
      bucket === 'MISSING_IN_2B' && action === 'ACCEPT_ITC'
        ? 'Sec 16(2)(aa) Warning: Invoice is NOT present in portal GSTR-2B; claiming ITC in Table 4(A)(5) risks automated DRC-01C mismatch notice.'
        : null;

    const claimableBasisTax =
      bucket === 'MISSING_IN_2B'
        ? r2(bookTax)
        : bucket === 'VALUE_MISMATCH'
          ? r2(Math.min(portalTax, bookTax)) // Conservative lower-of-2B-or-Books default when accepted
          : r2(portalTax > 0 ? portalTax : bookTax);

    rows.push({
      rowKey,
      bucket,
      bucketLabel,
      supplierGstin: cleanGstin,
      supplierName: supplierName || 'Supplier',
      portalInvoiceNo: portalInvoiceNo || '—',
      bookInvoiceNo: bookInvoiceNo || '—',
      date: date || '—',
      portalValue: r2(portalValue),
      bookValue: r2(bookValue),
      portalTax: r2(portalTax),
      bookTax: r2(bookTax),
      taxDelta: r2((portalTax || 0) - (bookTax || 0)),
      effectiveItcAmount: claimableBasisTax,
      action,
      reasonCode,
      remark,
      matchNote,
      whatsappFollowUpUrl,
      statutoryWarning,
    });
  };

  for (const m of reconResult.exactMatches || []) {
    pushRow({
      bucket: 'EXACT_MATCH',
      bucketLabel: 'Exact 2B Match',
      supplierGstin: m.portal?.ctin || m.book?.gstin,
      supplierName: m.book?.supplierName || m.portal?.supplierName,
      portalInvoiceNo: m.portal?.invoiceNo,
      bookInvoiceNo: m.book?.invoiceNo,
      date: m.portal?.date || m.book?.date,
      portalValue: m.portal?.totalValue,
      bookValue: m.book?.totalValue,
      portalTax: m.portal?.taxAmount,
      bookTax: m.book?.taxAmount,
      defaultAction: 'ACCEPT_ITC',
      defaultReason: 'ELIGIBLE_VERIFIED',
      matchNote: '100% Exact GSTIN, Invoice No & Tax match',
    });
  }

  for (const m of reconResult.fuzzyMatches || []) {
    pushRow({
      bucket: 'FUZZY_MATCH',
      bucketLabel: 'AI Fuzzy Match',
      supplierGstin: m.portal?.ctin || m.book?.gstin,
      supplierName: m.book?.supplierName || m.portal?.supplierName,
      portalInvoiceNo: m.portal?.invoiceNo,
      bookInvoiceNo: m.book?.invoiceNo,
      date: m.portal?.date || m.book?.date,
      portalValue: m.portal?.totalValue,
      bookValue: m.book?.totalValue,
      portalTax: m.portal?.taxAmount,
      bookTax: m.book?.taxAmount,
      defaultAction: 'ACCEPT_ITC',
      defaultReason: 'ELIGIBLE_VERIFIED',
      matchNote: m.note || `Fuzzy confidence ${m.confidence}%`,
    });
  }

  for (const m of reconResult.valueMismatches || []) {
    pushRow({
      bucket: 'VALUE_MISMATCH',
      bucketLabel: 'Value / Tax Mismatch',
      supplierGstin: m.portal?.ctin || m.book?.gstin,
      supplierName: m.book?.supplierName || m.portal?.supplierName,
      portalInvoiceNo: m.portal?.invoiceNo,
      bookInvoiceNo: m.book?.invoiceNo,
      date: m.portal?.date || m.book?.date,
      portalValue: m.portal?.totalValue,
      bookValue: m.book?.totalValue,
      portalTax: m.portal?.taxAmount,
      bookTax: m.book?.taxAmount,
      defaultAction: 'KEEP_PENDING',
      defaultReason: 'VALUE_OR_TAX_DIFF',
      matchNote: `Value Δ ₹${r2(m.valDiff).toFixed(2)} | Tax Δ ₹${r2(m.taxDiff).toFixed(2)}`,
    });
  }

  for (const b of reconResult.missingIn2b || []) {
    pushRow({
      bucket: 'MISSING_IN_2B',
      bucketLabel: 'In Books · Missing in 2B',
      supplierGstin: b.gstin,
      supplierName: b.supplierName,
      portalInvoiceNo: '',
      bookInvoiceNo: b.invoiceNo,
      date: b.date,
      portalValue: 0,
      bookValue: b.totalValue,
      portalTax: 0,
      bookTax: b.taxAmount,
      defaultAction: 'DEFER_NEXT_PERIOD',
      defaultReason: 'AWAITING_SUPPLIER_GSTR1',
      whatsappFollowUpUrl: b.whatsappFollowUpUrl || '',
      matchNote: 'Absent in portal GSTR-2B — hold ITC & notify supplier',
    });
  }

  for (const p of reconResult.missingInBooks || []) {
    pushRow({
      bucket: 'MISSING_IN_BOOKS',
      bucketLabel: 'In 2B · Missing in Books',
      supplierGstin: p.ctin,
      supplierName: p.supplierName,
      portalInvoiceNo: p.invoiceNo,
      bookInvoiceNo: '',
      date: p.date,
      portalValue: p.totalValue,
      bookValue: 0,
      portalTax: p.taxAmount,
      bookTax: 0,
      defaultAction: 'KEEP_PENDING',
      defaultReason: 'GOODS_NOT_RECEIVED',
      matchNote: 'Present in 2B but unrecorded in Purchase Bills',
    });
  }

  return rows;
}

/**
 * Computes GSTR-3B Table 4 Working Summary from CA Action Sheet rows.
 */
export function computeGstr3bTable4FromActions(actionRows = []) {
  let acceptedItc = 0;
  let acceptedCount = 0;
  let pendingItc = 0;
  let pendingCount = 0;
  let deferredNo2bItc = 0;
  let deferredCount = 0;
  let rejectedIneligibleItc = 0;
  let rejectedCount = 0;
  let sec16WarningCount = 0;

  for (const r of actionRows) {
    if (r.statutoryWarning) sec16WarningCount += 1;
    if (r.action === 'ACCEPT_ITC') {
      acceptedItc = r2(acceptedItc + r.effectiveItcAmount);
      acceptedCount += 1;
    } else if (r.action === 'KEEP_PENDING') {
      pendingItc = r2(pendingItc + Math.max(r.portalTax, r.bookTax));
      pendingCount += 1;
    } else if (r.action === 'DEFER_NEXT_PERIOD') {
      deferredNo2bItc = r2(deferredNo2bItc + Math.max(r.bookTax, r.portalTax));
      deferredCount += 1;
    } else if (r.action === 'REJECT_INELIGIBLE') {
      rejectedIneligibleItc = r2(rejectedIneligibleItc + Math.max(r.portalTax, r.bookTax));
      rejectedCount += 1;
    }
  }

  return {
    totalRows: actionRows.length,
    table4A5EligibleItc: acceptedItc,
    acceptedCount,
    heldPendingItc: pendingItc,
    pendingCount,
    deferredMissing2bItc: deferredNo2bItc,
    deferredCount,
    table4D2IneligibleRejectedItc: rejectedIneligibleItc,
    rejectedCount,
    sec16WarningCount,
  };
}

/**
 * Builds exportable headers + rows for the CA GSTR-2B ITC Action Taken Statement.
 */
export function build2bActionExportTable(actionRows = []) {
  const headers = [
    'Bucket',
    'Supplier GSTIN',
    'Supplier Name',
    'Portal Inv No',
    'Books Inv No',
    'Invoice Date',
    'Portal Value (INR)',
    'Books Value (INR)',
    'Portal ITC (INR)',
    'Books ITC (INR)',
    'Effective ITC Basis (INR)',
    'CA Action Taken',
    'Reason Code',
    'CA Remark',
    'Statutory Advisory',
  ];
  const rows = actionRows.map((r) => [
    r.bucketLabel,
    r.supplierGstin,
    r.supplierName,
    r.portalInvoiceNo,
    r.bookInvoiceNo,
    r.date,
    r.portalValue,
    r.bookValue,
    r.portalTax,
    r.bookTax,
    r.effectiveItcAmount,
    r.action,
    r.reasonCode,
    r.remark || r.matchNote || '',
    r.statutoryWarning || '',
  ]);
  return { headers, rows };
}

/**
 * Parses, decrypts (if sealed), and verifies a single client `.bharatca` workpaper file
 * for the CA Multi-Client Reviewer Hub.
 */
export async function parseAndSummarizeClientCaBundle(rawText, passphrase = '', fileName = 'client.bharatca') {
  const bundle = await openCaPackage(rawText, passphrase);

  // Re-verify cryptographic SHA-256 audit hash chain AND cross-verify vouchers -> headHash!
  let chainCheck = Array.isArray(bundle.auditChain)
    ? await verifyAuditChain(bundle.auditChain)
    : {
        valid: Boolean(bundle?.auditTrailProof?.verified),
        checkedCount: Number(bundle?.auditTrailProof?.blockCount || 0),
        headHash: bundle?.auditTrailProof?.headHash || '',
        reason: null,
      };

  if (chainCheck.valid && Array.isArray(bundle.vouchers) && Array.isArray(bundle.auditChain) && bundle.auditChain.length > 0) {
    const rebuilt = await buildAuditChainFromVouchers(bundle.vouchers);
    const rebuiltHead = rebuilt.length > 0 ? rebuilt[rebuilt.length - 1].hash : '';
    if (rebuilt.length !== bundle.auditChain.length || (rebuiltHead && rebuiltHead !== chainCheck.headHash)) {
      chainCheck = {
        valid: false,
        checkedCount: bundle.vouchers.length,
        headHash: rebuiltHead,
        reason: 'Voucher ledger does not match sealed SHA-256 auditChain headHash',
      };
    }
  }

  const tb = bundle.trialBalance || {};
  const totalDr = r2(Number(tb.totalDebit ?? 0));
  const totalCr = r2(Number(tb.totalCredit ?? 0));
  const tbBalanced =
    tb.balanced !== undefined ? Boolean(tb.balanced) && Math.abs(totalDr - totalCr) <= 0.05 : Math.abs(totalDr - totalCr) <= 0.05;

  const gstErrors = Number(bundle?.gstHealthSummary?.errorCount ?? 0);
  const gstWarnings = Number(bundle?.gstHealthSummary?.warningCount ?? 0);
  const invoiceCount = Number(bundle?.gstHealthSummary?.invoiceCount ?? 0);

  const stat = bundle.statutorySummary || {};
  const netGstPayable = r2(Number(stat.netGstPayable ?? 0));
  const sec43bAtRiskAmount = r2(Number(stat.sec43bAtRiskAmount ?? 0));
  const sec43bCriticalCount = Number(stat.sec43bCriticalCount ?? 0);
  const itrTaxableTurnover = r2(Number(stat.itrTaxableTurnover ?? 0));

  const criticalReasons = [];
  const reviewReasons = [];

  if (!chainCheck.valid) {
    criticalReasons.push(`Audit Chain Tampered (${chainCheck.reason || 'hash mismatch'})`);
  }
  if (!tbBalanced) {
    criticalReasons.push(`Trial Balance Out of Balance (Dr ₹${totalDr} vs Cr ₹${totalCr})`);
  }
  if (gstErrors > 0) {
    criticalReasons.push(`${gstErrors} GST Audit Error(s)`);
  }
  if (sec43bCriticalCount > 0) {
    criticalReasons.push(`${sec43bCriticalCount} MSME Sec 43B(h) Risk Bill(s) (₹${sec43bAtRiskAmount.toLocaleString('en-IN')})`);
  }

  if (gstWarnings > 0) {
    reviewReasons.push(`${gstWarnings} GST Pre-Check Warning(s)`);
  }
  if (!bundle?.business?.gstin) {
    reviewReasons.push('Unregistered / Blank GSTIN');
  }

  const riskLevel =
    criticalReasons.length > 0 ? 'CRITICAL' : reviewReasons.length > 0 ? 'REVIEW' : 'CLEAN';

  const gstin = String(bundle?.business?.gstin || '').trim().toUpperCase();
  const businessName = String(bundle?.business?.name || fileName).trim();
  const periodLabel = String(bundle?.periodLabel || 'Current Period').trim();
  const clientKey = `${gstin || businessName.toLowerCase()}::${periodLabel.toLowerCase()}`;

  return {
    clientKey,
    fileName,
    businessName,
    gstin: gstin || 'UNREGISTERED',
    pan: String(bundle?.business?.pan || (gstin.length === 15 ? gstin.slice(2, 12) : '')).toUpperCase(),
    state: bundle?.business?.state || '—',
    periodLabel,
    generatedAt: bundle?.generatedAt || '',
    softwareVersion: bundle?.version || '3.0+',
    voucherCount: Number(bundle?.voucherCount ?? bundle?.vouchers?.length ?? 0),
    invoiceCount,
    auditChainVerified: Boolean(chainCheck.valid),
    auditBlocksChecked: chainCheck.checkedCount,
    auditFailureReason: chainCheck.reason || null,
    trialBalanceBalanced: tbBalanced,
    totalDebit: totalDr,
    totalCredit: totalCr,
    netProfit: r2(Number(bundle?.balanceSheet?.netProfit ?? 0)),
    gstErrors,
    gstWarnings,
    netGstPayable,
    sec43bAtRiskAmount,
    sec43bCriticalCount,
    itrTaxableTurnover,
    riskLevel,
    findings: [...criticalReasons, ...reviewReasons],
    rawBundle: bundle,
  };
}

/**
 * Deduplicates and ranks a CA's loaded client portfolio (`CRITICAL` -> `REVIEW` -> `CLEAN`).
 */
export function aggregateMultiClientCaPortfolio(cards = []) {
  const byKey = new Map();
  for (const c of Array.isArray(cards) ? cards : []) {
    if (!c || !c.clientKey) continue;
    byKey.set(c.clientKey, c);
  }
  const rankWeight = { CRITICAL: 0, REVIEW: 1, CLEAN: 2 };
  const sorted = [...byKey.values()].sort((a, b) => {
    const rw = (rankWeight[a.riskLevel] ?? 9) - (rankWeight[b.riskLevel] ?? 9);
    if (rw !== 0) return rw;
    return b.sec43bAtRiskAmount - a.sec43bAtRiskAmount || a.businessName.localeCompare(b.businessName);
  });

  return {
    totalClients: sorted.length,
    criticalClients: sorted.filter((c) => c.riskLevel === 'CRITICAL').length,
    reviewClients: sorted.filter((c) => c.riskLevel === 'REVIEW').length,
    cleanClients: sorted.filter((c) => c.riskLevel === 'CLEAN').length,
    tamperedClients: sorted.filter((c) => !c.auditChainVerified).length,
    totalPortfolio43bRisk: r2(sorted.reduce((s, c) => s + c.sec43bAtRiskAmount, 0)),
    totalPortfolioNetGst: r2(sorted.reduce((s, c) => s + c.netGstPayable, 0)),
    clients: sorted,
  };
}
