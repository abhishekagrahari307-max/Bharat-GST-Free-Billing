// Universal 1-Click Tally XML & Vyapar / Excel (.xlsx) / CSV Migration Bridge (v3.3.0)
// Uses zero-CVE fflate XLSX reader (./xlsxRead.js) and UTF-16/UTF-8 BOM-safe Tally XML parser (./tallyXml.js).
// Automatically classifies & maps Customers/Parties, Stock Items (with Opening Stock, HSN & GST %), and Tally Vouchers.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import { readXlsx } from './xlsxRead.js';
import { decodeXmlBytes, tallyMastersToRows } from './tallyXml.js';

function cleanNum(val) {
  const s = String(val ?? '').replace(/[^0-9.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
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
 * Maps a 2D array of rows (from Vyapar .xlsx, Excel .xlsx, or .csv) into normalized Clients or Products.
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
      return {
        name,
        hsn: pickField(r, ['HSN', 'HSN Code', 'HSN/SAC', 'SAC']),
        barcode: pickField(r, ['Item Code', 'Barcode', 'SKU', 'Code']),
        unit: (pickField(r, ['Unit', 'Base Unit', 'UOM', 'UQC']) || 'PCS').toUpperCase(),
        stock,
        sellingPrice,
        price: sellingPrice,
        purchasePrice,
        gstRate,
        trackStock: true,
      };
    })
    .filter(Boolean);

  return { kind: 'PRODUCTS', clients: [], products };
}

/**
 * Parses Vyapar / General .xlsx bytes or .csv text into Clients & Products.
 */
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
    return { source: 'EXCEL_XLSX', clients: allClients, products: allProducts, vouchers: [] };
  }

  const csvStr = text ?? new TextDecoder('utf-8').decode(bytes);
  const rows = parseCsvRows(csvStr);
  const res = mapTabularRowsToEntities(rows);
  return { source: 'CSV', clients: res.clients, products: res.products, vouchers: [] };
}

/**
 * Parses TallyPrime / Tally.ERP 9 XML (UTF-8 or UTF-16LE BOM) including:
 * - Sundry Debtors / Creditors Ledgers -> Clients
 * - Stock Items (with HSN, GST %, Standard Price & OPENINGBALANCE Stock!) -> Products
 * - Optional <VOUCHER VCHTYPE="Sales"> -> Invoices
 */
export function parseTallyXmlMigration(input) {
  const xml = typeof input === 'string' ? input : decodeXmlBytes(input);

  // Extract OPENINGBALANCE quantities by StockItem NAME before calling tallyMastersToRows
  const openingQtyByItem = new Map();
  const stockMatches = xml.matchAll(/<STOCKITEM(?:\s[^>]*)?\sNAME="([^"]*)"[^>]*>([\s\S]*?)<\/STOCKITEM>/gi);
  for (const m of stockMatches) {
    const itemName = m[1].trim().toLowerCase();
    const openMatch = /<OPENINGBALANCE[^>]*>([\s\S]*?)<\/OPENINGBALANCE>/i.exec(m[2]);
    if (openMatch) {
      openingQtyByItem.set(itemName, Math.abs(cleanNum(openMatch[1])));
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
      const stock = openingQtyByItem.get(name.trim().toLowerCase()) || 0;
      return {
        name,
        hsn: r[1] || '',
        unit: (r[2] || 'NOS').toUpperCase(),
        purchasePrice,
        sellingPrice,
        price: sellingPrice,
        gstRate: cleanNum(r[5]),
        stock,
        trackStock: true,
      };
    }).filter((p) => p.name);
  }

  // Also parse <VOUCHER VCHTYPE="Sales"> if DayBook/Vouchers XML is provided
  const vouchers = [];
  const vchMatches = xml.matchAll(/<VOUCHER\b([^>]*)>([\s\S]*?)<\/VOUCHER>/gi);
  for (const vm of vchMatches) {
    const attrs = vm[1] || '';
    const body = vm[2] || '';
    const vchType = ((/VCHTYPE="([^"]*)"/i.exec(attrs) || [])[1] || '').trim();
    if (!/sales/i.test(vchType)) continue;
    const vchNo = ((/<VOUCHERNUMBER[^>]*>([\s\S]*?)<\/VOUCHERNUMBER>/i.exec(body) || [])[1] || '').trim();
    const rawDate = ((/<DATE[^>]*>([\s\S]*?)<\/DATE>/i.exec(body) || [])[1] || '').trim();
    const isoDate = /^\d{8}$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : new Date().toISOString().slice(0, 10);
    const party = ((/<PARTYLEDGERNAME[^>]*>([\s\S]*?)<\/PARTYLEDGERNAME>/i.exec(body) || [])[1] || 'Customer').trim();
    const amtMatches = [...body.matchAll(/<AMOUNT[^>]*>([\s\S]*?)<\/AMOUNT>/gi)].map((a) => Math.abs(cleanNum(a[1])));
    const total = amtMatches.length ? Math.max(...amtMatches) : 0;
    if (vchNo && total > 0) {
      vouchers.push({
        invoiceNumber: vchNo,
        invoiceDate: isoDate,
        clientName: party,
        totalAmount: total,
        status: 'unpaid',
        data: {
          invoiceType: 'Tax Invoice',
          invoiceNumber: vchNo,
          invoiceDate: isoDate,
          client: { name: party },
          items: [{ name: 'Imported Tally Sales Voucher', quantity: 1, price: total, gstRate: 0, amount: total }],
          subtotal: total,
          grandTotal: total,
        },
      });
    }
  }

  if (!clients.length && !products.length && !vouchers.length) {
    throw new Error('No Tally Ledgers, Stock Items, or Sales Vouchers found in this XML file.');
  }

  return { source: 'TALLY_XML', clients, products, vouchers };
}
