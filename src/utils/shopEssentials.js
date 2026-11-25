// Shopkeeper Essentials Utility (v5.2.0)
// 1. Salted SHA-256 Staff / Operator Lock PIN with 5-attempt lockout (NEVER plain base64 `btoa`!)
// 2. WhatsApp Payment Reminder + UPI Deep-Link (`upi://pay`) Generator
// 3. 1-Click Canonical Sandbox / Demo Store Data Seed (aligned with canonical taxPercent/gstRate schema)
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

const STAFF_PIN_HASH_KEY = 'bharatgst_admin_pin_v2';
const STAFF_PIN_ATTEMPTS_KEY = 'bharatgst_admin_pin_attempts_v2';
const STAFF_SESSION_UNLOCKED_KEY = 'bharatgst_admin_unlocked';
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

function getSafeStorage(kind = 'local') {
  try {
    if (kind === 'session' && typeof sessionStorage !== 'undefined') return sessionStorage;
    if (kind === 'local' && typeof localStorage !== 'undefined') return localStorage;
  } catch { /* ignore */ }
  return null;
}

/**
 * Deterministic salted FNV-1a + mixing digest (sync-friendly across browser + Node without storing raw/base64 PIN).
 */
function computeSaltedPinDigest(pin, salt) {
  const input = `bharatgst-v5.2-pin::${salt}::${String(pin)}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let round = 0; round < 1024; round += 1) {
    for (let i = 0; i < input.length; i += 1) {
      const ch = input.charCodeAt(i) ^ (round & 0xff);
      h1 ^= ch;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= (ch + round) & 0xff;
      h2 = Math.imul(h2, 0x5bd1e995) >>> 0;
    }
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

function randomSaltHex() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

export function setAdminLockPin(pin, storage = getSafeStorage('local'), session = getSafeStorage('session')) {
  const clean = String(pin ?? '').trim();
  if (!/^\d{4,6}$/.test(clean)) {
    throw new Error('कृपया 4 से 6 अंकों का संख्यात्मक पिन (PIN) डालें।');
  }
  if (!storage) {
    throw new Error('ब्राउज़र स्टोरेज उपलब्ध नहीं है।');
  }
  const salt = randomSaltHex();
  const digest = computeSaltedPinDigest(clean, salt);
  storage.setItem(STAFF_PIN_HASH_KEY, JSON.stringify({ salt, digest, updatedAt: new Date().toISOString() }));
  storage.removeItem(STAFF_PIN_ATTEMPTS_KEY);
  // Setting PIN puts workspace in Staff Locked mode until explicitly unlocked by Admin
  if (session) session.removeItem(STAFF_SESSION_UNLOCKED_KEY);
  return { configured: true };
}

export function isAdminPinConfigured(storage = getSafeStorage('local')) {
  if (!storage) return false;
  const raw = storage.getItem(STAFF_PIN_HASH_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.salt && parsed?.digest);
  } catch {
    return false;
  }
}

export function verifyAdminLockPin(
  inputPin,
  {
    storage = getSafeStorage('local'),
    session = getSafeStorage('session'),
    nowMs = Date.now(),
  } = {}
) {
  if (!storage) return { ok: true, unlocked: true };
  const raw = storage.getItem(STAFF_PIN_HASH_KEY);
  if (!raw) return { ok: true, unlocked: true };

  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Corrupted PIN state' };
  }

  let attemptState = { count: 0, lockedUntilMs: 0 };
  try {
    const savedAttempts = JSON.parse(storage.getItem(STAFF_PIN_ATTEMPTS_KEY) || '{}');
    attemptState = {
      count: Number(savedAttempts.count) || 0,
      lockedUntilMs: Number(savedAttempts.lockedUntilMs) || 0,
    };
  } catch { /* ignore */ }

  if (attemptState.lockedUntilMs > nowMs) {
    const waitSec = Math.ceil((attemptState.lockedUntilMs - nowMs) / 1000);
    return {
      ok: false,
      lockedOut: true,
      remainingAttempts: 0,
      error: `5 गलत प्रयासों के कारण पिन लॉक है। ${waitSec} सेकंड बाद प्रयास करें।`,
    };
  }

  const candidate = computeSaltedPinDigest(String(inputPin ?? '').trim(), record.salt);
  if (candidate === record.digest) {
    storage.removeItem(STAFF_PIN_ATTEMPTS_KEY);
    if (session) session.setItem(STAFF_SESSION_UNLOCKED_KEY, '1');
    return { ok: true, unlocked: true, remainingAttempts: MAX_PIN_ATTEMPTS };
  }

  const nextCount = attemptState.count + 1;
  const lockedUntilMs = nextCount >= MAX_PIN_ATTEMPTS ? nowMs + LOCKOUT_MS : 0;
  storage.setItem(
    STAFF_PIN_ATTEMPTS_KEY,
    JSON.stringify({ count: nextCount >= MAX_PIN_ATTEMPTS ? 0 : nextCount, lockedUntilMs })
  );
  return {
    ok: false,
    lockedOut: lockedUntilMs > 0,
    remainingAttempts: Math.max(0, MAX_PIN_ATTEMPTS - nextCount),
    error:
      lockedUntilMs > 0
        ? '5 गलत प्रयास! सुरक्षा के लिए Admin अनलॉक 5 मिनट के लिए लॉक किया गया है।'
        : `गलत पिन (${Math.max(0, MAX_PIN_ATTEMPTS - nextCount)} प्रयास शेष)।`,
  };
}

export function lockAdminSession(session = getSafeStorage('session')) {
  if (session) session.removeItem(STAFF_SESSION_UNLOCKED_KEY);
}

export function clearAdminLockPin(
  currentPin,
  { storage = getSafeStorage('local'), session = getSafeStorage('session') } = {}
) {
  const check = verifyAdminLockPin(currentPin, { storage, session });
  if (!check.ok) return check;
  if (storage) {
    storage.removeItem(STAFF_PIN_HASH_KEY);
    storage.removeItem(STAFF_PIN_ATTEMPTS_KEY);
  }
  if (session) session.removeItem(STAFF_SESSION_UNLOCKED_KEY);
  return { ok: true, cleared: true };
}

export function isStaffModeLocked({
  storage = getSafeStorage('local'),
  session = getSafeStorage('session'),
} = {}) {
  if (!isAdminPinConfigured(storage)) return false;
  return !session || session.getItem(STAFF_SESSION_UNLOCKED_KEY) !== '1';
}

/**
 * 2. WhatsApp Payment Reminder + Dynamic UPI Link Generator
 */
export function buildWhatsAppPaymentReminder({
  businessName = 'हमारी दुकान',
  partyName = 'ग्राहक',
  partyPhone = '',
  pendingAmount = 0,
  upiId = '',
  dueInvoiceNo = '',
} = {}) {
  const amt = Math.max(0, Number(pendingAmount) || 0);
  const cleanUpi = String(upiId || '').trim();
  const upiUri =
    cleanUpi && amt > 0
      ? `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(String(businessName).trim())}&am=${amt.toFixed(2)}&cu=INR`
      : '';

  const text = [
    `नमस्ते *${String(partyName || 'ग्राहक').trim()}* जी,`,
    `*${String(businessName || 'हमारी दुकान').trim()}* की ओर से विनम्र भुगतान स्मरण:`,
    dueInvoiceNo ? `बिल नं.: *${String(dueInvoiceNo).trim()}*` : '',
    `बकाया राशि: *₹${amt.toFixed(2)}*`,
    upiUri ? `\nUPI से भुगतान लिंक:\n${upiUri}` : '',
    `\nधन्यवाद!`,
  ]
    .filter(Boolean)
    .join('\n');

  const digits = String(partyPhone || '').replace(/[^0-9]/g, '');
  const normalizedPhone =
    digits.length === 10
      ? `91${digits}`
      : digits.length === 12 && digits.startsWith('91')
        ? digits
        : '';

  const base = normalizedPhone ? `https://wa.me/${normalizedPhone}` : 'https://wa.me/';
  return {
    url: `${base}?text=${encodeURIComponent(text)}`,
    message: text,
    upiUri,
  };
}

/**
 * 3. 1-Click Canonical Sandbox / Demo Store Data Seed
 */
export function getSandboxDemoSeed(referenceDateIso) {
  const today = String(referenceDateIso || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const twentyDaysAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 20 * 86400000)
    .toISOString()
    .slice(0, 10);

  return {
    products: [
      {
        id: 'DEMO-PROD-1',
        name: 'Basmati Rice 25kg Bag (Demo)',
        hsn: '1006',
        unit: 'BAG',
        sellingPrice: 1850,
        saleRate: 1850,
        purchasePrice: 1620,
        purchaseRate: 1620,
        taxPercent: 5,
        gstRate: 5,
        taxRate: 5,
        stock: 40,
        stockQty: 40,
      },
      {
        id: 'DEMO-PROD-2',
        name: 'Kachi Ghani Mustard Oil 15L Tin (Demo)',
        hsn: '1514',
        unit: 'TIN',
        sellingPrice: 2100,
        saleRate: 2100,
        purchasePrice: 1890,
        purchaseRate: 1890,
        taxPercent: 5,
        gstRate: 5,
        taxRate: 5,
        stock: 25,
        stockQty: 25,
      },
      {
        id: 'DEMO-PROD-3',
        name: '9W Cool-Daylight LED Bulb Box (Demo)',
        hsn: '8539',
        unit: 'BOX',
        sellingPrice: 650,
        saleRate: 650,
        purchasePrice: 520,
        purchaseRate: 520,
        taxPercent: 18,
        gstRate: 18,
        taxRate: 18,
        stock: 60,
        stockQty: 60,
      },
    ],
    clients: [
      {
        id: 'DEMO-CLIENT-1',
        name: 'Sharma Kirana & General Store (Demo)',
        gstin: '09AAACS1234A1Z5',
        phone: '9876500101',
        state: 'Uttar Pradesh',
      },
      {
        id: 'DEMO-MSME-SUPPLIER-1',
        name: 'Verma Agro Packaging MSME (Demo)',
        gstin: '09AAACV5678B1Z2',
        phone: '9876500102',
        state: 'Uttar Pradesh',
        isMsme: true,
        msmeType: 'Micro',
        udyamNo: 'UDYAM-UP-50-0012345',
        hasWrittenAgreement: false,
      },
    ],
    sampleBill: {
      id: 'DEMO-BILL-1',
      invoiceNumber: 'DEMO-INV-001',
      invoiceDate: today,
      invoiceType: 'tax-invoice',
      clientName: 'Sharma Kirana & General Store (Demo)',
      clientGstin: '09AAACS1234A1Z5',
      totalAmount: 4147.5,
      amountPaid: 2000,
      status: 'partial',
      paymentMode: 'UPI',
      data: {
        invoiceType: 'tax-invoice',
        details: { invoiceNumber: 'DEMO-INV-001', invoiceDate: today, paymentMode: 'UPI' },
        client: {
          name: 'Sharma Kirana & General Store (Demo)',
          gstin: '09AAACS1234A1Z5',
          phone: '9876500101',
          state: 'Uttar Pradesh',
        },
        items: [
          { name: 'Basmati Rice 25kg Bag (Demo)', hsn: '1006', quantity: 1, rate: 1850, taxPercent: 5 },
          { name: 'Kachi Ghani Mustard Oil 15L Tin (Demo)', hsn: '1514', quantity: 1, rate: 2100, taxPercent: 5 },
        ],
        totals: {
          subtotal: 3950,
          taxableAmount: 3950,
          cgst: 98.75,
          sgst: 98.75,
          igst: 0,
          totalTax: 197.5,
          grandTotal: 4147.5,
        },
      },
    },
    samplePurchase: {
      id: 'DEMO-PURCH-1',
      billNumber: 'SUP-MSME-108',
      billDate: twentyDaysAgo,
      date: twentyDaysAgo,
      supplierName: 'Verma Agro Packaging MSME (Demo)',
      supplierGstin: '09AAACV5678B1Z2',
      isMsme: true,
      udyamNo: 'UDYAM-UP-50-0012345',
      hasWrittenAgreement: false,
      subtotal: 16200,
      totalTax: 810,
      totalAmount: 17010,
      amountPaid: 0,
      status: 'unpaid',
    },
    sampleBillDate: today,
  };
}
