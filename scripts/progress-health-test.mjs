import assert from 'node:assert/strict';
import {
  startOperation,
  addOperationDestinationOutcome,
  finishOperation,
  cancelOperation,
  getOperationById,
  getOperationsSnapshot,
  resetAllOperationsForTest,
  sanitizeOperationText,
} from '../src/utils/operationRegistry.js';
import {
  triggerTrackedBrowserDownload,
  runTrackedExportJob,
} from '../src/utils/trackedDownload.js';
import {
  evaluateScopedSystemHealth,
  isValidNumericHsnCode,
} from '../src/utils/systemHealthEvaluator.js';
import {
  setAdminLockPin,
  verifyAdminLockPin,
  clearAdminLockPin,
  isStaffModeLocked,
  lockAdminSession,
  buildWhatsAppPaymentReminder,
  getSandboxDemoSeed,
} from '../src/utils/shopEssentials.js';
import { HELP_DICTIONARY_TERMS } from '../src/data/helpDictionary.js';

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
    dump: () => Object.fromEntries(map.entries()),
  };
}

console.log('Running Progress, Tracked Download, Scoped Health & Shop Essentials Tests (v5.2.0)…');

await test('1. Concurrent jobs stay isolated without overwriting each other', () => {
  resetAllOperationsForTest();
  const jobA = startOperation({ category: 'pdf', label: 'Invoice PDF #101', phase: 'Rendering…' });
  const jobB = startOperation({ category: 'backup', label: 'Backup .fgsb', total: 4, completed: 1 });

  assert.equal(getOperationsSnapshot().length, 2);
  const opA = getOperationById(jobA);
  const opB = getOperationById(jobB);
  assert.equal(opA.indeterminate, true);
  assert.equal(opA.percent, null, 'Indeterminate job must NOT invent a fake percentage');
  assert.equal(opB.indeterminate, false);
  assert.equal(opB.percent, 25);
});

await test('2. Failed, partial, and cancelled jobs NEVER jump to 100%', () => {
  resetAllOperationsForTest();
  const failId = startOperation({ category: 'bulk-pdf', label: 'Bulk ZIP', total: 10, completed: 4 });
  finishOperation(failId, { status: 'failed', error: 'Canvas OOM on bill 5' });
  const failedOp = getOperationById(failId);
  assert.equal(failedOp.status, 'failed');
  assert.equal(failedOp.percent, 40, 'Failed job must keep actual 40%, never jump to 100%');

  let cancelHookRan = false;
  const cancelId = startOperation({
    category: 'bulk-pdf',
    label: 'Bulk Combined PDF',
    total: 20,
    completed: 5,
    onCancel: () => { cancelHookRan = true; },
  });
  cancelOperation(cancelId);
  const cancelledOp = getOperationById(cancelId);
  assert.equal(cancelHookRan, true);
  assert.equal(cancelledOp.status, 'cancelled');
  assert.equal(cancelledOp.percent, 25, 'Cancelled job must preserve completed 25%, never 100%');

  const partialId = startOperation({ category: 'import', label: 'Tally Import', total: 10, completed: 10 });
  finishOperation(partialId, { status: 'partial', completed: 10, total: 10 });
  assert.ok(getOperationById(partialId).percent < 100, 'Partial job must not report 100% clean success');
});

await test('3. Sensitive GSTIN, PAN, phone, PIN, and password strings are redacted', () => {
  const dirty = 'Backup for 09ABCDE1234F1Z5 phone 9876543210 PIN: 482910 password=mySecretVaultKey123';
  const clean = sanitizeOperationText(dirty);
  assert.ok(!clean.includes('09ABCDE1234F1Z5'), 'GSTIN must be redacted');
  assert.ok(!clean.includes('9876543210'), 'Phone number must be redacted');
  assert.ok(!clean.includes('482910'), 'PIN must be redacted');
  assert.ok(!clean.includes('mySecretVaultKey123'), 'Password must be redacted');
  assert.ok(clean.includes('[GSTIN]'));
});

await test('4. Multi-destination outcomes record Browser Download vs Folder vs Drive separately', () => {
  resetAllOperationsForTest();
  const id = startOperation({ category: 'pdf', label: 'Invoice #12' });
  addOperationDestinationOutcome(id, { destination: 'Browser Download', status: 'initiated' });
  addOperationDestinationOutcome(id, { destination: 'Saved Invoices Folder', status: 'verified' });
  addOperationDestinationOutcome(id, { destination: 'Google Drive', status: 'failed', detail: 'Offline' });
  const op = getOperationById(id);
  assert.equal(op.destinations.length, 3);
  assert.equal(op.destinations[0].status, 'initiated');
  assert.equal(op.destinations[1].status, 'verified');
  assert.equal(op.destinations[2].status, 'failed');
});

await test('5. triggerTrackedBrowserDownload rejects 0-byte blobs and reports DOWNLOAD_INITIATED honestly', async () => {
  resetAllOperationsForTest();
  assert.throws(
    () => triggerTrackedBrowserDownload({ content: '', filename: 'empty.csv', label: 'Empty CSV' }),
    /0 bytes/i
  );

  let revokedImmediately = false;
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  const origDoc = globalThis.document;
  let clickedDownloadName = null;

  URL.createObjectURL = () => 'blob:mock-download-url';
  URL.revokeObjectURL = () => { revokedImmediately = true; };
  globalThis.document = {
    body: { appendChild() {} },
    createElement() {
      return {
        style: {},
        click() { clickedDownloadName = this.download; },
        remove() {},
      };
    },
  };

  try {
    const res = await runTrackedExportJob({
      category: 'gstr',
      label: 'GSTR-1 JSON (112026)',
      portalAdvisory: 'Validate on GST Portal before filing',
      buildFn: async ({ setPhase }) => {
        setPhase('Serializing B2B & HSN sections…');
        return { content: '{"gstin":"09AAACH7409R1ZZ"}', mimeType: 'application/json', filename: 'GSTR1.json' };
      },
    });
    assert.equal(clickedDownloadName, 'GSTR1.json');
    assert.equal(res.outcome, 'DOWNLOAD_INITIATED');
    assert.equal(revokedImmediately, false, 'URL.revokeObjectURL must NOT fire synchronously before browser reads blob');
    const op = getOperationById(res.opId);
    assert.ok(op.phase.toLowerCase().includes('browser download initiated'));
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    globalThis.document = origDoc;
  }
});

await test('6. HSN validator strictly requires 4, 6, or 8 numeric digits (rejects "abcd" and 5-digit strings)', () => {
  assert.equal(isValidNumericHsnCode('abcd'), false, '"abcd" must NEVER pass HSN check');
  assert.equal(isValidNumericHsnCode('123'), false);
  assert.equal(isValidNumericHsnCode('12345'), false, '5-digit HSN is invalid');
  assert.equal(isValidNumericHsnCode('1006'), true);
  assert.equal(isValidNumericHsnCode('847130'), true);
  assert.equal(isValidNumericHsnCode('30049099'), true);
});

await test('7. Scoped System Health returns UNKNOWN for empty inventory & untagged MSME purchases, and WARN for unverified folder handle', () => {
  const steps = [];
  const res = evaluateScopedSystemHealth({
    products: [],
    bills: [],
    purchases: [{ id: 'p1', supplierName: 'Untagged Vendor', totalAmount: 5000, date: '2026-08-01' }],
    clients: [],
    profile: { businessName: 'Agrahari Kirana', gstin: '09AAACH7409R1ZZ', state: 'Uttar Pradesh' },
    backupHealth: { overdue: false, daysSince: null },
    backupMeta: { lastBackupAt: null },
    backupSettings: { autoSyncLocalFolder: true },
    p2pPendingCount: 2,
    swStatus: 'registered-uncontrolled',
    storageFreeMB: 512,
    fy: '2026-27',
    onCheckCompleted: (done, total, check) => steps.push(`${done}/${total}:${check.id}`),
  });

  assert.equal(steps.length, 8, 'Must emit exact 1/8..8/8 deterministic check completions');
  assert.equal(res.totalChecks, 8);

  const byId = Object.fromEntries(res.checks.map((c) => [c.id, c]));
  assert.equal(byId['hsn-hygiene'].status, 'unknown', 'Empty inventory must be UNKNOWN, not Pass');
  assert.equal(byId['sec-43b-advisory'].status, 'unknown', 'Purchases without MSME tags must be UNKNOWN, not 0 alerts Pass');
  assert.equal(byId['folder-mirror'].status, 'warn', 'Enabled folder mirror without verified write must WARN, never 100% Safe');
  assert.equal(byId['p2p-queue'].status, 'warn', 'Unacknowledged P2P queue items must surface WARN');
  assert.equal(byId['pwa-controller'].status, 'warn', 'Uncontrolled SW must NOT claim active offline control');
});

await test('8. Scoped System Health catches non-numeric HSN ("abcd") as FAIL', () => {
  const res = evaluateScopedSystemHealth({
    products: [
      { id: '1', name: 'Bad HSN Item', hsn: 'abcd', sellingPrice: 100, taxPercent: 18 },
      { id: '2', name: 'Good Item', hsn: '847130', sellingPrice: 500, gstRate: 18 },
    ],
    bills: [],
    purchases: [],
    profile: { businessName: 'Tech Mart', gstin: '09AAACH7409R1ZZ', state: 'Uttar Pradesh' },
    backupHealth: { overdue: false, daysSince: 0 },
    backupMeta: { lastBackupAt: '2026-11-21T08:00:00Z', lastBackupDestination: 'AES-256 .fgsb', lastBackupEncrypted: true },
  });
  const invCheck = res.checks.find((c) => c.id === 'hsn-hygiene');
  assert.equal(invCheck.status, 'fail', 'Item with HSN "abcd" must trigger FAIL');
  assert.ok(invCheck.detail.includes('1 invalid numeric HSN'));
});

await test('9. Shopkeeper Essentials: Salted Staff PIN (never plain base64) + 5-attempt lockout + session lock', () => {
  const local = createMemoryStorage();
  const session = createMemoryStorage();

  setAdminLockPin('2468', local, session);
  const rawStored = JSON.stringify(local.dump());
  assert.ok(!rawStored.includes('2468'), 'Raw PIN must never be stored');
  assert.ok(!rawStored.includes(Buffer.from('2468').toString('base64')), 'Plain btoa(pin) must never be stored');
  assert.equal(isStaffModeLocked({ storage: local, session }), true);

  // Wrong attempts trigger 5-attempt lockout
  for (let i = 1; i <= 5; i += 1) {
    const r = verifyAdminLockPin('0000', { storage: local, session, nowMs: 1000 });
    assert.equal(r.ok, false);
    if (i === 5) assert.equal(r.lockedOut, true);
  }
  // Even correct PIN is blocked during 5-min lockout window
  const duringLockout = verifyAdminLockPin('2468', { storage: local, session, nowMs: 2000 });
  assert.equal(duringLockout.ok, false);
  assert.equal(duringLockout.lockedOut, true);

  // Unlocks cleanly after 5-min lockout expires
  const afterWindow = verifyAdminLockPin('2468', { storage: local, session, nowMs: 1000 + 6 * 60 * 1000 });
  assert.equal(afterWindow.ok, true);
  assert.equal(isStaffModeLocked({ storage: local, session }), false);

  lockAdminSession(session);
  assert.equal(isStaffModeLocked({ storage: local, session }), true);

  const cleared = clearAdminLockPin('2468', { storage: local, session });
  assert.equal(cleared.ok, true);
  assert.equal(isStaffModeLocked({ storage: local, session }), false);
});

await test('10. Shopkeeper Essentials: WhatsApp + UPI link, Canonical Demo Seed & Hinglish Dictionary', () => {
  const wa = buildWhatsAppPaymentReminder({
    businessName: 'Agrahari Traders',
    partyName: 'Sharma Store',
    partyPhone: '9876543210',
    pendingAmount: 1450.5,
    upiId: 'agrahari@upi',
    dueInvoiceNo: 'INV-42',
  });
  assert.ok(wa.url.startsWith('https://wa.me/919876543210?text='));
  assert.ok(wa.upiUri.includes('upi://pay?pa=agrahari%40upi'));
  assert.ok(wa.message.includes('1450.50'));

  const demo = getSandboxDemoSeed('2026-11-21');
  assert.equal(demo.products.length, 3);
  assert.ok(demo.products.every((p) => p.taxPercent === p.gstRate && isValidNumericHsnCode(p.hsn)));
  assert.ok(demo.clients.some((c) => c.isMsme && c.udyamNo));
  assert.ok(HELP_DICTIONARY_TERMS.length >= 12);
});

console.log(`Progress, Tracked Download, Scoped Health & Shop Essentials Tests: ${passed} passed, 0 failed`);
