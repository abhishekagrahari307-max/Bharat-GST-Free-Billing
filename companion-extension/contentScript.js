// Bharat GST Free Billing v5.0.0 — Zero-GSP Companion Browser Extension
// Bridges Bharat GST Free Billing directly with gst.gov.in & ewaybillgst.gov.in with ₹0 GSP API fees.

/* global chrome */

// 1. Listen for export payload dispatched from Bharat GST Web App
window.addEventListener('BHARATGST_PUSH_PORTAL_PAYLOAD', (event) => {
  if (!event.detail || typeof chrome === 'undefined' || !chrome.storage?.local) return;
  chrome.storage.local.set({ bharatGstActivePayload: event.detail }, () => {
    window.dispatchEvent(new CustomEvent('BHARATGST_BRIDGE_ACK', { detail: { saved: true } }));
  });
});

function setNativeInputValue(selectorList, value) {
  if (value === undefined || value === null || value === '') return false;
  for (const sel of selectorList) {
    const el = document.querySelector(sel);
    if (el) {
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
  }
  return false;
}

function autoFillPortalInputs(payload) {
  setNativeInputValue(['#txtDocNo', 'input[name*="docNo"]', 'input[placeholder*="Document No"]'], payload.invoiceNumber);
  setNativeInputValue(['#txtDocDate', 'input[name*="docDate"]'], payload.date);
  setNativeInputValue(['#txtToGstin', 'input[name*="toGstin"]', 'input[placeholder*="GSTIN"]'], payload.customerGstin);
  setNativeInputValue(['#txtVehNo', 'input[name*="vehicleNo"]'], payload.vehicleNo);
  setNativeInputValue(['#txtDistance', 'input[name*="transDistance"]'], String(payload.distanceKm || ''));
  setNativeInputValue(['#txtTotInvVal', 'input[name*="totInvVal"]'], String(payload.totalAmount || ''));
}

// 2. Inject Floating "⚡ Auto-Fill from Bharat GST" Button on Government Portals
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
    });

    btn.addEventListener('click', () => {
      autoFillPortalInputs(bharatGstActivePayload);
      btn.textContent = `✓ Filled Bill #${bharatGstActivePayload.invoiceNumber || ''} — Verify & Submit`;
    });

    document.body.appendChild(btn);
  });
}
