// Tamper-Proof SHA-256 Hash-Chained Audit Trail & CA Workpaper (.bharatca) Engine (v3.0.0)
// Works identically in WebCrypto (Browser/PWA) and Node.js (server/test).
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

export const GENESIS_HASH = '0'.repeat(64);
export const CA_PACKAGE_MAGIC = 'BHARAT_GST_CA_PACKAGE_V1';

const PBKDF2_ROUNDS = 310000;

function getSubtle() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  return null;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(input) {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  const data = new TextEncoder().encode(text);
  const subtle = getSubtle();
  const digest = await subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

function canonicalBlockPayload(block) {
  return JSON.stringify({
    index: Number(block.index),
    prevHash: String(block.prevHash || GENESIS_HASH),
    voucherId: String(block.voucherId || ''),
    voucherNo: String(block.voucherNo || ''),
    voucherType: String(block.voucherType || ''),
    date: String(block.date || ''),
    totalAmount: Number(block.totalAmount || 0).toFixed(2),
    narration: String(block.narration || ''),
  });
}

/**
 * Builds a deterministic SHA-256 hash-chained ledger from all double-entry vouchers.
 * Compliant with MCA Companies (Accounts) Amendment Rule 3(1) audit trail verification.
 */
export async function buildAuditChainFromVouchers(vouchers = []) {
  const sorted = [...(Array.isArray(vouchers) ? vouchers : [])].sort((a, b) => {
    const da = String(a?.date || '');
    const db = String(b?.date || '');
    if (da !== db) return da.localeCompare(db);
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });

  const chain = [];
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < sorted.length; i += 1) {
    const v = sorted[i];
    const totalAmount = Array.isArray(v?.lines)
      ? Math.round(v.lines.reduce((s, l) => s + (Number(l?.debit) || 0), 0) * 100) / 100
      : 0;
    const draft = {
      index: i + 1,
      prevHash,
      voucherId: String(v?.id || `v-${i + 1}`),
      voucherNo: String(v?.voucherNo || ''),
      voucherType: String(v?.voucherType || 'JOURNAL'),
      date: String(v?.date || ''),
      totalAmount,
      narration: String(v?.narration || ''),
    };
    const hash = await sha256Hex(canonicalBlockPayload(draft));
    chain.push({ ...draft, hash });
    prevHash = hash;
  }
  return chain;
}

/**
 * Verifies every block in a SHA-256 hash chain from GENESIS_HASH to HEAD.
 */
export async function verifyAuditChain(chain = []) {
  if (!Array.isArray(chain)) {
    return { valid: false, checkedCount: 0, headHash: GENESIS_HASH, tamperedIndex: 0, reason: 'Invalid chain format' };
  }
  if (chain.length === 0) {
    return { valid: true, checkedCount: 0, headHash: GENESIS_HASH, tamperedIndex: null, reason: null };
  }
  let expectedPrev = GENESIS_HASH;
  for (let i = 0; i < chain.length; i += 1) {
    const block = chain[i];
    if (!block || block.prevHash !== expectedPrev) {
      return {
        valid: false,
        checkedCount: i,
        headHash: chain[chain.length - 1]?.hash || GENESIS_HASH,
        tamperedIndex: i + 1,
        reason: `Broken prevHash link at block #${i + 1}`,
      };
    }
    const recomputed = await sha256Hex(canonicalBlockPayload(block));
    if (recomputed !== block.hash) {
      return {
        valid: false,
        checkedCount: i,
        headHash: chain[chain.length - 1]?.hash || GENESIS_HASH,
        tamperedIndex: i + 1,
        reason: `SHA-256 payload mismatch at block #${i + 1} (${block.voucherNo || block.voucherId})`,
      };
    }
    expectedPrev = block.hash;
  }
  return {
    valid: true,
    checkedCount: chain.length,
    headHash: expectedPrev,
    tamperedIndex: null,
    reason: null,
  };
}

/**
 * Assembles a Chartered Accountant (.bharatca) Workpaper Bundle.
 */
export async function buildCaWorkpaperBundle({
  profile = {},
  periodLabel = '',
  trialBalance = null,
  balanceSheet = null,
  gstHealth = null,
  statutorySummary = null,
  vouchers = [],
  auditChain = [],
} = {}) {
  const verification = await verifyAuditChain(auditChain);
  return {
    magic: CA_PACKAGE_MAGIC,
    software: 'Bharat GST Free Billing',
    version: '5.3.0',
    generatedAt: new Date().toISOString(),
    business: {
      name: profile?.businessName || 'My Business',
      gstin: profile?.gstin || '',
      pan: profile?.pan || (profile?.gstin ? String(profile.gstin).slice(2, 12) : ''),
      state: profile?.state || '',
    },
    periodLabel,
    auditTrailProof: {
      algorithm: 'SHA-256 Hash Chain (GENESIS -> HEAD)',
      verified: verification.valid,
      blockCount: verification.checkedCount,
      headHash: verification.headHash,
    },
    trialBalance,
    balanceSheet,
    gstHealthSummary: gstHealth
      ? {
          score: gstHealth.score,
          grade: gstHealth.grade,
          invoiceCount: gstHealth.invoiceCount,
          errorCount: gstHealth.errors?.length || 0,
          warningCount: gstHealth.warnings?.length || 0,
        }
      : null,
    statutorySummary: statutorySummary || null,
    voucherCount: Array.isArray(vouchers) ? vouchers.length : 0,
    vouchers: Array.isArray(vouchers) ? vouchers : [],
    auditChain: Array.isArray(auditChain) ? auditChain : [],
  };
}

/**
 * Seals a CA Workpaper Bundle (.bharatca) optionally with AES-256-GCM + PBKDF2-SHA256 (310,000 rounds).
 */
export async function sealCaPackage(bundle, passphrase = '') {
  const plainJson = JSON.stringify(bundle, null, 2);
  const cleanPass = String(passphrase || '').trim();
  if (!cleanPass) {
    return plainJson;
  }
  const subtle = getSubtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const keyMat = await subtle.importKey('raw', new TextEncoder().encode(cleanPass), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ROUNDS, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, new TextEncoder().encode(plainJson));
  return JSON.stringify(
    {
      magic: CA_PACKAGE_MAGIC,
      encrypted: true,
      cipher: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ROUNDS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(ct)),
    },
    null,
    2
  );
}

/**
 * Opens an plain or AES-256-GCM encrypted .bharatca CA Workpaper Package.
 */
export async function openCaPackage(text, passphrase = '') {
  const parsed = typeof text === 'string' ? JSON.parse(text) : text;
  if (!parsed || parsed.magic !== CA_PACKAGE_MAGIC) {
    throw new Error('Not a valid .bharatca CA Workpaper Package.');
  }
  if (!parsed.encrypted) {
    return parsed;
  }
  const cleanPass = String(passphrase || '').trim();
  if (!cleanPass) {
    throw new Error('This .bharatca package is AES-256-GCM encrypted. Enter the CA package password to open it.');
  }
  const subtle = getSubtle();
  const salt = base64ToBytes(parsed.salt);
  const iv = base64ToBytes(parsed.iv);
  const ciphertext = base64ToBytes(parsed.ciphertext);
  const keyMat = await subtle.importKey('raw', new TextEncoder().encode(cleanPass), 'PBKDF2', false, ['deriveKey']);
  const aesKey = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: Number(parsed.iterations) || PBKDF2_ROUNDS, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  let pt;
  try {
    pt = await subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);
  } catch {
    throw new Error('Incorrect password or tampered .bharatca ciphertext.');
  }
  return JSON.parse(new TextDecoder().decode(pt));
}
