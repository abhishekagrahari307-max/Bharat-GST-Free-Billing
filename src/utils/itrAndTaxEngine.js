// Module A (v5.2.0 — Audit-Hardened Statutory Engine):
// 1. Canonical Invoice Adapter (reads `data.totals.taxableAmount`, subtracts `'credit-note'`, skips quotes/cancelled)
// 2. Strict Financial Year (`fy`, Apr 1 – Mar 31) & Active Business (`ownerGstin`) isolation + Opening/Closing Stock COGS
// 3. Sec 44AD (₹2 Cr vs ₹3 Cr) & Sec 44ADA (₹50L vs ₹75L) 5%-cash-receipt condition
// 4. Section 87A Proviso Marginal Relief above ₹12,00,000 + Surcharge + Strict AIS Validation + Live Form 26Q
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import {
  normalizeInvoiceBreakdown,
  filterRecordsByFyAndFirm,
} from './canonicalAdapter.js';
import { checkSection43BCompliance } from './autonomousMunimAnd43B.js';

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * Parses an Income Tax Portal AIS / TIS / 26AS JSON export with strict schema validation.
 * Rejects unrelated or malformed JSON files instead of silently returning ₹0 credit!
 */
export function parseAISJson(rawJson) {
  let data = rawJson;
  if (typeof rawJson === 'string') {
    const trimmed = rawJson.trim();
    if (!trimmed) throw new Error('Uploaded AIS file is empty.');
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error('Invalid AIS JSON file — could not parse JSON syntax.');
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Unsupported AIS JSON root — expected an Income Tax AIS / TIS JSON object.');
  }

  const hasAisEnvelope =
    Boolean(data.aisData && typeof data.aisData === 'object') ||
    Array.isArray(data.partB) ||
    Array.isArray(data.tdsTcsInformation) ||
    Array.isArray(data.sftInformation) ||
    Array.isArray(data.tdsDetails) ||
    Array.isArray(data.tcsDetails);

  if (!hasAisEnvelope) {
    throw new Error(
      'Unsupported JSON format: missing AIS/TIS schema keys (aisData, partB, tdsTcsInformation, or tdsDetails). Please upload an official Income Tax Portal AIS/TIS JSON export.'
    );
  }

  const tdsEntries = [];
  const sftTransactions = [];
  let totalTdsCredit = 0;
  let totalTcsCredit = 0;

  const partB =
    data.aisData?.partB ||
    data.partB ||
    data.tdsTcsInformation ||
    data.tdsDetails ||
    [];

  const walkRows = (rows, fallbackType = 'TDS') => {
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      if (Array.isArray(row.details) || Array.isArray(row.transactions)) {
        const cat = String(row.category || row.infoCode || row.type || fallbackType).toUpperCase();
        walkRows(row.details || row.transactions, cat);
        continue;
      }
      const cat = String(row.category || row.infoCode || row.section || fallbackType).toUpperCase();
      const grossAmount = r2(row.amount ?? row.grossAmount ?? row.transactionAmount ?? row.amountPaid ?? 0);
      const taxDeducted = r2(row.tdsAmount ?? row.taxDeducted ?? row.tcsAmount ?? row.taxCollected ?? row.tdsAmt ?? row.taxAmt ?? 0);
      const deductorName = String(row.deductorName || row.sourceName || row.collectorName || row.partyName || 'Unknown Deductor').trim();
      const tan = String(row.tan || row.deductorTan || row.pan || '').trim().toUpperCase();

      if (cat.includes('SFT') || (!taxDeducted && grossAmount >= 100000 && (row.sftCode || cat.includes('CASH') || cat.includes('SALE')))) {
        sftTransactions.push({
          code: row.sftCode || cat || 'SFT',
          source: deductorName,
          identifier: tan,
          reportedAmount: grossAmount,
        });
      } else if (cat.includes('TCS') || cat.includes('206C')) {
        totalTcsCredit = r2(totalTcsCredit + taxDeducted);
        tdsEntries.push({ type: 'TCS', section: cat, deductorName, tan, grossAmount, taxCredit: taxDeducted });
      } else if (taxDeducted > 0 || grossAmount > 0) {
        totalTdsCredit = r2(totalTdsCredit + taxDeducted);
        tdsEntries.push({ type: 'TDS', section: cat || '194C/194J/194Q', deductorName, tan, grossAmount, taxCredit: taxDeducted });
      }
    }
  };

  walkRows(partB, 'TDS');
  if (Array.isArray(data.sftInformation)) walkRows(data.sftInformation, 'SFT');
  if (Array.isArray(data.tcsDetails)) walkRows(data.tcsDetails, 'TCS');

  return {
    pan: String(data.pan || data.aisData?.pan || '').toUpperCase(),
    financialYear: String(data.financialYear || data.aisData?.fy || '2026-27'),
    tdsEntries,
    sftTransactions,
    totalTdsCredit,
    totalTcsCredit,
    totalPrepaidTaxes: r2(totalTdsCredit + totalTcsCredit),
  };
}

function computeRawSlabTax(income) {
  let slabTax = 0;
  const slabs = [
    [400000, 800000, 0.05],
    [800000, 1200000, 0.10],
    [1200000, 1600000, 0.15],
    [1600000, 2000000, 0.20],
    [2000000, 2400000, 0.25],
    [2400000, Infinity, 0.30],
  ];
  for (const [low, high, rate] of slabs) {
    if (income > low) {
      slabTax += (Math.min(income, high) - low) * rate;
    }
  }
  return r2(slabTax);
}

/**
 * Computes New Regime (Section 115BAC — Finance Act 2025 / AY 2026-27 & 2027-28)
 * individual/HUF resident income tax on normal-rate income, INCLUDING:
 * - Section 87A Rebate up to ₹12,00,000 (₹60,000 max rebate)
 * - Section 87A Proviso Marginal Relief above ₹12,00,000 (up to ~₹12,70,588)
 * - Surcharge (10% > ₹50L, 15% > ₹1Cr, 25% > ₹2Cr under 115BAC) with Surcharge Marginal Relief
 * - 4% Health & Education Cess
 */
export function calculateNewRegimeTaxDetailed(taxableIncome) {
  const income = Math.max(0, Math.round(Number(taxableIncome) || 0));
  if (income <= 400000) {
    return { taxableIncome: income, slabTax: 0, rebate87A: 0, marginalRelief87A: 0, surcharge: 0, cess: 0, totalTax: 0 };
  }

  const slabTax = computeRawSlabTax(income);
  let rebate87A = 0;
  let marginalRelief87A = 0;
  let taxAfterRebate = slabTax;

  if (income <= 1200000) {
    rebate87A = Math.min(slabTax, 60000);
    taxAfterRebate = r2(Math.max(0, slabTax - rebate87A));
  } else {
    const excessOver12L = income - 1200000;
    if (slabTax > excessOver12L) {
      marginalRelief87A = r2(slabTax - excessOver12L);
      taxAfterRebate = r2(excessOver12L);
    }
  }

  let surcharge = 0;
  const surchargeThresholds = [
    { limit: 20000000, rate: 0.25, prevRate: 0.15 },
    { limit: 10000000, rate: 0.15, prevRate: 0.10 },
    { limit: 5000000, rate: 0.10, prevRate: 0 },
  ];
  for (const tier of surchargeThresholds) {
    if (income > tier.limit) {
      const rawSurcharge = r2(taxAfterRebate * tier.rate);
      const totalWithSurcharge = r2(taxAfterRebate + rawSurcharge);
      const taxAtThreshold = computeRawSlabTax(tier.limit) * (1 + tier.prevRate);
      const maxPayableWithRelief = r2(taxAtThreshold + (income - tier.limit));
      if (totalWithSurcharge > maxPayableWithRelief) {
        surcharge = r2(Math.max(0, maxPayableWithRelief - taxAfterRebate));
      } else {
        surcharge = rawSurcharge;
      }
      break;
    }
  }

  const taxPlusSurcharge = r2(taxAfterRebate + surcharge);
  const cess = r2(taxPlusSurcharge * 0.04);
  const totalTax = r2(taxPlusSurcharge + cess);

  return {
    taxableIncome: income,
    slabTax,
    rebate87A,
    marginalRelief87A,
    surcharge,
    cess,
    totalTax,
  };
}

export function calculateNewRegimeTax(taxableIncome) {
  return calculateNewRegimeTaxDetailed(taxableIncome).totalTax;
}

const GTA_REGEX = /\b(gta|transport|transporter|lorry|truck|freight|carriage|bhada|tempo)\b/i;
const NON_DEDUCTIBLE_CAT_REGEX = /\b(personal|drawings|asset purchase|capital|contra|bank deposit)\b/i;

export function checkSingleCashExpense40A3({
  amount = 0,
  paymentMode = '',
  category = '',
  description = '',
  isGta = false,
  rule6ddExempt = false,
} = {}) {
  const amt = r2(Math.max(0, Number(amount) || 0));
  const mode = String(paymentMode || '').trim().toLowerCase();
  const isCash = mode === 'cash';
  const catText = `${category || ''} ${description || ''}`;
  const isNonExpense = NON_DEDUCTIBLE_CAT_REGEX.test(catText);
  const gta = Boolean(isGta || GTA_REGEX.test(catText));
  const limit = gta ? 35000 : 10000;
  const disallowed = isCash && !isNonExpense && !rule6ddExempt && amt > limit;
  return {
    isCash,
    isGta: gta,
    limit,
    amount: amt,
    disallowed,
    disallowedAmount: disallowed ? amt : 0,
    message: disallowed
      ? `Sec 40A(3) Disallowed Expense: Cash payment ₹${amt.toLocaleString('en-IN')} exceeds daily ₹${limit.toLocaleString('en-IN')} statutory limit${gta ? ' (GTA)' : ''}. Pay via Bank/UPI/Cheque/NEFT to claim tax deduction.`
      : '',
  };
}

export function auditSection40A3Disallowance({
  expenses = [],
  purchases = [],
  cashEntries = [],
  fy = 'ALL',
  ownerGstin = '',
} = {}) {
  const scopedExpenses = filterRecordsByFyAndFirm(expenses, {
    fy,
    ownerGstin,
    getDate: (e) => e?.date || e?.expenseDate,
    getGstin: (e) => e?.ownerGstin || e?.businessGstin,
  });
  const scopedPurchases = filterRecordsByFyAndFirm(purchases, {
    fy,
    ownerGstin,
    getDate: (p) => p?.billDate || p?.date || p?.invoiceDate,
    getGstin: (p) => p?.ownerGstin || p?.businessGstin,
  });
  const scopedCash = filterRecordsByFyAndFirm(cashEntries, {
    fy,
    ownerGstin,
    getDate: (c) => c?.date,
    getGstin: (c) => c?.ownerGstin || c?.businessGstin,
  });

  // Group single-day cash payments per payee/supplier
  const dayPartyMap = new Map();
  const addLine = ({ id, source, date, party, category, description, amount, isGta, rule6ddExempt }) => {
    const amt = r2(Number(amount) || 0);
    if (amt <= 0 || rule6ddExempt) return;
    if (NON_DEDUCTIBLE_CAT_REGEX.test(`${category || ''} ${description || ''}`)) return;
    const d = String(date || '').slice(0, 10) || 'undated';
    const pKey = String(party || description || id || 'walk-in-payee').trim().toLowerCase();
    const key = `${d}|${pKey}`;
    const gta = Boolean(isGta || GTA_REGEX.test(`${category || ''} ${description || ''} ${party || ''}`));
    if (!dayPartyMap.has(key)) {
      dayPartyMap.set(key, {
        date: d,
        partyName: String(party || description || 'Cash Payee').trim(),
        isGta: gta,
        limit: gta ? 35000 : 10000,
        dailyCashTotal: 0,
        entries: [],
      });
    }
    const bucket = dayPartyMap.get(key);
    if (gta) {
      bucket.isGta = true;
      bucket.limit = 35000;
    }
    bucket.dailyCashTotal = r2(bucket.dailyCashTotal + amt);
    bucket.entries.push({ id, source, category, description, amount: amt });
  };

  for (const e of scopedExpenses) {
    if (!e || e.cancelled) continue;
    const mode = String(e.paymentMode || e.paymentMethod || '').trim().toLowerCase();
    if (mode !== 'cash') continue;
    const netExpense = r2(Math.max(0, (Number(e.amount) || 0) - (Number(e.gstAmount) || 0)));
    addLine({
      id: e.id || e.invoiceNo,
      source: 'Expense',
      date: e.date || e.expenseDate,
      party: e.vendorName || e.payee || e.description,
      category: e.category,
      description: e.description,
      amount: netExpense > 0 ? netExpense : Number(e.amount) || 0,
      isGta: e.isGta,
      rule6ddExempt: e.sec40A3Rule6ddExempt,
    });
  }

  for (const p of scopedPurchases) {
    if (!p || p.cancelled || p.kind === 'po') continue;
    const party = p.supplierName || p.vendorName || 'Supplier';
    if (Array.isArray(p.payments) && p.payments.length > 0) {
      for (const pay of p.payments) {
        if (String(pay?.mode || pay?.method || '').trim().toLowerCase() === 'cash') {
          addLine({
            id: p.id || p.invoiceNumber,
            source: 'Purchase Payment',
            date: pay.date || p.date || p.billDate,
            party,
            category: 'Purchase',
            description: p.note || p.invoiceNumber,
            amount: pay.amount,
            isGta: p.isGta,
            rule6ddExempt: p.sec40A3Rule6ddExempt,
          });
        }
      }
    } else if (String(p.paymentMethod || p.paymentMode || '').trim().toLowerCase() === 'cash') {
      const status = String(p.paymentStatus || p.status || '').toLowerCase();
      const paidAmt = status === 'paid'
        ? (Number(p.totalAmount ?? p.grandTotal ?? p.amount ?? p.total) || 0)
        : (Number(p.amountPaid ?? p.paidAmount) || 0);
      addLine({
        id: p.id || p.invoiceNumber,
        source: 'Purchase Bill',
        date: p.date || p.billDate,
        party,
        category: 'Purchase',
        description: p.note || p.invoiceNumber,
        amount: paidAmt,
        isGta: p.isGta,
        rule6ddExempt: p.sec40A3Rule6ddExempt,
      });
    }
  }

  for (const c of scopedCash) {
    if (!c || c.type !== 'out' || c.source) continue; // skip linked read-only mirrors
    addLine({
      id: c.id,
      source: 'Cash Book',
      date: c.date,
      party: c.name || c.note,
      category: c.category,
      description: c.note,
      amount: c.amount,
      isGta: c.isGta,
      rule6ddExempt: c.sec40A3Rule6ddExempt,
    });
  }

  const disallowedItems = [];
  let totalDisallowedAmount = 0;

  for (const bucket of dayPartyMap.values()) {
    if (bucket.dailyCashTotal > bucket.limit) {
      totalDisallowedAmount = r2(totalDisallowedAmount + bucket.dailyCashTotal);
      disallowedItems.push({
        ...bucket,
        status: 'DISALLOWED_DEFAULT',
        disallowedAmount: bucket.dailyCashTotal,
        section: 'Sec 40A(3)',
        reason: `Single-day cash payment ₹${bucket.dailyCashTotal.toLocaleString('en-IN')} to "${bucket.partyName}" exceeds ₹${bucket.limit.toLocaleString('en-IN')} limit.`,
      });
    }
  }

  return {
    disallowedCount: disallowedItems.length,
    totalDisallowedAmount,
    items: disallowedItems,
  };
}

export function checkSingleCashReceipt269ST({ amount = 0, mode = '' } = {}) {
  const amt = r2(Math.max(0, Number(amount) || 0));
  const isCash = String(mode || '').trim().toLowerCase() === 'cash';
  const violated = isCash && amt >= 200000;
  return {
    isCash,
    amount: amt,
    limit: 200000,
    violated,
    penaltyExposure271DA: violated ? amt : 0,
    message: violated
      ? `Sec 269ST Statutory Alert: Cash receipt of ₹${amt.toLocaleString('en-IN')} is ≥ ₹2,00,000! Attracts 100% penalty (₹${amt.toLocaleString('en-IN')}) u/s 271DA. Accept via NEFT/RTGS/UPI/Cheque instead.`
      : '',
  };
}

export function auditSection269STViolations({
  bills = [],
  receipts = [],
  cashEntries = [],
  fy = 'ALL',
  ownerGstin = '',
} = {}) {
  const scopedBills = filterRecordsByFyAndFirm(bills, {
    fy,
    ownerGstin,
    getDate: (b) => b?.invoiceDate || b?.data?.details?.invoiceDate || b?.date,
    getGstin: (b) => b?.ownerGstin || b?.businessGstin || b?.data?.profile?.gstin,
  });
  const scopedReceipts = filterRecordsByFyAndFirm(receipts, {
    fy,
    ownerGstin,
    getDate: (r) => r?.date,
    getGstin: (r) => r?.ownerGstin || r?.businessGstin,
  });
  const scopedCash = filterRecordsByFyAndFirm(cashEntries, {
    fy,
    ownerGstin,
    getDate: (c) => c?.date,
    getGstin: (c) => c?.ownerGstin || c?.businessGstin,
  });

  const violations = [];
  const personDayCash = new Map();
  const invoiceEventCash = new Map();
  const seenSingleIds = new Set();

  const recordCashIn = ({ id, source, date, party, docNo, amount }) => {
    const amt = r2(Number(amount) || 0);
    if (amt <= 0) return;
    const d = String(date || '').slice(0, 10) || 'undated';
    const pName = String(party || 'Walk-in Customer').trim();
    const pKey = pName.toLowerCase();

    // Limb (b): Single transaction >= ₹2,00,000
    if (amt >= 200000) {
      const uid = `single|${source}|${id || docNo || d}|${amt}`;
      if (!seenSingleIds.has(uid)) {
        seenSingleIds.add(uid);
        violations.push({
          limb: 'Single Transaction (Sec 269ST(b))',
          date: d,
          partyName: pName,
          docNo: docNo || id || source,
          cashAmount: amt,
          penalty271DA: amt,
          reason: `Single cash receipt ₹${amt.toLocaleString('en-IN')} ≥ ₹2,00,000 threshold.`,
        });
      }
    }

    // Track Limb (a): Aggregate from a single person in a single day >= ₹2,00,000
    const dayKey = `${d}|${pKey}`;
    const prevDay = personDayCash.get(dayKey) || { date: d, partyName: pName, total: 0, count: 0 };
    prevDay.total = r2(prevDay.total + amt);
    prevDay.count += 1;
    personDayCash.set(dayKey, prevDay);

    // Track Limb (c): Aggregate against a single invoice/event >= ₹2,00,000
    if (docNo) {
      const evKey = String(docNo).trim().toUpperCase();
      const prevEv = invoiceEventCash.get(evKey) || { docNo, partyName: pName, date: d, total: 0, count: 0 };
      prevEv.total = r2(prevEv.total + amt);
      prevEv.count += 1;
      invoiceEventCash.set(evKey, prevEv);
    }
  };

  for (const b of scopedBills) {
    if (!b || b.cancelled || b.status === 'cancelled') continue;
    const d = b.data || {};
    const invNo = b.invoiceNumber || d?.details?.invoiceNumber || '';
    const party = b.clientName || d?.client?.name || 'Walk-in Customer';
    const invDate = b.invoiceDate || d?.details?.invoiceDate || '';
    const payments = Array.isArray(b.payments) ? b.payments : (Array.isArray(d.payments) ? d.payments : []);
    if (payments.length > 0) {
      payments.forEach((p, idx) => {
        if (String(p?.mode || p?.method || '').trim().toLowerCase() === 'cash') {
          recordCashIn({ id: `${invNo}-p${idx}`, source: 'Invoice Payment', date: p.date || invDate, party, docNo: invNo, amount: p.amount });
        }
      });
    } else {
      const mode = String(b.paymentMode || d.paymentMode || d.paymentMethod || '').trim().toLowerCase();
      if (mode === 'cash') {
        const status = String(b.paymentStatus || b.status || '').toLowerCase();
        const total = Number(b.total ?? b.totalAmount ?? d?.totals?.total ?? 0) || 0;
        const recAmt = status === 'paid' ? total : (Number(b.amountReceived ?? d.amountReceived ?? 0) || 0);
        if (recAmt > 0) {
          recordCashIn({ id: b.id || invNo, source: 'Sales Invoice', date: invDate, party, docNo: invNo, amount: recAmt });
        }
      }
    }
  }

  for (const r of scopedReceipts) {
    if (!r || r.cancelled) continue;
    if (String(r.mode || r.paymentMode || '').trim().toLowerCase() === 'cash') {
      recordCashIn({
        id: r.id || r.receiptNumber,
        source: 'Receipt Voucher',
        date: r.date,
        party: r.clientName || r.partyName,
        docNo: r.invoiceNumber || r.receiptNumber,
        amount: r.amount,
      });
    }
  }

  for (const c of scopedCash) {
    if (!c || c.type !== 'in' || c.source) continue;
    recordCashIn({
      id: c.id,
      source: 'Cash Book',
      date: c.date,
      party: c.name,
      docNo: '',
      amount: c.amount,
    });
  }

  for (const bucket of personDayCash.values()) {
    if (bucket.count > 1 && bucket.total >= 200000) {
      violations.push({
        limb: 'Single Person / Single Day Aggregate (Sec 269ST(a))',
        date: bucket.date,
        partyName: bucket.partyName,
        docNo: `${bucket.count} receipts`,
        cashAmount: bucket.total,
        penalty271DA: bucket.total,
        reason: `Aggregate cash ₹${bucket.total.toLocaleString('en-IN')} from "${bucket.partyName}" on ${bucket.date} ≥ ₹2,00,000.`,
      });
    }
  }

  for (const ev of invoiceEventCash.values()) {
    if (ev.count > 1 && ev.total >= 200000) {
      violations.push({
        limb: 'Single Invoice / Event Aggregate (Sec 269ST(c))',
        date: ev.date,
        partyName: ev.partyName,
        docNo: ev.docNo,
        cashAmount: ev.total,
        penalty271DA: ev.total,
        reason: `Split cash receipts against ${ev.docNo} total ₹${ev.total.toLocaleString('en-IN')} ≥ ₹2,00,000.`,
      });
    }
  }

  const totalViolatingCash = r2(violations.reduce((s, v) => s + v.cashAmount, 0));
  return {
    violationCount: violations.length,
    totalViolatingCash,
    totalPenaltyExposure271DA: totalViolatingCash,
    violations,
  };
}

export function computeDigitalVsCashTurnover(bills = [], { fy = 'ALL', ownerGstin = '' } = {}) {
  const scoped = filterRecordsByFyAndFirm(bills, {
    fy,
    ownerGstin,
    getDate: (b) => b?.invoiceDate || b?.data?.details?.invoiceDate || b?.data?.invoiceDate || b?.date,
    getGstin: (b) => b?.ownerGstin || b?.businessGstin || b?.data?.profile?.gstin,
  });

  let digitalTurnover = 0;
  let cashTurnover = 0;

  for (const b of scoped) {
    const norm = normalizeInvoiceBreakdown(b);
    if (norm.sign === 0 || norm.taxableValue <= 0) continue;
    const signedTaxable = norm.sign * norm.taxableValue;
    const d = b.data || {};
    const payments = Array.isArray(b.payments) ? b.payments : (Array.isArray(d.payments) ? d.payments : []);
    if (payments.length > 0) {
      const cashPaid = payments
        .filter((p) => String(p?.mode || p?.method || '').trim().toLowerCase() === 'cash')
        .reduce((s, p) => s + (Number(p?.amount) || 0), 0);
      const totalPaid = payments.reduce((s, p) => s + (Number(p?.amount) || 0), 0);
      if (totalPaid > 0) {
        const cashRatio = Math.min(1, Math.max(0, cashPaid / totalPaid));
        const cashPart = r2(signedTaxable * cashRatio);
        cashTurnover = r2(cashTurnover + cashPart);
        digitalTurnover = r2(digitalTurnover + (signedTaxable - cashPart));
        continue;
      }
    }
    const mode = String(b.paymentMode || d.paymentMode || d.paymentMethod || d?.details?.paymentTerms || '').trim().toLowerCase();
    if (mode === 'cash') {
      cashTurnover = r2(cashTurnover + signedTaxable);
    } else {
      digitalTurnover = r2(digitalTurnover + signedTaxable);
    }
  }

  digitalTurnover = Math.max(0, digitalTurnover);
  cashTurnover = Math.max(0, cashTurnover);
  const totalTurnover = r2(digitalTurnover + cashTurnover);
  const cashPercent = totalTurnover > 0 ? r2((cashTurnover / totalTurnover) * 100) : 0;
  const digitalPercent = totalTurnover > 0 ? r2(100 - cashPercent) : 100;
  const qualifiesFor3CrLimit = cashPercent <= 5.0001;
  const applicable44ADLimit = qualifiesFor3CrLimit ? 30000000 : 20000000;
  const minPresumptive44AD = r2(digitalTurnover * 0.06 + cashTurnover * 0.08);

  return {
    totalTurnover,
    digitalTurnover,
    cashTurnover,
    digitalPercent,
    cashPercent,
    qualifiesFor3CrLimit,
    applicable44ADLimit,
    eligible44AD: totalTurnover <= applicable44ADLimit,
    minPresumptive44AD,
  };
}

export function reconcileGstr1VsItrAndAis({
  bills = [],
  itrGrossReceipts = null,
  aisSummary = null,
  booksTdsReceivable = 0,
  booksBankInterest = 0,
  fy = 'ALL',
  ownerGstin = '',
} = {}) {
  const scopedBills = filterRecordsByFyAndFirm(bills, {
    fy,
    ownerGstin,
    getDate: (b) => b?.invoiceDate || b?.data?.details?.invoiceDate || b?.data?.invoiceDate || b?.date,
    getGstin: (b) => b?.ownerGstin || b?.businessGstin || b?.data?.profile?.gstin,
  });

  let gstr1NetOutwardTurnover = 0;
  for (const b of scopedBills) {
    const norm = normalizeInvoiceBreakdown(b);
    if (norm.sign !== 0) {
      gstr1NetOutwardTurnover = r2(gstr1NetOutwardTurnover + norm.sign * norm.taxableValue);
    }
  }
  gstr1NetOutwardTurnover = Math.max(0, gstr1NetOutwardTurnover);

  const itrTurnover = itrGrossReceipts !== null && itrGrossReceipts !== undefined
    ? r2(Number(itrGrossReceipts) || 0)
    : gstr1NetOutwardTurnover;
  const gstr1VsItrDiff = r2(gstr1NetOutwardTurnover - itrTurnover);

  const aisTdsTotal = r2(
    aisSummary?.totalPrepaidTaxes ??
    ((aisSummary?.totalTdsCredit || aisSummary?.totalTds || 0) + (aisSummary?.totalTcsCredit || aisSummary?.totalTcs || 0))
  );
  const tdsDiff = aisSummary ? r2(aisTdsTotal - r2(booksTdsReceivable)) : 0;

  const sftInt = (aisSummary?.sftTransactions || [])
    .filter((r) => /interest|194a|saving|fd|deposit/i.test(`${r.code || ''} ${r.category || ''} ${r.source || ''}`))
    .reduce((s, r) => s + (Number(r.reportedAmount) || 0), 0);
  const tdsInt = (aisSummary?.tdsEntries || [])
    .filter((r) => /interest|194a|saving|fd|deposit/i.test(`${r.section || ''} ${r.deductorName || ''}`))
    .reduce((s, r) => s + (Number(r.grossAmount) || 0), 0);
  const aisInterest = r2(sftInt + tdsInt);
  const interestDiff = aisSummary ? r2(aisInterest - r2(booksBankInterest)) : 0;

  const aisGstTurnover = r2(
    (aisSummary?.sftTransactions || [])
      .filter((r) => /gst|gstr|turnover|outward|sales/i.test(`${r.code || ''} ${r.category || ''} ${r.source || ''}`))
      .reduce((s, r) => s + (Number(r.reportedAmount) || 0), 0)
  );
  const aisVsBooksTurnoverDiff = aisGstTurnover > 0 ? r2(aisGstTurnover - itrTurnover) : 0;

  return {
    gstr1NetOutwardTurnover,
    itrGrossReceipts: itrTurnover,
    gstr1VsItrDiff,
    isZeroTurnoverDiff: Math.abs(gstr1VsItrDiff) <= 0.05,
    aisTdsTotal,
    booksTdsReceivable: r2(booksTdsReceivable),
    tdsDiff,
    aisInterest,
    booksBankInterest: r2(booksBankInterest),
    interestDiff,
    aisGstTurnover,
    aisVsBooksTurnoverDiff,
  };
}

/**
 * Computes complete ITR-3 (Books + COGS) vs ITR-4 Sugam (Presumptive Sec 44AD / 44ADA) Working Summary.
 * Strictly enforces:
 * - Canonical invoice schema (`data.totals.taxableAmount`, `'credit-note'` subtraction, skips quotes/cancelled)
 * - Indian Financial Year (`fy`, e.g. '2026-27' or 'ALL') and active company (`ownerGstin`) isolation
 * - Opening & Closing Stock COGS adjustment (`COGS = openingStock + purchases - closingStock`)
 * - Sec 44AD (₹2Cr vs ₹3Cr) & Sec 44ADA (₹50L vs ₹75L) ≤5% cash-receipt rule
 */
export function computeBusinessITR({
  bills = [],
  purchases = [],
  expenses = [],
  clients = [],
  cashEntries = [],
  digitalReceiptPercent = 95,
  otherIncome = 0,
  openingStock = 0,
  closingStock = 0,
  isProfession44ADA = false,
  fy = 'ALL',
  ownerGstin = '',
  aisSummary = null,
  today = new Date(),
  includeStatutoryDisallowance = false,
} = {}) {
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

  const scopedExpenses = filterRecordsByFyAndFirm(expenses, {
    fy,
    ownerGstin,
    getDate: (e) => e?.date || e?.expenseDate,
    getGstin: (e) => e?.ownerGstin || e?.businessGstin,
  });

  let grossTurnover = 0;
  let creditNotesReduced = 0;

  for (const b of scopedBills) {
    const norm = normalizeInvoiceBreakdown(b);
    if (norm.sign === 1) {
      grossTurnover = r2(grossTurnover + norm.taxableValue);
    } else if (norm.sign === -1) {
      grossTurnover = r2(grossTurnover - norm.taxableValue);
      creditNotesReduced = r2(creditNotesReduced + norm.taxableValue);
    }
  }
  grossTurnover = Math.max(0, grossTurnover);

  let totalPurchases = 0;
  for (const p of scopedPurchases) {
    if (!p || p.cancelled || p.kind === 'po' || String(p.status || '').toLowerCase() === 'cancelled') continue;
    let itemsTaxable = null;
    if (Array.isArray(p.items) && p.items.length > 0 && p.taxableAmount == null && p.subtotal == null && p.totalAmount == null && p.grandTotal == null && p.amount == null) {
      itemsTaxable = 0;
      for (const it of p.items) {
        const gross = (Number(it?.quantity) || 0) * (Number(it?.rate) || 0);
        const disc = it?.discountType === 'fixed'
          ? (Number(it?.discount) || 0)
          : (gross * (Number(it?.discountPercent ?? it?.discount) || 0)) / 100;
        itemsTaxable += Math.max(0, gross - disc);
      }
      itemsTaxable = r2(itemsTaxable);
    }
    const splitTax = r2(
      (Number(p.cgst ?? p.totalCgst ?? 0) || 0) +
      (Number(p.sgst ?? p.totalSgst ?? 0) || 0) +
      (Number(p.igst ?? p.totalIgst ?? 0) || 0)
    );
    const fallbackTax = splitTax > 0 ? splitTax : r2(Number(p.gstAmount ?? p.taxAmount ?? 0));
    const totalAmt = r2(Number(p.totalAmount ?? p.grandTotal ?? p.amount ?? p.total ?? 0));
    const netPur = p.taxableAmount != null && Number.isFinite(Number(p.taxableAmount))
      ? r2(Number(p.taxableAmount))
      : p.subtotal != null && Number.isFinite(Number(p.subtotal))
        ? r2(Number(p.subtotal))
        : itemsTaxable !== null
          ? itemsTaxable
          : r2(Math.max(0, totalAmt - fallbackTax));
    totalPurchases = r2(totalPurchases + netPur);
  }

  let totalExpenses = 0;
  for (const e of scopedExpenses) {
    if (!e || e.cancelled) continue;
    if (NON_DEDUCTIBLE_CAT_REGEX.test(String(e.category || ''))) continue;
    const gstPart = r2(Number(e.gstAmount || 0));
    const rawAmt = r2(Number(e.amount || 0));
    totalExpenses = r2(totalExpenses + Math.max(0, rawAmt - gstPart));
  }

  const openStk = Math.max(0, r2(Number(openingStock) || 0));
  const closeStk = Math.max(0, r2(Number(closingStock) || 0));
  const cogs = r2(Math.max(0, openStk + totalPurchases - closeStk));
  const grossProfit = r2(grossTurnover - cogs);
  const netProfitPerBooks = r2(grossProfit - totalExpenses);
  const sec40A3Audit = auditSection40A3Disallowance({ expenses: scopedExpenses, purchases: scopedPurchases, cashEntries, fy, ownerGstin });
  const sec43BhAudit = checkSection43BCompliance({ purchases: scopedPurchases, clients, today });
  const sec40A3Disallowed = sec40A3Audit.totalDisallowedAmount;
  const sec43BhDisallowed = sec43BhAudit.overdueDisallowedAmount;
  const itr3AdjustedIncome = r2(Math.max(0, netProfitPerBooks + sec40A3Disallowed + sec43BhDisallowed));
  const actualBookProfit = includeStatutoryDisallowance
    ? itr3AdjustedIncome
    : r2(Math.max(0, netProfitPerBooks));

  const digPct = Math.min(100, Math.max(0, Number(digitalReceiptPercent) || 0));
  const cashPct = r2(100 - digPct);
  const qualifiesForEnhancedCashCap = cashPct <= 5.0001;

  let presumptiveProfit = 0;
  let itr4ApplicableLimit = 0;
  let itr4Eligible = true;
  let itr4IneligibilityReason = '';

  if (isProfession44ADA) {
    itr4ApplicableLimit = qualifiesForEnhancedCashCap ? 7500000 : 5000000;
    if (grossTurnover > itr4ApplicableLimit) {
      itr4Eligible = false;
      itr4IneligibilityReason = !qualifiesForEnhancedCashCap && grossTurnover <= 7500000
        ? `Gross receipts ₹${grossTurnover.toLocaleString('en-IN')} exceed ₹50 Lakh limit because cash receipts (${cashPct}%) exceed 5% statutory cap for ₹75 Lakh threshold.`
        : `Gross receipts ₹${grossTurnover.toLocaleString('en-IN')} exceed Sec 44ADA limit of ₹${(itr4ApplicableLimit / 100000).toFixed(0)} Lakh.`;
    }
    presumptiveProfit = r2(grossTurnover * 0.50);
  } else {
    itr4ApplicableLimit = qualifiesForEnhancedCashCap ? 30000000 : 20000000;
    if (grossTurnover > itr4ApplicableLimit) {
      itr4Eligible = false;
      itr4IneligibilityReason = !qualifiesForEnhancedCashCap && grossTurnover <= 30000000
        ? `Turnover ₹${grossTurnover.toLocaleString('en-IN')} exceeds ₹2 Crore limit because cash receipts (${cashPct}%) exceed 5% statutory cap required for ₹3 Crore Sec 44AD threshold.`
        : `Turnover ₹${grossTurnover.toLocaleString('en-IN')} exceeds Sec 44AD limit of ₹${(itr4ApplicableLimit / 10000000).toFixed(0)} Crore.`;
    }
    const digitalTurnover = r2((grossTurnover * digPct) / 100);
    const cashTurnover = r2(grossTurnover - digitalTurnover);
    presumptiveProfit = r2(digitalTurnover * 0.06 + cashTurnover * 0.08);
  }

  const extraInc = r2(Math.max(0, Number(otherIncome) || 0));
  const itr3TaxableIncome = r2(actualBookProfit + extraInc);
  const itr4TaxableIncome = r2(presumptiveProfit + extraInc);

  const itr3Detail = calculateNewRegimeTaxDetailed(itr3TaxableIncome);
  const itr4Detail = calculateNewRegimeTaxDetailed(itr4TaxableIncome);
  const itr3Tax = itr3Detail.totalTax;
  const itr4Tax = itr4Detail.totalTax;

  const prepaidTdsTcs = r2(aisSummary?.totalPrepaidTaxes || 0);
  const sftTurnoverReported = r2(
    (aisSummary?.sftTransactions || []).reduce((s, r) => s + Number(r.reportedAmount || 0), 0)
  );
  const aisMismatchWarning =
    sftTurnoverReported > grossTurnover + 1000
      ? `AIS SFT reports ₹${sftTurnoverReported.toLocaleString('en-IN')} vs Books ₹${grossTurnover.toLocaleString('en-IN')}`
      : null;

  const recommendedForm = !itr4Eligible
    ? 'ITR-3 (Normal Books)'
    : itr4Tax <= itr3Tax
      ? isProfession44ADA ? 'ITR-4 (Sec 44ADA)' : 'ITR-4 (Sec 44AD)'
      : 'ITR-3 (Normal Books — Audit u/s 44AB may apply if claiming < presumptive)';

  return {
    assessmentYear: '2027-28',
    financialYear: fy || 'ALL',
    grossTurnover,
    creditNotesReduced,
    totalPurchases,
    openingStock: openStk,
    closingStock: closeStk,
    cogs,
    grossProfit,
    indirectExpenses: totalExpenses,
    totalExpenses,
    netProfitPerBooks,
    sec40A3Disallowed,
    sec43BhDisallowed,
    itr3AdjustedIncome,
    sec40A3Audit,
    sec43BhAudit,
    digitalReceiptPercent: digPct,
    cashReceiptPercent: cashPct,
    qualifiesForEnhancedCashCap,
    itr3: {
      form: 'ITR-3',
      netProfit: actualBookProfit,
      totalTaxableIncome: itr3TaxableIncome,
      grossTaxLiability: itr3Tax,
      marginalRelief87A: itr3Detail.marginalRelief87A,
      surcharge: itr3Detail.surcharge,
      netPayableOrRefund: r2(itr3Tax - prepaidTdsTcs),
    },
    itr4: {
      form: 'ITR-4 (Sugam)',
      eligible: itr4Eligible,
      applicableLimit: itr4ApplicableLimit,
      ineligibilityReason: itr4IneligibilityReason,
      section: isProfession44ADA ? '44ADA' : '44AD',
      presumptiveProfit,
      totalTaxableIncome: itr4TaxableIncome,
      grossTaxLiability: itr4Tax,
      marginalRelief87A: itr4Detail.marginalRelief87A,
      surcharge: itr4Detail.surcharge,
      netPayableOrRefund: r2(itr4Tax - prepaidTdsTcs),
    },
    prepaidTdsTcs,
    recommendedForm,
    taxSavedByRecommendation: itr4Eligible ? r2(Math.abs(itr3Tax - itr4Tax)) : 0,
    aisMismatchWarning,
    disclaimer:
      'CA Working Paper Estimate (Resident Individual/HUF normal-rate slabs u/s 115BAC). Excludes special-rate capital gains, depreciation adjustments & entity-specific surcharges — verify with your Chartered Accountant before filing.',
  };
}

export function extractTdsDeductionsFromBooks({ purchases = [], expenses = [] } = {}) {
  const list = [];
  for (const p of Array.isArray(purchases) ? purchases : []) {
    const tds = r2(p?.tdsAmount ?? p?.tdsDeducted ?? 0);
    if (tds > 0) {
      const gstin = String(p?.supplierGstin || p?.vendorGstin || '').trim().toUpperCase();
      const derivedPan = gstin.length === 15 ? gstin.slice(2, 12) : '';
      list.push({
        partyName: p.supplierName || p.vendorName || 'Supplier',
        pan: String(p.supplierPan || derivedPan || 'PANNOTAVBL').toUpperCase(),
        section: String(p.tdsSection || '194Q').toUpperCase(),
        paymentDate: String(p.date || p.billDate || '').slice(0, 10),
        amountPaid: r2(p.taxableAmount ?? p.subtotal ?? p.totalAmount ?? 0),
        tdsAmount: tds,
        challanBsr: p.challanBsr || '',
        challanNo: p.challanNo || '',
      });
    }
  }
  for (const e of Array.isArray(expenses) ? expenses : []) {
    const tds = r2(e?.tdsAmount ?? e?.tdsDeducted ?? 0);
    if (tds > 0) {
      list.push({
        partyName: e.partyName || e.vendorName || e.category || 'Vendor',
        pan: String(e.pan || 'PANNOTAVBL').toUpperCase(),
        section: String(e.tdsSection || '194C').toUpperCase(),
        paymentDate: String(e.date || '').slice(0, 10),
        amountPaid: r2(e.amount || 0),
        tdsAmount: tds,
        challanBsr: e.challanBsr || '',
        challanNo: e.challanNo || '',
      });
    }
  }
  return list;
}

export function generateForm26QSummary(tdsDeductions = [], quarter = 'Q3') {
  const validQuarter = ['Q1', 'Q2', 'Q3', 'Q4'].includes(String(quarter).toUpperCase())
    ? String(quarter).toUpperCase()
    : 'Q3';

  const records = (Array.isArray(tdsDeductions) ? tdsDeductions : [])
    .filter((d) => d && r2(d.tdsAmount) > 0)
    .map((d, idx) => {
      const amtPaid = r2(d.amountPaid ?? d.grossAmount ?? 0);
      const tdsAmt = r2(d.tdsAmount ?? d.tds ?? 0);
      const section = String(d.section || '194C').toUpperCase();
      const pan = String(d.pan || 'PANNOTAVBL').trim().toUpperCase();
      return {
        lineNo: idx + 1,
        pan,
        partyName: String(d.partyName || d.deducteeName || 'Deductee').trim(),
        section,
        paymentDate: d.paymentDate || '',
        amountPaid: amtPaid,
        tdsAmount: tdsAmt,
        challanBsr: String(d.challanBsr || '').trim(),
        challanNo: String(d.challanNo || '').trim(),
      };
    });

  const totalPaid = r2(records.reduce((s, r) => s + r.amountPaid, 0));
  const totalTds = r2(records.reduce((s, r) => s + r.tdsAmount, 0));

  const csvHeader = 'LineNo,Quarter,Section,DeducteePAN,DeducteeName,PaymentDate,AmountPaid,TDSDeducted,ChallanBSR,ChallanSerialNo';
  const csvLines = records.map((r) =>
    [r.lineNo, validQuarter, r.section, r.pan, `"${r.partyName.replace(/"/g, '""')}"`, r.paymentDate, r.amountPaid.toFixed(2), r.tdsAmount.toFixed(2), r.challanBsr, r.challanNo].join(',')
  );

  const rpuWorkingLines = [
    `# BHARAT GST — FORM 26Q WORKING SCHEDULE (${validQuarter}) — VALIDATE IN PROTEAN/NSDL RPU FVU BEFORE PORTAL UPLOAD`,
    `FH^26Q^${validQuarter}^${records.length}^${totalPaid.toFixed(2)}^${totalTds.toFixed(2)}`,
    ...records.map(
      (r) => `DD^${r.lineNo}^${r.section}^${r.pan}^${r.partyName}^${r.paymentDate}^${r.amountPaid.toFixed(2)}^${r.tdsAmount.toFixed(2)}^${r.challanBsr || 'BSR_REQ'}^${r.challanNo || 'CHALLAN_REQ'}`
    ),
  ];

  return {
    quarter: validQuarter,
    deducteeCount: records.length,
    totalAmountPaid: totalPaid,
    totalTdsDeducted: totalTds,
    records,
    csvText: [csvHeader, ...csvLines].join('\n'),
    rpuText: rpuWorkingLines.join('\n'),
    fvuNotice:
      'Working schedule for CA / Protean (NSDL) RPU entry. Enter valid TAN, 7-digit BSR code & Challan Serial No in official NSDL RPU and validate through FVU to generate .fvu before TRACES/e-Filing upload.',
  };
}

export function buildPortalBridgePayload(bill = {}, transport = {}) {
  const norm = normalizeInvoiceBreakdown(bill);
  const d = bill.data || {};
  const details = d.details || {};
  return {
    bridgeVersion: '5.2.0',
    targetPortals: ['https://ewaybillgst.gov.in', 'https://return.gst.gov.in'],
    invoiceNumber: String(bill.invoiceNumber || details.invoiceNumber || d.invoiceNumber || ''),
    date: norm.invoiceDate || new Date().toISOString().slice(0, 10),
    customerGstin: norm.clientGstin,
    customerName: String(bill.clientName || d.client?.name || 'Walk-in'),
    placeOfSupply: String(d.placeOfSupply || d.client?.state || bill.placeOfSupply || ''),
    taxableValue: norm.taxableValue,
    cgst: norm.cgst,
    sgst: r2(norm.sgst + norm.utgst),
    igst: norm.igst,
    totalAmount: norm.grossTotal,
    hsnList: norm.items.map((it) => ({
      hsn: String(it.hsn || ''),
      description: String(it.name || it.description || ''),
      qty: Number(it.quantity ?? it.qty ?? 1),
      unit: String(it.unit || 'NOS'),
      taxableValue: r2(Number(it.taxableValue ?? (Number(it.quantity ?? it.qty ?? 1) * Number(it.rate ?? it.price ?? 0)))),
      gstRate: Number(it.taxPercent ?? it.gstRate ?? it.taxRate ?? 0),
    })),
    vehicleNo: String(transport.vehicleNo || details.vehicleNo || d.vehicleNo || '').toUpperCase().replace(/\s+/g, ''),
    transporterId: String(transport.transporterId || d.transporterId || '').toUpperCase(),
    distanceKm: Number(transport.distanceKm || d.distanceKm || 0),
  };
}
