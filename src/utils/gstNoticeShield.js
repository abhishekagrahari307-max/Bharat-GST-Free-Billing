// AI GST Notice Prevention Shield, Section 17(5) Blocked ITC Detector,
// CGST Rule 37 (180-Day Unpaid Supplier ITC Reversal), CMP-08 & GSTR-9 Annual Working Papers (v5.2.0 — Audit Hardened)
// Uses Canonical Invoice & FY Adapter so saved invoices (`data.totals.taxableAmount`, `'credit-note'`) reconcile 100%.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import {
  normalizeInvoiceBreakdown,
  filterRecordsByFyAndFirm,
  resolveProductTaxPercent,
} from './canonicalAdapter.js';

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

const SEC_17_5_PATTERNS = [
  { regex: /\b(car|motor\s*vehicle|suv|sedan|bike|scooter|two\s*wheeler)\b/i, clause: 'Sec 17(5)(a)', reason: 'Motor vehicles for passenger transport (<=13 seats) — ITC blocked unless in transport/dealer/driving school business.' },
  { regex: /\b(food|beverage|catering|restaurant|lunch|dinner|snacks|sweet|mithai|hotel\s*party|banquet)\b/i, clause: 'Sec 17(5)(b)(i)', reason: 'Food & beverages / outdoor catering — ITC blocked unless outward supply is same category.' },
  { regex: /\b(club|gym|fitness|health\s*club|spa|membership)\b/i, clause: 'Sec 17(5)(b)(ii)', reason: 'Club, health & fitness centre membership — ITC blocked under Section 17(5).' },
  { regex: /\b(personal|gift|diwali\s*gift|free\s*sample|family|domestic)\b/i, clause: 'Sec 17(5)(g)/(h)', reason: 'Goods/services used for personal consumption or gifts/free samples — ITC must not be claimed.' },
  { regex: /\b(civil\s*work|cement|brick|building\s*construction|renovation\s*of\s*office)\b/i, clause: 'Sec 17(5)(c)/(d)', reason: 'Works contract / construction of immovable property (other than plant & machinery) — ITC blocked.' },
];

export function runGstNoticeShield({
  bills = [],
  purchases = [],
  expenses = [],
  asOfDate = new Date().toISOString().slice(0, 10),
  fy = 'ALL',
  ownerGstin = '',
} = {}) {
  const alerts = [];
  const todayMs = Date.parse(asOfDate) || Date.now();
  let blockedItcAmount = 0;
  let rule37ReversalItc = 0;
  let rule37InterestEstimate = 0;

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

  const scopedBills = filterRecordsByFyAndFirm(bills, {
    fy,
    ownerGstin,
    getDate: (b) => b?.invoiceDate || b?.data?.details?.invoiceDate || b?.data?.invoiceDate || b?.date,
    getGstin: (b) => b?.ownerGstin || b?.businessGstin || b?.data?.profile?.gstin,
  });

  // 1. Check Purchases for Sec 17(5) & Rule 37 (180-day unpaid supplier bills)
  for (const pur of scopedPurchases) {
    if (!pur || pur.cancelled || String(pur.status || '').toLowerCase() === 'cancelled') continue;
    const splitTax = r2(
      (Number(pur.cgst ?? pur.totalCgst ?? 0) || 0) +
      (Number(pur.sgst ?? pur.totalSgst ?? 0) || 0) +
      (Number(pur.igst ?? pur.totalIgst ?? 0) || 0)
    );
    const effectiveItc = splitTax > 0 ? splitTax : r2(Number(pur.gstAmount ?? pur.taxAmount ?? 0));
    const itemText = [
      pur.description || '',
      pur.notes || '',
      pur.category || '',
      ...(Array.isArray(pur.items) ? pur.items.map((i) => i?.description || i?.name || '') : []),
    ].join(' ');

    if (effectiveItc > 0) {
      for (const rule of SEC_17_5_PATTERNS) {
        if (rule.regex.test(itemText)) {
          blockedItcAmount = r2(blockedItcAmount + effectiveItc);
          alerts.push({
            severity: 'high',
            code: 'SEC_17_5_BLOCKED_ITC',
            clause: rule.clause,
            docNo: pur.billNumber || pur.invoiceNumber || 'Purchase',
            party: pur.vendorName || pur.supplierName || 'Supplier',
            amountAtRisk: effectiveItc,
            message: `${rule.clause}: ₹${effectiveItc.toFixed(2)} ITC on "${itemText.trim().slice(0, 60)}". ${rule.reason}`,
          });
          break;
        }
      }
    }

    const total = r2(Number(pur.totalAmount ?? pur.grandTotal ?? pur.amount ?? 0));
    const status = String(pur.status || '').toLowerCase();
    const paid = status === 'paid' ? total : r2(Number(pur.amountPaid ?? pur.paidAmount ?? 0));
    const unpaid = r2(Math.max(0, total - paid));
    const bDate = Date.parse(String(pur.billDate || pur.date || '').slice(0, 10));
    if (effectiveItc > 0 && unpaid > 0.01 && Number.isFinite(bDate)) {
      const ageDays = Math.floor((todayMs - bDate) / 86400000);
      if (ageDays > 180) {
        const propItc = total > 0 ? r2(effectiveItc * (unpaid / total)) : effectiveItc;
        const interest = r2(propItc * 0.18 * ((ageDays - 180) / 365));
        rule37ReversalItc = r2(rule37ReversalItc + propItc);
        rule37InterestEstimate = r2(rule37InterestEstimate + interest);
        alerts.push({
          severity: 'high',
          code: 'RULE_37_180_DAYS',
          clause: 'CGST Rule 37',
          docNo: pur.billNumber || pur.invoiceNumber || 'Purchase',
          party: pur.vendorName || pur.supplierName || 'Supplier',
          amountAtRisk: propItc,
          message: `Unpaid for ${ageDays} days (>180d limit): Reverse proportionate ITC ₹${propItc.toFixed(2)} in GSTR-3B Table 4(B)(2) (est. 18% interest ₹${interest.toFixed(2)}). Re-claimable once paid.`,
        });
      }
    }
  }

  // 2. Check Expenses claiming GST for Section 17(5)
  for (const exp of scopedExpenses) {
    const gst = r2(Number(exp?.gstAmount || 0));
    if (gst <= 0) continue;
    const text = `${exp.category || ''} ${exp.description || ''} ${exp.notes || ''}`;
    for (const rule of SEC_17_5_PATTERNS) {
      if (rule.regex.test(text)) {
        blockedItcAmount = r2(blockedItcAmount + gst);
        alerts.push({
          severity: 'medium',
          code: 'SEC_17_5_EXPENSE_ITC',
          clause: rule.clause,
          docNo: exp.reference || exp.date || 'Expense',
          party: exp.vendor || exp.category || 'Expense',
          amountAtRisk: gst,
          message: `${rule.clause}: ₹${gst.toFixed(2)} GST on expense "${text.trim().slice(0, 60)}" may be ineligible ITC.`,
        });
        break;
      }
    }
  }

  // 3. E-Way Bill Missing Check on Outward Tax Invoices / Challans > ₹50,000
  for (const bill of scopedBills) {
    const norm = normalizeInvoiceBreakdown(bill);
    if (norm.isCancelled) continue;
    const d = bill.data || {};
    const rawType = String(bill.invoiceType || d.invoiceType || 'tax-invoice').toLowerCase();
    const isGoodsDoc = rawType.includes('tax') || rawType.includes('challan');
    if (!isGoodsDoc) continue;
    const hasEwb = Boolean(
      d.ewayBillNo ||
      d.eWayBillNo ||
      d.vehicleNo ||
      d.details?.vehicleNo ||
      d.transport?.ewayBillNo ||
      d.transport?.vehicleNo
    );
    if (norm.grossTotal > 50000 && !hasEwb) {
      alerts.push({
        severity: 'medium',
        code: 'EWAY_BILL_MISSING',
        clause: 'CGST Rule 138',
        docNo: bill.invoiceNumber || d.details?.invoiceNumber || d.invoiceNumber || 'Invoice',
        party: bill.clientName || d.client?.name || 'Customer',
        amountAtRisk: norm.grossTotal,
        message: `Invoice value ₹${norm.grossTotal.toLocaleString('en-IN')} exceeds ₹50,000 without E-Way Bill / Vehicle No. recorded (required for goods movement).`,
      });
    }
  }

  return {
    alerts,
    blockedItcAmount,
    rule37ReversalItc,
    rule37InterestEstimate,
    totalNoticeRiskAmount: r2(blockedItcAmount + rule37ReversalItc + rule37InterestEstimate),
    clean: alerts.length === 0,
  };
}

/**
 * Generates Consolidated GSTR-9 Annual Return Working Papers + CMP-08 Composition Summary
 * using the Canonical Invoice Breakdown (`data.totals.taxableAmount`, `cgst`, `sgst`, `utgst`, `igst`, `cess`, `'credit-note'`).
 */
export function buildGstr9AndCmp08WorkingPapers({
  bills = [],
  purchases = [],
  compositionRatePct = 1,
  fy = 'ALL',
  ownerGstin = '',
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

  let b2bTaxable = 0;
  let b2bTax = 0;
  let b2cTaxable = 0;
  let b2cTax = 0;
  let exportZeroRated = 0;
  let creditNoteTaxable = 0;
  let creditNoteTax = 0;
  let compositionTurnover = 0;
  const hsnMap = new Map();

  for (const bill of scopedBills) {
    const norm = normalizeInvoiceBreakdown(bill);
    if (norm.sign === 0) continue; // Skips cancelled, quotations, proforma, sales orders, challans

    if (norm.isCompositionOrExempt) {
      compositionTurnover = r2(compositionTurnover + norm.grossTotal);
    }

    if (norm.isCreditNote) {
      creditNoteTaxable = r2(creditNoteTaxable + norm.taxableValue);
      creditNoteTax = r2(creditNoteTax + norm.totalTax);
    } else if (norm.isExport) {
      exportZeroRated = r2(exportZeroRated + norm.taxableValue);
    } else if (norm.clientGstin.length === 15) {
      b2bTaxable = r2(b2bTaxable + norm.taxableValue);
      b2bTax = r2(b2bTax + norm.totalTax);
    } else {
      b2cTaxable = r2(b2cTaxable + norm.taxableValue);
      b2cTax = r2(b2cTax + norm.totalTax);
    }

    const d = bill.data || {};
    const taxInclusive = Boolean(d.taxInclusive ?? bill.taxInclusive);
    for (const item of norm.items) {
      if (!item) continue;
      const hsn = String(item?.hsn || 'UNSPECIFIED').trim() || 'UNSPECIFIED';
      const qty = (Number(item?.quantity ?? item?.qty ?? 0) || 0) * norm.sign;
      const unitRate = Number(item?.rate ?? item?.price ?? 0) || 0;
      const taxPct = norm.isCompositionOrExempt ? 0 : resolveProductTaxPercent(item);
      const rawLine = Math.abs(qty) * unitRate;
      const lineTaxable = item?.taxableValue != null && Number.isFinite(Number(item.taxableValue))
        ? r2(Math.abs(Number(item.taxableValue))) * norm.sign
        : taxInclusive && taxPct > 0
          ? r2(rawLine / (1 + taxPct / 100)) * norm.sign
          : r2(rawLine) * norm.sign;

      const cur = hsnMap.get(hsn) || { hsn, qty: 0, taxableValue: 0 };
      cur.qty = r2(cur.qty + qty);
      cur.taxableValue = r2(cur.taxableValue + lineTaxable);
      hsnMap.set(hsn, cur);
    }
  }

  let totalItcClaimed = 0;
  let totalInwardTaxable = 0;
  for (const pur of scopedPurchases) {
    if (!pur || pur.cancelled || String(pur.status || '').toLowerCase() === 'cancelled') continue;
    const total = r2(Math.abs(Number(pur.totalAmount ?? pur.grandTotal ?? pur.amount ?? 0)));
    const split = r2(
      (Number(pur.cgst ?? pur.totalCgst ?? 0) || 0) +
      (Number(pur.sgst ?? pur.totalSgst ?? 0) || 0) +
      (Number(pur.igst ?? pur.totalIgst ?? 0) || 0)
    );
    const tax = split > 0 ? split : r2(Number(pur.gstAmount ?? pur.taxAmount ?? 0));
    const inwardTaxable = pur.taxableAmount != null && Number.isFinite(Number(pur.taxableAmount))
      ? r2(Math.abs(Number(pur.taxableAmount)))
      : r2(Math.max(0, total - tax));
    totalItcClaimed = r2(totalItcClaimed + tax);
    totalInwardTaxable = r2(totalInwardTaxable + inwardTaxable);
  }

  const netOutwardTaxable = r2(b2bTaxable + b2cTaxable + exportZeroRated - creditNoteTaxable);
  const netOutwardTax = r2(b2bTax + b2cTax - creditNoteTax);
  const cmp08Tax = r2((compositionTurnover * (Number(compositionRatePct) || 1)) / 100);

  return {
    financialYear: fy || 'ALL',
    gstr9: {
      table4B2C: { taxable: b2cTaxable, tax: b2cTax },
      table4B2B: { taxable: b2bTaxable, tax: b2bTax },
      table4Exports: { taxable: exportZeroRated, tax: 0 },
      table4CreditNotes: { taxable: creditNoteTaxable, tax: creditNoteTax },
      netOutwardTaxable,
      netOutwardTax,
      table6ItcAvailment: { inwardTaxable: totalInwardTaxable, totalItc: totalItcClaimed },
      table9NetTaxPayableCash: r2(Math.max(0, netOutwardTax - totalItcClaimed)),
      table17HsnOutward: [...hsnMap.values()].sort((a, b) => b.taxableValue - a.taxableValue),
      disclaimer: 'CA Reconciliation Working Paper — reconcile against GSTR-1, GSTR-3B & GSTR-2B Table 8A on GST Portal before filing GSTR-9.',
    },
    cmp08: {
      outwardSuppliesTurnover: r2(compositionTurnover || netOutwardTaxable),
      ratePct: Number(compositionRatePct) || 1,
      cgstPayable: r2(cmp08Tax / 2),
      sgstPayable: r2(cmp08Tax / 2),
      totalCompositionTax: cmp08Tax,
    },
  };
}
