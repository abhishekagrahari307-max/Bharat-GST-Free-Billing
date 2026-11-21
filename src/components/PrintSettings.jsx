import { useState, useEffect, useRef } from 'react';
import { Printer, TestTube, RotateCcw, Info, Save as SaveIcon, Trash2, Download } from 'lucide-react';
import { toast } from './Toast';
import { confirmAction } from './ConfirmModal';
import InvoicePreview from './InvoicePreview';
import { getProfile, getInvoiceDisplayOptions, saveInvoiceDisplayOptions, getBusinessType, patchInvoiceDefaults } from '../store';
import { DEFAULT_PRINT_SETTINGS, getPrintSettings, savePrintSettings, buildSampleInvoice, BUSINESS_PRESETS, applyBusinessPreset, LABEL_PRESETS, PRINT_SETTINGS_EVENT, printSettingsToInvoiceDefaults } from '../utils/printSettings';
import HelpButton from './HelpButton';

// v1.9.9 — Visual design presets. Each is a starting point that flips
// the pdfTemplate + color palette + thermal typography + a couple of
// layout tweaks in one click. Users can still edit every individual
// setting below afterwards (the preset just seeds sensible defaults for
// the vibe they picked).
//
// v1.9.10 — presets now shape BOTH the PDF and the thermal render.
// Colors are PDF-only (thermal printers are B&W by physics), but font
// family / weight / spacing / all-caps / header alignment / content
// toggles all apply to both, so switching preset visibly changes the
// thermal preview too.
// v1.10.36 — Design presets rewrite. Reported: "current ones are not
// good at all". Prior set had 9 designs with ~3 near-duplicate pairs
// (Modern/Enterprise/IT Services all used pdfTemplate:'modern' with
// tiny palette tweaks — hard to tell apart from the swatch bar), a
// yellow-on-navy Corporate that looked dated, and no real editorial
// or brand-forward direction. Refreshed to 8 SHARPLY DIFFERENT designs
// with intentional palettes drawn from modern invoice design references
// (Stripe, Vercel, Linear, Ramp, boutique retail, editorial press).
//
// Each preset keeps the same `id` where the ID slot mapped to a
// pdfTemplate the codebase already renders — no template code changes,
// only palette + typographic pairing shifts. That way users with
// activePresetId already in localStorage continue to see something
// active, and any per-invoice pdfStyle overrides keep working.
//
// The `mockup` array on each preset drives the new mini-preview render
// (see the DESIGN_PRESETS.map(...) block below) — a proper little
// invoice thumbnail instead of the old 3-color strip.
const DESIGN_PRESETS = [
  {
    id: 'modern',
    name: 'Aurora',
    icon: '✦',
    description: 'Cool slate + electric blue. Modern SaaS invoice.',
    tag: 'Freelancers · Tech',
    settings: {
      pdfTemplate: 'modern',
      userColorsEnabled: true,
      pdfPrimaryText: '#0f172a', pdfMutedText: '#64748b',
      pdfAccent: '#2563eb', pdfAccentText: '#ffffff',
      pdfHeaderBg: '#f8fafc', pdfDividerColor: '#e2e8f0',
      fontFamily: 'sans', fontWeight: 'bold', fontSize: 'medium',
      lineSpacing: 'normal', allCaps: false,
      headerAlign: 'left', headerCaps: true, contrast: 'high',
    },
  },
  {
    id: 'classic',
    name: 'Editorial',
    icon: '❋',
    description: 'Deep charcoal on warm ivory. Newspaper-authority feel.',
    tag: 'Law · Consulting',
    settings: {
      pdfTemplate: 'classic',
      userColorsEnabled: true,
      pdfPrimaryText: '#1c1917', pdfMutedText: '#78716c',
      pdfAccent: '#1c1917', pdfAccentText: '#f5f5f4',
      pdfHeaderBg: '#f5f5f4', pdfDividerColor: '#d6d3d1',
      fontFamily: 'mono', fontWeight: 'ultra', fontSize: 'medium',
      lineSpacing: 'compact', allCaps: true,
      headerAlign: 'center', headerCaps: true, contrast: 'ultra',
    },
  },
  {
    id: 'corporate',
    name: 'Executive',
    icon: '◆',
    description: 'Deep navy + soft champagne. Boardroom serious.',
    tag: 'Enterprise · B2B',
    settings: {
      pdfTemplate: 'corporate',
      userColorsEnabled: true,
      pdfPrimaryText: '#0c1e3d', pdfMutedText: '#475569',
      pdfAccent: '#0c1e3d', pdfAccentText: '#e8dcc4',
      pdfHeaderBg: '#f4f2ed', pdfDividerColor: '#c4b896',
      fontFamily: 'sans', fontWeight: 'bold', fontSize: 'medium',
      lineSpacing: 'comfortable', allCaps: false,
      headerAlign: 'center', headerCaps: true, contrast: 'high',
    },
  },
  {
    id: 'minimalist',
    name: 'Whisper',
    icon: '○',
    description: 'Off-white, single hairline, zero clutter.',
    tag: 'Designers · Studios',
    settings: {
      pdfTemplate: 'minimalist',
      userColorsEnabled: true,
      pdfPrimaryText: '#171717', pdfMutedText: '#a3a3a3',
      pdfAccent: '#171717', pdfAccentText: '#ffffff',
      pdfHeaderBg: '#fafafa', pdfDividerColor: '#e5e5e5',
      fontFamily: 'sans', fontWeight: 'normal', fontSize: 'medium',
      lineSpacing: 'comfortable', allCaps: false,
      headerAlign: 'left', headerCaps: false, contrast: 'normal',
    },
  },
  {
    id: 'colorful',
    name: 'Sunset',
    icon: '❉',
    description: 'Warm terracotta on cream. Boutique, cafe, salon.',
    tag: 'Retail · Cafe',
    settings: {
      pdfTemplate: 'modern',
      userColorsEnabled: true,
      pdfPrimaryText: '#7c2d12', pdfMutedText: '#9a3412',
      pdfAccent: '#ea580c', pdfAccentText: '#ffffff',
      pdfHeaderBg: '#fef3ec', pdfDividerColor: '#fdba74',
      fontFamily: 'sans', fontWeight: 'bold', fontSize: 'medium',
      lineSpacing: 'normal', allCaps: false,
      headerAlign: 'center', headerCaps: true, contrast: 'high',
      showTagline: true,
    },
  },
  {
    id: 'minimal',
    name: 'Monoline',
    icon: '⌘',
    description: 'Editorial mono, dense rows, developer aesthetic.',
    tag: 'Dev · Agency',
    settings: {
      pdfTemplate: 'minimal',
      userColorsEnabled: true,
      pdfPrimaryText: '#0a0a0a', pdfMutedText: '#525252',
      pdfAccent: '#16a34a', pdfAccentText: '#ffffff',
      pdfHeaderBg: '#ffffff', pdfDividerColor: '#0a0a0a',
      pdfFontScale: 0.9,
      fontFamily: 'mono', fontWeight: 'ultra', fontSize: 'small',
      lineSpacing: 'compact', allCaps: true,
      headerAlign: 'left', headerCaps: true, contrast: 'ultra',
      showRateLine: false,
    },
  },
  {
    id: 'enterprise',
    name: 'Nordic',
    icon: '❄',
    description: 'Cool teal on frosted white. Calm, professional.',
    tag: 'SaaS · Studios',
    settings: {
      pdfTemplate: 'modern',
      userColorsEnabled: true,
      pdfPrimaryText: '#134e4a', pdfMutedText: '#0f766e',
      pdfAccent: '#0d9488', pdfAccentText: '#ffffff',
      pdfHeaderBg: '#f0fdfa', pdfDividerColor: '#99f6e4',
      pdfDarkenOnPrint: true,
      fontFamily: 'sans', fontWeight: 'bold', fontSize: 'medium',
      lineSpacing: 'normal', allCaps: false,
      headerAlign: 'left', headerCaps: true, contrast: 'high',
      showHSN: true,
    },
  },
  {
    id: 'retail',
    name: 'Bold Retail',
    icon: '▲',
    description: 'Aggressive black + red pop. Fashion, sports, street.',
    tag: 'Fashion · Sports',
    settings: {
      pdfTemplate: 'minimalist',
      userColorsEnabled: true,
      pdfPrimaryText: '#0a0a0a', pdfMutedText: '#404040',
      pdfAccent: '#dc2626', pdfAccentText: '#ffffff',
      pdfHeaderBg: '#ffffff', pdfDividerColor: '#0a0a0a',
      pdfDarkenOnPrint: true,
      fontFamily: 'sans', fontWeight: 'bold', fontSize: 'medium',
      lineSpacing: 'normal', allCaps: true,
      headerAlign: 'left', headerCaps: true, contrast: 'high',
      showHSN: true,
    },
  },
];

// ============================================================================
// Print Settings — app-wide defaults for the thermal printer render.
// Persisted to localStorage key `gst_printSettings`. InvoicePreview merges
// these with per-invoice overrides from invoiceOptions.
//
// Per user feedback (v1.8.3): existing thermal output had inconsistent
// darkness (some gray, some black), Large font size didn't scale properly,
// and users need dedicated controls to match their specific printer.
// Reference receipts from SMART BAZAAR / Reliance show the ideal style:
//   ALL CAPS · BOLD everywhere · consistent dark ink · monospace font
// ============================================================================

export default function PrintSettings() {
  const [settings, setSettings] = useState(getPrintSettings);
  const [testingPrint, setTestingPrint] = useState(false);
  const [profile, setProfile] = useState(null);
  const testPrintRef = useRef(null);
  // v1.9.8 — preview mode toggle so users see the right layout for the
  // change they're making. Sticky preview on the right stays in view as
  // they scroll settings on the left.
  const [previewMode, setPreviewMode] = useState('pdf'); // 'pdf' | 'thermal' | 'both'
  // On screens <= 1180px (laptops at 125%/150% zoom, tablets, phones), default
  // to 'stacked' (preview on top + full-width controls below, zero overlap),
  // with instant 1-click toggles for Controls-only or Full Preview.
  const [narrowPaneMode, setNarrowPaneMode] = useState('stacked'); // 'stacked' | 'controls' | 'preview'

  useEffect(() => { getProfile().then(setProfile).catch(() => {}); }, []);
  // v1.10.86 - Settings → Company → Business type sets the print style too.
  useEffect(() => {
    const reload = () => setSettings(getPrintSettings());
    window.addEventListener(PRINT_SETTINGS_EVENT, reload);
    return () => window.removeEventListener(PRINT_SETTINGS_EVENT, reload);
  }, []);

  const applyAndSync = (next, patchSource = next) => {
    setSettings(next);
    savePrintSettings(next);
    const defaultsPatch = printSettingsToInvoiceDefaults(patchSource, next);
    if (Object.keys(defaultsPatch).length > 0) {
      patchInvoiceDefaults(defaultsPatch).catch(() => {});
    }
  };

  const set = (patch) => {
    const next = { ...settings, ...patch };
    applyAndSync(next, patch);
  };

  const activeBiz = settings.activeBusinessPresetId || '';
  const isRecommendedForActive = (recommendedList) => {
    if (!activeBiz) return false;
    return recommendedList.includes(activeBiz);
  };
  const isVisibleFor = (relevantList) => {
    if (!activeBiz) return true;              // no preset → show everything
    return relevantList.includes(activeBiz);  // preset picked → only show if listed
  };
  const HIDDEN_HINT = activeBiz ? (
    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
      Some options are hidden because they don't apply to your "{BUSINESS_PRESETS[activeBiz]?.label}" print style. Click Show all options to see everything.
    </span>
  ) : null;

  const reset = () => {
    const fresh = { ...DEFAULT_PRINT_SETTINGS };
    applyAndSync(fresh, fresh);
    toast('Print settings reset to defaults', 'info');
  };

  const runTestPrint = async ({ downloadOnly = false } = {}) => {
    if (testingPrint) return;
    setTestingPrint(true);
    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const targetEl = testPrintRef.current;
      if (!targetEl) { toast('Preview not ready', 'error'); return; }

      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch { /* non-fatal */ }
      }
      const isThermalSample = previewMode === 'thermal';
      const bufSafe = isThermalSample && !!settings.thermalBufferSafe;
      const capScale = bufSafe
        ? 2
        : Math.min(4, Math.max(2, Math.round((window.devicePixelRatio || 1) * 1.5)));

      if (!isThermalSample && settings.pdfDarkenOnPrint !== false) {
        targetEl.classList.add('printing-mode');
      }
      const canvas = await html2canvas(targetEl, {
        scale: capScale,
        backgroundColor: '#ffffff',
        useCORS: false,
        logging: false,
      });
      targetEl.classList.remove('printing-mode');

      if (bufSafe) {
        try {
          const ctx = canvas.getContext('2d');
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = img.data;
          for (let i = 0; i < d.length; i += 4) {
            const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
            const v = gray < 180 ? 0 : 255;
            d[i] = d[i + 1] = d[i + 2] = v;
          }
          ctx.putImageData(img, 0, 0);
        } catch { /* CORS-tainted canvas can't be read; fall back to raw */ }
      }

      const jpegQ = bufSafe ? 0.72 : (settings.pdfQuality === 'draft' ? 0.75 : 0.94);
      let pdf;
      if (isThermalSample) {
        const width = 80;
        const height = (canvas.height * width) / canvas.width;
        pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [width, Math.max(140, height)], compress: true });
        pdf.addImage(canvas.toDataURL('image/jpeg', jpegQ), 'JPEG', 0, 0, width, height, undefined, 'FAST');
      } else {
        const pageW = 210;
        const pageH = 297;
        const fontScale = Math.min(1.2, Math.max(0.7, Number(settings.pdfFontScale) || 1));
        const drawW = pageW * fontScale;
        const xOff = (pageW - drawW) / 2;
        const rawH = (canvas.height * drawW) / canvas.width;
        const fitRatio = rawH <= pageH ? 1 : Math.min(1, pageH / rawH);
        const finalW = drawW * fitRatio;
        const finalH = rawH * fitRatio;
        const finalX = xOff + (drawW - finalW) / 2;
        pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        pdf.addImage(canvas.toDataURL('image/jpeg', jpegQ), 'JPEG', finalX, 0, finalW, finalH, undefined, 'FAST');
      }

      if (downloadOnly) {
        pdf.save(isThermalSample ? 'Sample-Thermal-Receipt-80mm.pdf' : 'Sample-Tax-Invoice-A4.pdf');
        toast('Sample PDF downloaded', 'success');
        return;
      }

      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);
      let cleaned = false;
      const cleanup = () => { if (!cleaned) { cleaned = true; URL.revokeObjectURL(url); } };
      const timer = setTimeout(cleanup, 90_000);
      let frame = document.getElementById('fgsb-print-frame');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'fgsb-print-frame';
        frame.style.cssText = 'position:fixed;left:-99999px;top:-99999px;width:0;height:0;border:0;';
        document.body.appendChild(frame);
      }
      frame.src = url;
      frame.onload = () => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); }
        catch { window.open(url, '_blank'); }
        setTimeout(() => { clearTimeout(timer); cleanup(); }, 60_000);
      };
      frame.onerror = () => { clearTimeout(timer); cleanup(); };
      toast(`Test print (${isThermalSample ? 'Thermal 80mm' : 'A4 PDF'}) sent to printer`, 'success');
    } catch (e) {
      console.error('Test print failed', e);
      toast('Test print failed — try Download Sample PDF instead', 'error');
    } finally {
      setTestingPrint(false);
    }
  };

  // Build the invoiceOptions that flows into the InvoicePreview for live preview
  // and sample print. _showLiveOverlays turns on live Watermark, Margins,
  // Verification QR, Code-128 Barcode, and Feedback QR inside the preview.
  const previewInvoiceOptions = {
    paperSize: 'thermal80',
    pdfStyle: settings.pdfTemplate || 'classic',
    showGST: true,
    showLogo: settings.showLogo !== false,
    showHSN: settings.showHSN !== false,
    showBankDetails: settings.showBankDetails !== false,
    showUPI: settings.showUPI !== false,
    showSignature: settings.signatureShow !== false,
    showAmountWords: settings.showAmountWords !== false,
    showTerms: true,
    showNotes: false,
    termsFormatMode: settings.termsFormatMode || 'compact',
    _showLiveOverlays: true,
    thermalFontSize: settings.fontSize,
    thermalCompact: !settings.showRateLine && !settings.showHSN,
    thermalCutMark: settings.cutMark,
    thermalFontFamily: settings.fontFamily,
    thermalFontWeight: settings.fontWeight,
    thermalAllCaps: settings.allCaps,
    thermalLineSpacing: settings.lineSpacing,
    thermalContrast: settings.contrast,
    thermalHeaderAlign: settings.headerAlign,
    thermalHeaderCaps: settings.headerCaps,
    thermalShowLogo: settings.showLogo,
    thermalShowHSN: settings.showHSN,
    thermalShowRate: settings.showRateLine,
    thermalQrSize: settings.qrSize,
    thermalFooterMessage: settings.footerMessage,
    thermalFeedLines: settings.feedLines,
    thermalTagline: settings.showTagline ? settings.tagline : '',
  };

  const sample = buildSampleInvoice(profile);
  const sampleTerms = settings.defaultTerms || '1. Goods once sold will not be taken back or exchanged.\n2. Interest @ 18% p.a. will be charged on overdue bills.\n3. Subject to local jurisdiction.';

  return (
    <div className="glass-panel p-6 mb-6 print-settings-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ minWidth: 0, flex: '1 1 280px' }}>
          <h3 className="section-title" style={{ marginTop: 0, marginBottom: '0.25rem' }}>
            <Printer size={18} style={{ display: 'inline', verticalAlign: -3, marginRight: 6 }} />
            Print & PDF Settings
            <span style={{ marginLeft: 6, verticalAlign: -2, display: 'inline-block' }}>
              <HelpButton title="Print & PDF Settings" doc="print-settings#how-it-saves" size={16} />
            </span>
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            App-wide defaults for every printed / PDF invoice. Every change saves automatically &amp; updates new invoices + Live Preview immediately.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem' }} onClick={reset}>
            <RotateCcw size={14} /> Reset defaults
          </button>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.82rem' }} disabled={testingPrint} onClick={() => runTestPrint({ downloadOnly: true })}>
            <Download size={14} /> Sample PDF
          </button>
          <button type="button" className="btn btn-primary" style={{ fontSize: '0.82rem' }} disabled={testingPrint} onClick={() => runTestPrint({ downloadOnly: false })}>
            <TestTube size={14} /> {testingPrint ? 'Preparing…' : 'Test Print'}
          </button>
        </div>
      </div>

      {/* Responsive view switcher for laptops (<= 1180px), tablets & phones — prevents cramping/overlap */}
      <div className="print-settings-mobile-tabs" role="tablist" aria-label="Print settings view mode">
        {[
          ['stacked', '⊞ Controls + Preview'],
          ['controls', '⚙️ Controls Only'],
          ['preview', '👁️ Full Preview'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={narrowPaneMode === id}
            className={`print-settings-mobile-tab ${narrowPaneMode === id ? 'active' : ''}`}
            onClick={() => setNarrowPaneMode(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Split layout: settings scroll on the left, preview stays sticky on the right on wide screens (> 1180px) */}
      <div className={`print-settings-layout narrow-mode-${narrowPaneMode}`}>
        <div className="print-settings-body" style={{ minWidth: 0 }}>

      {/* v1.10.36 — Business-type preset was buried below 25 other
           sections at line ~883. It's actually the FIRST decision a user
           should make — picking Retail / Restaurant / Freelancer / etc.
           auto-configures 15+ downstream settings AND (per this update)
           gates recommended/relevant options in the rest of the panel.
           So it comes first now. Also tracks `activeBusinessPresetId` so
           downstream sections can conditionally show "Recommended for
           your business" tags without asking the user again. */}
      <div style={{
        padding: '0.85rem 1rem',
        background: 'linear-gradient(135deg, var(--primary-light, rgba(30,64,175,0.06)), var(--card))',
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginBottom: '1rem',
      }}>
        {/* v1.10.86 - one Business type picker (Settings → Company); this used to
             be a second one with other wording. It only says which print style
             the business type set; the styles stay one click away below. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.88rem' }}>
          <span>
            Print style: <strong>{BUSINESS_PRESETS[activeBiz]?.label.replace(/^\W+\s*/u, '') || 'Standard'}</strong>
            {activeBiz && activeBiz === getBusinessType() && <span style={{ color: 'var(--text-muted)' }}> (from your business type)</span>}
          </span>
          <button type="button" className="btn-link" onClick={() => window.dispatchEvent(new CustomEvent('fgsb:settings-open', { detail: 'section-biztype' }))}
            style={{ background: 'none', border: 0, color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', font: 'inherit', padding: 0 }}>
            Change business type
          </button>
          <HelpButton title="Print style" doc="print-settings#business-type" size={16} />
        </div>
        <details style={{ marginTop: '0.5rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-muted)' }}>Use another print style (keeps your business type)</summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
          {Object.entries(BUSINESS_PRESETS).map(([key, preset]) => {
            const active = settings.activeBusinessPresetId === key;
            return (
              <button key={key} type="button"
                onClick={async () => {
                  if (!await confirmAction({
                    title: `Apply "${preset.label}" preset?`,
                    message: `This will overwrite ${Object.keys(preset.patch).length} print settings on top of your current setup. You can undo by picking "Reset defaults".`,
                    confirmLabel: 'Apply preset',
                    tone: 'warning',
                  })) return;
                  const next = { ...applyBusinessPreset(settings, key), activeBusinessPresetId: key };
                  applyAndSync(next, preset.patch || next);
                  toast(`Applied "${preset.label}" preset`, 'success');
                }}
                style={{
                  padding: '0.65rem 0.7rem',
                  border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                  borderRadius: 8,
                  background: active ? 'var(--primary-light, rgba(30,64,175,0.08))' : 'var(--card)',
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: '3px',
                  transition: 'all 0.15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <strong style={{ fontSize: '0.82rem' }}>{preset.label}</strong>
                  {active && <span style={{ fontSize: '0.62rem', color: 'var(--primary)', fontWeight: 700 }}>ACTIVE</span>}
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{preset.hint}</span>
              </button>
            );
          })}
        </div>
        </details>
      </div>

      {/* v1.10.36 — Info banner shown when a business preset is active,
           explaining that some options are hidden as irrelevant to the
           picked workflow. Users can un-pick the preset to see the full
           menu. */}
      {HIDDEN_HINT && (
        <div style={{ padding: '0.55rem 0.85rem', background: 'var(--primary-light, rgba(30,64,175,0.06))', border: '1px solid var(--border)', borderRadius: 8, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem' }}>ℹ</span>
          {HIDDEN_HINT}
          <button type="button" className="btn btn-secondary"
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem', marginLeft: 'auto' }}
            onClick={() => set({ activeBusinessPresetId: '' })}
            title="Clear business type to see every option regardless of relevance">
            Show all options
          </button>
        </div>
      )}

      {/* v1.9.9 — Design preset picker. One-click starting point; every
           setting below still fully editable. Shows a filled swatch strip
           so the user can eyeball the vibe before committing. */}
      <div style={{
        padding: '0.85rem 1rem',
        background: 'linear-gradient(135deg, var(--bg-secondary), var(--card))',
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.6rem', gap: '0.5rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.9rem' }}>🎨 Visual style <HelpButton title="Visual style" doc="print-settings#visual-style" size={16} style={{ marginLeft: 6 }} /> <span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 6 }}>colours + typography for PDF & thermal</span></strong>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Click a design to start. Edit anything below.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
          {DESIGN_PRESETS.map(preset => {
            // v1.9.13 — Multiple presets share the same pdfTemplate value
            // (e.g. Modern, Colorful, and Enterprise all use pdfTemplate:
            // 'modern'). Comparing on pdfTemplate lit up all of them at
            // once. Track a distinct activePresetId instead.
            const active = settings.activePresetId === preset.id;
            // v1.10.36 — Mini-invoice mockup instead of the old 3-color
            // bar. Uses the actual palette + font family the preset would
            // apply, so users can eyeball the vibe (header band, business
            // name in accent/primary, body rows in muted, total pill) in
            // the preset's own colour language before clicking. Font
            // family switches between mono + sans matching the preset so
            // Editorial and Monoline read like receipts, Aurora + Nordic
            // read like SaaS invoices.
            const s = preset.settings;
            const isMono = s.fontFamily === 'mono';
            const mockupFont = isMono
              ? '"Courier New", ui-monospace, monospace'
              : 'system-ui, -apple-system, "Segoe UI", sans-serif';
            return (
              <button
                key={preset.id}
                type="button"
                className="design-preset-card"
                data-keep-light="1"
                onClick={() => {
                  const next = { ...settings, ...preset.settings, activePresetId: preset.id };
                  applyAndSync(next, preset.settings);
                  toast(`Applied "${preset.name}" design — every setting still editable below`, 'success');
                }}
                style={{
                  padding: 0,
                  border: active ? '2px solid var(--primary)' : '1px solid var(--border)',
                  borderRadius: 10,
                  background: active ? 'var(--primary-light, rgba(30,64,175,0.06))' : 'var(--card-bg, #ffffff)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  overflow: 'hidden',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                  boxShadow: active ? '0 4px 14px rgba(30,64,175,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                title={preset.description}
              >
                {/* Mini invoice mockup — actual palette + font family */}
                <div style={{
                  height: 110,
                  background: s.pdfHeaderBg || '#ffffff',
                  padding: '10px 12px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                  fontFamily: mockupFont,
                  borderBottom: `1px solid ${s.pdfDividerColor || '#e5e5e5'}`,
                }}>
                  {/* Header row: business name + INVOICE label */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: s.pdfPrimaryText || '#0f172a',
                      letterSpacing: s.allCaps || s.headerCaps ? '0.05em' : '0',
                      textTransform: (s.allCaps || s.headerCaps) ? 'uppercase' : 'none',
                    }}>BUSINESS</span>
                    <span style={{
                      fontSize: 8, fontWeight: 700,
                      color: s.pdfAccent || '#1e40af',
                      letterSpacing: '0.08em',
                    }}>INVOICE</span>
                  </div>
                  {/* Accent divider */}
                  <div style={{ height: 2, background: s.pdfAccent || '#1e40af', width: '35%' }} />
                  {/* Body rows */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ height: 4, background: s.pdfMutedText || '#94a3b8', width: '55%', borderRadius: 1, opacity: 0.6 }} />
                      <div style={{ height: 4, background: s.pdfMutedText || '#94a3b8', width: '18%', borderRadius: 1, opacity: 0.6 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ height: 4, background: s.pdfMutedText || '#94a3b8', width: '45%', borderRadius: 1, opacity: 0.4 }} />
                      <div style={{ height: 4, background: s.pdfMutedText || '#94a3b8', width: '15%', borderRadius: 1, opacity: 0.4 }} />
                    </div>
                  </div>
                  {/* Total pill — accent bg + accentText for legibility */}
                  <div style={{
                    marginTop: 'auto', alignSelf: 'flex-end',
                    background: s.pdfAccent || '#1e40af',
                    color: s.pdfAccentText || '#ffffff',
                    fontSize: 8, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 3,
                    letterSpacing: '0.04em',
                  }}>TOTAL ₹1,250</div>
                </div>

                {/* Label + tag row */}
                <div style={{ padding: '0.55rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      <span style={{ marginRight: 5, opacity: 0.7 }}>{preset.icon}</span>
                      {preset.name}
                    </span>
                    {active && <span style={{ fontSize: '0.6rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.04em' }}>ACTIVE</span>}
                  </div>
                  {preset.tag && (
                    <span style={{
                      fontSize: '0.6rem', color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
                    }}>{preset.tag}</span>
                  )}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{preset.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Universal Invoice Content & Typography — applies to BOTH PDF (A4/A5) & Thermal receipts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <SettingGroup title="Invoice Content (PDF & Thermal)" doc="print-settings#thermal-content">
          <ToggleRow label="Show business logo" value={settings.showLogo} onChange={v => set({ showLogo: v })} />
          <ToggleRow label="Show HSN / SAC code per item" value={settings.showHSN} onChange={v => set({ showHSN: v })}
            hint="Recommended for GST compliance on tax invoices." />
          <ToggleRow label="Show amount in words" value={settings.showAmountWords} onChange={v => set({ showAmountWords: v })} />
          <ToggleRow label="Show bank details" value={settings.showBankDetails} onChange={v => set({ showBankDetails: v })} />
          <ToggleRow label="Show UPI QR code" value={settings.showUPI} onChange={v => set({ showUPI: v })} />
          {settings.showUPI && (
            <SelectRow label="UPI QR size (Thermal)" value={settings.qrSize} onChange={v => set({ qrSize: v })}
              options={[
                ['small', 'Small (60 × 60 px)'],
                ['medium', 'Medium (90 × 90 px)'],
                ['large', 'Large (120 × 120 px)'],
              ]} />
          )}
        </SettingGroup>

        <SettingGroup title="Typography & Emphasis" doc="print-settings#thermal-typography">
          <SelectRow label="Base font size" value={settings.fontSize} onChange={v => set({ fontSize: v })}
            options={[
              ['small', 'Small (compact)'],
              ['medium', 'Medium (recommended)'],
              ['large', 'Large'],
              ['xlarge', 'Extra Large (high legibility)'],
            ]} />
          <SelectRow label="Font weight" value={settings.fontWeight} onChange={v => set({ fontWeight: v })}
            options={[
              ['normal', 'Normal'],
              ['bold', 'Bold (crisper print)'],
              ['ultra', 'Ultra bold (darkest print)'],
            ]} />
          <ToggleRow label="ALL CAPS mode" value={settings.allCaps} onChange={v => set({ allCaps: v })}
            hint="Renders invoice text in UPPERCASE for maximum thermal & dot-matrix legibility." />
        </SettingGroup>
      </div>

      {/* Thermal POS Receipt Hardware Settings — open by default for Retail/Restaurant, expandable for A4 businesses */}
      <details open={isVisibleFor(['retail_shop', 'restaurant'])} style={{ padding: '0.85rem 1rem', background: 'var(--bg-secondary)', borderRadius: 8, marginBottom: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>
          🖨 Thermal POS Receipt Layout &amp; Cutter Settings (58mm / 80mm)
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '0.85rem' }}>
          <SettingGroup title="Thermal Layout" doc="print-settings#thermal-layout">
            <SelectRow label="Thermal font family" value={settings.fontFamily} onChange={v => set({ fontFamily: v })}
              options={[
                ['mono', 'Monospace (Courier) — thermal-optimized'],
                ['sans', 'Sans-serif (Arial-like)'],
              ]} />
            <SelectRow label="Line spacing" value={settings.lineSpacing} onChange={v => set({ lineSpacing: v })}
              options={[
                ['compact', 'Compact (save paper)'],
                ['normal', 'Normal'],
                ['comfortable', 'Comfortable (easier to read)'],
              ]} />
            <SelectRow label="Header alignment" value={settings.headerAlign} onChange={v => set({ headerAlign: v })}
              options={[
                ['center', 'Center (default)'],
                ['left', 'Left-aligned'],
              ]} />
            <SelectRow label="Thermal ink darkness" value={settings.contrast} onChange={v => set({ contrast: v })}
              options={[
                ['normal', 'Standard'],
                ['high', 'Dark (recommended for older printers)'],
                ['ultra', 'Extra-dark (max)'],
              ]} />
            <ToggleRow label="Force ALL CAPS in header" value={settings.headerCaps} onChange={v => set({ headerCaps: v })} />
            <ToggleRow label='Show "Qty × Rate" line per item' value={settings.showRateLine} onChange={v => set({ showRateLine: v })} />
          </SettingGroup>

          <SettingGroup title="Thermal Footer & Cutter" doc="print-settings#thermal-footer">
            <TextRow label="Custom footer message" value={settings.footerMessage} onChange={v => set({ footerMessage: v })}
              placeholder="Thank you for your business!"
              hint="Appears above the cut mark. Leave blank to hide." />
            <ToggleRow label='Show cut mark ("✂ cut here")' value={settings.cutMark} onChange={v => set({ cutMark: v })} />
            <SelectRow label="Feed lines after cut" value={String(settings.feedLines)} onChange={v => set({ feedLines: parseInt(v, 10) })}
              options={[['0', 'No extra feed'], ['1', '1 line'], ['2', '2 lines (default)'], ['3', '3 lines'], ['4', '4 lines'], ['6', '6 lines']]} />
            <ToggleRow label="Show tagline" value={settings.showTagline} onChange={v => set({ showTagline: v })} />
            {settings.showTagline && (
              <TextRow label="Tagline text" value={settings.tagline} onChange={v => set({ tagline: v })}
                placeholder="e.g. Fresh & Local Since 2010" />
            )}
          </SettingGroup>
        </div>
      </details>

      {/* ============================================================ */}
      {/* PDF & UNIVERSAL PRINT FEATURES (v1.9.0) */}
      {/* ============================================================ */}
      <div style={{ marginTop: '1.75rem', padding: '1rem 1.25rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: 'var(--primary)' }}>
          📄 PDF & universal print features <HelpButton title="PDF & universal print features" doc="print-settings#pdf-features" size={16} style={{ marginLeft: 6 }} />
        </h4>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 1rem' }}>
          Applies to A4 / A5 / Letter / Legal / thermal — every option here is dynamic (turn on / off any time).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>

          {/* AUTO-PRINT */}
          <SettingGroup title="Auto-print" doc="print-settings#auto-print">
            <ToggleRow label="Auto-print on save" value={settings.autoPrintOnSave} onChange={v => set({ autoPrintOnSave: v })}
              hint="Send to your default printer immediately after Save PDF. Perfect for POS counters — no manual click needed." />
          </SettingGroup>

          {/* WATERMARK */}
          {/* v1.10.36 — Merged custom-watermark controls (previously in
              their own section ~450 lines below) into this master group.
              Prior split had users toggling on "Use custom text" in one
              place without realising the master "Show watermark" needed
              to be on in the other place. See the deleted duplicate
              section further down + the "warning banner" the v1.10.10
              comment described. */}
          <SettingGroup title="Watermark" doc="print-settings#watermark">
            <ToggleRow label="Show watermark" value={settings.watermarkEnabled} onChange={v => set({ watermarkEnabled: v })}
              hint="Big diagonal stamp across the PDF (e.g. PAID / DUPLICATE / DRAFT)." />
            {settings.watermarkEnabled && (
              <>
                <ToggleRow label="Use custom text instead of preset" value={settings.watermarkUseCustomText}
                  onChange={v => set({ watermarkUseCustomText: v })}
                  hint="Type your own text below (e.g. 'FOR INTERNAL USE'). Turn off to use the PAID/DUPLICATE/etc. preset picker." />
                {settings.watermarkUseCustomText ? (
                  <TextRow label="Custom watermark text" value={settings.watermarkCustomText}
                    onChange={v => set({ watermarkCustomText: v })}
                    placeholder="e.g. FOR INTERNAL USE" />
                ) : (
                  <SelectRow label="Watermark text" value={settings.watermarkText} onChange={v => set({ watermarkText: v })}
                    options={[
                      ['PAID', 'PAID'], ['DUPLICATE', 'DUPLICATE'], ['DRAFT', 'DRAFT'],
                      ['OVERDUE', 'OVERDUE'], ['COPY', 'COPY'], ['ORIGINAL', 'ORIGINAL'],
                      ['CANCELLED', 'CANCELLED'], ['REPRINT', 'REPRINT'],
                    ]} />
                )}
                <SelectRow label="Opacity" value={String(settings.watermarkOpacity)} onChange={v => set({ watermarkOpacity: parseInt(v, 10) })}
                  options={[['5', 'Very faint (5%)'], ['10', 'Faint (10%)'], ['15', 'Medium (15%)'], ['25', 'Strong (25%)'], ['40', 'Very strong (40%)']]} />
              </>
            )}
          </SettingGroup>

          {/* MULTI-COPY — v1.10.36: goods-invoice-only businesses (whole-
              sale, manufacturer) see this. Freelancer / service / retail
              typically don't need GST Rule 48 multi-copy print. */}
          {isVisibleFor(['wholesale', 'manufacturer']) && (
          <SettingGroup title="Multi-copy (GST rule 48)" doc="print-settings#copies">
            <ToggleRow label="Print multiple copies with labels" value={settings.multiCopyEnabled} onChange={v => set({ multiCopyEnabled: v })}
              tag={isRecommendedForActive(['wholesale', 'manufacturer']) ? 'Recommended for your business' : null}
              hint="Prints your invoice N times with corner labels (ORIGINAL FOR RECIPIENT / DUPLICATE FOR TRANSPORTER / etc.). GST rule 48 requires 3 copies for goods, 2 for services." />
            {settings.multiCopyEnabled && (
              <SelectRow label="Number of copies" value={String(settings.multiCopyCount)} onChange={v => set({ multiCopyCount: parseInt(v, 10) })}
                options={[['2', '2 (Original + Duplicate — services)'], ['3', '3 (Original + Duplicate + Triplicate — goods)']]} />
            )}
          </SettingGroup>
          )}

          {/* PAGE NUMBERS + HEADER */}
          <SettingGroup title="Multi-page invoices" doc="print-settings#multi-page">
            {/* v1.10.74 - the PDF numbers page 2 onwards only; page 1 has no number */}
            <ToggleRow label="Page numbers on pages 2+" value={settings.pageNumbersEnabled} onChange={v => set({ pageNumbersEnabled: v })}
              hint='Shows "Page 2 of 5" bottom-right on pages 2+. The first page is not numbered.' />
            <ToggleRow label="Business name header on pages 2+" value={settings.pageHeaderEnabled} onChange={v => set({ pageHeaderEnabled: v })}
              hint="Repeats your business name at the top so multi-page invoices look professional." />
          </SettingGroup>

          {/* MARGINS */}
          <SettingGroup title="Print margins (mm)" doc="print-settings#margins">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
              <NumInput label="Top" value={settings.marginTop} onChange={v => set({ marginTop: v })} />
              <NumInput label="Bottom" value={settings.marginBottom} onChange={v => set({ marginBottom: v })} />
              <NumInput label="Left" value={settings.marginLeft} onChange={v => set({ marginLeft: v })} />
              <NumInput label="Right" value={settings.marginRight} onChange={v => set({ marginRight: v })} />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>
              For users printing on pre-printed letterhead — shift content down to avoid your logo, or in from the edge to fit binding.
            </p>
          </SettingGroup>

          {/* BARCODE + QR */}
          <SettingGroup title="Verification codes" doc="print-settings#verification-codes">
            <ToggleRow label="Invoice number as QR" value={settings.invoiceQrEnabled} onChange={v => set({ invoiceQrEnabled: v })}
              tag={isRecommendedForActive(['manufacturer', 'wholesale']) ? 'Recommended for your business' : null}
              hint="Prints a QR of the invoice number (or verification URL if set below) in the bottom-right corner." />
            {settings.invoiceQrEnabled && (
              <TextRow label="Verification URL (optional)" value={settings.invoiceQrUrl} onChange={v => set({ invoiceQrUrl: v })}
                placeholder="https://mycompany.com/verify/{invoice_number}"
                hint="{invoice_number} gets replaced with the actual invoice #. Leave blank to encode just the number." />
            )}
            <ToggleRow label="Invoice number as barcode text" value={settings.invoiceBarcodeEnabled} onChange={v => set({ invoiceBarcodeEnabled: v })}
              hint="Prints the invoice number in large monospace at the bottom-left for warehouse scanning / filing." />
          </SettingGroup>

          {/* FEEDBACK QR — v1.10.36: consumer-facing "how was your
              service" QR only meaningful for retail counters and
              restaurants. Freelancer / service / wholesale / manufacturer
              don't send this to their B2B clients. */}
          {isVisibleFor(['retail_shop', 'restaurant']) && (
          <SettingGroup title="Customer feedback QR" doc="print-settings#feedback-qr">
            <ToggleRow label="Feedback / review QR" value={settings.feedbackQrEnabled} onChange={v => set({ feedbackQrEnabled: v })}
              tag={isRecommendedForActive(['retail_shop', 'restaurant']) ? 'Recommended for your business' : null}
              hint="Adds a QR at the bottom-left of the PDF that opens a URL — Google Reviews, feedback form, WhatsApp chat, anything you want." />
            {settings.feedbackQrEnabled && (
              <>
                <TextRow label="URL to encode" value={settings.feedbackQrUrl} onChange={v => set({ feedbackQrUrl: v })}
                  placeholder="e.g. https://g.page/r/YOUR_ID/review" />
                <TextRow label="Label above QR" value={settings.feedbackQrLabel} onChange={v => set({ feedbackQrLabel: v })}
                  placeholder="Rate us · Give feedback" />
              </>
            )}
          </SettingGroup>
          )}

          {/* DIGITAL SIGNATURE */}
          <SettingGroup title="Digital signature" doc="print-settings#signature">
            <ToggleRow label="Show signature on invoice" value={settings.signatureShow} onChange={v => set({ signatureShow: v })} />
            {settings.signatureShow && (
              <>
                {settings.signatureImage ? (
                  <>
                    <div style={{ padding: '0.5rem', background: '#fff', borderRadius: 4, textAlign: 'center', marginBottom: '0.4rem' }}>
                      <img src={settings.signatureImage} alt="signature" style={{ maxHeight: 60, maxWidth: '100%' }} />
                    </div>
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                      onClick={() => set({ signatureImage: '' })}>
                      Remove signature
                    </button>
                  </>
                ) : (
                  <>
                    <label style={{ fontSize: '0.78rem', display: 'block', marginBottom: 3 }}>Upload signature (PNG / JPG)</label>
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) { toast('Image too large (max 2MB)', 'warning'); return; }
                        const reader = new FileReader();
                        reader.onload = (ev) => set({ signatureImage: ev.target.result });
                        reader.readAsDataURL(file);
                      }}
                      style={{ fontSize: '0.78rem' }} />
                  </>
                )}
                <TextRow label="Signatory name" value={settings.signatureName} onChange={v => set({ signatureName: v })}
                  placeholder="e.g. Rakesh Kumar · Director"
                  hint="Falls back to business name if left blank." />
              </>
            )}
          </SettingGroup>

          {/* T&C SEPARATE PAGE */}
          <SettingGroup title="Terms &amp; Conditions" doc="print-settings#terms-page">
            <ToggleRow label="Print T&amp;C on a separate page" value={settings.termsSeparatePage} onChange={v => set({ termsSeparatePage: v })}
              hint="For long terms — puts them on page 2 instead of squishing on page 1. Only affects invoices with T&amp;C enabled." />
          </SettingGroup>

          {/* FONT FAMILY (PDF) */}
          <SettingGroup title="PDF font family" doc="print-settings#pdf-font">
            <SelectRow label="Font used in generated PDFs" value={settings.pdfFontFamily} onChange={v => set({ pdfFontFamily: v })}
              options={[
                ['helvetica', 'Helvetica (default, cleanest)'],
                ['times', 'Times New Roman (traditional / formal)'],
                ['courier', 'Courier (monospace / retro / receipt style)'],
              ]}
              hint="Applies to the letterhead, table, and totals. Affects sheet formats (A4/A5/Letter/Legal); thermal has its own font setting above." />
          </SettingGroup>

          {/* v1.10.11 — COMPACT HEADER + THERMAL BUFFER-SAFE MODE */}
          <SettingGroup title="Layout &amp; printer compatibility" doc="print-settings#thermal-compatibility">
            <ToggleRow label="Compact upper header (fit more items on page 1)"
              value={settings.headerCompact} onChange={v => set({ headerCompact: v })}
              hint="Shrinks the header, billing block, and Place-of-Supply spacing so the items table starts higher up. Best when your invoices routinely spill to page 2 because of large headers." />
            <ToggleRow label="Thermal buffer-safe mode (for old / low-memory receipt printers)"
              value={settings.thermalBufferSafe} onChange={v => set({ thermalBufferSafe: v })}
              tag={isRecommendedForActive(['retail_shop', 'restaurant']) ? 'Recommended for your business' : null}
              hint="Uses grayscale, drops render scale for thermal captures, and lowers JPEG quality. Helps ₹800–₹2000 thermal printers with small internal buffers avoid stuck B/W print jobs." />
            {/* v1.10.42 — Thermal delivery mode (Direct HTML vs PDF). */}
            <SelectRow label="Thermal print method"
              value={settings.thermalPrintMode || 'direct'}
              onChange={v => set({ thermalPrintMode: v })}
              options={[
                ['direct', 'Direct HTML — sharper, faster (recommended)'],
                ['pdf',    'Via PDF — safer fallback for finicky printers'],
              ]}
              hint="Direct sends invoice text as vector to the printer — 203-dpi thermal renders it sharply. If your printer or browser mis-handles the direct path, switch to Via PDF for the pre-v1.10.42 raster behaviour." />
          </SettingGroup>

          {/* PER-TYPE INVOICE PREFIX OVERRIDES (v1.10.10) */}
          <SettingGroup title="Custom prefix per invoice type" doc="print-settings#prefixes">
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 0.5rem' }}>
              Leave blank to use the built-in default. Each type has its own atomic counter — changing a prefix starts a fresh count for the new one.
            </p>
            {[
              { key: 'tax-invoice',     label: 'Tax Invoice',       def: 'INV'  },
              { key: 'quotation',       label: 'Quotation',         def: 'QUO'  },
              { key: 'proforma',        label: 'Proforma / Estimate', def: 'EST' },
              { key: 'bill-of-supply',  label: 'Bill of Supply',    def: 'BOS'  },
              { key: 'composition',     label: 'Composition',       def: 'COMP' },
              { key: 'credit-note',     label: 'Credit Note',       def: 'CN'   },
              { key: 'delivery-challan',label: 'Delivery Challan',  def: 'DC'   },
              { key: 'sales-order',     label: 'Sales Order',       def: 'SO'   },
            ].map(({ key, label, def }) => (
              <div key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(96px, 128px)', gap: '0.5rem', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '0.82rem', minWidth: 0 }}>{label}</span>
                <input type="text" className="form-input"
                  value={settings.customPrefixes?.[key] || ''}
                  onChange={e => set({ customPrefixes: { ...(settings.customPrefixes || {}), [key]: e.target.value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) } })}
                  placeholder={def} maxLength={8}
                  style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem' }} />
              </div>
            ))}
          </SettingGroup>

          {/* REPRINT INDICATOR — v1.10.36: POS-reprint counter only
              meaningful for retail counters (customer wants a duplicate
              of yesterday's bill). B2B invoicing rarely reprints. */}
          {isVisibleFor(['retail_shop', 'restaurant']) && (
          <SettingGroup title="Reprint tracking" doc="print-settings#reprint">
            <ToggleRow label="Show REPRINT badge on reprints" value={settings.reprintLabelEnabled} onChange={v => set({ reprintLabelEnabled: v })}
              tag={isRecommendedForActive(['retail_shop', 'restaurant']) ? 'Recommended for your business' : null}
              hint="Automatic red badge in the top-left of the PDF when an invoice has been printed before. Tracks how many times each bill was printed." />
          </SettingGroup>
          )}

          {/* PRINT QUALITY */}
          <SettingGroup title="PDF quality vs file size" doc="print-settings#pdf-quality">
            <SelectRow label="Print quality" value={settings.pdfQuality} onChange={v => set({ pdfQuality: v })}
              options={[
                ['draft', 'Draft — smallest file (email-friendly)'],
                ['standard', 'Standard — balanced'],
                ['hd', 'HD — sharpest, largest file (default)'],
              ]}
              hint="Draft = ~50% smaller PDFs, fine for emailing. HD = crisper text at 100% zoom, larger file, better for physical archive." />
          </SettingGroup>

          {/* DUAL CURRENCY (foreign clients) — v1.10.36: only relevant
              for freelancer / service businesses billing foreign clients
              in INR + USD/EUR/GBP. Retail/restaurant/wholesale/manuf
              are domestic-only in the vast majority of cases. */}
          {isVisibleFor(['freelancer', 'service']) && (
          <SettingGroup title="Dual currency display" doc="print-settings#dual-currency">
            <ToggleRow label="Show foreign-currency equivalent" value={settings.dualCurrencyEnabled} onChange={v => set({ dualCurrencyEnabled: v })}
              tag={isRecommendedForActive(['freelancer', 'service']) ? 'Recommended for your business' : null}
              hint="For INR invoices to foreign clients, shows the total in a second currency next to the ₹ amount, at the rate set here. For invoices billed in USD, EUR... it adds the ₹ total to the exchange rate line, at that invoice's own rate. No live conversion." />
            {settings.dualCurrencyEnabled && (
              <>
                <SelectRow label="Secondary currency" value={settings.dualCurrencyCode} onChange={v => set({ dualCurrencyCode: v })}
                  options={[
                    ['USD', 'USD ($)'], ['EUR', 'EUR (€)'], ['GBP', 'GBP (£)'],
                    ['AED', 'AED (د.إ)'], ['SGD', 'SGD (S$)'], ['AUD', 'AUD (A$)'], ['JPY', 'JPY (¥)'],
                  ]} />
                <NumInput label={`Rate (1 ${settings.dualCurrencyCode} = ? INR)`} value={settings.dualCurrencyRate}
                  onChange={v => set({ dualCurrencyRate: v })} min={0.01} max={10000} />
                <SelectRow label="Display position" value={settings.dualCurrencyPosition} onChange={v => set({ dualCurrencyPosition: v })}
                  options={[
                    ['below', 'On a line below the ₹ amount'],
                    ['inline', 'Inline in parentheses'],
                  ]} />
              </>
            )}
          </SettingGroup>
          )}

          {/* COMPANY LETTERHEAD */}
          <SettingGroup title="Company letterhead" doc="print-settings#letterhead">
            <ToggleRow label="Use pre-printed letterhead image" value={settings.letterheadEnabled} onChange={v => set({ letterheadEnabled: v })}
              hint="Upload your own designed letterhead as a full-page background. Invoice content prints on top. Best for businesses with formal branded stationery." />
            {settings.letterheadEnabled && (
              <>
                {settings.letterheadImage ? (
                  <>
                    <div style={{ padding: '0.5rem', background: '#fff', borderRadius: 4, textAlign: 'center', marginBottom: '0.4rem' }}>
                      <img src={settings.letterheadImage} alt="letterhead" style={{ maxHeight: 100, maxWidth: '100%' }} />
                    </div>
                    <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                      onClick={() => set({ letterheadImage: '' })}>
                      Remove letterhead
                    </button>
                  </>
                ) : (
                  <>
                    {/* v1.10.10 — reported: "letterhead not working". Root
                         cause: enabling the toggle without uploading an
                         image left `letterheadImage = ''` which silently
                         does nothing at render time. Warn the user
                         instead of letting them think it's on. */}
                    <div style={{ padding: '0.5rem 0.75rem', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', color: 'var(--warn-text)', borderRadius: 6, fontSize: '0.78rem', marginBottom: '0.6rem' }}>
                      ⚠ Letterhead is enabled but no image is uploaded yet. Upload a PNG or JPG below (A4 recommended, max 3 MB) — the toggle does nothing until an image is set.
                    </div>
                    <label style={{ fontSize: '0.78rem', display: 'block', marginBottom: 3 }}>Upload letterhead (PNG / JPG, A4 recommended)</label>
                    <input type="file" accept="image/png,image/jpeg,image/webp"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 3 * 1024 * 1024) { toast('Image too large (max 3MB)', 'warning'); return; }
                        const reader = new FileReader();
                        reader.onload = (ev) => set({ letterheadImage: ev.target.result });
                        reader.readAsDataURL(file);
                      }}
                      style={{ fontSize: '0.78rem' }} />
                  </>
                )}
                <ToggleRow label="Hide invoice header block" value={settings.letterheadHideHeader} onChange={v => set({ letterheadHideHeader: v })}
                  hint="When letterhead already has your business info, hide the generated header block to avoid duplication." />
              </>
            )}
          </SettingGroup>

          {/* PDF TEMPLATE STYLE */}
          <SettingGroup title="PDF template style (visual design)" doc="print-settings#template">
            <SelectRow label="Template" value={settings.pdfTemplate} onChange={v => set({ pdfTemplate: v })}
              options={[
                ['modern', 'Modern (colorful header · default)'],
                ['classic', 'Classic (professional / conservative)'],
                ['minimal', 'Minimal (clean / whitespace)'],
                ['corporate', 'Corporate (formal blue/navy)'],
                ['minimalist', 'Minimalist (grayscale + Inter)'],
                ['boxed', 'Boxed grid (ruled boxes, like a quotation pad)'],
                ['tally', 'Tally style (order boxes, HSN tax summary, declaration)'],
              ]}
              hint="Changes the header block and table styling of the A4/A5 PDF. Thermal receipts use their own compact template." />
          </SettingGroup>

          {/* v1.9.2 — DARKEN ON PRINT */}
          <SettingGroup title="Print darkness" doc="print-settings#print-darkness">
            <ToggleRow label="Force darker text on printed PDF" value={settings.pdfDarkenOnPrint} onChange={v => set({ pdfDarkenOnPrint: v })}
              hint="Fixes light-gray labels + addresses fading on paper printers. Applies automatically when generating the PDF (screen view is unchanged). Turn off if your printer already prints greys crisply." />
          </SettingGroup>

          {/* v1.9.2 — FONT SIZE SCALE */}
          <SettingGroup title="PDF font scale" doc="print-settings#pdf-font-scale">
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 4 }}>
              Overall size: <strong>{Math.round((settings.pdfFontScale || 1) * 100)}%</strong>
            </label>
            <input type="range" min="80" max="140" step="5"
              value={Math.round((settings.pdfFontScale || 1) * 100)}
              onChange={e => set({ pdfFontScale: parseInt(e.target.value, 10) / 100 })}
              style={{ width: '100%', accentColor: 'var(--primary)' }} />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>
              80% = compact (fits more per page) · 100% = default · 140% = large. Scales the entire PDF proportionally.
            </p>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '3px 0 0', fontStyle: 'italic' }}>
              v1.10.10 note: applied at PDF export time. The on-screen preview always renders at 100% — download a PDF to see the actual scale.
            </p>
          </SettingGroup>

        </div>
      </div>

      {/* ============================================================ */}
      {/* v1.9.2 — PDF STYLE EDITOR (full color control) */}
      {/* ============================================================ */}
      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--primary)' }}>
              🎨 PDF Style Editor — full control over every colour <HelpButton title="PDF Style Editor" doc="print-settings#colours" size={16} style={{ marginLeft: 6 }} />
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
              Match your brand. Every colour you change updates the live preview instantly and gets baked into your PDFs.
            </p>
          </div>
          <ToggleRow label="Use custom colours" value={settings.userColorsEnabled} onChange={v => set({ userColorsEnabled: v })} />
        </div>

        {settings.userColorsEnabled && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
            <ColorRow label="Primary text" value={settings.pdfPrimaryText || '#0f172a'} onChange={v => set({ pdfPrimaryText: v })}
              hint="Main body text — client name, item names, totals." />
            <ColorRow label="Muted text" value={settings.pdfMutedText || '#334155'} onChange={v => set({ pdfMutedText: v })}
              hint="Labels, addresses, meta info (Date, Invoice #)." />
            <ColorRow label="Accent colour" value={settings.pdfAccent || '#1e40af'} onChange={v => set({ pdfAccent: v })}
              hint="Section titles + table header background." />
            <ColorRow label="Accent text" value={settings.pdfAccentText || '#ffffff'} onChange={v => set({ pdfAccentText: v })}
              hint="Text on the accent colour (usually white on a coloured header)." />
            <ColorRow label="Header background" value={settings.pdfHeaderBg || '#f8fafc'} onChange={v => set({ pdfHeaderBg: v })}
              hint="Header block behind the business name / invoice title." />
            <ColorRow label="Divider lines" value={settings.pdfDividerColor || '#334155'} onChange={v => set({ pdfDividerColor: v })}
              hint="Hairlines between sections + table row borders." />
            <div style={{ gridColumn: '1 / -1' }}>
              <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                onClick={() => set({
                  pdfPrimaryText: '#0f172a', pdfMutedText: '#334155',
                  pdfAccent: '#1e40af', pdfAccentText: '#ffffff',
                  pdfHeaderBg: '#f8fafc', pdfDividerColor: '#334155',
                })}>
                Reset colours to defaults
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* v1.9.3 — Full user control: 14 new dynamic sections */}
      {/* ============================================================ */}

      {/* v1.10.36 — DELETED the duplicate business-type-preset block that
           lived here. Was rendering the same picker twice — once buried
           way down, once (as of v1.10.36) hoisted to the top of the
           panel where it belongs. Moved above the Visual style picker
           to establish a "first pick your business, then style" order. */}

      {/* -- SECTION LABELS (multi-language + custom text) -- */}
      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--primary)' }}>
          🌐 Section labels — multi-language + custom text <HelpButton title="Section labels and language" doc="print-settings#labels-language" size={16} style={{ marginLeft: 6 }} />
        </h4>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
          Pick a language preset OR override any individual label. Custom text overrides the language preset for that field.
        </p>
        <SelectRow label="Language preset" value={settings.labelLanguage} onChange={v => set({ labelLanguage: v })}
          options={[
            ['en', 'English'],
            ['hi', 'हिन्दी (Hindi)'],
            ['ta', 'தமிழ் (Tamil)'],
            ['mr', 'मराठी (Marathi)'],
            ['bn', 'বাংলা (Bengali)'],
          ]} />
        <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
          <TextRow label='"BILL TO" label' value={settings.labelBillTo} onChange={v => set({ labelBillTo: v })}
            placeholder={LABEL_PRESETS[settings.labelLanguage]?.billTo || LABEL_PRESETS.en.billTo} />
          <TextRow label='"PLACE OF SUPPLY" label' value={settings.labelPlaceOfSupply} onChange={v => set({ labelPlaceOfSupply: v })}
            placeholder={LABEL_PRESETS[settings.labelLanguage]?.placeOfSupply || LABEL_PRESETS.en.placeOfSupply} />
          <TextRow label='"BANK DETAILS" label' value={settings.labelBankDetails} onChange={v => set({ labelBankDetails: v })}
            placeholder={LABEL_PRESETS[settings.labelLanguage]?.bankDetails || LABEL_PRESETS.en.bankDetails} />
          <TextRow label='"AMOUNT IN WORDS" label' value={settings.labelAmountInWords} onChange={v => set({ labelAmountInWords: v })}
            placeholder={LABEL_PRESETS[settings.labelLanguage]?.amountInWords || LABEL_PRESETS.en.amountInWords} />
          <TextRow label='"TERMS & CONDITIONS" label' value={settings.labelTerms} onChange={v => set({ labelTerms: v })}
            placeholder={LABEL_PRESETS[settings.labelLanguage]?.terms || LABEL_PRESETS.en.terms} />
          <TextRow label='"NOTES" label' value={settings.labelNotes} onChange={v => set({ labelNotes: v })}
            placeholder={LABEL_PRESETS[settings.labelLanguage]?.notes || LABEL_PRESETS.en.notes} />
          {/* v1.10.36 — Removed "Authorized Signatory" override row.
              InvoicePreview.jsx never calls getLabel(_, 'authorizedSignatory')
              — the signature block uses a hardcoded label. Row was
              silently doing nothing when users typed in it. */}
        </div>
      </div>

      {/* -- FORMATTING (date, number, currency) -- */}
      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--primary)' }}>
          📅 Formatting — date, number, currency <HelpButton title="Formatting: date, number, currency" doc="print-settings#formats" size={16} style={{ marginLeft: 6 }} />
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <SelectRow label="Date format" value={settings.dateFormat} onChange={v => set({ dateFormat: v })}
            options={[
              ['dd-mon-yyyy', '02 Apr 2026 (Indian)'],
              ['dd-mmm-yyyy', '02-Apr-2026'],
              ['dd-mm-yyyy', '02/04/2026'],
              ['mm-dd-yyyy', '04/02/2026 (US)'],
              ['yyyy-mm-dd', '2026-04-02'],
              ['iso', 'ISO 8601'],
            ]} />
          <SelectRow label="Number grouping" value={settings.numberFormat} onChange={v => set({ numberFormat: v })}
            options={[
              ['indian', '1,00,000.00 (Indian)'],
              ['western', '100,000.00 (Western)'],
              ['european', '100.000,00 (European)'],
            ]} />
          <SelectRow label="Decimal places" value={String(settings.decimalPlaces)} onChange={v => set({ decimalPlaces: parseInt(v, 10) })}
            options={[['0', '0 (no decimals)'], ['2', '2 (default)'], ['3', '3'], ['4', '4']]} />
          <SelectRow label="Currency symbol position" value={settings.currencyPosition} onChange={v => set({ currencyPosition: v })}
            options={[['before', '₹100 (before number)'], ['after', '100₹ (after number)']]} />
        </div>
      </div>

      <RoundOffSetting />

      {/* -- ROW DENSITY -- */}
      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--primary)' }}>
          📏 Row density <HelpButton title="Row density" doc="print-settings#row-density" size={16} style={{ marginLeft: 6 }} />
        </h4>
        <SelectRow label="Vertical spacing in tables + sections" value={settings.rowDensity} onChange={v => set({ rowDensity: v })}
          options={[
            ['compact', 'Compact — fit more per page'],
            ['normal', 'Normal (default)'],
            ['comfortable', 'Comfortable — easier to read'],
          ]}
          hint="Affects both A4/A5 PDFs and the on-screen preview." />
      </div>

      {/* v1.10.36 — DELETED the duplicate "Custom watermark text"
           section. Its two controls (watermarkUseCustomText + custom
           text input) are now inside the master Watermark SettingGroup
           above, gated by `watermarkEnabled` so users can't turn on
           custom text without also turning on the master toggle. Kills
           the cross-panel bug the v1.10.10 comment referenced. */}

      {/* -- CUSTOM TAX RATES -- */}
      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--primary)' }}>
          💯 Custom tax rate presets <HelpButton title="Custom tax rate presets" doc="print-settings#tax-rates" size={16} style={{ marginLeft: 6 }} />
        </h4>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.6rem' }}>
          Built-in rates: 0% · 0.1% · 0.25% · 3% · 5% · 12% · 18% · 28% · 40%. Since 22 Sep 2025 most goods are 5%, 18% or 40%; 12% and 28% stay for older bills. Add your own (e.g. 1.5%, 7.5%).
        </p>
        <CustomListEditor
          values={settings.customTaxRates || []}
          onChange={v => set({ customTaxRates: v })}
          placeholder="e.g. 3, 0.25, 7.5"
          hint="Comma-separated numbers. Between 0 and 100." />
      </div>

      {/* v1.10.5 — audit M25. Three unwired UI sections deleted here:
           * "Custom fields (default on every invoice)" — customInvoiceFields
             was saved but never rendered on the invoice.
           * "Items table column widths" — columnWidths were saved but no
             code applied them to .inv-table columns.
           * "Payment reminder scheduling" (below saved-templates) —
             reminderTemplate + reminderDaysAfter* had no send-side wiring.
         The setting defaults stay in printSettings.js so existing
         localStorage payloads still parse (extra keys are ignored). If
         someone wants these features, the settings shape is ready — the
         missing piece is the consumer code. */}

      {/* -- SAVED CUSTOM TEMPLATES -- */}
      <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--primary)' }}>
          💾 My saved templates <HelpButton title="My saved templates" doc="print-settings#templates" size={16} style={{ marginLeft: 6 }} />
        </h4>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 0.6rem' }}>
          Save your current setup as a named template. Recall any time.
        </p>
        <SavedTemplatesEditor
          templates={settings.savedTemplates || []}
          onChange={v => set({ savedTemplates: v })}
          currentSettings={settings}
          onLoad={async (tpl) => {
            if (!await confirmAction({
              title: `Load template "${tpl.name}"?`,
              message: 'This overwrites your current print settings. Save the current setup as a template first if you want to be able to go back.',
              confirmLabel: 'Load template',
              tone: 'warning',
            })) return;
            applyAndSync(tpl.settings, tpl.settings);
            toast(`Loaded "${tpl.name}"`, 'success');
          }} />
      </div>

        </div>{/* end .print-settings-body */}

        {/* Sticky preview pane on desktop (> 1180px), full-width panel on narrow screens */}
        <div className="print-settings-preview-pane">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Info size={14} />
              Live preview <HelpButton title="Live preview" doc="print-settings#preview" size={16} />
            </strong>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {settings.pdfFontScale && Number(settings.pdfFontScale) !== 1
                ? `PDF scale ${Math.round(Number(settings.pdfFontScale) * 100)}% · Live`
                : 'Updates instantly'}
            </span>
          </div>

          {/* Preview mode tabs */}
          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--card-bg, #ffffff)', border: '1px solid var(--border)', padding: '0.25rem', borderRadius: 8 }}>
            {[
              ['pdf', '📄 PDF (A4)'],
              ['thermal', '🖨 Thermal (80mm)'],
              ['both', '⊞ Stacked Both'],
            ].map(([key, label]) => (
              <button key={key} type="button"
                onClick={() => setPreviewMode(key)}
                style={{
                  flex: 1, padding: '0.4rem 0.35rem', border: 'none', borderRadius: 6,
                  background: previewMode === key ? 'var(--primary)' : 'transparent',
                  color: previewMode === key ? '#fff' : 'var(--text)',
                  fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Preview canvas — uses ResizeObserver + CSS transform: scale() wrapper
              so neither A4 (210mm) nor Thermal (80mm) ever overflows, clips, or overlaps. */}
          <div className="print-settings-preview-stage">
            {previewMode === 'both' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div className="print-preview-sheet-badge">📄 PDF (A4 — 210 × 297 mm)</div>
                  <ScaledPaperStage naturalWidthPx={794}>
                    <InvoicePreview
                      previewOnly
                      profile={sample.profile}
                      client={sample.client}
                      details={sample.details}
                      items={sample.items}
                      totals={sample.totals}
                      invoiceType={sample.invoiceType}
                      options={{ ...previewInvoiceOptions, paperSize: 'a4' }}
                      customTerms={sampleTerms}
                      customNotes=""
                      extraSections={[]}
                    />
                  </ScaledPaperStage>
                </div>
                <div>
                  <div className="print-preview-sheet-badge">🖨 Thermal POS Receipt (80 mm)</div>
                  <ScaledPaperStage naturalWidthPx={302}>
                    <InvoicePreview
                      previewOnly
                      profile={sample.profile}
                      client={sample.client}
                      details={sample.details}
                      items={sample.items}
                      totals={sample.totals}
                      invoiceType={sample.invoiceType}
                      options={{ ...previewInvoiceOptions, paperSize: 'thermal80' }}
                      customTerms={sampleTerms}
                      customNotes=""
                      extraSections={[]}
                    />
                  </ScaledPaperStage>
                </div>
              </div>
            ) : previewMode === 'pdf' ? (
              <ScaledPaperStage naturalWidthPx={794}>
                <InvoicePreview
                  previewOnly
                  profile={sample.profile}
                  client={sample.client}
                  details={sample.details}
                  items={sample.items}
                  totals={sample.totals}
                  invoiceType={sample.invoiceType}
                  options={{ ...previewInvoiceOptions, paperSize: 'a4' }}
                  customTerms={sampleTerms}
                  customNotes=""
                  extraSections={[]}
                />
              </ScaledPaperStage>
            ) : (
              <ScaledPaperStage naturalWidthPx={302}>
                <InvoicePreview
                  previewOnly
                  profile={sample.profile}
                  client={sample.client}
                  details={sample.details}
                  items={sample.items}
                  totals={sample.totals}
                  invoiceType={sample.invoiceType}
                  options={{ ...previewInvoiceOptions, paperSize: 'thermal80' }}
                  customTerms={sampleTerms}
                  customNotes=""
                  extraSections={[]}
                />
              </ScaledPaperStage>
            )}
          </div>
        </div>
      </div>{/* end .print-settings-layout */}

      {/* Dedicated unscaled 1:1 offscreen sheet so Test Print & Sample PDF
          capture full crisp geometry regardless of screen width or Split View */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: '-99999px',
          top: 0,
          width: previewMode === 'thermal' ? '302px' : '794px',
          background: '#ffffff',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <InvoicePreview
          ref={testPrintRef}
          previewOnly
          profile={sample.profile}
          client={sample.client}
          details={sample.details}
          items={sample.items}
          totals={sample.totals}
          invoiceType={sample.invoiceType}
          options={{ ...previewInvoiceOptions, paperSize: previewMode === 'thermal' ? 'thermal80' : 'a4' }}
          customTerms={sampleTerms}
          customNotes=""
          extraSections={[]}
        />
      </div>
    </div>
  );
}

// Scales a fixed-mm paper sheet (794px A4 or 302px 80mm thermal) to fit inside
// any container width without CSS `zoom` quirks, horizontal clipping, or height
// overlap. Reserves exact post-scale width × height on the layout wrapper.
function ScaledPaperStage({ naturalWidthPx = 794, children }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [box, setBox] = useState({ scale: 0.5, w: Math.round(naturalWidthPx * 0.5), h: 520 });

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;

    const recompute = () => {
      const availW = Math.max(180, outer.clientWidth - 4);
      const natW = Math.max(200, inner.scrollWidth || inner.offsetWidth || naturalWidthPx);
      const natH = Math.max(160, inner.scrollHeight || inner.offsetHeight || 500);
      const scale = Math.min(1, availW / natW);
      const w = Math.round(natW * scale);
      const h = Math.round(natH * scale);
      setBox((prev) => (Math.abs(prev.scale - scale) < 0.005 && Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2 ? prev : { scale, w, h }));
    };

    recompute();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(recompute);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [naturalWidthPx]);

  return (
    <div ref={outerRef} style={{ width: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: `${box.w}px`,
          height: `${box.h}px`,
          overflow: 'hidden',
          borderRadius: 6,
          background: '#ffffff',
          boxShadow: '0 2px 12px rgba(15, 23, 42, 0.1)',
          border: '1px solid #e2e8f0',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <div
          ref={innerRef}
          style={{
            width: 'fit-content',
            transform: `scale(${box.scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// ---- small building blocks -------------------------------------------------

// `doc` is the docs section about this group (its ? button).
function SettingGroup({ title, doc, children }) {
  return (
    <div>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: 4 }}>
        {title}
        {doc && <HelpButton title={title} doc={doc} size={16} style={{ width: 24, height: 24 }} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
        {children}
      </div>
    </div>
  );
}

// v1.10.75 — requested: "auto round-off option". Rounding was only reachable
// from Customize -> Totals inside an open invoice. This is the same switch
// (the invoice default `showRoundOff`), kept where people look for app-wide
// settings. It writes both stores the invoice screen reads, so the next new
// invoice follows it. Saved invoices keep their own choice.
function RoundOffSetting() {
  const read = () => {
    try { return JSON.parse(localStorage.getItem('freegstbill_invoiceOptions') || '{}').showRoundOff !== false; }
    catch { return true; }
  };
  const [on, setOn] = useState(read);
  const touched = useRef(false); // a click before the load answers must win
  useEffect(() => {
    getInvoiceDisplayOptions().then((o) => { if (!touched.current && o && typeof o.showRoundOff === 'boolean') setOn(o.showRoundOff); }).catch(() => {});
  }, []);
  const change = async (value) => {
    touched.current = true;
    setOn(value);
    try {
      const local = JSON.parse(localStorage.getItem('freegstbill_invoiceOptions') || '{}');
      localStorage.setItem('freegstbill_invoiceOptions', JSON.stringify({ ...local, showRoundOff: value }));
    } catch { /* storage blocked: the server copy below still applies */ }
    try {
      const server = await getInvoiceDisplayOptions().catch(() => null);
      await saveInvoiceDisplayOptions({ ...(server || {}), showRoundOff: value });
      toast(value ? 'New invoices will be rounded off' : 'New invoices will not be rounded off', 'success');
    } catch { toast('Could not save the round-off setting', 'error'); }
  };
  return (
    <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: 'var(--bg-secondary)', borderRadius: 8 }}>
      <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--primary)' }}>
        🧮 Totals <HelpButton title="Round off invoice totals" doc="print-settings#round-off" size={16} style={{ marginLeft: 6 }} />
      </h4>
      <ToggleRow label="Round off invoice totals" value={on} onChange={change}
        hint="Rounds the grand total to the nearest rupee and prints the difference as a Round-off line. Applies to new invoices; you can still change it per invoice under Customize → Totals." />
    </div>
  );
}

// v1.10.36 — ToggleRow gained an optional `tag` prop for the
// "Recommended for retail" / "Recommended for wholesale" etc. badges.
// Kept optional so unrelated toggles render exactly as before.
function ToggleRow({ label, value, onChange, hint, tag }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', fontSize: '0.82rem' }}>
      <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: 'var(--primary)' }} />
      <span style={{ flex: 1 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {tag && <span style={{
          display: 'inline-block', marginLeft: 6,
          fontSize: '0.6rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.04em',
          padding: '1px 6px', borderRadius: 999,
          background: 'var(--primary-light, rgba(30,64,175,0.1))',
          color: 'var(--primary)',
        }}>★ {tag}</span>}
        {hint && <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{hint}</span>}
      </span>
    </label>
  );
}

function SelectRow({ label, value, onChange, options, hint }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 3 }}>{label}</label>
      <select className="form-input" style={{ fontSize: '0.82rem', padding: '0.35rem 0.55rem' }}
        value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {hint && <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

function CustomListEditor({ values, onChange, placeholder }) {
  const [input, setInput] = useState('');
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        {(values || []).map((v, i) => (
          <span key={i} style={{ background: 'var(--primary)', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: 12, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {v}%
            <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '0.85rem', lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          placeholder={placeholder}
          className="form-input" style={{ fontSize: '0.82rem', padding: '0.35rem 0.55rem', flex: 1 }} />
        <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem' }}
          onClick={() => {
            const parsed = input.split(',').map(s => parseFloat(s.trim())).filter(n => Number.isFinite(n) && n >= 0 && n <= 100);
            if (parsed.length === 0) return;
            const merged = Array.from(new Set([...(values || []), ...parsed])).sort((a, b) => a - b);
            onChange(merged);
            setInput('');
          }}>Add</button>
      </div>
    </div>
  );
}

function ExtraFieldsEditor({ fields, onChange }) {
  const [label, setLabel] = useState('');
  return (
    <div>
      {(fields || []).map((f, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem' }}>
          <input type="text" value={f.label} className="form-input"
            style={{ fontSize: '0.82rem', padding: '0.35rem', flex: 1 }}
            onChange={e => {
              const next = [...fields];
              next[i] = { ...next[i], label: e.target.value };
              onChange(next);
            }} />
          <button type="button" className="icon-btn icon-btn-red"
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
            title="Remove"><Trash2 size={14} /></button>
        </div>
      ))}
      {(fields || []).length < 5 && (
        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.35rem' }}>
          <input type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="e.g. PO Reference"
            className="form-input" style={{ fontSize: '0.82rem', padding: '0.35rem', flex: 1 }} />
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.78rem' }}
            onClick={() => {
              if (!label.trim()) return;
              onChange([...(fields || []), { label: label.trim(), value: '' }]);
              setLabel('');
            }}>Add field</button>
        </div>
      )}
    </div>
  );
}

function SavedTemplatesEditor({ templates, onChange, currentSettings, onLoad }) {
  const [name, setName] = useState('');
  return (
    <div>
      {(templates || []).map((tpl, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', alignItems: 'center', padding: '0.4rem', background: 'var(--card)', borderRadius: 5 }}>
          <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600 }}>{tpl.name}</span>
          <button type="button" className="btn btn-secondary" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
            onClick={() => onLoad(tpl)}>Load</button>
          <button type="button" className="icon-btn icon-btn-red"
            onClick={() => onChange(templates.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="Template name (e.g. Retail v1)"
          className="form-input" style={{ fontSize: '0.82rem', padding: '0.35rem 0.5rem', flex: '1 1 160px', minWidth: 0 }} />
        <button type="button" className="btn btn-primary" style={{ fontSize: '0.78rem', flexShrink: 0 }}
          onClick={() => {
            if (!name.trim()) return;
            onChange([...(templates || []), { name: name.trim(), settings: { ...currentSettings } }]);
            setName('');
            toast(`Saved template "${name.trim()}"`, 'success');
          }}>
          <SaveIcon size={13} /> Save current as template
        </button>
      </div>
    </div>
  );
}

function ColorRow({ label, value, onChange, hint }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'nowrap' }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 38, height: 32, padding: 0, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="form-input" style={{ fontSize: '0.8rem', padding: '0.3rem 0.45rem', fontFamily: 'monospace', width: '100%', maxWidth: 120, minWidth: 0 }}
          placeholder="#000000" />
      </div>
      {hint && <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

function NumInput({ label, value, onChange, min = 0, max = 100 }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, marginBottom: 2 }}>{label}</label>
      <input type="number" min={min} max={max} step="0.5"
        value={value ?? 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="form-input" style={{ fontSize: '0.8rem', padding: '0.3rem 0.4rem', width: '100%' }} />
    </div>
  );
}

function TextRow({ label, value, onChange, hint, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 3 }}>{label}</label>
      <input type="text" className="form-input" style={{ fontSize: '0.82rem', padding: '0.35rem 0.55rem' }}
        value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}
