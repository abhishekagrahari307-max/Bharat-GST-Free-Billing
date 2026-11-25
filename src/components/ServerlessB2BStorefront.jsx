import { useState, useMemo } from 'react';
import { encodeB2BOrderToken } from '../utils/autonomousMunimAnd43B';

export default function ServerlessB2BStorefront({ catalogData, onExitStorefront }) {
  // catalogData format from decodeServerlessCatalogLink: { b: { n, p, u }, i: [{ c, n, r, g, u }] }
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState({});
  const [buyerName, setBuyerName] = useState('');
  const [buyerGstin, setBuyerGstin] = useState('');
  const [buyerNote, setBuyerNote] = useState('');

  const business = catalogData?.b || { n: 'Wholesale Store', p: '', u: '' };
  const items = useMemo(() => (Array.isArray(catalogData?.i) ? catalogData.i : []), [catalogData]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => String(it.n || '').toLowerCase().includes(q));
  }, [items, search]);

  const itemKey = (it, idx) => String(it.c || it.n || idx);

  const updateQty = (code, delta) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[code] || 0) + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[code];
        return copy;
      }
      return { ...prev, [code]: next };
    });
  };

  const cartSummary = useMemo(() => {
    let subTotal = 0;
    let totalGst = 0;
    const lines = [];

    items.forEach((it, idx) => {
      const key = itemKey(it, idx);
      const qty = cart[key] || 0;
      if (qty > 0) {
        const taxable = qty * Number(it.r || 0);
        const gstAmt = (taxable * Number(it.g || 0)) / 100;
        subTotal += taxable;
        totalGst += gstAmt;
        lines.push({ ...it, qty, taxable, gstAmt, lineTotal: taxable + gstAmt });
      }
    });

    return {
      lines,
      subTotal,
      totalGst,
      grandTotal: subTotal + totalGst,
    };
  }, [items, cart]);

  const handleSendWhatsAppOrder = () => {
    if (!cartSummary.lines.length) {
      window.alert('Pehle kam se kam 1 item cart me add karein.');
      return;
    }
    if (!buyerName.trim()) {
      window.alert('Apni Dukaan / Party ka naam dalein.');
      return;
    }

    const orderToken = {
      buyer: buyerName.trim(),
      gstin: buyerGstin.trim().toUpperCase(),
      note: buyerNote.trim(),
      items: cartSummary.lines.map((l) => ({ id: l.c, name: l.n, qty: l.qty, rate: l.r, gst: l.g, unit: l.u })),
    };
    const encodedToken = encodeB2BOrderToken(orderToken);

    const itemLinesText = cartSummary.lines
      .map(
        (l, idx) =>
          `${idx + 1}. ${l.n} — ${l.qty} ${l.u} @ ₹${l.r} (+${l.g}% GST) = ₹${l.lineTotal.toFixed(2)}`
      )
      .join('\n');

    const msg = [
      `*NEW B2B ORDER — ${business.n}*`,
      `*Party:* ${buyerName.trim()}${buyerGstin ? ` (GSTIN: ${buyerGstin.trim().toUpperCase()})` : ''}`,
      buyerNote ? `*Note:* ${buyerNote.trim()}` : '',
      '--------------------------',
      itemLinesText,
      '--------------------------',
      `*Taxable:* ₹${cartSummary.subTotal.toFixed(2)}`,
      `*GST:* ₹${cartSummary.totalGst.toFixed(2)}`,
      `*Est. Grand Total:* ₹${cartSummary.grandTotal.toFixed(2)}`,
      '',
      'Order Code (For 1-Click Auto-Bill):',
      encodedToken,
    ]
      .filter(Boolean)
      .join('\n');

    const cleanPhone = String(business.p || '').replace(/[^0-9]/g, '');
    const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#0f172a', paddingBottom: '7rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Storefront Banner */}
      <div style={{ background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)', color: '#ffffff', padding: '1rem 1.15rem', position: 'sticky', top: 0, zIndex: 20, boxShadow: '0 4px 14px rgba(0,0,0,0.14)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div>
            <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(6, 78, 59, 0.65)', padding: '0.2rem 0.5rem', borderRadius: 4, fontWeight: 700 }}>
              Direct B2B Wholesale Catalog
            </span>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.3rem 0 0' }}>{business.n}</h1>
            <p style={{ fontSize: '0.75rem', color: '#d1fae5', margin: '0.15rem 0 0' }}>
              {business.p ? `Order Desk: ${business.p} · ` : ''}
              {catalogData?.ts ? `Rate Snapshot: ${catalogData.ts}` : 'Wholesale Rate Snapshot'}
              {catalogData?.totalEligible > 150 ? ` (Top 150 of ${catalogData.totalEligible} items)` : ''}
            </p>
          </div>
          {onExitStorefront && (
            <button
              type="button"
              onClick={onExitStorefront}
              style={{ fontSize: '0.76rem', background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.28)', padding: '0.45rem 0.8rem', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
            >
              Open Full ERP
            </button>
          )}
        </div>
      </div>

      {/* Main Storefront Body */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
        <div style={{ background: '#ffffff', padding: '1rem', borderRadius: 12, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
              Aapki Firm / Dukaan ka Naam *
            </label>
            <input
              type="text"
              placeholder="e.g., Sharma Kirana Store"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.88rem' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: '0.3rem' }}>
              GSTIN (Optional)
            </label>
            <input
              type="text"
              placeholder="15-Digit GSTIN"
              value={buyerGstin}
              onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
              style={{ width: '100%', padding: '0.55rem 0.75rem', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: '0.88rem', textTransform: 'uppercase' }}
            />
          </div>
        </div>

        <input
          type="text"
          placeholder="Search items by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '0.65rem 0.9rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 12, fontSize: '0.9rem' }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {filteredItems.map((it, idx) => {
            const key = itemKey(it, idx);
            const qty = cart[key] || 0;
            return (
              <div
                key={key}
                style={{ background: '#ffffff', padding: '0.85rem 1rem', borderRadius: 12, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>{it.n}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.15rem' }}>
                    Rate: <strong style={{ color: '#1e293b' }}>₹{it.r}</strong> / {it.u} · GST: {it.g}%
                  </div>
                </div>

                {qty === 0 ? (
                  <button
                    type="button"
                    onClick={() => updateQty(key, 1)}
                    style={{ padding: '0.45rem 0.95rem', background: '#059669', color: '#ffffff', border: 'none', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Add
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '0.25rem 0.45rem' }}>
                    <button
                      type="button"
                      onClick={() => updateQty(key, -1)}
                      style={{ width: 26, height: 26, background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, color: '#047857', fontWeight: 800, cursor: 'pointer' }}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#064e3b', minWidth: 24, textAlign: 'center' }}>
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQty(key, 1)}
                      style={{ width: 26, height: 26, background: '#059669', border: 'none', borderRadius: 6, color: '#ffffff', fontWeight: 800, cursor: 'pointer' }}
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {cartSummary.lines.length > 0 && (
          <input
            type="text"
            placeholder="Delivery / Transport Note (Optional)..."
            value={buyerNote}
            onChange={(e) => setBuyerNote(e.target.value)}
            style={{ width: '100%', padding: '0.6rem 0.85rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: '0.88rem' }}
          />
        )}
      </div>

      {/* Sticky Bottom Checkout Bar */}
      {cartSummary.lines.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#ffffff', borderTop: '1px solid #e2e8f0', padding: '0.8rem 1rem', boxShadow: '0 -4px 16px rgba(0,0,0,0.08)', zIndex: 30 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {cartSummary.lines.length} Items (incl. ₹{cartSummary.totalGst.toFixed(2)} GST)
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                ₹{cartSummary.grandTotal.toFixed(2)}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendWhatsAppOrder}
              style={{ padding: '0.65rem 1.25rem', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: 10, fontSize: '0.88rem', fontWeight: 800, cursor: 'pointer' }}
            >
              Send Order on WhatsApp →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
