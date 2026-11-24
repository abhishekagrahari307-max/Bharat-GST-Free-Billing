#!/usr/bin/env node
// Unit test suite for v3.2.0 Serverless WebRTC P2P Mobile <-> PC Live Sync Engine.

import {
  generateP2pCredentials,
  buildP2pPairingUrl,
  parseP2pParamsFromSearch,
  buildP2pInvoicePayload,
  WebRtcP2pController,
} from '../src/utils/webrtcP2pSync.js';

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) passed += 1;
  else {
    failed += 1;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

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

const ctrl = new WebRtcP2pController();
let threwDisconnected = false;
try {
  ctrl.sendInvoiceToHost('BGST-999999', intraBill);
} catch {
  threwDisconnected = true;
}
ctrl.disconnectAll();
assert(threwDisconnected === true, 'Blocks sending invoice before PIN-authenticated WebRTC session is established');

console.log(`webrtc-p2p-test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
