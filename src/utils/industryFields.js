// Smart Industry Specification Fields + Custom Field CRUD (Add / Edit / Delete)
// Supports both Invoice-Level Specification Box fields (e.g. Chassis No, Engine/Motor No,
// Battery No, Financed By, Doctor Name) and Item-Level fields (e.g. IMEI/Serial No,
// Batch No, Expiry Date, HUID, Purity, Size, Warranty).
// Pure ESM with explicit .js imports so Node unit tests run directly.

export const INDUSTRY_CONFIG_KEY = 'fgsb_industryFieldConfig';

export const INDUSTRY_PRESETS = [
  {
    id: 'general',
    label: 'General / Standard',
    emoji: '🏪',
    hint: 'Clean standard GST bill — add your own custom fields anytime',
    sectionTitle: 'Additional Specifications',
    showSpecBox: true,
    invoiceFields: [],
    itemFields: [],
  },
  {
    id: 'automobile_ev',
    label: 'EV / Auto / Bike Showroom',
    emoji: '🛺',
    hint: 'Chassis No, Engine/Motor, Battery, Controller, Charger, Colour, Financed By',
    sectionTitle: 'Vehicle / Product Specification',
    showSpecBox: true,
    invoiceFields: [
      { id: 'mfg_make', label: 'MFG / Make', placeholder: 'e.g. Mahindra / YC / Hero' },
      { id: 'vehicle_model', label: 'Model / Variant', placeholder: 'e.g. E-Rickshaw / Scooter' },
      { id: 'chassis_no', label: 'Chassis No', placeholder: 'e.g. MBLHA10E...' },
      { id: 'engine_motor_no', label: 'Engine / Motor No', placeholder: 'e.g. MTR1000W...' },
      { id: 'battery_no', label: 'Battery No', placeholder: 'e.g. LFP-48V-...' },
      { id: 'controller_no', label: 'Controller No', placeholder: 'e.g. CTRL-1000W' },
      { id: 'charger_no', label: 'Charger No', placeholder: 'e.g. CHG-48V' },
      { id: 'colour', label: 'Colour', placeholder: 'e.g. Red / Blue / White' },
      { id: 'key_no', label: 'Key No', placeholder: 'e.g. K-204' },
      { id: 'financed_by', label: 'Financed By', placeholder: 'e.g. Cash / Bajaj / Bank' },
      { id: 'customer_aadhaar', label: 'Customer Aadhaar No', placeholder: 'Optional 12-digit Aadhaar' },
      { id: 'salesman_ref', label: 'Reference / Salesman', placeholder: 'Optional salesman name' },
    ],
    itemFields: [
      { id: 'item_serial', label: 'Part / Sub-Serial No', placeholder: 'Optional serial' },
      { id: 'item_warranty', label: 'Warranty', placeholder: 'e.g. 3 Yr Battery / 2 Yr Motor' },
    ],
  },
  {
    id: 'mobile_electronics',
    label: 'Mobile / Electronics',
    emoji: '📱',
    hint: 'IMEI 1 & 2, Serial No, Colour/Variant, Warranty, EMI Financed By',
    sectionTitle: 'Device & Finance Details',
    showSpecBox: true,
    invoiceFields: [
      { id: 'financed_by', label: 'Financed By (EMI)', placeholder: 'e.g. Bajaj Finserv / IDFC / Cash' },
      { id: 'down_payment', label: 'Down Payment / DO No', placeholder: 'Optional EMI DO / DP details' },
      { id: 'salesman_ref', label: 'Salesman / Counter', placeholder: 'Optional' },
    ],
    itemFields: [
      { id: 'imei_1', label: 'IMEI 1 / Serial No', placeholder: '15-digit IMEI or Serial No' },
      { id: 'imei_2', label: 'IMEI 2', placeholder: 'Optional 2nd IMEI' },
      { id: 'colour_variant', label: 'Colour / RAM-ROM', placeholder: 'e.g. 8GB/128GB Midnight' },
      { id: 'item_warranty', label: 'Warranty', placeholder: 'e.g. 1 Year Brand Warranty' },
    ],
  },
  {
    id: 'medical_pharmacy',
    label: 'Medical / Pharmacy',
    emoji: '💊',
    hint: 'Batch No, Expiry Date, Mfg Date, Doctor Name, Patient Name, DL No',
    sectionTitle: 'Prescription & License Details',
    showSpecBox: true,
    invoiceFields: [
      { id: 'patient_name', label: 'Patient Name', placeholder: 'Patient name' },
      { id: 'doctor_name', label: 'Doctor Name', placeholder: 'e.g. Dr. R.K. Sharma' },
      { id: 'dl_no', label: 'Drug License (DL No)', placeholder: 'e.g. UP32-20B/21B-...' },
    ],
    itemFields: [
      { id: 'batch_no', label: 'Batch No', placeholder: 'e.g. B2409' },
      { id: 'expiry_date', label: 'Expiry (MM/YY)', placeholder: 'e.g. 08/2028' },
      { id: 'mfg_date', label: 'Mfg (MM/YY)', placeholder: 'e.g. 09/2026' },
    ],
  },
  {
    id: 'jewellery',
    label: 'Jewellery / Gold-Silver',
    emoji: '💍',
    hint: 'HUID Hallmark, Purity (22K/18K), Gross/Net Weight, Making Charges',
    sectionTitle: 'Bullion & Hallmark Details',
    showSpecBox: true,
    invoiceFields: [
      { id: 'metal_rate', label: 'Gold / Silver Rate', placeholder: 'e.g. ₹76,500 / 10g (22K)' },
      { id: 'salesman_ref', label: 'Salesman', placeholder: 'Optional' },
    ],
    itemFields: [
      { id: 'huid_no', label: 'HUID / Hallmark', placeholder: '6-char HUID' },
      { id: 'purity', label: 'Purity', placeholder: 'e.g. 22K 916' },
      { id: 'gross_wt', label: 'Gross Wt (g)', placeholder: 'e.g. 12.450' },
      { id: 'net_wt', label: 'Net Wt (g)', placeholder: 'e.g. 11.800' },
      { id: 'making_chg', label: 'Making Charges', placeholder: 'e.g. 12% or ₹4,500' },
    ],
  },
  {
    id: 'optical',
    label: 'Optical / Eyewear',
    emoji: '👓',
    hint: 'Right & Left Eye Power (SPH/CYL/AXIS), PD, Patient Name, Frame/Lens',
    sectionTitle: 'Eye Prescription Details',
    showSpecBox: true,
    invoiceFields: [
      { id: 'patient_name', label: 'Patient Name', placeholder: 'Patient name' },
      { id: 'right_eye', label: 'Right Eye (SPH / CYL / AXIS)', placeholder: 'e.g. -1.25 / -0.50 × 90°' },
      { id: 'left_eye', label: 'Left Eye (SPH / CYL / AXIS)', placeholder: 'e.g. -1.50 / -0.25 × 85°' },
      { id: 'pd_add', label: 'PD / Reading Add', placeholder: 'e.g. PD 63mm, Add +1.50' },
    ],
    itemFields: [
      { id: 'lens_frame', label: 'Frame / Lens Spec', placeholder: 'e.g. Blue-cut Anti-glare' },
      { id: 'item_warranty', label: 'Warranty', placeholder: 'e.g. 6 Months Coating' },
    ],
  },
  {
    id: 'garments_footwear',
    label: 'Garments / Footwear',
    emoji: '👕',
    hint: 'Size, Colour, Brand / Design No, Alteration / Trial Date',
    sectionTitle: 'Order & Style Details',
    showSpecBox: true,
    invoiceFields: [
      { id: 'salesman_ref', label: 'Salesman / Counter', placeholder: 'Optional' },
      { id: 'trial_date', label: 'Alteration / Delivery Date', placeholder: 'Optional' },
    ],
    itemFields: [
      { id: 'size_code', label: 'Size', placeholder: 'e.g. L / XL / 42' },
      { id: 'colour', label: 'Colour', placeholder: 'e.g. Navy Blue' },
      { id: 'design_no', label: 'Brand / Design No', placeholder: 'e.g. D-402' },
    ],
  },
  {
    id: 'grain_mandi_kirana',
    label: '🌾 Grain / Mandi / Kirana / Agro',
    shortLabel: 'Grain / Mandi',
    description: 'Mandi Gate Pass (9R/6R), Lot/Marka, Bora/Bag count, Quintal/KG weight & FSSAI/Mandi billing.',
    sectionTitle: 'Mandi & Consignment Details',
    showSpecBox: true,
    invoiceFields: [
      { id: 'mandi_gate_pass', label: 'Mandi Samiti / 9R / Gate Pass No', placeholder: 'e.g. 9R/2026/00482' },
      { id: 'bilty_ref', label: 'Bilty / Weighbridge Slip No', placeholder: 'e.g. Kanta #812' },
    ],
    itemFields: [
      { id: 'lot_marka', label: 'Lot / Marka', placeholder: 'e.g. Sharbati Grade-A' },
      { id: 'bag_bora', label: 'Bags / Bora (Count × Wt)', placeholder: 'e.g. 50 Bora × 50 Kg' },
    ],
  },
];

export function getIndustryPreset(presetId) {
  return INDUSTRY_PRESETS.find((p) => p.id === presetId) || INDUSTRY_PRESETS[0];
}

function cleanFieldList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const label = String(raw.label || '').trim();
    if (!label) continue;
    const id = String(raw.id || '').trim() || slugifyFieldId(label);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label,
      placeholder: String(raw.placeholder || '').trim(),
      enabled: raw.enabled !== false,
    });
  }
  return out;
}

export function slugifyFieldId(label) {
  const base = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28) || 'field';
  return `${base}_${Math.random().toString(36).slice(2, 6)}`;
}

export function buildConfigFromPreset(presetId = 'general') {
  const preset = getIndustryPreset(presetId);
  return {
    presetId: preset.id,
    sectionTitle: preset.sectionTitle,
    showSpecBox: preset.showSpecBox !== false,
    invoiceFields: preset.invoiceFields.map((f) => ({ ...f, enabled: true })),
    itemFields: preset.itemFields.map((f) => ({ ...f, enabled: true })),
  };
}

export function normaliseIndustryConfig(raw) {
  if (!raw || typeof raw !== 'object') return buildConfigFromPreset('general');
  const preset = getIndustryPreset(raw.presetId || 'general');
  return {
    presetId: preset.id,
    sectionTitle: String(raw.sectionTitle ?? preset.sectionTitle).trim() || 'Product Specifications',
    showSpecBox: raw.showSpecBox !== false,
    invoiceFields: cleanFieldList(raw.invoiceFields ?? preset.invoiceFields),
    itemFields: cleanFieldList(raw.itemFields ?? preset.itemFields),
  };
}

export function readIndustryConfig(profile = null) {
  if (profile?.industryFieldConfig && typeof profile.industryFieldConfig === 'object') {
    return normaliseIndustryConfig(profile.industryFieldConfig);
  }
  try {
    const raw = JSON.parse(localStorage.getItem(INDUSTRY_CONFIG_KEY) || 'null');
    if (raw) return normaliseIndustryConfig(raw);
  } catch { /* storage unavailable */ }
  return buildConfigFromPreset('general');
}

export function saveIndustryConfig(config) {
  const clean = normaliseIndustryConfig(config);
  try {
    localStorage.setItem(INDUSTRY_CONFIG_KEY, JSON.stringify(clean));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fgsb:industry-config-changed', { detail: clean }));
    }
  } catch { /* storage unavailable */ }
  return clean;
}

/**
 * Add a custom field to either 'invoice' (Specification Box) or 'item' (Line Item row).
 */
export function addIndustryField(config, { scope = 'invoice', label, placeholder = '' }) {
  const clean = normaliseIndustryConfig(config);
  const trimmedLabel = String(label || '').trim();
  if (!trimmedLabel) return clean;
  const newField = {
    id: slugifyFieldId(trimmedLabel),
    label: trimmedLabel,
    placeholder: String(placeholder || '').trim(),
    enabled: true,
  };
  if (scope === 'item') {
    return { ...clean, itemFields: [...clean.itemFields, newField] };
  }
  return { ...clean, invoiceFields: [...clean.invoiceFields, newField] };
}

/**
 * Edit an existing field's label, placeholder, enabled state, or move scope ('invoice' <-> 'item').
 */
export function updateIndustryField(config, fieldId, patch = {}) {
  const clean = normaliseIndustryConfig(config);
  const inInvoice = clean.invoiceFields.find((f) => f.id === fieldId);
  const inItem = clean.itemFields.find((f) => f.id === fieldId);
  const current = inInvoice || inItem;
  if (!current) return clean;

  const currentScope = inInvoice ? 'invoice' : 'item';
  const nextScope = patch.scope === 'invoice' || patch.scope === 'item' ? patch.scope : currentScope;
  const updated = {
    ...current,
    label: patch.label !== undefined ? (String(patch.label).trim() || current.label) : current.label,
    placeholder: patch.placeholder !== undefined ? String(patch.placeholder).trim() : current.placeholder,
    enabled: patch.enabled !== undefined ? !!patch.enabled : current.enabled,
  };

  if (nextScope === currentScope) {
    const key = currentScope === 'invoice' ? 'invoiceFields' : 'itemFields';
    return {
      ...clean,
      [key]: clean[key].map((f) => (f.id === fieldId ? updated : f)),
    };
  }

  // Scope changed: remove from old list and append to new list
  return {
    ...clean,
    invoiceFields: nextScope === 'invoice'
      ? [...clean.invoiceFields.filter((f) => f.id !== fieldId), updated]
      : clean.invoiceFields.filter((f) => f.id !== fieldId),
    itemFields: nextScope === 'item'
      ? [...clean.itemFields.filter((f) => f.id !== fieldId), updated]
      : clean.itemFields.filter((f) => f.id !== fieldId),
  };
}

/**
 * Delete a field permanently by id from both invoiceFields and itemFields.
 */
export function deleteIndustryField(config, fieldId) {
  const clean = normaliseIndustryConfig(config);
  return {
    ...clean,
    invoiceFields: clean.invoiceFields.filter((f) => f.id !== fieldId),
    itemFields: clean.itemFields.filter((f) => f.id !== fieldId),
  };
}

/**
 * Extract non-empty invoice-level specification entries from `details.industrySpecs`
 * so PDF/Thermal templates print ONLY filled fields (zero clutter when blank).
 */
export function filledIndustrySpecs(details = {}) {
  const spec = details?.industrySpecs;
  if (!spec || typeof spec !== 'object') {
    return { title: 'Product Specifications', showSpecBox: true, fields: [] };
  }
  const list = Array.isArray(spec.fields) ? spec.fields : [];
  const fields = list
    .map((f, i) => ({
      key: f?.id || `spec_${i}`,
      id: f?.id || `spec_${i}`,
      label: String(f?.label || '').trim(),
      value: String(f?.value || '').trim(),
    }))
    .filter((f) => f.label && f.value);
  return {
    title: String(spec.title || 'Product Specifications').trim() || 'Product Specifications',
    showSpecBox: spec.showSpecBox !== false,
    fields,
  };
}

/**
 * Extract non-empty item-level specification entries from `item.itemSpecs`.
 */
export function filledItemSpecs(item = {}) {
  const list = Array.isArray(item?.itemSpecs) ? item.itemSpecs : [];
  return list
    .map((f, i) => ({
      key: f?.id || `ispec_${i}`,
      id: f?.id || `ispec_${i}`,
      label: String(f?.label || '').trim(),
      value: String(f?.value || '').trim(),
    }))
    .filter((f) => f.label && f.value);
}

/**
 * Format filled item specs into a single crisp line for PDF / Thermal rows,
 * e.g. "IMEI 1 / Serial No: 358912009911223  •  Warranty: 1 Year".
 */
export function formatItemSpecsLine(item = {}, separator = '  •  ') {
  return filledItemSpecs(item)
    .map((f) => `${f.label}: ${f.value}`)
    .join(separator);
}

/**
 * Collect all searchable specification values from a saved bill (invoice-level + item-level)
 * for instant lookup by Chassis No, Engine No, IMEI, Serial No, Batch No, etc.
 */
export function allBillSpecSearchValues(bill = {}) {
  const details = bill?.data?.details || bill?.details || {};
  const items = Array.isArray(bill?.data?.items)
    ? bill.data.items
    : (Array.isArray(bill?.items) ? bill.items : []);
  const invSpecs = filledIndustrySpecs(details).fields.map((f) => `${f.label} ${f.value}`);
  const itemSpecs = items
    .flatMap((it) => filledItemSpecs(it).map((f) => `${f.label} ${f.value}`));
  return [...invSpecs, ...itemSpecs];
}
