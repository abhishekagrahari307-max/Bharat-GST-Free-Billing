// CA Pre-Filing GST Health & Compliance Auditor for Bharat GST Free Billing.
// Performs 6 automated CGST Rule 46 & GSTR-1 portal validation checks before
// return filing so businesses & CAs catch portal-rejecting errors in 1 click.

import { validateGstinForCountry } from './profileValidation.js';
import { decodeGstin } from '../utils.js';

/**
 * Audits an array of saved invoices for GST portal readiness.
 * @param {Array} bills - Invoice records (filtered to the period being audited)
 * @param {Object} options - { sellerStateCode?: string }
 */
export function auditInvoicesForGst(bills = [], options = {}) {
  const activeBills = (Array.isArray(bills) ? bills : []).filter(
    (b) => b && b.status !== 'cancelled' && b.status !== 'trashed' && !b.deletedAt
  );

  // Focus tax-bearing outward supplies (exclude quotations/proformas/drafts)
  const outward = activeBills.filter((b) => {
    const type = b?.data?.invoiceType || b?.invoiceType || 'tax-invoice';
    return !['quotation', 'proforma', 'purchase-order', 'sales-order', 'delivery-challan'].includes(type);
  });

  const issues = [];
  const prefixNumbers = new Map(); // prefix -> sorted numeric suffixes

  for (const bill of outward) {
    const data = bill.data || {};
    const invNo = String(bill.invoiceNumber || data?.details?.invoiceNumber || '').trim() || '(Unnumbered)';
    const client = data.client || {};
    const gstin = String(client.gstin || bill.clientGstin || '').trim().toUpperCase();
    const items = Array.isArray(data.items) ? data.items : [];
    const total = Number(bill.total ?? data?.totals?.total ?? 0);
    const clientState = String(client.state || '').trim();
    const ewayNo = String(data?.details?.ewayBillNo || data?.ewayBillNo || '').trim();
    const invoiceMode = data?.invoiceOptions?.invoiceMode || 'goods';

    // 1. Validate B2B Client GSTIN format + Mod-36 checksum + State match
    if (gstin) {
      const formatErr = validateGstinForCountry('India', gstin, '');
      const decoded = decodeGstin(gstin);
      if (formatErr) {
        issues.push({
          severity: 'error',
          code: 'INVALID_GSTIN',
          invoiceNumber: invNo,
          title: `Invalid Client GSTIN (${gstin})`,
          detail: formatErr,
          fix: 'Open invoice and verify the client’s 15-character GSTIN.',
        });
      } else if (clientState && decoded?.state && clientState.toLowerCase() !== decoded.state.toLowerCase()) {
        // 2. Client State vs GSTIN 2-digit State Code mismatch
        const posOverride = String(data?.details?.placeOfSupply || '').trim();
        if (!posOverride) {
          issues.push({
            severity: 'warning',
            code: 'STATE_MISMATCH',
            invoiceNumber: invNo,
            title: `GSTIN State (${decoded.state}) differs from Client State (${clientState})`,
            detail: 'CGST+SGST vs IGST depends on Place of Supply matching the recipient state.',
            fix: `Set Client State to ${decoded.state} or specify an explicit Place of Supply.`,
          });
        }
      }
    }

    // 3. Missing HSN / SAC codes on taxable line items
    const missingHsnCount = items.filter((it) => {
      const hasValue = (Number(it?.quantity) || 0) * (Number(it?.rate) || 0) > 0;
      const hsn = String(it?.hsn || it?.sac || '').replace(/\s+/g, '');
      return hasValue && hsn.length < 4;
    }).length;
    if (missingHsnCount > 0) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_HSN',
        invoiceNumber: invNo,
        title: `${missingHsnCount} item${missingHsnCount > 1 ? 's' : ''} missing 4/6-digit HSN/SAC code`,
        detail: 'GSTR-1 Table 12 requires valid 4-digit or 6-digit HSN/SAC summary codes.',
        fix: 'Add at least 4-digit HSN (goods) or 6-digit SAC (services) on each item.',
      });
    }

    // 4. E-Way Bill check (> ₹50,000 goods consignment)
    if (invoiceMode !== 'services' && total > 50000 && !ewayNo) {
      issues.push({
        severity: 'info',
        code: 'EWAY_THRESHOLD',
        invoiceNumber: invNo,
        title: `Goods invoice ₹${total.toLocaleString('en-IN')} exceeds ₹50,000 without E-Way Bill No.`,
        detail: 'Rule 138 generally requires an E-Way Bill for goods movement exceeding ₹50,000.',
        fix: 'Generate E-Way Bill JSON from the invoice toolbar and record the 12-digit EWB number if goods were transported.',
      });
    }

    // 5. High-value B2C Large (> ₹2,50,000 unregistered inter-state) without state
    if (!gstin && total > 250000 && !clientState && !options.sellerStateCode) {
      issues.push({
        severity: 'warning',
        code: 'B2CL_MISSING_POS',
        invoiceNumber: invNo,
        title: `Unregistered invoice > ₹2.5L missing Place of Supply state`,
        detail: 'GSTR-1 Table 5 (B2CL) requires Place of Supply state on inter-state unregistered bills above ₹2,50,000.',
        fix: 'Select the customer’s State on the invoice.',
      });
    }

    // Collect numeric suffix for Rule 46 gapless sequence check
    const seqMatch = invNo.match(/^(.*?)(\d+)$/);
    if (seqMatch) {
      const pfx = seqMatch[1];
      const num = parseInt(seqMatch[2], 10);
      if (Number.isFinite(num)) {
        if (!prefixNumbers.has(pfx)) prefixNumbers.set(pfx, new Set());
        prefixNumbers.get(pfx).add(num);
      }
    }
  }

  // 6. Rule 46 Gapless Invoice Numbering Check
  for (const [pfx, numSet] of prefixNumbers.entries()) {
    const sorted = [...numSet].sort((a, b) => a - b);
    if (sorted.length < 2) continue;
    const missing = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (curr - prev > 1 && curr - prev <= 20) {
        for (let m = prev + 1; m < curr; m++) {
          missing.push(`${pfx}${String(m).padStart(3, '0')}`);
        }
      }
    }
    if (missing.length > 0) {
      issues.push({
        severity: 'warning',
        code: 'SEQUENCE_GAP',
        invoiceNumber: `${pfx}*`,
        title: `Gap detected in invoice sequence (${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''})`,
        detail: 'CGST Rule 46 expects consecutive serial numbers within a financial year unless cancelled.',
        fix: 'Check Trash / Cancelled bills or verify no draft numbers were skipped.',
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  // Score calculation: 100 base, -15 per portal-blocking error, -5 per warning, -1 per info
  const penalty = errorCount * 15 + warningCount * 5 + infoCount * 1;
  const score = outward.length === 0 ? 100 : Math.max(0, Math.min(100, 100 - penalty));

  return {
    totalAudited: outward.length,
    score,
    portalReady: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
    issues,
  };
}
