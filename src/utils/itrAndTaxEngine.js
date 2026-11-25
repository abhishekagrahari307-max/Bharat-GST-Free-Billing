// Module A (v5.1.0 Audit-Hardened): Income Tax Portal AIS / TIS / 26AS Parser,
// Statutory ITR-3 vs ITR-4 (Sec 44AD ₹2Cr/₹3Cr 5%-Cash Rule & Sec 44ADA ₹50L/₹75L + Sec 87A Marginal Relief),
// Live-Books TDS Form 26Q Working Schedule & Zero-GSP Portal Auto-Fill Payload Builder.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * 1. Income Tax Portal AIS / TIS / 26AS JSON Parser (Strict Schema Validated)
 * Throws a clear error if an unsupported/non-AIS JSON file is uploaded instead of silently returning ₹0.
 */
export function parseAISJson(aisInput) {
  let aisJson;
  try {
    aisJson = typeof aisInput === 'string' ? JSON.parse(aisInput) : aisInput;
  } catch {
    throw new Error('Invalid JSON file: could not parse uploaded AIS/TIS file.');
  }

  if (!aisJson || typeof aisJson !== 'object' || Array.isArray(aisJson)) {
    throw new Error('Unsupported AIS/TIS JSON schema: expected an AIS JSON object from the Income Tax Portal.');
  }

  const infoList =
    (Array.isArray(aisJson?.aisData?.partB) && aisJson.aisData.partB) ||
    (Array.isArray(aisJson?.partB) && aisJson.partB) ||
    (Array.isArray(aisJson?.tdsDetails) && aisJson.tdsDetails) ||
    null;

  if (!infoList) {
    throw new Error(
      'Unsupported AIS/TIS JSON format: missing aisData.partB / partB schedule. Download the AIS Utility JSON from incometax.gov.in.'
    );
  }

  const tdsEntries = [];
  const sftTransactions = [];
  let totalTdsCredit = 0;
  let totalTcsCredit = 0;

  infoList.forEach((section) => {
    const code = String(section?.infoCode || section?.sectionCode || '');
    const rows = Array.isArray(section?.details) ? section.details : [];

    rows.forEach((row) => {
      const amount = Number(row?.amount ?? row?.txAmt ?? 0) || 0;
      const taxDeducted = Number(row?.tdsAmt ?? row?.taxAmt ?? 0) || 0;

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

function computeRawNewRegimeSlabTax(inc) {
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
  return r2(tax);
}

/**
 * Calculates New Tax Regime Income Tax with:
 * - Section 87A full rebate up to ₹12,00,000
 * - Statutory Section 87A Proviso Marginal Relief above ₹12,00,000 (up to ₹12,70,588) so ₹12,00,001 pays ₹1.04 (not ₹62,400!)
 * - New Regime Surcharge (>₹50L: 10%, >₹1Cr: 15%, >₹2Cr: 25% max) with Surcharge Marginal Relief
 * - 4% Health & Education Cess
 */
export function calculateNewRegimeTaxDetailed(totalIncome) {
  const inc = Math.max(0, Number(totalIncome) || 0);
  if (inc <= 1200000) {
    return {
      slabTax: computeRawNewRegimeSlabTax(inc),
      rebate87A: computeRawNewRegimeSlabTax(inc),
      marginalRelief87A: 0,
      surcharge: 0,
      cess: 0,
      totalTax: 0,
    };
  }

  const slabTax = computeRawNewRegimeSlabTax(inc);
  const excessOver12L = r2(inc - 1200000);
  // Section 87A Marginal Relief: tax before cess cannot exceed income above ₹12,00,000
  const taxAfter87AMarginal = Math.min(slabTax, excessOver12L);
  const marginalRelief87A = r2(Math.max(0, slabTax - taxAfter87AMarginal));

  // New Regime Surcharge with threshold marginal relief
  let surcharge = 0;
  const surchargeTiers = [
    { threshold: 20000000, rate: 0.25, prevRate: 0.15 },
    { threshold: 10000000, rate: 0.15, prevRate: 0.10 },
    { threshold: 5000000, rate: 0.10, prevRate: 0 },
  ];
  for (const tier of surchargeTiers) {
    if (inc > tier.threshold) {
      const rawWithSurcharge = taxAfter87AMarginal * (1 + tier.rate);
      const taxAtThreshold = computeRawNewRegimeSlabTax(tier.threshold) * (1 + tier.prevRate);
      const maxPayableWithSurcharge = taxAtThreshold + (inc - tier.threshold);
      const cappedWithSurcharge = Math.min(rawWithSurcharge, maxPayableWithSurcharge);
      surcharge = r2(Math.max(0, cappedWithSurcharge - taxAfter87AMarginal));
      break;
    }
  }

  const taxPlusSurcharge = r2(taxAfter87AMarginal + surcharge);
  const cess = r2(taxPlusSurcharge * 0.04);
  return {
    slabTax,
    rebate87A: 0,
    marginalRelief87A,
    surcharge,
    cess,
    totalTax: r2(taxPlusSurcharge + cess),
  };
}

export function calculateNewRegimeTax(totalIncome) {
  return calculateNewRegimeTaxDetailed(totalIncome).totalTax;
}

function extractBillTaxable(bill) {
  if (!bill || bill.status === 'cancelled') return 0;
  const d = bill.data || bill;
  if (Number(d.subtotal) > 0) return Number(d.subtotal);
  if (Number(bill.taxableAmount) > 0) return Number(bill.taxableAmount);
  return Number(bill.totalAmount || d.grandTotal || 0) || 0;
}

/**
 * 2. ITR-3 (Normal Books) vs ITR-4 Sugam (Sec 44AD / 44ADA) Computation Engine
 * Enforces statutory 5% cash-receipt cap for enhanced limits:
 * - Sec 44AD: ₹2 Cr standard limit; ₹3 Cr ONLY IF cash receipts <= 5% (digitalReceiptPercent >= 95).
 * - Sec 44ADA: ₹50L standard limit; ₹75L ONLY IF cash receipts <= 5% (digitalReceiptPercent >= 95).
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
  const pct = Math.min(100, Math.max(0, Number(digitalReceiptPercent ?? 95)));
  const cashPct = r2(100 - pct);
  const cashWithin5PctCondition = cashPct <= 5;
  const extraInc = Math.max(0, Number(otherIncome) || 0);

  const rawTurnover = (Array.isArray(bills) ? bills : []).reduce((sum, inv) => {
    const docType = String(inv?.data?.invoiceType || inv?.invoiceType || 'Tax Invoice');
    if (/proforma|quotation|challan|estimate|purchase order/i.test(docType)) return sum;
    if (/credit note/i.test(docType)) return sum - extractBillTaxable(inv);
    return sum + extractBillTaxable(inv);
  }, 0);
  const grossTurnover = r2(Math.max(0, rawTurnover));

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

  // B. ITR-4: Statutory Turnover Limit Check (5% Cash Receipt Rule u/s 44AD / 44ADA)
  const applicableLimit44 = isProfession44ADA
    ? (cashWithin5PctCondition ? 7500000 : 5000000)
    : (cashWithin5PctCondition ? 30000000 : 20000000);

  const eligible44 = grossTurnover <= applicableLimit44;
  let ineligibilityReason = '';
  if (!eligible44) {
    if (!cashWithin5PctCondition && grossTurnover <= (isProfession44ADA ? 7500000 : 30000000)) {
      ineligibilityReason = isProfession44ADA
        ? `Cash receipts (${cashPct}%) exceed 5%, so Sec 44ADA cap is ₹50 Lakh (not ₹75 Lakh).`
        : `Cash receipts (${cashPct}%) exceed 5%, so Sec 44AD cap is ₹2 Crore (not ₹3 Crore).`;
    } else {
      ineligibilityReason = `Turnover exceeds maximum statutory limit of ₹${(applicableLimit44 / 100000).toLocaleString('en-IN')} Lakh.`;
    }
  }

  const digitalTurnover = (grossTurnover * pct) / 100;
  const cashTurnover = grossTurnover - digitalTurnover;
  const presumptiveProfit = isProfession44ADA
    ? grossTurnover * 0.50
    : digitalTurnover * 0.06 + cashTurnover * 0.08;

  const itr3TaxBreakup = calculateNewRegimeTaxDetailed(actualNetProfit + extraInc);
  const itr4TaxBreakup = calculateNewRegimeTaxDetailed(presumptiveProfit + extraInc);
  const prepaidTaxes = r2((Number(aisSummary?.totalTdsCredit) || 0) + (Number(aisSummary?.totalTcsCredit) || 0));

  return {
    assessmentYear,
    grossTurnover,
    digitalReceiptPercent: pct,
    cashReceiptPercent: cashPct,
    cashWithin5PctCondition,
    totalPurchases: r2(totalPurchases),
    totalExpenses: r2(totalExpenses),
    itr3: {
      form: 'ITR-3 (Normal Books)',
      netProfit: r2(actualNetProfit),
      totalTaxableIncome: r2(actualNetProfit + extraInc),
      marginalRelief87A: itr3TaxBreakup.marginalRelief87A,
      surcharge: itr3TaxBreakup.surcharge,
      cess: itr3TaxBreakup.cess,
      grossTaxLiability: itr3TaxBreakup.totalTax,
      netPayableOrRefund: r2(itr3TaxBreakup.totalTax - prepaidTaxes),
    },
    itr4: {
      form: isProfession44ADA ? 'ITR-4 Sugam (Sec 44ADA)' : 'ITR-4 Sugam (Sec 44AD)',
      eligible: eligible44,
      applicableLimit: applicableLimit44,
      ineligibilityReason,
      presumptiveProfit: r2(presumptiveProfit),
      totalTaxableIncome: r2(presumptiveProfit + extraInc),
      marginalRelief87A: itr4TaxBreakup.marginalRelief87A,
      surcharge: itr4TaxBreakup.surcharge,
      cess: itr4TaxBreakup.cess,
      grossTaxLiability: itr4TaxBreakup.totalTax,
      netPayableOrRefund: r2(itr4TaxBreakup.totalTax - prepaidTaxes),
    },
    recommendedForm:
      eligible44 && itr4TaxBreakup.totalTax <= itr3TaxBreakup.totalTax
        ? (isProfession44ADA ? 'ITR-4 (Sec 44ADA)' : 'ITR-4 (Sec 44AD)')
        : 'ITR-3 (Normal Books)',
    taxSavedByRecommendation: eligible44 ? r2(Math.abs(itr3TaxBreakup.totalTax - itr4TaxBreakup.totalTax)) : 0,
    prepaidTdsTcs: prepaidTaxes,
    disclaimer: 'Working estimate for CA review under New Regime (Individuals/HUF). Verify surcharge, 5-year 44AD(4) lock-in & Chapter VI-A deductions before filing.',
  };
}

/**
 * Extracts real TDS deductions recorded on saved Purchases & Expenses (zero fake sample rows).
 */
export function extractTdsDeductionsFromBooks({ purchases = [], expenses = [] } = {}) {
  const rows = [];
  for (const p of (Array.isArray(purchases) ? purchases : [])) {
    const tds = Number(p?.tdsAmount || 0);
    if (tds > 0) {
      rows.push({
        partyName: p.supplierName || p.vendorName || 'Supplier',
        pan: p.supplierPan || (p.supplierGstin?.length >= 12 ? p.supplierGstin.slice(2, 12) : 'PANNOTAVBL'),
        section: p.tdsSection || '194Q',
        paymentDate: p.date || p.invoiceDate || new Date().toISOString().slice(0, 10),
        amountPaid: Number(p.taxableAmount ?? p.subtotal ?? p.totalAmount ?? 0),
        tdsAmount: tds,
        challanBsr: p.challanBsr || '',
        challanSerial: p.challanSerial || '',
      });
    }
  }
  for (const e of (Array.isArray(expenses) ? expenses : [])) {
    const tds = Number(e?.tdsAmount || 0);
    if (tds > 0) {
      rows.push({
        partyName: e.vendorName || e.payee || e.category || 'Vendor',
        pan: e.pan || 'PANNOTAVBL',
        section: e.tdsSection || '194C',
        paymentDate: e.date || new Date().toISOString().slice(0, 10),
        amountPaid: Number(e.amount || 0),
        tdsAmount: tds,
        challanBsr: e.challanBsr || '',
        challanSerial: e.challanSerial || '',
      });
    }
  }
  return rows;
}

/**
 * 3. TDS Form 26Q Quarterly Working Schedule Generator (Q1/Q2/Q3/Q4)
 * Produces structured working CSV & RPU-prep text for CA / Protean NSDL RPU validation.
 */
export function generateForm26QSummary(tdsDeductions = [], quarter = 'Q3') {
  const validQuarter = ['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter) ? quarter : 'Q3';
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
    challanRef: `${d?.challanBsr || 'PENDING'}-${d?.challanSerial || '00000'}`,
  }));

  const csvLines = [
    'SrNo,DeducteePAN,DeducteeName,Section,PaymentDate,AmountPaid,TDSDeducted,ChallanRef',
    ...records.map((r) => `${r.srNo},"${r.pan}","${r.name.replace(/"/g, '""')}",${r.section},${r.date},${r.amount},${r.tds},"${r.challanRef}"`),
  ];

  const rpuLines = [
    `# Bharat GST Form 26Q Working Prep (${validQuarter}) — Validate in Protean/NSDL RPU & FVU Utility before filing`,
    `FH^26Q^${validQuarter}^${records.length}^${totalPaid.toFixed(2)}^${totalTds.toFixed(2)}`,
    ...records.map((r) => `DD^${r.srNo}^${r.pan}^${r.name}^${r.section}^${r.date}^${r.amount}^${r.tds}^${r.challanRef}`),
  ];

  return {
    form: '26Q',
    quarter: validQuarter,
    deducteeCount: records.length,
    totalAmountPaid: r2(totalPaid),
    totalTdsDeducted: r2(totalTds),
    records,
    csvText: csvLines.join('\n'),
    rpuText: rpuLines.join('\n'),
  };
}

/**
 * 4. Builds Zero-GSP Portal Auto-Fill payload for Companion Browser Extension
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
