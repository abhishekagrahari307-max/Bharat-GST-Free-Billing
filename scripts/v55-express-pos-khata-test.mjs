// v5.5.0 — Express POS Counter, Live UPI QR, Cash Tender Calculator,
// Inventory Valuation / HSN Hygiene, Khata Command Strip & Command Palette Tests.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isValidUpiVpa,
  resolveMerchantUpiDetails,
  buildDynamicCounterUpiUri,
  suggestQuickTenderAmounts,
  computeCashTenderBreakdown,
  computeInventoryValuationSummary,
  computeKhataPortfolioSummary,
} from '../src/utils/expressPosEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}\n    ${err?.message || err}`);
  }
}

console.log('Running v5.5.0 Express POS Counter, Live UPI QR, Khata & Stock Command Strip Tests…');

test('1. Cash Tender Calculator computes exact change, shortfall & Indian note breakup', () => {
  const res = computeCashTenderBreakdown(342, 500);
  assert.equal(res.billTotal, 342);
  assert.equal(res.cashTendered, 500);
  assert.equal(res.changeToReturn, 158);
  assert.equal(res.shortfall, 0);
  assert.equal(res.isSufficient, true);
  assert.equal(res.recommendedPaidAmount, 342);
  assert.equal(res.breakupText, '1×₹100 + 1×₹50 + 1×₹5 + 1×₹2 + 1×₹1');

  const short = computeCashTenderBreakdown(750, 500);
  assert.equal(short.changeToReturn, 0);
  assert.equal(short.shortfall, 250);
  assert.equal(short.isSufficient, false);
  assert.equal(short.recommendedPaidAmount, 500);

  const presets = suggestQuickTenderAmounts(342);
  assert.ok(presets.includes(342), 'includes exact amount');
  assert.ok(presets.includes(350), 'includes next ₹10/₹50 step');
  assert.ok(presets.includes(500), 'includes ₹500 note');
});

test('2. Dynamic Counter UPI URI validates NPCI VPA & encodes exact amount', () => {
  assert.equal(isValidUpiVpa('9876543210@ybl'), true);
  assert.equal(isValidUpiVpa('shop.name-1@okicici'), true);
  assert.equal(isValidUpiVpa('not-a-vpa'), false);
  assert.equal(isValidUpiVpa(''), false);

  const resolved = resolveMerchantUpiDetails(
    {
      businessName: 'Sharma Kirana',
      paymentAccounts: [
        { id: 'acc-1', label: 'HDFC', upiId: 'sharma@okhdfcbank', isDefault: true },
        { id: 'acc-2', label: 'SBI', upiId: 'sharma@oksbi', isDefault: false },
      ],
    },
    'acc-2'
  );
  assert.equal(resolved.upiId, 'sharma@oksbi');
  assert.equal(resolved.isValid, true);

  const uri = buildDynamicCounterUpiUri({
    upiId: resolved.upiId,
    payeeName: 'Sharma Kirana',
    amount: 1249.5,
    invoiceNumber: 'INV-2026-099',
  });
  assert.ok(uri.startsWith('upi://pay?'));
  assert.ok(uri.includes('pa=sharma%40oksbi'));
  assert.ok(uri.includes('am=1249.50'));
  assert.ok(uri.includes('cu=INR'));
  assert.ok(uri.includes('tn=Bill%20INV-2026-099'));
  assert.equal(buildDynamicCounterUpiUri({ upiId: 'bad_vpa', amount: 100 }), '');
});

test('3. Inventory Valuation & HSN Hygiene Summary computes Cost, Margin & 4/6/8-digit HSN gaps', () => {
  const summary = computeInventoryValuationSummary(
    [
      { name: 'Basmati Rice 5kg', kind: 'goods', hsn: '10063020', purchasePrice: 400, sellingPrice: 500, stock: 10 },
      { name: 'Mustard Oil 1L', kind: 'goods', hsn: '1514', purchasePrice: 120, sellingPrice: 150, stock: 3 },
      { name: 'Loose Spices', kind: 'goods', hsn: 'abc', purchasePrice: 50, sellingPrice: 80, stock: 0 },
      { name: 'Delivery Service', kind: 'service', hsn: '', sellingPrice: 100 },
    ],
    { lowStockThreshold: 5, alertsEnabled: true }
  );

  assert.equal(summary.goodsCount, 3);
  assert.equal(summary.serviceCount, 1);
  // Cost = (10 * 400) + (3 * 120) = 4360; Selling = (10 * 500) + (3 * 150) = 5450
  assert.equal(summary.totalCostValue, 4360);
  assert.equal(summary.totalSellingValue, 5450);
  assert.equal(summary.potentialProfit, 1090);
  assert.equal(summary.marginPercent, 20);
  // Mustard Oil (3 <= 5) + Loose Spices (0) = 2 low/out; 1 out of stock
  assert.equal(summary.lowOrOutCount, 2);
  assert.equal(summary.outOfStockCount, 1);
  // Loose Spices ('abc') + Delivery Service ('') = 2 invalid/missing HSN
  assert.equal(summary.missingOrInvalidHsnCount, 2);
});

test('4. Khata Portfolio Summary computes Market Udhaari, Advances & Credit Limit breaches', () => {
  const khata = computeKhataPortfolioSummary([
    { total: 25000, paid: 10000, unpaid: 15000, creditLimit: 12000 },
    { total: 8000, paid: 8000, unpaid: 0, creditLimit: 10000 },
    { total: 5000, paid: 6500, unpaid: -1500, creditLimit: 5000 },
  ]);
  assert.equal(khata.totalParties, 3);
  assert.equal(khata.totalBilled, 38000);
  assert.equal(khata.totalCollected, 24500);
  assert.equal(khata.totalReceivable, 15000);
  assert.equal(khata.totalAdvanceCredit, 1500);
  assert.equal(khata.owingPartiesCount, 1);
  assert.equal(khata.overCreditLimitCount, 1);
});

test('5. UI Wiring: ExpressPosCounterBar, Clients/Inventory Strips, QuickSearch & App.jsx Mobile Inventory Fix', () => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
  const invGenSrc = fs.readFileSync(path.join(ROOT, 'src/components/InvoiceGenerator.jsx'), 'utf8');
  const invViewSrc = fs.readFileSync(path.join(ROOT, 'src/components/InventoryView.jsx'), 'utf8');
  const clientsSrc = fs.readFileSync(path.join(ROOT, 'src/components/ClientsView.jsx'), 'utf8');
  const quickSrc = fs.readFileSync(path.join(ROOT, 'src/components/QuickSearch.jsx'), 'utf8');

  assert.ok(
    appSrc.includes("hasInventory={isModuleEnabled('inventory', enabledModules)}"),
    'App.jsx passes moduleId first to isModuleEnabled for MobileBottomBar'
  );
  assert.ok(invGenSrc.includes('<ExpressPosCounterBar'), 'InvoiceGenerator mounts ExpressPosCounterBar');
  assert.ok(invViewSrc.includes('computeInventoryValuationSummary'), 'InventoryView wires Stock Valuation & HSN Strip');
  assert.ok(clientsSrc.includes('computeKhataPortfolioSummary'), 'ClientsView wires Khata Command Strip');
  assert.ok(clientsSrc.includes('buildWhatsAppPaymentReminder'), 'ClientsView wires 1-tap WhatsApp + UPI Link');
  assert.ok(quickSrc.includes("view === 'connect-sync'") && quickSrc.includes("view === 'newfeatures'"), 'QuickSearch routes connect-sync & newfeatures');
});

console.log(`v5.5.0 Express POS, Live UPI QR, Khata & Stock Strip Tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
