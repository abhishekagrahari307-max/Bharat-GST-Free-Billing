import { useState } from 'react';
import { Heart, Share2, BookOpen, ShieldCheck, FileText, Calculator, Printer, Package, Globe, Mic, RefreshCw, Stethoscope, MessageSquarePlus, Volume2, VolumeX } from 'lucide-react';
import {
  isWelcomeSoundEnabled,
  setWelcomeSoundEnabled,
  getWelcomeVoiceStyle,
  setWelcomeVoiceStyle,
  playWelcomeVoice,
} from '../utils/welcomeSound';
import WhatsNew from './WhatsNew';
import ProblemLog from './ProblemLog';
import HelpButton from './HelpButton';
import PageHeader from './PageHeader';
import { SafePrivateSection } from './SafePrivateNote';
import { docsLink } from '../utils';
import { APP_VERSION } from '../utils/problemLog';

const HIGHLIGHTS = [
  { icon: Mic, title: 'Bharat AI Voice Billing™', text: 'Speak or type naturally in Hinglish, Hindi (हिंदी) or English to auto-fill Clients, Products, HSN, Rates & GST 100% offline.' },
  { icon: FileText, title: 'All 10 GST Document Types', text: 'Tax Invoice, Proforma, Quotation, Credit Note, Debit Note, Bill of Supply, Composition, Sales Order, PO & Delivery Challan.' },
  { icon: Stethoscope, title: 'CA Pre-Filing GST Auditor', text: '0–100% GSTR-1 Portal Readiness Score checking GSTIN Mod-36 checksums, HSN/SAC rules, POS match & Rule 46 numbering.' },
  { icon: Calculator, title: 'GSTR-1/3B/2B, e-Invoice & Tax', text: 'Portal JSON/CSV exports, GSTR-2B reconciliation, e-Invoice IRP JSON, e-Way Bill, TDS/TCS (26Q/27EQ) & Income Tax (Old vs New).' },
  { icon: Printer, title: '5 Layouts, 5 Languages & POS', text: '58mm/80mm thermal receipts, A4/A5 templates, 8 colour designs, English/Hindi/Tamil/Marathi/Bengali bills & UPI QR.' },
  { icon: Package, title: 'Stock, Barcodes, OCR & Tally Import', text: 'Multi-unit stock (Box=12 Pcs), IMEI/Batch, Manufacturing BOM, offline Bill OCR, Cash Book, Bank Matching & Vyapar/Tally import.' },
  { icon: Globe, title: '9 Industry Presets & 22 Currencies', text: 'Pharmacy, Mobile/IMEI, Jewellery, Kirana, Transport, Textiles, Hardware & Export LUT/SEZ billing across 23 countries.' },
  { icon: ShieldCheck, title: 'AES-256-GCM Vault & Staff Roles', text: 'WebCrypto AES-256-GCM + PBKDF2 (310,000 rounds), Fingerprint Passkey, Multi-Staff PINs, Edit History, Trash & Google Drive sync.' },
  { icon: RefreshCw, title: 'Daily Continuous Auto-Updates', text: `Live background sync (v${APP_VERSION}) delivers daily GST rule updates & improvements safely when idle — zero data loss.` },
];

export default function SupportView() {
  const [soundOn, setSoundOn] = useState(() => isWelcomeSoundEnabled());
  const [voiceStyle, setVoiceStyleState] = useState(() => getWelcomeVoiceStyle());
  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/';
  const shareText = `I make my GST invoices with Bharat GST Free Billing (Created by Abhishek Agrahari) — 100% free GST invoicing, GSTR-1/3B/2B, UPI QR & inventory${appUrl ? `: ${appUrl}` : ''}`;
  const hinglishShareText = `🇮🇳 *Vyapari Bhaiyon & CAs ke liye 100% FREE GST Billing & Stock App!* \n\nAb bina kisi yearly charge ke mobile ya PC par GST Bill, UPI QR, Thermal Print, GSTR-1/3B JSON, Stock aur Tally/Vyapar Import chalayein — data 100% aapke device par safe rehta hai:\n👉 ${appUrl}`;
  const feedbackUrl = `https://github.com/abhishekagrahari307-max/Bharat-GST-Free-Billing/issues/new?title=${encodeURIComponent(`[Feedback v${APP_VERSION}] `)}&body=${encodeURIComponent('**Business Type (Kirana / Wholesale / CA / Service):** \n\n**What worked well:** \n\n**What should be improved / GST or CA suggestion:** \n')}`;
  const freeWays = [
    { icon: Share2, title: 'Share on WhatsApp (Hinglish — Vyapar Mandal & Traders)', text: 'Ready-to-forward Hinglish message for shopkeepers, wholesalers, and Vyapar Mandal groups.', href: `https://wa.me/?text=${encodeURIComponent(hinglishShareText)}` },
    { icon: Share2, title: 'Share with another business on WhatsApp (English)', text: 'Send Bharat GST Free Billing to a fellow shopkeeper, trader, or accountant.', href: `https://wa.me/?text=${encodeURIComponent(shareText)}` },
    { icon: MessageSquarePlus, title: 'Send Real-World Feedback / CA Review Note', text: 'Report a GST edge-case, CA suggestion, or feature request directly on GitHub.', href: feedbackUrl },
    { icon: BookOpen, title: 'Open Complete User Guide', text: 'Step-by-step instructions for GST invoicing, thermal printing, GSTR-1/3B, and encrypted backups.', href: docsLink('index') },
    { icon: ShieldCheck, title: 'Read Privacy & Data Protection Notice', text: 'Learn how your books stay 100% private on your own device with zero trackers.', href: './privacy.html' },
  ];

  const card = { padding: '1.25rem 1.5rem' };
  const linkRow = { display: 'flex', gap: '0.85rem', alignItems: 'flex-start', padding: '0.75rem 0', borderTop: '1px solid var(--border-color)', color: 'inherit', textDecoration: 'none' };

  return (
    <div className="dashboard-container">
      <PageHeader
        title="About Bharat GST Free Billing"
        help={{ title: 'About', doc: 'support' }}
        subtitle="Built for Bharat, created by Abhishek Agrahari · India's 100% Free, Offline-First ERP & GST Compliance OS"
      />

      <div className="glass-panel" style={{ ...card, marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div>
          <h3 style={{ margin: '0 0 0.25rem', fontSize: '0.98rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            {soundOn ? <Volume2 size={18} style={{ color: 'var(--primary)' }} /> : <VolumeX size={18} />} Welcome Voice Greeting
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Choose English or Hinglish spoken greeting (<code>en-IN</code>) when launching Bharat GST Free Billing.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn ${voiceStyle === 'en' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setVoiceStyleState('en'); setWelcomeVoiceStyle('en'); playWelcomeVoice('', { force: true, style: 'en' }); }}
          >
            🔊 Preview English
          </button>
          <button
            type="button"
            className={`btn ${voiceStyle === 'hinglish' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setVoiceStyleState('hinglish'); setWelcomeVoiceStyle('hinglish'); playWelcomeVoice('', { force: true, style: 'hinglish' }); }}
          >
            🇮🇳 Preview Hinglish
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => { const next = !soundOn; setSoundOn(next); setWelcomeSoundEnabled(next); }}
          >
            {soundOn ? 'Startup Greeting: ON' : 'Startup Greeting: Muted'}
          </button>
        </div>
      </div>

      <div className="glass-panel" style={{ ...card, marginBottom: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <Heart size={28} style={{ color: '#e11d48', flexShrink: 0, marginTop: 2 }} />
        <div>
          <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>Free Forever for Every Business in Bharat <HelpButton title="Free, and it stays free" doc="support#about" size={16} /></h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '72ch' }}>
            <b>Bharat GST Free Billing</b> (Created by <b>Abhishek Agrahari</b>) is an offline-first, AES-256-GCM encrypted GST billing and business management platform built for Indian retailers, wholesalers, freelancers, service providers, manufacturers, and CAs. Zero subscription fees, zero ads, and zero locked features.
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
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>Resources &amp; Sharing <HelpButton title="Resources" doc="support#free-ways" size={16} /></h3>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Share Bharat GST Free Billing or browse the Complete User Guide.</p>
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
