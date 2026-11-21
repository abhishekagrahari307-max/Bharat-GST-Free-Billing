// Complete Data Backup & Auto-Backup Center (Task 5)
// Displays Last Backup Date & Time, Days Since Backup, Next Scheduled Auto-Backup,
// CGST Sec. 36 (72-Month) Retention Tracker, Manual Plain (.json) & Encrypted (.fgsb)
// Backup/Restore/Verify, Auto-Backup Schedule (1/3/7/15/30 days + every N bills),
// Google Drive Auto-Backup + 1-Click Cloud Restore, and PC/Laptop Folder Auto-Sync.
import { useEffect, useRef, useState } from 'react';
import {
  Cloud, CloudOff, Download, Upload, ShieldCheck, Calendar, RefreshCw,
  FolderOpen, CheckCircle2, Trash2, AlertTriangle, RotateCcw, Lock,
} from 'lucide-react';
import {
  exportAllData,
  importData,
  getAllBills,
  getBackupsList,
  triggerBackup,
  restoreBackup,
  deleteBackup,
} from '../store';
import {
  initGoogleDrive,
  ensureToken,
  isConnected,
  disconnect,
  findOrCreateFolder,
  uploadJSON,
  listBackupsInFolder,
  downloadFileText,
  deleteDriveFile,
} from '../services/googleDrive';
import {
  readBackupSettings,
  saveBackupSettings,
  readBackupMeta,
  recordBackupCompleted,
  computeBackupHealth,
  computeGstRetentionInfo,
  parseAndVerifyBackupText,
  serializeBackupPayload,
  supportsBrowserFolderBackup,
  pickBrowserBackupDirectory,
  writeBackupToBrowserDirectory,
  AUTO_INTERVAL_OPTIONS,
  REMINDER_DAY_OPTIONS,
  RETENTION_COUNT_OPTIONS,
  BACKUP_EVENT,
} from '../utils/backupManager';
import { confirmAction } from './ConfirmModal';
import { toast } from './Toast';

export default function BackupCenter({ profile, onUpdateProfileField, onOpenLegacyExport, onOpenSelectiveImport }) {
  const [settings, setSettings] = useState(readBackupSettings);
  const [meta, setMeta] = useState(readBackupMeta);
  const [bills, setBills] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [driveConnected, setDriveConnected] = useState(isConnected);
  const [driveFiles, setDriveFiles] = useState([]);
  const [showDriveList, setShowDriveList] = useState(false);
  const [busy, setBusy] = useState('');

  // Encrypted .fgsb export/restore modal state
  const [showEncExport, setShowEncExport] = useState(false);
  const [encPassword, setEncPassword] = useState('');
  const [verifyReport, setVerifyReport] = useState(null);
  const restoreInputRef = useRef(null);
  const verifyInputRef = useRef(null);

  const loadAll = async () => {
    setSettings(readBackupSettings());
    setMeta(readBackupMeta());
    setDriveConnected(isConnected());
    const [bList, sList] = await Promise.all([
      getAllBills().catch(() => []),
      getBackupsList().catch(() => []),
    ]);
    setBills(Array.isArray(bList) ? bList : []);
    setSnapshots(Array.isArray(sList) ? sList : []);
  };

  useEffect(() => {
    loadAll();
    const onUpd = () => {
      setSettings(readBackupSettings());
      setMeta(readBackupMeta());
    };
    window.addEventListener(BACKUP_EVENT, onUpd);
    return () => window.removeEventListener(BACKUP_EVENT, onUpd);
  }, []);

  const health = computeBackupHealth(meta, settings, {
    billCount: bills.length,
    serverBackups: snapshots,
  });
  const retention = computeGstRetentionInfo(bills);

  const updateSetting = (patch) => {
    const next = saveBackupSettings(patch);
    setSettings(next);
  };

  // 1. Download Quick JSON Backup
  const handleQuickJsonBackup = async () => {
    setBusy('json');
    try {
      const payload = await exportAllData();
      const { fileName, content } = await serializeBackupPayload(payload, { encrypt: false });
      const blob = new Blob([content], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      await triggerBackup().catch(() => {});
      recordBackupCompleted({
        kind: 'manual-json',
        destination: 'Device Download (.json)',
        billCount: payload?.bills?.length || 0,
        clientCount: payload?.clients?.length || 0,
        encrypted: false,
        fileName,
      });
      await loadAll();
      toast(`Backup downloaded (${fileName})`, 'success');
    } catch (err) {
      toast('Backup failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setBusy('');
    }
  };

  // 2. Download Encrypted .fgsb Backup
  const handleEncryptedBackup = async (e) => {
    e.preventDefault();
    if (encPassword.trim().length < 4) {
      toast('Enter a password or PIN of at least 4 characters', 'warning');
      return;
    }
    setBusy('fgsb');
    try {
      const payload = await exportAllData();
      const { fileName, content } = await serializeBackupPayload(payload, {
        encrypt: true,
        passphrase: encPassword.trim(),
      });
      const blob = new Blob([content], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      recordBackupCompleted({
        kind: 'manual-fgsb',
        destination: 'Encrypted Vault File (.fgsb)',
        billCount: payload?.bills?.length || 0,
        clientCount: payload?.clients?.length || 0,
        encrypted: true,
        fileName,
      });
      setShowEncExport(false);
      setEncPassword('');
      await loadAll();
      toast(`AES-256 Encrypted backup downloaded (${fileName})!`, 'success');
    } catch (err) {
      toast(err.message || 'Could not encrypt backup', 'error');
    } finally {
      setBusy('');
    }
  };

  // 3. Restore or Verify (.json or .fgsb)
  const handleFilePicked = async (file, mode = 'restore') => {
    if (!file) return;
    try {
      const rawText = await file.text();
      let parsed;
      try {
        parsed = await parseAndVerifyBackupText(rawText, '');
      } catch (err) {
        if (err.code === 'password-required') {
          const pwd = window.prompt(`"${file.name}" is AES-256 encrypted (.fgsb). Enter its Backup Password / PIN:`);
          if (!pwd) return;
          parsed = await parseAndVerifyBackupText(rawText, pwd.trim());
        } else {
          throw err;
        }
      }

      if (mode === 'verify') {
        setVerifyReport({ fileName: file.name, ...parsed });
        toast('Backup verified! File is intact and readable.', 'success');
        return;
      }

      const ok = await confirmAction({
        title: `Restore backup "${file.name}"?`,
        message: `Found ${parsed.summary.bills} invoices, ${parsed.summary.clients} clients, and ${parsed.summary.products} products${parsed.encrypted ? ' (AES-256 Encrypted)' : ''}. Current data will be backed up first before restoring.`,
        confirmLabel: 'Restore Now',
        tone: 'warning',
      });
      if (!ok) return;

      setBusy('restore');
      await triggerBackup().catch(() => {});
      await importData(parsed.data, true);
      toast('Backup restored! Reloading workspace…', 'success');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      toast(err.message || 'Invalid or corrupted backup file', 'error');
    } finally {
      setBusy('');
    }
  };

  // 4. Google Drive Connect, Backup Now & Cloud Restore
  const clientId = String(profile?.googleClientId || '').trim();
  const driveFolderLabel = `${String(profile?.googleDriveFolder || 'Bharat GST Backups').trim()}`;

  const handleConnectDrive = async () => {
    if (!clientId) {
      toast('Paste your Google OAuth Client ID below first, then click Connect Google Drive.', 'warning', 7000);
      return;
    }
    setBusy('drive-connect');
    try {
      const res = await initGoogleDrive(clientId);
      if (res.success) {
        setDriveConnected(true);
        toast('Connected to Google Drive!', 'success');
      } else {
        toast('Google Drive sign-in cancelled or failed: ' + (res.error || ''), 'error');
      }
    } catch (err) {
      toast(err.message || 'Could not load Google Drive SDK (check internet)', 'error');
    } finally {
      setBusy('');
    }
  };

  const handleBackupToDriveNow = async () => {
    setBusy('drive-upload');
    try {
      if (!isConnected()) {
        const ok = await ensureToken(clientId);
        if (!ok) throw new Error('Connect Google Drive first');
        setDriveConnected(true);
      }
      const payload = await exportAllData();
      let encryptIt = false;
      let pass = '';
      if (settings.encryptAutoDrive) {
        pass = window.prompt('Enter Password / PIN to encrypt this Google Drive backup (.fgsb):') || '';
        if (!pass) { setBusy(''); return; }
        encryptIt = true;
      }
      const { fileName, content, encrypted } = await serializeBackupPayload(payload, {
        encrypt: encryptIt,
        passphrase: pass,
      });
      const folderId = await findOrCreateFolder(driveFolderLabel);
      await uploadJSON(fileName, content, folderId);
      recordBackupCompleted({
        kind: 'google-drive',
        destination: `Google Drive (${driveFolderLabel})`,
        billCount: payload?.bills?.length || 0,
        clientCount: payload?.clients?.length || 0,
        encrypted,
        fileName,
      });
      await loadAll();
      toast(`Uploaded "${fileName}" to Google Drive!`, 'success');
    } catch (err) {
      toast('Google Drive backup failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setBusy('');
    }
  };

  const handleBrowseDriveBackups = async () => {
    setBusy('drive-list');
    try {
      if (!isConnected()) {
        const ok = await ensureToken(clientId);
        if (!ok) throw new Error('Connect Google Drive first');
        setDriveConnected(true);
      }
      const folderId = await findOrCreateFolder(driveFolderLabel);
      const files = await listBackupsInFolder(folderId, 25);
      setDriveFiles(files);
      setShowDriveList(true);
    } catch (err) {
      toast(err.message || 'Could not fetch Google Drive backups', 'error');
    } finally {
      setBusy('');
    }
  };

  const handleRestoreFromDrive = async (file) => {
    setBusy(`drive-restore-${file.id}`);
    try {
      const rawText = await downloadFileText(file.id);
      let parsed;
      try {
        parsed = await parseAndVerifyBackupText(rawText, '');
      } catch (err) {
        if (err.code === 'password-required') {
          const pwd = window.prompt(`"${file.name}" is encrypted (.fgsb). Enter its Backup Password / PIN:`);
          if (!pwd) { setBusy(''); return; }
          parsed = await parseAndVerifyBackupText(rawText, pwd.trim());
        } else throw err;
      }
      const ok = await confirmAction({
        title: `Restore "${file.name}" from Google Drive?`,
        message: `Contains ${parsed.summary.bills} invoices, ${parsed.summary.clients} clients, ${parsed.summary.products} products. Current data will be snapshotted first.`,
        confirmLabel: 'Restore from Cloud',
        tone: 'warning',
      });
      if (!ok) { setBusy(''); return; }
      await triggerBackup().catch(() => {});
      await importData(parsed.data, true);
      toast('Restored from Google Drive! Reloading…', 'success');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      toast('Drive restore failed: ' + (err.message || ''), 'error');
    } finally {
      setBusy('');
    }
  };

  const handleDeleteDriveBackup = async (file) => {
    if (!await confirmAction({
      title: `Delete "${file.name}" from Google Drive?`,
      message: 'This deletes only this cloud backup copy from your Google Drive folder.',
      confirmLabel: 'Delete Cloud Copy',
      tone: 'danger',
    })) return;
    try {
      await deleteDriveFile(file.id);
      setDriveFiles((prev) => prev.filter((x) => x.id !== file.id));
      toast('Removed backup from Google Drive', 'info');
    } catch (err) {
      toast(err.message || 'Could not delete file', 'error');
    }
  };

  // 5. PC / Laptop Direct Folder Auto-Backup (OneDrive / Dropbox / Local Drive)
  const handlePickPcFolder = async () => {
    try {
      const handle = await pickBrowserBackupDirectory();
      updateSetting({ autoSyncLocalFolder: true });
      await loadAll();
      toast(`Folder "${handle.name}" connected for automatic PC backups!`, 'success');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        toast(err.message || 'Could not select folder', 'warning');
      }
    }
  };

  const handleSaveToPcFolderNow = async () => {
    setBusy('pc-folder');
    try {
      const payload = await exportAllData();
      const { fileName, content } = await serializeBackupPayload(payload, { encrypt: false });
      const folderName = await writeBackupToBrowserDirectory(fileName, content, { interactive: true });
      recordBackupCompleted({
        kind: 'pc-folder',
        destination: `PC Folder (${folderName})`,
        billCount: payload?.bills?.length || 0,
        clientCount: payload?.clients?.length || 0,
        encrypted: false,
        fileName,
      });
      await loadAll();
      toast(`Saved "${fileName}" into folder "${folderName}"!`, 'success');
    } catch (err) {
      toast(err.message || 'Pick a PC backup folder first', 'warning');
    } finally {
      setBusy('');
    }
  };

  // 6. On-Device Snapshot Now / Restore
  const handleSnapshotNow = async () => {
    setBusy('snap');
    try {
      await fetch('/api/backups/now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepLastCount: settings.keepLastCount }),
      });
      recordBackupCompleted({
        kind: 'auto-local',
        destination: 'On-Device Rolling Vault',
        billCount: bills.length,
      });
      await loadAll();
      toast('Instant on-device snapshot saved!', 'success');
    } catch (err) {
      toast('Snapshot failed: ' + err.message, 'error');
    } finally {
      setBusy('');
    }
  };

  const toneColors = {
    good: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.35)', text: 'var(--success, #059669)' },
    warn: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.38)', text: '#d97706' },
    danger: { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.38)', text: 'var(--danger, #dc2626)' },
  }[health.tone || 'good'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* 1. Live Backup Date, Days Elapsed & GST 72-Month Retention Status */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
        gap: '0.75rem',
      }}>
        <div style={{ padding: '0.9rem 1rem', borderRadius: 12, background: toneColors.bg, border: `1px solid ${toneColors.border}` }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: toneColors.text, display: 'flex', alignItems: 'center', gap: 5 }}>
            {health.tone === 'good' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            Last Backup Status
          </div>
          <div style={{ fontSize: '0.96rem', fontWeight: 800, marginTop: 4, color: 'var(--text)' }}>
            {health.hasBackup
              ? (health.daysSinceBackup === 0 ? 'Backed up Today' : `${health.daysSinceBackup} day${health.daysSinceBackup === 1 ? '' : 's'} ago`)
              : 'Never backed up'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {health.lastBackupFormatted}
          </div>
        </div>

        <div className="surface-card" style={{ padding: '0.9rem 1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Calendar size={14} /> Auto-Backup Schedule
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: 4 }}>
            {settings.autoBackupEnabled
              ? `Every ${settings.intervalDays} day${settings.intervalDays === 1 ? '' : 's'}`
              : 'Auto-Backup Off'}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {settings.autoBackupEnabled && health.nextAutoBackupDate
              ? `Next scheduled: ${health.nextAutoBackupDate}`
              : 'Turn on below for hands-free protection'}
          </div>
        </div>

        <div className="surface-card" style={{ padding: '0.9rem 1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <ShieldCheck size={14} style={{ color: 'var(--primary)' }} /> GST 72-Month Retention
          </div>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, marginTop: 4 }}>
            Keep until {retention.retainUntilDate}
          </div>
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>
            CGST Sec. 36 (6 yrs · FY {retention.latestFy})
          </div>
        </div>
      </div>

      {/* 2. Quick Backup, Encrypted .fgsb, Restore & Verify Bar */}
      <div className="surface-card" style={{ padding: '1rem' }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.6rem' }}>
          Manual Backup, Encrypted Vault File (<code>.fgsb</code>) &amp; Restore
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={handleQuickJsonBackup}>
            <Download size={15} /> {busy === 'json' ? 'Preparing…' : 'Download Full Backup (.json)'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => setShowEncExport((v) => !v)}>
            <Lock size={15} /> Encrypted Backup (.fgsb)
          </button>
          {onOpenLegacyExport && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenLegacyExport}>
              Selective Export…
            </button>
          )}
          {onOpenSelectiveImport && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenSelectiveImport}>
              Selective Restore…
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => restoreInputRef.current?.click()}>
            <Upload size={15} /> Restore File (.json / .fgsb)
          </button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => verifyInputRef.current?.click()}>
            <CheckCircle2 size={15} /> Verify Backup File
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json,.fgsb"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleFilePicked(f, 'restore'); }}
          />
          <input
            ref={verifyInputRef}
            type="file"
            accept=".json,.fgsb"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleFilePicked(f, 'verify'); }}
          />
        </div>

        {showEncExport && (
          <form onSubmit={handleEncryptedBackup} style={{ marginTop: '0.8rem', padding: '0.8rem', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px dashed var(--primary)', display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ margin: 0, flex: '1 1 220px' }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>Password / PIN for AES-256-GCM Encrypted <code>.fgsb</code> File</label>
              <input
                type="password"
                className="form-input"
                placeholder="Min 4 characters (needed to restore)"
                value={encPassword}
                onChange={(e) => setEncPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy === 'fgsb'}>
              {busy === 'fgsb' ? 'Encrypting…' : 'Download .fgsb'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowEncExport(false)}>Cancel</button>
          </form>
        )}

        {verifyReport && (
          <div className="notice notice-info" style={{ marginTop: '0.75rem' }}>
            <span className="notice-icon">✅</span>
            <div style={{ flex: 1, fontSize: '0.79rem' }}>
              <strong>Verified Backup: {verifyReport.fileName}</strong> {verifyReport.encrypted ? '(AES-256 Encrypted .fgsb)' : '(Plain JSON)'}<br />
              Invoices: <strong>{verifyReport.summary.bills}</strong> · Clients: <strong>{verifyReport.summary.clients}</strong> · Products: <strong>{verifyReport.summary.products}</strong> · Purchases: <strong>{verifyReport.summary.purchases}</strong> · Receipts: <strong>{verifyReport.summary.receipts}</strong>
              {verifyReport.exportedAt && ` · Exported: ${new Date(verifyReport.exportedAt).toLocaleString('en-IN')}`}
            </div>
            <button type="button" className="btn-link" style={{ fontSize: '0.74rem' }} onClick={() => setVerifyReport(null)}>Close</button>
          </div>
        )}
      </div>

      {/* 3. Auto-Backup Rules & Schedule */}
      <div className="surface-card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Automatic Backup Schedule &amp; Retention</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Runs automatically in the background based on days elapsed or number of new invoices created.
            </div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!settings.autoBackupEnabled}
              onChange={(e) => updateSetting({ autoBackupEnabled: e.target.checked })}
            />
            <span>Auto-Backup Enabled</span>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Auto-Backup Frequency</label>
            <select
              className="form-input"
              value={settings.intervalDays}
              onChange={(e) => updateSetting({ intervalDays: Number(e.target.value) })}
            >
              {AUTO_INTERVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Also Auto-Backup Every</label>
            <select
              className="form-input"
              value={settings.backupEveryNBills}
              onChange={(e) => updateSetting({ backupEveryNBills: Number(e.target.value) })}
            >
              <option value={0}>Scheduled days only</option>
              <option value={5}>Every 5 new bills</option>
              <option value={10}>Every 10 new bills</option>
              <option value={25}>Every 25 new bills</option>
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Alert If No Backup For</label>
            <select
              className="form-input"
              value={settings.remindAfterDays}
              onChange={(e) => updateSetting({ remindAfterDays: Number(e.target.value) })}
            >
              {REMINDER_DAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.75rem' }}>Snapshot Retention</label>
            <select
              className="form-input"
              value={settings.keepLastCount}
              onChange={(e) => updateSetting({ keepLastCount: Number(e.target.value) })}
            >
              {RETENTION_COUNT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* 4. Cloud & Folder Destinations: Google Drive + PC/Laptop Local Folder */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem' }}>
        {/* Google Drive Cloud Auto-Backup + Restore */}
        <div className="surface-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: '0.88rem' }}>
              {driveConnected ? <Cloud size={18} style={{ color: 'var(--success)' }} /> : <CloudOff size={18} style={{ color: 'var(--text-muted)' }} />}
              Google Drive Cloud Backup
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: driveConnected ? 'var(--success)' : 'var(--text-muted)' }}>
              {driveConnected ? '● Connected' : 'Not connected'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.45rem' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Google OAuth Client ID (e.g. 123...apps.googleusercontent.com)"
              value={profile?.googleClientId || ''}
              onChange={(e) => onUpdateProfileField?.('googleClientId', e.target.value)}
              style={{ fontSize: '0.78rem' }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Drive Folder Name (e.g. Bharat GST Backups)"
              value={profile?.googleDriveFolder || ''}
              onChange={(e) => onUpdateProfileField?.('googleDriveFolder', e.target.value)}
              style={{ fontSize: '0.78rem' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!settings.autoSyncGoogleDrive}
              onChange={(e) => updateSetting({ autoSyncGoogleDrive: e.target.checked })}
            />
            <span>Auto-upload scheduled backups to my Google Drive</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!settings.encryptAutoDrive}
              onChange={(e) => updateSetting({ encryptAutoDrive: e.target.checked })}
            />
            <span>Prompt to encrypt Drive uploads as <code>.fgsb</code></span>
          </label>

          {meta.lastGoogleDriveAt && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Last Google Drive sync: {new Date(meta.lastGoogleDriveAt).toLocaleString('en-IN')}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: 'auto', paddingTop: '0.25rem' }}>
            {!driveConnected ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={handleConnectDrive}>
                <Cloud size={14} /> {busy === 'drive-connect' ? 'Connecting…' : 'Connect Google Drive'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => { disconnect(); setDriveConnected(false); toast('Disconnected Google Drive', 'info'); }}
              >
                Disconnect
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={handleBackupToDriveNow}>
              <Upload size={14} /> {busy === 'drive-upload' ? 'Uploading…' : 'Backup to Drive Now'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={handleBrowseDriveBackups}>
              <RotateCcw size={14} /> {busy === 'drive-list' ? 'Loading…' : 'Restore from Drive'}
            </button>
          </div>
        </div>

        {/* PC / Laptop Folder Auto-Sync (OneDrive / Dropbox / USB / Local Disk) */}
        <div className="surface-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: '0.88rem' }}>
              <FolderOpen size={18} style={{ color: 'var(--primary)' }} />
              PC / OneDrive / Dropbox Folder Sync
            </div>
            {meta.localFolderName && (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success)' }}>
                📁 {meta.localFolderName}
              </span>
            )}
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
            Pick any folder on your Computer or Laptop (such as your <strong>OneDrive</strong>, <strong>Dropbox</strong>, <strong>Google Drive Desktop</strong>, or <strong>D:\Backups</strong> folder) to save automatic local copies.
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.78rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!settings.autoSyncLocalFolder}
              onChange={(e) => updateSetting({ autoSyncLocalFolder: e.target.checked })}
            />
            <span>Auto-save backups into chosen PC folder</span>
          </label>

          {meta.lastLocalFolderAt && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Last folder save: {new Date(meta.lastLocalFolderAt).toLocaleString('en-IN')}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', marginTop: 'auto', paddingTop: '0.25rem' }}>
            {supportsBrowserFolderBackup() ? (
              <>
                <button type="button" className="btn btn-primary btn-sm" onClick={handlePickPcFolder}>
                  <FolderOpen size={14} /> {meta.localFolderName ? 'Change PC Folder' : 'Choose Folder on PC'}
                </button>
                {meta.localFolderName && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={handleSaveToPcFolderNow}>
                    <Download size={14} /> Save to Folder Now
                  </button>
                )}
              </>
            ) : (
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Direct folder sync is supported on Chrome / Edge on Windows, Mac &amp; Linux (on phones, use Download Backup or Google Drive).
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 5. On-Device Rolling Snapshots List */}
      <div className="surface-card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>On-Device Daily Snapshots ({snapshots.length})</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
              Stored automatically inside your device vault — restore any date in 1 click.
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy === 'snap'} onClick={handleSnapshotNow}>
            <RefreshCw size={14} /> {busy === 'snap' ? 'Saving…' : 'Take Snapshot Now'}
          </button>
        </div>

        {snapshots.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
            No snapshots yet — click <strong>Take Snapshot Now</strong> or save an invoice to create today&apos;s snapshot.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.38rem', maxHeight: 220, overflowY: 'auto' }}>
            {snapshots.slice(0, 15).map((s) => (
              <div key={s.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.45rem 0.65rem', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.8rem' }}>
                  <strong>📅 {s.date}</strong>
                  {typeof s.billCount === 'number' && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{s.billCount} bills</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      if (!await confirmAction({
                        title: `Restore snapshot from ${s.date}?`,
                        message: 'Your current books will be backed up first before restoring this date.',
                        confirmLabel: 'Restore',
                        tone: 'warning',
                      })) return;
                      await restoreBackup(s.date);
                      toast(`Restored snapshot ${s.date}! Reloading…`, 'success');
                      setTimeout(() => window.location.reload(), 800);
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn-red"
                    title="Delete snapshot"
                    onClick={async () => {
                      await deleteBackup(s.date);
                      loadAll();
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Google Drive Cloud Restore Modal */}
      {showDriveList && (
        <div className="modal-overlay" onClick={() => setShowDriveList(false)}>
          <div className="modal-content" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 className="section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cloud size={19} style={{ color: 'var(--primary)' }} /> Google Drive Backups ({driveFiles.length})
              </h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowDriveList(false)}>Close</button>
            </div>
            {driveFiles.length === 0 ? (
              <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                No backup files found in Drive folder <strong>{driveFolderLabel}</strong> yet. Click <strong>Backup to Drive Now</strong> first.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '55vh', overflowY: 'auto' }}>
                {driveFiles.map((f) => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', padding: '0.55rem 0.75rem', borderRadius: 9, background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name.endsWith('.fgsb') ? '🔐 ' : '📄 '}{f.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        {f.createdTime ? new Date(f.createdTime).toLocaleString('en-IN') : ''}
                        {f.size ? ` · ${(Number(f.size) / 1024).toFixed(1)} KB` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!!busy}
                        onClick={() => handleRestoreFromDrive(f)}
                      >
                        {busy === `drive-restore-${f.id}` ? 'Restoring…' : 'Restore'}
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-red"
                        title="Delete from Drive"
                        onClick={() => handleDeleteDriveBackup(f)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
