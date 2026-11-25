// Multi-Financial Year Rollover & Year-End Closing Engine (v5.3.0)
// Automates 31-March Closing & 1-April Opening Balance Transfer:
// 1. Scoped FY Closing Inventory Valuation (physical goods -> 1-April Opening Stock for COGS)
// 2. Party-wise Sundry Debtors (Receivables) & Sundry Creditors (Payables) Closing Schedule
//    with Section 43B(h) MSME year-end unpaid disallowance warnings
// 3. Balanced Double-Entry 1-April Opening Balance Journal Voucher (Dr === Cr verified, idempotent)
// 4. CGST Rule 46(b) New-FY Invoice Series & Period-Lock readiness
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import {
  getIndianFinancialYear,
  filterRecordsByFyAndFirm,
  normalizeInvoiceBreakdown,
  normalizeCanonicalProduct,
} from './canonicalAdapter.js';
import {
  deriveAutoJournalEntries,
  computeTrialBalance,
  computeBalanceSheet,
  validateManualVoucher,
  r2,
} from './doubleEntry.js';

function normalizeFyLabel(fyInput) {
  const m = /^(\d{4})-(\d{2,4})$/.exec(String(fyInput || '').trim());
  if (!m) return getIndianFinancialYear();
  const sy = Number(m[1]);
  return `${sy}-${String((sy + 1) % 100).padStart(2, '0')}`;
}

/**
 * Computes exact start/end ISO dates for a closing Indian FY (e.g. '2026-27')
 * and its successor FY ('2027-28').
 */
export function computeFyDateWindow(fyInput = '2026-27') {
  const closingFy = normalizeFyLabel(fyInput);
  const startYear = Number(closingFy.slice(0, 4));
  const endYear = startYear + 1;
  const nextEndShort = String((endYear + 1) % 100).padStart(2, '0');
  const nextFy = `${endYear}-${nextEndShort}`;

  return {
    closingFy,
    startDate: `${startYear}-04-01`,
    endDate: `${endYear}-03-31`,
    nextFy,
    nextFyStartDate: `${endYear}-04-01`,
    nextFyEndDate: `${endYear + 1}-03-31`,
    recommendedInvoicePrefix: `INV/${endYear}-${nextEndShort}/`,
    openingVoucherIdPrefix: `FY-OPEN-${nextFy}`,
  };
}

export function buildOpeningVoucherId(nextFy, ownerGstin = '') {
  const cleanGstin = String(ownerGstin || 'DEFAULT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DEFAULT';
  return `FY-OPEN-${nextFy}-${cleanGstin}`;
}

/**
 * Computes the complete 31-March Year-End Closing & 1-April Rollover Plan.
 */
export function computeYearEndRolloverPlan({
  closingFy = '2026-27',
  profile = null,
  bills = [],
  purchases = [],
  expenses = [],
  debitNotes = [],
  cashEntries = [],
  manualVouchers = [],
  products = [],
  clients = [],
} = {}) {
  const win = computeFyDateWindow(closingFy);
  const ownerGstin = String(profile?.gstin || '').trim().toUpperCase();

  // 1. Scope transactional records to closingFy + active business GSTIN
  const scopedBills = filterRecordsByFyAndFirm(bills, {
    fy: win.closingFy,
    ownerGstin,
    getDate: (b) => b?.invoiceDate || b?.data?.details?.invoiceDate || b?.data?.invoiceDate || b?.date,
    getGstin: (b) => b?.ownerGstin || b?.businessGstin || b?.data?.profile?.gstin,
  });

  const scopedPurchases = filterRecordsByFyAndFirm(purchases, {
    fy: win.closingFy,
    ownerGstin,
    getDate: (p) => p?.billDate || p?.date || p?.invoiceDate,
    getGstin: (p) => p?.ownerGstin || p?.businessGstin,
  });

  const scopedExpenses = filterRecordsByFyAndFirm(expenses, {
    fy: win.closingFy,
    ownerGstin,
    getDate: (e) => e?.date,
    getGstin: (e) => e?.ownerGstin || e?.businessGstin,
  });

  const scopedDebitNotes = filterRecordsByFyAndFirm(debitNotes, {
    fy: win.closingFy,
    ownerGstin,
    getDate: (d) => d?.date,
    getGstin: (d) => d?.ownerGstin || d?.businessGstin,
  });

  const scopedCash = filterRecordsByFyAndFirm(cashEntries, {
    fy: win.closingFy,
    ownerGstin,
    getDate: (c) => c?.date,
    getGstin: (c) => c?.ownerGstin || c?.businessGstin,
  });

  const scopedManualVouchers = (Array.isArray(manualVouchers) ? manualVouchers : []).filter((v) => {
    const dt = String(v?.date || '').slice(0, 10);
    return dt >= win.startDate && dt <= win.endDate;
  });

  // 2. Closing Inventory Valuation (physical goods with positive stock)
  const closingStockItems = [];
  let closingStockCostValue = 0;
  let closingStockSellingValue = 0;
  let totalPhysicalUnits = 0;

  for (const rawProd of Array.isArray(products) ? products : []) {
    if (!rawProd || rawProd.isService || rawProd.type === 'service' || rawProd.trackStock === false) {
      continue;
    }
    const norm = normalizeCanonicalProduct(rawProd);
    const qty = r2(Math.max(0, Number(norm.stock ?? rawProd.stockQty ?? 0)));
    if (qty <= 0) continue;
    // Value closing stock at lower of Cost or NRV (Accounting Standard AS-2 / ICDS-II)
    const unitPurchaseCost = Number(norm.purchasePrice || rawProd.purchaseRate || 0);
    const unitSelling = Number(norm.sellingPrice || norm.saleRate || 0);
    const effectiveUnitCost =
      unitPurchaseCost > 0
        ? unitSelling > 0
          ? Math.min(unitPurchaseCost, unitSelling)
          : unitPurchaseCost
        : unitSelling;
    const lineCostVal = r2(qty * effectiveUnitCost);
    const lineSellVal = r2(qty * unitSelling);

    closingStockCostValue = r2(closingStockCostValue + lineCostVal);
    closingStockSellingValue = r2(closingStockSellingValue + lineSellVal);
    totalPhysicalUnits = r2(totalPhysicalUnits + qty);

    closingStockItems.push({
      productId: rawProd.id || norm.name,
      name: norm.name,
      hsn: norm.hsn || '',
      unit: norm.unit || 'PCS',
      closingQty: qty,
      unitCostBasis: r2(effectiveUnitCost),
      closingCostValue: lineCostVal,
      closingRetailValue: lineSellVal,
    });
  }

  // 3. Party-Wise Sundry Debtors (Receivables) & Sundry Creditors (Payables) Closing Balances
  const clientByGstin = new Map();
  const clientByName = new Map();
  for (const c of Array.isArray(clients) ? clients : []) {
    if (!c) continue;
    const g = String(c.gstin || '').trim().toUpperCase();
    const nm = String(c.name || '').trim().toLowerCase();
    if (g) clientByGstin.set(g, c);
    if (nm) clientByName.set(nm, c);
  }

  const partyLedgerMap = new Map();
  const ensureParty = (name, gstin = '') => {
    const cleanG = String(gstin || '').trim().toUpperCase();
    const cleanN = String(name || 'Walk-in / Sundry Party').trim();
    const key = cleanG || cleanN.toLowerCase();
    if (!partyLedgerMap.has(key)) {
      const matchedClient =
        (cleanG && clientByGstin.get(cleanG)) ||
        clientByName.get(cleanN.toLowerCase()) ||
        null;
      partyLedgerMap.set(key, {
        key,
        clientId: matchedClient?.id || null,
        partyName: matchedClient?.name || cleanN,
        gstin: cleanG || matchedClient?.gstin || '',
        isMsme: Boolean(matchedClient?.isMsme || matchedClient?.udyamNo),
        udyamNo: matchedClient?.udyamNo || '',
        receivableClosing: 0,
        payableClosing: 0,
        openInvoiceCount: 0,
        openPurchaseCount: 0,
      });
    }
    return partyLedgerMap.get(key);
  };

  for (const bill of scopedBills) {
    const bd = normalizeInvoiceBreakdown(bill);
    if (bd.isCancelled || bd.sign === 0) continue;
    const party = ensureParty(
      bill?.clientName || bill?.data?.client?.name || 'Customer',
      bill?.clientGstin || bill?.data?.client?.gstin || ''
    );
    if (bd.isCreditNote) {
      // Credit note reduces party receivable
      const unadjusted = r2(Math.max(0, bd.grossTotal - Number(bill?.amountPaid || 0)));
      party.receivableClosing = r2(party.receivableClosing - unadjusted);
    } else {
      const paid = r2(Math.max(0, Number(bill?.amountPaid ?? (bill?.status === 'paid' ? bd.grossTotal : 0))));
      const due = r2(Math.max(0, bd.grossTotal - paid));
      if (due > 0.01) {
        party.receivableClosing = r2(party.receivableClosing + due);
        party.openInvoiceCount += 1;
      }
    }
  }

  let msmeYearEndUnpaidRisk = 0;
  let msmeYearEndSupplierCount = 0;

  for (const pur of scopedPurchases) {
    if (!pur || pur.status === 'cancelled' || pur.cancelled) continue;
    const total = r2(Math.max(0, Number(pur.totalAmount ?? pur.grandTotal ?? pur.amount ?? 0)));
    const paid = r2(Math.max(0, Number(pur.amountPaid ?? (pur.status === 'paid' ? total : 0))));
    const due = r2(Math.max(0, total - paid));
    if (due <= 0.01) continue;

    const party = ensureParty(
      pur.supplierName || pur.vendorName || 'Supplier',
      pur.supplierGstin || pur.vendorGstin || pur.gstin || ''
    );
    if (pur.isMsme || pur.udyamNo) {
      party.isMsme = true;
      party.udyamNo = party.udyamNo || pur.udyamNo || '';
    }
    party.payableClosing = r2(party.payableClosing + due);
    party.openPurchaseCount += 1;
  }

  for (const dn of scopedDebitNotes) {
    if (!dn || dn.status === 'cancelled') continue;
    const total = r2(Math.max(0, Number(dn.totalAmount ?? dn.amount ?? 0)));
    if (total <= 0) continue;
    const party = ensureParty(dn.supplierName || 'Supplier', dn.supplierGstin || '');
    party.payableClosing = r2(Math.max(0, party.payableClosing - total));
  }

  const partyBalances = [];
  let totalReceivables = 0;
  let totalPayables = 0;

  for (const p of partyLedgerMap.values()) {
    const netRec = r2(Math.max(0, p.receivableClosing - p.payableClosing));
    const netPay = r2(Math.max(0, p.payableClosing - p.receivableClosing));
    if (netRec <= 0.01 && netPay <= 0.01) continue;
    totalReceivables = r2(totalReceivables + netRec);
    totalPayables = r2(totalPayables + netPay);
    if (netPay > 0 && p.isMsme) {
      msmeYearEndUnpaidRisk = r2(msmeYearEndUnpaidRisk + netPay);
      msmeYearEndSupplierCount += 1;
    }
    partyBalances.push({
      ...p,
      receivableClosing: netRec,
      payableClosing: netPay,
      netType: netRec > 0 ? 'DR_RECEIVABLE' : 'CR_PAYABLE',
      netAmount: netRec > 0 ? netRec : netPay,
    });
  }
  partyBalances.sort((a, b) => b.netAmount - a.netAmount);

  // 4. Double-Entry Trial Balance & 1-April Opening Balance Journal Voucher
  const autoVouchers = deriveAutoJournalEntries({
    bills: scopedBills,
    purchases: scopedPurchases,
    expenses: scopedExpenses,
    debitNotes: scopedDebitNotes,
    cashEntries: scopedCash,
  });
  const allClosingVouchers = [...autoVouchers, ...scopedManualVouchers];
  const trialBalance = computeTrialBalance(allClosingVouchers);
  const balanceSheet = computeBalanceSheet(trialBalance, { closingStockValue: closingStockCostValue });

  // Build carry-forward Balance Sheet lines (Asset & Liability accounts; Income/Expense fold into OWNER_CAPITAL)
  const openingLines = [];
  let sumDr = 0;
  let sumCr = 0;

  for (const row of trialBalance.rows || []) {
    const accCode = row.code || row.account;
    if (!accCode || row.nature === 'income' || row.nature === 'expense') {
      continue; // Revenue & Expenses close into P&L -> Owner's Capital on 31 March!
    }
    const netDr = r2(Math.max(0, Number(row.closingDebit || 0) - Number(row.closingCredit || 0)));
    const netCr = r2(Math.max(0, Number(row.closingCredit || 0) - Number(row.closingDebit || 0)));
    if (accCode === 'OWNER_CAPITAL' || accCode === 'DRAWINGS') {
      continue; // Consolidated with P&L net profit/loss into final Owner's Capital line below
    }
    if (netDr > 0.01) {
      openingLines.push({ account: accCode, debit: netDr, credit: 0 });
      sumDr = r2(sumDr + netDr);
    } else if (netCr > 0.01) {
      openingLines.push({ account: accCode, debit: 0, credit: netCr });
      sumCr = r2(sumCr + netCr);
    }
  }

  // Balance Sheet balancing plug into OWNER_CAPITAL (reflects prior capital - drawings + FY net surplus)
  const capitalDiff = r2(sumDr - sumCr);
  if (capitalDiff > 0.01) {
    openingLines.push({ account: 'OWNER_CAPITAL', debit: 0, credit: capitalDiff });
    sumCr = r2(sumCr + capitalDiff);
  } else if (capitalDiff < -0.01) {
    const absCap = r2(Math.abs(capitalDiff));
    openingLines.push({ account: 'OWNER_CAPITAL', debit: absCap, credit: 0 });
    sumDr = r2(sumDr + absCap);
  }

  const openingVoucherId = buildOpeningVoucherId(win.nextFy, ownerGstin);
  const alreadyRolledOver = (Array.isArray(manualVouchers) ? manualVouchers : []).some(
    (v) => v?.id === openingVoucherId
  );

  const openingVoucher =
    openingLines.length >= 2
      ? {
          id: openingVoucherId,
          voucherNo: `OB/${win.nextFy}/001`,
          voucherType: 'JOURNAL',
          type: 'JOURNAL',
          date: win.nextFyStartDate,
          narration: `Opening Balances brought forward on ${win.nextFyStartDate} from closed FY ${win.closingFy} (Closing Stock memo: ₹${closingStockCostValue.toLocaleString('en-IN')})`,
          source: 'year-end-rollover',
          closingFy: win.closingFy,
          nextFy: win.nextFy,
          ownerGstin,
          lines: openingLines,
          createdAt: new Date().toISOString(),
        }
      : null;

  const voucherValidation = openingVoucher
    ? validateManualVoucher(openingVoucher)
    : { valid: true, totalDebit: 0, totalCredit: 0, message: 'No non-zero asset/liability ledger balances to carry forward.' };

  return {
    window: win,
    ownerGstin,
    businessName: profile?.businessName || 'Current Business',
    alreadyRolledOver,
    counts: {
      scopedBills: scopedBills.length,
      scopedPurchases: scopedPurchases.length,
      scopedExpenses: scopedExpenses.length,
      stockSkuCount: closingStockItems.length,
      openPartyCount: partyBalances.length,
    },
    inventorySummary: {
      skuCount: closingStockItems.length,
      totalUnits: totalPhysicalUnits,
      closingStockCostValue,
      closingStockSellingValue,
      valuationBasis: 'Lower of Purchase Cost or Selling Price (AS-2 / ICDS-II)',
      items: closingStockItems,
    },
    partySummary: {
      totalReceivables,
      totalPayables,
      msmeYearEndUnpaidRisk,
      msmeYearEndSupplierCount,
      parties: partyBalances,
    },
    accountingSummary: {
      trialBalanceBalanced: Boolean(trialBalance.balanced),
      netProfitBeforeStock: r2(balanceSheet?.netProfit ?? 0),
      openingVoucher,
      openingVoucherValid: Boolean(voucherValidation.valid),
      openingTotalDebit: r2(sumDr),
      openingTotalCredit: r2(sumCr),
    },
    advisories: [
      msmeYearEndUnpaidRisk > 0
        ? `⚠️ Section 43B(h) Alert: ₹${msmeYearEndUnpaidRisk.toLocaleString('en-IN')} across ${msmeYearEndSupplierCount} verified MSME supplier(s) remains unpaid on 31 March (${win.endDate}) — review deduction timing with your CA.`
        : null,
      `📘 CGST Rule 46(b): Start a fresh unique invoice series (e.g. "${win.recommendedInvoicePrefix}0001", ≤16 characters) from ${win.nextFyStartDate}.`,
      `🔒 Books Period Lock: Closing books up to ${win.endDate} protects filed FY ${win.closingFy} GSTR-1/3B/9 figures while still allowing receipt of payments against old invoices.`,
    ].filter(Boolean),
  };
}

/**
 * Builds an exportable Year-End Closing & 1-April Opening Balance Archive JSON.
 */
export function buildYearEndRolloverArchive(plan) {
  return {
    schema: 'bharat-gst-year-end-rollover-v5.3',
    generatedAt: new Date().toISOString(),
    businessName: plan.businessName,
    ownerGstin: plan.ownerGstin,
    closingFy: plan.window.closingFy,
    closedUpToDate: plan.window.endDate,
    nextFy: plan.window.nextFy,
    openingDate: plan.window.nextFyStartDate,
    inventoryClosingSchedule: plan.inventorySummary,
    partyOpeningSchedule: plan.partySummary,
    openingJournalVoucher: plan.accountingSummary.openingVoucher,
    advisories: plan.advisories,
    disclaimer:
      'Year-End Closing & Opening Balance Working Schedule generated locally by Bharat GST Free Billing. Verify physical stock count, bank reconciliation, and statutory adjustments with your Chartered Accountant before final ITR / GSTR-9 filing.',
  };
}
