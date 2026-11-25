// v5.5.0 — Express POS Counter, Live UPI QR, Cash Tender Calculator,
// Inventory Valuation & Khata Portfolio Engine.
// Pure, deterministic functions with zero DOM dependencies so every
// calculation is 100% unit-testable in Node.

import { isValidNumericHsnCode } from './systemHealthEvaluator.js';

const INDIAN_DENOMINATIONS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

function round2(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Validates standard NPCI UPI VPA format (e.g. "merchant@okicici", "9876543210@ybl").
 */
export function isValidUpiVpa(vpa) {
  const s = String(vpa || '').trim();
  if (!s || s.length < 5 || s.length > 100) return false;
  return /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9.-]{2,32}$/.test(s);
}

/**
 * Resolves the active UPI ID and Payee Name from the business profile and
 * optional selected payment account on the current invoice.
 */
export function resolveMerchantUpiDetails(profile = {}, selectedAccountId = null) {
  const accounts = Array.isArray(profile?.paymentAccounts)
    ? profile.paymentAccounts.filter((a) => a && a.enabled !== false)
    : [];
  const chosen =
    (selectedAccountId && accounts.find((a) => a.id === selectedAccountId)) ||
    accounts.find((a) => a.isDefault && a.upiId) ||
    accounts.find((a) => a.upiId) ||
    null;

  const rawUpi = String(chosen?.upiId || profile?.upiId || profile?.upi || '').trim();
  const payeeName = String(
    chosen?.accountHolder || profile?.businessName || 'Bharat GST Store'
  ).trim();

  return {
    upiId: rawUpi,
    isValid: isValidUpiVpa(rawUpi),
    payeeName,
    accountLabel: chosen?.label || chosen?.bankName || (rawUpi ? 'Business UPI' : ''),
  };
}

/**
 * Builds an NPCI-compliant dynamic `upi://pay` URI for exact counter checkout.
 */
export function buildDynamicCounterUpiUri({
  upiId = '',
  payeeName = 'Merchant',
  amount = 0,
  invoiceNumber = '',
  note = '',
} = {}) {
  const cleanVpa = String(upiId || '').trim();
  if (!isValidUpiVpa(cleanVpa)) return '';

  const cleanPayee = String(payeeName || 'Merchant').trim().slice(0, 60) || 'Merchant';
  const amt = round2(amount);
  const txNote = String(
    note || (invoiceNumber ? `Bill ${invoiceNumber}` : `Payment to ${cleanPayee}`)
  )
    .trim()
    .slice(0, 80);

  const params = [
    `pa=${encodeURIComponent(cleanVpa)}`,
    `pn=${encodeURIComponent(cleanPayee)}`,
  ];
  if (amt > 0) {
    params.push(`am=${amt.toFixed(2)}`);
  }
  params.push('cu=INR');
  if (txNote) {
    params.push(`tn=${encodeURIComponent(txNote)}`);
  }
  return `upi://pay?${params.join('&')}`;
}

/**
 * Suggests realistic quick-tap cash tender amounts for Indian retail counters.
 * E.g. for ₹342 -> [342, 350, 400, 500, 1000, 2000]
 */
export function suggestQuickTenderAmounts(billTotal = 0) {
  const exact = Math.max(0, round2(billTotal));
  if (exact <= 0) return [100, 200, 500];

  const whole = Math.ceil(exact);
  const candidates = new Set([exact]);

  const next10 = Math.ceil(whole / 10) * 10;
  const next50 = Math.ceil(whole / 50) * 50;
  const next100 = Math.ceil(whole / 100) * 100;
  const next200 = Math.ceil(whole / 200) * 200;
  const next500 = Math.ceil(whole / 500) * 500;

  [whole, next10, next50, next100, next200, next500, whole + 100, whole + 500, 500, 1000, 2000]
    .filter((v) => v >= exact)
    .sort((a, b) => a - b)
    .forEach((v) => {
      if (candidates.size < 6) candidates.add(round2(v));
    });

  return [...candidates];
}

/**
 * Computes exact change to return, shortfall (if under-tendered), and an
 * Indian currency note/coin breakup so counter cashiers never miscount change.
 */
export function computeCashTenderBreakdown(billTotal = 0, cashTendered = 0) {
  const due = Math.max(0, round2(billTotal));
  const tendered = Math.max(0, round2(cashTendered));
  const rawDiff = round2(tendered - due);
  const changeToReturn = rawDiff > 0 ? rawDiff : 0;
  const shortfall = rawDiff < 0 ? round2(-rawDiff) : 0;

  let remainingWhole = Math.floor(changeToReturn + 1e-9);
  const paiseChange = round2(changeToReturn - remainingWhole);
  const denominationBreakup = [];

  for (const note of INDIAN_DENOMINATIONS) {
    if (remainingWhole >= note) {
      const count = Math.floor(remainingWhole / note);
      denominationBreakup.push({ note, count, value: note * count });
      remainingWhole -= count * note;
    }
  }

  const breakupText = denominationBreakup
    .map((d) => `${d.count}×₹${d.note}`)
    .join(' + ');

  return {
    billTotal: due,
    cashTendered: tendered,
    changeToReturn,
    paiseChange,
    shortfall,
    isSufficient: tendered + 0.005 >= due && due > 0,
    isExact: Math.abs(tendered - due) < 0.01 && due > 0,
    recommendedPaidAmount: Math.min(due, tendered),
    denominationBreakup,
    breakupText,
  };
}

/**
 * Computes inventory cost value, selling value, projected gross margin,
 * low/out-of-stock count, and strict 4/6/8-digit HSN hygiene count.
 */
export function computeInventoryValuationSummary(
  products = [],
  { lowStockThreshold = 5, alertsEnabled = true } = {}
) {
  const list = Array.isArray(products) ? products : [];
  let goodsCount = 0;
  let serviceCount = 0;
  let totalCostValue = 0;
  let totalSellingValue = 0;
  let lowOrOutCount = 0;
  let outOfStockCount = 0;
  let missingOrInvalidHsnCount = 0;

  for (const p of list) {
    if (!p) continue;
    const isService =
      p.kind === 'service' ||
      p.type === 'service' ||
      p.isService === true;

    const rawHsn = String(p.hsn || p.sac || '').trim();
    if (!isValidNumericHsnCode(rawHsn)) {
      missingOrInvalidHsnCount += 1;
    }

    if (isService) {
      serviceCount += 1;
      continue;
    }

    goodsCount += 1;
    const hasStock = p.stock !== '' && p.stock !== null && p.stock !== undefined;
    if (!hasStock) continue;

    const qty = Number(p.stock);
    if (!Number.isFinite(qty)) continue;

    if (qty <= 0) {
      outOfStockCount += 1;
      lowOrOutCount += 1;
    } else if (alertsEnabled && qty <= Number(lowStockThreshold || 5)) {
      lowOrOutCount += 1;
    }

    if (qty > 0) {
      const sellPrice = Number(p.sellingPrice ?? p.rate) || 0;
      const buyPrice =
        p.purchasePrice !== '' && p.purchasePrice !== null && p.purchasePrice !== undefined
          ? Number(p.purchasePrice) || 0
          : sellPrice;
      totalCostValue += qty * buyPrice;
      totalSellingValue += qty * sellPrice;
    }
  }

  const costRounded = round2(totalCostValue);
  const sellRounded = round2(totalSellingValue);
  const potentialProfit = round2(sellRounded - costRounded);
  const marginPercent =
    sellRounded > 0 ? round2((potentialProfit / sellRounded) * 100) : 0;

  return {
    totalProducts: list.length,
    goodsCount,
    serviceCount,
    totalCostValue: costRounded,
    totalSellingValue: sellRounded,
    potentialProfit,
    marginPercent,
    lowOrOutCount,
    outOfStockCount,
    missingOrInvalidHsnCount,
  };
}

/**
 * Computes portfolio-level Khata & Udhaari metrics across all client accounts.
 */
export function computeKhataPortfolioSummary(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  let totalBilled = 0;
  let totalCollected = 0;
  let totalReceivable = 0;
  let totalAdvanceCredit = 0;
  let owingPartiesCount = 0;
  let overCreditLimitCount = 0;

  for (const row of list) {
    if (!row) continue;
    const billed = Math.max(0, Number(row.total) || 0);
    const paid = Math.max(0, Number(row.paid) || 0);
    const unpaid = Number(row.unpaid) || 0;
    const creditLimit = Math.max(0, Number(row.creditLimit) || 0);

    totalBilled += billed;
    totalCollected += paid;
    if (unpaid > 0.005) {
      totalReceivable += unpaid;
      owingPartiesCount += 1;
      if (creditLimit > 0 && unpaid > creditLimit + 0.005) {
        overCreditLimitCount += 1;
      }
    } else if (unpaid < -0.005) {
      totalAdvanceCredit += Math.abs(unpaid);
    }
  }

  return {
    totalParties: list.length,
    totalBilled: round2(totalBilled),
    totalCollected: round2(totalCollected),
    totalReceivable: round2(totalReceivable),
    totalAdvanceCredit: round2(totalAdvanceCredit),
    owingPartiesCount,
    overCreditLimitCount,
  };
}
