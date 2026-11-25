import { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Mic,
  QrCode,
  Banknote,
  CheckCircle2,
  X,
  Copy,
  IndianRupee,
} from 'lucide-react';
import QRCode from 'qrcode';
import { formatCurrency } from '../utils';
import {
  resolveMerchantUpiDetails,
  buildDynamicCounterUpiUri,
  suggestQuickTenderAmounts,
  computeCashTenderBreakdown,
} from '../utils/expressPosEngine';
import { toast } from './Toast';

const QUICK_COUNTER_UPI_KEY = 'fgsb_quick_counter_upi_v1';

export default function ExpressPosCounterBar({
  profile = {},
  selectedAccountId = null,
  invoiceNumber = '',
  clientName = '',
  billTotal = 0,
  receivableNow = 0,
  currency = 'INR',
  canReceiveNow = false,
  readOnlyDoc = false,
  onWalkInCashSale,
  onOpenVoiceModal,
  onApplyPaymentNow,
}) {
  const [activeTool, setActiveTool] = useState(null); // null | 'CASH' | 'UPI'
  const [cashInput, setCashInput] = useState('');
  const [fallbackUpi, setFallbackUpi] = useState(() => {
    try {
      return localStorage.getItem(QUICK_COUNTER_UPI_KEY) || '';
    } catch {
      return '';
    }
  });
  const [qrDataUrl, setQrDataUrl] = useState('');

  const amountDueNow = useMemo(() => {
    const r = Number(receivableNow);
    const t = Number(billTotal);
    if (Number.isFinite(r) && r > 0) return r;
    return Number.isFinite(t) && t > 0 ? t : 0;
  }, [receivableNow, billTotal]);

  const merchantUpi = useMemo(() => {
    const resolved = resolveMerchantUpiDetails(profile, selectedAccountId);
    if (resolved.isValid) return resolved;
    if (fallbackUpi.trim()) {
      return {
        upiId: fallbackUpi.trim(),
        isValid: /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z0-9.-]{2,32}$/.test(fallbackUpi.trim()),
        payeeName: resolved.payeeName,
        accountLabel: 'Counter Quick UPI',
      };
    }
    return resolved;
  }, [profile, selectedAccountId, fallbackUpi]);

  const upiUri = useMemo(() => {
    if (!merchantUpi.isValid) return '';
    return buildDynamicCounterUpiUri({
      upiId: merchantUpi.upiId,
      payeeName: merchantUpi.payeeName,
      amount: amountDueNow,
      invoiceNumber,
    });
  }, [merchantUpi, amountDueNow, invoiceNumber]);

  useEffect(() => {
    let alive = true;
    if (activeTool !== 'UPI' || !upiUri) {
      setQrDataUrl('');
      return () => { alive = false; };
    }
    QRCode.toDataURL(upiUri, {
      width: 240,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (alive) setQrDataUrl(url);
      })
      .catch(() => {
        if (alive) setQrDataUrl('');
      });
    return () => {
      alive = false;
    };
  }, [activeTool, upiUri]);

  const quickTenders = useMemo(
    () => suggestQuickTenderAmounts(amountDueNow),
    [amountDueNow]
  );

  const tenderCalc = useMemo(
    () => computeCashTenderBreakdown(amountDueNow, Number(cashInput) || 0),
    [amountDueNow, cashInput]
  );

  if (readOnlyDoc) return null;

  const isInr = !currency || currency === 'INR';

  const handleSaveFallbackUpi = (val) => {
    setFallbackUpi(val);
    try {
      localStorage.setItem(QUICK_COUNTER_UPI_KEY, val.trim());
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="pro-card no-print"
      data-testid="express-pos-bar"
      style={{
        padding: '0.68rem 0.9rem',
        marginBottom: '0.85rem',
        borderLeft: '3.5px solid var(--brand-primary, #4f46e5)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.55rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 7,
              background: 'var(--brand-primary-soft, #eef2ff)',
              color: 'var(--brand-primary, #4f46e5)',
              flexShrink: 0,
            }}
          >
            <Zap size={14} />
          </span>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
              Express POS Counter
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {amountDueNow > 0
                ? `Collect ${formatCurrency(amountDueNow, currency)} · 1-Click Walk-in, Cash Change & Live UPI QR`
                : 'Quick Walk-in Cash Sale, AI Voice Dictation & Counter Checkout'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          {onWalkInCashSale && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => {
                onWalkInCashSale();
                toast(
                  clientName?.trim()
                    ? 'Marked full payment received in Cash'
                    : 'Walk-in Customer filled & marked Cash Paid!',
                  'success'
                );
              }}
              title="Fill Walk-in Customer (if empty) and mark full bill received in Cash"
            >
              <Zap size={13} color="#d97706" /> Walk-In Cash
            </button>
          )}

          {onOpenVoiceModal && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={onOpenVoiceModal}
              title="Speak items in Hindi, Hinglish or English to auto-fill rows"
            >
              <Mic size={13} color="#4f46e5" /> Voice Bill
            </button>
          )}

          {canReceiveNow && (
            <button
              type="button"
              className={activeTool === 'CASH' ? 'btn btn-primary btn-xs' : 'btn btn-secondary btn-xs'}
              onClick={() => {
                const next = activeTool === 'CASH' ? null : 'CASH';
                setActiveTool(next);
                if (next === 'CASH' && !cashInput && amountDueNow > 0) {
                  setCashInput(String(quickTenders[1] || quickTenders[0] || amountDueNow));
                }
              }}
              title="Calculate exact change to return to customer with Indian note breakup"
            >
              <Banknote size={13} color={activeTool === 'CASH' ? '#ffffff' : '#059669'} /> Cash Change
            </button>
          )}

          {isInr && (
            <button
              type="button"
              className={activeTool === 'UPI' ? 'btn btn-primary btn-xs' : 'btn btn-secondary btn-xs'}
              onClick={() => setActiveTool(activeTool === 'UPI' ? null : 'UPI')}
              title="Show instant dynamic UPI QR for customer to scan on screen"
            >
              <QrCode size={13} color={activeTool === 'UPI' ? '#ffffff' : '#0284c7'} /> Live UPI QR
            </button>
          )}
        </div>
      </div>

      {/* Inline Cash Tender & Change Return Calculator */}
      {activeTool === 'CASH' && (
        <div
          style={{
            marginTop: '0.7rem',
            paddingTop: '0.7rem',
            borderTop: '1px dashed var(--border-strong, #cbd5e1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginBottom: '0.5rem',
            }}
          >
            <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              💵 Customer Cash Tendered (Bill Due: <strong>{formatCurrency(amountDueNow, currency)}</strong>)
            </span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setActiveTool(null)}
              title="Close Cash Calculator"
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
            <div style={{ position: 'relative', width: 135 }}>
              <IndianRupee
                size={13}
                style={{
                  position: 'absolute',
                  left: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="number"
                min="0"
                step="any"
                className="form-input"
                value={cashInput}
                onChange={(e) => setCashInput(e.target.value)}
                placeholder="Cash given"
                aria-label="Cash given by customer"
                style={{ paddingLeft: 24, paddingTop: '0.32rem', paddingBottom: '0.32rem', fontSize: '0.84rem', fontWeight: 700 }}
              />
            </div>

            {quickTenders.map((amt, idx) => (
              <button
                key={amt}
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => setCashInput(String(amt))}
                style={{
                  fontWeight: Number(cashInput) === amt ? 800 : 600,
                  borderColor: Number(cashInput) === amt ? 'var(--brand-primary)' : undefined,
                }}
              >
                {idx === 0 && Math.abs(amt - amountDueNow) < 0.01
                  ? `Exact (${formatCurrency(amt, currency)})`
                  : formatCurrency(amt, currency)}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.6rem',
              flexWrap: 'wrap',
              padding: '0.55rem 0.75rem',
              borderRadius: 10,
              background: tenderCalc.shortfall > 0
                ? 'rgba(245, 158, 11, 0.1)'
                : 'rgba(16, 185, 129, 0.1)',
              border: tenderCalc.shortfall > 0
                ? '1px solid rgba(245, 158, 11, 0.35)'
                : '1px solid rgba(16, 185, 129, 0.35)',
            }}
          >
            <div>
              {amountDueNow <= 0 ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Add at least one item to calculate change.
                </span>
              ) : tenderCalc.shortfall > 0 ? (
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#d97706' }}>
                  Balance still short by {formatCurrency(tenderCalc.shortfall, currency)} (Partial Cash / Udhaar)
                </span>
              ) : (
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#059669' }}>
                    Return Change to Customer: {formatCurrency(tenderCalc.changeToReturn, currency)}
                  </div>
                  {tenderCalc.breakupText && isInr && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      Suggested notes/coins: <strong>{tenderCalc.breakupText}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            {canReceiveNow && amountDueNow > 0 && onApplyPaymentNow && (
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => {
                  const toRecord =
                    tenderCalc.cashTendered > 0
                      ? tenderCalc.recommendedPaidAmount
                      : amountDueNow;
                  onApplyPaymentNow(toRecord, 'cash');
                  toast(
                    `Recorded ${formatCurrency(toRecord, currency)} Cash received${
                      tenderCalc.changeToReturn > 0
                        ? ` · Return ${formatCurrency(tenderCalc.changeToReturn, currency)} change`
                        : ''
                    }`,
                    'success'
                  );
                  setActiveTool(null);
                }}
              >
                <CheckCircle2 size={13} /> Record Cash Paid
              </button>
            )}
          </div>
        </div>
      )}

      {/* Live Counter Dynamic UPI QR Panel */}
      {activeTool === 'UPI' && (
        <div
          style={{
            marginTop: '0.7rem',
            paddingTop: '0.7rem',
            borderTop: '1px dashed var(--border-strong, #cbd5e1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '0.85rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 230px' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                📱 Counter Screen Dynamic UPI QR
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '0 0 0.55rem', lineHeight: 1.45 }}>
                Customer can scan directly with GPay, PhonePe, Paytm or BHIM — the exact invoice amount{' '}
                <strong>{formatCurrency(amountDueNow, 'INR')}</strong> is pre-locked inside the QR.
              </p>

              {!resolveMerchantUpiDetails(profile, selectedAccountId).isValid && (
                <div style={{ marginBottom: '0.55rem' }}>
                  <label className="form-label" style={{ fontSize: '0.72rem', marginBottom: 3 }}>
                    Enter Shop UPI ID (VPA) for Counter QR
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={fallbackUpi}
                    onChange={(e) => handleSaveFallbackUpi(e.target.value)}
                    placeholder="e.g. 9876543210@ybl or shopname@okicici"
                    style={{ fontSize: '0.8rem', padding: '0.34rem 0.55rem' }}
                  />
                </div>
              )}

              {merchantUpi.isValid && (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '0.55rem' }}>
                  Payee: <strong>{merchantUpi.payeeName}</strong> · VPA: <code>{merchantUpi.upiId}</code>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {canReceiveNow && amountDueNow > 0 && onApplyPaymentNow && (
                  <button
                    type="button"
                    className="btn-gradient"
                    onClick={() => {
                      onApplyPaymentNow(amountDueNow, 'upi');
                      toast(`Marked ${formatCurrency(amountDueNow, 'INR')} received via UPI!`, 'success');
                      setActiveTool(null);
                    }}
                  >
                    <CheckCircle2 size={14} /> Mark UPI Received ({formatCurrency(amountDueNow, 'INR')})
                  </button>
                )}
                {upiUri && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      navigator.clipboard?.writeText(upiUri).then(
                        () => toast('UPI payment link copied!', 'success'),
                        () => toast('Could not copy UPI link', 'warning')
                      );
                    }}
                  >
                    <Copy size={12} /> Copy UPI Link
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setActiveTool(null)}
                >
                  Close
                </button>
              </div>
            </div>

            {merchantUpi.isValid && qrDataUrl ? (
              <div
                style={{
                  background: '#ffffff',
                  color: '#0f172a',
                  padding: '0.65rem',
                  borderRadius: 12,
                  border: '1px solid #cbd5e1',
                  textAlign: 'center',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                }}
              >
                <img
                  src={qrDataUrl}
                  alt={`UPI QR for ${formatCurrency(amountDueNow, 'INR')}`}
                  width={156}
                  height={156}
                  style={{ display: 'block', margin: '0 auto' }}
                />
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                  {formatCurrency(amountDueNow, 'INR')}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#475569' }}>
                  Scan with any UPI App
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: '0.85rem 1rem',
                  borderRadius: 10,
                  border: '1px dashed var(--border-strong, #cbd5e1)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  maxWidth: 210,
                }}
              >
                Enter a valid UPI ID (like <code>9876543210@ybl</code>) here or in{' '}
                <strong>Settings → Payment Accounts</strong> to display your live counter QR.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
