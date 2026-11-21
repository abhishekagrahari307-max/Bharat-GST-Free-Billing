// Option A — App Lock Gate (AES-256-GCM Encrypted Vault + Staff Roles + Recovery Key + Auto-Lock)
// Supports both Option A Encrypted Vault (PBKDF2 310k -> AES-256-GCM, 24-char Recovery Code,
// Multi-User Staff Roles, Biometric Passkey unlock, Auto-Lock inactivity timer) and the
// legacy plain PIN screen lock.
import { useEffect, useRef, useState } from 'react';
import { Lock, ShieldCheck, KeyRound, Fingerprint, UserCheck } from 'lucide-react';
import HelpButton from './HelpButton';
import { getLockStatus, verifyPin, recoverVaultPin, openResetFolder } from '../store';
import {
  UNLOCKED_KEY,
  PASSKEY_CRED_KEY,
  LOCK_EVENT,
  LOCK_CHANGED_EVENT,
  setActiveStaffUser,
  lockNow,
} from '../utils/appLock';
import { STAFF_ROLES } from '../utils/localLock';
import { TROUBLESHOOTING_URL } from '../utils/errorReport';

function ForgotPinLegacy({ folder, os, onUnlock }) {
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(false);
  const mac = os === 'darwin';
  const linux = os === 'linux';
  const fileCmd = folder ? `touch "${folder}/RESET-PIN"` : '';
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  const openFolder = async () => {
    setNote('');
    try { await openResetFolder(); } catch { setNote('The folder could not be opened. Open it yourself: the path is above.'); }
  };
  const check = async () => {
    setNote('');
    try {
      const s = await getLockStatus();
      if (!s.enabled) onUnlock();
      else setNote('The file is not there yet. Check that it is in the folder above and named RESET-PIN, then click again.');
    } catch { setNote('Could not check. Is the app still running?'); }
  };
  if (!folder) {
    return (
      <div className="app-lock-help">
        <p>Forgot your screen PIN? Clear site lock or open on the main computer and click <strong>Forgot PIN?</strong>. Your invoices are untouched.</p>
        <p><a href={`${TROUBLESHOOTING_URL}#pin-forgotten`} target="_blank" rel="noopener noreferrer">Read the full steps</a></p>
      </div>
    );
  }
  return (
    <div className="app-lock-help">
      <p>Remove the screen PIN on this computer in four steps. Your invoices are not touched.</p>
      <ol>
        <li>
          Open this folder:
          <code className="app-lock-path">{folder}</code>
          <span className="app-lock-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={openFolder}>Open the folder</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(folder)}>{copied ? 'Copied' : 'Copy the path'}</button>
          </span>
        </li>
        {mac || linux ? (
          <li>
            Make an empty file named <strong>RESET-PIN</strong>:
            <code className="app-lock-path">{fileCmd}</code>
          </li>
        ) : (
          <li>Right-click inside that folder → <strong>New</strong> → <strong>Text Document</strong> → name it <strong>RESET-PIN</strong>.</li>
        )}
        <li>
          Click below once created:
          <span className="app-lock-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={check}>I made the file: open the app</button>
          </span>
        </li>
      </ol>
      {note && <p className="app-lock-error" role="alert">{note}</p>}
    </div>
  );
}

function RecoveryKeyUnlock({ onRecovered, onCancel }) {
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleRecover = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4,8}$/.test(newPin)) {
      setError('New Owner PIN must be 4 to 8 digits.');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PIN and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await recoverVaultPin({ recoveryCode: code, newPin });
      onRecovered(res?.user || null);
    } catch (err) {
      if (err.status === 429) setError(`Too many wrong tries. Wait ${err.body?.wait || 30}s.`);
      else setError(err.message || 'Invalid 24-character Recovery Code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-lock-help" style={{ textAlign: 'left', marginTop: '0.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, marginBottom: '0.35rem', color: 'var(--primary)' }}>
        <KeyRound size={16} /> Unlock Vault with Recovery Code
      </div>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 0 }}>
        Enter the 24-character Recovery Key saved when you enabled Option A Encrypted Vault. Your invoices stay 100% intact.
      </p>
      <form onSubmit={handleRecover} style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        <div>
          <label className="form-label" style={{ fontSize: '0.74rem' }}>24-Character Recovery Key</label>
          <input
            type="text"
            className="form-input"
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.74rem' }}>New Owner PIN (4–8 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              className="form-input"
              maxLength={8}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              required
            />
          </div>
          <div>
            <label className="form-label" style={{ fontSize: '0.74rem' }}>Confirm New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              className="form-input"
              maxLength={8}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              required
            />
          </div>
        </div>
        {error && <p className="app-lock-error" style={{ margin: 0 }} role="alert">{error}</p>}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel} disabled={busy}>Back</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? 'Unlocking…' : 'Recover & Set New PIN'}
          </button>
        </div>
      </form>
    </div>
  );
}

function LockScreen({ lock, onUnlock }) {
  const users = Array.isArray(lock.users) && lock.users.length > 0 ? lock.users : null;
  const [selectedUserId, setSelectedUserId] = useState(() => users?.[0]?.id || '');
  const activeTarget = users?.find((u) => u.id === selectedUserId) || users?.[0] || null;
  const expectedLen = activeTarget?.length || lock.length || 6;

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const input = useRef(null);

  const savedPasskey = (() => {
    try { return JSON.parse(localStorage.getItem(PASSKEY_CRED_KEY) || 'null'); } catch { return null; }
  })();

  const submit = async (value, uid = selectedUserId) => {
    if (busy || !value) return;
    setBusy(true);
    try {
      const res = await verifyPin(value, uid || null);
      onUnlock(res?.user || activeTarget || null);
    } catch (err) {
      setPin('');
      if (err.status === 429) setError(`Too many wrong tries. Wait ${err.body?.wait || 30} seconds and try again.`);
      else if (err.status === 401) {
        const left = err.body?.triesLeft;
        setError(`Wrong PIN.${typeof left === 'number' ? ` (${left} tries left before cooldown)` : ' Try again.'}`);
      } else {
        setError('Could not verify PIN. Please try again.');
      }
      setTimeout(() => input.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  };

  const handlePasskeyUnlock = async () => {
    if (!savedPasskey?.credId || !savedPasskey?.wrappedPin || !window.PublicKeyCredential) return;
    setBusy(true);
    setError('');
    try {
      const rawId = Uint8Array.from(atob(savedPasskey.credId), (c) => c.charCodeAt(0));
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [{ id: rawId, type: 'public-key' }],
          userVerification: 'required',
          timeout: 45000,
        },
      });
      if (assertion) {
        const decodedPin = atob(savedPasskey.wrappedPin);
        await submit(decodedPin, savedPasskey.userId || selectedUserId);
      }
    } catch {
      setError('Biometric / Passkey check cancelled or unavailable — enter PIN below.');
    } finally {
      setBusy(false);
    }
  };

  const onChange = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, expectedLen);
    setPin(v);
    setError('');
    if (v.length === expectedLen) submit(v, selectedUserId);
  };

  const roleBadgeOf = (roleId) => STAFF_ROLES.find((r) => r.id === roleId)?.badge || '👤';

  return (
    <div className="app-lock-screen">
      <div className="glass-panel app-lock-card" style={{ maxWidth: 430 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: '50%', background: 'var(--primary-light, rgba(37,99,235,0.12))', color: 'var(--primary)', marginBottom: '0.35rem' }}>
          {lock.encrypted ? <ShieldCheck size={28} /> : <Lock size={26} />}
        </div>

        <h1 style={{ marginBottom: '0.2rem' }}>
          {lock.encrypted ? 'Unlock Encrypted Vault' : 'Enter your PIN'}{' '}
          <HelpButton title="Vault Lock & Recovery" doc="troubleshooting#pin-forgotten" size={16} />
        </h1>
        <p className="text-muted" style={{ margin: '0 0 0.75rem', fontSize: '0.82rem' }}>
          {lock.encrypted
            ? 'AES-256-GCM Local Encryption Active — Data stays 100% on your device'
            : 'Bharat GST Free Billing is locked.'}
        </p>

        {/* Staff Role / User Switcher (L2) */}
        {users && users.length > 0 && (
          <div style={{ marginBottom: '0.8rem', width: '100%' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <UserCheck size={13} /> Sign in as
            </div>
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {users.map((u) => {
                const active = u.id === (activeTarget?.id || '');
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => { setSelectedUserId(u.id); setPin(''); setError(''); input.current?.focus(); }}
                    className={`industry-preset-chip${active ? ' active' : ''}`}
                    style={{ fontSize: '0.76rem', padding: '0.32rem 0.7rem' }}
                  >
                    <span>{roleBadgeOf(u.role)}</span>
                    <span>{u.name}</span>
                    <span style={{ opacity: 0.78, fontSize: '0.68rem', textTransform: 'capitalize' }}>({u.role})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); if (pin.length >= 4) submit(pin, selectedUserId); }} style={{ width: '100%' }}>
          <input
            ref={input}
            className="form-input app-lock-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            aria-label={`${expectedLen} digit PIN`}
            placeholder={'•'.repeat(expectedLen)}
            value={pin}
            onChange={onChange}
            disabled={busy}
            maxLength={expectedLen}
          />
          {error && <p className="app-lock-error" role="alert">{error}</p>}

          {savedPasskey?.credId && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePasskeyUnlock}
              disabled={busy}
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.45rem', gap: 6 }}
            >
              <Fingerprint size={17} /> Unlock with Fingerprint / Passkey
            </button>
          )}
        </form>

        <button type="button" className="app-lock-link" style={{ marginTop: '0.6rem' }} onClick={() => setShowHelp((v) => !v)}>
          {lock.encrypted ? 'Forgot PIN? Use 24-Char Recovery Key' : 'Forgot PIN?'}
        </button>

        {showHelp && (
          lock.encrypted
            ? <RecoveryKeyUnlock onRecovered={(u) => onUnlock(u)} onCancel={() => setShowHelp(false)} />
            : <ForgotPinLegacy folder={lock.resetFolder} os={lock.os} onUnlock={() => onUnlock(null)} />
        )}

        <div style={{ marginTop: '1rem', paddingTop: '0.65rem', borderTop: '1px solid var(--border)', width: '100%', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          Bharat GST Free Billing · Created by <strong>Abhishek Agrahari</strong>
        </div>
      </div>
    </div>
  );
}

export default function AppLockGate({ children }) {
  const [lock, setLock] = useState({
    checked: false,
    enabled: false,
    encrypted: false,
    length: 6,
    users: [],
    autoLockMinutes: 5,
    lockOnHidden: false,
    resetFolder: null,
    os: '',
  });
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(UNLOCKED_KEY) === '1'; } catch { return false; }
  });
  const [shown, setShown] = useState(unlocked);

  const refreshLockState = (isRelock = false) => {
    getLockStatus()
      .then((s) => {
        const nextLock = {
          checked: true,
          enabled: !!s.enabled,
          encrypted: !!s.encrypted,
          length: Number(s.length) || 6,
          users: Array.isArray(s.users) ? s.users : [],
          autoLockMinutes: Number(s.autoLockMinutes ?? 5),
          lockOnHidden: !!s.lockOnHidden,
          resetFolder: s.resetFolder || null,
          os: s.os || '',
        };
        setLock(nextLock);
        if (!s.enabled) {
          setShown(true);
          setUnlocked(true);
          return;
        }
        // When Option A Encrypted Vault is enabled, backend memory MUST also hold the unlocked DEK
        if (isRelock || (s.encrypted && s.unlocked === false)) {
          setUnlocked(false);
        } else if (s.activeUser) {
          setActiveStaffUser(s.activeUser);
        }
      })
      .catch(() => {
        setLock((l) => ({ ...l, checked: true }));
        setShown(true);
      });
  };

  useEffect(() => {
    refreshLockState(false);
    const onRelock = () => refreshLockState(true);
    const onChanged = () => refreshLockState(false);
    window.addEventListener(LOCK_EVENT, onRelock);
    window.addEventListener(LOCK_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(LOCK_EVENT, onRelock);
      window.removeEventListener(LOCK_CHANGED_EVENT, onChanged);
    };
  }, []);

  // Auto-Lock on inactivity (e.g. 5 min) + optional lock on tab hide
  useEffect(() => {
    if (!lock.enabled || !unlocked) return undefined;
    const mins = Number(lock.autoLockMinutes) || 0;
    let timer = null;
    const resetIdle = () => {
      if (timer) clearTimeout(timer);
      if (mins > 0) {
        timer = setTimeout(() => {
          lockNow();
        }, mins * 60 * 1000);
      }
    };
    const onVis = () => {
      if (document.hidden && lock.lockOnHidden) {
        lockNow();
      }
    };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    if (mins > 0) {
      resetIdle();
      events.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
    }
    if (lock.lockOnHidden) {
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      if (timer) clearTimeout(timer);
      events.forEach((ev) => window.removeEventListener(ev, resetIdle));
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [lock.enabled, lock.autoLockMinutes, lock.lockOnHidden, unlocked]);

  if (!lock.checked) return null;
  const locked = lock.enabled && !unlocked;
  const onUnlock = (user) => {
    try { sessionStorage.setItem(UNLOCKED_KEY, '1'); } catch { /* storage blocked */ }
    if (user) setActiveStaffUser(user);
    setUnlocked(true);
    setShown(true);
  };

  if (locked && !shown) return <LockScreen lock={lock} onUnlock={onUnlock} />;
  return (
    <>
      <div style={{ display: locked ? 'none' : 'contents' }} aria-hidden={locked || undefined}>{children}</div>
      {locked && <LockScreen lock={lock} onUnlock={onUnlock} />}
    </>
  );
}
