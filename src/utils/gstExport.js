// v5.5.2 — Official Government GST Offline Tool V3.2.4 CSV Export Engine
// Matches exact column headers, column counts, date format (dd-MMM-yyyy),
// Place Of Supply ("09-Uttar Pradesh"), Type ("OE"/"E"), UQC ("PCS-PIECES" / "NA"),
// numeric Tax Rate (no "%" symbol), and CRLF (\r\n) line endings expected by
// GST Offline Tool V3.2.4 across ALL GSTR-1 sections:
//   - Section 7  : B2C(Small) Details           -> GSTR1_B2C_Small.csv
//   - Section 12 : HSN-wise Summary (B2B & B2C) -> GSTR1_HSN_B2B.csv / GSTR1_HSN_B2C.csv
//   - Section 4  : B2B, SEZ, DE Invoices        -> GSTR1_B2B_Invoices.csv
//   - Section 5A : B2C(Large) Invoices          -> GSTR1_B2C_Large.csv
//   - Section 9B : Credit/Debit Notes (Reg)     -> GSTR1_CDNR.csv
//   - Section 9B : Credit/Debit Notes (Unreg)   -> GSTR1_CDNUR.csv
//   - Section 6A : Exports Invoices             -> GSTR1_Exports_6A.csv
//   - Section 8  : Nil Rated / Exempt / Non-GST -> GSTR1_Exemp_Nil_NonGST.csv
//   - Section 13 : Documents Issued             -> GSTR1_Doc_Summary.csv

import { getStateCode, parseLocalDate, placeOfSupplyLabel } from '../utils.js';
import {
  HSN_DESC_MAX,
  b2bInvType,
  billIsInterstate,
  billSplit,
  cleanGstin,
  hsnRowValue,
  isExportBill,
  lineTreatment,
  nilTable,
} from './gstr1Json.js';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Official 45 GSTN UQC codes + 'NA' mapped to exact GST Offline Tool V3.2.4 dropdown strings.
export const GOVT_UQC_MAP = {
  BAG: 'BAG-BAGS',
  BAL: 'BAL-BALE',
  BDL: 'BDL-BUNDLES',
  BKL: 'BKL-BUCKLES',
  BOU: 'BOU-BILLION OF UNITS',
  BOX: 'BOX-BOX',
  BTL: 'BTL-BOTTLES',
  BUN: 'BUN-BUNCHES',
  CAN: 'CAN-CANS',
  CBM: 'CBM-CUBIC METERS',
  CCM: 'CCM-CUBIC CENTIMETERS',
  CMS: 'CMS-CENTIMETERS',
  CTN: 'CTN-CARTONS',
  DOZ: 'DOZ-DOZENS',
  DRM: 'DRM-DRUMS',
  GGK: 'GGK-GREAT GROSS',
  GMS: 'GMS-GRAMMES',
  GRS: 'GRS-GROSS',
  GYD: 'GYD-GROSS YARDS',
  KGS: 'KGS-KILOGRAMS',
  KLR: 'KLR-KILOLITRE',
  KME: 'KME-KILOMETRE',
  LTR: 'LTR-LITRES',
  MLT: 'MLT-MILILITRE',
  MTR: 'MTR-METERS',
  MTS: 'MTS-METRIC TON',
  NOS: 'NOS-NUMBERS',
  OTH: 'OTH-OTHERS',
  PAC: 'PAC-PACKS',
  PCS: 'PCS-PIECES',
  PRS: 'PRS-PAIRS',
  QTL: 'QTL-QUINTAL',
  ROL: 'ROL-ROLLS',
  SET: 'SET-SETS',
  SQF: 'SQF-SQUARE FEET',
  SQM: 'SQM-SQUARE METERS',
  SQY: 'SQY-SQUARE YARDS',
  TBS: 'TBS-TABLETS',
  TGM: 'TGM-TEN GROSS',
  THD: 'THD-THOUSANDS',
  TON: 'TON-TONNES',
  TUB: 'TUB-TUBES',
  UGS: 'UGS-US GALLONS',
  UNT: 'UNT-UNITS',
  YDS: 'YDS-YARDS',
  NA: 'NA',
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const TAX_KEYS = ['igst', 'cgst', 'sgst', 'utgst', 'rcmTaxIgst', 'rcmTaxCgst', 'rcmTaxSgst', 'rcmTaxUtgst'];
const billIsLut = (bill) => (
  !!bill?.data?.invoiceOptions?.isLUT || /\bLUT\b|Letter of Undertaking/i.test(bill?.data?.customTerms || '')
) && !TAX_KEYS.some((k) => Number(bill?.data?.totals?.[k]) > 0);

// Safe CSV cell serializer for GST Offline Tool V3.2.4:
// Leaves normal numbers/strings unquoted ("OE,09-Uttar Pradesh,,5,2600.00,0.00,"),
// neutralizes spreadsheet formula injection on text cells, and quotes only when needed.
export function toGovtCsvCell(val) {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  let str = String(val).replace(/[\r\n\t]+/g, ' ').trim();
  if (!str) return '';
  // Guard non-numeric text starting with =, +, @ against CSV formula injection
  if (/^[=+@]/.test(str)) str = `'${str}`;
  if (str.includes(',') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toGovtCsvRow(cells = []) {
  return cells.map(toGovtCsvCell).join(',');
}

// Official GST Offline Tool CSV date format: dd-MMM-yyyy (e.g. "21-Nov-2026")
export function formatDateGovtCsv(dateStr) {
  if (!dateStr) return '';
  const d = parseLocalDate(dateStr);
  if (!d || Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mmm = MONTHS_SHORT[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd}-${mmm}-${yyyy}`;
}

// Resolves 2-digit GST Place of Supply code with complete fallback chain
export function resolveBillPosCode(bill, fallbackProfile = {}) {
  const details = bill?.data?.details;
  const client = bill?.data?.client;
  const prof = bill?.data?.profile;
  const candidates = [
    details?.placeOfSupply,
    client?.state,
    client?.gstin,
    prof?.state,
    prof?.gstin,
    fallbackProfile?.state,
    fallbackProfile?.gstin,
  ];
  for (const c of candidates) {
    const code = getStateCode(String(c || '').trim());
    if (code) return String(code).padStart(2, '0');
  }
  return '09';
}

// Formats Place Of Supply as "09-Uttar Pradesh"
export function formatGovtPos(posCodeOrState, fallbackName = '') {
  const raw = String(posCodeOrState || '').trim();
  if (/^\d{2}-.+/.test(raw)) return raw;
  const code = (/^\d{1,2}$/.test(raw) ? raw.padStart(2, '0') : getStateCode(raw)) || '09';
  const labeled = placeOfSupplyLabel(code);
  if (/^\d{2}-.+/.test(labeled)) return labeled;
  return `${code}-${fallbackName || 'Uttar Pradesh'}`;
}

// Formats UQC for GST Offline Tool V3.2.4 HSN CSV ("PCS-PIECES", "KGS-KILOGRAMS", "NA", "OTH-OTHERS").
// Note: GST Offline Tool V3.2.4 permits "NA" ONLY for Service SAC codes starting with "99";
// non-99 Goods HSN codes with blank/NA unit safely map to "OTH-OTHERS".
export function formatGovtUqc(uqc, hsn = '') {
  const cleanHsn = String(hsn || '').replace(/\D/g, '');
  if (/^99/.test(cleanHsn)) return 'NA';
  const raw = String(uqc || '').trim().toUpperCase();
  if (!raw || raw === 'NA') return 'OTH-OTHERS';
  const code = raw.split('-')[0].trim();
  return GOVT_UQC_MAP[code] || 'OTH-OTHERS';
}

// Maps internal b2bInvType ('R', 'SEWP', 'SEWOP', 'DE') to GST Offline Tool V3.2.4 CSV Invoice Type
export function formatGovtB2bInvoiceType(invTypCode) {
  switch (invTypCode) {
    case 'SEWP': return 'SEZ supplies with payment';
    case 'SEWOP': return 'SEZ supplies without payment';
    case 'DE': return 'Deemed Exp';
    default: return 'Regular B2B';
  }
}

const isTaxableBillItem = (bill, item) => lineTreatment({
  invoiceType: bill?.invoiceType || 'tax-invoice',
  isExport: isExportBill(bill),
  taxPercent: item?.taxPercent,
  gstTreatment: item?.gstTreatment,
}) === 'taxable';

// ============================================================================
// 1. Section 7 — B2C(Small) Details (`GSTR1_B2C_Small.csv`)
// Exact 7 headers required by GST Offline Tool V3.2.4
// ============================================================================
export const GOVT_B2CS_HEADERS = [
  'Type',
  'Place Of Supply',
  'Applicable % of Tax Rate',
  'Rate',
  'Taxable Value',
  'Cess Amount',
  'E-Commerce GSTIN',
];

export function buildGovtB2csRows(b2cSmallBills = [], unregSmallCreditNotes = [], fallbackProfile = {}) {
  const map = new Map();

  const accumulate = (bill, sign) => {
    const isInter = billIsInterstate(bill);
    const isIntraUT = !!bill?.data?.totals?.isIntraUT;
    const posCode = resolveBillPosCode(bill, fallbackProfile);
    const rawEco = cleanGstin(bill?.data?.details?.ecoGstin || '');
    const ecomGstin = rawEco.length === 15 ? rawEco : '';
    const type = ecomGstin ? 'E' : 'OE';

    for (const item of bill?.data?.items || []) {
      if (!isTaxableBillItem(bill, item)) continue;
      const rate = Number(item.taxPercent) || 0;
      const key = `${type}|${posCode}|${rate}|${ecomGstin}`;
      if (!map.has(key)) {
        map.set(key, {
          type,
          posCode,
          pos: formatGovtPos(posCode),
          rate,
          taxableValue: 0,
          cessAmount: 0,
          ecomGstin,
        });
      }
      const split = billSplit(bill, item, isInter, !!bill?.data?.taxInclusive, isIntraUT);
      const entry = map.get(key);
      entry.taxableValue += sign * split.taxable;
      entry.cessAmount += sign * split.cess;
    }
  };

  (b2cSmallBills || []).forEach((b) => accumulate(b, 1));
  (unregSmallCreditNotes || []).forEach((b) => accumulate(b, -1));

  return [...map.values()]
    .map((r) => ({
      ...r,
      taxableValue: round2(r.taxableValue),
      cessAmount: round2(r.cessAmount),
    }))
    .filter((r) => r.taxableValue !== 0 || r.cessAmount !== 0)
    .sort((a, b) => a.posCode.localeCompare(b.posCode) || a.rate - b.rate || a.type.localeCompare(b.type));
}

export function generateGovtGstr1B2csCsv(b2csRows = []) {
  const rows = [toGovtCsvRow(GOVT_B2CS_HEADERS)];

  (b2csRows || []).forEach((item) => {
    const pos = item.pos
      ? formatGovtPos(item.pos)
      : formatGovtPos(item.posCode || '09', item.posName || 'Uttar Pradesh');
    const ecomGstin = cleanGstin(item.ecomGstin || '');
    const validEco = ecomGstin.length === 15 ? ecomGstin : '';
    const type = item.type === 'E' || validEco ? 'E' : 'OE';

    rows.push(toGovtCsvRow([
      type,                                       // "OE" = Other than E-Commerce, "E" = E-Commerce
      pos,                                        // "09-Uttar Pradesh"
      item.applicableTaxRatePercent || '',        // Blank unless 65% concessional rate applies
      Number(item.rate ?? item.rt ?? 0),          // Pure number: 5, 12, 18, 28 (never "5%")
      Number(item.taxableValue ?? item.txval ?? 0).toFixed(2),
      Number(item.cessAmount ?? item.csamt ?? 0).toFixed(2),
      validEco,
    ]));
  });

  return rows.join('\r\n');
}

// ============================================================================
// 2. Section 12 — HSN-wise Summary (`GSTR1_HSN_B2B.csv` / `GSTR1_HSN_B2C.csv`)
// Exact 11 headers required by GST Offline Tool V3.2.4
// ============================================================================
export const GOVT_HSN_HEADERS = [
  'HSN',
  'Description',
  'UQC',
  'Total Quantity',
  'Total Value',
  'Rate',
  'Taxable Value',
  'Integrated Tax Amount',
  'Central Tax Amount',
  'State/UT Tax Amount',
  'Cess Amount',
];

export function generateGovtGstr1HsnCsv(hsnRows = []) {
  const rows = [toGovtCsvRow(GOVT_HSN_HEADERS)];

  (hsnRows || []).forEach((r) => {
    const rawHsn = String(r.hsn_sc ?? r.hsn ?? '').trim();
    const digitsOnly = rawHsn.replace(/\D/g, '');
    const hsn = digitsOnly || rawHsn;
    if (!hsn) return;

    const rawDesc = String(r.desc ?? r.description ?? '')
      .replace(/[,;"'\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, HSN_DESC_MAX);
    const cleanDesc = rawDesc || (/^99/.test(hsn) ? 'Services' : 'Goods');

    const uqc = formatGovtUqc(r.uqc, hsn);
    const qty = uqc === 'NA' ? '0' : Number(r.qty ?? r.quantity ?? 0).toFixed(2);
    const txval = round2(r.txval ?? r.taxableValue ?? 0);
    const iamt = round2(r.iamt ?? r.igst ?? 0);
    const camt = round2(r.camt ?? r.cgst ?? 0);
    const samt = round2(r.samt ?? r.sgst ?? 0);
    const csamt = round2(r.csamt ?? r.cess ?? 0);
    const totalVal = r.totalValue !== undefined ? round2(r.totalValue) : hsnRowValue({ txval, iamt, camt, samt, csamt });

    rows.push(toGovtCsvRow([
      hsn,
      cleanDesc,
      uqc,
      qty,
      totalVal.toFixed(2),
      Number(r.rt ?? r.rate ?? 0),
      txval.toFixed(2),
      iamt.toFixed(2),
      camt.toFixed(2),
      samt.toFixed(2),
      csamt.toFixed(2),
    ]));
  });

  return rows.join('\r\n');
}

// ============================================================================
// 3. Section 4A, 4B, 6B, 6C — B2B, SEZ, DE Invoices (`GSTR1_B2B_Invoices.csv`)
// Exact 13 headers required by GST Offline Tool V3.2.4 (one row per rate slab)
// ============================================================================
export const GOVT_B2B_HEADERS = [
  'GSTIN/UIN of Recipient',
  'Receiver Name',
  'Invoice Number',
  'Invoice date',
  'Invoice Value',
  'Place Of Supply',
  'Reverse Charge',
  'Applicable % of Tax Rate',
  'Invoice Type',
  'E-Commerce GSTIN',
  'Rate',
  'Taxable Value',
  'Cess Amount',
];

export function generateGovtGstr1B2bCsv(b2bBills = [], fallbackProfile = {}) {
  const rows = [toGovtCsvRow(GOVT_B2B_HEADERS)];

  (b2bBills || []).forEach((bill) => {
    const client = bill?.data?.client || {};
    const totals = bill?.data?.totals || {};
    const gstin = cleanGstin(client.gstin || '');
    const receiverName = client.name || bill?.clientName || '';
    const isInter = billIsInterstate(bill);
    const isIntraUT = !!totals.isIntraUT;
    const isRcm = !!bill?.data?.invoiceOptions?.reverseCharge;
    const pos = formatGovtPos(resolveBillPosCode(bill, fallbackProfile));
    const invTypeCode = b2bInvType({
      deemedExport: !!client.isDeemedExport,
      rcm: isRcm,
      sez: !!client.isSEZ,
      lut: billIsLut(bill),
    });
    const invTypeLabel = formatGovtB2bInvoiceType(invTypeCode);
    const rawEco = cleanGstin(bill?.data?.details?.ecoGstin || '');
    const ecomGstin = rawEco.length === 15 ? rawEco : '';

    const rateMap = new Map();
    for (const item of bill?.data?.items || []) {
      if (!isTaxableBillItem(bill, item)) continue;
      const rate = Number(item.taxPercent) || 0;
      if (!rateMap.has(rate)) rateMap.set(rate, { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 });
      const split = billSplit(bill, item, isInter, !!bill?.data?.taxInclusive, isIntraUT);
      const slot = rateMap.get(rate);
      slot.txval += split.taxable;
      slot.iamt += split.igst;
      slot.camt += split.cgst;
      slot.samt += split.sgst + split.utgst;
      slot.csamt += split.cess;
    }

    if (!rateMap.size) return;

    const rateTotal = [...rateMap.values()].reduce((s, d) => s + d.txval + d.iamt + d.camt + d.samt + d.csamt, 0);
    const invVal = isRcm ? round2(rateTotal) : round2((totals.total || 0) - (totals.roundOff || 0));

    for (const [rate, d] of [...rateMap.entries()].sort((a, b) => a[0] - b[0])) {
      rows.push(toGovtCsvRow([
        gstin,
        receiverName,
        String(bill?.invoiceNumber || '').trim().slice(0, 16),
        formatDateGovtCsv(bill?.invoiceDate),
        invVal.toFixed(2),
        pos,
        isRcm ? 'Y' : 'N',
        '',
        invTypeLabel,
        ecomGstin,
        rate,
        round2(d.txval).toFixed(2),
        round2(d.csamt).toFixed(2),
      ]));
    }
  });

  return rows.join('\r\n');
}

// ============================================================================
// 4. Section 5A — B2C(Large) Invoices (`GSTR1_B2C_Large.csv`)
// Exact 9 headers required by GST Offline Tool V3.2.4
// ============================================================================
export const GOVT_B2CL_HEADERS = [
  'Invoice Number',
  'Invoice date',
  'Invoice Value',
  'Place Of Supply',
  'Applicable % of Tax Rate',
  'Rate',
  'Taxable Value',
  'Cess Amount',
  'E-Commerce GSTIN',
];

export function generateGovtGstr1B2clCsv(b2clBills = [], fallbackProfile = {}) {
  const rows = [toGovtCsvRow(GOVT_B2CL_HEADERS)];

  (b2clBills || []).forEach((bill) => {
    const totals = bill?.data?.totals || {};
    const pos = formatGovtPos(resolveBillPosCode(bill, fallbackProfile));
    const rawEco = cleanGstin(bill?.data?.details?.ecoGstin || '');
    const ecomGstin = rawEco.length === 15 ? rawEco : '';
    const invVal = round2((totals.total || 0) - (totals.roundOff || 0));

    const rateMap = new Map();
    for (const item of bill?.data?.items || []) {
      if (!isTaxableBillItem(bill, item)) continue;
      const rate = Number(item.taxPercent) || 0;
      if (!rateMap.has(rate)) rateMap.set(rate, { txval: 0, csamt: 0 });
      const split = billSplit(bill, item, true, !!bill?.data?.taxInclusive, false);
      const slot = rateMap.get(rate);
      slot.txval += split.taxable;
      slot.csamt += split.cess;
    }

    for (const [rate, d] of [...rateMap.entries()].sort((a, b) => a[0] - b[0])) {
      rows.push(toGovtCsvRow([
        String(bill?.invoiceNumber || '').trim().slice(0, 16),
        formatDateGovtCsv(bill?.invoiceDate),
        invVal.toFixed(2),
        pos,
        '',
        rate,
        round2(d.txval).toFixed(2),
        round2(d.csamt).toFixed(2),
        ecomGstin,
      ]));
    }
  });

  return rows.join('\r\n');
}

// ============================================================================
// 5. Section 9B — Credit/Debit Notes Registered (`GSTR1_CDNR.csv`)
// Exact 13 headers required by GST Offline Tool V3.2.4
// ============================================================================
export const GOVT_CDNR_HEADERS = [
  'GSTIN/UIN of Recipient',
  'Receiver Name',
  'Note Number',
  'Note Date',
  'Note Type',
  'Place Of Supply',
  'Reverse Charge',
  'Note Supply Type',
  'Note Value',
  'Applicable % of Tax Rate',
  'Rate',
  'Taxable Value',
  'Cess Amount',
];

export function generateGovtGstr1CdnrCsv(cdnrBills = [], fallbackProfile = {}) {
  const rows = [toGovtCsvRow(GOVT_CDNR_HEADERS)];

  (cdnrBills || []).forEach((bill) => {
    const client = bill?.data?.client || {};
    const totals = bill?.data?.totals || {};
    const gstin = cleanGstin(client.gstin || '');
    const receiverName = client.name || bill?.clientName || '';
    const isInter = billIsInterstate(bill);
    const isIntraUT = !!totals.isIntraUT;
    const isRcm = !!bill?.data?.invoiceOptions?.reverseCharge;
    const pos = formatGovtPos(resolveBillPosCode(bill, fallbackProfile));
    const invTypeCode = b2bInvType({
      deemedExport: !!client.isDeemedExport,
      rcm: isRcm,
      sez: !!client.isSEZ,
      lut: billIsLut(bill),
    });
    const noteSupplyType = formatGovtB2bInvoiceType(invTypeCode);
    const noteVal = round2((totals.total || 0) - (totals.roundOff || 0));

    const rateMap = new Map();
    for (const item of bill?.data?.items || []) {
      if (!isTaxableBillItem(bill, item)) continue;
      const rate = Number(item.taxPercent) || 0;
      if (!rateMap.has(rate)) rateMap.set(rate, { txval: 0, csamt: 0 });
      const split = billSplit(bill, item, isInter, !!bill?.data?.taxInclusive, isIntraUT);
      const slot = rateMap.get(rate);
      slot.txval += split.taxable;
      slot.csamt += split.cess;
    }

    for (const [rate, d] of [...rateMap.entries()].sort((a, b) => a[0] - b[0])) {
      rows.push(toGovtCsvRow([
        gstin,
        receiverName,
        String(bill?.invoiceNumber || '').trim().slice(0, 16),
        formatDateGovtCsv(bill?.invoiceDate),
        'C',
        pos,
        isRcm ? 'Y' : 'N',
        noteSupplyType,
        noteVal.toFixed(2),
        '',
        rate,
        round2(d.txval).toFixed(2),
        round2(d.csamt).toFixed(2),
      ]));
    }
  });

  return rows.join('\r\n');
}

// ============================================================================
// 6. Section 9B — Credit/Debit Notes Unregistered (`GSTR1_CDNUR.csv`)
// Exact 10 headers required by GST Offline Tool V3.2.4 (B2CL / EXPWP / EXPWOP)
// ============================================================================
export const GOVT_CDNUR_HEADERS = [
  'UR Type',
  'Note Number',
  'Note Date',
  'Note Type',
  'Place Of Supply',
  'Note Value',
  'Applicable % of Tax Rate',
  'Rate',
  'Taxable Value',
  'Cess Amount',
];

export function generateGovtGstr1CdnurCsv(cdnurBills = [], fallbackProfile = {}) {
  const rows = [toGovtCsvRow(GOVT_CDNUR_HEADERS)];

  (cdnurBills || []).forEach((bill) => {
    const totals = bill?.data?.totals || {};
    const isExp = isExportBill(bill);
    const wopay = !!totals.lutZeroRated || billIsLut(bill);
    const urType = isExp ? (wopay ? 'EXPWOP' : 'EXPWP') : 'B2CL';
    const pos = isExp ? '' : formatGovtPos(resolveBillPosCode(bill, fallbackProfile));
    const noteVal = round2((totals.total || 0) - (totals.roundOff || 0));

    const rateMap = new Map();
    for (const item of bill?.data?.items || []) {
      if (!isExp && !isTaxableBillItem(bill, item)) continue;
      const rate = isExp && wopay ? 0 : (Number(item.taxPercent) || 0);
      if (!rateMap.has(rate)) rateMap.set(rate, { txval: 0, csamt: 0 });
      const split = billSplit(bill, item, true, !!bill?.data?.taxInclusive, false);
      const slot = rateMap.get(rate);
      slot.txval += split.taxable;
      slot.csamt += split.cess;
    }

    for (const [rate, d] of [...rateMap.entries()].sort((a, b) => a[0] - b[0])) {
      rows.push(toGovtCsvRow([
        urType,
        String(bill?.invoiceNumber || '').trim().slice(0, 16),
        formatDateGovtCsv(bill?.invoiceDate),
        'C',
        pos,
        noteVal.toFixed(2),
        '',
        rate,
        round2(d.txval).toFixed(2),
        round2(d.csamt).toFixed(2),
      ]));
    }
  });

  return rows.join('\r\n');
}

// ============================================================================
// 7. Section 6A — Exports Invoices (`GSTR1_Exports_6A.csv`)
// Exact 10 headers required by GST Offline Tool V3.2.4
// ============================================================================
export const GOVT_EXP_HEADERS = [
  'Export Type',
  'Invoice Number',
  'Invoice date',
  'Invoice Value',
  'Port Code',
  'Shipping Bill Number',
  'Shipping Bill Date',
  'Rate',
  'Taxable Value',
  'Cess Amount',
];

export function generateGovtGstr1ExpCsv(expBills = []) {
  const rows = [toGovtCsvRow(GOVT_EXP_HEADERS)];

  (expBills || []).forEach((bill) => {
    if (bill?.fxMissing) return;
    const totals = bill?.data?.totals || {};
    const details = bill?.data?.details || {};
    const wopay = !!totals.lutZeroRated || billIsLut(bill);
    const expType = wopay ? 'WOPAY' : 'WPAY';
    const invVal = round2((totals.total || 0) - (totals.roundOff || 0));
    const portCode = String(details.portCode || '').trim().slice(0, 6);
    const sbNum = String(details.shippingBillNo || '').trim().slice(0, 7);
    const sbDate = details.shippingBillDate ? formatDateGovtCsv(details.shippingBillDate) : '';

    const rateMap = new Map();
    for (const item of bill?.data?.items || []) {
      const rate = wopay ? 0 : (Number(item.taxPercent) || 0);
      if (!rateMap.has(rate)) rateMap.set(rate, { txval: 0, csamt: 0 });
      const split = billSplit(bill, item, true, !!bill?.data?.taxInclusive, false);
      const slot = rateMap.get(rate);
      slot.txval += split.taxable;
      slot.csamt += split.cess;
    }

    for (const [rate, d] of [...rateMap.entries()].sort((a, b) => a[0] - b[0])) {
      rows.push(toGovtCsvRow([
        expType,
        String(bill?.invoiceNumber || '').trim().slice(0, 16),
        formatDateGovtCsv(bill?.invoiceDate),
        invVal.toFixed(2),
        portCode,
        sbNum,
        sbDate,
        rate,
        round2(d.txval).toFixed(2),
        round2(d.csamt).toFixed(2),
      ]));
    }
  });

  return rows.join('\r\n');
}

// ============================================================================
// 8. Section 13 — Documents Issued (`GSTR1_Doc_Summary.csv`)
// Exact 5 headers & Nature of Document strings required by GST Offline Tool V3.2.4
// ============================================================================
export const GOVT_DOCS_HEADERS = [
  'Nature of Document',
  'Sr. No. From',
  'Sr. No. To',
  'Total Number',
  'Cancelled',
];

const GOVT_DOC_NATURE_LABELS = {
  1: 'Invoices for outward supply',
  4: 'Debit Note',
  5: 'Credit Note',
  12: 'Delivery Challan in cases other than by way of supply (excluding at S no. 9 to 11)',
};

export function generateGovtGstr1DocsCsv(docSummary = {}) {
  const rows = [toGovtCsvRow(GOVT_DOCS_HEADERS)];

  Object.values(docSummary || {}).forEach((d) => {
    const natureLabel = GOVT_DOC_NATURE_LABELS[d.nature] || d.type || 'Invoices for outward supply';
    rows.push(toGovtCsvRow([
      natureLabel,
      d.from || '',
      d.to || '',
      Number(d.total || 0),
      Number(d.cancelled || 0),
    ]));
  });

  return rows.join('\r\n');
}

// ============================================================================
// 9. Section 8 — Nil Rated, Exempted & Non-GST (`GSTR1_Exemp_Nil_NonGST.csv`)
// Exact 4 headers & 4 description rows required by GST Offline Tool V3.2.4
// ============================================================================
export const GOVT_EXEMP_HEADERS = [
  'Description',
  'Nil Rated Supplies',
  'Exempted(other than nil rated/non GST supply)',
  'Non-GST Supplies',
];

const GOVT_EXEMP_DESCRIPTIONS = {
  INTRB2B: 'Inter-State supplies to registered persons',
  INTRAB2B: 'Intra-State supplies to registered persons',
  INTRB2C: 'Inter-State supplies to unregistered persons',
  INTRAB2C: 'Intra-State supplies to unregistered persons',
};

export function generateGovtGstr1ExempCsv(nilRows = []) {
  const rows = [toGovtCsvRow(GOVT_EXEMP_HEADERS)];
  const tbl = nilTable(nilRows);
  const byType = new Map((tbl?.inv || []).map((r) => [r.sply_ty, r]));

  for (const [splyTy, desc] of Object.entries(GOVT_EXEMP_DESCRIPTIONS)) {
    const rec = byType.get(splyTy) || { nil_amt: 0, expt_amt: 0, ngsup_amt: 0 };
    rows.push(toGovtCsvRow([
      desc,
      Number(rec.nil_amt || 0).toFixed(2),
      Number(rec.expt_amt || 0).toFixed(2),
      Number(rec.ngsup_amt || 0).toFixed(2),
    ]));
  }

  return rows.join('\r\n');
}
