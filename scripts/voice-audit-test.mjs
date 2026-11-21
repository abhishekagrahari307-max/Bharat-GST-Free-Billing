// Unit tests for Bharat AI Voice Billing™ (src/utils/voiceBilling.js)
// and CA Pre-Filing GST Health Auditor (src/utils/gstAudit.js).
import assert from 'node:assert/strict';
import { normalizeSpokenNumbers, parseVoiceTranscript } from '../src/utils/voiceBilling.js';
import { auditInvoicesForGst } from '../src/utils/gstAudit.js';
import { gstinChecksumOk } from '../src/utils.js';

let passed = 0;
function ok(cond, label) {
  assert.equal(Boolean(cond), true, label);
  passed++;
}

// 1. Hindi & Devanagari spoken number normalization
{
  const out = normalizeSpokenNumbers('paanch bag cement ३८० rupaye');
  ok(out === '5 bag cement 380 rupaye', 'normalizes Hinglish + Devanagari numbers');
}

// 2. Multi-item Hinglish + Catalog matching + Client matching
{
  const catalog = [
    { name: 'Dolo 650 Tablet', hsn: '30049069', sellingPrice: 32, unit: 'Strip', gstRate: 12 },
    { name: 'Basmati Rice 5kg', hsn: '10063020', sellingPrice: 440, unit: 'Bag', gstRate: 5 },
  ];
  const clients = [
    { name: 'Sharma Medical Store', gstin: '09ABCDE1234F1Z5', state: 'Uttar Pradesh' },
  ];
  const res = parseVoiceTranscript(
    'Client Sharma Medical, do Dolo 650 aur teen Basmati Rice 5kg rate 450 gst 5%',
    { products: catalog, clients, defaultGst: 18 }
  );
  ok(res.matchedClient?.name === 'Sharma Medical Store', 'matches saved client');
  ok(res.items.length === 2, 'parses 2 spoken items separated by aur');
  ok(res.items[0].description === 'Dolo 650 Tablet' && res.items[0].quantity === 2 && res.items[0].rate === 32 && res.items[0].hsn === '30049069', 'pulls saved catalog price, HSN & name');
  ok(res.items[1].quantity === 3 && res.items[1].rate === 450 && res.items[1].gstRate === 5, 'overrides catalog rate when spoken explicitly');
}

// 3. Service hours voice command
{
  const res = parseVoiceTranscript('Website Development 10 hours at 1500 gst 18%');
  ok(res.items.length === 1, 'parses service hours item');
  ok(res.items[0].quantity === 10 && res.items[0].unit === 'Hrs' && res.items[0].rate === 1500 && res.items[0].gstRate === 18, 'extracts trailing qty + Hrs + rate + GST');
}

// 4. CA Pre-Filing GST Health Auditor checks
{
  const validBase14 = '09AABCU9603R1Z';
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const validGstin = [...chars].map((c) => validBase14 + c).find((g) => gstinChecksumOk(g));
  const badGstin = validBase14 + (validGstin.endsWith('5') ? '6' : '5');

  const cleanBills = [
    {
      invoiceNumber: 'INV-001',
      total: 11800,
      data: {
        invoiceType: 'tax-invoice',
        client: { name: 'Good Co', gstin: validGstin, state: 'Uttar Pradesh' },
        items: [{ description: 'Laptop', hsn: '847130', quantity: 1, rate: 10000, gstRate: 18 }],
      },
    },
    {
      invoiceNumber: 'INV-002',
      total: 5900,
      data: {
        invoiceType: 'tax-invoice',
        client: { name: 'Cash Customer', state: 'Uttar Pradesh' },
        items: [{ description: 'Mouse', hsn: '847160', quantity: 5, rate: 1000, gstRate: 18 }],
      },
    },
  ];
  const cleanRep = auditInvoicesForGst(cleanBills);
  ok(cleanRep.score === 100 && cleanRep.portalReady === true && cleanRep.issues.length === 0, 'clean invoices get 100% portal-ready score');

  const faultyBills = [
    ...cleanBills,
    {
      invoiceNumber: 'INV-005', // gap: 003, 004 missing!
      total: 65000, // > 50k without e-way bill
      data: {
        invoiceType: 'tax-invoice',
        client: { name: 'Bad Co', gstin: badGstin, state: 'Maharashtra' },
        items: [{ description: 'Widget', hsn: '', quantity: 1, rate: 55000, gstRate: 18 }],
      },
    },
  ];
  const badRep = auditInvoicesForGst(faultyBills);
  ok(badRep.portalReady === false && badRep.errorCount === 1, 'flags invalid GSTIN checksum as portal-blocking error');
  ok(badRep.issues.some((i) => i.code === 'MISSING_HSN'), 'flags missing HSN code');
  ok(badRep.issues.some((i) => i.code === 'SEQUENCE_GAP'), 'flags Rule 46 invoice sequence gap');
  ok(badRep.issues.some((i) => i.code === 'EWAY_THRESHOLD'), 'flags >50k goods invoice without E-Way Bill');
}

console.log(`voice-audit-test: ${passed} passed, 0 failed`);
