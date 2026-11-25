import { IndianRupee, Receipt, Wallet, AlertCircle, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '../utils';

/**
 * Dynamic Executive Dashboard KPI Cards (v5.4.0 Commercial SaaS Design).
 * Replaces plain flat boxes with 4 high-impact KPI cards featuring top accent bars,
 * multi-currency support, hover elevation, and 1-click drill-down actions.
 */
export default function ExecutiveKpiGrid({
  byCurrency = {},
  outstandingByCurrency = {},
  baseCurrency = 'INR',
  inBaseTotal = 0,
  noRateCount = 0,
  openingOwed = 0,
  invoiceCount = 0,
  lowStockCount = 0,
  onOpenGstReturns,
  onOpenReceivables,
  onOpenLowStock,
}) {
  const curEntries = Object.entries(byCurrency);
  const outEntries = Object.entries(outstandingByCurrency);

  const primarySalesText =
    curEntries.length === 0
      ? formatCurrency(0, baseCurrency)
      : curEntries.map(([cur, v]) => formatCurrency(v.total || 0, cur)).join(' · ');

  const primaryTaxText =
    curEntries.length === 0
      ? formatCurrency(0, baseCurrency)
      : curEntries.map(([cur, v]) => formatCurrency(v.tax || 0, cur)).join(' · ');

  const primaryReceivableText =
    outEntries.length === 0
      ? formatCurrency(0, baseCurrency)
      : outEntries.map(([cur, unpaid]) => formatCurrency(unpaid || 0, cur)).join(' · ');

  const cards = [
    {
      id: 'sales',
      title: 'Total Invoiced Sales',
      value: primarySalesText,
      sub:
        curEntries.length > 1
          ? `≈ ${formatCurrency(inBaseTotal, baseCurrency)} total (${invoiceCount} invoices${noRateCount ? `, ${noRateCount} unrated` : ''})`
          : `${invoiceCount} tax invoice${invoiceCount === 1 ? '' : 's'} generated`,
      accent: '#2563eb',
      Icon: IndianRupee,
      onClick: null,
    },
    {
      id: 'gst',
      title: 'GST Output Liability',
      value: primaryTaxText,
      sub: 'CGST + SGST + IGST (GSTR-1 / 3B ready)',
      accent: '#7c3aed',
      Icon: Receipt,
      onClick: onOpenGstReturns || null,
    },
    {
      id: 'receivables',
      title: 'Market Udhaari (Receivable)',
      value: primaryReceivableText,
      sub:
        openingOwed > 0
          ? `Includes ${formatCurrency(openingOwed, baseCurrency)} opening due · Click to filter`
          : 'Click to filter unpaid & send WhatsApp + UPI',
      accent: '#d97706',
      Icon: Wallet,
      onClick: onOpenReceivables || null,
    },
    {
      id: 'lowstock',
      title: 'Low Stock Alerts',
      value: `${lowStockCount} Item${lowStockCount === 1 ? '' : 's'}`,
      sub:
        lowStockCount > 0
          ? 'Reorder needed soon · Click to view stock'
          : 'All tracked inventory levels healthy',
      accent: lowStockCount > 0 ? '#dc2626' : '#10b981',
      Icon: AlertCircle,
      onClick: onOpenLowStock || null,
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(235px, 1fr))',
        gap: '16px',
        marginBottom: '18px',
      }}
    >
      {cards.map((c) => {
        const Icon = c.Icon;
        return (
          <div
            key={c.id}
            role={c.onClick ? 'button' : undefined}
            tabIndex={c.onClick ? 0 : undefined}
            onClick={c.onClick || undefined}
            onKeyDown={
              c.onClick
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      c.onClick();
                    }
                  }
                : undefined
            }
            className="pro-card"
            style={{
              padding: '18px',
              cursor: c.onClick ? 'pointer' : 'default',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Top 3px Accent Line */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: c.accent,
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
                gap: '8px',
              }}
            >
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                }}
              >
                {c.title}
              </span>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: `${c.accent}18`,
                  color: c.accent,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={17} />
              </div>
            </div>

            <div
              style={{
                fontSize: primarySalesText.length > 18 && c.id !== 'lowstock' ? '1.18rem' : '1.42rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                marginBottom: '6px',
                wordBreak: 'break-word',
              }}
            >
              {c.value}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}
            >
              <span>{c.sub}</span>
              {c.onClick && <ArrowUpRight size={14} color={c.accent} style={{ flexShrink: 0 }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
