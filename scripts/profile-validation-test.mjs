// Unit tests for strict Company Details, GSTIN, Bank/UPI, and Client validation.
// Run: `node scripts/profile-validation-test.mjs`
import { validateTaxId } from '../src/utils.js';
import {
  validateGstinForCountry,
  validatePanValue,
  validatePinCode,
  validatePhoneValue,
  validateEmailValue,
  validateBankFields,
  validateBusinessProfile,
  validateClientDetails,
} from '../src/utils/profileValidation.js';

let passed = 0;
let failed = 0;
const ok = (cond, label) => {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
};

// 1. GSTIN validation (India + International)
ok(validateGstinForCountry('India', '') === '', 'Blank GSTIN is allowed for unregistered businesses');
ok(validateGstinForCountry('India', '123') !== '', 'Short GSTIN "123" is rejected');
ok(validateGstinForCountry('India', 'ASDFGHJKLQWERTY') !== '', 'Random 15-letter string is rejected');
ok(validateGstinForCountry('India', '27AAPFU0939F1ZW') !== '', 'Bad Modulo-36 checksum last char is rejected');
ok(validateGstinForCountry('India', '45AAPFU0939F1ZV') !== '', 'Unknown state code 45 is rejected');
ok(validateGstinForCountry('India', '27AAPFU0939F1ZV', 'Maharashtra') === '', 'Valid Maharashtra GSTIN passes');
ok(validateGstinForCountry('India', '27AAPFU0939F1ZV', 'Uttar Pradesh') !== '', 'Maharashtra GSTIN with Uttar Pradesh state is rejected');
ok(validateTaxId('India', '27AAPFU0939F1ZV').ok === true, 'validateTaxId accepts valid GSTIN');
ok(validateTaxId('India', '27AAPFU0939F1ZW').ok === false, 'validateTaxId rejects bad checksum GSTIN');
ok(validateTaxId('India', 'abc123').ok === false, 'validateTaxId rejects short arbitrary text');

// 2. PAN, PIN, Phone, Email
ok(validatePanValue('AAPFU0939F', '27AAPFU0939F1ZV', 'India') === '', 'Matching valid PAN passes');
ok(validatePanValue('AAGCB7383J', '27AAPFU0939F1ZV', 'India') !== '', 'PAN mismatching GSTIN is rejected');
ok(validatePanValue('ABCDZ1234F', '', 'India') !== '', 'Invalid 4th entity letter in PAN is rejected');
ok(validatePinCode('226001', 'India') === '', 'Valid 6-digit Indian PIN passes');
ok(validatePinCode('012345', 'India') !== '', 'Indian PIN starting with 0 is rejected');
ok(validatePinCode('1234', 'India') !== '', '4-digit Indian PIN is rejected');
ok(validatePhoneValue('+91 98765 43210', 'India') === '', 'Valid Indian mobile passes');
ok(validatePhoneValue('12345', 'India') !== '', 'Short phone number is rejected');
ok(validateEmailValue('billing@bharatgst.in') === '', 'Valid email passes');
ok(validateEmailValue('not-an-email') !== '', 'Malformed email is rejected');

// 3. Bank & UPI validation
ok(Object.keys(validateBankFields({ accountNumber: '123456789012', ifsc: 'HDFC0001234', swift: 'HDFCINBB', upiId: 'merchant@hdfcbank' }, 'India')).length === 0, 'Valid bank + UPI passes');
ok(!!validateBankFields({ ifsc: 'HDFC1001234' }, 'India').ifsc, 'IFSC without 0 in 5th char is rejected');
ok(!!validateBankFields({ accountNumber: '123' }, 'India').accountNumber, 'Too-short account number is rejected');
ok(!!validateBankFields({ upiId: 'badupi' }, 'India').upiId, 'UPI without @bank handle is rejected');

// 4. Full Business Profile validation (WelcomeGuide & SettingsView)
const badBiz = validateBusinessProfile({
  businessName: '12345',
  country: 'India',
  state: '',
  address: '999',
  city: '000',
  pin: '12',
  gstin: 'xyz',
  pan: 'badpan',
  phone: '999',
  email: 'bad',
}, { requireState: true, checkBank: true });
ok(!badBiz.ok, 'Garbage Company Details profile is blocked');
ok(!!badBiz.errors.businessName && !!badBiz.errors.state && !!badBiz.errors.gstin && !!badBiz.errors.pin && !!badBiz.errors.pan && !!badBiz.errors.phone && !!badBiz.errors.email, 'Every invalid Company Details field produces a specific error');

const goodBiz = validateBusinessProfile({
  businessName: 'Bharat Traders Pvt. Ltd.',
  country: 'India',
  state: 'Maharashtra',
  address: '42 MG Road, Camp',
  city: 'Pune',
  pin: '411001',
  gstin: '27AAPFU0939F1ZV',
  pan: 'AAPFU0939F',
  phone: '9876543210',
  email: 'accounts@bharattraders.in',
}, { requireState: true, checkBank: true });
ok(goodBiz.ok, 'Valid Indian Company Details profile passes');

const hindiBiz = validateBusinessProfile({
  businessName: 'भारत ट्रेडर्स',
  country: 'India',
  state: 'Uttar Pradesh',
}, { requireState: true });
ok(hindiBiz.ok, 'Unregistered Hindi business name with valid state passes');

// 5. Client validation (ClientModal)
const badClient = validateClientDetails({ name: '---', country: 'India', gstin: '12345', pin: '99' });
ok(!badClient.ok && !!badClient.errors.name && !!badClient.errors.gstin && !!badClient.errors.pin, 'Invalid Client details are blocked');

const goodClient = validateClientDetails({ name: 'Agrahari Enterprises', country: 'India', state: 'Karnataka', gstin: '29AAGCB7383J1Z4', pin: '560001' });
ok(goodClient.ok, 'Valid Client details pass');

console.log(`profile-validation-test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
