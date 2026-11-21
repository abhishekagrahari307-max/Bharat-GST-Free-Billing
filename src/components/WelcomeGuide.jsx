import { useState } from 'react';
import { Building2, FileText, BarChart3, Shield, ChevronRight, ChevronLeft, Check, ArrowRight, Image, PenTool } from 'lucide-react';
import { saveProfile, setRegionMode, getEnabledModules, setEnabledModules, setBusinessType, patchInvoiceDefaults, applyTypeTerms } from '../store';
import { getStatesForCountry, getCountryConfig, detectCountryFromBrowser, createEmptyAccount, gstinFill } from '../utils';
import { validateBusinessProfile, validateBankFields, validateGstinForCountry } from '../utils/profileValidation';
import { BUSINESS_TYPES, applyBusinessType, wizardResult } from '../utils/businessTypes';
import { getPrintSettings, savePrintSettings } from '../utils/printSettings';
import { toast } from './Toast';
import HelpButton from './HelpButton';
import SafePrivateNote from './SafePrivateNote';

const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: FileText },
  { id: 'business', title: 'Business Details', icon: Building2 },
  { id: 'bank', title: 'Bank & UPI', icon: Shield },
  { id: 'ready', title: 'You\'re All Set!', icon: BarChart3 },
];

export default function WelcomeGuide({ onComplete }) {
  const [step, setStep] = useState(0);
  // v1.10.74 - region starts as India (below), so the country must too; the
  // browser country is only used when "Outside India" is picked.
  const [profile, setProfile] = useState({
    businessName: '', address: '', city: '', pin: '', state: '', country: 'India', gstin: '', pan: '',
    email: '', phone: '', bankName: '', accountNumber: '', ifsc: '', swift: '',
    logo: '', signature: '', upiId: '', googleClientId: '', googleDriveFolder: 'GST Billing Invoices',
    // v1.10.83 - asked here, with the logo; on unless they untick it.
    showInMenu: true,
  });
  // v1.10.67 (#66 item 2, @sangwanmail-eng) — this is an India-first GST app,
  // so India is the default. It used to be chosen from the browser locale, and
  // a Windows set to en-US started people on "Outside India" with a United
  // States company profile. The other two options are one click away.
  const [region, setRegion] = useState('india');
  // v1.10.86 - the business type is asked here (it was a second wizard after
  // this one): it sets the features, the print style and the starting terms.
  const [biz, setBiz] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const cc = getCountryConfig(profile.country);
  const stateOptions = getStatesForCountry(profile.country);

  const handleChange = (e) => {
    const { name, value: rawValue } = e.target;
    let value = rawValue;
    if (name === 'gstin' || name === 'pan' || name === 'ifsc') {
      value = rawValue.toUpperCase().replace(/\s+/g, '');
    } else if (name === 'pin' && (profile.country || 'India') === 'India') {
      value = rawValue.replace(/[^\d]/g, '').slice(0, 6);
    }
    setErrors(prev => (prev[name] || (name === 'gstin' && (prev.state || prev.pan))
      ? { ...prev, [name]: '', ...(name === 'gstin' ? { state: '', pan: '' } : {}) }
      : prev));
    // v1.10.86 - a full GSTIN fills in the state and PAN (empty ones only).
    setProfile(p => ({ ...p, [name]: value, ...(name === 'gstin' && p.country === 'India' ? gstinFill(p, value) : {}) }));
  };

  const handleGstinBlur = () => {
    if (!profile.gstin?.trim()) return;
    const msg = validateGstinForCountry(profile.country || 'India', profile.gstin, profile.state);
    setErrors(prev => ({ ...prev, gstin: msg }));
  };

  const handleNextStep = () => {
    if (step === 1) {
      const check = validateBusinessProfile(profile, { requireState: true, checkBank: false });
      if (!check.ok) {
        setErrors(check.errors);
        toast(check.firstError, 'error');
        return;
      }
      setErrors({});
    } else if (step === 2) {
      const accErrs = validateBankFields(profile, profile.country || 'India');
      const firstErr = Object.values(accErrs)[0];
      if (firstErr) {
        setErrors(accErrs);
        toast(firstErr, 'error');
        return;
      }
      setErrors({});
    }
    setStep(step + 1);
  };

  const handleSkipBank = () => {
    setErrors({});
    setProfile(p => ({ ...p, bankName: '', accountNumber: '', ifsc: '', swift: '', upiId: '' }));
    setStep(3);
  };

  // v1.10.86 - the business type, as the old second wizard applied it, plus
  // the starting terms. Also marks the first-run setup done.
  const applySetup = () => {
    if (biz) {
      setEnabledModules(applyBusinessType(biz, getEnabledModules()));
      setBusinessType(biz);
      applyTypeTerms(biz).catch(() => {});
    }
    const { printSettings, invoiceDefaults } = wizardResult(getPrintSettings(), { biz });
    savePrintSettings(printSettings);
    if (biz) patchInvoiceDefaults(invoiceDefaults);
  };

  const handleFileUpload = (field) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 500 * 1024) {
        toast('Image must be under 500KB', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setProfile(p => ({ ...p, [field]: reader.result }));
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleFinish = async () => {
    const profileCheck = validateBusinessProfile(profile, { requireState: true, checkBank: true });
    if (!profileCheck.ok) {
      setErrors(profileCheck.errors);
      toast(profileCheck.firstError, 'error');
      setStep(profileCheck.errors.accountNumber || profileCheck.errors.ifsc || profileCheck.errors.upiId ? 2 : 1);
      return;
    }
    setSaving(true);
    try {
      setRegionMode(region);
      // Mirror the wizard's flat bank/UPI inputs into a single payment account
      // so the multi-account manager has a starting entry. If the user
      // skipped all bank fields, we don't create an empty account — they can
      // add one later in Settings.
      const hasBank = profile.bankName || profile.accountNumber || profile.ifsc || profile.swift || profile.upiId;
      const profileToSave = hasBank ? {
        ...profile,
        paymentAccounts: [{
          ...createEmptyAccount(profile.bankName || 'Default account'),
          bankName: profile.bankName || '',
          accountNumber: profile.accountNumber || '',
          ifsc: profile.ifsc || '',
          swift: profile.swift || '',
          upiId: profile.upiId || '',
          isDefault: true,
          isActive: true,
        }],
      } : profile;
      await saveProfile(profileToSave);
      applySetup();
      localStorage.setItem('freegstbill_onboarded', 'true');
      toast('Setup complete! Start creating invoices.', 'success');
      onComplete(profileToSave);
    } catch {
      toast('Failed to save. Try again.', 'error');
    }
    setSaving(false);
  };

  const handleSkip = () => {
    applySetup();
    localStorage.setItem('freegstbill_onboarded', 'true');
    onComplete(null);
  };

  return (
    <div style={{ minHeight: 'calc(100vh / var(--ui-zoom, 1))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(0.75rem, 3vw, 2rem)', background: 'var(--bg-primary)' }}>
      <div style={{ maxWidth: '680px', width: '100%' }}>
        {/* Progress */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', justifyContent: 'center' }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              width: i === step ? '3rem' : '2rem', height: '4px', borderRadius: '2px',
              background: i <= step ? 'var(--primary)' : 'var(--border-color)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* v1.10.86 - the padding shrinks on a phone; the buttons at the bottom
            stay on screen (sticky), so Get Started is never below the fold. */}
        <div className="glass-panel" style={{ padding: 'clamp(1.1rem, 4vw, 2.25rem)', paddingBottom: 0 }}>

          {/* Step 0: Welcome - v1.10.86: the business type is asked here (it was a
              second window after this one); the feature cards made way for it. */}
          {step === 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.6rem' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'linear-gradient(135deg, #1e40af, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 800, fontSize: '1.4rem' }}>
                  B
                </div>
                <div>
                  <h1 style={{ fontSize: 'clamp(1.25rem, 4vw, 1.6rem)', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Welcome to Bharat GST Free Billing <HelpButton title="Welcome" doc="first-run#welcome" size={16} /></h1>
                  <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--primary)', marginTop: '0.15rem' }}>Created by Abhishek Agrahari</div>
                </div>
              </div>
              <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem', lineHeight: 1.5, fontSize: '0.9rem' }}>
                100% Free GST billing &amp; invoicing for Indian businesses. Two minutes of setup and you can create your first GST bill.
              </p>

              <p style={{ fontWeight: 600, fontSize: '0.95rem', margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>What kind of business do you run? <HelpButton title="Business type" doc="first-run#business-type" size={16} /></p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.45rem' }}>
                {BUSINESS_TYPES.map(t => (
                  <button key={t.id} type="button" onClick={() => setBiz(biz === t.id ? '' : t.id)} aria-pressed={biz === t.id}
                    className={`type-chip ${biz === t.id ? 'type-chip-active' : ''}`}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0.5rem 0.7rem', gap: '0.1rem', textAlign: 'left' }}>
                    <span style={{ fontWeight: 600 }}>{t.label}</span>
                    <span style={{ fontSize: '0.68rem', color: biz === t.id ? 'inherit' : 'var(--text-muted)', fontWeight: 400, lineHeight: 1.3 }}>{t.hint}</span>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.45rem 0 0' }}>
                It picks the screens you see, the print style and the terms printed on your bills. Nothing is ever deleted; change it any time in Settings → Company → Business type.
              </p>

              <div style={{ marginTop: '0.9rem', padding: '0.75rem 0.9rem', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', textAlign: 'left' }}>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.6rem', color: 'var(--text-primary)' }}>Where will you be invoicing from?</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem' }}>
                  {[
                    { id: 'india', label: '🇮🇳 India', desc: 'GST, GSTR-1/3B, UPI' },
                    { id: 'international', label: '🌍 Outside India', desc: 'VAT/SST/MwSt' },
                    { id: 'both', label: '🌐 Both', desc: 'India + foreign clients' },
                  ].map(opt => (
                    <button key={opt.id} type="button"
                      onClick={() => {
                        setRegion(opt.id);
                        if (opt.id === 'india') setProfile(p => ({ ...p, country: 'India' }));
                        else if (opt.id === 'international' && profile.country === 'India') setProfile(p => ({ ...p, country: detectCountryFromBrowser() === 'India' ? 'United States' : detectCountryFromBrowser() }));
                      }}
                      className={`type-chip ${region === opt.id ? 'type-chip-active' : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0.55rem 0.7rem', gap: '0.15rem' }}>
                      <span style={{ fontWeight: 600 }}>{opt.label}</span>
                      <span style={{ fontSize: '0.68rem', color: region === opt.id ? 'inherit' : 'var(--text-muted)', fontWeight: 400 }}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '0.6rem 0 0' }}>You can change this any time in Settings → Print &amp; PDF → Region.</p>
              </div>

              <SafePrivateNote style={{ marginTop: '0.9rem' }} />
            </div>
          )}

          {/* Step 1: Business Details */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Business Details <HelpButton title="Business Details" doc="first-run#business-details" size={16} /></h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                This info appears on every invoice you generate. You can change it anytime in Settings.
              </p>

              <div style={{ display: 'grid', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Business Name *</label>
                  <input type="text" name="businessName" className="form-input"
                    style={errors.businessName ? { borderColor: '#dc2626' } : undefined}
                    value={profile.businessName} onChange={handleChange}
                    placeholder="e.g. Sharma Consultants Pvt. Ltd." />
                  {errors.businessName && <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.businessName}</small>}
                </div>

                <div className="form-group">
                  <label className="form-label">Address</label>
                  <textarea name="address" className="form-input" rows={2}
                    style={errors.address ? { borderColor: '#dc2626' } : undefined}
                    value={profile.address} onChange={handleChange}
                    placeholder="e.g. 42, MG Road, Sector 15, Gurugram 122001" />
                  {errors.address && <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.address}</small>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">City</label>
                    <input type="text" name="city" className="form-input"
                      style={errors.city ? { borderColor: '#dc2626' } : undefined}
                      value={profile.city || ''} onChange={handleChange}
                      placeholder="e.g. Lucknow" />
                    {errors.city && <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.city}</small>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">{cc.postalLabel}</label>
                    <input type="text" name="pin" className="form-input"
                      style={errors.pin ? { borderColor: '#dc2626' } : undefined}
                      value={profile.pin || ''} onChange={handleChange}
                      placeholder={cc.postalLabel} />
                    {errors.pin && <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.pin}</small>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{cc.taxIdLabel}</label>
                    <input type="text" name="gstin" className="form-input"
                      value={profile.gstin} onChange={handleChange} onBlur={handleGstinBlur}
                      placeholder={cc.taxIdPlaceholder} maxLength={profile.country === 'India' ? 15 : 20}
                      style={{ textTransform: 'uppercase', ...(errors.gstin ? { borderColor: '#dc2626' } : {}) }} />
                    {errors.gstin ? (
                      <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.gstin}</small>
                    ) : (
                      <span className="field-hint">Leave blank if not registered for tax.{profile.country === 'India' && ' Typing your GSTIN fills in the state and PAN.'}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">{cc.stateLabel}{profile.country === 'India' ? ' *' : ''}</label>
                    {stateOptions.length > 0 ? (
                      <select name="state" className="form-input"
                        style={errors.state ? { borderColor: '#dc2626' } : undefined}
                        value={profile.state} onChange={handleChange}>
                        <option value="">Select {cc.stateLabel.toLowerCase()}</option>
                        {stateOptions.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <input type="text" name="state" className="form-input"
                        style={errors.state ? { borderColor: '#dc2626' } : undefined}
                        value={profile.state} onChange={handleChange} placeholder={cc.stateLabel} />
                    )}
                    {errors.state ? (
                      <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.state}</small>
                    ) : (
                      profile.country === 'India' && <span className="field-hint">Needed for auto CGST/SGST vs IGST</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">PAN</label>
                    <input type="text" name="pan" className="form-input" value={profile.pan} onChange={handleChange}
                      placeholder="AAAAA1234A" maxLength={10}
                      style={{ textTransform: 'uppercase', ...(errors.pan ? { borderColor: '#dc2626' } : {}) }} />
                    {errors.pan && <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.pan}</small>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input type="text" name="phone" className="form-input"
                      style={errors.phone ? { borderColor: '#dc2626' } : undefined}
                      value={profile.phone} onChange={handleChange}
                      placeholder="+91 98765 43210" />
                    {errors.phone && <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.phone}</small>}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" name="email" className="form-input"
                    style={errors.email ? { borderColor: '#dc2626' } : undefined}
                    value={profile.email} onChange={handleChange}
                    placeholder="billing@yourbusiness.com" />
                  {errors.email && <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.email}</small>}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Bank & UPI */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-primary)' }}>Bank & UPI Details <HelpButton title="Bank & UPI Details" doc="first-run#bank-upi" size={16} /></h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                Shown on your invoices so clients know where to pay. Optional — you can add this later.
              </p>

              <div style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Bank Name</label>
                    <input type="text" name="bankName" className="form-input" value={profile.bankName} onChange={handleChange}
                      placeholder="e.g. HDFC Bank" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Account Number</label>
                    <input type="text" name="accountNumber" className="form-input"
                      style={errors.accountNumber ? { borderColor: '#dc2626' } : undefined}
                      value={profile.accountNumber} onChange={handleChange}
                      placeholder="e.g. 12345678901234" />
                    {errors.accountNumber && <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.accountNumber}</small>}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">{cc.bankLabel || 'IFSC Code'}</label>
                    <input type="text" name="ifsc" className="form-input" value={profile.ifsc} onChange={handleChange}
                      placeholder="e.g. HDFC0001234"
                      style={{ textTransform: 'uppercase', ...(errors.ifsc ? { borderColor: '#dc2626' } : {}) }} />
                    {errors.ifsc && <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.ifsc}</small>}
                  </div>
                  <div className="form-group">
                    <label className="form-label">UPI ID</label>
                    <input type="text" name="upiId" className="form-input"
                      style={errors.upiId ? { borderColor: '#dc2626' } : undefined}
                      value={profile.upiId} onChange={handleChange}
                      placeholder="e.g. business@upi" />
                    {errors.upiId ? (
                      <small style={{ color: '#dc2626', fontSize: '0.72rem', display: 'block', marginTop: '0.2rem' }}>⚠ {errors.upiId}</small>
                    ) : (
                      <span className="field-hint">Auto-generates QR code on invoices</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Business Logo</label>
                    <button type="button" className="btn btn-secondary" onClick={() => handleFileUpload('logo')}
                      style={{ width: '100%', justifyContent: 'center' }}>
                      <Image size={16} /> {profile.logo ? 'Change Logo' : 'Upload Logo'}
                    </button>
                    {profile.logo && <img src={profile.logo} alt="Logo" style={{ height: '40px', marginTop: '0.5rem', objectFit: 'contain' }} />}
                    <span className="field-hint">PNG/JPG, max 500KB</span>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.6rem' }}>
                      <input type="checkbox" checked={!!profile.showInMenu}
                        onChange={(e) => setProfile(prev => ({ ...prev, showInMenu: e.target.checked }))}
                        style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--primary)' }} />
                      <span>Show my business name and logo in the app&apos;s menu (top left)</span>
                    </label>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Digital Signature</label>
                    <button type="button" className="btn btn-secondary" onClick={() => handleFileUpload('signature')}
                      style={{ width: '100%', justifyContent: 'center' }}>
                      <PenTool size={16} /> {profile.signature ? 'Change Signature' : 'Upload Signature'}
                    </button>
                    {profile.signature && <img src={profile.signature} alt="Signature" style={{ height: '40px', marginTop: '0.5rem', objectFit: 'contain' }} />}
                    <span className="field-hint">PNG/JPG, max 500KB</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Ready */}
          {step === 3 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                <Check size={32} color="white" />
              </div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>You're All Set! <HelpButton title="You're All Set" doc="first-run#all-set" size={16} /></h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: 1.6 }}>
                Your business profile is ready. Here's what to do next:
              </p>

              <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
                {[
                  { num: '1', title: 'Create your first invoice', desc: 'Click "New Invoice" in the sidebar. Pick invoice type, add client details and line items.' },
                  { num: '2', title: 'Download or share', desc: 'Generate PDF, share via WhatsApp or email. UPI QR auto-appears if you added your UPI ID.' },
                  { num: '3', title: 'Check GST reports', desc: 'After a few invoices, open "GST Returns" in the sidebar. Your GSTR-1, GSTR-3B and HSN summary are built from them.' },
                  { num: '4', title: 'File GST returns', desc: 'Download the GSTR-1 JSON from GST Returns and upload it on the GST portal. The Filing Guide tab there walks you through it.' },
                ].map((item) => (
                  <div key={item.num} style={{ display: 'flex', gap: '1rem', padding: '0.75rem 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>
                      {item.num}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{item.title}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '1rem', borderRadius: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  All your data is stored locally in the <code style={{ background: 'var(--border-color)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>data/</code> folder on this computer. Nothing is sent to any server. You can export a full backup anytime from Settings.
                </div>
              </div>
            </div>
          )}

          {/* Navigation - v1.10.86: sticky, so the next button is always on screen. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.25rem', padding: '0.85rem 0', borderTop: '1px solid var(--border-color)', position: 'sticky', bottom: 0, background: 'linear-gradient(var(--card-bg), var(--card-bg)), var(--bg-primary)', zIndex: 1 }}>
            <div>
              {step === 0 && (
                <button className="btn btn-secondary" onClick={handleSkip} style={{ fontSize: '0.85rem' }}>
                  Skip Setup
                </button>
              )}
              {step > 0 && step < 3 && (
                <button className="btn btn-secondary" onClick={() => { setErrors({}); setStep(step - 1); }}>
                  <ChevronLeft size={16} /> Back
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {step < 3 && (
                <button className="btn btn-primary" onClick={handleNextStep}>
                  {step === 0 ? 'Get Started' : 'Next'} <ChevronRight size={16} />
                </button>
              )}
              {step === 2 && (
                <button className="btn btn-secondary" onClick={handleSkipBank} style={{ fontSize: '0.85rem' }}>
                  Skip, I'll add later
                </button>
              )}
              {step === 3 && (
                <button className="btn btn-primary" onClick={handleFinish} disabled={saving}>
                  {saving ? 'Saving...' : 'Start Billing'} <ArrowRight size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Step labels */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem 1.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ fontSize: '0.7rem', color: i === step ? 'var(--primary)' : 'var(--text-muted)', fontWeight: i === step ? 600 : 400, transition: 'all 0.3s' }}>
              {s.title}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
