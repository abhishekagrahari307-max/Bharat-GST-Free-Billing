#!/usr/bin/env node
// Comprehensive unit tests for v3.1.0 Enterprise AI, GST Notice Shield, Fuzzy GSTR-2B,
// 30-Day Cash-Flow/Dead-Stock Forecaster, FIFO Payment Allocator, B2B Catalog & Hardware Bridge.

import { runGstNoticeShield, buildGstr9AndCmp08WorkingPapers } from '../src/utils/gstNoticeShield.js';
import { reconcileGstr2bFuzzy } from '../src/utils/fuzzyGstr2b.js';
import { forecastCashFlowAndInventory } from '../src/utils/aiForecaster.js';
import { parseScaleWeightLine, buildEscPosReceiptBytes } from '../src/utils/hardwareBridge.js';
import {
  computeFifoPaymentAllocation,
  buildShareableB2bCatalogHtml,
  parseWhatsappCatalogOrder,
} from '../src/utils/fifoAndCatalog.js';

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

// 1. GST Notice Shield: Sec 17(5) Blocked ITC + Rule 37 (>180d unpaid) + Rule 138 E-Way Bill
const shield = runGstNoticeShield({
  asOfDate: '2026-11-21',
  bills: [
    {
      id: 'b1',
      invoiceNumber: 'INV-900',
      totalAmount: 75000,
      data: { invoiceType: 'Tax Invoice', grandTotal: 75000 },
    },
  ],
  purchases: [
    {
      id: 'p1',
      billNumber: 'CAT-01',
      billDate: '2026-10-10',
      totalAmount: 10500,
      cgst: 250,
      sgst: 250,
      status: 'paid',
      description: 'Staff outdoor catering lunch',
    },
    {
      id: 'p2',
      billNumber: 'OLD-180',
      billDate: '2026-01-10',
      totalAmount: 59000,
      igst: 9000,
      status: 'unpaid',
      description: 'Raw steel sheets',
    },
  ],
});
assert(shield.blockedItcAmount === 500, 'Flags ₹500 Sec 17(5)(b) blocked ITC on catering purchase');
assert(shield.rule37ReversalItc === 9000, 'Flags ₹9000 CGST Rule 37 ITC reversal on >180-day unpaid supplier bill');
assert(shield.alerts.some((a) => a.code === 'EWAY_BILL_MISSING'), 'Flags missing E-Way Bill on >₹50,000 invoice');

// 2. GSTR-9 & CMP-08 Working Papers
const wp = buildGstr9AndCmp08WorkingPapers({
  bills: [
    {
      id: 's1',
      totalAmount: 11800,
      data: {
        invoiceType: 'Tax Invoice',
        grandTotal: 11800,
        totalCgst: 900,
        totalSgst: 900,
        client: { gstin: '09ABCDE1234F1Z5' },
        items: [{ hsn: '8517', quantity: 2, price: 5000 }],
      },
    },
  ],
  purchases: [{ id: 'pur1', totalAmount: 5900, cgst: 450, sgst: 450 }],
});
assert(wp.gstr9.table4B2B.taxable === 10000 && wp.gstr9.table9NetTaxPayableCash === 900, 'Computes GSTR-9 Table 4B & Table 9 Net Cash GST accurately');

// 3. AI Fuzzy GSTR-2B Matcher ("INV/2026-27/0045" <-> "45" within ±₹2)
const recon = reconcileGstr2bFuzzy(
  {
    b2b: [
      {
        ctin: '09ABCDE1234F1Z5',
        trdnm: 'Sharma Wholesale',
        inv: [{ inum: 'INV/2026-27/0045', dt: '01-11-2026', val: 11800.4, igst: 1800 }],
      },
    ],
  },
  [
    {
      id: 'pb1',
      vendorGstin: '09ABCDE1234F1Z5',
      vendorName: 'Sharma Wholesale',
      billNumber: '45',
      billDate: '2026-11-01',
      totalAmount: 11800,
      igst: 1800,
    },
    {
      id: 'pb2',
      vendorGstin: '09ZZZZZ9999F1Z2',
      vendorName: 'Missing Supplier',
      vendorPhone: '9876543210',
      billNumber: 'MS-99',
      billDate: '2026-11-05',
      totalAmount: 5900,
      igst: 900,
    },
  ]
);
assert(recon.fuzzyMatches.length === 1, 'Fuzzy-reconciles INV/2026-27/0045 against book bill "45" with ₹0.40 rounding delta');
assert(recon.missingIn2b.length === 1 && recon.missingIn2b[0].whatsappFollowUpUrl.includes('wa.me/919876543210'), 'Generates WhatsApp supplier follow-up URL for missing 2B ITC');

// 4. 30-Day Cash-Flow & Dead-Stock Forecaster
const fc = forecastCashFlowAndInventory({
  asOfDate: '2026-11-21',
  bills: [
    {
      id: 'fb1',
      invoiceDate: '2026-11-01',
      totalAmount: 30000,
      status: 'paid',
      data: { invoiceType: 'Tax Invoice', grandTotal: 30000, items: [{ name: 'Fast Milk', quantity: 90 }] },
    },
  ],
  products: [
    { id: 'pr1', name: 'Fast Milk', stock: 10, purchasePrice: 40, trackStock: true },
    { id: 'pr2', name: 'Old Dead Radio', stock: 5, purchasePrice: 2000, trackStock: true },
  ],
});
assert(fc.lockedDeadStockCapital === 10000, 'Identifies ₹10,000 locked dead-stock capital');
assert(fc.reorderSoonItems.length === 1 && fc.reorderSoonItems[0].daysLeft === 10, 'Predicts 10-day stockout countdown for fast-moving item');

// 5. FIFO Lump-Sum Payment Allocator + B2B Catalog + WhatsApp Order Parser
const fifo = computeFifoPaymentAllocation(
  [
    { id: 'inv-old', invoiceNumber: 'INV-01', invoiceDate: '2026-09-01', clientName: 'Mehta Store', totalAmount: 15000, amountPaid: 0, status: 'unpaid', data: { invoiceType: 'Tax Invoice' } },
    { id: 'inv-new', invoiceNumber: 'INV-02', invoiceDate: '2026-10-01', clientName: 'Mehta Store', totalAmount: 20000, amountPaid: 0, status: 'unpaid', data: { invoiceType: 'Tax Invoice' } },
  ],
  { clientName: 'Mehta Store', lumpSumAmount: 25000, paymentMode: 'UPI' }
);
assert(
  fifo.allocations.length === 2 &&
    fifo.allocations[0].newStatus === 'paid' &&
    fifo.allocations[1].appliedAmount === 10000 &&
    fifo.allocations[1].newStatus === 'partial',
  'Allocates ₹25,000 FIFO: settles oldest ₹15,000 in full and ₹10,000 partial on next invoice'
);

const catalogHtml = buildShareableB2bCatalogHtml([{ name: 'Basmati Rice', sellingPrice: 1200, gstRate: 5, unit: 'BAG' }], { businessName: 'Agrahari Mart', phone: '9876543210' });
assert(catalogHtml.includes('Agrahari Mart') && catalogHtml.includes('Basmati Rice'), 'Generates standalone shareable B2B catalog HTML');

const waParsed = parseWhatsappCatalogOrder('BHARAT_ORDER | Agrahari Mart\n5 x Basmati Rice @ 1200', [{ id: 'p-rice', name: 'Basmati Rice', hsn: '1006', gstRate: 5, unit: 'BAG' }]);
assert(waParsed.length === 1 && waParsed[0].quantity === 5 && waParsed[0].hsn === '1006', 'Parses WhatsApp catalog order into structured invoice line items');

// 6. Hardware Bridge: WebSerial Scale Parser + ESC/POS Receipt Bytes
const w1 = parseScaleWeightLine('ST,GS,+002.450kg');
const w2 = parseScaleWeightLine('+ 750 gm');
assert(w1?.weightKg === 2.45 && w2?.weightKg === 0.75, 'Parses kg and gram frames from electronic weighing scale');

const escBytes = buildEscPosReceiptBytes(
  { invoiceNumber: 'POS-101', totalAmount: 590, data: { items: [{ name: 'Tea Pack', quantity: 2, price: 295 }] } },
  { businessName: 'Bharat Kirana' }
);
assert(escBytes instanceof Uint8Array && escBytes[0] === 0x1b && escBytes[1] === 0x40, 'Generates valid ESC/POS binary byte stream starting with ESC @ init');

console.log(`enterprise-ai-erp-test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
