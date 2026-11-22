// Smart FIFO Lump-Sum Payment Allocator + B2B Shareable Digital Catalog & WhatsApp Order Parser (v3.1.0)
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

/**
 * Allocates a customer's lump-sum payment (e.g., ₹25,000) across their oldest unpaid invoices first (FIFO).
 */
export function computeFifoPaymentAllocation(bills = [], { clientName = '', lumpSumAmount = 0, paymentMode = 'UPI', paymentDate = new Date().toISOString().slice(0, 10) } = {}) {
  const target = String(clientName || '').trim().toLowerCase();
  let remaining = r2(Math.max(0, Number(lumpSumAmount) || 0));
  if (!target || remaining <= 0) {
    return { allocations: [], unallocatedAdvance: remaining, totalAllocated: 0 };
  }

  const eligible = (Array.isArray(bills) ? bills : [])
    .filter((b) => {
      if (!b || b.cancelled || b?.data?.cancelled) return false;
      const d = b.data || {};
      const type = String(d.invoiceType || b.invoiceType || 'Tax Invoice');
      if (/quotation|estimate|proforma|challan|order|credit note/i.test(type)) return false;
      const party = String(b.clientName || d.client?.name || '').trim().toLowerCase();
      if (party !== target) return false;
      const total = r2(Number(b.totalAmount ?? d.grandTotal ?? 0));
      const paid = String(b.status || '').toLowerCase() === 'paid' ? total : r2(Number(b.amountPaid ?? d.amountPaid ?? 0));
      return total - paid > 0.01;
    })
    .sort((a, b) => {
      const da = String(a.invoiceDate || a?.data?.invoiceDate || '');
      const db = String(b.invoiceDate || b?.data?.invoiceDate || '');
      return da.localeCompare(db);
    });

  const allocations = [];
  for (const bill of eligible) {
    if (remaining <= 0) break;
    const d = bill.data || {};
    const total = r2(Number(bill.totalAmount ?? d.grandTotal ?? 0));
    const alreadyPaid = r2(Number(bill.amountPaid ?? d.amountPaid ?? 0));
    const due = r2(Math.max(0, total - alreadyPaid));
    const applied = r2(Math.min(due, remaining));
    remaining = r2(remaining - applied);
    const newPaid = r2(alreadyPaid + applied);
    const newStatus = newPaid >= total - 0.01 ? 'paid' : 'partial';

    allocations.push({
      billId: bill.id,
      invoiceNumber: bill.invoiceNumber || d.invoiceNumber || 'INV',
      invoiceDate: String(bill.invoiceDate || d.invoiceDate || '').slice(0, 10),
      invoiceTotal: total,
      previousDue: due,
      appliedAmount: applied,
      remainingDue: r2(Math.max(0, total - newPaid)),
      newAmountPaid: newPaid,
      newStatus,
      paymentRecord: {
        amount: applied,
        date: paymentDate,
        method: paymentMode,
        note: 'FIFO Lump-Sum Settlement',
      },
    });
  }

  const totalAllocated = r2(allocations.reduce((s, a) => s + a.appliedAmount, 0));
  return {
    allocations,
    totalAllocated,
    unallocatedAdvance: remaining,
  };
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates a standalone, zero-server Shareable B2B Digital Catalog HTML file with live Cart & WhatsApp Order Link.
 */
export function buildShareableB2bCatalogHtml(products = [], profile = {}) {
  const shopName = profile?.businessName || 'Bharat GST Store';
  const shopPhone = String(profile?.phone || '').replace(/\D/g, '');
  const waPhone = shopPhone.length === 10 ? `91${shopPhone}` : shopPhone;
  const catalogItems = (Array.isArray(products) ? products : [])
    .filter((p) => p && p.name)
    .map((p) => ({
      id: String(p.id || p.name),
      name: String(p.name),
      hsn: String(p.hsn || ''),
      rate: Number(p.sellingPrice ?? p.price ?? 0) || 0,
      gst: Number(p.gstRate ?? p.taxRate ?? 0) || 0,
      unit: String(p.unit || 'PCS'),
    }));

  const jsonSafe = JSON.stringify(catalogItems).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(shopName)} — B2B Digital Order Catalog</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f8fafc;color:#0f172a;padding:1rem}
  .wrap{max-width:860px;margin:0 auto}
  .hdr{background:linear-gradient(135deg,#1e40af,#6d28d9);color:#fff;padding:1.25rem;border-radius:14px;margin-bottom:1rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.75rem}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:.9rem}
  .bar{position:sticky;bottom:.75rem;background:#0f172a;color:#fff;padding:.9rem 1.1rem;border-radius:12px;margin-top:1rem;display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap}
  input{padding:.45rem .6rem;border:1px solid #cbd5e1;border-radius:8px}
  button{background:#10b981;color:#fff;border:none;padding:.55rem 1rem;border-radius:8px;font-weight:700;cursor:pointer}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <h2 style="margin:0">${escapeHtml(shopName)} — Wholesale / Retail Catalog</h2>
    <div style="font-size:.85rem;opacity:.9;margin-top:.25rem">Enter quantities below and tap Send Order on WhatsApp</div>
  </div>
  <input id="q" placeholder="Search items..." style="width:100%;box-sizing:border-box;margin-bottom:.85rem" oninput="render()" />
  <div id="list" class="grid"></div>
  <div class="bar">
    <div id="sum">0 items · ₹0.00</div>
    <button onclick="sendOrder()">📲 Send Order on WhatsApp</button>
  </div>
</div>
<script>
const ITEMS = ${jsonSafe};
const WA = ${JSON.stringify(waPhone)};
const SHOP = ${JSON.stringify(shopName)};
const cart = {};
function setQty(i, val){ cart[i] = Math.max(0, Number(val)||0); updateSum(); }
function updateSum(){
  let count=0, total=0;
  ITEMS.forEach((it,i)=>{ const q=cart[i]||0; if(q>0){ count+=q; total += q*it.rate*(1+it.gst/100); }});
  document.getElementById('sum').textContent = count + ' qty · Est. ₹' + total.toFixed(2) + ' (incl. GST)';
}
function render(){
  const q = (document.getElementById('q').value||'').toLowerCase();
  document.getElementById('list').innerHTML = ITEMS.map((it,i)=>{
    if(q && !it.name.toLowerCase().includes(q)) return '';
    return '<div class="card"><b>'+it.name+'</b><div style="font-size:.8rem;color:#64748b">₹'+it.rate+' / '+it.unit+' (+'+it.gst+'% GST)</div>' +
      '<div style="margin-top:.55rem">Qty: <input type="number" min="0" step="1" style="width:76px" value="'+(cart[i]||'')+'" oninput="setQty('+i+',this.value)" /></div></div>';
  }).join('');
}
function sendOrder(){
  const lines = [];
  ITEMS.forEach((it,i)=>{ const q=cart[i]||0; if(q>0) lines.push(q+' x '+it.name+' @ '+it.rate); });
  if(!lines.length){ alert('Add at least 1 item quantity first.'); return; }
  const text = 'BHARAT_ORDER | ' + SHOP + '\\n' + lines.join('\\n');
  window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(text), '_blank');
}
render();
</script>
</body>
</html>`;
}

/**
 * Parses a customer's `BHARAT_ORDER` WhatsApp order message back into structured invoice/sales-order line items.
 */
export function parseWhatsappCatalogOrder(orderText = '', products = []) {
  const lines = String(orderText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const parsedItems = [];
  for (const ln of lines) {
    if (/^BHARAT_ORDER/i.test(ln)) continue;
    const m = ln.match(/^(\d+(?:\.\d+)?)\s*[x×*]\s*(.+?)\s*(?:@\s*(\d+(?:\.\d+)?))?$/i);
    if (!m) continue;
    const qty = Number(m[1]);
    const rawName = m[2].trim();
    const matchedProd = (Array.isArray(products) ? products : []).find(
      (p) => String(p?.name || '').trim().toLowerCase() === rawName.toLowerCase()
    );
    const rate = m[3] !== undefined
      ? Number(m[3])
      : Number(matchedProd?.sellingPrice ?? matchedProd?.price ?? 0);
    parsedItems.push({
      productId: matchedProd?.id || '',
      name: matchedProd?.name || rawName,
      hsn: matchedProd?.hsn || '',
      quantity: qty,
      price: rate,
      gstRate: Number(matchedProd?.gstRate ?? matchedProd?.taxRate ?? 18),
      unit: matchedProd?.unit || 'PCS',
    });
  }
  return parsedItems;
}
