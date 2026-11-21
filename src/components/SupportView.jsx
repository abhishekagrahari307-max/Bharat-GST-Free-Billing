import { Heart, Star, Share2, Bug, ShieldCheck, FileText, Calculator, Printer, Package, Globe } from 'lucide-react';
import WhatsNew from './WhatsNew';
import ProblemLog from './ProblemLog';
import HelpButton from './HelpButton';
import PageHeader from './PageHeader';
import { SafePrivateSection } from './SafePrivateNote';

const REPO = 'https://github.com/abhishekagrahari307-max/Bharat-ai-Voice';

const HIGHLIGHTS = [
  { icon: FileText, title: 'Complete GST Invoicing', text: 'Tax Invoice, Proforma, Quotation, Credit Note, Bill of Supply, Composition Bill & Delivery Challan.' },
  { icon: Calculator, title: 'GSTR-1, GSTR-3B & GSTR-2B', text: 'Portal-ready JSON exports, GSTR-2B ITC reconciliation, HSN summary, e-Way Bill JSON & TDS/TCS (26Q/27EQ).' },
  { icon: Printer, title: 'A4, A5 & Thermal Printing', text: '58mm / 80mm POS thermal receipts, A4/A5 PDF templates, UPI payment QR codes & WhatsApp sharing.' },
  { icon: Package, title: 'Inventory, Purchases & Cash Book', text: 'Stock tracking, barcodes, purchase bills with OCR, debit notes, expense tracker & P&L reports.' },
  { icon: Globe, title: 'Multi-Currency & Multi-GSTIN', text: 'Invoice in 22 currencies (INR, USD, EUR, GBP, AED, SGD…) and switch between multiple businesses.' },
  { icon: ShieldCheck, title: '100% Free & Private', text: 'No subscription, no ads, no locked features. Automatic daily backups and optional PIN lock.' },
];

export default function SupportView() {
  const shareText = `I make my GST invoices with Bharat GST Free Billing — 100% free GST invoicing, GSTR-1/3B/2B, UPI QR & inventory: ${REPO}`;
  const freeWays = [
    { icon: Star, title: 'Star Bharat GST Free Billing on GitHub', text: 'Helps other Indian shopkeepers, traders, and CAs discover it.', href: REPO },
    { icon: Share2, title: 'Share with another business on WhatsApp', text: 'Send Bharat GST Free Billing to a business owner or accountant.', href: `https://wa.me/?text=${encodeURIComponent(shareText)}` },
    { icon: Bug, title: 'Report a bug or request a feature', text: 'Open an issue on GitHub to help improve the platform.', href: `${REPO}/issues` },
  ];

  const card = { padding: '1.25rem 1.5rem' };
  const linkRow = { display: 'flex', gap: '0.85rem', alignItems: 'flex-start', padding: '0.75rem 0', borderTop: '1px solid var(--border-color)', color: 'inherit', textDecoration: 'none' };

  return (
    <div className="dashboard-container">
      <PageHeader
        title="About Bharat GST Free Billing"
        help={{ title: 'About & Support', doc: 'support' }}
        subtitle="100% Free GST Billing, Invoicing, Inventory & Tax Filing Suite for Bharat"
      />

      <div className="glass-panel" style={{ ...card, marginBottom: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <Heart size={28} style={{ color: '#e11d48', flexShrink: 0, marginTop: 2 }} />
        <div>
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>Free Forever for Every Business in Bharat <HelpButton title="Free, and it stays free" doc="support#about" size={16} /></h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '72ch' }}>
            <b>Bharat GST Free Billing</b> is a complete, open-source GST billing and business management web application built for Indian retailers, wholesalers, freelancers, service providers, manufacturers, and CAs. Zero subscription fees, zero ads, and zero locked features.
          </p>
        </div>
      </div>

      <div className="glass-panel" style={{ ...card, marginBottom: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Everything Included Out of the Box</h3>
        <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Every module is unlocked and free forever.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          {HIGHLIGHTS.map((h) => (
            <div key={h.title} style={{ display: 'flex', gap: '0.7rem', padding: '0.85rem', borderRadius: 8, background: 'var(--bg-secondary)' }}>
              <h.icon size={20} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{h.title}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.15rem', lineHeight: 1.45 }}>{h.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel" style={{ ...card, marginBottom: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Community &amp; Feedback <HelpButton title="Community" doc="support#free-ways" size={16} /></h3>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Help spread Bharat GST Free Billing to more businesses across India.</p>
        {freeWays.map((w) => (
          <a key={w.title} href={w.href} target="_blank" rel="noopener noreferrer" style={linkRow}>
            <w.icon size={20} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
            <span>
              <span style={{ display: 'block', fontWeight: 600 }}>{w.title}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{w.text}</span>
            </span>
          </a>
        ))}
      </div>

      <SafePrivateSection style={{ marginBottom: '1.25rem' }} />

      <WhatsNew />

      <ProblemLog />
    </div>
  );
}
