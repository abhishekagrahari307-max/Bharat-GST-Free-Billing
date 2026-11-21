import { useEffect, useState } from 'react';
import { CalendarClock, Sparkles, Play } from 'lucide-react';
import { parseChangelog, releaseTitles } from '../utils/changelog';
import HelpButton from './HelpButton';
import WhatsNewSlides from './WhatsNewSlides';
import { APP_VERSION } from '../utils/problemLog';

const card = { padding: '1.25rem 1.5rem' };

function Release({ entry }) {
  return (
    <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
      {releaseTitles(entry).map((s) => (
        <div key={s.title} style={{ marginTop: '0.45rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{s.title}</div>
          <ul style={{ margin: '0.15rem 0 0', paddingLeft: '1.1rem' }}>
            {s.items.map((t, i) => <li key={i}>{t}</li>)}
            {s.more > 0 && <li style={{ listStyle: 'none', marginLeft: '-1.1rem', color: 'var(--text-muted)' }}>and {s.more} more</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}

const longDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

export default function WhatsNew() {
  const [entries, setEntries] = useState(null);
  const [slides, setSlides] = useState(null);
  useEffect(() => {
    let live = true;
    fetch('/api/changelog')
      .then((r) => (r.ok ? r.json() : { text: '' }))
      .then(({ text }) => { if (live) setEntries(parseChangelog(text, 6)); })
      .catch(() => { if (live) setEntries([]); });
    return () => { live = false; };
  }, []);

  return (
    <>
      <div className="glass-panel" style={{ ...card, marginBottom: '1.25rem' }} aria-labelledby="weekly-title">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <CalendarClock size={26} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <h3 id="weekly-title" style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>Safe Background Updates &amp; Auto-Repair <HelpButton title="Updates" doc="support#weekly" size={16} /></h3>
            <p style={{ margin: '0 0 0.7rem', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '72ch' }}>
              Bharat GST Free Billing checks for updates safely in the background and never reloads while you are creating or editing an invoice. Your invoices, clients, inventory, and print settings always stay intact on your device.
            </p>
            {entries && entries.length > 0 && (
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => document.getElementById('whats-new')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <Sparkles size={16} /> What&apos;s new
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {entries && entries.length > 0 && (
        <div id="whats-new" className="glass-panel" style={{ ...card, marginBottom: '1.25rem', scrollMarginTop: '1rem' }} aria-labelledby="whats-new-title">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            <h3 id="whats-new-title" style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={18} style={{ color: 'var(--primary)' }} /> What&apos;s new <HelpButton title="What's new" doc="support#whats-new" size={16} />
            </h3>
            <button type="button" className="btn btn-secondary" onClick={() => setSlides(entries.find((e) => e.version === APP_VERSION) || entries[0])}>
              <Play size={15} /> See what&apos;s new
            </button>
          </div>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Recent improvements and fixes included in your installed build.
          </p>
          {entries.map((e, i) => (
            <details key={e.version} open={i === 0} style={{ borderTop: '1px solid var(--border-color)', padding: '0.65rem 0' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
                v{e.version} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>· {longDate(e.date)}</span>
              </summary>
              <Release entry={e} />
            </details>
          ))}
        </div>
      )}
      {slides && <WhatsNewSlides entry={slides} onClose={() => setSlides(null)} />}
    </>
  );
}
