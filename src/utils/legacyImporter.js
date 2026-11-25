// Universal 1-Click Tally XML & Vyapar / Excel (.xlsx) / CSV Migration Bridge (v5.2.0 — Audit Hardened)
// Fixes P0-1 & P0-6:
// 1. Writes canonical `taxPercent` AND `gstRate` (plus `price` & `sellingPrice`) on every imported Product
// 2. Preserves full Tally `<ALLINVENTORYENTRIES.LIST>` line items + `<LEDGERENTRIES.LIST>` CGST/SGST/IGST tax breakup
// 3. Flags explicit `warnings` whenever a ledger-only Tally voucher lacks item/tax detail in XML
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import { readXlsx } from './xlsxRead.js';
import { decodeXmlBytes, tallyMastersToRows } from './tallyXml.js';
import { normalizeCanonicalProduct } from './canonicalAdapter.js';

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

function cleanNum(val) {
  const s = String(val ?? '').replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function cleanTallyQty(val) {
  // Tally formats qty as e.g. " 10 PCS" or "5.50 KGS" -> extract leading number!
  const m = /-?\d+(?:\.\d+)?/.exec(String(val ?? ''));
  return m ? Math.abs(Number(m[0])) : 0;
}

function cleanTallyRate(val) {
  // Tally formats rate as e.g. "100.00/PCS" -> extract leading number!
  const m = /-?\d+(?:\.\d+)?/.exec(String(val ?? '').replace(/,/g, ''));
  return m ? Math.abs(Number(m[0])) : 0;
}

export function parseCsvRows(csvText = '') {
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

function rowsToObjects(rows = []) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h || '').trim());
  return rows.slice(1).map((r) => {
    const obj = {};
    for (let i = 0; i < headers.length; i += 1) {
      if (headers[i]) obj[headers[i]] = r[i] ?? '';
    }
    return obj;
  });
}

function pickField(rowObj, aliases = []) {
  const entries = Object.entries(rowObj || {});
  for (const alias of aliases) {
    const target = alias.toLowerCase();
    const hit = entries.find(([k]) => k.trim().toLowerCase() === target);
    if (hit && String(hit[1] ?? '').trim() !== '') return String(hit[1]).trim();
  }
  for (const alias of aliases) {
    const target = alias.toLowerCase();
    const hit = entries.find(([k]) => k.trim().toLowerCase().includes(target));
    if (hit && String(hit[1] ?? '').trim() !== '') return String(hit[1]).trim();
  }
  return '';
}

/**
 * Maps a 2D array of rows (from Vyapar .xlsx, Excel .xlsx, or .csv) into canonical Clients or Products.
 * Sets BOTH `taxPercent` and `gstRate` so InventoryView, InvoiceGenerator, B2B Catalog & P2P agree 100%.
 */
export function mapTabularRowsToEntities(rows = []) {
  const objects = rowsToObjects(rows);
  if (!objects.length) {
    throw new Error('Uploaded Excel / CSV sheet has no data rows.');
  }
  const headerLower = (rows[0] || []).map((h) => String(h || '').toLowerCase());
  const looksLikeItems = headerLower.some((h) =>
    /item|product|hsn|sac|sale\s*price|selling\s*price|mrp|stock|barcode|sku/.test(h)
  );
  const looksLikeParties =
    !looksLikeItems &&
    headerLower.some((h) => /party|customer|client|ledger|gstin|buyer|vendor/.test(h));

  if (looksLikeParties) {
    const clients = objects
      .map((r) => {
        const name = pickField(r, ['Party Name', 'Customer Name', 'Client Name', 'Ledger Name', 'Name']);
        if (!name) return null;
        const gstin = pickField(r, ['GSTIN', 'GST No', 'GSTIN/UIN', 'Party GSTIN']).toUpperCase().replace(/\s+/g, '');
        return {
          name,
          gstin,
          phone: pickField(r, ['Phone', 'Mobile', 'Contact', 'Phone No', 'Mobile No']),
          email: pickField(r, ['Email', 'E-mail']),
          address: pickField(r, ['Address', 'Billing Address', 'City']),
          state: pickField(r, ['State', 'Place of Supply']) || (gstin.length >= 2 ? gstin.slice(0, 2) : ''),
        };
      })
      .filter(Boolean);
    return { kind: 'CLIENTS', clients, products: [] };
  }

  const products = objects
    .map((r) => {
      const name = pickField(r, ['Item Name', 'Product Name', 'Particulars', 'Description', 'Name']);
      if (!name) return null;
      const sellingPrice = cleanNum(pickField(r, ['Sale Price', 'Selling Price', 'Rate', 'Unit Price', 'MRP', 'Price']));
      const purchasePrice = cleanNum(pickField(r, ['Purchase Price', 'Cost Price', 'Buy Price']));
      const stock = cleanNum(pickField(r, ['Opening Stock', 'Current Stock', 'Stock Qty', 'Stock', 'Quantity', 'Qty']));
      const gstRate = cleanNum(pickField(r, ['Tax Rate', 'GST %', 'GST Rate', 'IGST %', 'Tax %', 'Tax']));
      return normalizeCanonicalProduct({
        name,
        hsn: pickField(r, ['HSN', 'HSN Code', 'HSN/SAC', 'SAC']),
        barcode: pickField(r, ['Item Code', 'Barcode', 'SKU', 'Code']),
        unit: (pickField(r, ['Unit', 'Base Unit', 'UOM', 'UQC']) || 'PCS').toUpperCase(),
        stock,
        sellingPrice,
        price: sellingPrice,
        purchasePrice,
        taxPercent: gstRate,
        gstRate,
        trackStock: true,
      });
    })
    .filter(Boolean);

  return { kind: 'PRODUCTS', clients: [], products };
}

export function parseSpreadsheetMigration({ bytes, text, fileName = '' } = {}) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.xlsx') || (bytes && !text)) {
    const sheets = readXlsx(bytes);
    let allClients = [];
    let allProducts = [];
    for (const sh of sheets) {
      if (!sh.rows || sh.rows.length < 2) continue;
      try {
        const res = mapTabularRowsToEntities(sh.rows);
        allClients = allClients.concat(res.clients);
        allProducts = allProducts.concat(res.products);
      } catch { /* empty sheet */ }
    }
    return { source: 'EXCEL_XLSX', clients: allClients, products: allProducts, vouchers: [], warnings: [] };
  }

  const csvStr = text ?? new TextDecoder('utf-8').decode(bytes);
  const rows = parseCsvRows(csvStr);
  const res = mapTabularRowsToEntities(rows);
  return { source: 'CSV', clients: res.clients, products: res.products, vouchers: [], warnings: [] };
}

function extractXmlTag(block, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = re.exec(block);
  return m ? m[1].trim() : '';
}

/**
 * Parses TallyPrime / Tally.ERP 9 XML (UTF-8 or UTF-16LE BOM) with FULL Line-Item & GST Tax Fidelity:
 * - Sundry Debtors / Creditors Ledgers -> Clients
 * - Stock Items (HSN, canonical `taxPercent` + `gstRate`, Standard Price & OPENINGBALANCE Stock) -> Products
 * - `<VOUCHER VCHTYPE="Sales">` -> Full canonical Tax Invoices preserving `<ALLINVENTORYENTRIES.LIST>` items
 *   and `<LEDGERENTRIES.LIST>` / `<ALLLEDGERENTRIES.LIST>` CGST / SGST / IGST breakup!
 */
export function parseTallyXmlMigration(input) {
  const xml = typeof input === 'string' ? input : decodeXmlBytes(input);
  const warnings = [];

  const openingQtyByItem = new Map();
  const productTaxByItem = new Map();
  const stockMatches = xml.matchAll(/<STOCKITEM(?:\s[^>]*)?\sNAME="([^"]*)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi);
  for (const m of stockMatches) {
    const itemName = m[1].trim().toLowerCase();
    const openMatch = /<OPENINGBALANCE[^>]*>([\s\S]*?)<\/OPENINGBALANCE>/i.exec(m[2]);
    if (openMatch) {
      openingQtyByItem.set(itemName, cleanTallyQty(openMatch[1]));
    }
  }

  let clients = [];
  let products = [];
  if (/<(LEDGER|STOCKITEM)\b/i.test(xml)) {
    const masters = tallyMastersToRows(xml);
    clients = masters.clients.slice(1).map((r) => ({
      name: r[0] || '',
      gstin: r[1] || '',
      phone: r[2] || '',
      email: r[3] || '',
      address: r[4] || '',
      state: r[5] || '',
    })).filter((c) => c.name);

    products = masters.products.slice(1).map((r) => {
      const name = r[0] || '';
      const purchasePrice = cleanNum(r[3]);
      const sellingPrice = cleanNum(r[4]) || purchasePrice;
      const gstRate = cleanNum(r[5]);
      const stock = openingQtyByItem.get(name.trim().toLowerCase()) || 0;
      productTaxByItem.set(name.trim().toLowerCase(), gstRate);
      return normalizeCanonicalProduct({
        name,
        hsn: r[1] || '',
        unit: (r[2] || 'NOS').toUpperCase(),
        purchasePrice,
        sellingPrice,
        price: sellingPrice,
        taxPercent: gstRate,
        gstRate,
        stock,
        trackStock: true,
      });
    }).filter((p) => p.name);
  }

  const vouchers = [];
  const vchMatches = xml.matchAll(/<VOUCHER\b([^>]*)>([\s\S]*?)<\/VOUCHER>/gi);
  for (const vm of vchMatches) {
    const attrs = vm[1] || '';
    const body = vm[2] || '';
    const vchType = ((/VCHTYPE="([^"]*)"/i.exec(attrs) || [])[1] || extractXmlTag(body, 'VOUCHERTYPENAME')).trim();
    const isCreditNote = /credit\s*note/i.test(vchType);
    if (!/sales/i.test(vchType) && !isCreditNote) continue;

    const vchNo = extractXmlTag(body, 'VOUCHERNUMBER');
    if (!vchNo) continue;
    const rawDate = extractXmlTag(body, 'DATE');
    const isoDate = /^\d{8}$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : new Date().toISOString().slice(0, 10);
    const party = extractXmlTag(body, 'PARTYLEDGERNAME') || extractXmlTag(body, 'PARTYNAME') || 'Customer';
    const partyGstin = extractXmlTag(body, 'PARTYGSTIN').toUpperCase().replace(/\s+/g, '');

    // 1. Parse Ledger Entries for CGST / SGST / UTGST / IGST & Party Total
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let partyTotal = 0;
    const ledgerBlocks = [
      ...body.matchAll(/<(?:ALL)?LEDGERENTRIES\.LIST>([\s\S]*?)<\/(?:ALL)?LEDGERENTRIES\.LIST>/gi),
    ];
    for (const lb of ledgerBlocks) {
      const lBody = lb[1] || '';
      const lName = extractXmlTag(lBody, 'LEDGERNAME');
      const lAmt = Math.abs(cleanNum(extractXmlTag(lBody, 'AMOUNT')));
      if (!lName || lAmt <= 0) continue;
      if (lName.toLowerCase() === party.toLowerCase()) {
        partyTotal = Math.max(partyTotal, lAmt);
      } else if (/\bcgst\b/i.test(lName)) {
        cgst = r2(cgst + lAmt);
      } else if (/\b(sgst|utgst)\b/i.test(lName)) {
        sgst = r2(sgst + lAmt);
      } else if (/\bigst\b/i.test(lName)) {
        igst = r2(igst + lAmt);
      }
    }

    // 2. Parse Inventory Entries (`ALLINVENTORYENTRIES.LIST` / `INVENTORYENTRIES.LIST`)
    const invBlocks = [
      ...body.matchAll(/<(?:ALL)?INVENTORYENTRIES\.LIST>([\s\S]*?)<\/(?:ALL)?INVENTORYENTRIES\.LIST>/gi),
    ];
    const items = [];
    let itemsTaxableSum = 0;

    for (const ib of invBlocks) {
      const iBody = ib[1] || '';
      const stockName = extractXmlTag(iBody, 'STOCKITEMNAME');
      if (!stockName) continue;
      const qtyStr = extractXmlTag(iBody, 'BILLEDQTY') || extractXmlTag(iBody, 'ACTUALQTY');
      const qty = cleanTallyQty(qtyStr) || 1;
      const unitMatch = /[A-Za-z]+/.exec(qtyStr || '');
      const unit = unitMatch ? unitMatch[0].toUpperCase() : 'NOS';
      const lineTaxable = Math.abs(cleanNum(extractXmlTag(iBody, 'AMOUNT')));
      const rate = cleanTallyRate(extractXmlTag(iBody, 'RATE')) || (qty > 0 ? r2(lineTaxable / qty) : lineTaxable);
      const hsn = extractXmlTag(iBody, 'HSNCODE') || extractXmlTag(iBody, 'GSTHSNCODE');

      // Extract item GST % from RATEDETAILS.LIST or stock master if present
      let itemTaxPct = 0;
      const rateDetails = [...iBody.matchAll(/<GSTRATE[^>]*>([\s\S]*?)<\/GSTRATE>/gi)].map((x) => cleanNum(x[1]));
      if (rateDetails.length > 0) {
        // Tally lists CGST + SGST + IGST rates in RATEDETAILS.LIST; max single IGST or sum of CGST+SGST
        const maxR = Math.max(...rateDetails);
        itemTaxPct = maxR;
      } else if (productTaxByItem.has(stockName.trim().toLowerCase())) {
        itemTaxPct = productTaxByItem.get(stockName.trim().toLowerCase()) || 0;
      }

      itemsTaxableSum = r2(itemsTaxableSum + lineTaxable);
      items.push({
        name: stockName,
        description: stockName,
        hsn,
        unit,
        quantity: qty,
        rate,
        price: rate,
        discount: 0,
        taxPercent: itemTaxPct,
        gstRate: itemTaxPct,
        cessPercent: 0,
        taxableValue: lineTaxable,
        amount: lineTaxable,
      });
    }

    const totalTax = r2(cgst + sgst + igst);
    const allAmounts = [...body.matchAll(/<AMOUNT[^>]*>([\s\S]*?)<\/AMOUNT>/gi)].map((a) => Math.abs(cleanNum(a[1])));
    const fallbackMaxAmt = allAmounts.length ? Math.max(...allAmounts) : 0;

    const taxableAmount = itemsTaxableSum > 0
      ? itemsTaxableSum
      : partyTotal > totalTax && totalTax > 0
        ? r2(partyTotal - totalTax)
        : r2(Math.max(0, fallbackMaxAmt - totalTax));

    const grandTotal = partyTotal > 0
      ? partyTotal
      : itemsTaxableSum > 0
        ? r2(itemsTaxableSum + totalTax)
        : fallbackMaxAmt;

    if (grandTotal <= 0) continue;

    // Back-fill effective GST % onto items if XML gave ledger-level CGST/SGST/IGST without RATEDETAILS.LIST
    const inferredVoucherRate = taxableAmount > 0 && totalTax > 0 ? r2((totalTax / taxableAmount) * 100) : 0;
    let voucherWarning = null;

    if (items.length === 0) {
      voucherWarning = `Voucher #${vchNo}: XML contained ledger totals without <ALLINVENTORYENTRIES.LIST> item lines${totalTax === 0 ? ' or GST ledger split — verify GST rate manually' : ''}.`;
      warnings.push(voucherWarning);
      items.push({
        name: isCreditNote ? 'Imported Tally Credit Note' : 'Imported Tally Sales Voucher',
        description: isCreditNote ? 'Imported Tally Credit Note' : 'Imported Tally Sales Voucher',
        hsn: '',
        unit: 'NOS',
        quantity: 1,
        rate: taxableAmount,
        price: taxableAmount,
        discount: 0,
        taxPercent: inferredVoucherRate,
        gstRate: inferredVoucherRate,
        cessPercent: 0,
        taxableValue: taxableAmount,
        amount: grandTotal,
      });
    } else if (inferredVoucherRate > 0) {
      for (const it of items) {
        if (!it.taxPercent) {
          it.taxPercent = inferredVoucherRate;
          it.gstRate = inferredVoucherRate;
        }
        it.amount = r2(it.taxableValue + (it.taxableValue * it.taxPercent) / 100);
      }
    }

    const docSlug = isCreditNote ? 'credit-note' : 'tax-invoice';
    vouchers.push({
      invoiceType: docSlug,
      invoiceNumber: vchNo,
      invoiceDate: isoDate,
      clientName: party,
      clientGstin: partyGstin,
      totalAmount: grandTotal,
      status: 'unpaid',
      migrationWarning: voucherWarning,
      data: {
        invoiceType: docSlug,
        invoiceNumber: vchNo,
        invoiceDate: isoDate,
        details: {
          invoiceNumber: vchNo,
          invoiceDate: isoDate,
        },
        client: { name: party, gstin: partyGstin },
        items,
        totals: {
          subtotal: taxableAmount,
          totalDiscount: 0,
          taxableAmount,
          cgst,
          sgst,
          utgst: 0,
          igst,
          cess: 0,
          total: grandTotal,
          isInterstate: igst > 0,
        },
        subtotal: taxableAmount,
        totalCgst: cgst,
        totalSgst: sgst,
        totalIgst: igst,
        grandTotal,
      },
    });
  }

  if (!clients.length && !products.length && !vouchers.length) {
    throw new Error('No Tally Ledgers, Stock Items, or Sales Vouchers found in this XML file.');
  }

  return { source: 'TALLY_XML', clients, products, vouchers, warnings };
}
