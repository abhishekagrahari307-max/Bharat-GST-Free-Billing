import { useEffect, useState, useCallback } from 'react';
import {
  getAllPurchases,
  getAllClients,
  getAllProducts,
  saveProduct,
  saveBill,
  DATA_SAVED_EVENT,
} from '../store';
import {
  checkSection43BCompliance,
  generateServerlessCatalogLink,
  decodeB2BOrderToken,
} from '../utils/autonomousMunimAnd43B';
import { buildP2pInvoicePayload } from '../utils/webrtcP2pSync';
import { toast } from './Toast';

export default function AutonomousMunimWidget({ businessProfile, onBillsUpdated }) {
  const [msmeReport, setMsmeReport] = useState(null);
  const [lowMarginItems, setLowMarginItems] = useState([]);
  const [catalogCopied, setCatalogCopied] = useState(false);
  const [showOrderImport, setShowOrderImport] = useState(false);
  const [orderText, setOrderText] = useState('');

  const runAutonomousScan = useCallback(async () => {
    try {
      const [purchases, clients, allItems] = await Promise.all([
        getAllPurchases().catch(() => []),
        getAllClients().catch(() => []),
        getAllProducts().catch(() => []),
      ]);

      const report43B = checkSection43BCompliance({
        purchases: Array.isArray(purchases) ? purchases : [],
        clients: Array.isArray(clients) ? clients : [],
        treatAllUnpaidSuppliersAsMsmeIfUnmarked: false,
      });
      setMsmeReport(report43B);

      const risky = (Array.isArray(allItems) ? allItems : [])
        .filter((it) => Number(it.purchasePrice ?? it.purchaseRate ?? 0) > 0 && Number(it.sellingPrice ?? it.price ?? 0) > 0)
        .map((it) => {
          const cost = Number(it.purchasePrice ?? it.purchaseRate ?? 0);
          const sell = Number(it.sellingPrice ?? it.price ?? 0);
          const marginPct = ((sell - cost) / sell) * 100;
          const suggestedRate = Math.ceil(cost / 0.9); // Protects 10% net margin
          return { ...it, cost, sell, marginPct: Number(marginPct.toFixed(1)), suggestedRate };
        })
        .filter((it) => it.marginPct < 10);

      setLowMarginItems(risky);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    runAutonomousScan();
    if (typeof window !== 'undefined') {
      window.addEventListener(DATA_SAVED_EVENT, runAutonomousScan);
      return () => window.removeEventListener(DATA_SAVED_EVENT, runAutonomousScan);
    }
    return undefined;
  }, [runAutonomousScan]);

  const handleAutoReprice = async (item) => {
    try {
      await saveProduct({
        ...item,
        sellingPrice: item.suggestedRate,
        price: item.suggestedRate,
      });
      toast(`Autonomous Munim repriced "${item.name}" to ₹${item.suggestedRate} (10%+ safe margin)!`, 'success');
      runAutonomousScan();
    } catch (err) {
      toast(err?.message || 'Could not reprice item', 'error');
    }
  };

  const handleCopyB2BCatalog = async () => {
    try {
      const allItems = await getAllProducts().catch(() => []);
      const link = generateServerlessCatalogLink(
        typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '',
        businessProfile || { businessName: 'My Store', phone: '' },
        allItems
      );
      await navigator.clipboard?.writeText(link);
      setCatalogCopied(true);
      toast('Serverless B2B WhatsApp Storefront link copied!', 'success');
      setTimeout(() => setCatalogCopied(false), 3000);
    } catch {
      toast('Could not copy catalog link', 'error');
    }
  };

  const handleConvertWhatsappToken = async () => {
    const parsed = decodeB2BOrderToken(orderText);
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      toast('Paste the WhatsApp message containing BGST-ORD:... code.', 'error');
      return;
    }
    try {
      const sellerState = businessProfile?.gstin ? String(businessProfile.gstin).slice(0, 2) : '';
      const bill = buildP2pInvoicePayload({
        docType: 'Sales Order',
        customerName: parsed.buyer || 'B2B Retailer',
        customerGstin: parsed.gstin || '',
        sellerState,
        staffNote: parsed.note || 'Auto-converted from Serverless WhatsApp B2B Storefront',
        items: parsed.items.map((it) => ({
          productId: it.id,
          name: it.name,
          quantity: it.qty,
          price: it.rate,
          gstRate: it.gst,
          unit: it.unit || 'PCS',
        })),
      });
      await saveBill(bill);
      toast(`✓ Created Sales Order #${bill.invoiceNumber} for ${bill.clientName} (₹${bill.totalAmount.toFixed(2)})!`, 'success');
      setOrderText('');
      setShowOrderImport(false);
      onBillsUpdated?.();
    } catch (err) {
      toast(err?.message || 'Failed to convert B2B order token', 'error');
    }
  };

  // Show compact radar only when there are actionable alerts OR products exist to share storefront
  if ((!msmeReport || msmeReport.criticalCount === 0) && lowMarginItems.length === 0 && !businessProfile?.businessName) {
    return null;
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        color: '#f8fafc',
        borderRadius: 14,
        padding: '1.1rem 1.25rem',
        marginBottom: '1.25rem',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
      }}
    >
      {/* Header + Serverless B2B Catalog Quick Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', borderBottom: '1px solid rgba(148, 163, 184, 0.18)', paddingBottom: '0.75rem', marginBottom: '0.9rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ padding: '0.15rem 0.48rem', fontSize: '0.66rem', fontWeight: 800, textTransform: 'uppercase', background: '#f59e0b', color: '#0f172a', borderRadius: 4 }}>
              v5.0 Autonomous Munim
            </span>
            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#ffffff' }}>
              Proactive Sec 43B(h) Tax Shield &amp; Margin Radar
            </h3>
          </div>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.76rem', color: '#cbd5e1' }}>
            Real-time MSME 45-day tax disallowance protection, margin arbitrage &amp; zero-server WhatsApp B2B storefront.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleCopyB2BCatalog}
            style={{ padding: '0.45rem 0.85rem', background: '#10b981', color: '#022c22', border: 'none', borderRadius: 8, fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer' }}
          >
            {catalogCopied ? '✓ Storefront Link Copied!' : '📲 Copy B2B Storefront Link'}
          </button>
          <button
            type="button"
            onClick={() => setShowOrderImport((v) => !v)}
            style={{ padding: '0.45rem 0.8rem', background: 'rgba(255,255,255,0.1)', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}
          >
            📥 Auto-Bill WhatsApp Order
          </button>
        </div>
      </div>

      {showOrderImport && (
        <div style={{ marginBottom: '0.9rem', padding: '0.75rem', borderRadius: 10, background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(16, 185, 129, 0.35)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Paste retailer's WhatsApp order message containing BGST-ORD:... here"
            value={orderText}
            onChange={(e) => setOrderText(e.target.value)}
            style={{ flex: 1, minWidth: 220, padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #334155', background: '#0f172a', color: '#fff', fontSize: '0.8rem' }}
          />
          <button
            type="button"
            onClick={handleConvertWhatsappToken}
            style={{ padding: '0.45rem 0.9rem', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
          >
            1-Click Convert to Sales Order
          </button>
        </div>
      )}

      {/* Grid: Sec 43B(h) Shield | Margin Arbitrage */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
        <div style={{ background: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: 10, padding: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#fb7185', textTransform: 'uppercase' }}>
              Sec 43B(h) MSME 45-Day Shield
            </span>
            <span style={{ fontSize: '0.7rem', background: 'rgba(244, 63, 94, 0.2)', color: '#fda4af', padding: '0.1rem 0.45rem', borderRadius: 4, fontWeight: 700 }}>
              {msmeReport?.criticalCount || 0} Alerts
            </span>
          </div>

          {!msmeReport || msmeReport.criticalCount === 0 ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#6ee7b7' }}>
              ✓ Zero supplier bills pending 30+ days. Zero Sec 43B(h) tax disallowance risk!
            </p>
          ) : (
            <div>
              <div style={{ fontSize: '0.77rem', color: '#cbd5e1', marginBottom: '0.45rem' }}>
                At-Risk: <strong>₹{msmeReport.totalAtRiskAmount.toLocaleString('en-IN')}</strong> · Est. Tax Hit:{' '}
                <span style={{ color: '#fb7185', fontWeight: 800 }}>₹{msmeReport.estimatedTaxImpact30Pct.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ maxHeight: 112, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {msmeReport.bills.map((b, i) => (
                  <div
                    key={i}
                    className="msme-alert-row"
                    style={{
                      fontSize: '0.75rem',
                      background: 'rgba(15, 23, 42, 0.85)',
                      padding: '0.42rem 0.65rem',
                      borderRadius: 6,
                      border: '1px solid rgba(244, 63, 94, 0.3)',
                    }}
                  >
                    <span className="msme-alert-party" title={`${b.supplierName} (#${b.billNumber})`}>
                      <strong>{b.supplierName}</strong> (#{b.billNumber})
                    </span>
                    <span className="msme-overdue-tag">
                      {b.daysRemaining < 0 ? `${Math.abs(b.daysRemaining)}d Overdue` : `${b.daysRemaining}d Left`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.85)', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: 10, padding: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
            <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase' }}>
              Margin Erosion Radar (&lt;10%)
            </span>
            <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.2)', color: '#fcd34d', padding: '0.1rem 0.45rem', borderRadius: 4, fontWeight: 700 }}>
              {lowMarginItems.length} Items
            </span>
          </div>

          {lowMarginItems.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#6ee7b7' }}>
              ✓ All priced items maintain a healthy 10%+ net profit margin.
            </p>
          ) : (
            <div style={{ maxHeight: 115, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {lowMarginItems.map((it) => (
                <div key={it.id} style={{ fontSize: '0.75rem', background: 'rgba(15, 23, 42, 0.85)', padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', minWidth: 0 }}>
                  <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                    <div style={{ fontWeight: 700, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.name}>{it.name}</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      Cost: ₹{it.cost} | Sale: ₹{it.sell} ({it.marginPct}%)
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAutoReprice(it)}
                    style={{ padding: '0.28rem 0.55rem', background: '#f59e0b', color: '#0f172a', border: 'none', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    Set ₹{it.suggestedRate}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
