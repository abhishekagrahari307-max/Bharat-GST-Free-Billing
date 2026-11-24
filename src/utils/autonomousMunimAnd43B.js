// Module D (v5.0.0): Autonomous Bharat Business OS —
// 1. Income Tax Section 43B(h) MSME 45-Day Payment Disallowance Shield
// 2. Purchase Rate Hike & Margin Erosion Arbitrage Detector
// 3. Autonomous AI Munim (Proactive Hinglish Financial & Credit Limit Advisor)
// 4. UTF-8 Serverless WhatsApp B2B Storefront Link Encoder / Decoder (#b2b-catalog=...)
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * 1. Income Tax Section 43B(h) MSME 45-Day Payment Shield
 * Identifies unpaid MSME supplier bills approaching or exceeding the 45-day statutory deadline.
 */
export function checkSection43BCompliance({
  purchases = [],
  clients = [],
  today = new Date(),
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
      (bill.isMsme || bill.udyamNo ? { name: supName, udyamNo: bill.udyamNo || 'MSME-UDYAM' } : null) ||
      (treatAllUnpaidSuppliersAsMsmeIfUnmarked ? { name: supName, udyamNo: 'Verify Udyam Status' } : null);

    if (!matchedSupplier) continue;

    const rawDate = bill.date || bill.invoiceDate || bill.billDate;
    if (!rawDate) continue;
    const billDate = new Date(rawDate);
    if (Number.isNaN(billDate.getTime())) continue;

    const daysElapsed = Math.floor((refDate - billDate) / (1000 * 60 * 60 * 24));
    const daysRemaining = 45 - daysElapsed;

    if (daysElapsed >= 30) {
      totalAtRiskTaxable = r2(totalAtRiskTaxable + pendingAmt);
      criticalBills.push({
        billNumber: bill.invoiceNumber || bill.billNumber || 'PUR-BILL',
        supplierName: matchedSupplier.name || supName,
        udyamNo: matchedSupplier.udyamNo || 'MSME Registered',
        billDate: String(rawDate).slice(0, 10),
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
    estimatedTaxImpact30Pct: r2(totalAtRiskTaxable * 0.312), // 30% slab + 4% cess
    bills: criticalBills.sort((a, b) => a.daysRemaining - b.daysRemaining),
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

/**
 * Scans the entire product catalog for thin/negative margins + generates Autonomous AI Munim advisories.
 */
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

  // Detect parties exceeding credit limit or >30 days unpaid
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

function utf8ToUrlBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlBase64ToUtf8(urlB64) {
  let b64 = String(urlB64 || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * 3. Serverless B2B Digital Catalog Link Generator (#b2b-catalog=...)
 * Encodes live inventory into a compact URL hash so buyers browse & order on WhatsApp with ₹0 server cost!
 */
export function generateServerlessCatalogLink(baseUrl = '', business = {}, items = []) {
  const compactPayload = {
    b: {
      n: String(business?.businessName || business?.name || 'Bharat GST Store').trim(),
      p: String(business?.phone || '').trim(),
      u: String(business?.upiId || '').trim(),
    },
    i: (Array.isArray(items) ? items : [])
      .filter((it) => it && (!it.trackStock || (Number(it.stock ?? it.stockQty ?? 1) > 0)))
      .slice(0, 80)
      .map((it) => ({
        c: it.id || '',
        n: String(it.name || 'Item'),
        r: Number(it.sellingPrice ?? it.saleRate ?? it.price ?? 0) || 0,
        g: Number(it.gstRate || 0) || 0,
        u: String(it.unit || 'PCS'),
      })),
  };

  const encoded = utf8ToUrlBase64(JSON.stringify(compactPayload));
  const cleanBase = String(baseUrl || 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/').replace(/#.*$/, '').replace(/\/$/, '');
  return `${cleanBase}/#b2b-catalog=${encoded}`;
}

export function decodeServerlessCatalogLink(hashString = '') {
  const match = String(hashString || '').match(/b2b-catalog=([A-Za-z0-9\-_]+)/);
  if (!match) return null;
  try {
    return JSON.parse(urlBase64ToUtf8(match[1]));
  } catch {
    return null;
  }
}
