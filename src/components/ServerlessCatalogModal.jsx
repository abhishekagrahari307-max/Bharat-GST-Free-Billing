import { useState, useMemo, useEffect } from 'react';
import { ShoppingCart, Send, X } from 'lucide-react';
import { decodeServerlessCatalogLink } from '../utils/autonomousMunimAnd43B';

export default function ServerlessCatalogModal() {
  const [catalog, setCatalog] = useState(() =>
    typeof window !== 'undefined' ? decodeServerlessCatalogLink(window.location.hash) : null
  );
  const [cart, setCart] = useState({});
  const [buyerName, setBuyerName] = useState('');

  useEffect(() => {
    const onHash = () => setCatalog(decodeServerlessCatalogLink(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const items = useMemo(() => (Array.isArray(catalog?.i) ? catalog.i : []), [catalog]);
  const shop = catalog?.b || {};

  const totals = useMemo(() => {
    let sub = 0;
    let gst = 0;
    const chosen = [];
    for (const it of items) {
      const qty = Number(cart[it.n] || 0);
      if (qty > 0) {
        const line = qty * Number(it.r || 0);
        const tax = (line * Number(it.g || 0)) / 100;
        sub += line;
        gst += tax;
        chosen.push({ ...it, qty, lineTotal: line + tax });
      }
    }
    return { chosen, grandTotal: Math.round((sub + gst) * 100) / 100 };
  }, [items, cart]);

  if (!catalog) return null;

  const closeStorefront = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setCatalog(null);
  };

  const sendWhatsappOrder = () => {
    if (totals.chosen.length === 0) return;
    const lines = [
      `BHARATGST_B2B_ORDER`,
      `Buyer: ${buyerName || 'Retail Partner'}`,
      ...totals.chosen.map((c) => `- ${c.n} | Qty: ${c.qty} ${c.u} | Rate: ₹${c.r}`),
      `Estimated Total (incl. GST): ₹${totals.grandTotal.toFixed(2)}`,
    ];
    const phoneDigits = String(shop.p || '').replace(/\D/g, '');
    const waPhone = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits;
    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(lines.join('\n'))}`
      : `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', padding: '1.35rem', background: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <ShoppingCart size={20} style={{ color: 'var(--primary)' }} /> {shop.n || 'B2B Live Storefront'}
            </h2>
            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
              Powered by Bharat GST Serverless B2B Storefront · Select quantities &amp; send order on WhatsApp
            </div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={closeStorefront} aria-label="Close Storefront">
            <X size={16} />
          </button>
        </div>

        <input
          className="form-input"
          placeholder="Your Shop / Buyer Name"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          style={{ marginBottom: '0.85rem' }}
        />

        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
          {items.map((it) => (
            <div key={it.n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0.85rem', borderRadius: 8, background: 'var(--bg-secondary)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{it.n}</div>
                <div className="text-muted" style={{ fontSize: '0.76rem' }}>₹{it.r} / {it.u} (+{it.g}% GST)</div>
              </div>
              <input
                type="number"
                min="0"
                className="form-input"
                style={{ width: 84, textAlign: 'center' }}
                value={cart[it.n] || ''}
                placeholder="0"
                onChange={(e) => setCart((prev) => ({ ...prev, [it.n]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.9rem' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
            Total ({totals.chosen.length} items): ₹{totals.grandTotal.toFixed(2)}
          </div>
          <button type="button" className="btn btn-primary" disabled={totals.chosen.length === 0} onClick={sendWhatsappOrder}>
            <Send size={15} /> Send Order on WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
