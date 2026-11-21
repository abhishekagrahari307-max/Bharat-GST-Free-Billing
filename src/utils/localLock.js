// Option A — Local-First Vault Encryption + PIN / Recovery Key + L2 Staff Roles
// Implements PBKDF2-HMAC-SHA256 (310,000 iterations) -> AES-256-GCM key wrapping
// (KEK -> DEK), authenticated per-record encryption with AAD (recordId),
// 24-character Recovery Code wrapping, L2 Staff Profiles & Roles, and `.fgsb`
// encrypted backup archives.
// Works identically in Node.js (v18+) and all modern desktop/mobile browsers.

export const DEFAULT_KDF_ITERATIONS = 310000;
export const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // unambiguous 32-char alphabet

export const STAFF_ROLES = [
  {
    id: 'owner',
    label: 'Owner (Admin)',
    badge: '👑',
    desc: 'Full access — all bills, settings, staff PINs, backups, delete & period lock',
  },
  {
    id: 'accountant',
    label: 'Accountant / CA',
    badge: '📊',
    desc: 'All bills, purchases, expenses, GST returns, reports & period close (no PIN/staff wipe)',
  },
  {
    id: 'cashier',
    label: 'Cashier / Billing Counter',
    badge: '🧾',
    desc: 'Create bills, record payments & add customers — cannot delete invoices or change settings',
  },
  {
    id: 'viewer',
    label: 'Viewer / Auditor',
    badge: '👁️',
    desc: 'Read-only access to view invoices, ledgers & reports — cannot add, edit, or delete',
  },
];

const enc = new TextEncoder();
const dec = new TextDecoder();

function getCrypto() {
  if (globalThis.crypto?.subtle) return globalThis.crypto;
  throw new Error('WebCrypto API is unavailable in this environment');
}

function toBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (typeof globalThis.Buffer !== 'undefined') return globalThis.Buffer.from(u8).toString('base64');
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}

function fromBase64(b64) {
  const str = String(b64 || '').trim();
  if (typeof globalThis.Buffer !== 'undefined') return new Uint8Array(globalThis.Buffer.from(str, 'base64'));
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomBytes(len) {
  const buf = new Uint8Array(len);
  getCrypto().getRandomValues(buf);
  return buf;
}

export function generateRecoveryCode() {
  const raw = randomBytes(24);
  let chars = '';
  for (let i = 0; i < 24; i++) {
    chars += RECOVERY_ALPHABET[raw[i] & 31];
  }
  return chars.match(/.{1,4}/g).join('-');
}

export function normaliseRecoveryCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

async function deriveKek(secret, saltBytes, iterations = DEFAULT_KDF_ITERATIONS) {
  const subtle = getCrypto().subtle;
  const baseKey = await subtle.importKey(
    'raw',
    enc.encode(String(secret ?? '')),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function importDek(rawDekBytes) {
  return getCrypto().subtle.importKey(
    'raw',
    rawDekBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportDekBase64(dek) {
  const raw = await getCrypto().subtle.exportKey('raw', dek);
  return toBase64(raw);
}

export async function importDekBase64(b64) {
  return importDek(fromBase64(b64));
}

async function wrapRawDek(rawDekBytes, secret, aadLabel, iterations = DEFAULT_KDF_ITERATIONS) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveKek(secret, salt, iterations);
  const ct = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aadLabel) },
    kek,
    rawDekBytes
  );
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    wrappedKey: toBase64(ct),
    iterations,
  };
}

async function unwrapRawDek(wrapBlob, secret, aadLabel, fallbackIterations = DEFAULT_KDF_ITERATIONS) {
  if (!wrapBlob?.salt || !wrapBlob?.iv || !wrapBlob?.wrappedKey) {
    const err = new Error('Invalid key wrapper');
    err.code = 'invalid-vault';
    throw err;
  }
  const iterations = Number(wrapBlob.iterations) || fallbackIterations;
  const salt = fromBase64(wrapBlob.salt);
  const iv = fromBase64(wrapBlob.iv);
  const ct = fromBase64(wrapBlob.wrappedKey);
  const kek = await deriveKek(secret, salt, iterations);
  try {
    const plain = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(aadLabel) },
      kek,
      ct
    );
    return new Uint8Array(plain);
  } catch {
    const err = new Error('Wrong PIN or recovery key');
    err.code = 'wrong-pin';
    throw err;
  }
}

/**
 * Create a brand-new Option A encrypted vault with Owner PIN + 24-char Recovery Code.
 */
export async function createVault(pin, { ownerName = 'Owner', iterations = DEFAULT_KDF_ITERATIONS, autoLockMinutes = 5 } = {}) {
  const cleanPin = String(pin ?? '').trim();
  if (!/^\d{4,8}$/.test(cleanPin)) {
    throw new Error('PIN must be 4 to 8 digits');
  }
  const rawDek = randomBytes(32);
  const dek = await importDek(rawDek);
  const recoveryCode = generateRecoveryCode();
  const normRecovery = normaliseRecoveryCode(recoveryCode);

  const ownerId = 'u_owner';
  const ownerWrap = await wrapRawDek(rawDek, cleanPin, `wrap:user:${ownerId}`, iterations);
  const recoveryWrap = await wrapRawDek(rawDek, normRecovery, 'wrap:recovery', iterations);

  const vaultMeta = {
    version: 1,
    encrypted: true,
    kdf: 'PBKDF2-SHA256',
    iterations,
    createdAt: new Date().toISOString(),
    autoLockMinutes: Number.isFinite(Number(autoLockMinutes)) ? Number(autoLockMinutes) : 5,
    lockOnHidden: false,
    recoveryWrap,
    users: [
      {
        id: ownerId,
        name: String(ownerName || 'Owner').trim() || 'Owner',
        role: 'owner',
        pinLength: cleanPin.length,
        ...ownerWrap,
      },
    ],
  };

  return { vaultMeta, dek, recoveryCode };
}

/**
 * Unlock vault with a user's PIN (specific userId or matching user).
 */
export async function unlockVaultWithPin(vaultMeta, pin, userId = null) {
  const cleanPin = String(pin ?? '').trim();
  const users = Array.isArray(vaultMeta?.users) ? vaultMeta.users : [];
  if (!users.length) {
    const err = new Error('Vault has no configured users');
    err.code = 'invalid-vault';
    throw err;
  }
  const candidates = userId
    ? users.filter((u) => u.id === userId)
    : users;

  for (const user of candidates) {
    try {
      const rawDek = await unwrapRawDek(
        user,
        cleanPin,
        `wrap:user:${user.id}`,
        vaultMeta.iterations || DEFAULT_KDF_ITERATIONS
      );
      const dek = await importDek(rawDek);
      return {
        dek,
        user: { id: user.id, name: user.name, role: user.role, pinLength: user.pinLength },
      };
    } catch {
      // try next candidate if userId wasn't fixed
    }
  }
  const err = new Error('Wrong PIN');
  err.code = 'wrong-pin';
  throw err;
}

/**
 * Recover vault using the 24-character Recovery Code and set a new Owner PIN.
 * Existing encrypted records are NOT re-encrypted — only the Owner's wrapped DEK updates!
 */
export async function recoverVaultWithCode(vaultMeta, recoveryCode, newOwnerPin) {
  const cleanPin = String(newOwnerPin ?? '').trim();
  if (!/^\d{4,8}$/.test(cleanPin)) {
    throw new Error('New PIN must be 4 to 8 digits');
  }
  const normRecovery = normaliseRecoveryCode(recoveryCode);
  if (normRecovery.length < 16) {
    const err = new Error('Invalid recovery code');
    err.code = 'wrong-recovery';
    throw err;
  }
  let rawDek;
  try {
    rawDek = await unwrapRawDek(
      vaultMeta.recoveryWrap,
      normRecovery,
      'wrap:recovery',
      vaultMeta.iterations || DEFAULT_KDF_ITERATIONS
    );
  } catch {
    const err = new Error('Wrong recovery code');
    err.code = 'wrong-recovery';
    throw err;
  }

  const dek = await importDek(rawDek);
  const users = Array.isArray(vaultMeta.users) ? [...vaultMeta.users] : [];
  const ownerIdx = users.findIndex((u) => u.role === 'owner');
  const owner = ownerIdx >= 0 ? users[ownerIdx] : { id: 'u_owner', name: 'Owner', role: 'owner' };
  const newWrap = await wrapRawDek(
    rawDek,
    cleanPin,
    `wrap:user:${owner.id}`,
    vaultMeta.iterations || DEFAULT_KDF_ITERATIONS
  );
  const updatedOwner = {
    ...owner,
    pinLength: cleanPin.length,
    ...newWrap,
  };
  if (ownerIdx >= 0) users[ownerIdx] = updatedOwner;
  else users.unshift(updatedOwner);

  return {
    vaultMeta: { ...vaultMeta, users, recoveredAt: new Date().toISOString() },
    dek,
    user: { id: updatedOwner.id, name: updatedOwner.name, role: updatedOwner.role, pinLength: updatedOwner.pinLength },
  };
}

/**
 * Change an existing user's PIN without touching any encrypted records.
 */
export async function changeVaultUserPin(vaultMeta, dek, userId, newPin) {
  const cleanPin = String(newPin ?? '').trim();
  if (!/^\d{4,8}$/.test(cleanPin)) throw new Error('PIN must be 4 to 8 digits');
  const rawDek = new Uint8Array(await getCrypto().subtle.exportKey('raw', dek));
  const users = Array.isArray(vaultMeta.users) ? vaultMeta.users : [];
  const target = users.find((u) => u.id === userId) || users[0];
  if (!target) throw new Error('User not found');

  const newWrap = await wrapRawDek(
    rawDek,
    cleanPin,
    `wrap:user:${target.id}`,
    vaultMeta.iterations || DEFAULT_KDF_ITERATIONS
  );
  return {
    ...vaultMeta,
    users: users.map((u) => (u.id === target.id ? { ...u, pinLength: cleanPin.length, ...newWrap } : u)),
  };
}

/**
 * Add a local staff member (Owner / Accountant / Cashier / Viewer) with their own PIN.
 */
export async function addVaultStaffUser(vaultMeta, dek, { name, role = 'cashier', pin }) {
  const cleanName = String(name ?? '').trim();
  const cleanPin = String(pin ?? '').trim();
  if (!cleanName) throw new Error('Staff name is required');
  if (!/^\d{4,8}$/.test(cleanPin)) throw new Error('Staff PIN must be 4 to 8 digits');
  const validRole = STAFF_ROLES.some((r) => r.id === role) ? role : 'cashier';

  const rawDek = new Uint8Array(await getCrypto().subtle.exportKey('raw', dek));
  const userId = `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const wrap = await wrapRawDek(
    rawDek,
    cleanPin,
    `wrap:user:${userId}`,
    vaultMeta.iterations || DEFAULT_KDF_ITERATIONS
  );
  const newUser = {
    id: userId,
    name: cleanName,
    role: validRole,
    pinLength: cleanPin.length,
    ...wrap,
  };
  return {
    vaultMeta: { ...vaultMeta, users: [...(vaultMeta.users || []), newUser] },
    user: { id: newUser.id, name: newUser.name, role: newUser.role, pinLength: newUser.pinLength },
  };
}

/**
 * Remove a staff user (always preserves at least one owner).
 */
export function removeVaultStaffUser(vaultMeta, userId) {
  const users = Array.isArray(vaultMeta?.users) ? vaultMeta.users : [];
  const target = users.find((u) => u.id === userId);
  if (!target) return vaultMeta;
  if (target.role === 'owner' && users.filter((u) => u.role === 'owner').length <= 1) {
    throw new Error('Cannot delete the primary Owner account');
  }
  return {
    ...vaultMeta,
    users: users.filter((u) => u.id !== userId),
  };
}

export function isEncryptedEnvelope(obj) {
  return !!(obj && typeof obj === 'object' && obj.__fgsbEnc === 1 && typeof obj.iv === 'string' && typeof obj.ct === 'string');
}

/**
 * Encrypt any JSON-serializable record with AES-256-GCM + AAD bound to recordId.
 */
export async function sealRecord(dek, recordId, data) {
  if (!recordId) throw new Error('recordId is required for authenticated encryption');
  const iv = randomBytes(12);
  const plaintext = enc.encode(JSON.stringify(data));
  const ct = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(`record:${recordId}`) },
    dek,
    plaintext
  );
  return {
    __fgsbEnc: 1,
    v: 1,
    iv: toBase64(iv),
    ct: toBase64(ct),
  };
}

/**
 * Decrypt a sealed record envelope; verifies AAD (`record:<recordId>`) and GCM auth tag.
 */
export async function openRecord(dek, recordId, envelope) {
  if (!isEncryptedEnvelope(envelope)) return envelope;
  const iv = fromBase64(envelope.iv);
  const ct = fromBase64(envelope.ct);
  try {
    const plain = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(`record:${recordId}`) },
      dek,
      ct
    );
    return JSON.parse(dec.decode(plain));
  } catch {
    const err = new Error(`Tampered or mismatched encrypted record (${recordId})`);
    err.code = 'decrypt-failed';
    throw err;
  }
}

/**
 * Encrypt a full backup object into an authenticated `.fgsb` archive string.
 */
export async function encryptBackupArchive(backupPayload, passphrase, iterations = DEFAULT_KDF_ITERATIONS) {
  const secret = String(passphrase ?? '').trim();
  if (secret.length < 4) throw new Error('Backup password / PIN must be at least 4 characters');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKek(secret, salt, iterations);
  const plaintext = enc.encode(JSON.stringify(backupPayload));
  const ct = await getCrypto().subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode('fgsb-backup-v1') },
    key,
    plaintext
  );
  return JSON.stringify({
    format: 'bharat-gst-encrypted-backup',
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    createdAt: new Date().toISOString(),
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ct),
  }, null, 2);
}

export function isEncryptedBackupPayload(raw) {
  if (!raw) return false;
  if (typeof raw === 'object') return raw.format === 'bharat-gst-encrypted-backup' && !!raw.ct;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed?.format === 'bharat-gst-encrypted-backup' && !!parsed.ct;
  } catch {
    return false;
  }
}

/**
 * Decrypt an encrypted `.fgsb` backup archive using its passphrase / PIN.
 */
export async function decryptBackupArchive(rawInput, passphrase) {
  const envelope = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  if (!isEncryptedBackupPayload(envelope)) {
    throw new Error('Not a valid encrypted .fgsb backup file');
  }
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ct = fromBase64(envelope.ct);
  const key = await deriveKek(String(passphrase ?? '').trim(), salt, Number(envelope.iterations) || DEFAULT_KDF_ITERATIONS);
  try {
    const plain = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode('fgsb-backup-v1') },
      key,
      ct
    );
    return JSON.parse(dec.decode(plain));
  } catch {
    const err = new Error('Wrong backup password or corrupted backup file');
    err.code = 'wrong-password';
    throw err;
  }
}

/**
 * Public-safe summary of vaultMeta (strips salt/iv/wrappedKey before sending to UI).
 */
export function publicVaultInfo(vaultMeta) {
  if (!vaultMeta || !vaultMeta.encrypted) return null;
  const users = (vaultMeta.users || []).map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    length: u.pinLength || 6,
  }));
  const primary = users[0] || { length: 6 };
  return {
    encrypted: true,
    version: vaultMeta.version || 1,
    kdf: vaultMeta.kdf || 'PBKDF2-SHA256',
    iterations: vaultMeta.iterations || DEFAULT_KDF_ITERATIONS,
    hasRecoveryCode: !!vaultMeta.recoveryWrap?.wrappedKey,
    autoLockMinutes: vaultMeta.autoLockMinutes ?? 5,
    lockOnHidden: !!vaultMeta.lockOnHidden,
    length: primary.length,
    users,
  };
}

/**
 * L2 Role permission matrix for UI & API route guards.
 */
export function canRolePerform(role = 'owner', action) {
  const r = role || 'owner';
  if (r === 'owner') return true;
  if (r === 'viewer') {
    return action === 'view' || action === 'export_pdf';
  }
  if (r === 'cashier') {
    return [
      'view',
      'export_pdf',
      'create_bill',
      'create_receipt',
      'create_client',
    ].includes(action);
  }
  if (r === 'accountant') {
    return ![
      'manage_security',
      'manage_users',
      'wipe_data',
    ].includes(action);
  }
  return true;
}

/**
 * Check whether `role` is permitted to execute an HTTP mutation (`POST`/`PUT`/`DELETE`) on `apiPath`.
 * Returns `null` if allowed, or an error string if blocked.
 */
export function checkRoleApiPermission(role, method, apiPath) {
  const m = String(method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return null;
  if (!role || role === 'owner') return null;

  // Lock verification & preferences reading/unlocking are always reachable
  if (apiPath.startsWith('/api/lock/verify') || apiPath === '/api/client-errors') return null;

  if (role === 'viewer') {
    return 'Viewer / Auditor role is read-only and cannot modify bills or settings.';
  }

  if (role === 'cashier') {
    if (m === 'DELETE') {
      return 'Cashier role cannot delete invoices, products, or records. Ask an Owner or Accountant.';
    }
    const allowedCashierPosts = [
      '/api/bills',
      '/api/clients',
      '/api/receipts',
      '/api/cash-book',
      '/api/save-pdf',
      '/api/local-prefs',
    ];
    if (
      allowedCashierPosts.includes(apiPath) ||
      /^\/api\/meta\/[^/]+\/(increment|raise)$/.test(apiPath)
    ) {
      return null;
    }
    return 'Cashier role can create bills, receipts, and customers only — settings and backups require Owner access.';
  }

  if (role === 'accountant') {
    if (apiPath.startsWith('/api/lock/') || apiPath === '/api/import') {
      return 'Only the Owner can change Vault PINs, staff accounts, or overwrite books via import.';
    }
    return null;
  }

  return null;
}
