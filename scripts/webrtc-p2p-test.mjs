#!/usr/bin/env node
// Unit test suite for v3.3.0 Hardened Resilient WebRTC P2P Sync (Offline Queue + Auto-Flush)
// and 1-Click Tally XML & Vyapar / Spreadsheet Migration Bridge.

import {
  generateP2pCredentials,
  buildP2pPairingUrl,
  parseP2pParamsFromSearch,
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
import { buildWelcomeVoiceText, playSafeWelcome } from '../src/utils/welcomeSound.js';

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
assert(/^BGST-\d{6}$/.test(creds.roomId) && /^\d{4}$/.test(creds.pin), 'Generates BGST-XXXXXX Session ID and 4-digit Counter Security PIN');

const pairUrl = buildP2pPairingUrl('https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/', creds);
const parsed = parseP2pParamsFromSearch(new URL(pairUrl).search);
assert(parsed?.roomId === creds.roomId && parsed?.pin === creds.pin, 'Round-trips P2P QR pairing URL (?view=reports&p2p=...&pin=...)');

// Intra-state CGST + SGST payload
const intraBill = buildP2pInvoicePayload({
  invoiceNumber: 'P2P-001',
  docType: 'Tax Invoice',
  customerName: 'Gupta Kirana',
  customerGstin: '09ABCDE1234F1Z5',
  sellerState: '09',
  items: [{ name: 'Atta 10kg', quantity: 2, price: 500, gstRate: 5, hsn: '1101' }],
});
assert(
  intraBill.totalAmount === 1050 && intraBill.data.totalCgst === 25 && intraBill.data.totalSgst === 25 && intraBill.data.totalIgst === 0,
  'Computes intra-state CGST ₹25 + SGST ₹25 = ₹1050 on Mobile Order Pad'
);

// Inter-state IGST payload
const interBill = buildP2pInvoicePayload({
  invoiceNumber: 'P2P-002',
  docType: 'Sales Order',
  customerName: 'Delhi Wholesale',
  customerGstin: '07ABCDE1234F1Z5',
  sellerState: '09',
  items: [{ name: 'LED Panel', quantity: 1, price: 10000, gstRate: 18, hsn: '8528' }],
});
assert(
  interBill.totalAmount === 11800 && interBill.data.totalIgst === 1800 && interBill.data.totalCgst === 0,
  'Computes inter-state IGST ₹1800 = ₹11800 when buyer GSTIN state differs from seller state'
);

// Hardened v3.3.0 Offline Sync Queue when 5G / Peer connection is offline
const ctrl = new WebRtcP2pController();
const resOffline = ctrl.pushBillSafe('BGST-999999', intraBill);
assert(
  resOffline.queued === true && resOffline.sentImmediately === false && getP2pOfflineQueue().length === 1,
  'Saves order into durable Offline Sync Queue when 5G/WebRTC link is disconnected'
);
removeP2pQueueItem(resOffline.queueId);
assert(getP2pOfflineQueue().length === 0, 'Removes queued bill cleanly upon ACK_INVOICE receipt');
ctrl.disconnectAll();

// v3.3.0 1-Click Vyapar / CSV Party & Item Migration
const csvParties = parseSpreadsheetMigration({
  fileName: 'vyapar-parties.csv',
  text: 'Party Name,GSTIN,Phone\nSharma Traders,09ABCDE1234F1Z5,9876543210\n',
});
assert(csvParties.clients.length === 1 && csvParties.clients[0].gstin === '09ABCDE1234F1Z5', 'Auto-detects & imports Party sheet from Vyapar CSV');

const csvItems = parseSpreadsheetMigration({
  fileName: 'vyapar-items.csv',
  text: 'Item Name,HSN Code,Sale Price,Opening Stock,Tax Rate,Unit\nBasmati 1121,1006,2450,50,5%,BAG\n',
});
assert(
  csvItems.products.length === 1 && csvItems.products[0].stock === 50 && csvItems.products[0].gstRate === 5,
  'Auto-detects & imports Inventory Item sheet with Opening Stock & GST % from Vyapar CSV'
);

// v3.3.0 1-Click Tally XML Migration (Masters + OPENINGBALANCE + Sales Voucher)
const sampleTallyXml = `<ENVELOPE>
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
          <OPENINGRATE>2100.00/TIN</OPENINGRATE>
        </STOCKITEM>
        <VOUCHER VCHTYPE="Sales">
          <DATE>20261121</DATE>
          <VOUCHERNUMBER>TALLY-INV-09</VOUCHERNUMBER>
          <PARTYLEDGERNAME>Mehta Distributors</PARTYLEDGERNAME>
          <AMOUNT>-21000.00</AMOUNT>
        </VOUCHER>
      </TALLYMESSAGE>
    </DATA>
  </BODY>
</ENVELOPE>`;

const tallyParsed = parseTallyXmlMigration(sampleTallyXml);
assert(
  tallyParsed.clients.length === 1 &&
    tallyParsed.products.length === 1 &&
    tallyParsed.products[0].stock === 25 &&
    tallyParsed.vouchers.length === 1 &&
    tallyParsed.vouchers[0].totalAmount === 21000,
  'Imports Tally XML Ledgers, Stock Items (with OPENINGBALANCE=25) & Sales Vouchers in 1 click'
);

// Welcome Voice Greeting lines (English, Dynamic Business Name & Hinglish)
assert(
  buildWelcomeVoiceText('', 'en') === 'Welcome to Bharat GST Free Billing, created by Abhishek Agrahari.',
  'Builds clean English welcome voice greeting'
);
assert(
  buildWelcomeVoiceText('Sharma Traders', 'en') === 'Welcome to Bharat GST Free Billing, Sharma Traders. Created by Abhishek Agrahari.',
  'Builds dynamic business-name welcome voice greeting'
);
assert(
  buildWelcomeVoiceText('', 'hinglish') === 'Bharat GST Free Billing mein aapka swagat hai — created by Abhishek Agrahari.',
  'Builds warm Hinglish welcome voice greeting'
);
assert(typeof playSafeWelcome === 'function' && playSafeWelcome('Test') === false, 'Exports playSafeWelcome safely in Node without window crash');

console.log(`webrtc-p2p-test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
