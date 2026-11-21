// Strict offline validation for Business / Company Details, Client Details,
// and Bank / UPI Payment Accounts.
// Ensures invalid GSTINs (wrong length, bad format, failed Modulo-36 checksum,
// or mismatched state), invalid PIN codes, PANs, phone numbers, emails, IFSC
// codes, and UPI IDs are caught with clear field-level messages before saving.

import { INDIAN_STATES, decodeGstin, getStateCode, validateTaxId } from '../utils.js';
import { isLikelyLutArn } from './lut.js';

const HAS_LETTER_RE = /\p{L}/u;
const INDIA_PIN_RE = /^[1-9][0-9]{5}$/;
const INTL_POSTAL_RE = /^[A-Za-z0-9\s-]{3,12}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PAN_ENTITY_CHARS = new Set(['A', 'B', 'C', 'F', 'G', 'H', 'L', 'J', 'P', 'T', 'K']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const INDIA_IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const SWIFT_RE = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
const ACCOUNT_NO_RE = /^[0-9A-Za-z]{6,22}$/;
const SPECIAL_GST_STATE_CODES = new Set(['96', '97', '99']);

export function validateGstinForCountry(country, rawGstin, selectedState = '') {
  const gstin = String(rawGstin || '').trim().toUpperCase();
  if (!gstin) return '';
  const isIndia = (country || 'India') === 'India';
  if (!isIndia) {
    const res = validateTaxId(country, gstin);
    return res.ok ? '' : res.message;
  }
  if (gstin.length !== 15) {
    return `GSTIN must be exactly 15 characters (currently ${gstin.length}). Leave blank if not GST-registered.`;
  }
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]{3}$/.test(gstin)) {
    return 'Invalid GSTIN format. Expected 15 characters like 09AABCU9603R1ZM (2-digit state code + 10-char PAN + 3 chars).';
  }
  const decoded = decodeGstin(gstin);
  if (!decoded) {
    return 'Invalid GSTIN format.';
  }
  const normalizedPrefix = getStateCode(gstin);
  if (!decoded.state && !SPECIAL_GST_STATE_CODES.has(decoded.stateCode) && !INDIAN_STATES.some((s) => getStateCode(s) === normalizedPrefix)) {
    return `Invalid state code "${decoded.stateCode}" at the start of GSTIN.`;
  }
  if (!decoded.checksumOk) {
    return 'Invalid GSTIN — official checksum check failed. Please check for a typo.';
  }
  const st = String(selectedState || '').trim();
  if (st && decoded.state && getStateCode(st) && getStateCode(st) !== normalizedPrefix) {
    return `This GSTIN belongs to ${decoded.state} (code ${decoded.stateCode}), which does not match selected state "${st}".`;
  }
  return '';
}

export function validatePanValue(rawPan, rawGstin = '', country = 'India') {
  if ((country || 'India') !== 'India') return '';
  const pan = String(rawPan || '').trim().toUpperCase();
  if (!pan) return '';
  if (!PAN_RE.test(pan) || !PAN_ENTITY_CHARS.has(pan[3])) {
    return 'Invalid PAN. Expected 10 characters like AABCU9603R (5 letters + 4 digits + 1 letter).';
  }
  const gstin = String(rawGstin || '').trim().toUpperCase();
  const decoded = decodeGstin(gstin);
  if (decoded?.checksumOk && decoded.pan !== pan) {
    return `PAN "${pan}" does not match characters 3–12 of your GSTIN ("${decoded.pan}").`;
  }
  return '';
}

export function validatePinCode(rawPin, country = 'India') {
  const pin = String(rawPin || '').trim();
  if (!pin) return '';
  if ((country || 'India') === 'India') {
    if (!INDIA_PIN_RE.test(pin)) {
      return 'Invalid PIN Code. Indian PIN code must be 6 digits (e.g. 226001) and cannot start with 0.';
    }
    return '';
  }
  if (!INTL_POSTAL_RE.test(pin)) {
    return 'Invalid postal / ZIP code (expected 3–12 letters or digits).';
  }
  return '';
}

export function validatePhoneValue(rawPhone, country = 'India') {
  const raw = String(rawPhone || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/[\s().-]/g, '');
  if ((country || 'India') === 'India') {
    const mobileOk = /^(?:\+91|91|0)?[6-9]\d{9}$/.test(compact);
    const landlineOk = /^(?:\+91|91)?0?[1-9]\d{9}$/.test(compact) || /^1800\d{6,7}$/.test(compact);
    // Guard against repeated single digits like 9999999999 or 6666666666? Keep real numbers valid, only block 0000000000 (already blocked by [6-9] / [1-9]).
    if (!mobileOk && !landlineOk) {
      return 'Invalid phone number. Enter a valid 10-digit Indian mobile or STD number (e.g. 9876543210).';
    }
    return '';
  }
  if (!/^\+?[1-9]\d{6,14}$/.test(compact)) {
    return 'Invalid phone number (expected 7–15 digits).';
  }
  return '';
}

export function validateEmailValue(rawEmail) {
  const email = String(rawEmail || '').trim();
  if (!email) return '';
  if (!EMAIL_RE.test(email)) {
    return 'Invalid email address (e.g. billing@company.in).';
  }
  return '';
}

export function validateBankFields(account = {}, country = 'India') {
  const errors = {};
  const isIndia = (country || 'India') === 'India';
  const accNo = String(account.accountNumber || '').trim().replace(/\s+/g, '');
  if (accNo && !ACCOUNT_NO_RE.test(accNo)) {
    errors.accountNumber = 'Invalid Account Number (must be 6–22 digits/letters).';
  }
  const ifsc = String(account.ifsc || '').trim().toUpperCase();
  if (ifsc) {
    if (isIndia && !INDIA_IFSC_RE.test(ifsc)) {
      errors.ifsc = 'Invalid IFSC Code. Expected 11 characters like SBIN0001234 (4 bank letters + 0 + 6 branch chars).';
    } else if (!isIndia && !/^[A-Za-z0-9\s-]{4,20}$/.test(ifsc)) {
      errors.ifsc = 'Invalid bank routing / sort code.';
    }
  }
  const swift = String(account.swift || '').trim().toUpperCase();
  if (swift && !SWIFT_RE.test(swift)) {
    errors.swift = 'Invalid SWIFT / BIC code (must be 8 or 11 characters, e.g. HDFCINBB).';
  }
  const upi = String(account.upiId || '').trim();
  if (upi && !UPI_RE.test(upi)) {
    errors.upiId = 'Invalid UPI ID. Expected format like business@okicici or 9876543210@ybl.';
  }
  return errors;
}

/**
 * Validates a Business / Company Details profile object.
 * @param {object} profile
 * @param {{ requireState?: boolean, checkBank?: boolean }} opts
 * @returns {{ ok: boolean, errors: Record<string, string>, firstError: string }}
 */
export function validateBusinessProfile(profile = {}, { requireState = true, checkBank = false } = {}) {
  const errors = {};
  const country = profile.country || 'India';
  const isIndia = country === 'India';

  const name = String(profile.businessName || '').trim();
  if (name.length < 2 || !HAS_LETTER_RE.test(name)) {
    errors.businessName = 'Enter a valid Business Name (at least 2 characters, including letters).';
  }

  const city = String(profile.city || '').trim();
  if (city && !HAS_LETTER_RE.test(city)) {
    errors.city = 'Enter a valid City name (cannot be only numbers or symbols).';
  }

  const address = String(profile.address || '').trim();
  if (address && (address.length < 3 || !HAS_LETTER_RE.test(address))) {
    errors.address = 'Enter a valid street/locality address (or leave blank).';
  }

  const pinErr = validatePinCode(profile.pin, country);
  if (pinErr) errors.pin = pinErr;

  const state = String(profile.state || '').trim();
  if (isIndia && requireState && !INDIAN_STATES.includes(state)) {
    errors.state = 'Please select your State (required for CGST/SGST vs IGST calculation).';
  }

  const gstinErr = validateGstinForCountry(country, profile.gstin, state);
  if (gstinErr) errors.gstin = gstinErr;

  const panErr = validatePanValue(profile.pan, profile.gstin, country);
  if (panErr) errors.pan = panErr;

  const emailErr = validateEmailValue(profile.email);
  if (emailErr) errors.email = emailErr;

  const phoneErr = validatePhoneValue(profile.phone, country);
  if (phoneErr) errors.phone = phoneErr;

  if (isIndia && profile.flipkartGstin) {
    const fkErr = validateGstinForCountry('India', profile.flipkartGstin);
    if (fkErr) errors.flipkartGstin = `Flipkart GSTIN: ${fkErr}`;
  }

  if (isIndia && profile.lutArn && !isLikelyLutArn(profile.lutArn)) {
    errors.lutArn = 'Invalid LUT ARN. Expected ~15 alphanumeric characters (usually starting with AD).';
  }

  if (checkBank) {
    Object.assign(errors, validateBankFields(profile, country));
  }

  const keys = Object.keys(errors);
  return {
    ok: keys.length === 0,
    errors,
    firstError: keys.length ? errors[keys[0]] : '',
  };
}

/**
 * Validates a Client record (ClientModal or inline client fields on an invoice).
 */
export function validateClientDetails(client = {}, { requireName = true } = {}) {
  const errors = {};
  const country = client.country || 'India';

  const name = String(client.name || '').trim();
  if (requireName && (name.length < 2 || !HAS_LETTER_RE.test(name))) {
    errors.name = 'Enter a valid Client / Business Name (at least 2 characters, including letters).';
  }

  const address = String(client.address || '').trim();
  if (address && (address.length < 3 || !HAS_LETTER_RE.test(address))) {
    errors.address = 'Enter a valid street/locality address (or leave blank).';
  }

  const city = String(client.city || '').trim();
  if (city && !HAS_LETTER_RE.test(city)) {
    errors.city = 'Enter a valid City name.';
  }

  const pinErr = validatePinCode(client.pin, country);
  if (pinErr) errors.pin = pinErr;

  const gstinErr = validateGstinForCountry(country, client.gstin, client.state);
  if (gstinErr) errors.gstin = gstinErr;

  const emailErr = validateEmailValue(client.email);
  if (emailErr) errors.email = emailErr;

  const phoneErr = validatePhoneValue(client.phone, country);
  if (phoneErr) errors.phone = phoneErr;

  const keys = Object.keys(errors);
  return {
    ok: keys.length === 0,
    errors,
    firstError: keys.length ? errors[keys[0]] : '',
  };
}
