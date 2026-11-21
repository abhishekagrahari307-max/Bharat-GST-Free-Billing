import assert from 'node:assert/strict';
import {
  INDUSTRY_PRESETS,
  buildConfigFromPreset,
  normaliseIndustryConfig,
  addIndustryField,
  updateIndustryField,
  deleteIndustryField,
  filledIndustrySpecs,
  filledItemSpecs,
  formatItemSpecsLine,
  allBillSpecSearchValues,
} from '../src/utils/industryFields.js';
import { billMatchesSearch } from '../src/utils.js';

let passed = 0;
const test = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
};

console.log('Running Industry Presets & Custom Field CRUD tests...');

test('exposes all 7 industry presets including EV/Auto, Mobile, Medical, Jewellery, Optical, Garments, General', () => {
  const ids = INDUSTRY_PRESETS.map((p) => p.id);
  assert.deepEqual(ids, [
    'general',
    'automobile_ev',
    'mobile_electronics',
    'medical_pharmacy',
    'jewellery',
    'optical',
    'garments_footwear',
  ]);
});

test('general preset starts clean with zero invoice/item clutter', () => {
  const cfg = buildConfigFromPreset('general');
  assert.equal(cfg.presetId, 'general');
  assert.equal(cfg.invoiceFields.length, 0);
  assert.equal(cfg.itemFields.length, 0);
});

test('automobile_ev preset includes Chassis, Engine/Motor, Battery, Controller, Charger, Financed By, and item specs', () => {
  const cfg = buildConfigFromPreset('automobile_ev');
  assert.equal(cfg.sectionTitle, 'Vehicle / Product Specification');
  assert.equal(cfg.showSpecBox, true);
  const invLabels = cfg.invoiceFields.map((f) => f.label);
  assert.ok(invLabels.includes('Chassis No'));
  assert.ok(invLabels.includes('Engine / Motor No'));
  assert.ok(invLabels.includes('Battery No'));
  assert.ok(invLabels.includes('Financed By'));
  const itemLabels = cfg.itemFields.map((f) => f.label);
  assert.ok(itemLabels.includes('Part / Sub-Serial No'));
  assert.ok(itemLabels.includes('Warranty'));
});

test('addIndustryField adds custom invoice-level and item-level fields cleanly', () => {
  let cfg = buildConfigFromPreset('general');
  cfg = addIndustryField(cfg, { scope: 'invoice', label: 'RTO Registration Office', placeholder: 'UP32 Lucknow' });
  cfg = addIndustryField(cfg, { scope: 'item', label: 'Tyre Make', placeholder: 'MRF / CEAT' });
  assert.equal(cfg.invoiceFields.length, 1);
  assert.equal(cfg.invoiceFields[0].label, 'RTO Registration Office');
  assert.equal(cfg.itemFields.length, 1);
  assert.equal(cfg.itemFields[0].label, 'Tyre Make');
});

test('updateIndustryField renames label/placeholder, toggles enabled, and moves field between invoice and item scopes', () => {
  let cfg = buildConfigFromPreset('mobile_electronics');
  const target = cfg.itemFields.find((f) => f.id === 'imei_1');
  assert.ok(target);

  // Rename in-place
  cfg = updateIndustryField(cfg, 'imei_1', {
    label: 'IMEI / Serial Number (Primary)',
    placeholder: '15-digit IMEI',
  });
  const renamed = cfg.itemFields.find((f) => f.id === 'imei_1');
  assert.equal(renamed.label, 'IMEI / Serial Number (Primary)');
  assert.equal(renamed.placeholder, '15-digit IMEI');

  // Toggle off & on
  cfg = updateIndustryField(cfg, 'imei_1', { enabled: false });
  assert.equal(cfg.itemFields.find((f) => f.id === 'imei_1').enabled, false);
  cfg = updateIndustryField(cfg, 'imei_1', { enabled: true });
  assert.equal(cfg.itemFields.find((f) => f.id === 'imei_1').enabled, true);

  // Move scope from item -> invoice
  cfg = updateIndustryField(cfg, 'imei_1', {
    label: 'Primary Device IMEI',
    scope: 'invoice',
  });
  assert.equal(cfg.itemFields.some((f) => f.id === 'imei_1'), false);
  assert.equal(cfg.invoiceFields.some((f) => f.id === 'imei_1' && f.label === 'Primary Device IMEI'), true);
});

test('deleteIndustryField removes preset or custom fields cleanly', () => {
  let cfg = buildConfigFromPreset('automobile_ev');
  const beforeCount = cfg.invoiceFields.length;
  cfg = deleteIndustryField(cfg, 'key_no');
  assert.equal(cfg.invoiceFields.length, beforeCount - 1);
  assert.equal(cfg.invoiceFields.some((f) => f.id === 'key_no'), false);
});

test('filledIndustrySpecs and formatItemSpecsLine return zero clutter when empty and clean pairs when filled', () => {
  assert.deepEqual(filledIndustrySpecs({}).fields, []);
  assert.equal(formatItemSpecsLine({ name: 'Notebook' }), '');

  const details = {
    industrySpecs: {
      title: 'Vehicle / Product Specification',
      showSpecBox: true,
      fields: [
        { id: 'chassis_no', label: 'Chassis No', value: 'MBLHA10E99K123456' },
        { id: 'engine_motor_no', label: 'Engine / Motor No', value: '   ' },
        { id: 'colour', label: 'Colour', value: 'Pearl White' },
      ],
    },
  };
  const specs = filledIndustrySpecs(details);
  assert.equal(specs.title, 'Vehicle / Product Specification');
  assert.equal(specs.showSpecBox, true);
  assert.equal(specs.fields.length, 2);
  assert.equal(specs.fields[0].label, 'Chassis No');
  assert.equal(specs.fields[0].value, 'MBLHA10E99K123456');

  const item = {
    name: 'iPhone 16 128GB',
    itemSpecs: [
      { id: 'imei_1', label: 'IMEI 1 / Serial No', value: '356789012345678' },
      { id: 'imei_2', label: 'IMEI 2', value: '' },
      { id: 'warranty', label: 'Warranty', value: '1 Year Apple India' },
    ],
  };
  assert.equal(filledItemSpecs(item).length, 2);
  assert.equal(
    formatItemSpecsLine(item),
    'IMEI 1 / Serial No: 356789012345678  •  Warranty: 1 Year Apple India'
  );
});

test('billMatchesSearch finds saved bills by Chassis No, IMEI, Batch No, or HUID', () => {
  const bill = {
    invoiceNumber: 'INV-2026-0042',
    clientName: 'Amit Kumar',
    data: {
      details: {
        industrySpecs: {
          title: 'Vehicle / Product Specification',
          showSpecBox: true,
          fields: [
            { id: 'chassis_no', label: 'Chassis No', value: 'MZ7EV9988776655' },
          ],
        },
      },
      items: [
        {
          name: 'Electric Scooter Pro',
          itemSpecs: [
            { id: 'battery', label: 'Battery Serial', value: 'LFP-72V-88991' },
          ],
        },
      ],
    },
  };
  assert.equal(allBillSpecSearchValues(bill).length, 2);
  assert.equal(billMatchesSearch(bill, 'mz7ev9988'), true);
  assert.equal(billMatchesSearch(bill, 'lfp-72v-88991'), true);
  assert.equal(billMatchesSearch(bill, 'nonexistent-serial'), false);
});

test('normaliseIndustryConfig repairs malformed input safely', () => {
  const norm = normaliseIndustryConfig({ presetId: 'unknown_xyz', invoiceFields: 'bad' });
  assert.equal(norm.presetId, 'general');
  assert.deepEqual(norm.invoiceFields, []);
});

console.log(`\nAll ${passed} industry-fields tests passed!`);
