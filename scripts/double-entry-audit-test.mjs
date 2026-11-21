#!/usr/bin/env node
// Unit test suite for Double-Entry Accounting (F4-F7, Trial Balance, Balance Sheet),
// SHA-256 Tamper-Proof Hash-Chained Audit Trail, and AES-256-GCM .bharatca CA Package.

import {
  deriveAutoJournalEntries,
  validateManualVoucher,
  computeTrialBalance,
  computeBalanceSheet,
  computeInventoryValuation,
} from '../src/utils/doubleEntry.js';
import {
  buildAuditChainFromVouchers,
  verifyAuditChain,
  buildCaWorkpaperBundle,
  sealCaPackage,
  openCaPackage,
} from '../src/utils/hashChain.js';

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

const sampleBills = [
  {
    id: 'b1',
    invoiceNumber: 'INV/26-27/001',
    invoiceDate: '2026-11-01',
    totalAmount: 11800,
    status: 'paid',
    data: {
      invoiceType: 'Tax Invoice',
      grandTotal: 11800,
      totalCgst: 900,
      totalSgst: 900,
      paymentMethod: 'UPI',
      client: { name: 'Sharma Electronics' },
    },
  },
  {
    id: 'b2',
    invoiceNumber: 'INV/26-27/002',
    invoiceDate: '2026-11-05',
    totalAmount: 23600,
    amountPaid: 10000,
    status: 'partial',
    data: {
      invoiceType: 'Tax Invoice',
      grandTotal: 23600,
      totalIgst: 3600,
      paymentMethod: 'Cash',
      client: { name: 'Delhi Distributors' },
    },
  },
  {
    id: 'cn1',
    invoiceNumber: 'CN/26-27/001',
    invoiceDate: '2026-11-07',
    totalAmount: 1180,
    status: 'unpaid',
    data: {
      invoiceType: 'Credit Note',
      grandTotal: 1180,
      totalCgst: 90,
      totalSgst: 90,
      client: { name: 'Sharma Electronics' },
    },
  },
];

const samplePurchases = [
  {
    id: 'p1',
    billNumber: 'PUR-101',
    billDate: '2026-11-02',
    totalAmount: 5900,
    cgst: 450,
    sgst: 450,
    status: 'unpaid',
    vendorName: 'Bharat Wholesale',
  },
];

const sampleExpenses = [
  {
    id: 'e1',
    date: '2026-11-03',
    category: 'Shop Rent',
    amount: 5000,
    gstAmount: 0,
    paymentMethod: 'Bank Transfer',
  },
];

const autoVouchers = deriveAutoJournalEntries({
  bills: sampleBills,
  purchases: samplePurchases,
  expenses: sampleExpenses,
});

assert(autoVouchers.length === 5, 'Derives 5 double-entry vouchers from sales, credit note, purchase & expense');

// Manual Capital Receipt (F6) + Contra (F4)
const capCheck = validateManualVoucher({
  voucherType: 'RECEIPT',
  voucherNo: 'RCP-CAP-01',
  date: '2026-11-01',
  narration: 'Initial owner capital introduced',
  lines: [
    { account: 'BANK_ACCOUNTS', debit: 100000, credit: 0 },
    { account: 'OWNER_CAPITAL', debit: 0, credit: 100000 },
  ],
});
assert(capCheck.valid === true, 'Validates balanced F6 Receipt capital voucher');

const badContra = validateManualVoucher({
  voucherType: 'CONTRA',
  lines: [
    { account: 'SALES_ACCOUNT', debit: 1000, credit: 0 },
    { account: 'CASH_IN_HAND', debit: 0, credit: 1000 },
  ],
});
assert(badContra.valid === false, 'Rejects non-cash/bank ledger inside F4 Contra voucher');

const unbalancedJv = validateManualVoucher({
  voucherType: 'JOURNAL',
  lines: [
    { account: 'DEPRECIATION', debit: 2500, credit: 0 },
    { account: 'FIXED_ASSETS', debit: 0, credit: 2000 },
  ],
});
assert(unbalancedJv.valid === false, 'Rejects unbalanced F7 Journal voucher');

const allVouchers = [...autoVouchers, capCheck.voucher];
const tb = computeTrialBalance(allVouchers);
assert(tb.isBalanced === true && tb.difference === 0, `Trial Balance is 100% balanced (Dr=${tb.totalDebit}, Cr=${tb.totalCredit})`);

const stockVal = computeInventoryValuation([
  { name: 'LED Bulb', stock: 50, purchasePrice: 60, trackStock: true },
]);
assert(stockVal === 3000, 'Computes closing inventory valuation at cost (50 * 60 = 3000)');

const bs = computeBalanceSheet(tb, { closingStockValue: stockVal });
assert(
  bs.isBalanced === true && bs.difference === 0,
  `Schedule III Balance Sheet tallies Assets (${bs.totalAssets}) === Equity + Liabilities (${bs.totalEquityAndLiabilities})`
);

// SHA-256 Audit Chain + Tamper Detection + .bharatca Encryption
const chain = await buildAuditChainFromVouchers(allVouchers);
assert(chain.length === allVouchers.length, 'Builds SHA-256 block for every voucher');
const cleanVerify = await verifyAuditChain(chain);
assert(cleanVerify.valid === true && cleanVerify.checkedCount === allVouchers.length, 'Verifies clean SHA-256 audit chain');

const tampered = chain.map((b, idx) => (idx === 2 ? { ...b, totalAmount: b.totalAmount + 500 } : b));
const tamperVerify = await verifyAuditChain(tampered);
assert(tamperVerify.valid === false && tamperVerify.tamperedIndex === 3, 'Detects tampered voucher amount at exact block #3');

const bundle = await buildCaWorkpaperBundle({
  profile: { businessName: 'Agrahari Traders', gstin: '09ABCDE1234F1Z5' },
  periodLabel: 'FY 2026-27',
  trialBalance: tb,
  balanceSheet: bs,
  vouchers: allVouchers,
  auditChain: chain,
});
const encryptedPkg = await sealCaPackage(bundle, 'CA-Secret-2026');
assert(encryptedPkg.includes('"AES-256-GCM"'), 'Seals .bharatca package with AES-256-GCM');

const openedPkg = await openCaPackage(encryptedPkg, 'CA-Secret-2026');
assert(openedPkg.business.name === 'Agrahari Traders' && openedPkg.auditTrailProof.verified === true, 'Decrypts .bharatca CA package accurately');

let wrongPassBlocked = false;
try {
  await openCaPackage(encryptedPkg, 'Wrong-Pass');
} catch {
  wrongPassBlocked = true;
}
assert(wrongPassBlocked === true, 'Blocks wrong password on encrypted .bharatca package');

console.log(`double-entry-audit-test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
