// AI Fuzzy GSTR-2B vs Purchase Register Reconciliation Engine (v3.1.0)
// Uses Invoice Core Extraction + Levenshtein Distance + GSTIN + ±₹2 Rounding Tolerance
// + Auto-Drafted Supplier WhatsApp ITC Follow-Up Notice Generator.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

export function normalizeInvoiceToken(raw = '') {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Extract trailing numeric core (e.g., "INV/2026-27/0045" -> "45") alongside full alphanumeric token
  const trailingDigits = (clean.match(/(\d+)$/) || [])[1] || '';
  const coreDigits = trailingDigits ? String(Number(trailingDigits)) : '';
  return { clean, coreDigits };
}

export function levenshteinDistance(a = '', b = '') {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const dp = Array.from({ length: s.length + 1 }, (_, i) => i);
  for (let j = 1; j <= t.length; j += 1) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= s.length; i += 1) {
      const tmp = dp[i];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[s.length];
}

function flattenPortal2bInvoices(gstr2bJson) {
  const data = gstr2bJson?.data?.docdata?.b2b || gstr2bJson?.docdata?.b2b || gstr2bJson?.b2b || (Array.isArray(gstr2bJson) ? gstr2bJson : []);
  const out = [];
  for (const supplier of Array.isArray(data) ? data : []) {
    const ctin = String(supplier?.ctin || supplier?.gstin || '').toUpperCase().trim();
    const trdnm = supplier?.trdnm || supplier?.supplierName || '';
    const invList = supplier?.inv || supplier?.invoices || (supplier?.inum ? [supplier] : []);
    for (const inv of Array.isArray(invList) ? invList : []) {
      const inum = String(inv?.inum || inv?.invoiceNumber || inv?.billNumber || '').trim();
      const dt = String(inv?.dt || inv?.idt || inv?.date || '').trim();
      const val = r2(Number(inv?.val ?? inv?.totalAmount ?? 0));
      let tax = r2(
        (Number(inv?.igst ?? 0) || 0) +
        (Number(inv?.cgst ?? 0) || 0) +
        (Number(inv?.sgst ?? 0) || 0) +
        (Number(inv?.cess ?? 0) || 0)
      );
      if (tax === 0 && Array.isArray(inv?.items)) {
        tax = r2(inv.items.reduce((s, it) => s + (Number(it?.igst || 0) + Number(it?.cgst || 0) + Number(it?.sgst || 0)), 0));
      }
      out.push({
        ctin,
        supplierName: trdnm,
        invoiceNo: inum,
        date: dt,
        totalValue: val,
        taxAmount: tax,
      });
    }
  }
  return out;
}

/**
 * Reconciles GSTR-2B portal JSON against local Purchase Bills using exact + AI fuzzy matching.
 */
export function reconcileGstr2bFuzzy(gstr2bJson, purchases = [], { amountTolerance = 2.0 } = {}) {
  const portalRows = flattenPortal2bInvoices(gstr2bJson);
  const bookRows = (Array.isArray(purchases) ? purchases : [])
    .filter((p) => p && !p.cancelled)
    .map((p, idx) => {
      const splitTax = r2(
        (Number(p.cgst ?? p.totalCgst ?? 0) || 0) +
        (Number(p.sgst ?? p.totalSgst ?? 0) || 0) +
        (Number(p.igst ?? p.totalIgst ?? 0) || 0)
      );
      const tax = splitTax > 0 ? splitTax : r2(Number(p.gstAmount ?? p.taxAmount ?? 0));
      return {
        idx,
        id: p.id || `pur-${idx}`,
        gstin: String(p.vendorGstin || p.gstin || p.supplierGstin || '').toUpperCase().trim(),
        supplierName: p.vendorName || p.supplierName || 'Supplier',
        phone: p.vendorPhone || p.phone || '',
        invoiceNo: String(p.billNumber || p.invoiceNumber || '').trim(),
        date: String(p.billDate || p.date || '').slice(0, 10),
        totalValue: r2(Number(p.totalAmount ?? p.grandTotal ?? p.amount ?? 0)),
        taxAmount: tax,
      };
    });

  const usedBooks = new Set();
  const exactMatches = [];
  const fuzzyMatches = [];
  const valueMismatches = [];
  const missingInBooks = [];

  for (const pRow of portalRows) {
    const pTok = normalizeInvoiceToken(pRow.invoiceNo);
    let best = null;
    let bestScore = -1;

    for (const bRow of bookRows) {
      if (usedBooks.has(bRow.idx)) continue;
      if (pRow.ctin && bRow.gstin && pRow.ctin !== bRow.gstin) continue;

      const bTok = normalizeInvoiceToken(bRow.invoiceNo);
      let invScore = 0;
      if (pTok.clean && pTok.clean === bTok.clean) {
        invScore = 100;
      } else if (pTok.coreDigits && pTok.coreDigits === bTok.coreDigits) {
        invScore = 88;
      } else if (pTok.clean && bTok.clean) {
        const dist = levenshteinDistance(pTok.clean, bTok.clean);
        const maxLen = Math.max(pTok.clean.length, bTok.clean.length);
        const sim = maxLen > 0 ? 1 - dist / maxLen : 0;
        if (sim >= 0.7) invScore = Math.round(sim * 85);
      }

      const valDiff = Math.abs(pRow.totalValue - bRow.totalValue);
      if (invScore === 0 && pRow.ctin && pRow.ctin === bRow.gstin && valDiff <= amountTolerance) {
        invScore = 72; // Same GSTIN & exact value despite OCR typo in bill no
      }
      if (invScore > bestScore) {
        bestScore = invScore;
        best = bRow;
      }
    }

    if (best && bestScore >= 70) {
      usedBooks.add(best.idx);
      const valDiff = r2(Math.abs(pRow.totalValue - best.totalValue));
      const taxDiff = r2(Math.abs(pRow.taxAmount - best.taxAmount));
      if (bestScore === 100 && valDiff <= 0.05 && taxDiff <= 0.05) {
        exactMatches.push({ portal: pRow, book: best, confidence: 100 });
      } else if (valDiff <= amountTolerance && taxDiff <= amountTolerance) {
        fuzzyMatches.push({
          portal: pRow,
          book: best,
          confidence: bestScore,
          valDiff,
          note: `Fuzzy matched "${best.invoiceNo}" ↔ "${pRow.invoiceNo}" (Δ ₹${valDiff.toFixed(2)})`,
        });
      } else {
        valueMismatches.push({
          portal: pRow,
          book: best,
          valDiff,
          taxDiff,
        });
      }
    } else {
      missingInBooks.push(pRow);
    }
  }

  const missingIn2b = bookRows
    .filter((b) => !usedBooks.has(b.idx))
    .map((b) => ({
      ...b,
      whatsappFollowUpUrl: buildSupplierItcWhatsappUrl(b),
    }));

  return {
    exactMatches,
    fuzzyMatches,
    valueMismatches,
    missingIn2b,
    missingInBooks,
    summary: {
      portalCount: portalRows.length,
      booksCount: bookRows.length,
      autoReconciledCount: exactMatches.length + fuzzyMatches.length,
      fuzzyRecoveredCount: fuzzyMatches.length,
      mismatchCount: valueMismatches.length,
      missingIn2bItcAtRisk: r2(missingIn2b.reduce((s, x) => s + x.taxAmount, 0)),
    },
  };
}

export function buildSupplierItcWhatsappUrl(bookPurchase, businessName = 'Our Firm') {
  const msg =
    `Namaste ${bookPurchase.supplierName || 'Sir/Madam'},\n` +
    `Purchase Invoice No. *${bookPurchase.invoiceNo || 'N/A'}* dated *${bookPurchase.date || 'N/A'}* ` +
    `(Total ₹${Number(bookPurchase.totalValue || 0).toLocaleString('en-IN')}, GST ITC ₹${Number(bookPurchase.taxAmount || 0).toLocaleString('en-IN')}) ` +
    `is currently not reflecting in our GSTR-2B portal download.\n` +
    `Kindly upload/file it in your GSTR-1 so we can avail eligible Input Tax Credit. — ${businessName}`;
  const digits = String(bookPurchase.phone || '').replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}
