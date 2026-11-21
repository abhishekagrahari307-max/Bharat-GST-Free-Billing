import { useState } from 'react';
import { Heart } from 'lucide-react';
import HelpButton from './HelpButton';
import { shouldShowSupportNudge, localDay, SNOOZE_DAYS } from '../utils/supporters';

const KEY = 'freegstbill_supportNudge';

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };

const LINES = [
  'Bharat GST Free Billing is 100% free — no ads, no subscriptions, and no locked features.',
  'Share Bharat GST Free Billing with fellow shopkeepers, traders, and CAs to help more businesses save!',
  'Remember to export a periodic backup from Settings → Data & Backups to keep an extra copy of your books.',
];

export default function SupportNudge({ invoiceCount, onOpen }) {
  const [state, setState] = useState(read);
  const visible = shouldShowSupportNudge(invoiceCount, state);
  if (!visible) return null;
  const save = (v) => { write(v); setState(v); };
  const hideToday = () => save({ ...state, hiddenOn: localDay() });
  const now = new Date();
  const line = LINES[Math.floor(now.getTime() / 86400000) % LINES.length];
  return (
    <div className="glass-panel" role="note" aria-label="Bharat GST Free Billing milestone"
      style={{ padding: '0.9rem 1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.9rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <Heart size={22} style={{ color: '#e11d48', flexShrink: 0 }} />
      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{invoiceCount} invoices made with Bharat GST Free Billing <HelpButton title="Milestone" doc="dashboard#support-card" size={16} /></div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{line}</div>
      </div>
      <button type="button" className="btn btn-primary" onClick={() => { hideToday(); onOpen(); }}
        style={{ fontSize: '0.82rem' }}>About &amp; Share</button>
      <button type="button" className="btn btn-secondary" onClick={hideToday}
        style={{ fontSize: '0.82rem' }}>Dismiss</button>
      <button type="button" onClick={() => save({ ...state, snoozedUntil: now.getTime() + SNOOZE_DAYS * 86400000 })}
        style={{ background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', padding: '0.25rem', fontSize: '0.78rem', textDecoration: 'underline' }}>
        Hide for 7 days
      </button>
    </div>
  );
}
