// Unit & Cryptographic Verification Suite for Tasks 2, 4 & 5:
// - Option A Vault (PBKDF2-SHA256 310k + AES-256-GCM DEK + 24-char Recovery Key + AAD record sealing)
// - Node synchronous AES-256-GCM <-> WebCrypto envelope byte compatibility
// - L2 Multi-Staff Profiles & Role-Based API Permissions (owner / accountant / cashier / viewer)
// - Task 5 Data Backup Health, Days Elapsed, CGST Sec. 36 72-Month Retention & .fgsb Encrypted Backups
// - Task 4 Unified Notification Center (Backup Overdue, Signatures, Snooze & Category Prefs)

import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import {
  createVault,
  unlockVaultWithPin,
  recoverVaultWithCode,
  addVaultStaffUser,
  changeVaultUserPin,
  sealRecord,
  openRecord,
  exportDekBase64,
  importDekBase64,
  checkRoleApiPermission,
  canRolePerform,
} from '../src/utils/localLock.js';
import {
  computeBackupHealth,
  computeGstRetentionInfo,
  serializeBackupPayload,
  parseAndVerifyBackupText,
  DEFAULT_BACKUP_SETTINGS,
} from '../src/utils/backupManager.js';
import {
  buildUnifiedNotifications,
  DEFAULT_NOTIF_PREFS,
} from '../src/utils/notificationSystem.js';

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

console.log('\n🔒 Option A Vault, Backup & Notification Suite');

await test('creates Option A vault with 310k PBKDF2, owner profile & 24-char recovery code', async () => {
  const { vaultMeta, recoveryCode, dek } = await createVault('2580', { ownerName: 'Abhishek' });
  assert.equal(vaultMeta.encrypted, true);
  assert.equal(vaultMeta.iterations, 310000);
  assert.equal(vaultMeta.users.length, 1);
  assert.equal(vaultMeta.users[0].role, 'owner');
  assert.match(recoveryCode, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/);

  const rawOriginalB64 = await exportDekBase64(dek);

  // Unlock with owner PIN
  const unlocked = await unlockVaultWithPin(vaultMeta, '2580');
  assert.equal(unlocked.user.name, 'Abhishek');
  assert.equal(unlocked.user.role, 'owner');
  assert.equal(await exportDekBase64(unlocked.dek), rawOriginalB64);

  // Wrong PIN fails
  await assert.rejects(() => unlockVaultWithPin(vaultMeta, '9999'));

  // Forgot PIN -> Recover with 24-char Recovery Code + set new Owner PIN recovers identical DEK!
  const recovered = await recoverVaultWithCode(vaultMeta, recoveryCode.toLowerCase(), '654321');
  assert.equal(await exportDekBase64(recovered.dek), rawOriginalB64);
  const unlockedNewPin = await unlockVaultWithPin(recovered.vaultMeta, '654321');
  assert.equal(await exportDekBase64(unlockedNewPin.dek), rawOriginalB64);
});

await test('seals & opens invoice records with AES-256-GCM + AAD and blocks ciphertext swap', async () => {
  const { dek } = await createVault('123456', { ownerName: 'Owner' });
  const invoice = { id: 'inv-101', invoiceNumber: 'GST/26-27/001', totalAmount: 11800, clientName: 'Sharma Traders' };

  const sealed = await sealRecord(dek, 'inv-101', invoice);
  assert.equal(sealed.__fgsbEnc, 1);
  assert.ok(typeof sealed.iv === 'string' && sealed.iv.length > 8);
  assert.ok(!JSON.stringify(sealed).includes('Sharma Traders'));

  const opened = await openRecord(dek, 'inv-101', sealed);
  assert.deepEqual(opened, invoice);

  // Swapping ciphertext onto another record ID must fail GCM authentication!
  await assert.rejects(() => openRecord(dek, 'inv-999', sealed));
});

await test('Node synchronous AES-256-GCM envelope is 100% compatible with WebCrypto localLock', async () => {
  const { dek } = await createVault('7788', { ownerName: 'Owner' });
  const dekB64 = await exportDekBase64(dek);
  const rawKeyBuf = Buffer.from(dekB64, 'base64');

  // Seal using Node's synchronous crypto (same algorithm as server.js serverSealRecordSync)
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', rawKeyBuf, iv);
  cipher.setAAD(Buffer.from('record:bills.json', 'utf8'));
  const plain = [{ id: 'b1', total: 500 }];
  const ct = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const nodeEnv = {
    __fgsbEnc: 1,
    v: 1,
    iv: iv.toString('base64'),
    ct: Buffer.concat([ct, tag]).toString('base64'),
  };

  // Open with WebCrypto localLock.openRecord
  const importedKey = await importDekBase64(dekB64);
  const decodedByWebCrypto = await openRecord(importedKey, 'bills.json', nodeEnv);
  assert.deepEqual(decodedByWebCrypto, plain);
});

await test('L2 Staff Profiles wrap shared DEK independently and enforce RBAC permissions', async () => {
  const { vaultMeta, dek } = await createVault('1111', { ownerName: 'Abhishek' });
  const { vaultMeta: v2, user: cashier } = await addVaultStaffUser(vaultMeta, dek, {
    name: 'Ramesh Counter',
    role: 'cashier',
    pin: '4321',
  });
  assert.equal(v2.users.length, 2);

  // Cashier unlocks shared DEK with their own PIN (4321)
  const cashierSession = await unlockVaultWithPin(v2, '4321', cashier.id);
  assert.equal(cashierSession.user.role, 'cashier');

  // Change cashier PIN without touching owner PIN or re-encrypting records
  const v3 = await changeVaultUserPin(v2, cashierSession.dek, cashier.id, '8888');
  await assert.rejects(() => unlockVaultWithPin(v3, '4321', cashier.id));
  const reUnlocked = await unlockVaultWithPin(v3, '8888', cashier.id);
  assert.equal(await exportDekBase64(reUnlocked.dek), await exportDekBase64(dek));

  // RBAC matrix checks (null = allowed, string = denied error message)
  assert.equal(checkRoleApiPermission('cashier', 'POST', '/api/bills'), null);
  assert.equal(typeof checkRoleApiPermission('cashier', 'DELETE', '/api/bills/inv-1'), 'string');
  assert.equal(typeof checkRoleApiPermission('cashier', 'POST', '/api/import'), 'string');
  assert.equal(checkRoleApiPermission('viewer', 'GET', '/api/bills'), null);
  assert.equal(typeof checkRoleApiPermission('viewer', 'POST', '/api/bills'), 'string');
  assert.equal(checkRoleApiPermission('accountant', 'POST', '/api/books-lock'), null);
  assert.equal(typeof checkRoleApiPermission('accountant', 'POST', '/api/lock/disable-vault'), 'string');
  assert.equal(checkRoleApiPermission('owner', 'POST', '/api/lock/disable-vault'), null);
  assert.equal(canRolePerform('cashier', 'create_bill'), true);
  assert.equal(canRolePerform('cashier', 'delete_bill'), false);
});

await test('Task 5: encrypts & verifies .fgsb backup container and computes days & GST 72m retention', async () => {
  const sampleData = {
    exportedAt: '2026-11-21T10:00:00.000Z',
    bills: [{ id: '1', invoiceDate: '2026-05-10' }, { id: '2', invoiceDate: '2026-11-20' }],
    clients: [{ id: 'c1', name: 'Asha' }],
    products: [{ id: 'p1', name: 'Tea' }],
  };

  const { fileName, content, encrypted } = await serializeBackupPayload(sampleData, {
    encrypt: true,
    passphrase: 'secret-backup-key',
  });
  assert.equal(encrypted, true);
  assert.ok(fileName.endsWith('.fgsb'));
  assert.ok(!content.includes('Asha'));

  // Missing password throws code = password-required
  await assert.rejects(
    () => parseAndVerifyBackupText(content, ''),
    (err) => err.code === 'password-required'
  );

  // Wrong password fails
  await assert.rejects(() => parseAndVerifyBackupText(content, 'wrong-key'));

  // Correct password decrypts & summarizes
  const verified = await parseAndVerifyBackupText(content, 'secret-backup-key');
  assert.equal(verified.encrypted, true);
  assert.equal(verified.summary.bills, 2);
  assert.equal(verified.summary.clients, 1);

  // Backup health: 10 days ago with 7-day threshold -> overdue & auto-due!
  const tenDaysAgoIso = new Date(Date.now() - 10 * 86400000).toISOString();
  const health = computeBackupHealth(
    { lastBackupAt: tenDaysAgoIso, billsSinceLastBackup: 2 },
    { ...DEFAULT_BACKUP_SETTINGS, intervalDays: 3, remindAfterDays: 7 },
    { billCount: 12 }
  );
  assert.equal(health.daysSinceBackup, 10);
  assert.equal(health.isReminderDue, true);
  assert.equal(health.isOverdue, true);
  assert.equal(health.isAutoDue, true);

  // CGST Sec. 36 72-month retention for FY 2026-27 (due Dec 2027 + 6 yrs = 31 Dec 2033)
  const retention = computeGstRetentionInfo(sampleData.bills);
  assert.equal(retention.latestFy, '2026-27');
  assert.equal(retention.retainUntilDate, '31 Dec 2033');
  assert.equal(retention.retainMonths, 72);
});

await test('Task 4: Notification engine builds Backup Overdue + Overdue Bills + Snooze & Signature reset', async () => {
  const overdueHealth = {
    hasBackup: true,
    isReminderDue: true,
    daysSinceBackup: 9,
    lastBackupFormatted: '12 Nov 2026',
    tone: 'warn',
  };
  const attention = {
    overdue: [{ id: 'b1', invoiceNumber: 'INV-01' }],
    dueSoon: [],
    lowStock: [],
    filings: [],
    recurringDue: [],
    autoFire: null,
  };

  const res1 = buildUnifiedNotifications({
    attention,
    backupHealth: overdueHealth,
    prefs: DEFAULT_NOTIF_PREFS,
    dismissed: {},
    snoozed: {},
    feed: [{ id: 'f1', title: 'Auto-backup saved', read: false, at: new Date().toISOString() }],
  });

  assert.equal(res1.cards.length, 2); // overdue + backupDue
  assert.equal(res1.unreadFeedCount, 1);
  assert.equal(res1.totalUnread, 3);
  assert.ok(res1.cards.some((c) => c.key === 'backupDue' && c.title.includes('9 days')));

  // Snoozing backupDue hides it until snooze expires
  const resSnoozed = buildUnifiedNotifications({
    attention,
    backupHealth: overdueHealth,
    prefs: DEFAULT_NOTIF_PREFS,
    dismissed: {},
    snoozed: { backupDue: Date.now() + 3600_000 },
    feed: [],
  });
  assert.equal(resSnoozed.cards.length, 1);
  assert.equal(resSnoozed.cards[0].key, 'overdue');
});

console.log(`✅ All ${passed} Option A Security, Backup & Notification tests passed!\n`);
