// Option A — Security, AES-256-GCM Encrypted Vault, Recovery Key, Passkey & L2 Staff Roles
import { useEffect, useState } from 'react';
import {
  ShieldCheck, Lock, KeyRound, Users, Plus, Trash2, Copy, Download, Fingerprint, Clock,
} from 'lucide-react';
import {
  getLockStatus,
  setLockPin,
  setupVaultLock,
  changeVaultPin,
  disableVaultLock,
  addLockStaffUser,
  deleteLockStaffUser,
  saveAutoLockSettings,
} from '../store';
import { toast } from './Toast';
import HelpButton from './HelpButton';
import {
  lockNow,
  UNLOCKED_KEY,
  PASSKEY_CRED_KEY,
  lockSettingsChanged,
  setActiveStaffUser,
} from '../utils/appLock';
import { STAFF_ROLES } from '../utils/localLock';

const digits = (v, n = 8) => String(v || '').replace(/\D/g, '').slice(0, n);

export default function AppLockSettings() {
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState(null); // null | 'setup-vault' | 'change-pin' | 'disable-vault' | 'add-staff' | 'plain-pin'
  const [ownerName, setOwnerName] = useState('Owner');
  const [pinLength, setPinLength] = useState(6);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState('cashier');
  const [busy, setBusy] = useState(false);

  // Newly generated 24-char recovery key modal (must be saved by user!)
  const [recoveryKeyModal, setRecoveryKeyModal] = useState('');
  const [recoverySavedAck, setRecoverySavedAck] = useState(false);

  const [autoLockMinutes, setAutoLockMinutes] = useState(5);
  const [lockOnHidden, setLockOnHidden] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(() => {
    try { return !!JSON.parse(localStorage.getItem(PASSKEY_CRED_KEY) || 'null')?.credId; } catch { return false; }
  });

  const load = () => {
    getLockStatus()
      .then((s) => {
        setStatus(s);
        setAutoLockMinutes(Number(s?.autoLockMinutes ?? 5));
        setLockOnHidden(!!s?.lockOnHidden);
      })
      .catch(() => setStatus({ enabled: false, encrypted: false, length: 0, users: [] }));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setMode(null);
    setPin('');
    setConfirm('');
    setCurrentPin('');
    setStaffName('');
    setStaffRole('cashier');
  };

  const handleEnableVault = async (e) => {
    e.preventDefault();
    if (pin.length !== pinLength) {
      toast(`PIN must be ${pinLength} digits`, 'warning');
      return;
    }
    if (pin !== confirm) {
      toast('Both PIN fields must match', 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await setupVaultLock({
        pin,
        ownerName: ownerName.trim() || 'Owner',
        autoLockMinutes,
      });
      try { sessionStorage.setItem(UNLOCKED_KEY, '1'); } catch { /* ignore */ }
      if (res?.user) setActiveStaffUser(res.user);
      setRecoveryKeyModal(res?.recoveryCode || '');
      setRecoverySavedAck(false);
      resetForm();
      load();
      lockSettingsChanged();
      toast('Option A Encrypted Vault (AES-256-GCM) enabled!', 'success');
    } catch (err) {
      toast(err.message || 'Could not enable Encrypted Vault', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleChangeVaultPin = async (e) => {
    e.preventDefault();
    if (pin.length !== pinLength) {
      toast(`New PIN must be ${pinLength} digits`, 'warning');
      return;
    }
    if (pin !== confirm) {
      toast('New PINs do not match', 'warning');
      return;
    }
    setBusy(true);
    try {
      await changeVaultPin({
        userId: status?.activeUser?.id || status?.users?.[0]?.id,
        currentPin,
        newPin: pin,
      });
      toast('PIN updated cleanly (zero record re-encryption needed).', 'success');
      resetForm();
      load();
      lockSettingsChanged();
    } catch (err) {
      toast(err.message || 'Current PIN is wrong', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDisableVault = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (status?.encrypted) {
        await disableVaultLock({ currentPin });
      } else {
        await setLockPin(null, currentPin);
      }
      localStorage.removeItem(PASSKEY_CRED_KEY);
      setHasPasskey(false);
      setActiveStaffUser(null);
      toast('App lock & encryption turned off.', 'info');
      resetForm();
      load();
      lockSettingsChanged();
    } catch (err) {
      toast(err.message || 'Wrong Owner PIN', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    if (!staffName.trim()) {
      toast('Enter staff member name', 'warning');
      return;
    }
    if (pin.length !== pinLength) {
      toast(`Staff PIN must be ${pinLength} digits`, 'warning');
      return;
    }
    setBusy(true);
    try {
      await addLockStaffUser({
        currentPin,
        name: staffName.trim(),
        role: staffRole,
        pin,
      });
      toast(`Added ${staffName.trim()} (${staffRole})`, 'success');
      resetForm();
      load();
    } catch (err) {
      toast(err.message || 'Could not add staff account (check Owner PIN)', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteStaff = async (user) => {
    const ownerPin = window.prompt(`Enter Owner PIN to remove ${user.name} (${user.role}):`);
    if (!ownerPin) return;
    try {
      await deleteLockStaffUser(user.id, ownerPin.trim());
      toast(`Removed ${user.name}`, 'info');
      load();
    } catch (err) {
      toast(err.message || 'Could not remove staff user', 'error');
    }
  };

  const handleAutoLockChange = async (nextMins, nextHidden) => {
    setAutoLockMinutes(nextMins);
    setLockOnHidden(nextHidden);
    try {
      await saveAutoLockSettings({ autoLockMinutes: nextMins, lockOnHidden: nextHidden });
      lockSettingsChanged();
      toast('Auto-lock preferences saved', 'success');
    } catch { /* ignore */ }
  };

  const handleEnrollPasskey = async () => {
    if (!window.PublicKeyCredential || !navigator.credentials?.create) {
      toast('Passkey / Biometric unlock is not supported in this browser.', 'warning');
      return;
    }
    const pinForBio = window.prompt('Enter your current Vault PIN once to link Fingerprint / Face ID / Windows Hello on this device:');
    if (!pinForBio) return;
    try {
      const challenge = new Uint8Array(32);
      const userIdBytes = new Uint8Array(16);
      crypto.getRandomValues(challenge);
      crypto.getRandomValues(userIdBytes);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Bharat GST Free Billing' },
          user: {
            id: userIdBytes,
            name: status?.activeUser?.name || 'owner@bharatgst',
            displayName: status?.activeUser?.name || 'Owner',
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 45000,
        },
      });
      if (cred?.rawId) {
        const b64Id = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
        localStorage.setItem(PASSKEY_CRED_KEY, JSON.stringify({
          credId: b64Id,
          wrappedPin: btoa(pinForBio.trim()),
          userId: status?.activeUser?.id || status?.users?.[0]?.id || '',
          createdAt: new Date().toISOString(),
        }));
        setHasPasskey(true);
        toast('Fingerprint / Passkey unlock enabled on this device!', 'success');
      }
    } catch {
      toast('Passkey setup cancelled or device biometrics unavailable.', 'warning');
    }
  };

  const downloadRecoveryCard = (code) => {
    const content = [
      '============================================================',
      '  BHARAT GST FREE BILLING — ENCRYPTED VAULT RECOVERY KEY',
      '  Created by Abhishek Agrahari',
      '============================================================',
      '',
      `  Generated At : ${new Date().toLocaleString('en-IN')}`,
      `  Owner Name   : ${status?.users?.[0]?.name || ownerName || 'Owner'}`,
      '  Encryption   : AES-256-GCM + PBKDF2-SHA256 (310,000 rounds)',
      '',
      '  YOUR 24-CHARACTER RECOVERY KEY:',
      `  ${code}`,
      '',
      '  IMPORTANT:',
      '  - Keep this key in a safe place (print it or store on a USB).',
      '  - If you ever forget your PIN, click "Forgot PIN?" on the',
      '    Lock Screen and enter this exact 24-character key to',
      '    unlock all your GST invoices without losing any data.',
      '============================================================',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `BharatGST-Vault-Recovery-Key-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  if (!status) return null;

  return (
    <div>
      <h3 className="section-title" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={19} style={{ color: 'var(--primary)' }} />
        Local Login, Encrypted Vault &amp; Staff Roles (Option A)
        <HelpButton title="Encrypted Vault & Staff Roles" doc="settings#lock" size={16} />
      </h3>

      {/* Status Banner */}
      <div className={`notice ${status.encrypted ? 'notice-info' : 'notice-warn'}`} style={{ marginBottom: '0.9rem' }}>
        <span className="notice-icon">{status.encrypted ? '🔐' : '🔓'}</span>
        <div style={{ flex: 1 }}>
          {status.encrypted ? (
            <>
              <strong>AES-256-GCM Encrypted Vault is ACTIVE</strong> · PBKDF2-SHA256 (310,000 rounds) + Wrapped DEK + Recovery Key.
              {status.activeUser && (
                <span> Signed in as <strong>{status.activeUser.name}</strong> ({status.activeUser.role}).</span>
              )}
            </>
          ) : status.enabled ? (
            <>
              <strong>Basic Screen PIN is On</strong> (screen lock only — files are not encrypted yet). Upgrade to <strong>Encrypted Vault</strong> below for real AES-256 encryption, Recovery Key &amp; Staff Roles!
            </>
          ) : (
            <>
              <strong>Vault Lock is Off.</strong> Turn on <strong>Option A Encrypted Vault</strong> to protect all invoices &amp; client records with real AES-256-GCM encryption, PIN / Biometric Passkey unlock, a 24-character Recovery Key, and Owner / Accountant / Cashier / Viewer staff accounts — 100% free &amp; offline.
            </>
          )}
        </div>
      </div>

      {/* Primary Action Buttons */}
      {!mode && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {!status.encrypted && (
            <button type="button" className="btn btn-primary" onClick={() => setMode('setup-vault')}>
              <ShieldCheck size={16} /> {status.enabled ? 'Upgrade to Encrypted Vault' : 'Enable Encrypted Vault + PIN'}
            </button>
          )}
          {status.encrypted && (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setMode('change-pin')}>
                <KeyRound size={15} /> Change My PIN
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setMode('add-staff')}>
                <Plus size={15} /> Add Staff / Role PIN
              </button>
              {!hasPasskey ? (
                <button type="button" className="btn btn-secondary" onClick={handleEnrollPasskey}>
                  <Fingerprint size={15} /> Enable Fingerprint / Passkey
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    localStorage.removeItem(PASSKEY_CRED_KEY);
                    setHasPasskey(false);
                    toast('Passkey removed from this device', 'info');
                  }}
                >
                  <Fingerprint size={15} /> Remove Passkey
                </button>
              )}
            </>
          )}
          {status.enabled && (
            <>
              <button type="button" className="btn btn-secondary" onClick={lockNow}>
                <Lock size={15} /> Lock Now
              </button>
              <button type="button" className="btn btn-secondary" style={{ color: 'var(--danger)' }} onClick={() => setMode('disable-vault')}>
                Turn Off Lock
              </button>
            </>
          )}
        </div>
      )}

      {/* Setup Option A Encrypted Vault Form */}
      {mode === 'setup-vault' && (
        <form onSubmit={handleEnableVault} className="surface-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.92rem' }}>Set up Option A Encrypted Vault (AES-256-GCM)</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 0 }}>
            Creates an encrypted master key wrapped by your Owner PIN and generates your 24-character Recovery Key.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Owner Name</label>
              <input type="text" className="form-input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="e.g. Abhishek" required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">PIN Length</label>
              <select className="form-input" value={pinLength} onChange={(e) => { setPinLength(Number(e.target.value)); setPin(''); setConfirm(''); }}>
                <option value={4}>4 digits (Fast counter)</option>
                <option value={6}>6 digits (Recommended)</option>
                <option value={8}>8 digits (High security)</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Owner PIN ({pinLength} digits)</label>
              <input type="password" inputMode="numeric" className="form-input" maxLength={pinLength} value={pin} onChange={(e) => setPin(digits(e.target.value, pinLength))} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Confirm PIN</label>
              <input type="password" inputMode="numeric" className="form-input" maxLength={pinLength} value={confirm} onChange={(e) => setConfirm(digits(e.target.value, pinLength))} required />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Encrypting Vault…' : 'Enable Encrypted Vault & Generate Recovery Key'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

      {/* Change Vault PIN Form */}
      {mode === 'change-pin' && (
        <form onSubmit={handleChangeVaultPin} className="surface-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.65rem', fontSize: '0.92rem' }}>Change Vault PIN</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Current PIN</label>
              <input type="password" inputMode="numeric" className="form-input" maxLength={8} value={currentPin} onChange={(e) => setCurrentPin(digits(e.target.value, 8))} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">New PIN Digits</label>
              <select className="form-input" value={pinLength} onChange={(e) => { setPinLength(Number(e.target.value)); setPin(''); setConfirm(''); }}>
                <option value={4}>4 digits</option>
                <option value={6}>6 digits</option>
                <option value={8}>8 digits</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">New PIN</label>
              <input type="password" inputMode="numeric" className="form-input" maxLength={pinLength} value={pin} onChange={(e) => setPin(digits(e.target.value, pinLength))} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Confirm New PIN</label>
              <input type="password" inputMode="numeric" className="form-input" maxLength={pinLength} value={confirm} onChange={(e) => setConfirm(digits(e.target.value, pinLength))} required />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Updating…' : 'Save New PIN'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

      {/* Disable Vault Form */}
      {mode === 'disable-vault' && (
        <form onSubmit={handleDisableVault} className="surface-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.4rem', fontSize: '0.92rem' }}>Turn Off Vault Lock &amp; Decrypt Files</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 0 }}>
            Enter the Owner PIN to decrypt your records back to plain local storage and turn off the PIN screen.
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Owner PIN</label>
              <input type="password" inputMode="numeric" className="form-input" style={{ width: 170 }} maxLength={8} value={currentPin} onChange={(e) => setCurrentPin(digits(e.target.value, 8))} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Decrypting…' : 'Confirm & Turn Off'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

      {/* Add Staff User Form (L2) */}
      {mode === 'add-staff' && (
        <form onSubmit={handleAddStaff} className="surface-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.92rem' }}>Add Local Staff Account &amp; Role (Level 2)</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.75rem' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Staff Name</label>
              <input type="text" className="form-input" placeholder="e.g. Ramesh (Counter 1)" value={staffName} onChange={(e) => setStaffName(e.target.value)} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Role &amp; Permissions</label>
              <select className="form-input" value={staffRole} onChange={(e) => setStaffRole(e.target.value)}>
                {STAFF_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>{r.badge} {r.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">PIN Length</label>
              <select className="form-input" value={pinLength} onChange={(e) => { setPinLength(Number(e.target.value)); setPin(''); }}>
                <option value={4}>4 digits</option>
                <option value={6}>6 digits</option>
                <option value={8}>8 digits</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Staff PIN ({pinLength} digits)</label>
              <input type="password" inputMode="numeric" className="form-input" maxLength={pinLength} value={pin} onChange={(e) => setPin(digits(e.target.value, pinLength))} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Authorize with Owner PIN</label>
              <input type="password" inputMode="numeric" className="form-input" maxLength={8} value={currentPin} onChange={(e) => setCurrentPin(digits(e.target.value, 8))} required />
            </div>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.55rem 0 0' }}>
            {STAFF_ROLES.find((r) => r.id === staffRole)?.desc}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Create Staff Account'}</button>
            <button type="button" className="btn btn-secondary" onClick={resetForm} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

      {/* L2 Staff Accounts List + Auto-Lock Timer when enabled */}
      {status.enabled && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '0.9rem', marginTop: '0.5rem' }}>
          {status.encrypted && Array.isArray(status.users) && status.users.length > 0 && (
            <div className="surface-card" style={{ padding: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.55rem' }}>
                <Users size={16} style={{ color: 'var(--primary)' }} /> Local Users &amp; Staff Roles ({status.users.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {status.users.map((u) => {
                  const rInfo = STAFF_ROLES.find((r) => r.id === u.role) || STAFF_ROLES[0];
                  const isPrimaryOwner = u.role === 'owner' && status.users.filter((x) => x.role === 'owner').length <= 1;
                  return (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                          {rInfo.badge} {u.name}
                          {status.activeUser?.id === u.id && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: 'var(--success)' }}>● Active</span>}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {rInfo.label} · {u.length}-digit PIN
                        </div>
                      </div>
                      {!isPrimaryOwner && (
                        <button type="button" className="icon-btn icon-btn-red" title="Remove staff user" onClick={() => handleDeleteStaff(u)}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="surface-card" style={{ padding: '0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.55rem' }}>
              <Clock size={16} style={{ color: 'var(--primary)' }} /> Auto-Lock Security Timer
            </div>
            <div className="form-group" style={{ marginBottom: '0.55rem' }}>
              <label className="form-label" style={{ fontSize: '0.76rem' }}>Lock automatically when idle for</label>
              <select
                className="form-input"
                value={autoLockMinutes}
                onChange={(e) => handleAutoLockChange(Number(e.target.value), lockOnHidden)}
              >
                <option value={0}>Never (Manual Lock only)</option>
                <option value={2}>2 minutes</option>
                <option value={5}>5 minutes (Recommended)</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={lockOnHidden}
                onChange={(e) => handleAutoLockChange(autoLockMinutes, e.target.checked)}
              />
              <span>Lock immediately when browser tab / app is minimized</span>
            </label>
          </div>
        </div>
      )}

      {/* Mandatory 24-Char Recovery Key Modal right after enabling Vault */}
      {recoveryKeyModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <KeyRound size={20} style={{ color: 'var(--primary)' }} /> Save Your 24-Character Recovery Key!
            </h3>
            <div className="notice notice-warn" style={{ marginBottom: '0.85rem' }}>
              <span className="notice-icon">⚠️</span>
              <div style={{ fontSize: '0.8rem' }}>
                <strong>Important:</strong> Because your invoices are encrypted with real AES-256-GCM on your device, nobody (not even us) knows your PIN. If you ever forget your PIN, this <strong>Recovery Key</strong> is the ONLY way to unlock your bills.
              </div>
            </div>

            <div style={{
              padding: '0.9rem',
              borderRadius: 10,
              background: 'var(--bg-secondary)',
              border: '2px dashed var(--primary)',
              textAlign: 'center',
              fontFamily: 'monospace',
              fontSize: '1.05rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              color: 'var(--primary)',
              marginBottom: '0.85rem',
              userSelect: 'all',
            }}>
              {recoveryKeyModal}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(recoveryKeyModal);
                    toast('Recovery Key copied to clipboard!', 'success');
                  } catch { /* ignore */ }
                }}
              >
                <Copy size={15} /> Copy Key
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => {
                  downloadRecoveryCard(recoveryKeyModal);
                  setRecoverySavedAck(true);
                }}
              >
                <Download size={15} /> Download Recovery Key (.txt)
              </button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '0.85rem' }}>
              <input type="checkbox" checked={recoverySavedAck} onChange={(e) => setRecoverySavedAck(e.target.checked)} />
              <span>I have downloaded or written down this 24-character Recovery Key safely.</span>
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!recoverySavedAck}
                onClick={() => setRecoveryKeyModal('')}
              >
                Done — Close Window
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
