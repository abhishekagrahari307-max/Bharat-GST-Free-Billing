// v5.5.2 — Government GST Offline Tool V3.2.4 CSV Specification Tests
import assert from 'node:assert/strict';
import {
  GOVT_B2CS_HEADERS,
  GOVT_HSN_HEADERS,
  GOVT_B2B_HEADERS,
  GOVT_B2CL_HEADERS,
  GOVT_CDNR_HEADERS,
  GOVT_CDNUR_HEADERS,
  GOVT_EXP_HEADERS,
  GOVT_DOCS_HEADERS,
  GOVT_EXEMP_HEADERS,
  buildGovtB2csRows,
  generateGovtGstr1B2csCsv,
  generateGovtGstr1HsnCsv,
  generateGovtGstr1B2bCsv,
  generateGovtGstr1B2clCsv,
  generateGovtGstr1CdnrCsv,
  generateGovtGstr1CdnurCsv,
  generateGovtGstr1ExpCsv,
  generateGovtGstr1DocsCsv,
  generateGovtGstr1ExempCsv,
  formatGovtUqc,
  formatDateGovtCsv,
} from '../src/utils/gstExport.js';
import { docIssueSummary, hsnSummary } from '../src/utils/gstr1Json.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${passed}. ${name}`);
}

console.log('Running v5.5.2 Government GST Offline Tool V3.2.4 CSV Tests…');

test('B2CS (Table 7) CSV matches exact 7 headers & exact ₹2,600 @ 5% UP format required by GST Offline Tool V3.2.4', () => {
  assert.deepEqual(GOVT_B2CS_HEADERS, [
    'Type',
    'Place Of Supply',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
    'E-Commerce GSTIN',
  ]);

  const csvDirect = generateGovtGstr1B2csCsv([
    { posCode: '09', posName: 'Uttar Pradesh', rate: 5, taxableValue: 2600, cessAmount: 0 },
  ]);
  assert.equal(
    csvDirect,
    'Type,Place Of Supply,Applicable % of Tax Rate,Rate,Taxable Value,Cess Amount,E-Commerce GSTIN\r\nOE,09-Uttar Pradesh,,5,2600.00,0.00,'
  );

  // Also test end-to-end from a real B2C Small invoice (2.5% CGST + 2.5% SGST = 5%, ₹2,600 subtotal)
  const upProfile = { state: 'Uttar Pradesh', gstin: '09ABCDE1234F1Z5', country: 'India' };
  const b2cBill = {
    invoiceNumber: 'INV/001',
    invoiceDate: '2026-11-21',
    invoiceType: 'tax-invoice',
    totalAmount: 2730,
    data: {
      profile: upProfile,
      client: { name: 'Walk-In Customer', state: 'Uttar Pradesh' },
      details: { placeOfSupply: 'Uttar Pradesh' },
      items: [{ name: 'Basmati Rice', hsn: '1006', unit: 'Kg', quantity: 26, rate: 100, taxPercent: 5 }],
      totals: { isInterstate: false, taxableAmount: 2600, cgst: 65, sgst: 65, igst: 0, cess: 0, total: 2730 },
    },
  };
  const b2csRows = buildGovtB2csRows([b2cBill], [], upProfile);
  assert.equal(
    generateGovtGstr1B2csCsv(b2csRows),
    'Type,Place Of Supply,Applicable % of Tax Rate,Rate,Taxable Value,Cess Amount,E-Commerce GSTIN\r\nOE,09-Uttar Pradesh,,5,2600.00,0.00,'
  );
});

test('HSN (Table 12) CSV outputs exact 11 headers, CODE-NAME UQC ("KGS-KILOGRAMS", "PCS-PIECES", "NA") & max 30-char description', () => {
  assert.deepEqual(GOVT_HSN_HEADERS, [
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
  ]);
  assert.equal(formatGovtUqc('PCS', '4802'), 'PCS-PIECES');
  assert.equal(formatGovtUqc('KGS', '1006'), 'KGS-KILOGRAMS');
  assert.equal(formatGovtUqc('NOS', '998314'), 'NA');
  assert.equal(formatGovtUqc('HRS', '8471'), 'OTH-OTHERS');

  const upProfile = { state: 'Uttar Pradesh', country: 'India' };
  const b2cBill = {
    invoiceNumber: 'INV/001',
    invoiceType: 'tax-invoice',
    data: {
      profile: upProfile,
      client: { name: 'Walk-In', state: 'Uttar Pradesh' },
      details: { placeOfSupply: 'Uttar Pradesh' },
      items: [
        { name: 'Premium Extra Long Grain Basmati Rice 25Kg Pack', hsn: '1006.30', unit: 'Kg', quantity: 26, rate: 100, taxPercent: 5 },
        { name: 'IT Consulting Service', hsn: '998314', unit: 'Hrs', quantity: 2, rate: 500, taxPercent: 18 },
      ],
      totals: { isInterstate: false },
    },
  };
  const { rows } = hsnSummary([b2cBill]);
  const csv = generateGovtGstr1HsnCsv(rows);
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '100630,Premium Extra Long Grain Basma,KGS-KILOGRAMS,26.00,2730.00,5,2600.00,0.00,65.00,65.00,0.00');
  assert.equal(lines[2], '998314,IT Consulting Service,NA,0,1180.00,18,1000.00,0.00,90.00,90.00,0.00');
});

test('B2B (Table 4) CSV outputs exact 13 headers, dd-MMM-yyyy date, Regular B2B & one row per tax slab', () => {
  assert.equal(GOVT_B2B_HEADERS.length, 13);
  assert.equal(formatDateGovtCsv('2026-11-21'), '21-Nov-2026');

  const upProfile = { state: 'Uttar Pradesh', gstin: '09ABCDE1234F1Z5', country: 'India' };
  const b2bBill = {
    invoiceNumber: 'INV/2026/05',
    invoiceDate: '2026-11-21',
    invoiceType: 'tax-invoice',
    data: {
      profile: upProfile,
      client: { name: 'Sharma Traders', gstin: '09AAACR5055K1Z1', state: 'Uttar Pradesh' },
      details: { placeOfSupply: 'Uttar Pradesh' },
      items: [
        { name: 'Item 5%', hsn: '1006', quantity: 10, rate: 100, taxPercent: 5 },
        { name: 'Item 18%', hsn: '8471', quantity: 1, rate: 2000, taxPercent: 18 },
      ],
      totals: { isInterstate: false, total: 3410, roundOff: 0 },
    },
  };
  const csv = generateGovtGstr1B2bCsv([b2bBill], upProfile);
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '09AAACR5055K1Z1,Sharma Traders,INV/2026/05,21-Nov-2026,3410.00,09-Uttar Pradesh,N,,Regular B2B,,5,1000.00,0.00');
  assert.equal(lines[2], '09AAACR5055K1Z1,Sharma Traders,INV/2026/05,21-Nov-2026,3410.00,09-Uttar Pradesh,N,,Regular B2B,,18,2000.00,0.00');
});

test('B2CL (Table 5A), CDNR/CDNUR (Table 9B), EXP (Table 6A), DOCS (Table 13) & EXEMP (Table 8) match exact Offline Tool V3.2.4 headers', () => {
  assert.equal(GOVT_B2CL_HEADERS.length, 9);
  assert.equal(GOVT_CDNR_HEADERS.length, 13);
  assert.equal(GOVT_CDNUR_HEADERS.length, 10);
  assert.equal(GOVT_EXP_HEADERS.length, 10);
  assert.equal(GOVT_DOCS_HEADERS.length, 5);
  assert.equal(GOVT_EXEMP_HEADERS.length, 4);

  const b2clCsv = generateGovtGstr1B2clCsv([{
    invoiceNumber: 'INV/L1',
    invoiceDate: '2026-11-21',
    invoiceType: 'tax-invoice',
    data: {
      client: { name: 'Mumbai Buyer', state: 'Maharashtra' },
      details: { placeOfSupply: 'Maharashtra' },
      items: [{ name: 'Server', quantity: 1, rate: 150000, taxPercent: 18 }],
      totals: { isInterstate: true, total: 177000, roundOff: 0 },
    },
  }]);
  assert.equal(b2clCsv.split('\r\n')[1], 'INV/L1,21-Nov-2026,177000.00,27-Maharashtra,,18,150000.00,0.00,');

  const cdnrCsv = generateGovtGstr1CdnrCsv([{
    invoiceNumber: 'CN/01',
    invoiceDate: '2026-11-21',
    invoiceType: 'credit-note',
    data: {
      client: { name: 'Sharma Traders', gstin: '09AAACR5055K1Z1', state: 'Uttar Pradesh' },
      details: { placeOfSupply: 'Uttar Pradesh' },
      items: [{ name: 'Return', quantity: 1, rate: 1000, taxPercent: 18 }],
      totals: { isInterstate: false, total: 1180, roundOff: 0 },
    },
  }]);
  assert.equal(cdnrCsv.split('\r\n')[1], '09AAACR5055K1Z1,Sharma Traders,CN/01,21-Nov-2026,C,09-Uttar Pradesh,N,Regular B2B,1180.00,,18,1000.00,0.00');

  const cdnurCsv = generateGovtGstr1CdnurCsv([{
    invoiceNumber: 'CN/UR1',
    invoiceDate: '2026-11-21',
    invoiceType: 'credit-note',
    data: {
      client: { name: 'Big Buyer', state: 'Maharashtra' },
      details: { placeOfSupply: 'Maharashtra' },
      items: [{ name: 'Return', quantity: 1, rate: 120000, taxPercent: 18 }],
      totals: { isInterstate: true, total: 141600, roundOff: 0 },
    },
  }]);
  assert.equal(cdnurCsv.split('\r\n')[1], 'B2CL,CN/UR1,21-Nov-2026,C,27-Maharashtra,141600.00,,18,120000.00,0.00');

  const expCsv = generateGovtGstr1ExpCsv([{
    invoiceNumber: 'EXP/01',
    invoiceDate: '2026-11-21',
    invoiceType: 'tax-invoice',
    data: {
      profile: { country: 'India', state: 'Uttar Pradesh' },
      client: { name: 'Global Corp', country: 'United States' },
      details: {},
      items: [{ name: 'SaaS Export', quantity: 1, rate: 50000, taxPercent: 18 }],
      totals: { isInterstate: true, lutZeroRated: true, total: 50000, roundOff: 0 },
    },
  }]);
  assert.equal(expCsv.split('\r\n')[1], 'WOPAY,EXP/01,21-Nov-2026,50000.00,,,,0,50000.00,0.00');

  const docs = docIssueSummary([
    { invoiceNumber: 'INV/1', invoiceType: 'tax-invoice', status: 'paid' },
    { invoiceNumber: 'INV/2', invoiceType: 'tax-invoice', status: 'cancelled' },
    { invoiceNumber: 'CN/1', invoiceType: 'credit-note', status: 'paid' },
  ]);
  const docsCsv = generateGovtGstr1DocsCsv(docs);
  assert.equal(docsCsv.split('\r\n')[1], 'Invoices for outward supply,INV/1,INV/2,2,1');
  assert.equal(docsCsv.split('\r\n')[2], 'Credit Note,CN/1,CN/1,1,0');

  const exempCsv = generateGovtGstr1ExempCsv([{ interstate: false, b2b: false, treatment: 'exempt', txval: 1500 }]);
  assert.equal(exempCsv.split('\r\n')[4], 'Intra-State supplies to unregistered persons,0.00,1500.00,0.00');
});

console.log(`v5.5.2 Govt GST Offline Tool V3.2.4 CSV Tests: ${passed} passed, 0 failed`);
