// Bharat AI Voice Billing™ Modal — Speak or type naturally in Hinglish,
// Hindi (हिंदी), or Indian English to populate Client + Line Items in 1 click.
import { useState, useEffect, useRef, useMemo } from 'react';
import { Mic, MicOff, Sparkles, PlusCircle, X, CheckCircle2, Volume2 } from 'lucide-react';
import { parseVoiceTranscript } from '../utils/voiceBilling';
import { formatCurrency } from '../utils';

const EXAMPLE_COMMANDS = [
  '2 Basmati Rice 5kg rate 450 gst 5%, 4 Mustard Oil 1 ltr rate 165 gst 5%',
  'Client Sharma Medical, 10 Dolo 650 strip rate 32 gst 12%',
  'Website Development 12 hours at 1500 gst 18%',
  'paanch Cement bag 380 rupaye gst 28%',
];

export default function VoiceBillingModal({
  open,
  onClose,
  products = [],
  clients = [],
  defaultGst = 18,
  currency = 'INR',
  onApply,
}) {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState('en-IN');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const recRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      setSpeechSupported(Boolean(SR));
    }
  }, []);

  useEffect(() => {
    if (!open && recRef.current) {
      try { recRef.current.stop(); } catch { /* ignore */ }
      setListening(false);
    }
  }, [open]);

  const parsed = useMemo(
    () => parseVoiceTranscript(transcript, { products, clients, defaultGst }),
    [transcript, products, clients, defaultGst]
  );

  if (!open) return null;

  const toggleMic = () => {
    setErrorMsg('');
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) {
      setErrorMsg('Voice microphone requires Chrome or Edge. You can still type or paste fast commands below!');
      return;
    }
    if (listening && recRef.current) {
      try { recRef.current.stop(); } catch { /* ignore */ }
      setListening(false);
      return;
    }
    try {
      const rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = false;
      rec.onstart = () => setListening(true);
      rec.onend = () => setListening(false);
      rec.onerror = (ev) => {
        setListening(false);
        if (ev?.error === 'not-allowed') {
          setErrorMsg('Microphone permission was blocked. Allow microphone in browser address bar or type below.');
        } else if (ev?.error && ev.error !== 'no-speech') {
          setErrorMsg(`Voice recognition stopped (${ev.error}). You can tap Start Mic again or edit text below.`);
        }
      };
      rec.onresult = (event) => {
        let chunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            chunk += event.results[i][0].transcript + ', ';
          }
        }
        if (chunk.trim()) {
          setTranscript((prev) => (prev.trim() ? `${prev.replace(/,\s*$/, '')}, ${chunk.trim()}` : chunk.trim()));
        }
      };
      recRef.current = rec;
      rec.start();
    } catch {
      setErrorMsg('Could not start microphone. Type or paste your items below.');
    }
  };

  const handleApply = () => {
    if (!parsed.items.length && !parsed.clientName) return;
    onApply?.(parsed);
    setTranscript('');
    onClose?.();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="voice-bill-title" onClick={onClose}>
      <div
        className="modal-content glass-panel"
        style={{ maxWidth: 680, width: '95%', padding: '1.35rem 1.5rem', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <span style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Mic size={18} />
            </span>
            <div>
              <h3 id="voice-bill-title" style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                Bharat AI Voice &amp; Smart Command Billing
                <span style={{ fontSize: '0.68rem', padding: '0.12rem 0.5rem', borderRadius: 999, background: 'rgba(37,99,235,0.12)', color: 'var(--primary)', fontWeight: 700 }}>
                  100% OFFLINE · PRIVATE
                </span>
              </h3>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Speak or type in <b>Hinglish</b>, <b>हिंदी</b>, or <b>English</b> — auto-matches your saved Products, HSN &amp; Clients!
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close voice billing">
            <X size={18} />
          </button>
        </div>

        {/* Mic + Language controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem', padding: '0.7rem 0.85rem', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
          <button
            type="button"
            className={`btn ${listening ? 'btn-danger' : 'btn-primary'}`}
            onClick={toggleMic}
            style={{
              background: listening ? '#dc2626' : undefined,
              borderColor: listening ? '#dc2626' : undefined,
              color: '#fff',
              boxShadow: listening ? '0 0 0 4px rgba(220,38,38,0.22)' : undefined,
            }}
          >
            {listening ? <><MicOff size={16} /> Stop Listening…</> : <><Mic size={16} /> {speechSupported ? 'Start Voice Mic' : 'Mic Unavailable (Type Below)'}</>}
          </button>

          <select
            aria-label="Voice recognition language"
            className="form-input"
            style={{ width: 'auto', minWidth: 185, height: 36, padding: '0.25rem 1.8rem 0.25rem 0.65rem', fontSize: '0.82rem' }}
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            <option value="en-IN">🇮🇳 Hinglish / English (India)</option>
            <option value="hi-IN">🇮🇳 हिंदी (Hindi Voice)</option>
          </select>

          {listening && (
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Volume2 size={15} /> Listening… speak items clearly
            </span>
          )}
        </div>

        {errorMsg && (
          <div className="notice notice-warn" style={{ marginBottom: '0.75rem', fontSize: '0.8rem' }}>
            {errorMsg}
          </div>
        )}

        <label className="form-label" htmlFor="voice-command-input">
          Spoken or Typed Fast-Bill Command (separate multiple items with comma or &ldquo;aur&rdquo;)
        </label>
        <textarea
          id="voice-command-input"
          className="form-input"
          rows={3}
          placeholder="Example: Client Rahul Traders, 2 Basmati Rice 5kg rate 450 gst 5%, 3 Mustard Oil 1 ltr rate 165 gst 5%"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          style={{ width: '100%', fontFamily: 'inherit', fontSize: '0.88rem', marginBottom: '0.55rem' }}
        />

        {/* 1-click sample chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.9rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Try example:</span>
          {EXAMPLE_COMMANDS.map((ex, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setTranscript(ex)}
              style={{
                fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: 999,
                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <Sparkles size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
              {ex.length > 42 ? `${ex.slice(0, 42)}…` : ex}
            </button>
          ))}
        </div>

        {/* Live Parsed Preview */}
        {(parsed.clientName || parsed.items.length > 0) && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.75rem 0.9rem', marginBottom: '1rem', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CheckCircle2 size={15} /> Live Parsed Bill Preview ({parsed.items.length} item{parsed.items.length === 1 ? '' : 's'})
            </div>

            {parsed.clientName && (
              <div style={{ fontSize: '0.82rem', marginBottom: '0.55rem', padding: '0.35rem 0.6rem', borderRadius: 7, background: 'rgba(37,99,235,0.08)' }}>
                <b>Client:</b> {parsed.matchedClient ? `${parsed.matchedClient.name} (✓ Matched saved client)` : parsed.clientName}
              </div>
            )}

            {parsed.items.length > 0 && (
              <div className="table-container" style={{ margin: 0 }}>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Rate</th>
                      <th>GST</th>
                      <th style={{ textAlign: 'right' }}>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.items.map((it, idx) => {
                      const taxable = it.quantity * it.rate * (1 - (it.discount || 0) / 100);
                      const lineTotal = taxable * (1 + (it.gstRate || 0) / 100);
                      return (
                        <tr key={idx}>
                          <td>
                            <b>{it.description}</b>
                            {it.hsn && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6 }}>HSN {it.hsn}</span>}
                            {it.matchedFromCatalog && (
                              <span style={{ fontSize: '0.66rem', marginLeft: 6, padding: '1px 5px', borderRadius: 4, background: 'rgba(22,163,74,0.14)', color: '#15803d', fontWeight: 600 }}>
                                Catalog
                              </span>
                            )}
                          </td>
                          <td>{it.quantity} {it.unit}</td>
                          <td>{formatCurrency(it.rate, currency)}</td>
                          <td>{it.gstRate}%</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(lineTotal, currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!parsed.items.length && !parsed.clientName}
            onClick={handleApply}
          >
            <PlusCircle size={16} /> Add to Invoice ({parsed.items.length} item{parsed.items.length === 1 ? '' : 's'})
          </button>
        </div>
      </div>
    </div>
  );
}
