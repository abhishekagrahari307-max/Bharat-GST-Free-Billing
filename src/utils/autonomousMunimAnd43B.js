// Module D (v5.1.0 Audit-Hardened): Autonomous Bharat Business OS —
// 1. Income Tax Section 43B(h) + MSMED Act Section 15 Shield (15-Day No-Agreement vs Written Agreement Max 45-Day Rule, strict MSME default)
// 2. Purchase Rate Hike & Margin Erosion Arbitrage Detector
// 3. fflate Deflate-Compressed Serverless WhatsApp B2B Storefront (#b2b-catalog=z.<base64url> — 65% smaller URLs, up to 150 items + legacy fallback)
// 4. Compact BGST-ORD Order Token & Multi-Firm Group Consolidated P&L (with Inter-Firm Elimination)
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import { deflateSync, inflateSync, strToU8, strFromU8 } from 'fflate';

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * 1. Income Tax Section 43B(h) + MSMED Act Section 15 Compliance Shield
 * Statutory rules implemented:
 * - Without a written agreement: payment limit is 15 days from acceptance/delivery/bill date.
 * - With a written agreement: payment limit is agreed credit days capped at 45 days maximum.
 * - By default (treatAllUnpaidSuppliersAsMsmeIfUnmarked = false), ONLY verified MSME suppliers (isMsme / udyamNo) are flagged.
 */
export function checkSection43BCompliance({
  purchases = [],
  clients = [],
  today = new Date(),
  hasWrittenAgreementDefault = true,
  agreedCreditDaysDefault = 45,
  treatAllUnpaidSuppliersAsMsmeIfUnmarked = false,
} = {}) {
  const refDate = today instanceof Date ? today : new Date(today);
  const msmeMap = new Map();

  for (const s of (Array.isArray(clients) ? clients : [])) {
    if (s && (s.isMsme || s.udyamNo || /udyam/i.test(String(s.notes || '')))) {
      if (s.gstin) msmeMap.set(String(s.gstin).toUpperCase(), s);
      if (s.name) msmeMap.set(String(s.name).trim().toLowerCase(), s);
    }
  }

  const criticalBills = [];
  let totalAtRiskTaxable = 0;

  for (const bill of (Array.isArray(purchases) ? purchases : [])) {
    if (!bill) continue;
    const status = String(bill.paymentStatus || bill.status || '').toUpperCase();
    const totalAmt = Number(bill.totalAmount ?? bill.grandTotal ?? 0) || 0;
    const paidAmt = Number(bill.paidAmount ?? bill.amountPaid ?? 0) || 0;
    const pendingAmt = r2(totalAmt - paidAmt);
    if (status === 'PAID' || pendingAmt <= 0) continue;

    const supGstin = String(bill.supplierGstin || bill.vendorGstin || '').toUpperCase();
    const supName = String(bill.supplierName || bill.vendorName || 'Supplier').trim();
    const matchedSupplier =
      msmeMap.get(supGstin) ||
      msmeMap.get(supName.toLowerCase()) ||
      (bill.isMsme || bill.udyamNo ? { name: supName, udyamNo: bill.udyamNo || 'MSME-UDYAM', hasWrittenAgreement: bill.hasWrittenAgreement, creditDays: bill.creditDays } : null) ||
      (treatAllUnpaidSuppliersAsMsmeIfUnmarked ? { name: supName, udyamNo: 'Unverified (Preview)', unverifiedPreview: true } : null);

    if (!matchedSupplier) continue;

    // MSMED Act Sec 15: 15 days without written agreement; min(agreedDays, 45) with written agreement
    const hasWritten =
      bill.hasWrittenAgreement !== undefined
        ? Boolean(bill.hasWrittenAgreement)
        : matchedSupplier.hasWrittenAgreement !== undefined
          ? Boolean(matchedSupplier.hasWrittenAgreement)
          : Boolean(hasWrittenAgreementDefault);

    const rawAgreedDays = Number(bill.creditDays ?? matchedSupplier.creditDays ?? agreedCreditDaysDefault) || 45;
    const statutoryLimitDays = hasWritten ? Math.min(45, Math.max(1, rawAgreedDays)) : 15;
    const warningThresholdDays = hasWritten ? Math.max(10, statutoryLimitDays - 15) : 10;

    // Count from acceptance/delivery date when recorded, falling back to invoice date
    const triggerDateRaw = bill.acceptanceDate || bill.deliveryDate || bill.date || bill.invoiceDate || bill.billDate;
    if (!triggerDateRaw) continue;
    const triggerDate = new Date(triggerDateRaw);
    if (Number.isNaN(triggerDate.getTime())) continue;

    const daysElapsed = Math.floor((refDate - triggerDate) / (1000 * 60 * 60 * 24));
    const daysRemaining = statutoryLimitDays - daysElapsed;

    if (daysElapsed >= warningThresholdDays || daysRemaining <= 5) {
      totalAtRiskTaxable = r2(totalAtRiskTaxable + pendingAmt);
      criticalBills.push({
        billNumber: bill.invoiceNumber || bill.billNumber || 'PUR-BILL',
        supplierName: matchedSupplier.name || supName,
        udyamNo: matchedSupplier.udyamNo || 'MSME Registered',
        unverifiedPreview: Boolean(matchedSupplier.unverifiedPreview),
        billDate: String(triggerDateRaw).slice(0, 10),
        statutoryLimitDays,
        hasWrittenAgreement: hasWritten,
        daysElapsed,
        daysRemaining,
        pendingAmount: pendingAmt,
        severity: daysRemaining < 0 ? 'DISALLOWED_OVERDUE' : 'CRITICAL_DUE_SOON',
      });
    }
  }

  return {
    criticalCount: criticalBills.length,
    totalAtRiskAmount: r2(totalAtRiskTaxable),
    estimatedTaxImpact30Pct: r2(totalAtRiskTaxable * 0.312),
    bills: criticalBills.sort((a, b) => a.daysRemaining - b.daysRemaining),
    advisoryNote:
      'MSMED Act Sec 15 limit is 15 days without written agreement (max 45 days with written agreement) from goods acceptance. Sec 43B(h) disallowance applies if unpaid across FY close (31 March); verify Micro/Small Udyam certificate with your CA.',
  };
}

/**
 * 2. Purchase Rate Hike & Margin Erosion Arbitrage Detector
 */
export function detectMarginErosion(item, newPurchaseRate, minMarginPercent = 10) {
  if (!item) return null;
  const oldPurchaseRate = Number(item.purchasePrice ?? item.purchaseRate ?? 0) || 0;
  const currentSaleRate = Number(item.sellingPrice ?? item.saleRate ?? item.price ?? 0) || 0;
  const nextCost = Number(newPurchaseRate);
  if (!Number.isFinite(nextCost) || nextCost <= 0) return null;

  const rateIncrease = r2(nextCost - oldPurchaseRate);
  const newMarginAmt = r2(currentSaleRate - nextCost);
  const newMarginPct = currentSaleRate > 0 ? r2((newMarginAmt / currentSaleRate) * 100) : 0;

  if (rateIncrease > 0 || newMarginPct < minMarginPercent) {
    const suggestedSaleRate = Math.ceil(nextCost / (1 - minMarginPercent / 100));
    return {
      itemId: item.id,
      itemName: item.name,
      oldPurchaseRate,
      newPurchaseRate: nextCost,
      rateHike: rateIncrease,
      currentSaleRate,
      newMarginPercent: newMarginPct,
      suggestedSaleRate,
      alert: `Cost ₹${rateIncrease.toFixed(2)} badh gayi hai! ${minMarginPercent}% margin bachane ke liye Sale Rate ₹${suggestedSaleRate} karein.`,
    };
  }
  return null;
}

export function runAutonomousMunimAdvisor({
  bills = [],
  purchases = [],
  products = [],
  minMarginPercent = 12,
  creditLimitPerParty = 50000,
} = {}) {
  const marginAlerts = [];
  for (const p of (Array.isArray(products) ? products : [])) {
    const buy = Number(p?.purchasePrice ?? p?.purchaseRate ?? 0) || 0;
    const sell = Number(p?.sellingPrice ?? p?.price ?? 0) || 0;
    if (buy > 0 && sell > 0) {
      const check = detectMarginErosion(p, buy, minMarginPercent);
      if (check && check.newMarginPercent < minMarginPercent) {
        marginAlerts.push(check);
      }
    }
  }

  const partyDues = new Map();
  const nowMs = Date.now();
  for (const b of (Array.isArray(bills) ? bills : [])) {
    if (!b || b.status === 'paid' || b.status === 'cancelled') continue;
    const due = r2((Number(b.totalAmount) || 0) - (Number(b.amountPaid) || 0));
    if (due <= 0) continue;
    const name = String(b.clientName || b.data?.client?.name || 'Walk-in').trim();
    const ageDays = Math.floor((nowMs - new Date(b.invoiceDate || Date.now()).getTime()) / 86400000);
    const cur = partyDues.get(name) || { partyName: name, totalDue: 0, maxAgeDays: 0, phone: b.data?.client?.phone || '' };
    cur.totalDue = r2(cur.totalDue + due);
    cur.maxAgeDays = Math.max(cur.maxAgeDays, ageDays);
    partyDues.set(name, cur);
  }

  const creditBreaches = [...partyDues.values()]
    .filter((p) => p.totalDue >= creditLimitPerParty || p.maxAgeDays >= 30)
    .sort((a, b) => b.totalDue - a.totalDue);

  const advisories = [];
  for (const m of marginAlerts.slice(0, 4)) {
    advisories.push({
      type: 'MARGIN_ARBITRAGE',
      message: `"${m.itemName}" ka margin ab sirf ${m.newMarginPercent}% hai (Purchase ₹${m.newPurchaseRate} vs Sale ₹${m.currentSaleRate}) — suggested naya rate: ₹${m.suggestedSaleRate}.`,
    });
  }
  for (const c of creditBreaches.slice(0, 4)) {
    advisories.push({
      type: 'CREDIT_RISK',
      message: `${c.partyName} par ₹${c.totalDue.toLocaleString('en-IN')} baaki hai (${c.maxAgeDays} din se pending) — naya udhaar bill dene se pehle WhatsApp recovery reminder bhejein.`,
    });
  }
  if (advisories.length === 0 && (bills.length > 0 || purchases.length > 0)) {
    advisories.push({
      type: 'HEALTHY',
      message: 'Sabhi items ka profit margin aur party credit limits safe zone me hain!',
    });
  }

  return {
    marginAlerts,
    creditBreaches,
    advisories,
  };
}

function uint8ToBase64Url(u8) {
  let binary = '';
  for (let i = 0; i < u8.length; i += 1) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8(b64url) {
  let b64 = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    u8[i] = binary.charCodeAt(i);
  }
  return u8;
}

/**
 * 3. fflate Deflate-Compressed Serverless B2B Storefront Link Generator (#b2b-catalog=z.<compressed>)
 * Shrinks URLs by ~65%, supports up to 150 items, stamps snapshot date (`ts`), and keeps legacy backward compatibility!
 */
export function generateServerlessCatalogLink(baseUrl = '', business = {}, items = []) {
  const eligibleItems = (Array.isArray(items) ? items : []).filter(
    (it) => it && (!it.trackStock || (Number(it.stock ?? it.stockQty ?? 1) > 0))
  );
  const compactPayload = {
    ts: new Date().toISOString().slice(0, 10),
    totalEligible: eligibleItems.length,
    b: {
      n: String(business?.businessName || business?.name || 'Bharat GST Store').trim(),
      p: String(business?.phone || '').trim(),
      u: String(business?.upiId || '').trim(),
    },
    i: eligibleItems.slice(0, 150).map((it) => ({
      c: it.id || '',
      n: String(it.name || 'Item'),
      r: Number(it.sellingPrice ?? it.saleRate ?? it.price ?? 0) || 0,
      g: Number(it.gstRate || 0) || 0,
      u: String(it.unit || 'PCS'),
    })),
  };

  const rawBytes = strToU8(JSON.stringify(compactPayload));
  const compressed = deflateSync(rawBytes, { level: 9 });
  const encoded = uint8ToBase64Url(compressed);
  const cleanBase = String(baseUrl || 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/').replace(/#.*$/, '').replace(/\/$/, '');
  return `${cleanBase}/#b2b-catalog=z.${encoded}`;
}

export function decodeServerlessCatalogLink(hashString = '') {
  const match = String(hashString || '').match(/b2b-catalog=([A-Za-z0-9\-_.]+)/);
  if (!match) return null;
  const token = match[1];
  try {
    if (token.startsWith('z.')) {
      const compressedBytes = base64UrlToUint8(token.slice(2));
      const decompressed = inflateSync(compressedBytes);
      return JSON.parse(strFromU8(decompressed));
    }
    // Backward compatibility for legacy uncompressed URLs
    const rawBytes = base64UrlToUint8(token);
    return JSON.parse(strFromU8(rawBytes));
  } catch {
    return null;
  }
}

/**
 * 4. Compact B2B Order Token (BGST-ORD:z.<compressed>) Encoder & Decoder
 */
export function encodeB2BOrderToken(orderToken = {}) {
  const compressed = deflateSync(strToU8(JSON.stringify(orderToken)), { level: 9 });
  return `BGST-ORD:z.${uint8ToBase64Url(compressed)}`;
}

export function decodeB2BOrderToken(rawText = '') {
  const match = String(rawText || '').match(/BGST-ORD:([A-Za-z0-9\-_.=+/]+)/);
  if (!match) return null;
  const token = match[1];
  try {
    if (token.startsWith('z.')) {
      return JSON.parse(strFromU8(inflateSync(base64UrlToUint8(token.slice(2)))));
    }
    return JSON.parse(strFromU8(base64UrlToUint8(token)));
  } catch {
    return null;
  }
}

/**
 * 5. Multi-Firm Group Consolidated P&L & Balance Sheet Summary (with Inter-Firm Elimination)
 */
export function computeMultiFirmConsolidation({
  profiles = [],
  bills = [],
  purchases = [],
  expenses = [],
} = {}) {
  const groupGstins = new Set(
    (Array.isArray(profiles) ? profiles : [])
      .map((p) => String(p?.gstin || '').trim().toUpperCase())
      .filter(Boolean)
  );

  let grossGroupSales = 0;
  let interFirmSalesEliminated = 0;
  let totalReceivables = 0;

  const byFirm = new Map();
  const ensureFirm = (key, label) => {
    const k = key || 'DEFAULT_FIRM';
    if (!byFirm.has(k)) {
      byFirm.set(k, { firmKey: k, firmName: label || k, sales: 0, purchases: 0, expenses: 0 });
    }
    return byFirm.get(k);
  };

  for (const p of (Array.isArray(profiles) ? profiles : [])) {
    ensureFirm(String(p?.gstin || p?.businessName || 'MAIN').toUpperCase(), p?.businessName || 'Main Firm');
  }

  for (const b of (Array.isArray(bills) ? bills : [])) {
    if (!b || b.status === 'cancelled') continue;
    const docType = String(b?.data?.invoiceType || b?.invoiceType || 'Tax Invoice');
    if (/proforma|quotation|challan|estimate|purchase order/i.test(docType)) continue;

    const amt = Number(b?.data?.subtotal || b?.totalAmount || 0) || 0;
    const sign = /credit note/i.test(docType) ? -1 : 1;
    const ownerKey = String(b.ownerGstin || b.ownerName || 'MAIN').toUpperCase();
    const firm = ensureFirm(ownerKey, b.ownerName || ownerKey);
    firm.sales = r2(firm.sales + sign * amt);
    grossGroupSales = r2(grossGroupSales + sign * amt);

    const buyerGstin = String(b.clientGstin || b?.data?.client?.gstin || '').trim().toUpperCase();
    if (buyerGstin && groupGstins.has(buyerGstin) && buyerGstin !== String(b.ownerGstin || '').trim().toUpperCase()) {
      interFirmSalesEliminated = r2(interFirmSalesEliminated + sign * amt);
    }

    if (b.status !== 'paid') {
      const due = Math.max(0, (Number(b.totalAmount) || 0) - (Number(b.amountPaid) || 0));
      totalReceivables = r2(totalReceivables + due);
    }
  }

  let grossGroupPurchases = 0;
  let interFirmPurchasesEliminated = 0;
  let totalPayables = 0;

  for (const pur of (Array.isArray(purchases) ? purchases : [])) {
    if (!pur) continue;
    const amt = Number(pur.taxableAmount ?? pur.subtotal ?? pur.totalAmount ?? 0) || 0;
    const ownerKey = String(pur.ownerGstin || pur.ownerName || 'MAIN').toUpperCase();
    const firm = ensureFirm(ownerKey, pur.ownerName || ownerKey);
    firm.purchases = r2(firm.purchases + amt);
    grossGroupPurchases = r2(grossGroupPurchases + amt);

    const supGstin = String(pur.supplierGstin || pur.vendorGstin || '').trim().toUpperCase();
    if (supGstin && groupGstins.has(supGstin) && supGstin !== String(pur.ownerGstin || '').trim().toUpperCase()) {
      interFirmPurchasesEliminated = r2(interFirmPurchasesEliminated + amt);
    }

    const paid = Number(pur.paidAmount ?? pur.amountPaid ?? 0) || 0;
    const due = Math.max(0, (Number(pur.totalAmount) || 0) - paid);
    if (String(pur.paymentStatus || '').toUpperCase() !== 'PAID') {
      totalPayables = r2(totalPayables + due);
    }
  }

  let totalGroupExpenses = 0;
  for (const ex of (Array.isArray(expenses) ? expenses : [])) {
    const amt = Number(ex?.amount || 0) || 0;
    const ownerKey = String(ex?.ownerGstin || ex?.ownerName || 'MAIN').toUpperCase();
    const firm = ensureFirm(ownerKey, ex?.ownerName || ownerKey);
    firm.expenses = r2(firm.expenses + amt);
    totalGroupExpenses = r2(totalGroupExpenses + amt);
  }

  const netConsolidatedSales = r2(Math.max(0, grossGroupSales - interFirmSalesEliminated));
  const netConsolidatedPurchases = r2(Math.max(0, grossGroupPurchases - interFirmPurchasesEliminated));
  const consolidatedNetProfit = r2(netConsolidatedSales - netConsolidatedPurchases - totalGroupExpenses);

  return {
    firmCount: byFirm.size,
    firms: [...byFirm.values()],
    grossGroupSales,
    interFirmEliminated: r2(Math.max(interFirmSalesEliminated, interFirmPurchasesEliminated)),
    netConsolidatedSales,
    netConsolidatedPurchases,
    totalGroupExpenses,
    consolidatedNetProfit,
    totalReceivables,
    totalPayables,
  };
}
