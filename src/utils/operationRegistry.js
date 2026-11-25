// Global Concurrent Operation Registry (v5.2.0 — Honest Progress & Privacy-Safe Activity Engine)
// Enforces strict audit rules:
// 1. ZERO fake timers or fabricated percentages — `percent` exists ONLY when deterministic `total > 0` is provided.
// 2. Failure / Cancelled NEVER reports 100% — retains actual completed progress or `null` (indeterminate).
// 3. Privacy-first redaction — strips GSTINs, PANs, 10-digit phones, PINs, and recovery keys from labels/errors.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

const operations = new Map();
const listeners = new Set();
let seqCounter = 0;

const MAX_FINISHED_HISTORY = 12;

/**
 * Redacts sensitive taxpayer identifiers (GSTIN, PAN, Phone, PIN, Recovery Codes) from UI/log text.
 */
export function sanitizeOperationText(raw = '') {
  return String(raw || '')
    // 15-char Indian GSTIN
    .replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi, '[GSTIN]')
    // 10-char Indian PAN
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[PAN]')
    // 24-char grouped recovery codes (XXXX-XXXX-XXXX-XXXX-XXXX-XXXX)
    .replace(/\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){4,5}\b/gi, '[REDACTED-KEY]')
    // URL or inline PIN / password / passphrase parameters
    .replace(/([?&](?:pin|password|passphrase)=)[^&\s]+/gi, '$1[PIN]')
    .replace(/\b(pin\s*[:=]\s*)\d{4,8}\b/gi, '$1[PIN]')
    .replace(/\b((?:password|passphrase|secret)\s*[:=]\s*)\S+/gi, '$1[REDACTED-KEY]')
    // 10-digit Indian mobile numbers
    .replace(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, '[PHONE]')
    .trim();
}

function computeHonestPercent(status, completed, total) {
  if (typeof completed !== 'number' || typeof total !== 'number' || !(total > 0)) {
    return null; // Indeterminate — never invent percentages!
  }
  const clampedDone = Math.max(0, Math.min(total, completed));
  const rawPct = Math.round((clampedDone / total) * 100);
  // Never report 100% if the operation failed, partially failed, or was cancelled!
  if ((status === 'failed' || status === 'cancelled' || status === 'partial') && rawPct >= 100) {
    return Math.min(99, Math.max(0, Math.floor(((clampedDone - 0.5) / total) * 100)));
  }
  return rawPct;
}

function pruneFinishedHistory() {
  const finished = [...operations.values()]
    .filter((op) => op.status === 'success' || op.status === 'failed' || op.status === 'partial' || op.status === 'cancelled')
    .sort((a, b) => (a.finishedAtMs || 0) - (b.finishedAtMs || 0));

  while (finished.length > MAX_FINISHED_HISTORY) {
    const oldest = finished.shift();
    if (oldest) operations.delete(oldest.id);
  }
}

function emitChange() {
  const snapshot = getOperationsSnapshot();
  for (const fn of listeners) {
    try {
      fn(snapshot);
    } catch { /* ignore listener error */ }
  }
}

export function getOperationById(id) {
  return operations.get(id) || null;
}

export function getOperationsSnapshot() {
  return [...operations.values()].sort((a, b) => b.startedAtMs - a.startedAtMs);
}

export function subscribeOperations(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  listener(getOperationsSnapshot());
  return () => listeners.delete(listener);
}

/**
 * Registers and starts a new tracked operation.
 */
export function startOperation({
  category = 'general',
  label = 'Processing…',
  phase = 'Starting…',
  destination = 'Browser',
  total = null,
  completed = null,
  onCancel = null,
} = {}) {
  seqCounter += 1;
  const now = Date.now();
  const id = `op-${now}-${seqCounter}`;
  const hasCount = typeof total === 'number' && total > 0;
  const initCompleted = hasCount ? Math.max(0, Number(completed) || 0) : null;
  const initTotal = hasCount ? total : null;

  const record = {
    id,
    category: String(category || 'general'),
    label: sanitizeOperationText(label) || 'Operation',
    status: 'running',
    phase: sanitizeOperationText(phase) || 'In progress…',
    destination: sanitizeOperationText(destination),
    completed: initCompleted,
    total: initTotal,
    indeterminate: !hasCount,
    percent: computeHonestPercent('running', initCompleted, initTotal),
    outcome: null,
    destinations: [],
    summary: null,
    error: null,
    cancellable: typeof onCancel === 'function',
    _onCancel: typeof onCancel === 'function' ? onCancel : null,
    startedAt: new Date(now).toISOString(),
    startedAtMs: now,
    finishedAt: null,
    finishedAtMs: null,
  };

  operations.set(id, record);
  pruneFinishedHistory();
  emitChange();
  return id;
}

/**
 * Updates phase, deterministic `completed`/`total` counts, or `waiting`/`queued` status.
 */
export function updateOperation(id, patch = {}) {
  const cur = operations.get(id);
  if (!cur) return null;

  const nextStatus = patch.status || cur.status;
  const nextTotal = patch.total !== undefined ? patch.total : cur.total;
  const hasCount = typeof nextTotal === 'number' && nextTotal > 0;
  const rawCompleted = patch.completed !== undefined ? patch.completed : cur.completed;
  // Monotonic guard when total stays the same
  const nextCompleted = hasCount
    ? Math.max(
        nextTotal === cur.total && typeof cur.completed === 'number' ? cur.completed : 0,
        Math.min(nextTotal, Number(rawCompleted) || 0)
      )
    : null;

  const updated = {
    ...cur,
    status: nextStatus,
    phase: patch.phase !== undefined ? sanitizeOperationText(patch.phase) : cur.phase,
    label: patch.label !== undefined ? sanitizeOperationText(patch.label) : cur.label,
    destination: patch.destination !== undefined ? sanitizeOperationText(patch.destination) : cur.destination,
    completed: nextCompleted,
    total: hasCount ? nextTotal : null,
    indeterminate: !hasCount,
    percent: computeHonestPercent(nextStatus, nextCompleted, hasCount ? nextTotal : null),
    summary: patch.summary !== undefined ? patch.summary : cur.summary,
  };

  operations.set(id, updated);
  emitChange();
  return updated;
}

/**
 * Appends a destination-specific outcome (e.g. Browser Download vs Folder Write vs Google Drive vs P2P ACK).
 */
export function addOperationDestinationOutcome(id, { destination, status = 'info', detail = '' } = {}) {
  const cur = operations.get(id);
  if (!cur) return null;
  const entry = {
    destination: sanitizeOperationText(destination || 'Destination'),
    status, // 'verified' | 'initiated' | 'skipped' | 'failed' | 'waiting'
    detail: sanitizeOperationText(detail),
    at: new Date().toISOString(),
  };
  const updated = {
    ...cur,
    destinations: [...cur.destinations, entry],
  };
  operations.set(id, updated);
  emitChange();
  return updated;
}

/**
 * Completes an operation (`status`: `'success'` | `'partial'` | `'failed'` | `'cancelled'`).
 * Never inflates failed/cancelled/partial jobs to 100%.
 */
export function finishOperation(
  id,
  {
    status = 'success',
    phase,
    outcome = null,
    completed,
    total,
    summary = null,
    error = null,
  } = {}
) {
  const cur = operations.get(id);
  if (!cur) return null;
  const now = Date.now();

  const finalTotal = total !== undefined ? total : cur.total;
  const hasCount = typeof finalTotal === 'number' && finalTotal > 0;
  let finalCompleted = cur.completed;
  if (hasCount) {
    if (completed !== undefined && completed !== null) {
      finalCompleted = Math.max(0, Math.min(finalTotal, Number(completed) || 0));
    } else if (status === 'success') {
      finalCompleted = finalTotal;
    }
  } else {
    finalCompleted = null;
  }

  const defaultPhase =
    status === 'success'
      ? 'Completed'
      : status === 'partial'
        ? 'Completed with warnings / skipped items'
        : status === 'cancelled'
          ? 'Cancelled by user'
          : 'Operation failed';

  const updated = {
    ...cur,
    status,
    phase: sanitizeOperationText(phase || defaultPhase),
    completed: finalCompleted,
    total: hasCount ? finalTotal : null,
    indeterminate: !hasCount,
    percent:
      status === 'success' && !hasCount
        ? 100
        : computeHonestPercent(status, finalCompleted, hasCount ? finalTotal : null),
    outcome,
    summary: summary !== null ? summary : cur.summary,
    error: error ? sanitizeOperationText(error?.message || String(error)) : null,
    cancellable: false,
    _onCancel: null,
    finishedAt: new Date(now).toISOString(),
    finishedAtMs: now,
  };

  operations.set(id, updated);
  pruneFinishedHistory();
  emitChange();
  return updated;
}

export function cancelOperation(id) {
  const cur = operations.get(id);
  if (!cur || !cur.cancellable || typeof cur._onCancel !== 'function') return false;
  try {
    cur._onCancel();
  } catch { /* ignore */ }
  finishOperation(id, {
    status: 'cancelled',
    phase: 'Cancelled safely by user',
  });
  return true;
}

export function dismissOperation(id) {
  const cur = operations.get(id);
  if (!cur) return;
  if (cur.status === 'running' || cur.status === 'queued') return;
  operations.delete(id);
  emitChange();
}

export function clearFinishedOperations() {
  for (const [id, op] of operations.entries()) {
    if (op.status !== 'running' && op.status !== 'queued' && op.status !== 'waiting') {
      operations.delete(id);
    }
  }
  emitChange();
}

export function resetAllOperationsForTest() {
  operations.clear();
  emitChange();
}
