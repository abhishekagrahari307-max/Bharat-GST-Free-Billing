#!/usr/bin/env node
// Comprehensive Unit Test Suite for Bharat GST Free Billing v5.0.0 ("Autonomous Bharat Business & Tax OS")
// Covers:
// - Module A: AIS/26AS JSON Parser, ITR-3 vs ITR-4 (Sec 44AD/44ADA) Tax Engine, Form 26Q RPU & Portal Bridge Payload
// - Module B: Multi-Godown Stock Transfer, FEFO Batch Expiry Allocator, Manufacturing BOM Costing & E-Way Bill Validity
// - Module D: Section 43B(h) MSME 45-Day Tax Shield, Margin Erosion Arbitrage Detector & UTF-8 Serverless #b2b-catalog Link

import {
  parseAISJson,
  computeBusinessITR,
  generateForm26QSummary,
  buildPortalBridgePayload,
} from '../src/utils/itrAndTaxEngine.js';
import {
  computeGodownStockTransfer,
  allocateBatchesFEFO,
  computeManufacturingBOM,
  estimateEwayBillValidity,
} from '../src/utils/godownAndManufacturing.js';
import {
  checkSection43BCompliance,
  detectMarginErosion,
  generateServerlessCatalogLink,
  decodeServerlessCatalogLink,
} from '../src/utils/autonomousMunimAnd43B.js';

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

// 1. AIS / 26AS JSON Parser
const ais = parseAISJson({
  aisData: {
    partB: [
      { infoCode: 'TDS-194C', details: [{ deductorName: 'NHAI Infra', tan: 'DELN12345A', amount: 500000, tdsAmt: 10000 }] },
      { infoCode: 'TCS-206C', details: [{ collectorName: 'Tata Steel', tan: 'MUMT99999B', amount: 800000, taxAmt: 800 }] },
      { infoCode: 'SFT-005', details: [{ description: 'Time Deposit', amount: 1200000 }] },
    ],
  },
});
assert(
  ais.totalTdsCredit === 10000 && ais.totalTcsCredit === 800 && ais.sftTransactions.length === 1,
  'Parses AIS JSON TDS (₹10,000), TCS (₹800) & SFT high-value entries accurately'
);

// 2. ITR-3 vs ITR-4 (Sec 44AD) Computation Engine
const itr = computeBusinessITR({
  bills: [{ status: 'paid', data: { invoiceType: 'Tax Invoice', subtotal: 25000000 } }], // ₹2.5 Cr turnover
  purchases: [{ taxableAmount: 18000000 }],
  expenses: [{ amount: 2000000 }], // Actual profit = ₹50L
  digitalReceiptPercent: 100, // 44AD profit = 6% of ₹2.5 Cr = ₹15L
  aisSummary: ais,
});
assert(
  itr.itr4.eligible === true &&
    itr.itr4.presumptiveProfit === 1500000 &&
    itr.itr3.netProfit === 5000000 &&
    itr.recommendedForm === 'ITR-4 (Sec 44AD)' &&
    itr.itr4.grossTaxLiability < itr.itr3.grossTaxLiability,
  'Computes ITR-3 vs Sec 44AD ITR-4 tax liability and recommends lower-tax ITR-4 Sugam'
);

// 3. Form 26Q Quarterly RPU Generator & Portal Bridge Payload
const f26q = generateForm26QSummary([
  { partyName: 'Ramesh Transport', pan: 'abcde1234f', section: '194C', amountPaid: 75000, tdsAmount: 1500, challanBsr: '0510301', challanSerial: '00991' },
]);
assert(
  f26q.totalTdsDeducted === 1500 && f26q.rpuText.includes('DD^1^ABCDE1234F^Ramesh Transport^194C'),
  'Generates Form 26Q quarterly summary & RPU pipe/caret text record'
);

const bridgePayload = buildPortalBridgePayload({ invoiceNumber: 'INV-501', clientGstin: '09abcde1234f1z5', totalAmount: 59000 }, { vehicleNo: 'up32ab1234', distanceKm: 180 });
assert(
  bridgePayload.customerGstin === '09ABCDE1234F1Z5' && bridgePayload.vehicleNo === 'UP32AB1234',
  'Builds Zero-GSP Portal Auto-Fill Bridge payload cleanly'
);

// 4. Multi-Godown Stock Transfer
const gd = computeGodownStockTransfer(
  { id: 'p1', name: 'Mustard Oil 15L', stock: 40, unit: 'TIN' },
  { fromGodown: 'MAIN', toGodown: 'MANDI_GODOWN', qty: 15 }
);
assert(
  gd.godownStock.MAIN === 25 && gd.godownStock.MANDI_GODOWN === 15 && gd.challan.qty === 15,
  'Transfers stock across Multi-Godown locations and generates Stock Transfer Challan'
);

// 5. FEFO (First-Expiry First-Out) Batch Allocator
const fefo = allocateBatchesFEFO(
  [
    { batchNo: 'B-LATE', expiryDate: '2027-12-31', qty: 20, mrp: 100 },
    { batchNo: 'B-EXPIRED', expiryDate: '2025-01-01', qty: 50, mrp: 90 },
    { batchNo: 'B-SOON', expiryDate: '2027-02-15', qty: 6, mrp: 95 },
  ],
  10,
  '2026-11-21'
);
assert(
  fefo.fulfilled === true &&
    fefo.allocations[0].batchNo === 'B-SOON' &&
    fefo.allocations[0].allocatedQty === 6 &&
    fefo.allocations[1].batchNo === 'B-LATE' &&
    fefo.allocations[1].allocatedQty === 4,
  'Skips expired batches and allocates earliest-expiry batch first (FEFO)'
);

// 6. Manufacturing BOM Landed Cost Engine & E-Way Bill Validity Tracker
const bom = computeManufacturingBOM({
  finishedItem: { id: 'fg1', name: 'Basmati Rice 10kg', stock: 5 },
  producedQty: 10,
  rawMaterials: [{ product: { id: 'rm1', name: 'Paddy Raw', stock: 200, purchasePrice: 30 }, qtyPerUnit: 12, wastagePercent: 10 }],
  additionalOverheadCost: 240,
});
assert(
  bom.updatedFinishedProduct.stock === 15 &&
    bom.updatedRawProducts[0].stock === 68 && // 200 - (12 * 10 * 1.1) = 68
    bom.landedCostPerUnit === 420, // ((132 * 30) + 240) / 10 = 420
  'Executes Manufacturing BOM with wastage % and computes exact Landed Cost ₹420/unit'
);

const eway = estimateEwayBillValidity({
  distanceKm: 350, // ceil(350/200) = 2 days = 48h
  generatedAtIso: '2026-11-20T00:00:00.000Z',
  nowIso: '2026-11-21T20:00:00.000Z', // 44h elapsed -> 4h remaining
});
assert(
  eway.validityDays === 2 && eway.needsExtensionAlert === true && eway.status === 'EXPIRING_WITHIN_6H',
  'Triggers E-Way Bill 6-hour pre-expiry extension alert accurately'
);

// 7. Section 43B(h) MSME 45-Day Payment Disallowance Shield
const s43b = checkSection43BCompliance({
  clients: [{ name: 'Sharma Packaging', gstin: '09ABCDE1234F1Z5', udyamNo: 'UDYAM-UP-01-0012345' }],
  purchases: [{ invoiceNumber: 'PUR-88', supplierName: 'Sharma Packaging', date: '2026-09-25', totalAmount: 100000, paidAmount: 0 }],
  today: new Date('2026-11-21T00:00:00Z'), // 57 days elapsed -> -12 days remaining
});
assert(
  s43b.criticalCount === 1 &&
    s43b.bills[0].severity === 'DISALLOWED_OVERDUE' &&
    s43b.estimatedTaxImpact30Pct === 31200,
  'Flags overdue MSME supplier bill under Income Tax Section 43B(h) with ₹31,200 tax impact'
);

// 8. Margin Erosion Arbitrage Detector & UTF-8 Hindi/English Serverless #b2b-catalog Link
const erosion = detectMarginErosion({ id: 'i1', name: ' सरसों तेल 1L', purchasePrice: 130, sellingPrice: 150 }, 142, 15);
assert(
  erosion && erosion.rateHike === 12 && erosion.suggestedSaleRate === 168,
  'Detects supplier purchase rate hike & computes suggested selling rate to preserve margin'
);

const catLink = generateServerlessCatalogLink(
  'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/',
  { businessName: 'अग्रहरि ट्रेडर्स', phone: '9876543210', upiId: 'shop@upi' },
  [{ id: '1', name: 'सरसों तेल Tin', sellingPrice: 2150, gstRate: 5, unit: 'TIN', stock: 20 }]
);
const decodedCat = decodeServerlessCatalogLink(new URL(catLink).hash);
assert(
  decodedCat?.b?.n === 'अग्रहरि ट्रेडर्स' && decodedCat?.i?.[0]?.n === 'सरसों तेल Tin' && decodedCat?.i?.[0]?.r === 2150,
  'Round-trips UTF-8 Hindi/English Serverless #b2b-catalog Storefront link losslessly'
);

console.log(`v5-autonomous-os-test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
