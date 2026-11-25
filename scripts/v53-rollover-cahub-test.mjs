import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  computeFyDateWindow,
  computeYearEndRolloverPlan,
  buildYearEndRolloverArchive,
} from '../src/utils/yearEndRolloverEngine.js';
import {
  buildUnified2bActionRows,
  computeGstr3bTable4FromActions,
  save2bActionDecision,
  loadSaved2bActionMap,
  parseAndSummarizeClientCaBundle,
  aggregateMultiClientCaPortfolio,
} from '../src/utils/caReviewerAnd2bActionEngine.js';
import { reconcileGstr2bFuzzy } from '../src/utils/fuzzyGstr2b.js';
import {
  deriveAutoJournalEntries,
  computeTrialBalance,
  computeBalanceSheet,
} from '../src/utils/doubleEntry.js';
import {
  buildAuditChainFromVouchers,
  buildCaWorkpaperBundle,
  sealCaPackage,
} from '../src/utils/hashChain.js';
import {
  submitFeedbackWithoutLogin,
  getSubmittedFeedbackHistory,
  saveFeedbackBridgeConfig,
} from '../src/utils/zeroLoginFeedback.js';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

console.log('Running v5.3.0 Year-End Rollover, CA Multi-Client Hub, 2B Action Sheet & Zero-Login Tests…');

await test('1. SystemHealthScorecard lives in SettingsView ONLY (not on Dashboard or EnterpriseAiHub)', () => {
  const dash = readFileSync('src/components/Dashboard.jsx', 'utf8');
  const hub = readFileSync('src/components/EnterpriseAiHub.jsx', 'utf8');
  const settings = readFileSync('src/components/SettingsView.jsx', 'utf8');

  assert.equal(dash.includes('SystemHealthScorecard'), false, 'Dashboard must NOT mount SystemHealthScorecard');
  assert.equal(hub.includes('SystemHealthScorecard'), false, 'EnterpriseAiHub must NOT mount SystemHealthScorecard');
  assert.equal(settings.includes('<SystemHealthScorecard'), true, 'SettingsView MUST mount SystemHealthScorecard');
});

await test('2. Year-End Rollover computes 31-Mar AS-2 stock, Debtors/Creditors (net of CN/DN), 43B(h) risk & balanced 1-Apr Opening Voucher', () => {
  const win = computeFyDateWindow('2026-27');
  assert.equal(win.endDate, '2027-03-31');
  assert.equal(win.nextFy, '2027-28');
  assert.equal(win.nextFyStartDate, '2027-04-01');

  const plan = computeYearEndRolloverPlan({
    closingFy: '2026-27',
    profile: { businessName: 'Agrahari Enterprises', gstin: '09AAACH7409R1ZZ' },
    products: [
      // Lower of cost (1600) or selling (1850) = 1600 * 10 = 16,000
      { id: 'P1', name: 'Basmati Rice', hsn: '1006', stock: 10, purchasePrice: 1600, sellingPrice: 1850 },
      // NRV lower than cost (damaged batch: cost 500, selling 400) -> 400 * 5 = 2,000
      { id: 'P2', name: 'Clearance Item', hsn: '8539', stock: 5, purchasePrice: 500, sellingPrice: 400 },
      // Service item must be excluded from physical closing stock
      { id: 'S1', name: 'Installation Service', hsn: '9987', isService: true, stock: 99, sellingPrice: 1000 },
    ],
    clients: [
      { id: 'C1', name: 'Sharma Traders', gstin: '09AAACS1234A1Z5' },
      { id: 'V1', name: 'Verma MSME Packagers', gstin: '09AAACV5678B1Z2', isMsme: true, udyamNo: 'UDYAM-UP-01-0001111' },
    ],
    bills: [
      {
        id: 'B1',
        invoiceNumber: 'INV-001',
        invoiceDate: '2026-10-15',
        invoiceType: 'tax-invoice',
        clientName: 'Sharma Traders',
        clientGstin: '09AAACS1234A1Z5',
        totalAmount: 11800,
        amountPaid: 1800,
        status: 'partial',
        data: {
          invoiceType: 'tax-invoice',
          totals: { taxableAmount: 10000, cgst: 900, sgst: 900, totalTax: 1800, grandTotal: 11800 },
        },
      },
      {
        id: 'CN1',
        invoiceNumber: 'CN-001',
        invoiceDate: '2026-10-20',
        invoiceType: 'credit-note',
        clientName: 'Sharma Traders',
        clientGstin: '09AAACS1234A1Z5',
        totalAmount: 1180,
        amountPaid: 0,
        data: {
          invoiceType: 'credit-note',
          totals: { taxableAmount: 1000, cgst: 90, sgst: 90, totalTax: 180, grandTotal: 1180 },
        },
      },
    ],
    purchases: [
      {
        id: 'PUR1',
        billNumber: 'SUP-99',
        billDate: '2027-02-01',
        supplierName: 'Verma MSME Packagers',
        supplierGstin: '09AAACV5678B1Z2',
        isMsme: true,
        subtotal: 5000,
        cgst: 450,
        sgst: 450,
        totalAmount: 5900,
        amountPaid: 900,
        status: 'partial',
      },
    ],
    debitNotes: [
      {
        id: 'DN1',
        date: '2027-02-10',
        supplierName: 'Verma MSME Packagers',
        supplierGstin: '09AAACV5678B1Z2',
        totalAmount: 500,
      },
    ],
  });

  // Stock: 16,000 + 2,000 = 18,000 (service item skipped)
  assert.equal(plan.inventorySummary.skuCount, 2);
  assert.equal(plan.inventorySummary.closingStockCostValue, 18000);

  // Sharma receivable: (11800 - 1800) - 1180 CN = 8,820
  assert.equal(plan.partySummary.totalReceivables, 8820);
  // Verma MSME payable: (5900 - 900) - 500 DN = 4,500
  assert.equal(plan.partySummary.totalPayables, 4500);
  assert.equal(plan.partySummary.msmeYearEndUnpaidRisk, 4500);

  // 1-April Opening Voucher must be strictly balanced (Dr === Cr)
  assert.equal(plan.accountingSummary.openingVoucherValid, true);
  assert.equal(
    plan.accountingSummary.openingTotalDebit,
    plan.accountingSummary.openingTotalCredit
  );
  assert.equal(plan.accountingSummary.openingVoucher.date, '2027-04-01');

  // Re-running with existing opening voucher detects idempotency (`alreadyRolledOver: true`)
  const secondRun = computeYearEndRolloverPlan({
    closingFy: '2026-27',
    profile: { businessName: 'Agrahari Enterprises', gstin: '09AAACH7409R1ZZ' },
    manualVouchers: [plan.accountingSummary.openingVoucher],
  });
  assert.equal(secondRun.alreadyRolledOver, true);

  const archive = buildYearEndRolloverArchive(plan);
  assert.equal(archive.schema, 'bharat-gst-year-end-rollover-v5.3');
});

await test('3. GSTR-2B Action Sheet enforces Sec 16(2)(aa) warning and computes live GSTR-3B Table 4', () => {
  const store = createMemoryStorage();
  const portal2b = {
    b2b: [
      {
        ctin: '09AAACV5678B1Z2',
        trdnm: 'Verma Packagers',
        inv: [
          { inum: 'INV/26-27/0045', dt: '2026-11-05', val: 11800, cgst: 900, sgst: 900, igst: 0 },
          { inum: 'WRONG-999', dt: '2026-11-08', val: 5900, cgst: 450, sgst: 450, igst: 0 },
        ],
      },
    ],
  };
  const books = [
    {
      id: 'P-45',
      supplierGstin: '09AAACV5678B1Z2',
      supplierName: 'Verma Packagers',
      billNumber: '45',
      billDate: '2026-11-05',
      totalAmount: 11800,
      cgst: 900,
      sgst: 900,
    },
    {
      id: 'P-NO2B',
      supplierGstin: '09AAACS9999K1Z1',
      supplierName: 'Missing Filing Vendor',
      billNumber: 'MF-10',
      billDate: '2026-11-10',
      totalAmount: 23600,
      cgst: 1800,
      sgst: 1800,
    },
  ];

  const recon = reconcileGstr2bFuzzy(portal2b, books);
  const initialRows = buildUnified2bActionRows(recon, loadSaved2bActionMap('09AAACH7409R1ZZ', store));
  const initialT4 = computeGstr3bTable4FromActions(initialRows);

  // Fuzzy match (1800) defaults to ACCEPT_ITC; Missing-in-2B (3600) defaults to DEFER_NEXT_PERIOD; Missing-in-Books (900) defaults to KEEP_PENDING
  assert.equal(initialT4.table4A5EligibleItc, 1800);
  assert.equal(initialT4.deferredMissing2bItc, 3600);
  assert.equal(initialT4.heldPendingItc, 900);
  assert.equal(initialT4.sec16WarningCount, 0);

  // Mark WRONG-999 as REJECT_INELIGIBLE (Table 4D(2)) and force-accept MF-10 (triggers Sec 16(2)(aa) warning!)
  const wrongRow = initialRows.find((r) => r.bucket === 'MISSING_IN_BOOKS');
  const missing2bRow = initialRows.find((r) => r.bucket === 'MISSING_IN_2B');
  save2bActionDecision('09AAACH7409R1ZZ', wrongRow.rowKey, { action: 'REJECT_INELIGIBLE', reasonCode: 'WRONG_GSTIN_UPLOAD' }, store);
  save2bActionDecision('09AAACH7409R1ZZ', missing2bRow.rowKey, { action: 'ACCEPT_ITC' }, store);

  const updatedRows = buildUnified2bActionRows(recon, loadSaved2bActionMap('09AAACH7409R1ZZ', store));
  const updatedT4 = computeGstr3bTable4FromActions(updatedRows);
  assert.equal(updatedT4.table4D2IneligibleRejectedItc, 900);
  assert.equal(updatedT4.table4A5EligibleItc, 1800 + 3600);
  assert.equal(updatedT4.sec16WarningCount, 1, 'Forcing ACCEPT_ITC on missing-in-2B bill must raise Sec 16(2)(aa) warning');
});

await test('4. CA Multi-Client .bharatca Hub decrypts AES-256 bundles, catches SHA-256 tampering & ranks CRITICAL first', async () => {
  // Client 1: Clean encrypted .bharatca package
  const v1 = deriveAutoJournalEntries({
    bills: [{ id: '1', invoiceNumber: 'A1', invoiceDate: '2026-11-01', totalAmount: 1180, subtotal: 1000, cgst: 90, sgst: 90 }],
  });
  const tb1 = computeTrialBalance(v1);
  const bs1 = computeBalanceSheet(tb1);
  const chain1 = await buildAuditChainFromVouchers(v1);
  const cleanBundle = await buildCaWorkpaperBundle({
    profile: { businessName: 'Clean Kirana', gstin: '09AAACC1111A1Z5', state: 'Uttar Pradesh' },
    periodLabel: 'FY 2026-27',
    trialBalance: tb1,
    balanceSheet: bs1,
    gstHealth: { score: 100, grade: 'A+', invoiceCount: 1, errors: [], warnings: [] },
    statutorySummary: { netGstPayable: 180, sec43bAtRiskAmount: 0, sec43bCriticalCount: 0, itrTaxableTurnover: 1000 },
    vouchers: v1,
    auditChain: chain1,
  });
  const encryptedText = await sealCaPackage(cleanBundle, 'caSecret99');
  const cleanCard = await parseAndSummarizeClientCaBundle(encryptedText, 'caSecret99', 'clean.bharatca');
  assert.equal(cleanCard.auditChainVerified, true);
  assert.equal(cleanCard.riskLevel, 'CLEAN');

  // Client 2: Tampered audit chain (1 rupee altered after sealing!)
  const tamperedChain = JSON.parse(JSON.stringify(chain1));
  tamperedChain[0].totalAmount = Number(tamperedChain[0].totalAmount) + 1;
  const tamperedBundle = {
    ...cleanBundle,
    business: { name: 'Tampered Traders', gstin: '09AAACT2222B1Z9', state: 'Uttar Pradesh' },
    auditChain: tamperedChain,
  };
  const tamperedCard = await parseAndSummarizeClientCaBundle(JSON.stringify(tamperedBundle), '', 'tampered.bharatca');
  assert.equal(tamperedCard.auditChainVerified, false, 'Must detect 1-rupee tamper in SHA-256 chain');
  assert.equal(tamperedCard.riskLevel, 'CRITICAL');

  const portfolio = aggregateMultiClientCaPortfolio([cleanCard, tamperedCard]);
  assert.equal(portfolio.totalClients, 2);
  assert.equal(portfolio.criticalClients, 1);
  assert.equal(portfolio.clients[0].businessName, 'Tampered Traders', 'CRITICAL client must sort to top of CA Hub');
});

await test('5. Zero-Login Feedback Bridge submits without login, redacts PII, and supports Web3Forms + local inbox', async () => {
  const store = createMemoryStorage();
  saveFeedbackBridgeConfig({ web3FormsKey: 'w3f-live-test-key' }, store);

  let postedPayload = null;
  const mockFetch = async (url, opts) => {
    postedPayload = { url, body: JSON.parse(opts.body) };
    return { ok: true, json: async () => ({ success: true }) };
  };

  const res = await submitFeedbackWithoutLogin({
    type: 'ERROR',
    appVersion: 'v5.3.0',
    roleOrModule: 'GSTR-1 Export',
    message: 'Error exporting GSTIN 09ABCDE1234F1Z5 phone 9876543210 PIN=123456',
    sanitizedDiagnostics: 'SW Active',
    storage: store,
    fetchImpl: mockFetch,
  });

  assert.equal(res.sentOnline, true);
  assert.equal(res.channel, 'web3forms-email');
  assert.ok(!postedPayload.body.message.includes('09ABCDE1234F1Z5'), 'GSTIN must never leave device in feedback');
  assert.ok(!postedPayload.body.message.includes('9876543210'), 'Phone must never leave device in feedback');
  assert.ok(!postedPayload.body.message.includes('123456'), 'PIN must never leave device in feedback');

  const history = getSubmittedFeedbackHistory(store);
  assert.equal(history.length, 1);
  assert.equal(history[0].id, res.entry.id);
});

await test('6. v5.4.0 Commercial UI Overhaul: ConnectAndSyncHub, AllNewFunctionsHub, 4-Pillar ReportsWorkspace, ExecutiveKpiGrid & SOS Button', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const app = readFileSync('src/App.jsx', 'utf8');
  const dash = readFileSync('src/components/Dashboard.jsx', 'utf8');
  const reports = readFileSync('src/components/ReportsView.jsx', 'utf8');
  const sidebar = readFileSync('src/components/SidebarMenu.jsx', 'utf8');
  const connectHub = readFileSync('src/components/ConnectAndSyncHub.jsx', 'utf8');
  const newFnHub = readFileSync('src/components/NewFunctionsAndSyncHub.jsx', 'utf8');

  assert.ok(css.includes('--bg-glass:') && css.includes('.pro-card') && css.includes('.segmented-tabs'), 'SaaS design tokens & classes must exist in index.css');
  assert.ok(css.includes('.sos-floating-root') && css.includes('.sos-topbar-btn'), 'SOS print-safe & floating styles must exist in index.css');
  assert.ok(app.includes('<SosHelpReviewButton') && app.includes('ConnectAndSyncHub') && app.includes('AllNewFunctionsHubView'), 'App.jsx must wire SOS, ConnectAndSyncHub & AllNewFunctionsHubView');
  assert.ok(sidebar.includes('Connect &amp; Sync') && sidebar.includes('Billing & Khata'), 'SidebarMenu must expose 4-section commercial groups including Connect & Sync');
  assert.ok(dash.includes('<ExecutiveKpiGrid'), 'Dashboard must render ExecutiveKpiGrid');
  assert.ok(reports.includes('<ReportsWorkspace'), 'ReportsView must render 4-pillar ReportsWorkspace');
  assert.ok(connectHub.includes('1. Mobile ↔ Laptop Sync') && connectHub.includes('2. WhatsApp B2B Storefront') && connectHub.includes('3. PC Folder'), 'ConnectAndSyncHub must expose guided sub-tabs');
  assert.ok(newFnHub.includes('NEW_FUNCTIONS_CATALOG'), 'AllNewFunctionsHubView must expose full new-functions directory');
});

console.log(`v5.3–v5.4 Rollover, CA Hub, 2B Action Sheet, Zero-Login & Commercial UI Tests: ${passed} passed, 0 failed`);
