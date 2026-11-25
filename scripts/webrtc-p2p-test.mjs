#!/usr/bin/env node
// Hardened WebRTC P2P Sync + Canonical Product/Tax Fidelity + Tally/Vyapar Migration Test Suite (v5.2.0)

import {
  generateP2pCredentials,
  buildP2pPairingUrl,
  parseP2pParamsFromSearch,
  mapProductsToP2pCatalog,
  buildP2pInvoicePayload,
  WebRtcP2pController,
  getP2pOfflineQueue,
  saveP2pOfflineQueue,
  removeP2pQueueItem,
} from '../src/utils/webrtcP2pSync.js';
import {
  parseSpreadsheetMigration,
  parseTallyXmlMigration,
} from '../src/utils/legacyImporter.js';
import {
  isWelcomeSoundEnabled,
  setWelcomeSoundEnabled,
  getWelcomeVoiceStyle,
  armSessionWelcomeGreeting,
} from '../src/utils/welcomeSound.js';

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

saveP2pOfflineQueue([]);

const creds = generateP2pCredentials();
assert(/^BGST-\d{6}$/.test(creds.roomId) && /^\d{6}$/.test(creds.pin), 'Generates BGST-XXXXXX Session ID and hardened 6-digit Counter Security PIN');

const pairUrl = buildP2pPairingUrl('https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/', creds);
const parsed = parseP2pParamsFromSearch(new URL(pairUrl).search);
assert(parsed?.roomId === creds.roomId && parsed?.pin === creds.pin, 'Round-trips P2P QR pairing URL (?view=reports&p2p=...&pin=...)');

// P0-1 Verification: Normal Inventory product with `taxPercent: 18` -> P2P Catalog -> P2P Invoice
const normalInventoryProducts = [{ id: 'prod-1', name: 'Basmati Rice', price: 100, taxPercent: 18, stock: 10, unit: 'KG' }];
const mappedP2pCat = mapProductsToP2pCatalog(normalInventoryProducts);
assert(
  mappedP2pCat[0].taxPercent === 18 && mappedP2pCat[0].gstRate === 18 && mappedP2pCat[0].price === 100,
  'P0-1: Preserves InventoryView `taxPercent: 18` across P2P Host catalog mapping'
);

const intraBill = buildP2pInvoicePayload({
  invoiceNumber: 'P2P-001',
  docType: 'Tax Invoice',
  customerName: 'Gupta Kirana',
  customerGstin: '09ABCDE1234F1Z5',
  sellerState: '09',
  items: [{ ...mappedP2pCat[0], quantity: 2 }],
});
assert(
  intraBill.invoiceType === 'tax-invoice' &&
    intraBill.totalAmount === 236 &&
    intraBill.data.totals.taxableAmount === 200 &&
    intraBill.data.totals.cgst === 18 &&
    intraBill.data.totals.sgst === 18,
  'P0-1 & P0-2: Builds canonical P2P Tax Invoice with `data.totals.taxableAmount` = ₹200 + ₹36 GST = ₹236'
);

const interBill = buildP2pInvoicePayload({
  invoiceNumber: 'P2P-002',
  docType: 'Sales Order',
  customerName: 'Delhi Wholesale',
  customerGstin: '07ABCDE1234F1Z5',
  sellerState: '09',
  items: [{ name: 'LED Panel', quantity: 1, price: 10000, taxPercent: 18, hsn: '8528' }],
});
assert(
  interBill.invoiceType === 'sales-order' && interBill.totalAmount === 11800 && interBill.data.totals.igst === 1800,
  'Computes inter-state IGST ₹1800 = ₹11800 and canonical `sales-order` slug'
);

// Normal Offline Sync Queue
const ctrl = new WebRtcP2pController();
const resOffline = ctrl.pushBillSafe('BGST-999999', intraBill);
assert(
  resOffline.queued === true && resOffline.storageError === false && getP2pOfflineQueue().length === 1,
  'Saves order into durable Offline Sync Queue when 5G/WebRTC link is disconnected'
);
removeP2pQueueItem(resOffline.queueId);
assert(getP2pOfflineQueue().length === 0, 'Removes queued bill cleanly upon ACK_INVOICE receipt');

// P0-5 Reproduction: Simulated QuotaExceededError on localStorage.setItem MUST NOT claim queued: true!
const hadLocalStorage = 'localStorage' in globalThis;
const origLocalStorage = globalThis.localStorage;
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: () => '[]',
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  },
});
const quotaRes = ctrl.pushBillSafe('BGST-999999', intraBill);
assert(
  quotaRes.queued === false && quotaRes.storageError === true && getP2pOfflineQueue().length === 0,
  'P0-5: Refuses to report `queued: true` when localStorage throws QuotaExceededError; surfaces `storageError: true`'
);
if (hadLocalStorage) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: origLocalStorage });
} else {
  delete globalThis.localStorage;
}
ctrl.disconnectAll();

// P0-6 Verification: Vyapar CSV Product sets BOTH `taxPercent` and `gstRate`
const csvParties = parseSpreadsheetMigration({
  fileName: 'vyapar-parties.csv',
  text: 'Party Name,GSTIN,Phone\nSharma Traders,09ABCDE1234F1Z5,9876543210\n',
});
assert(csvParties.clients.length === 1 && csvParties.clients[0].gstin === '09ABCDE1234F1Z5', 'Imports Party sheet from Vyapar CSV');

const csvItems = parseSpreadsheetMigration({
  fileName: 'vyapar-items.csv',
  text: 'Item Name,HSN Code,Sale Price,Opening Stock,Tax Rate,Unit\nBasmati 1121,1006,2450,50,18%,BAG\n',
});
assert(
  csvItems.products.length === 1 &&
    csvItems.products[0].stock === 50 &&
    csvItems.products[0].taxPercent === 18 &&
    csvItems.products[0].gstRate === 18,
  'P0-6a: Vyapar CSV sets canonical `taxPercent: 18` AND `gstRate: 18` so InventoryView displays 18% GST'
);

// P0-6 Verification: Tally XML Sales Voucher with real <ALLINVENTORYENTRIES.LIST> + CGST/SGST breakup
const richTallyXml = `<ENVELOPE>
  <BODY>
    <DATA>
      <TALLYMESSAGE>
        <LEDGER NAME="Mehta Distributors">
          <PARENT>Sundry Debtors</PARENT>
          <PARTYGSTIN>27ABCDE1234F1Z5</PARTYGSTIN>
          <LEDGERMOBILE>9123456789</LEDGERMOBILE>
        </LEDGER>
        <STOCKITEM NAME="Mustard Oil Tin">
          <BASEUNITS>TIN</BASEUNITS>
          <HSNCODE>1514</HSNCODE>
          <OPENINGBALANCE>25 TIN</OPENINGBALANCE>
          <OPENINGRATE>100.00/TIN</OPENINGRATE>
        </STOCKITEM>
        <VOUCHER VCHTYPE="Sales">
          <DATE>20261121</DATE>
          <VOUCHERNUMBER>TALLY-INV-18</VOUCHERNUMBER>
          <PARTYLEDGERNAME>Mehta Distributors</PARTYLEDGERNAME>
          <PARTYGSTIN>27ABCDE1234F1Z5</PARTYGSTIN>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>Mehta Distributors</LEDGERNAME>
            <AMOUNT>-118.00</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>CGST</LEDGERNAME>
            <AMOUNT>9.00</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>SGST</LEDGERNAME>
            <AMOUNT>9.00</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
          <ALLINVENTORYENTRIES.LIST>
            <STOCKITEMNAME>Mustard Oil Tin</STOCKITEMNAME>
            <BILLEDQTY>1 TIN</BILLEDQTY>
            <RATE>100.00/TIN</RATE>
            <AMOUNT>100.00</AMOUNT>
            <HSNCODE>1514</HSNCODE>
          </ALLINVENTORYENTRIES.LIST>
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;

const tallyParsed = parseTallyXmlMigration(richTallyXml);
const vch = tallyParsed.vouchers[0];
assert(
  tallyParsed.clients.length === 1 &&
    tallyParsed.products.length === 1 &&
    tallyParsed.products[0].stock === 25 &&
    vch.totalAmount === 118 &&
    vch.data.totals.taxableAmount === 100 &&
    vch.data.totals.cgst === 9 &&
    vch.data.totals.sgst === 9 &&
    vch.data.items[0].name === 'Mustard Oil Tin' &&
    vch.data.items[0].taxPercent === 18,
  'P0-6b: Preserves Tally XML <ALLINVENTORYENTRIES.LIST> item, ₹100 taxable value, ₹9 CGST + ₹9 SGST, and 18% item tax'
);

// Welcome greeting check
assert(typeof isWelcomeSoundEnabled() === 'boolean' && getWelcomeVoiceStyle() === 'en', 'Reads studio human welcome sound defaults cleanly');
setWelcomeSoundEnabled(false);
const cleanupWelcome = armSessionWelcomeGreeting(() => 'Bharat Store');
assert(typeof cleanupWelcome === 'function' && isWelcomeSoundEnabled() === false, 'Skips studio welcome playback cleanly when disabled');
cleanupWelcome();
setWelcomeSoundEnabled(true);

console.log(`webrtc-p2p-test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
