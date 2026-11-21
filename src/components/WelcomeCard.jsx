// v1.10.81 - a welcome for new users at the top of the Dashboard (asked for by
// the maintainer): thanks them, and whoever told them about the app, says it
// is free for good, and that support of any amount is welcome but never
// needed. On the page, not a popup; shown until closed and only while the
// business has fewer than 10 invoices (from 10 the daily support card takes
// over, so the two never show together).
import { useState } from 'react';
import { Heart, Share2, X } from 'lucide-react';
import { SUPPORT_NUDGE_MIN_INVOICES } from '../utils/supporters';
import HelpButton from './HelpButton';

const KEY = 'freegstbill_welcomeCard';

const isClosed = () => { try { return localStorage.getItem(KEY) === 'closed'; } catch { return false; } };

export default function WelcomeCard({ invoiceCount, onOpenSupport }) {
  const [closed, setClosed] = useState(isClosed);
  if (closed || invoiceCount >= SUPPORT_NUDGE_MIN_INVOICES) return null;
  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const shareText = `I use Bharat GST Free Billing (Created by Abhishek Agrahari) for my GST invoices — 100% free, offline-ready, CGST/SGST/IGST, GSTR-1/3B/2B & UPI QR${appUrl ? `: ${appUrl}` : ''}`;
  const close = () => {
    try { localStorage.setItem(KEY, 'closed'); } catch { /* private mode */ }
    setClosed(true);
  };
  return (
    <section className="welcome-card" aria-labelledby="welcome-card-title">
      <button type="button" className="welcome-card-close" onClick={close} aria-label="Close the welcome note">
        <X size={18} />
      </button>
      <h2 id="welcome-card-title">Welcome to Bharat GST Free Billing <HelpButton title="The welcome note" doc="dashboard#welcome-card" size={16} /></h2>
      <p className="welcome-card-lead">
        Built for Indian shop owners, traders, freelancers, manufacturers, and CAs — fast GST invoicing without subscriptions or hidden fees.
      </p>
      <ul className="welcome-card-points">
        <li><strong>100% Free Forever.</strong> No subscription, no ads, no locked features.</li>
        <li><strong>Complete GST Suite.</strong> Tax Invoice, Proforma, Credit Note, e-Way Bill, GSTR-1 / GSTR-3B JSON &amp; GSTR-2B matching.</li>
        <li><strong>UPI QR, Thermal &amp; A4/A5 Print.</strong> Instant UPI payment QR codes, stock tracking, and multi-currency billing.</li>
        <li><strong>Safe &amp; Private.</strong> Automatic backups, PIN lock, and multi-business GSTIN profiles.</li>
      </ul>
      <div className="welcome-card-actions">
        <button type="button" className="welcome-card-btn welcome-card-btn-primary" onClick={close}>
          Start Billing Now
        </button>
        <a className="welcome-card-btn" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer">
          <Share2 size={16} /> Share on WhatsApp
        </a>
        <button type="button" className="welcome-card-btn welcome-card-btn-quiet" onClick={onOpenSupport}>
          <Heart size={16} /> About Bharat GST
        </button>
      </div>
    </section>
  );
}
