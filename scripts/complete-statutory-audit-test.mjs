import assert from 'node:assert/strict';
import {
  computeInvoiceTotals,
  generateEWayBillJSON,
  validateIndianVehicleNo,
  formatSellerLicenses,
  numberToWords,
} from '../src/utils.js';
import {
  buildGovtB2csRows,
  generateGovtGstr1B2bCsv,
  generateGovtGstr1B2csCsv,
  generateGovtGstr1B2clCsv,
  generateGovtGstr1CdnrCsv,
  generateGovtGstr1HsnCsv,
  generateGovtGstr1ExempCsv,
  generateGovtGstr1DocsCsv,
  computeGstSec51TdsBreakdown,
  computeGstTdsTcsSummary,
  reconcileGstr1And3bSummary,
} from '../src/utils/gstExport.js';
import {
  hsnSummary,
  mergeHsnRows,
  docIssueSummary,
} from '../src/utils/gstr1Json.js';
import { auditInvoicesForGst } from '../src/utils/gstAudit.js';
import { reconcileGstr2bFuzzy } from '../src/utils/fuzzyGstr2b.js';
import {
  compute44AD,
  computeAdvanceTaxSchedule,
  compareRegimes,
} from '../src/utils/itr.js';
import {
  computeBusinessITR,
  auditSection40A3Disallowance,
  auditSection269STViolations,
  computeDigitalVsCashTurnover,
  parseAISJson,
  reconcileGstr1VsItrAndAis,
} from '../src/utils/itrAndTaxEngine.js';
import {
  deriveAutoJournalEntries,
  computeTrialBalance,
  computeBalanceSheet,
  computeInventoryValuation,
  computeTradingAndProfitLoss,
} from '../src/utils/doubleEntry.js';
import { checkSection43BCompliance } from '../src/utils/autonomousMunimAnd43B.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log('Running v5.5.5 Complete A-to-Z Statutory Master Audit Suite (M/s Abhinav Grain Store — AY 2027-28 / FY 2026-27)...');

const ABHINAV_PROFILE = {
  businessName: 'M/s Abhinav Grain Store',
  gstin: '09CVCPK6544C1ZN',
  pan: 'CVCPK6544C',
  mandiLicense: 'L/2024/130/23005441',
  fssaiNo: '12724055000987',
  udyamNo: 'UDYAM-UP-09-0011223',
  address: 'Mandi Samiti Complex, Khalilabad',
  city: 'Sant Kabir Nagar',
  state: 'Uttar Pradesh',
  pin: '272162',
  country: 'India',
  phone: '9876543210',
};

// Helper to build a realistic saved invoice matching store.js + InvoiceGenerator.jsx
function makeBill({
  id,
  invoiceNumber,
  invoiceDate,
  invoiceType = 'tax-invoice',
  client,
  items,
  details = {},
  paymentStatus = 'paid',
  paymentMode = 'bank-transfer',
  payments = [],
}) {
  const showGST = invoiceType !== 'bill-of-supply' && invoiceType !== 'delivery-challan';
  const totals = computeInvoiceTotals({
    items,
    client,
    profile: ABHINAV_PROFILE,
    details: { invoiceNumber, invoiceDate, ...details },
    showGST,
    taxInclusive: false,
  });
  return {
    id,
    invoiceNumber,
    invoiceDate,
    invoiceType,
    clientName: client.name,
    ownerGstin: ABHINAV_PROFILE.gstin,
    total: totals.total,
    totalAmount: totals.total,
    totalTaxAmount: totals.totalTaxAmount,
    paymentStatus,
    status: paymentStatus,
    paymentMode,
    payments,
    data: {
      invoiceType,
      profile: ABHINAV_PROFILE,
      client,
      details: { invoiceNumber, invoiceDate, ...details },
      items,
      totals,
      invoiceOptions: { invoiceMode: 'goods' },
    },
  };
}

// ============================================================================
// SECTION 1: GST RETURNS, E-WAY BILL, GSTR-2B & GST TDS/TCS
// ============================================================================
test('1. GSTR-1 (CSV & JSON V3.2.4) + Self-GSTIN (09CVCPK6544C1ZN) Block + HSN vs B2B+B2C ₹0.00 Tie-Out', () => {
  const b2bUpBill = makeBill({
    id: 'b1',
    invoiceNumber: 'AGS/26-27/0001',
    invoiceDate: '2026-11-05',
    client: { name: 'Gorakhpur Agro Traders', gstin: '09AABCU9603R1ZM', state: 'Uttar Pradesh', pin: '273001' },
    items: [
      { name: 'Basmati Rice Branded 25Kg', hsn: '100630', quantity: 100, unit: 'Kgs', rate: 800, taxPercent: 5 },
    ],
  });
  const b2csBill = makeBill({
    id: 'b2',
    invoiceNumber: 'AGS/26-27/0002',
    invoiceDate: '2026-11-08',
    paymentMode: 'cash',
    client: { name: 'Ramesh Retail Kirana', gstin: '', state: 'Uttar Pradesh', pin: '272175' },
    items: [
      { name: 'Refined Mustard Oil Tin', hsn: '151490', quantity: 20, unit: 'Pcs', rate: 1500, taxPercent: 5 },
    ],
  });
  const b2clBill = makeBill({
    id: 'b3',
    invoiceNumber: 'AGS/26-27/0003',
    invoiceDate: '2026-11-10',
    client: { name: 'Patna Wholesale Bhandar', gstin: '', state: 'Bihar', pin: '800001' },
    items: [
      { name: 'Premium Wheat Sharbati Pack', hsn: '100199', quantity: 250, unit: 'Kgs', rate: 600, taxPercent: 5 },
    ],
  });
  const cdnrBill = makeBill({
    id: 'b4',
    invoiceNumber: 'CN/26-27/0001',
    invoiceDate: '2026-11-12',
    invoiceType: 'credit-note',
    client: { name: 'Gorakhpur Agro Traders', gstin: '09AABCU9603R1ZM', state: 'Uttar Pradesh', pin: '273001' },
    details: { originalInvoiceRef: 'AGS/26-27/0001' },
    items: [
      { name: 'Basmati Rice Branded 25Kg', hsn: '100630', quantity: 10, unit: 'Kgs', rate: 800, taxPercent: 5 },
    ],
  });

  const periodBills = [b2bUpBill, b2csBill, b2clBill, cdnrBill];

  // Verify V3.2.4 CSV formats: dd-MMM-yyyy dates, KGS-KILOGRAMS / PCS-PIECES UQC
  const b2bCsv = generateGovtGstr1B2bCsv([b2bUpBill], ABHINAV_PROFILE);
  assert.ok(b2bCsv.includes('05-Nov-2026'), 'B2B CSV formats date as dd-MMM-yyyy');
  assert.ok(b2bCsv.includes('09-Uttar Pradesh'), 'B2B CSV formats POS as 09-Uttar Pradesh');

  const b2csRows = buildGovtB2csRows([b2csBill], [], ABHINAV_PROFILE);
  const b2csCsv = generateGovtGstr1B2csCsv(b2csRows);
  assert.ok(b2csCsv.includes('OE,09-Uttar Pradesh,,5,30000.00,0.00,'), 'B2CS CSV matches exact 7-column V3.2.4 spec');

  const b2clCsv = generateGovtGstr1B2clCsv([b2clBill], ABHINAV_PROFILE);
  assert.ok(b2clCsv.includes('10-Bihar'), 'B2CL CSV includes interstate >1L unregistered supply');

  const cdnrCsv = generateGovtGstr1CdnrCsv([cdnrBill], ABHINAV_PROFILE);
  assert.ok(cdnrCsv.includes('CN/26-27/0001,12-Nov-2026,C'), 'CDNR CSV includes registered Credit Note');

  const mergedHsn = mergeHsnRows(hsnSummary(periodBills).rows);
  const hsnCsv = generateGovtGstr1HsnCsv(mergedHsn);
  assert.ok(hsnCsv.includes('KGS-KILOGRAMS'), 'HSN CSV uses V3.2.4 KGS-KILOGRAMS UQC');
  assert.ok(hsnCsv.includes('PCS-PIECES'), 'HSN CSV uses V3.2.4 PCS-PIECES UQC');

  const exempCsv = generateGovtGstr1ExempCsv([]);
  assert.equal(exempCsv.split('\r\n').length, 5, 'Table 8 Exemp CSV has header + 4 statutory supply rows');

  const docsCsv = generateGovtGstr1DocsCsv(docIssueSummary(periodBills));
  assert.ok(docsCsv.includes('Invoices for outward supply'), 'Table 13 Docs CSV emits outward invoices');
  assert.ok(docsCsv.includes('Credit Note'), 'Table 13 Docs CSV emits credit notes');

  // Self-GSTIN (09CVCPK6544C1ZN == 09CVCPK6544C1ZN) MUST be blocked!
  const selfGstinBill = makeBill({
    id: 'bad-self',
    invoiceNumber: 'AGS/26-27/0099',
    invoiceDate: '2026-11-15',
    client: { name: 'Abhinav Branch', gstin: '09CVCPK6544C1ZN', state: 'Uttar Pradesh', pin: '272162' },
    items: [{ name: 'Basmati Rice', hsn: '100630', quantity: 10, unit: 'Kgs', rate: 800, taxPercent: 5 }],
  });
  const auditSelf = auditInvoicesForGst([selfGstinBill], { sellerGstin: ABHINAV_PROFILE.gstin });
  assert.equal(auditSelf.portalReady, false, 'Self-GSTIN fails portal readiness');
  assert.ok(auditSelf.issues.some((i) => i.code === 'SELF_GSTIN'), 'Flags SELF_GSTIN error');
  assert.throws(
    () => generateGovtGstr1B2bCsv([selfGstinBill], ABHINAV_PROFILE),
    /RET191106/,
    'generateGovtGstr1B2bCsv throws RET191106 on Self-GSTIN'
  );

  // GSTR-1 vs HSN vs GSTR-3B (3.1a) ₹0.00 Difference Check
  // Net outward: (80,000 + 30,000 - 8,000 = 1,02,000 intra @ 5% -> CGST 2,550 + SGST 2,550) + (1,50,000 inter @ 5% -> IGST 7,500)
  const tieOut = reconcileGstr1And3bSummary({
    outwardTaxable: 252000,
    outwardCgst: 2550,
    outwardSgst: 2550,
    outwardIgst: 7500,
    outwardCess: 0,
    hsnRows: mergedHsn,
    gstr3bOutward: { taxable: 252000, cgst: 2550, sgst: 2550, igst: 7500, cess: 0 },
  });
  assert.equal(tieOut.hsnMatched, true, 'HSN Summary matches B2B+B2CS+B2CL-CDNR with ₹0.00 difference');
  assert.equal(tieOut.hsnDiff.taxable, 0);
  assert.equal(tieOut.gstr3bMatched, true, 'GSTR-3B Table 3.1(a) matches GSTR-1 with ₹0.00 difference');
  assert.equal(tieOut.gstr3bDiff.cgst, 0);
  assert.equal(tieOut.gstr3bDiff.sgst, 0);
  assert.equal(tieOut.gstr3bDiff.igst, 0);
});

test('2. GSTR-2B Reconciliation: Exact Match, Value Mismatch & Missing in 2B', () => {
  const booksPurchases = [
    { id: 'p1', supplierName: 'Shree Rice Mill', supplierGstin: '09AAACS8577K1Z6', invoiceNumber: 'SRM/101', date: '2026-11-02', totalAmount: 105000, totalTax: 5000 },
    { id: 'p2', supplierName: 'Kisan Agro', supplierGstin: '09AABCK1234D1Z1', invoiceNumber: 'KA/202', date: '2026-11-04', totalAmount: 52500, totalTax: 2500 },
    { id: 'p3', supplierName: 'Unfiled Mill', supplierGstin: '09AAACU9999M1Z2', invoiceNumber: 'UM/303', date: '2026-11-06', totalAmount: 21000, totalTax: 1000 },
  ];
  const portal2b = {
    b2b: [
      { ctin: '09AAACS8577K1Z6', trdnm: 'Shree Rice Mill', inv: [{ inum: 'SRM/101', dt: '02-11-2026', val: 105000, cgst: 2500, sgst: 2500 }] },
      { ctin: '09AABCK1234D1Z1', trdnm: 'Kisan Agro', inv: [{ inum: 'KA/202', dt: '04-11-2026', val: 58000, cgst: 2761.9, sgst: 2761.9 }] },
    ],
  };
  const rec2b = reconcileGstr2bFuzzy(portal2b, booksPurchases);
  assert.equal(rec2b.exactMatches.length, 1, '1 Exact Match');
  assert.equal(rec2b.valueMismatches.length, 1, '1 Value/Tax Mismatch');
  assert.equal(rec2b.missingIn2b.length, 1, '1 Missing in 2B');
  assert.equal(rec2b.summary.missingIn2bItcAtRisk, 1000, '₹1,000 ITC at risk flagged for Missing in 2B');
});

test('3. NIC e-Way Bill (₹50,000+ Consignment): Vehicle UP58T4521, Pincode 272162, 6-Digit HSN & Distance KM', () => {
  assert.deepEqual(validateIndianVehicleNo('up-58-t-4521'), { valid: true, normalized: 'UP58T4521', message: '' });
  assert.equal(validateIndianVehicleNo('INVALID_VEH').valid, false);

  const items = [{ name: 'Basmati Rice 25Kg Bag', hsn: '100630', quantity: 80, unit: 'Kgs', rate: 900, taxPercent: 5 }];
  const client = { name: 'Lucknow Grain Depot', gstin: '09AABCL4455N1Z9', address: 'Sitapur Road', city: 'Lucknow', state: 'Uttar Pradesh', pin: '226020' };
  const details = {
    invoiceNumber: 'AGS/26-27/0051',
    invoiceDate: '2026-11-18',
    vehicleNo: 'UP-58-T-4521',
    distanceKm: '215',
    dispatchedThrough: 'Purvanchal Roadlines',
    transporterId: '09AAACP1234R1Z5',
    dispatchDocNo: 'GR-8841',
    deliveryNoteDate: '2026-11-18',
  };
  const totals = computeInvoiceTotals({ items, client, profile: ABHINAV_PROFILE, details, showGST: true });
  assert.ok(totals.total > 50000, 'Consignment exceeds ₹50,000 threshold');

  const ewb = generateEWayBillJSON(ABHINAV_PROFILE, client, details, items, totals, 'tax-invoice');
  const bill0 = ewb.billLists[0];
  assert.equal(bill0.fromGstin, '09CVCPK6544C1ZN');
  assert.equal(bill0.fromPincode, 272162);
  assert.equal(bill0.toPincode, 226020);
  assert.equal(bill0.vehicleNo, 'UP58T4521');
  assert.equal(bill0.transDistance, 215);
  assert.equal(bill0.transporterName, 'Purvanchal Roadlines');
  assert.equal(bill0.transporterId, '09AAACP1234R1Z5');
  assert.equal(bill0.transDocNo, 'GR-8841');
  assert.equal(bill0.itemList[0].hsnCode, 100630);
});

test('4. GST Section 51 TDS (2%: 1% CGST + 1% SGST or 2% IGST) & Section 52 E-Commerce TCS', () => {
  const intra51 = computeGstSec51TdsBreakdown(100000, false, 2);
  assert.equal(intra51.cgst, 1000);
  assert.equal(intra51.sgst, 1000);
  assert.equal(intra51.igst, 0);
  assert.equal(intra51.total, 2000);

  const inter51 = computeGstSec51TdsBreakdown(100000, true, 2);
  assert.equal(inter51.cgst, 0);
  assert.equal(inter51.sgst, 0);
  assert.equal(inter51.igst, 2000);
  assert.equal(inter51.total, 2000);

  const govtBill = makeBill({
    id: 'g1',
    invoiceNumber: 'AGS/26-27/0060',
    invoiceDate: '2026-11-19',
    client: { name: 'UP State Civil Supplies Corp', gstin: '09AAACU1122K1Z8', state: 'Uttar Pradesh', pin: '226001', isGovtTdsDeductor: true },
    items: [{ name: 'Fortified Rice Supply', hsn: '100630', quantity: 100, unit: 'Kgs', rate: 1000, taxPercent: 5 }],
  });
  const summary = computeGstTdsTcsSummary([govtBill], ABHINAV_PROFILE);
  assert.equal(summary.tdsTotals.cgst, 1000);
  assert.equal(summary.tdsTotals.sgst, 1000);
  assert.equal(summary.tdsTotals.total, 2000);
  assert.equal(summary.gstTdsRows[0].partyGstin, '09AAACU1122K1Z8');
});

// ============================================================================
// SECTION 2: INCOME TAX (ITR-3 vs ITR-4, CASH LIMITS, ADVANCE TAX, AIS)
// ============================================================================
test('5. Section 44AD (₹3 Cr at ≤5% Cash, 6% Digital + 8% Cash) vs ITR-3 Normal Books', () => {
  // ₹2.50 Cr Digital + ₹10L Cash = ₹2.60 Cr (Cash = 3.85% ≤ 5% -> Eligible for ₹3 Cr cap!)
  const p44 = compute44AD({ digitalReceipts: 25000000, cashReceipts: 1000000, declaredIncome: 0 });
  assert.equal(p44.isEligible, true, '₹2.60 Cr with 3.85% cash qualifies for ₹3 Cr Sec 44AD cap');
  assert.equal(p44.deemedIncome, 1580000, '6% of ₹2.5Cr (₹15L) + 8% of ₹10L (₹80k) = ₹15,80,000');

  // Same ₹2.60 Cr with ₹30L Cash (11.5% > 5% -> Ineligible for ₹3 Cr cap!)
  const p44Bad = compute44AD({ digitalReceipts: 23000000, cashReceipts: 3000000, declaredIncome: 0 });
  assert.equal(p44Bad.isEligible, false, '₹2.60 Cr with >5% cash exceeds ₹2 Cr cap');
});

test('6. Cash Compliance: Sec 40A(3) (>₹10k Cash Expense Disallowed) & Sec 269ST (≥₹2L Cash Receipt Alert)', () => {
  const s40 = auditSection40A3Disallowance({
    expenses: [
      { id: 'e1', date: '2026-11-10', vendorName: 'Local Packing Supplier', category: 'Office Supplies', amount: 14500, paymentMode: 'Cash', ownerGstin: ABHINAV_PROFILE.gstin },
      { id: 'e2', date: '2026-11-11', vendorName: 'Chai & Stationery', category: 'Office Supplies', amount: 4200, paymentMode: 'Cash', ownerGstin: ABHINAV_PROFILE.gstin },
      { id: 'e3', date: '2026-11-12', vendorName: 'Purvanchal GTA Truck', category: 'Shipping & Courier', description: 'GTA Lorry Freight', amount: 28000, paymentMode: 'Cash', ownerGstin: ABHINAV_PROFILE.gstin },
    ],
    fy: '2026-27',
    ownerGstin: ABHINAV_PROFILE.gstin,
  });
  assert.equal(s40.disallowedCount, 1, '₹14,500 cash expense disallowed; ₹4,200 regular & ₹28,000 GTA (≤₹35k) allowed');
  assert.equal(s40.totalDisallowedAmount, 14500);

  const s269 = auditSection269STViolations({
    receipts: [
      { id: 'r1', receiptNumber: 'RCP/01', date: '2026-11-14', clientName: 'Mahesh Trader', amount: 215000, paymentMode: 'Cash', ownerGstin: ABHINAV_PROFILE.gstin },
      { id: 'r2', receiptNumber: 'RCP/02', date: '2026-11-15', clientName: 'Split Buyer', amount: 120000, paymentMode: 'Cash', ownerGstin: ABHINAV_PROFILE.gstin },
      { id: 'r3', receiptNumber: 'RCP/03', date: '2026-11-15', clientName: 'Split Buyer', amount: 95000, paymentMode: 'Cash', ownerGstin: ABHINAV_PROFILE.gstin },
    ],
    fy: '2026-27',
    ownerGstin: ABHINAV_PROFILE.gstin,
  });
  assert.equal(s269.violationCount, 2, 'Catches both single ≥₹2L receipt AND same-day split ≥₹2L aggregate');
});

test('7. Advance Tax (15 Jun 15%, 15 Sep 45%, 15 Dec 75%, 15 Mar 100%) + New vs Old Regime + AIS/GSTR-1 Tie-Out', () => {
  const reg = compareRegimes({ businessIncome: 1800000, deductions: { '80C': 150000, '80D': 25000 }, fy: '2026-27' });
  assert.ok(reg.new.totalTax > 10000 && reg.old.totalTax > 10000, 'Computes both New & Old regime tax for AY 2027-28');

  const adv = computeAdvanceTaxSchedule(100000, 0, [], 'regular', '2026-27');
  assert.equal(adv.applies, true);
  assert.deepEqual(
    adv.schedule.map((q) => [q.dueDate, q.cumulativePct, q.cumulativeDue]),
    [
      ['2026-06-15', 0.15, 15000],
      ['2026-09-15', 0.45, 45000],
      ['2026-12-15', 0.75, 75000],
      ['2027-03-15', 1.0, 100000],
    ],
    'Exact 15 Jun (15%), 15 Sep (45%), 15 Dec (75%), 15 Mar (100%) installments'
  );

  const sampleBill = makeBill({
    id: 'ais-b1',
    invoiceNumber: 'AGS/26-27/0070',
    invoiceDate: '2026-11-16',
    client: { name: 'Buyer A', gstin: '09AABCU9603R1ZM', state: 'Uttar Pradesh', pin: '273001' },
    items: [{ name: 'Wheat', hsn: '100199', quantity: 500, unit: 'Kgs', rate: 400, taxPercent: 5 }],
  });
  const ais = parseAISJson(JSON.stringify({
    pan: 'CVCPK6544C',
    financialYear: '2026-27',
    tdsDetails: [
      { section: '194Q', deductorName: 'Buyer A', amountPaid: 200000, taxDeducted: 200 },
      { section: '194A', deductorName: 'State Bank of India FD Interest', amountPaid: 12000, taxDeducted: 0 },
    ],
    sftInformation: [
      { sftCode: 'SFT-016 GST Outward Turnover', deductorName: 'GSTN', amount: 200000 },
    ],
  }));
  const recon = reconcileGstr1VsItrAndAis({
    bills: [sampleBill],
    aisSummary: ais,
    booksTdsReceivable: 200,
    booksBankInterest: 12000,
    fy: '2026-27',
    ownerGstin: ABHINAV_PROFILE.gstin,
  });
  assert.equal(recon.gstr1VsItrDiff, 0, 'GSTR-1 vs ITR Gross Receipts has ₹0.00 difference');
  assert.equal(recon.isZeroTurnoverDiff, true);
  assert.equal(recon.tdsDiff, 0);
  assert.equal(recon.interestDiff, 0);
  assert.equal(recon.aisVsBooksTurnoverDiff, 0);
});

// ============================================================================
// SECTION 3: CA ACCOUNTING, CLOSING STOCK, MSME 43B(h) & PRINT AUDIT
// ============================================================================
test('8. Trial Balance, Trading/P&L (COGS & Closing Stock), Balance Sheet (₹0.00 Diff) & ITR-3 Tie-Out', () => {
  const salesBill = makeBill({
    id: 'acc-s1',
    invoiceNumber: 'AGS/26-27/0101',
    invoiceDate: '2026-10-05',
    paymentStatus: 'paid',
    paymentMode: 'bank-transfer',
    client: { name: 'Basti Super Mart', gstin: '09AABCB5566P1Z3', state: 'Uttar Pradesh', pin: '272001' },
    items: [{ name: 'Basmati Rice 25Kg', hsn: '100630', quantity: 60, unit: 'Kgs', rate: 1000, taxPercent: 5 }], // Taxable 60,000 + CGST 1,500 + SGST 1,500 = 63,000
  });

  // Purchased 100 bags @ ₹700 = ₹70,000 + 5% GST (₹3,500) = ₹73,500; Unpaid MSME Udyam supplier (55 days overdue on 2026-11-21!)
  const purchaseBill = {
    id: 'acc-p1',
    date: '2026-09-20',
    supplierName: 'Siddharthnagar Agro MSME',
    supplierGstin: '09AAACS1122D1Z4',
    supplierUdyamNo: 'UDYAM-UP-09-0099887',
    isMsme: true,
    hasWrittenAgreement: true,
    invoiceNumber: 'SAM/09/01',
    paymentStatus: 'Unpaid',
    interstate: false,
    ownerGstin: ABHINAV_PROFILE.gstin,
    items: [{ name: 'Basmati Rice 25Kg', hsn: '100630', quantity: 100, unit: 'Kgs', rate: 700, taxPercent: 5 }],
  };

  // Indirect business expense: ₹5,000 Office Rent via Bank
  const rentExp = {
    id: 'acc-e1',
    date: '2026-10-10',
    category: 'Office Rent',
    description: 'Shop Rent October',
    amount: 5000,
    gstAmount: 0,
    paymentMode: 'Bank Transfer',
    ownerGstin: ABHINAV_PROFILE.gstin,
  };

  // Remaining stock: 40 bags × ₹700 purchase price = ₹28,000
  const products = [
    { id: 'prod-1', name: 'Basmati Rice 25Kg', stock: 40, purchasePrice: 700, sellingPrice: 1000, trackStock: true },
  ];

  const closingStockValue = computeInventoryValuation(products);
  assert.equal(closingStockValue, 28000, 'Closing Stock = 40 remaining × ₹700 purchase price = ₹28,000');

  const vouchers = deriveAutoJournalEntries({
    bills: [salesBill],
    purchases: [purchaseBill],
    expenses: [rentExp],
  });
  const tb = computeTrialBalance(vouchers);
  assert.equal(tb.isBalanced, true, 'Trial Balance Total Debits === Total Credits (₹0.00 diff)');
  assert.equal(tb.difference, 0);

  const pl = computeTradingAndProfitLoss(tb, { openingStockValue: 0, closingStockValue });
  assert.equal(pl.netSales, 60000);
  assert.equal(pl.netPurchases, 70000);
  assert.equal(pl.cogs, 42000, 'COGS = 0 + 70,000 - 28,000 = ₹42,000 (60 sold × ₹700)');
  assert.equal(pl.grossProfit, 18000, 'Gross Profit = 60,000 - 42,000 = ₹18,000');
  assert.equal(pl.netProfit, 13000, 'Net Profit = Gross Profit (18,000) - Indirect Expenses (5,000) = ₹13,000');

  const bs = computeBalanceSheet(tb, { closingStockValue });
  assert.equal(bs.isBalanced, true, 'Schedule III Balance Sheet Assets === Liabilities + Capital');
  assert.equal(bs.difference, 0, 'Balance Sheet difference is ₹0.00');
  assert.equal(bs.netProfit, pl.netProfit, 'Balance Sheet Surplus matches P&L Net Profit');

  // MSME Sec 43B(h) (>45 days overdue) + ITR-3 Tie-Out
  const msme = checkSection43BCompliance({ purchases: [purchaseBill], today: new Date('2026-11-21') });
  assert.equal(msme.overdueCount, 1);
  assert.equal(msme.bills[0].badgeLabel, 'Overdue');
  assert.equal(msme.bills[0].severity, 'DISALLOWED_OVERDUE');
  assert.equal(msme.overdueDisallowedAmount, 73500);

  const itr = computeBusinessITR({
    bills: [salesBill],
    purchases: [purchaseBill],
    expenses: [rentExp],
    closingStock: closingStockValue,
    fy: '2026-27',
    ownerGstin: ABHINAV_PROFILE.gstin,
    today: new Date('2026-11-21'),
    includeStatutoryDisallowance: true,
  });
  assert.equal(itr.netProfitPerBooks, pl.netProfit, 'ITR-3 Net Profit per Books === Reports P&L Net Profit (₹13,000)');
  assert.equal(itr.sec43BhDisallowed, 73500, 'Flags ₹73,500 overdue MSME payable for Sec 43B(h) add-back');
  assert.equal(itr.itr3AdjustedIncome, 86500, 'Taxable ITR-3 Income = ₹13,000 + ₹73,500 Sec 43B(h) add-back');
});

test('9. Statutory Licenses (Mandi License L/2024/130/23005441) & Rule 46 Print Fields', () => {
  const licenses = formatSellerLicenses(ABHINAV_PROFILE);
  assert.ok(licenses.includes('Mandi Lic: L/2024/130/23005441'), 'Prints Mandi License L/2024/130/23005441');
  assert.ok(licenses.includes('FSSAI: 12724055000987'), 'Prints FSSAI License');
  assert.ok(licenses.includes('Udyam: UDYAM-UP-09-0011223'), 'Prints Udyam Registration');
  assert.ok(numberToWords(63000).toLowerCase().includes('sixty'), 'Amount in words renders cleanly');
});

console.log(`v5.5.5 Complete Statutory Audit Suite: ${passed} passed, 0 failed`);
