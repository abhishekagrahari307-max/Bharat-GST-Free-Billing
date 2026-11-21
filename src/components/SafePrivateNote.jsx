// v1.10.83 - "Is this open-source app safe?" answered where people first ask
// it: the welcome screen and Support & About. Every line here must stay true;
// the full, checked answer is the docs page docs-site/pages/security.mjs.
import { ShieldCheck, HardDrive, UserX, WifiOff, EyeOff, Network, Code, Download, Archive, KeyRound, Bug, RefreshCw, ListChecks } from 'lucide-react';
import { docsLink } from '../utils';

const POINTS = [
  'Your business data stays on this device',
  'No account, no login, no ads',
  'Works 100% without internet',
  'AES-256-GCM encrypted vault & daily backups',
];

export default function SafePrivateNote({ style }) {
  return (
    <div role="note" aria-label="Safe and private"
      style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start', padding: '0.75rem 0.9rem', borderRadius: 10,
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'left', ...style }}>
      <ShieldCheck size={22} style={{ color: 'var(--success, #16a34a)', flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Safe and private</div>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {POINTS.map((p) => <li key={p}>{p}</li>)}
        </ul>
        <a href={docsLink('security')} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: '0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>
          How we keep it safe →
        </a>
      </div>
    </div>
  );
}

// v1.10.83 - the full list, as its own section on Support & About ("make
// this safe and private a different section and bigger, with every point").
// Each line is a summary of a section of docs-site/pages/security.mjs.
const SAFETY = [
  { icon: HardDrive, title: 'Your data stays on this computer', text: 'Invoices, clients and settings are files in the app folder. We run no cloud server that holds your books. Google Drive is used only if you connect your own.', doc: 'security#your-data-stays' },
  { icon: UserX, title: 'No account, no login', text: 'The app never asks for an email address or a password to use it.', doc: 'security#your-data-stays' },
  { icon: WifiOff, title: 'Works without internet', text: 'Invoices, PDFs, reports and GST returns all work offline. Turn on Offline mode (Settings → Privacy & Security → Privacy & internet) and the app never goes online by itself.', doc: 'security#offline-mode' },
  { icon: EyeOff, title: 'No tracking, no ads', text: 'Zero analytics, zero ad scripts, and nothing sent anywhere. Nobody ever sees your invoices, amounts, GSTIN or bank details.', doc: 'security#why-free' },
  { icon: Network, title: 'Other computers cannot open it', text: 'The app answers only this device, not external websites. Phones you pair yourself can use it on your own Wi-Fi only if you turn that on.', doc: 'security#network' },
  { icon: Code, title: 'Transparent & auditable', text: 'Pure standard web & cryptographic formats (JSON, CSV, GST Portal JSON, AES-256-GCM .fgsb) with zero vendor lock-in.', doc: 'security#open-source' },
  { icon: Download, title: 'Safe offline install', text: 'Installs directly as an offline PWA or local desktop app without administrator rights or system modifications.', doc: 'security#install-safety' },
  { icon: Archive, title: 'Daily backups', text: 'Automatic daily snapshots plus encrypted .fgsb and JSON exports you can save to USB or your own Google Drive.', doc: 'security#backups-and-lock' },
  { icon: KeyRound, title: 'AES-256-GCM Vault & PIN lock', text: 'Protect sensitive records on shared devices with PBKDF2-SHA256 (310k iterations) + AES-256-GCM encryption and staff roles.', doc: 'security#backups-and-lock' },
  { icon: Bug, title: 'Local problem log (PII scrubbed)', text: 'Errors are logged strictly on this device with GSTIN, PAN, phone, email, UPI ID and bank numbers redacted automatically.', doc: 'security#problem-reports' },
  { icon: RefreshCw, title: 'Safe idle updates & self-heal', text: 'Updates apply only when idle — never while typing an invoice — with 9-point startup health diagnostics.', doc: 'security#updates-and-security-fixes' },
  { icon: ListChecks, title: 'Check it yourself', text: 'Switch your internet off and use the app: everything works. Keep a periodic backup on another drive for complete peace of mind.', doc: 'security#check-yourself' },
];

export function SafePrivateSection({ style }) {
  return (
    <section className="glass-panel" aria-labelledby="safe-private-title" style={{ padding: '1.5rem', ...style }}>
      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', marginBottom: '1.1rem' }}>
        <ShieldCheck size={34} style={{ color: 'var(--success, #16a34a)', flexShrink: 0 }} aria-hidden="true" />
        <div>
          <h2 id="safe-private-title" style={{ margin: 0, fontSize: '1.3rem' }}>Safe and private</h2>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            What happens to your business data, and what the app does and does not do.{' '}
            <a href={docsLink('security')} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: 'var(--primary)' }}>The full answer →</a>
          </p>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem 1.5rem' }}>
        {SAFETY.map((p) => (
          <div key={p.title} style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
            <p.icon size={20} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <div style={{ minWidth: 0 }}>
              <a href={docsLink(p.doc)} target="_blank" rel="noopener noreferrer"
                style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)', textDecoration: 'none' }}>{p.title}</a>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{p.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
