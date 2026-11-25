// Bharat GST Free Billing v5.2.0 — Zero-GSP Companion Browser Extension
// Bridges Bharat GST Free Billing with gst.gov.in & ewaybillgst.gov.in with honest per-field verification.

/* global chrome */

window.addEventListener('BHARATGST_PUSH_PORTAL_PAYLOAD', (event) => {
  if (!event.detail || typeof chrome === 'undefined' || !chrome.storage?.local) return;
  chrome.storage.local.set({ bharatGstActivePayload: event.detail }, () => {
    window.dispatchEvent(new CustomEvent('BHARATGST_BRIDGE_ACK', { detail: { saved: true } }));
  });
});

function setNativeInputValue(selectorList, value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { provided: false, matched: false };
  }
  for (const sel of selectorList) {
    const el = document.querySelector(sel);
    if (el && !el.disabled && !el.readOnly) {
      el.focus();
      el.value = String(value);
      el.style.outline = '2px solid #16a34a';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { provided: true, matched: true, selector: sel };
    }
  }
  return { provided: true, matched: false };
}

function autoFillPortalInputs(payload) {
  const fieldSpecs = [
    { label: 'Doc No', selectors: ['#txtDocNo', 'input[name*="docNo"]', 'input[formcontrolname*="docNo"]', 'input[placeholder*="Document No"]'], val: payload.invoiceNumber },
    { label: 'Doc Date', selectors: ['#txtDocDate', 'input[name*="docDate"]', 'input[formcontrolname*="docDate"]'], val: payload.date },
    { label: 'Recipient GSTIN', selectors: ['#txtToGstin', 'input[name*="toGstin"]', 'input[formcontrolname*="gstin"]', 'input[placeholder*="GSTIN"]'], val: payload.customerGstin },
    { label: 'Taxable Value', selectors: ['#txtTaxableVal', 'input[name*="taxable"]', 'input[formcontrolname*="txval"]'], val: payload.taxableValue },
    { label: 'Total Invoice Value', selectors: ['#txtTotInvVal', 'input[name*="totInvVal"]', 'input[formcontrolname*="val"]'], val: payload.totalAmount },
    { label: 'Vehicle No', selectors: ['#txtVehNo', 'input[name*="vehicleNo"]'], val: payload.vehicleNo },
    { label: 'Distance (km)', selectors: ['#txtDistance', 'input[name*="transDistance"]'], val: payload.distanceKm || '' },
  ];

  const matched = [];
  const missing = [];
  for (const spec of fieldSpecs) {
    const res = setNativeInputValue(spec.selectors, spec.val);
    if (!res.provided) continue;
    if (res.matched) matched.push(spec.label);
    else missing.push(spec.label);
  }
  return { matched, missing };
}

if (
  typeof chrome !== 'undefined' &&
  chrome.storage?.local &&
  (window.location.hostname.includes('gst.gov.in') || window.location.hostname.includes('ewaybillgst.gov.in'))
) {
  chrome.storage.local.get(['bharatGstActivePayload'], ({ bharatGstActivePayload }) => {
    if (!bharatGstActivePayload) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `⚡ Auto-Fill Bill #${bharatGstActivePayload.invoiceNumber || ''} (Bharat GST)`;
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      zIndex: '999999',
      backgroundColor: '#16a34a',
      color: '#ffffff',
      border: 'none',
      borderRadius: '8px',
      padding: '12px 18px',
      fontWeight: 'bold',
      fontSize: '13px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.28)',
      cursor: 'pointer',
      maxWidth: '380px',
      textAlign: 'left',
    });

    btn.addEventListener('click', () => {
      const { matched, missing } = autoFillPortalInputs(bharatGstActivePayload);
      if (matched.length === 0) {
        btn.style.backgroundColor = '#d97706';
        btn.textContent = `⚠️ 0 matching inputs on this screen — open E-Way Bill / GSTR-1 Invoice Entry form first`;
      } else {
        btn.style.backgroundColor = '#15803d';
        const missNote = missing.length ? ` (enter manually: ${missing.join(', ')})` : '';
        btn.textContent = `✓ Filled ${matched.length} field(s)${missNote} — Verify values & CAPTCHA before submit`;
      }
    });

    document.body.appendChild(btn);
  });
}
