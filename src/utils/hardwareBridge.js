// Browser-Native Hardware Bridge (v3.1.0):
// 1. WebSerial Electronic Weighing Scale Parser (Kg / Gm live capture for Kirana, Sweet Shop, Jewellery)
// 2. Direct ESC/POS Thermal Receipt Byte-Stream Builder + WebUSB / WebSerial Silent 0.2s Printing
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

/**
 * Parses standard Indian RS-232 / USB-Serial electronic weighing scale frames:
 * Examples: "ST,GS,+002.450kg", "WT: 1.250 KG", "+  500 g", "000.750"
 */
export function parseScaleWeightLine(line = '') {
  const raw = String(line || '').trim();
  if (!raw) return null;
  const match = raw.match(/([+-]?\s*\d+(?:\.\d+)?)\s*(kg|kgs|g|gm|gms|gram|grams)?/i);
  if (!match) return null;
  const num = Number(match[1].replace(/\s+/g, ''));
  if (!Number.isFinite(num) || num < 0) return null;
  const unitRaw = String(match[2] || 'kg').toLowerCase();
  const isGrams = unitRaw === 'g' || unitRaw === 'gm' || unitRaw === 'gms' || unitRaw.startsWith('gram');
  const weightKg = isGrams ? Math.round((num / 1000) * 1000) / 1000 : Math.round(num * 1000) / 1000;
  return {
    raw,
    value: num,
    unit: isGrams ? 'g' : 'kg',
    weightKg,
  };
}

/**
 * Reads a single stabilized weight frame from a WebSerial weighing scale.
 */
export async function readWeightFromWebSerial({ baudRate = 9600, timeoutMs = 6000 } = {}) {
  if (typeof navigator === 'undefined' || !navigator.serial) {
    throw new Error('WebSerial API is supported in Chrome / Edge desktop browsers over HTTPS or localhost.');
  }
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate });
  const reader = port.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/[\r\n]+/);
      buffer = lines.pop() || '';
      for (const ln of lines) {
        const parsed = parseScaleWeightLine(ln);
        if (parsed && parsed.weightKg > 0) {
          return parsed;
        }
      }
    }
    const fallback = parseScaleWeightLine(buffer);
    if (fallback) return fallback;
    throw new Error('Connected to scale, but no stabilized weight frame received yet.');
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
    try { await port.close(); } catch { /* ignore */ }
  }
}

/**
 * Builds standard ESC/POS binary bytes for 58mm / 80mm thermal printers (Epson / TVS / Rugtek / Xprinter).
 */
export function buildEscPosReceiptBytes(bill = {}, profile = {}, { paperWidthChars = 32 } = {}) {
  const d = bill?.data || bill || {};
  const shop = String(profile?.businessName || d.seller?.businessName || 'BHARAT GST STORE').slice(0, paperWidthChars);
  const gstin = String(profile?.gstin || d.seller?.gstin || '').trim();
  const invNo = String(bill?.invoiceNumber || d.invoiceNumber || 'POS-001');
  const invDate = String(bill?.invoiceDate || d.invoiceDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const client = String(bill?.clientName || d.client?.name || 'Walk-in Customer').slice(0, paperWidthChars);
  const total = Number(bill?.totalAmount ?? d.grandTotal ?? 0).toFixed(2);
  const divider = '-'.repeat(paperWidthChars);

  const chunks = [];
  const pushBytes = (...arr) => chunks.push(new Uint8Array(arr));
  const pushText = (txt) => chunks.push(new TextEncoder().encode(`${txt}\n`));

  // ESC @ (Initialize), ESC a 1 (Center), ESC E 1 (Bold ON)
  pushBytes(0x1b, 0x40);
  pushBytes(0x1b, 0x61, 0x01);
  pushBytes(0x1b, 0x45, 0x01);
  pushText(shop);
  pushBytes(0x1b, 0x45, 0x00);
  if (gstin) pushText(`GSTIN: ${gstin}`);
  pushText(divider);

  // Left align
  pushBytes(0x1b, 0x61, 0x00);
  pushText(`Bill: ${invNo}`);
  pushText(`Date: ${invDate}`);
  pushText(`Party: ${client}`);
  pushText(divider);

  const items = Array.isArray(d.items) ? d.items : [];
  for (const it of items) {
    const name = String(it?.name || it?.description || 'Item').slice(0, paperWidthChars);
    const qty = Number(it?.quantity ?? it?.qty ?? 1);
    const rate = Number(it?.price ?? it?.rate ?? 0).toFixed(2);
    const amt = Number(it?.amount ?? qty * Number(rate)).toFixed(2);
    pushText(name);
    const left = `  ${qty} x ${rate}`;
    const spaces = Math.max(1, paperWidthChars - left.length - amt.length);
    pushText(`${left}${' '.repeat(spaces)}${amt}`);
  }

  pushText(divider);
  pushBytes(0x1b, 0x45, 0x01);
  const totLeft = 'GRAND TOTAL (INR)';
  const totSpaces = Math.max(1, paperWidthChars - totLeft.length - total.length);
  pushText(`${totLeft}${' '.repeat(totSpaces)}${total}`);
  pushBytes(0x1b, 0x45, 0x00);
  pushText(divider);

  pushBytes(0x1b, 0x61, 0x01);
  pushText('Thank You! Visit Again');
  pushText('\n\n');
  // GS V 66 0 — Feed & partial paper cut
  pushBytes(0x1d, 0x56, 0x42, 0x00);

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Sends ESC/POS receipt bytes directly to a USB thermal printer via WebUSB (or WebSerial fallback).
 */
export async function printSilentEscPosWebUsb(escPosBytes) {
  if (typeof navigator !== 'undefined' && navigator.usb) {
    const device = await navigator.usb.requestDevice({ filters: [] });
    await device.open();
    if (device.configuration === null) await device.selectConfiguration(1);
    const iface = device.configuration.interfaces[0];
    await device.claimInterface(iface.interfaceNumber);
    const outEp = iface.alternate.endpoints.find((e) => e.direction === 'out');
    if (!outEp) throw new Error('No bulk OUT endpoint found on selected USB thermal printer.');
    await device.transferOut(outEp.endpointNumber, escPosBytes);
    try { await device.close(); } catch { /* ignore */ }
    return { transport: 'WebUSB', bytesSent: escPosBytes.length };
  }
  if (typeof navigator !== 'undefined' && navigator.serial) {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    const writer = port.writable.getWriter();
    await writer.write(escPosBytes);
    writer.releaseLock();
    await port.close();
    return { transport: 'WebSerial', bytesSent: escPosBytes.length };
  }
  throw new Error('Direct ESC/POS hardware printing requires Chrome/Edge with WebUSB or WebSerial support.');
}
