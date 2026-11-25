// Honest Tracked Download & File-System Handoff Helper (v5.2.0)
// Enforces audit rules:
// 1. Anchor `<a download>` click ONLY initiates browser download — reports `DOWNLOAD_INITIATED`
//    ("File ready; browser download initiated"), NEVER claims disk save or portal filing!
// 2. Zero fake `setTimeout` progress delays — uses honest named phases or real counts.
// 3. Rejects 0-byte corrupted blobs by default and revokes object URLs safely without breaking slow Save-As dialogs.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

import {
  startOperation,
  updateOperation,
  addOperationDestinationOutcome,
  finishOperation,
} from './operationRegistry.js';

/**
 * Initiates a browser file download with honest Global Operation Registry tracking.
 */
export function triggerTrackedBrowserDownload({
  blob,
  content,
  mimeType = 'application/octet-stream',
  filename = 'export.txt',
  category = 'export',
  label = 'Export file',
  allowEmpty = false,
  existingOpId = null,
  portalAdvisory = '',
} = {}) {
  const opId =
    existingOpId ||
    startOperation({
      category,
      label,
      phase: 'Preparing download payload…',
      destination: 'Browser Download',
    });

  try {
    const finalBlob =
      blob instanceof Blob
        ? blob
        : new Blob([content ?? ''], { type: mimeType });

    if (!allowEmpty && finalBlob.size === 0) {
      throw new Error('Generated export file is empty (0 bytes).');
    }

    if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = String(filename || 'download');
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Keep object URL alive for 15s so Firefox/Safari Save-As prompts finish reading
      setTimeout(() => {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }, 15000);
    }

    const baseMsg = 'File ready; browser download initiated';
    const fullPhase = portalAdvisory ? `${baseMsg} · ${portalAdvisory}` : baseMsg;

    addOperationDestinationOutcome(opId, {
      destination: 'Browser Download',
      status: 'initiated',
      detail: `${finalBlob.size.toLocaleString('en-IN')} bytes handed to browser`,
    });

    finishOperation(opId, {
      status: 'success',
      outcome: 'DOWNLOAD_INITIATED',
      phase: fullPhase,
    });

    return { ok: true, opId, bytes: finalBlob.size, outcome: 'DOWNLOAD_INITIATED' };
  } catch (err) {
    finishOperation(opId, {
      status: 'failed',
      phase: 'Export failed before download could start',
      error: err,
    });
    throw err;
  }
}

/**
 * Runs an async export builder while tracking honest phases (and optional real item counts),
 * then hands the resulting `{ blob | content, filename, mimeType }` to `triggerTrackedBrowserDownload`.
 */
export async function runTrackedExportJob({
  category = 'export',
  label = 'Export',
  total = null,
  portalAdvisory = '',
  buildFn,
} = {}) {
  const opId = startOperation({
    category,
    label,
    phase: 'Validating & building data…',
    destination: 'Browser Download',
    total,
    completed: total ? 0 : null,
  });

  try {
    const result = await buildFn({
      opId,
      setPhase: (phase) => updateOperation(opId, { phase }),
      setProgress: (completed, nextTotal) =>
        updateOperation(opId, {
          completed,
          ...(nextTotal !== undefined ? { total: nextTotal } : {}),
        }),
    });

    if (!result) {
      finishOperation(opId, { status: 'cancelled', phase: 'Export cancelled' });
      return { ok: false, cancelled: true, opId };
    }

    return triggerTrackedBrowserDownload({
      ...result,
      category,
      label,
      existingOpId: opId,
      portalAdvisory: result.portalAdvisory || portalAdvisory,
    });
  } catch (err) {
    finishOperation(opId, {
      status: 'failed',
      phase: 'Failed during export generation',
      error: err,
    });
    throw err;
  }
}
