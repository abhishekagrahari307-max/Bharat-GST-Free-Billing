// Module A (v5.0.0): Income Tax Portal AIS / TIS / 26AS Parser, ITR-3 vs ITR-4 (Sec 44AD / 44ADA)
// Computation Engine, TDS Form 26Q RPU Generator & Zero-GSP Portal Auto-Fill Payload Builder.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * 1. Income Tax Portal AIS / TIS / 26AS JSON Parser
 * Extracts TDS/TCS credits, SFT High-Value Transactions, and Interest/Dividend rows.
 */
export function parseAISJson(aisInput) {
  const aisJson = typeof aisInput === 'string' ? JSON.parse(aisInput) : (aisInput || {});
  const tdsEntries = [];
  const sftTransactions = [];
  let totalTdsCredit = 0;
  let totalTcsCredit = 0;

  const infoList = aisJson?.aisData?.partB || aisJson?.partB || [];
  infoList.forEach((section) => {
    const code = String(section?.infoCode || '');
    const rows = Array.isArray(section?.details) ? section.details : [];

    rows.forEach((row) => {
      const amount = Number(row?.amount || row?.txAmt || 0) || 0;
      const taxDeducted = Number(row?.tdsAmt || row?.taxAmt || 0) || 0;

      if (code.startsWith('TDS') || code.includes('194')) {
        totalTdsCredit += taxDeducted;
        tdsEntries.push({
          type: 'TDS',
          section: code,
          deductorName: row.deductorName || row.sourceName || 'Unknown Deductor',
          tan: row.tan || '',
          grossAmount: r2(amount),
          tdsDeposited: r2(taxDeducted),
        });
      } else if (code.startsWith('TCS') || code.includes('206C')) {
        totalTcsCredit += taxDeducted;
        tdsEntries.push({
          type: 'TCS',
          section: code,
          deductorName: row.collectorName || row.sourceName || 'Unknown Collector',
          tan: row.tan || '',
          grossAmount: r2(amount),
          tdsDeposited: r2(taxDeducted),
        });
      } else if (code.startsWith('SFT')) {
        sftTransactions.push({
          code,
          description: row.description || code,
          reportedAmount: r2(amount),
        });
      }
    });
  });

  return {
    tdsEntries,
    sftTransactions,
    totalTdsCredit: r2(totalTdsCredit),
    totalTcsCredit: r2(totalTcsCredit),
  };
}

/**
 * Calculates FY 2026-27 / AY 2027-28 New Tax Regime Income Tax (with Sec 87A Rebate up to ₹12L + 4% Cess).
 */
export function calculateNewRegimeTax(totalIncome) {
  const inc = Math.max(0, Number(totalIncome) || 0);
  if (inc <= 1200000) return 0; // Section 87A Rebate up to ₹12,00,000 in New Regime

  let tax = 0;
  const slabs = [
    { limit: 400000, rate: 0 },
    { limit: 800000, rate: 0.05 },
    { limit: 1200000, rate: 0.10 },
    { limit: 1600000, rate: 0.15 },
    { limit: 2000000, rate: 0.20 },
    { limit: 2400000, rate: 0.25 },
    { limit: Infinity, rate: 0.30 },
  ];

  let prevLimit = 0;
  for (const slab of slabs) {
    if (inc > prevLimit) {
      const taxableInSlab = Math.min(inc, slab.limit) - prevLimit;
      tax += taxableInSlab * slab.rate;
      prevLimit = slab.limit;
    }
  }
  const cess = tax * 0.04;
  return r2(tax + cess);
}

function extractBillTaxable(bill) {
  if (!bill || bill.status === 'cancelled') return 0;
  const d = bill.data || bill;
  if (Number(d.subtotal) > 0) return Number(d.subtotal);
  if (Number(bill.taxableAmount) > 0) return Number(bill.taxableAmount);
  return Number(bill.totalAmount || d.grandTotal || 0) || 0;
}

/**
 * 2. ITR-3 (Normal Books) vs ITR-4 Sugam (Section 44AD / 44ADA Presumptive) Tax Computation Engine
 */
export function computeBusinessITR({
  bills = [],
  purchases = [],
  expenses = [],
  assessmentYear = '2027-28',
  digitalReceiptPercent = 95,
  otherIncome = 0,
  isProfession44ADA = false,
  aisSummary = { totalTdsCredit: 0, totalTcsCredit: 0 },
} = {}) {
  const pct = Math.min(100, Math.max(0, Number(digitalReceiptPercent) || 0));
  const extraInc = Math.max(0, Number(otherIncome) || 0);

  const grossTurnover = (Array.isArray(bills) ? bills : []).reduce((sum, inv) => {
    const docType = String(inv?.data?.invoiceType || inv?.invoiceType || 'Tax Invoice');
    if (/proforma|quotation|challan|estimate|purchase order/i.test(docType)) return sum;
    if (/credit note/i.test(docType)) return sum - extractBillTaxable(inv);
    return sum + extractBillTaxable(inv);
  }, 0);

  const totalPurchases = (Array.isArray(purchases) ? purchases : []).reduce(
    (sum, p) => sum + (Number(p?.taxableAmount ?? p?.subtotal ?? p?.totalAmount ?? 0) || 0),
    0
  );
  const totalExpenses = (Array.isArray(expenses) ? expenses : []).reduce(
    (sum, e) => sum + (Number(e?.amount || 0) || 0),
    0
  );

  // A. ITR-3: Actual Net Profit from Books
  const actualNetProfit = Math.max(0, grossTurnover - totalPurchases - totalExpenses);

  // B. ITR-4: Sec 44AD (6% digital / 8% cash up to ₹3 Cr) OR Sec 44ADA (50% up to ₹75L)
  const digitalTurnover = (Math.max(0, grossTurnover) * pct) / 100;
  const cashTurnover = Math.max(0, grossTurnover) - digitalTurnover;
  const presumptiveProfit = isProfession44ADA
    ? Math.max(0, grossTurnover) * 0.50
    : digitalTurnover * 0.06 + cashTurnover * 0.08;

  const limit44 = isProfession44ADA ? 7500000 : 30000000;
  const eligible44 = Math.max(0, grossTurnover) <= limit44;

  const taxITR3 = calculateNewRegimeTax(actualNetProfit + extraInc);
  const taxITR4 = calculateNewRegimeTax(presumptiveProfit + extraInc);
  const prepaidTaxes = r2((Number(aisSummary?.totalTdsCredit) || 0) + (Number(aisSummary?.totalTcsCredit) || 0));

  return {
    assessmentYear,
    grossTurnover: r2(Math.max(0, grossTurnover)),
    totalPurchases: r2(totalPurchases),
    totalExpenses: r2(totalExpenses),
    itr3: {
      form: 'ITR-3 (Normal Books)',
      netProfit: r2(actualNetProfit),
      totalTaxableIncome: r2(actualNetProfit + extraInc),
      grossTaxLiability: taxITR3,
      netPayableOrRefund: r2(taxITR3 - prepaidTaxes),
    },
    itr4: {
      form: isProfession44ADA ? 'ITR-4 Sugam (Sec 44ADA)' : 'ITR-4 Sugam (Sec 44AD)',
      eligible: eligible44,
      presumptiveProfit: r2(presumptiveProfit),
      totalTaxableIncome: r2(presumptiveProfit + extraInc),
      grossTaxLiability: taxITR4,
      netPayableOrRefund: r2(taxITR4 - prepaidTaxes),
    },
    recommendedForm:
      eligible44 && taxITR4 <= taxITR3
        ? (isProfession44ADA ? 'ITR-4 (Sec 44ADA)' : 'ITR-4 (Sec 44AD)')
        : 'ITR-3 (Normal Books)',
    taxSavedByRecommendation: eligible44 ? r2(Math.abs(taxITR3 - taxITR4)) : 0,
    prepaidTdsTcs: prepaidTaxes,
  };
}

/**
 * 3. TDS Form 26Q / 194Q Quarterly Return Summary & RPU Pipe-Delimited Export
 */
export function generateForm26QSummary(tdsDeductions = [], quarter = 'Q3') {
  const list = Array.isArray(tdsDeductions) ? tdsDeductions : [];
  const totalPaid = list.reduce((s, d) => s + (Number(d?.amountPaid || 0) || 0), 0);
  const totalTds = list.reduce((s, d) => s + (Number(d?.tdsAmount || 0) || 0), 0);

  const records = list.map((d, idx) => ({
    srNo: idx + 1,
    pan: String(d?.pan || 'PANNOTAVBL').trim().toUpperCase(),
    name: String(d?.partyName || 'Deductee').trim(),
    section: String(d?.section || '194C').trim().toUpperCase(),
    date: d?.paymentDate || new Date().toISOString().slice(0, 10),
    amount: Number(d?.amountPaid || 0).toFixed(2),
    tds: Number(d?.tdsAmount || 0).toFixed(2),
    challanRef: `${d?.challanBsr || '0000000'}-${d?.challanSerial || '00000'}`,
  }));

  const rpuLines = [
    `FH^26Q^${quarter}^${records.length}^${totalPaid.toFixed(2)}^${totalTds.toFixed(2)}`,
    ...records.map((r) => `DD^${r.srNo}^${r.pan}^${r.name}^${r.section}^${r.date}^${r.amount}^${r.tds}^${r.challanRef}`),
  ];

  return {
    form: '26Q',
    quarter,
    deducteeCount: records.length,
    totalAmountPaid: r2(totalPaid),
    totalTdsDeducted: r2(totalTds),
    records,
    rpuText: rpuLines.join('\n'),
  };
}

/**
 * 4. Builds & dispatches Zero-GSP Portal Auto-Fill payload for Companion Browser Extension
 */
export function buildPortalBridgePayload(bill = {}, extra = {}) {
  const d = bill?.data || bill || {};
  return {
    invoiceNumber: String(bill?.invoiceNumber || d?.invoiceNumber || ''),
    date: String(bill?.invoiceDate || d?.invoiceDate || new Date().toISOString().slice(0, 10)),
    customerName: String(bill?.clientName || d?.client?.name || ''),
    customerGstin: String(bill?.clientGstin || d?.client?.gstin || '').toUpperCase(),
    taxableValue: r2(Number(d?.subtotal || bill?.totalAmount || 0)),
    totalAmount: r2(Number(bill?.totalAmount || d?.grandTotal || 0)),
    vehicleNo: String(extra?.vehicleNo || d?.vehicleNo || '').toUpperCase(),
    distanceKm: Number(extra?.distanceKm || d?.distanceKm || 50) || 50,
    pushedAt: new Date().toISOString(),
  };
}
