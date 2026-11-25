// Module D (v5.2.0 — Audit-Hardened):
// 1. Canonical Product GST Rate (`taxPercent ?? gstRate ?? taxRate`) in Serverless #b2b-catalog=z.
// 2. Canonical Invoice Breakdown in Multi-Firm Group Consolidation (exact net-of-GST + `'credit-note'` subtraction)
// 3. MSMED Act Sec 15 (15-day without agreement vs max 45-day with agreement) + strict verified MSME default
// 4. fflate Level-9 Deflate Compression (~65% smaller URLs, up to 150 items + legacy uncompressed fallback)
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';
import {
  resolveProductTaxPercent,
  resolveProductSellingPrice,
  normalizeInvoiceBreakdown,
} from './canonicalAdapter.js';

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

export function checkSection43BCompliance({
  purchases = [],
  clients = [],
  today = new Date(),
  hasWrittenAgreementDefault = true,
  agreedCreditDaysDefault = 45,
  treatAllUnpaidSuppliersAsMsmeIfUnmarked = false,
} = {}) {
  const nowMs = (today instanceof Date ? today : new Date(today)).getTime();
  const clientByName = new Map();
  const clientByGstin = new Map();

  for (const c of Array.isArray(clients) ? clients : []) {
    if (!c) continue;
    if (c.name) clientByName.set(String(c.name).trim().toLowerCase(), c);
    if (c.gstin) clientByGstin.set(String(c.gstin).trim().toUpperCase(), c);
  }

  const atRiskBills = [];
  let totalAtRiskAmount = 0;

  for (const p of Array.isArray(purchases) ? purchases : []) {
    if (!p || p.cancelled || String(p.status || '').toLowerCase() === 'cancelled') continue;
    const total = r2(p.totalAmount ?? p.grandTotal ?? p.amount ?? 0);
    const paid = r2(p.paidAmount ?? p.amountPaid ?? (p.paymentStatus === 'PAID' || String(p.status || '').toLowerCase() === 'paid' ? total : 0));
    const pending = r2(total - paid);
    if (pending <= 0) continue;

    const supName = String(p.supplierName || p.vendorName || p.partyName || 'Supplier').trim();
    const supGstin = String(p.supplierGstin || p.vendorGstin || '').trim().toUpperCase();
    const matchedClient =
      (supGstin && clientByGstin.get(supGstin)) ||
      clientByName.get(supName.toLowerCase()) ||
      null;

    const explicitlyMsme = Boolean(
      p.isMsme ||
      p.udyamNo ||
      matchedClient?.isMsme ||
      matchedClient?.udyamNo ||
      matchedClient?.msmeType
    );

    if (!explicitlyMsme && !treatAllUnpaidSuppliersAsMsmeIfUnmarked) continue;

    const hasAgreement =
      p.hasWrittenAgreement !== undefined
        ? Boolean(p.hasWrittenAgreement)
        : matchedClient?.hasWrittenAgreement !== undefined
          ? Boolean(matchedClient.hasWrittenAgreement)
          : Boolean(hasWrittenAgreementDefault);

    const rawAgreedDays = Number(
      p.creditDays ?? matchedClient?.creditDays ?? agreedCreditDaysDefault
    );
    const statutoryLimitDays = hasAgreement
      ? Math.min(45, Math.max(1, Number.isFinite(rawAgreedDays) && rawAgreedDays > 0 ? rawAgreedDays : 45))
      : 15;

    const startDateStr = p.acceptanceDate || p.deliveryDate || p.date || p.billDate || p.invoiceDate;
    const billMs = startDateStr ? new Date(startDateStr).getTime() : NaN;
    if (!Number.isFinite(billMs)) continue;

    const daysElapsed = Math.floor((nowMs - billMs) / 86400000);
    const daysRemaining = statutoryLimitDays - daysElapsed;

    const warningTriggerDays = statutoryLimitDays <= 15 ? 5 : 30;
    if (daysElapsed >= warningTriggerDays) {
      totalAtRiskAmount = r2(totalAtRiskAmount + pending);
      atRiskBills.push({
        billNumber: String(p.invoiceNumber || p.billNumber || p.id || ''),
        supplierName: supName,
        udyamNo: p.udyamNo || matchedClient?.udyamNo || (explicitlyMsme ? 'MSME Verified' : 'Unverified (Preview)'),
        explicitlyVerifiedMsme: explicitlyMsme,
        hasWrittenAgreement: hasAgreement,
        statutoryLimitDays,
        billDate: String(startDateStr).slice(0, 10),
        pendingAmount: pending,
        daysElapsed,
        daysRemaining,
        severity: daysRemaining < 0 ? 'DISALLOWED_OVERDUE' : daysRemaining <= 7 ? 'CRITICAL_7_DAYS' : 'WARNING_DUE_SOON',
        estimatedTaxHit30Pct: r2(pending * 0.312),
      });
    }
  }

  atRiskBills.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    criticalCount: atRiskBills.length,
    totalAtRiskAmount,
    estimatedTaxImpact30Pct: r2(totalAtRiskAmount * 0.312),
    bills: atRiskBills,
    advisoryNote:
      'MSMED Act Sec 15: 15 days without written agreement; max 45 days with written agreement (Micro & Small Enterprises). Section 43B(h) disallowance applies if unpaid across the 31-March FY boundary — confirm final tax treatment with your CA.',
  };
}

export function detectMarginErosion(product = {}, latestPurchaseRate = 0, minMarginPercent = 12) {
  const newBuy = r2(latestPurchaseRate);
  const currentSell = resolveProductSellingPrice(product);
  const prevBuy = r2(product.purchasePrice ?? product.costPrice ?? 0);
  if (newBuy <= 0 || currentSell <= 0) return null;

  const newMarginPct = r2(((currentSell - newBuy) / currentSell) * 100);
  const targetMin = Number(minMarginPercent) || 12;

  if (newMarginPct >= targetMin && (prevBuy <= 0 || newBuy <= prevBuy * 1.03)) {
    return null;
  }

  const targetDivisor = Math.max(0.1, 1 - targetMin / 100);
  const suggestedSaleRate = Math.ceil(newBuy / targetDivisor);

  return {
    itemId: product.id || '',
    itemName: String(product.name || 'Item'),
    previousPurchaseRate: prevBuy,
    newPurchaseRate: newBuy,
    currentSaleRate: currentSell,
    newMarginPercent: newMarginPct,
    suggestedSaleRate,
    message: `Supplier cost for "${product.name || 'Item'}" is ₹${newBuy} (margin dropped to ${newMarginPct}%). Suggested new selling price: ₹${suggestedSaleRate} to maintain ${targetMin}% margin.`,
  };
}

export function runAutonomousMunimAdvisor({
  bills = [],
  purchases = [],
  products = [],
  creditLimitPerParty = 50000,
  minMarginPercent = 12,
} = {}) {
  const advisories = [];

  const latestBuyByItem = new Map();
  for (const pur of Array.isArray(purchases) ? purchases : []) {
    for (const it of Array.isArray(pur?.items) ? pur.items : []) {
      const key = String(it.productId || it.name || '').trim().toLowerCase();
      const rate = Number(it.rate ?? it.price ?? it.purchasePrice ?? 0);
      if (key && rate > 0) latestBuyByItem.set(key, rate);
    }
  }

  const marginAlerts = [];
  for (const prod of Array.isArray(products) ? products : []) {
    const key = String(prod.id || '').trim().toLowerCase();
    const nameKey = String(prod.name || '').trim().toLowerCase();
    const latestRate = latestBuyByItem.get(key) ?? latestBuyByItem.get(nameKey) ?? Number(prod.purchasePrice || 0);
    const alert = detectMarginErosion(prod, latestRate, minMarginPercent);
    if (alert) marginAlerts.push(alert);
  }
  if (marginAlerts.length > 0) {
    advisories.push({
      type: 'MARGIN_EROSION',
      priority: 'HIGH',
      count: marginAlerts.length,
      message: `${marginAlerts.length} item(s) have margin below ${minMarginPercent}% after recent purchase rates — review suggested repricing.`,
      details: marginAlerts,
    });
  }

  const receivableByClient = new Map();
  for (const b of Array.isArray(bills) ? bills : []) {
    const norm = normalizeInvoiceBreakdown(b);
    if (norm.sign !== 1) continue;
    const paid = r2(b.amountPaid ?? (String(b.status || '').toLowerCase() === 'paid' ? norm.grossTotal : 0));
    const due = r2(norm.grossTotal - paid);
    if (due > 0) {
      const party = String(b.clientName || b.data?.client?.name || 'Customer').trim();
      receivableByClient.set(party, r2((receivableByClient.get(party) || 0) + due));
    }
  }

  const creditBreaches = [];
  for (const [party, due] of receivableByClient.entries()) {
    if (due > creditLimitPerParty) {
      creditBreaches.push({ party, outstanding: due, creditLimit: creditLimitPerParty });
    }
  }
  if (creditBreaches.length > 0) {
    advisories.push({
      type: 'CREDIT_LIMIT_BREACH',
      priority: 'MEDIUM',
      count: creditBreaches.length,
      message: `${creditBreaches.length} party ledger(s) exceed ₹${Number(creditLimitPerParty).toLocaleString('en-IN')} credit exposure.`,
      details: creditBreaches,
    });
  }

  return {
    advisories,
    marginAlerts,
    creditBreaches,
  };
}

function bytesToUrlBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 = typeof btoa === 'function' ? btoa(binary) : globalThis.Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlBase64ToBytes(b64Url) {
  const b64 = String(b64Url || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  if (typeof atob === 'function') {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(globalThis.Buffer.from(padded, 'base64'));
}

function compressJsonToken(obj) {
  const rawBytes = strToU8(JSON.stringify(obj));
  const compressed = deflateSync(rawBytes, { level: 9 });
  return `z.${bytesToUrlBase64(compressed)}`;
}

function decompressJsonToken(token) {
  const s = String(token || '').trim();
  if (!s) return null;
  if (s.startsWith('z.')) {
    const compressedBytes = urlBase64ToBytes(s.slice(2));
    const inflated = inflateSync(compressedBytes);
    return JSON.parse(strFromU8(inflated));
  }
  const legacyBytes = urlBase64ToBytes(s);
  return JSON.parse(strFromU8(legacyBytes));
}

export const SERVERLESS_CATALOG_MAX_ITEMS = 150;

/**
 * Generates an fflate-compressed Zero-Server WhatsApp / B2B Storefront URL (`#b2b-catalog=z.<deflate>`).
 * Uses `resolveProductTaxPercent` & `resolveProductSellingPrice` so standard Inventory products (`taxPercent`)
 * ALWAYS preserve their exact 5% / 12% / 18% / 28% GST rate!
 */
export function generateServerlessCatalogLink(baseUrl, business = {}, products = []) {
  const eligible = (Array.isArray(products) ? products : []).filter(
    (p) => p && resolveProductSellingPrice(p) > 0 && Number(p.stock ?? 1) > 0
  );
  const compactItems = eligible.slice(0, SERVERLESS_CATALOG_MAX_ITEMS).map((p) => ({
    c: String(p.id || '').slice(-8),
    n: String(p.name || 'Item').slice(0, 42),
    r: resolveProductSellingPrice(p),
    g: resolveProductTaxPercent(p),
    u: String(p.unit || 'PCS').slice(0, 6),
  }));

  const payload = {
    v: 2,
    ts: new Date().toISOString().slice(0, 10),
    totalEligible: eligible.length,
    b: {
      n: String(business.businessName || business.name || 'Bharat Store').slice(0, 50),
      p: String(business.phone || business.mobile || '').replace(/\D/g, '').slice(-10),
      s: String(business.state || '').slice(0, 24),
    },
    i: compactItems,
  };

  const cleanBase = String(baseUrl || 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/').split('#')[0];
  return `${cleanBase}#b2b-catalog=${compressJsonToken(payload)}`;
}

export function decodeServerlessCatalogLink(urlOrHash = '') {
  const idx = String(urlOrHash).indexOf('#b2b-catalog=');
  if (idx === -1) return null;
  const token = String(urlOrHash).slice(idx + '#b2b-catalog='.length).trim();
  try {
    return decompressJsonToken(token);
  } catch {
    return null;
  }
}

export function encodeB2BOrderToken(order = {}) {
  return `BGST-ORD:${compressJsonToken(order)}`;
}

export function decodeB2BOrderToken(text = '') {
  const match = /BGST-ORD:([A-Za-z0-9._-]+)/.exec(String(text || ''));
  if (!match) return null;
  try {
    return decompressJsonToken(match[1]);
  } catch {
    return null;
  }
}

/**
 * Multi-Firm Consolidated Financial View across multiple GSTINs / Company Profiles.
 * Uses `normalizeInvoiceBreakdown` so group sales reflect exact net-of-GST taxable revenue minus credit notes!
 */
export function computeMultiFirmConsolidation({
  profiles = [],
  bills = [],
  purchases = [],
  expenses = [],
} = {}) {
  const firmGstins = new Set(
    (Array.isArray(profiles) ? profiles : [])
      .map((p) => String(p?.gstin || '').trim().toUpperCase())
      .filter((g) => g.length >= 15)
  );

  let grossSales = 0;
  let interFirmSalesEliminated = 0;
  let totalReceivables = 0;

  for (const b of Array.isArray(bills) ? bills : []) {
    const norm = normalizeInvoiceBreakdown(b);
    if (norm.sign === 0) continue;
    const netSale = r2(norm.taxableValue * norm.sign);
    grossSales = r2(grossSales + netSale);

    if (norm.clientGstin && firmGstins.has(norm.clientGstin) && norm.ownerGstin !== norm.clientGstin) {
      interFirmSalesEliminated = r2(interFirmSalesEliminated + netSale);
    }

    if (norm.sign === 1) {
      const paid = r2(b.amountPaid ?? (String(b.status || '').toLowerCase() === 'paid' ? norm.grossTotal : 0));
      totalReceivables = r2(totalReceivables + Math.max(0, norm.grossTotal - paid));
    }
  }

  let grossPurchases = 0;
  let interFirmPurchasesEliminated = 0;
  let totalPayables = 0;

  for (const p of Array.isArray(purchases) ? purchases : []) {
    if (!p || p.cancelled || String(p.status || '').toLowerCase() === 'cancelled') continue;
    const total = r2(p.totalAmount ?? p.grandTotal ?? p.amount ?? 0);
    const splitTax = r2(
      (Number(p.cgst ?? p.totalCgst ?? 0) || 0) +
      (Number(p.sgst ?? p.totalSgst ?? 0) || 0) +
      (Number(p.igst ?? p.totalIgst ?? 0) || 0)
    );
    const tax = splitTax > 0 ? splitTax : r2(Number(p.gstAmount ?? p.taxAmount ?? 0));
    const purVal = p.taxableAmount != null ? r2(p.taxableAmount) : r2(Math.max(0, total - tax));
    grossPurchases = r2(grossPurchases + purVal);

    const supGstin = String(p.supplierGstin || p.vendorGstin || '').trim().toUpperCase();
    const ownerGstin = String(p.ownerGstin || p.businessGstin || '').trim().toUpperCase();
    if (supGstin && firmGstins.has(supGstin) && ownerGstin !== supGstin) {
      interFirmPurchasesEliminated = r2(interFirmPurchasesEliminated + purVal);
    }

    const paid = r2(p.paidAmount ?? p.amountPaid ?? (p.paymentStatus === 'PAID' || String(p.status || '').toLowerCase() === 'paid' ? total : 0));
    totalPayables = r2(totalPayables + Math.max(0, total - paid));
  }

  let totalOperatingExpenses = 0;
  for (const e of Array.isArray(expenses) ? expenses : []) {
    if (!e || e.cancelled) continue;
    totalOperatingExpenses = r2(totalOperatingExpenses + Math.max(0, Number(e.amount || 0) - Number(e.gstAmount || 0)));
  }

  const netConsolidatedSales = r2(Math.max(0, grossSales - interFirmSalesEliminated));
  const netConsolidatedPurchases = r2(Math.max(0, grossPurchases - interFirmPurchasesEliminated));
  const consolidatedNetProfit = r2(netConsolidatedSales - netConsolidatedPurchases - totalOperatingExpenses);

  return {
    firmCount: Math.max(1, Array.isArray(profiles) ? profiles.length : 1),
    grossSales,
    interFirmEliminated: interFirmSalesEliminated,
    netConsolidatedSales,
    grossPurchases,
    netConsolidatedPurchases,
    totalOperatingExpenses,
    consolidatedNetProfit,
    totalReceivables,
    totalPayables,
  };
}
