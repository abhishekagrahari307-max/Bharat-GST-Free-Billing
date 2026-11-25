// Canonical Product, Invoice & Financial-Year Adapter (v5.2.0 — Audit Hardened)
// Single source of truth reconciling InventoryView, InvoiceGenerator, ITR-3/4,
// GSTR-9/CMP-08, Serverless #b2b-catalog=z., WebRTC P2P, and Tally/Vyapar Importer.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * Resolves a product's GST % across canonical (`taxPercent`) and legacy (`gstRate`, `taxRate`, `gst`) fields.
 */
export function resolveProductTaxPercent(product = {}) {
  if (!product || typeof product !== 'object') return 0;
  const candidates = [product.taxPercent, product.gstRate, product.taxRate, product.gst];
  for (const val of candidates) {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const n = Number(val);
      if (Number.isFinite(n) && n >= 0) return r2(n);
    }
  }
  return 0;
}

/**
 * Resolves a product's unit selling price across canonical (`sellingPrice`, `price`) and line (`rate`) fields.
 */
export function resolveProductSellingPrice(product = {}) {
  if (!product || typeof product !== 'object') return 0;
  const candidates = [product.sellingPrice, product.price, product.rate];
  for (const val of candidates) {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const n = Number(val);
      if (Number.isFinite(n) && n >= 0) return r2(n);
    }
  }
  return 0;
}

/**
 * Produces a canonical product object with BOTH `taxPercent` and `gstRate` (and `price` + `sellingPrice`)
 * populated so every screen and export reads identical values.
 */
export function normalizeCanonicalProduct(raw = {}) {
  const taxPercent = resolveProductTaxPercent(raw);
  const sellingPrice = resolveProductSellingPrice(raw);
  const purchasePrice = r2(Number(raw.purchasePrice ?? raw.costPrice ?? 0));
  const stock = Number.isFinite(Number(raw.stock ?? raw.currentStock))
    ? Number(raw.stock ?? raw.currentStock)
    : 0;
  return {
    ...raw,
    name: String(raw.name || raw.description || '').trim(),
    hsn: String(raw.hsn || raw.hsnCode || '').trim(),
    unit: String(raw.unit || 'PCS').trim().toUpperCase() || 'PCS',
    price: sellingPrice,
    sellingPrice,
    purchasePrice,
    taxPercent,
    gstRate: taxPercent,
    stock,
  };
}

/**
 * Normalizes any saved or imported invoice (`bill`) into exact statutory figures:
 * - Recognizes hyphenated enums (`'tax-invoice'`, `'credit-note'`, `'quotation'`, `'proforma'`,
 *   `'sales-order'`, `'delivery-challan'`, `'bill-of-supply'`, `'composition'`) AND human labels.
 * - Reads `bill.data.totals` (`taxableAmount`, `cgst`, `sgst`, `utgst`, `igst`, `cess`, `total`)
 *   before falling back to legacy top-level / `data.*` fields or per-item calculation.
 */
export function normalizeInvoiceBreakdown(bill = {}) {
  if (!bill || typeof bill !== 'object') {
    return {
      docKind: 'NON_SALE',
      sign: 0,
      isCancelled: true,
      isCreditNote: false,
      isCompositionOrExempt: false,
      isExport: false,
      invoiceDate: '',
      ownerGstin: '',
      clientGstin: '',
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      utgst: 0,
      igst: 0,
      cess: 0,
      totalTax: 0,
      grossTotal: 0,
      items: [],
    };
  }

  const d = bill.data || {};
  const totals = d.totals || bill.totals || {};
  const statusLower = String(bill.status || d.status || '').trim().toLowerCase();
  const isCancelled = Boolean(bill.cancelled || d.cancelled || statusLower === 'cancelled');

  const rawType = String(bill.invoiceType || d.invoiceType || 'tax-invoice').trim();
  const typeNorm = rawType.toLowerCase().replace(/[_\s]+/g, '-');

  let docKind = 'SALE';
  if (isCancelled) {
    docKind = 'CANCELLED';
  } else if (
    typeNorm === 'quotation' ||
    typeNorm === 'quote' ||
    typeNorm === 'estimate' ||
    typeNorm === 'proforma' ||
    typeNorm === 'proforma-invoice' ||
    typeNorm === 'sales-order' ||
    typeNorm === 'purchase-order' ||
    typeNorm === 'delivery-challan' ||
    typeNorm === 'challan'
  ) {
    docKind = 'NON_SALE';
  } else if (typeNorm === 'credit-note' || typeNorm === 'cn' || /credit-note/.test(typeNorm)) {
    docKind = 'CREDIT_NOTE';
  } else if (typeNorm === 'composition' || typeNorm === 'bill-of-supply') {
    docKind = 'COMPOSITION';
  }

  const sign = docKind === 'SALE' || docKind === 'COMPOSITION' ? 1 : docKind === 'CREDIT_NOTE' ? -1 : 0;

  let cgst = r2(Math.abs(Number(totals.cgst ?? d.totalCgst ?? d.cgstAmount ?? bill.cgst ?? 0)));
  let sgst = r2(Math.abs(Number(totals.sgst ?? d.totalSgst ?? d.sgstAmount ?? bill.sgst ?? 0)));
  let utgst = r2(Math.abs(Number(totals.utgst ?? d.totalUtgst ?? bill.utgst ?? 0)));
  let igst = r2(Math.abs(Number(totals.igst ?? d.totalIgst ?? d.igstAmount ?? bill.igst ?? 0)));
  let cess = r2(Math.abs(Number(totals.cess ?? d.totalCess ?? d.cessAmount ?? bill.cess ?? 0)));

  const items = Array.isArray(d.items) ? d.items : Array.isArray(bill.items) ? bill.items : [];
  const taxInclusive = Boolean(d.taxInclusive ?? bill.taxInclusive);
  const zeroRated = Boolean(totals.lutZeroRated || d.lutZeroRated || docKind === 'COMPOSITION');

  let derivedItemsTaxable = 0;
  let derivedItemsTax = 0;
  for (const it of items) {
    if (!it) continue;
    const qty = Math.max(0, Number(it.quantity ?? it.qty ?? 0) || 0);
    const rate = Math.max(0, Number(it.rate ?? it.price ?? 0) || 0);
    const taxPct = zeroRated ? 0 : resolveProductTaxPercent(it);
    const lineGross = r2(qty * rate);
    if (it.taxableValue != null && Number.isFinite(Number(it.taxableValue))) {
      const tv = r2(Math.abs(Number(it.taxableValue)));
      derivedItemsTaxable = r2(derivedItemsTaxable + tv);
      derivedItemsTax = r2(derivedItemsTax + r2((tv * taxPct) / 100));
    } else if (taxInclusive && taxPct > 0) {
      const tv = r2(lineGross / (1 + taxPct / 100));
      derivedItemsTaxable = r2(derivedItemsTaxable + tv);
      derivedItemsTax = r2(derivedItemsTax + r2(lineGross - tv));
    } else {
      derivedItemsTaxable = r2(derivedItemsTaxable + lineGross);
      derivedItemsTax = r2(derivedItemsTax + r2((lineGross * taxPct) / 100));
    }
  }

  let totalTax = r2(cgst + sgst + utgst + igst + cess);
  if (totalTax === 0 && derivedItemsTax > 0 && !zeroRated) {
    totalTax = derivedItemsTax;
    if (totals.isInterstate || d.isInterstate) {
      igst = derivedItemsTax;
    } else {
      cgst = r2(derivedItemsTax / 2);
      sgst = r2(derivedItemsTax - cgst);
    }
  }

  const grossTotal = r2(
    Math.abs(
      Number(
        totals.total ??
          bill.totalAmount ??
          d.grandTotal ??
          (derivedItemsTaxable > 0 ? derivedItemsTaxable + totalTax : 0)
      )
    )
  );

  let taxableValue = 0;
  if (totals.taxableAmount != null && Number.isFinite(Number(totals.taxableAmount))) {
    taxableValue = r2(Math.abs(Number(totals.taxableAmount)));
  } else if (d.taxableSubtotal != null && Number.isFinite(Number(d.taxableSubtotal))) {
    taxableValue = r2(Math.abs(Number(d.taxableSubtotal)));
  } else if (totalTax > 0 && grossTotal >= totalTax) {
    taxableValue = r2(grossTotal - totalTax);
  } else if (d.subtotal != null && Number.isFinite(Number(d.subtotal)) && !taxInclusive) {
    const disc = r2(Math.abs(Number(totals.totalDiscount ?? d.totalDiscount ?? 0)));
    taxableValue = r2(Math.max(0, Math.abs(Number(d.subtotal)) - disc));
  } else if (derivedItemsTaxable > 0) {
    taxableValue = derivedItemsTaxable;
  } else {
    taxableValue = grossTotal;
  }

  const invoiceDate = String(
    bill.invoiceDate || d.details?.invoiceDate || d.invoiceDate || bill.date || ''
  ).slice(0, 10);

  const ownerGstin = String(
    bill.ownerGstin || bill.businessGstin || d.profile?.gstin || ''
  ).trim().toUpperCase();

  const clientGstin = String(
    bill.clientGstin || d.client?.gstin || ''
  ).trim().toUpperCase();

  const isExport = Boolean(
    d.isExport ||
      d.supplyType === 'EXP' ||
      totals.lutZeroRated ||
      (d.client?.country && String(d.client.country).trim().toLowerCase() !== 'india')
  );

  return {
    docKind,
    sign,
    isCancelled,
    isCreditNote: docKind === 'CREDIT_NOTE',
    isCompositionOrExempt: docKind === 'COMPOSITION',
    isExport,
    invoiceDate,
    ownerGstin,
    clientGstin,
    taxableValue,
    cgst,
    sgst,
    utgst,
    igst,
    cess,
    totalTax,
    grossTotal,
    items,
  };
}

/**
 * Computes Indian Financial Year label (e.g. '2026-27') for a given ISO date or today.
 */
export function getIndianFinancialYear(isoDate = new Date().toISOString().slice(0, 10)) {
  const s = String(isoDate || '').slice(0, 10);
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return '2026-27';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * Checks whether an ISO date ('YYYY-MM-DD') falls within Indian Financial Year `fy` (e.g. '2026-27').
 * If `!fy` or `fy === 'ALL'`, returns true. If a record has no date, includes it only when `includeUndated` is true.
 */
export function matchesIndianFinancialYear(isoDate, fy = 'ALL', { includeUndated = true } = {}) {
  if (!fy || String(fy).toUpperCase() === 'ALL') return true;
  const fyMatch = /^(\d{4})-(\d{2,4})$/.exec(String(fy).trim());
  if (!fyMatch) return true;
  const startYear = Number(fyMatch[1]);
  const startIso = `${startYear}-04-01`;
  const endIso = `${startYear + 1}-03-31`;
  const d = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return includeUndated;
  return d >= startIso && d <= endIso;
}

/**
 * Filters records by Indian Financial Year (`fy`) and optional active business GSTIN (`ownerGstin`).
 */
export function filterRecordsByFyAndFirm(
  records = [],
  { fy = 'ALL', ownerGstin = '', getDate, getGstin, includeUndated = true } = {}
) {
  const cleanFirm = String(ownerGstin || '').trim().toUpperCase();
  return (Array.isArray(records) ? records : []).filter((rec) => {
    if (!rec) return false;
    if (cleanFirm && typeof getGstin === 'function') {
      const recGstin = String(getGstin(rec) || '').trim().toUpperCase();
      if (recGstin && recGstin !== cleanFirm) return false;
    }
    if (fy && String(fy).toUpperCase() !== 'ALL' && typeof getDate === 'function') {
      const dt = getDate(rec);
      if (!matchesIndianFinancialYear(dt, fy, { includeUndated })) return false;
    }
    return true;
  });
}
