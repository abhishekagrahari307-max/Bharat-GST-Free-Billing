// Browser-native virtual `/api/*` backend for static web hosting (e.g. GitHub Pages).
// When a real Node Express server (`server.js`) answers `/api/version` with JSON,
// all requests pass straight through to the server untouched. When hosted on a
// static host without Node (such as `*.github.io`), this module seamlessly persists
// all books in IndexedDB (with localStorage fallback) so every feature of
// Bharat GST Free Billing works 100% live in the browser.

import { nextCounterValue } from '../utils.js';
import { STANDARD_TERMS } from './termsDefaults.js';
import { validateCashEntry, cleanCashEntry } from './cashBook.js';
import {
  createVault,
  unlockVaultWithPin,
  recoverVaultWithCode,
  changeVaultUserPin,
  addVaultStaffUser,
  removeVaultStaffUser,
  sealRecord,
  openRecord,
  isEncryptedEnvelope,
  publicVaultInfo,
  checkRoleApiPermission,
} from './localLock.js';

const APP_VERSION = '1.10.86';
const DB_NAME = 'bharat_gst_free_billing_db';
const DB_STORE = 'state';
const DB_KEY = 'books_v1';
const LS_FALLBACK_KEY = 'bharat_gst_books_v1';

const COLLECTIONS = [
  'bills', 'clients', 'templates', 'products', 'productions',
  'expenses', 'recurring', 'receipts', 'purchases', 'purchase-orders',
  'debit-notes', 'stock-adjustments', 'cash-book', 'bank-statements',
  'profiles', 'trash',
];

function emptyState() {
  const cols = {};
  for (const c of COLLECTIONS) cols[c] = {};
  return {
    profile: {},
    meta: {},
    localPrefs: {},
    periodLock: '',
    editHistory: [],
    backups: {},
    collections: cols,
  };
}

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function mergeWithDefaults(saved) {
  const base = emptyState();
  const out = { ...base, ...saved, collections: { ...base.collections, ...(saved.collections || {}) } };
  for (const c of COLLECTIONS) {
    if (!out.collections[c] || typeof out.collections[c] !== 'object') out.collections[c] = {};
  }
  if (!Array.isArray(out.editHistory)) out.editHistory = [];
  if (!out.meta || typeof out.meta !== 'object') out.meta = {};
  if (!out.profile || typeof out.profile !== 'object') out.profile = {};
  if (!out.backups || typeof out.backups !== 'object') out.backups = {};
  return out;
}

let stateCache = null;
let rawSavedEnvelope = null;
let saveTimer = null;

const unlockedSession = {
  appUnlocked: false,
  dek: null,
  activeUser: null,
  hiddenKeys: new Map(),
  failCount: 0,
  lockedUntilMs: 0,
};

function checkBrowserPinWait() {
  const rem = Math.ceil((unlockedSession.lockedUntilMs - Date.now()) / 1000);
  return rem > 0 ? rem : 0;
}

function recordBrowserPinFail() {
  unlockedSession.failCount += 1;
  if (unlockedSession.failCount >= 5) {
    const mult = Math.min(8, 2 ** Math.max(0, unlockedSession.failCount - 5));
    unlockedSession.lockedUntilMs = Date.now() + 30_000 * mult;
    return 0;
  }
  return Math.max(0, 5 - unlockedSession.failCount);
}

function resetBrowserPinFail() {
  unlockedSession.failCount = 0;
  unlockedSession.lockedUntilMs = 0;
}

async function readRawRecord() {
  const db = await openDb();
  if (db) {
    const fromIdb = await new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(DB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (fromIdb && typeof fromIdb === 'object') return fromIdb;
  }
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

async function getState() {
  if (stateCache) return stateCache;
  const raw = await readRawRecord();
  rawSavedEnvelope = raw;
  if (raw?.meta?.vault?.encrypted && isEncryptedEnvelope(raw.encryptedBooks)) {
    if (!unlockedSession.dek) {
      // Return locked shell containing only public metadata + localPrefs until PIN unlocks DEK
      return {
        ...emptyState(),
        meta: raw.meta,
        localPrefs: raw.localPrefs || {},
        __vaultLocked: true,
      };
    }
    const opened = await openRecord(unlockedSession.dek, 'books_v1', raw.encryptedBooks);
    stateCache = mergeWithDefaults({ ...opened, meta: raw.meta, localPrefs: raw.localPrefs || {} });
    return stateCache;
  }
  stateCache = raw ? mergeWithDefaults(raw) : emptyState();
  return stateCache;
}

async function flushState() {
  if (!stateCache || stateCache.__vaultLocked) return;
  const clone = JSON.parse(JSON.stringify(stateCache));
  let toStore = clone;
  if (clone.meta?.vault?.encrypted && unlockedSession.dek) {
    const { meta, localPrefs, ...sensitive } = clone;
    const { vault, ...otherMeta } = meta || {};
    const encryptedBooks = await sealRecord(unlockedSession.dek, 'books_v1', {
      ...sensitive,
      metaRest: otherMeta,
    });
    toStore = {
      meta: { vault },
      localPrefs: localPrefs || {},
      encryptedBooks,
    };
    rawSavedEnvelope = toStore;
  }
  const db = await openDb();
  if (db) {
    await new Promise((resolve) => {
      try {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(toStore, DB_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(toStore));
  } catch { /* quota or private mode — IndexedDB already holds it */ }
}

function scheduleFlush() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { flushState(); }, 25);
  return flushState();
}

const uid = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${String(pin ?? '')}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261;
  for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619);
  return (h >>> 0).toString(16);
}

function jsonRes(body, status = 200) {
  return new Response(body === null ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function listCol(state, name) {
  return Object.values(state.collections[name] || {});
}

function addHistory(state, entry) {
  const actor = unlockedSession.activeUser?.name
    ? `${unlockedSession.activeUser.name} (${unlockedSession.activeUser.role || 'owner'})`
    : 'web';
  state.editHistory.unshift({ at: new Date().toISOString(), from: actor, ...entry });
  if (state.editHistory.length > 500) state.editHistory.length = 500;
}

function withoutLock(meta) {
  const copy = { ...(meta || {}) };
  delete copy.appLock;
  delete copy.vault;
  return copy;
}

function snapshotForBackup(state) {
  return {
    bills: listCol(state, 'bills'),
    profile: state.profile || {},
    clients: listCol(state, 'clients'),
    termsTemplates: listCol(state, 'templates'),
    products: listCol(state, 'products'),
    expenses: listCol(state, 'expenses'),
    recurring: listCol(state, 'recurring'),
    receipts: listCol(state, 'receipts'),
    profiles: listCol(state, 'profiles').map((p) => { const copy = { ...p }; delete copy.hideLock; return copy; }),
    purchases: listCol(state, 'purchases'),
    productions: listCol(state, 'productions'),
    purchaseOrders: listCol(state, 'purchase-orders'),
    debitNotes: listCol(state, 'debit-notes'),
    stockAdjustments: listCol(state, 'stock-adjustments'),
    cashBook: listCol(state, 'cash-book'),
    bankStatements: listCol(state, 'bank-statements'),
    meta: withoutLock(state.meta),
    exportedAt: new Date().toISOString(),
  };
}

async function parseBody(init) {
  if (!init || init.body == null) return {};
  if (typeof init.body === 'string') {
    try { return JSON.parse(init.body); } catch { return {}; }
  }
  return {};
}

function extractApiPath(input) {
  const raw = typeof input === 'string' ? input : (input?.url || '');
  try {
    const u = new URL(raw, window.location.href);
    if (u.origin !== window.location.origin) return null;
    const idx = u.pathname.indexOf('/api/');
    if (idx === -1) return null;
    return { path: u.pathname.slice(idx), searchParams: u.searchParams };
  } catch {
    return null;
  }
}

const BHARAT_CHANGELOG_MD = `## [5.5.1] - 2026-11-21
**Complete A-to-Z UI/UX & Full-Screen Layout Polish — Natural Full-Page Scrolling, Universal \`☰\` Collapsible Sidebar, Non-Overlapping Single-Row Header & Non-Clipping MSME/Sidebar Cards.**

### Fixed & Refined
- **Natural Full-Page Scrolling & Universal \`☰\` Collapsible Sidebar (\`src/App.jsx\`, \`src/index.css\`)**: Unstuck the top header, sidebar, and settings bar so pages scroll naturally, added a universal \`☰\` toggle for **100% full-screen desktop view**, and auto-closes the mobile drawer immediately when any sidebar link is clicked.
- **Zero Header Overlap, Consolidated SOS & Non-Clipping Cards (\`PageHeader.jsx\`, \`AutonomousMunimWidget.jsx\`, \`SidebarMenu.jsx\`)**: Eliminated title-vs-search overlap, duplicate \`+ + New Bill\` and redundant SOS buttons, uncovered the \`Install Bharat GST App\` banner, and fixed \`5d Overdue\` MSME badge & \`268px\` sidebar label fit.

## [5.5.0] - 2026-11-21
**Express POS Counter, Live UPI QR & Cash Tender Calculator + Khata & Stock Executive Command Strips + Unified Command Palette.**

### Added & Fixed
- **Express POS Counter Bar (\`src/components/ExpressPosCounterBar.jsx\`, \`src/utils/expressPosEngine.js\`)**: Adds 1-click **Walk-In Cash Bill**, **AI Voice Bill**, **Cash Tender & Indian Note Change Return Calculator**, and **Live Counter Screen Dynamic UPI QR** (\`upi://pay\` with pre-locked exact amount) right inside New Invoice.
- **Party Khata & Smart Stock Executive Command Strips (\`ClientsView.jsx\`, \`InventoryView.jsx\`)**: Adds \`.pro-card\` Market Udhaari / Owing Filter / Credit-Limit Watch + 1-tap **WhatsApp + UPI Link** on Clients, and Stock Cost / Selling Margin / Low-Stock / 4-6-8-digit **GSTR-1 HSN Hygiene** filter cards on Products.
- **Unified Ctrl+K Command Palette & Mobile Stock Tab Fix (\`QuickSearch.jsx\`, \`App.jsx\`)**: Routes \`connect-sync\`, \`newfeatures\`, SOS Help/Review (\`Alt+S\`), Hinglish GST Dictionary & Demo Store directly from \`Ctrl+K\`, and fixes \`isModuleEnabled('inventory', enabledModules)\` argument order on \`MobileBottomBar\`.

## [5.4.0] - 2026-11-21
**Commercial SaaS & POS Design Overhaul — Glass Sticky Command Bar, 4-Section Executive Sidebar, Dedicated Connect & Sync Hub, All New Functions Hub, Dynamic Executive KPI Grid, 4-Pillar Segmented Reports & Always-Accessible SOS Button.**

### Added & Upgraded
- **Modern SaaS & POS Design System (\`src/index.css\`)**: Clean Slate & Royal Indigo light/dark design tokens, \`.pro-card\` hover elevation, \`.btn-gradient\` primary CTA, \`.segmented-tabs\`, and sticky glassmorphism \`.app-topbar\` with live \`Online & PWA Ready\` / \`Mobile Synced\` status pills and \`F2\` New Bill shortcut.
- **4-Section Sidebar + Dedicated Connect & Sync Hub (\`src/components/ConnectAndSyncHub.jsx\`, \`src/components/SidebarMenu.jsx\`)**: Organizes navigation into **Billing & Khata**, **Stock & Purchase**, **Connect & Sync**, and **Tax, Accounting & CA**, giving **5G Mobile ↔ Laptop Sync**, **WhatsApp B2B Storefront**, and **PC Folder Live Mirror** a dedicated step-by-step hub.
- **Dedicated All New Functions Hub + 4-Pillar Segmented Reports + Executive KPI Grid (\`NewFunctionsAndSyncHub.jsx\`, \`ReportsWorkspace.jsx\`, \`ExecutiveKpiGrid.jsx\`)**: Adds a searchable 14-module **All New Functions** tab, groups Reports into 4 clean segmented pillars (**Financial Statements**, **Party, Stock & Aging**, **Income Tax & 2B**, **CA Audit & Year-End**), and upgrades Dashboard KPI cards.
- **Always-Accessible SOS Help & Review Launcher (\`src/components/SosHelpReviewButton.jsx\`)**: Adds Topbar \`🆘 SOS\` pill + floating \`🆘 SOS · Help & Review\` menu (\`Alt+S\`) with 1-click Zero-Login Error Support & Star Review.

## [5.3.0] - 2026-11-21
**Enterprise Year-End Closing, CA Practice Hub & Zero-Login Support Edition — Multi-Financial Year Rollover Wizard (31-Mar -> 1-Apr), CA Multi-Client \`.bharatca\` Reviewer Hub, GSTR-2B ITC Action Sheet (Sec 16(2)(aa) & 17(5)), Settings-Scoped Health Scorecard & Zero-Login Direct Support.**

### Added & Hardened
- **Multi-Financial Year Rollover Wizard (\`src/utils/yearEndRolloverEngine.js\`, \`src/components/YearEndRolloverPanel.jsx\`)**: Computes AS-2/ICDS-II 31-March Closing Stock valuation, party-wise Sundry Debtors/Creditors closing balances (with Sec 43B(h) MSME year-end alerts), posts an idempotent balanced 1-April Opening Balance Journal Voucher (\`Dr === Cr\`), and optionally closes prior-FY books via Period Lock.
- **CA Multi-Client \`.bharatca\` Reviewer Hub & GSTR-2B ITC Action Sheet (\`src/utils/caReviewerAnd2bActionEngine.js\`, \`src/components/CaMultiClientHubPanel.jsx\`)**: Batch-verifies 20–50+ encrypted/plain \`.bharatca\` client packages (SHA-256 tamper check + TB + 43B(h) + ITR summary) AND turns GSTR-2B reconciliation into a persistent **Accept / Keep Pending / Defer (Sec 16(2)(aa)) / Reject (Sec 17(5))** CA Action Sheet with live GSTR-3B Table 4 calculation.
- **Zero-Login Direct Feedback/Error Bridge, High-Contrast Modal & Settings-Scoped Health (\`src/utils/zeroLoginFeedback.js\`, \`HelpDeskAndReviewModal.jsx\`, \`SettingsView.jsx\`)**: Eliminates mandatory GitHub login via 1-click Zero-Login Direct Submit (local inbox + Web3Forms/Google Form/Server API), fixes dark-mode contrast in the Help Desk modal, and places System, Backup & Data Hygiene Status exclusively inside Settings -> Data & Backups.

## [5.2.0] - 2026-11-21
**Full-Stack Website Audit Hardening — Canonical Product/Invoice/FY Adapter (P0-1 & P0-2), Verified-Storage P2P Queue + Persistent Host Dedupe + 6-Digit Rate-Limited PIN (P0-5), High-Fidelity Tally XML / Vyapar Migration + Atomic Rollback (P0-6) & Security/Portal Verification (P1).**

### Fixed & Hardened
- **Canonical Product & Invoice Schema Adapter (\`src/utils/canonicalAdapter.js\`)**: Reconciles \`taxPercent\` <-> \`gstRate\` across Inventory, Serverless \`#b2b-catalog=z.\`, HTML Catalog, WebRTC P2P, and Tally/Vyapar Importer (fixing P0-1); reads \`data.totals.taxableAmount\` & subtracts hyphenated \`'credit-note'\` across ITR-3/4, GSTR-9, and Group Consolidation with strict Financial Year (\`FY\`), Firm (\`ownerGstin\`), and Opening/Closing Stock COGS support (fixing P0-2).
- **Verified WebRTC P2P Durability & Pairing Security (\`src/utils/webrtcP2pSync.js\`)**: Verifies \`localStorage\` read-back before reporting \`queued: true\` (triggering an emergency JSON download on \`QuotaExceededError\`), persists host \`queueId\` deduplication across restarts, upgrades to a 6-digit PIN with 5-attempt lockout, and scrubs \`?pin=\` from browser history (fixing P0-5 & P1).
- **High-Fidelity Tally XML / Vyapar Migration & Atomic Rollback (\`src/utils/legacyImporter.js\`)**: Preserves Tally \`<ALLINVENTORYENTRIES.LIST>\` line items and \`<LEDGERENTRIES.LIST>\` CGST/SGST/IGST breakup, flags ledger-only voucher warnings, and adds atomic batch rollback on migration & BOM saves (fixing P0-6 & P1).

## [5.1.0] - 2026-11-21
**Audit-Hardened Statutory Tax & POS Polish Release — CBDT Sec 44AD/44ADA 5%-Cash Cap, Sec 87A Marginal Relief, MSMED Sec 15 (15d/45d) 43B(h) Accuracy, fflate-Compressed \`#b2b-catalog=z.\` URLs & Shop POS / CA Pro Mode Toggle.**

### Added & Hardened
- **Statutory ITR-3/4 & Sec 87A Marginal Relief (\`src/utils/itrAndTaxEngine.js\`)**: Enforces ≤5% cash-receipt rule for ₹3Cr (44AD) / ₹75L (44ADA) enhanced turnover limits, implements CBDT Sec 87A Marginal Relief above ₹12,00,000 + Surcharge, validates AIS JSON schemas strictly, and extracts live TDS deductions from books for Form 26Q (Q1–Q4).
- **MSMED Sec 15 (15d vs 45d) & Live Product FEFO**: Enforces 15-day statutory deadline when no written MSME agreement exists (max 45 days with agreement), defaults to verified MSME suppliers only, and runs FEFO batch allocation directly on live inventory batches.
- **fflate-Compressed \`#b2b-catalog=z.\` URLs & Shop POS / CA Pro Toggle**: Deflate-compresses WhatsApp catalog URLs by ~65% (up to 150 items with legacy fallback), adds 1-click **Shop POS vs CA & Pro ERP** sidebar toggle, and ships rich OpenGraph social preview banner (\`og-banner.png\`).

## [5.0.0] - 2026-11-21
**Autonomous Bharat Business & Tax OS — Unifying ITR-3/4 + AIS/26Q + Zero-GSP Portal Bridge + Multi-Godown/FEFO/BOM + Sec 43B(h) MSME Shield + AI Munim & Serverless WhatsApp Storefront.**

### Added
- **ITR-3/4, AIS Parser, Form 26Q & Zero-GSP Portal Bridge (\`src/utils/itrAndTaxEngine.js\` + \`companion-extension/\`)**: Parses Income Tax AIS/TIS JSON, compares ITR-3 vs Sec 44AD/44ADA ITR-4 Sugam under AY 2027-28 New Regime slabs, exports Form 26Q RPU \`.txt\`, and pushes 1-click auto-fill payloads to \`ewaybillgst.gov.in\` & \`gst.gov.in\`.
- **Multi-Godown, FEFO Batch Allocator, Manufacturing BOM & E-Way Tracker (\`src/utils/godownAndManufacturing.js\`)**: Inter-godown stock transfers with Challan, FEFO expiry picking, Raw-to-Finished BOM landed cost calculation, and 6-hour pre-expiry E-Way Bill extension alerts.
- **Section 43B(h) MSME 45-Day Shield, Autonomous AI Munim & Serverless \`#b2b-catalog=\` Storefront (\`src/utils/autonomousMunimAnd43B.js\`)**: Tracks 45-day MSME disallowance risk, supplier rate hikes / margin erosion, and encodes live inventory into a zero-server WhatsApp Mini E-Commerce Storefront URL.

## [3.3.0] - 2026-11-21
**Hardened 5G WebRTC P2P Sync (Offline Queue + Auto-Reconnect) & 1-Click Tally XML / Vyapar Excel Migration Bridge.**

### Added
- **Hardened Resilient 5G WebRTC P2P Engine (\`src/utils/webrtcP2pSync.js\`)**: Added durable local Offline Sync Queue (\`bharatgst_p2p_offline_queue\`), 10s PING/PONG heartbeat, automatic 3s reconnect + queue auto-flush, and Counter PC idempotent \`queueId\` deduplication — zero lost orders even when godown 5G signal drops.
- **1-Click Tally XML & Vyapar Excel Importer (\`src/utils/legacyImporter.js\`)**: Drop TallyPrime \`Masters.xml\` / \`DayBook.xml\` (UTF-8 / UTF-16LE) or Vyapar \`.xlsx\` / \`.csv\` sheets in *Reports -> Enterprise AI & POS Hub* to import Customers, HSN Stock Items, Opening Stock & Sales Vouchers in one click.

## [3.2.0] - 2026-11-21
**Serverless WebRTC 5G Mobile <-> PC Live Sync (QR + 4-Digit PIN + Godown Order Pad).**

### Added
- **Serverless WebRTC P2P Mobile-to-PC Sync (\`src/utils/webrtcP2pSync.js\`)**: Connects godown/floor staff phones (even on 5G mobile data) directly to the Counter PC (broadband/Wi-Fi) via scannable QR + 4-digit Counter PIN. Syncs live product stock to mobile and pushes instant Tax Invoices / Sales Orders straight into the Counter PC's IndexedDB & Hard-Drive Live Mirror with ₹0 server cost.

## [3.1.0] - 2026-11-21
**Enterprise Browser-Native ERP + AI Compliance OS: GST Notice Shield (Sec 17(5) & Rule 37), GSTR-9/CMP-08, AI Fuzzy GSTR-2B, 30-Day Cash/Dead-Stock Forecaster, FIFO Settlement, B2B Catalog, WebSerial Scale & Silent ESC/POS.**

### Added
- **AI GST Notice Shield & GSTR-9 / CMP-08 Working Papers**: Flags Section 17(5) blocked ITC, CGST Rule 37 (>180-day unpaid supplier ITC reversal + 18% interest), and Rule 138 E-Way Bill gaps + GSTR-9 Annual Return & CMP-08 working papers.
- **AI Fuzzy GSTR-2B Matcher**: Reconciles \`INV/2026-27/0045\` <-> \`45\` with Levenshtein + ±₹2 tolerance and 1-click WhatsApp supplier notices for missing ITC.
- **On-Device 30-Day Cash-Flow & Dead-Stock Forecaster**: Predicts 30-day liquidity, dead-stock locked capital, and fast-moving stockout countdowns.
- **FIFO Lump-Sum Allocator, Shareable B2B Catalog & Multi-Tab Live Sync**: Settles lump-sum customer payments oldest-first, exports standalone HTML B2B catalogs with WhatsApp order import, and syncs open browser tabs via \`BroadcastChannel\`.
- **WebSerial Weighing Scale & WebUSB Silent ESC/POS**: Direct browser hardware bridge for electronic scales and 0.2s silent 58mm/80mm USB thermal receipt printing.

## [3.0.0] - 2026-11-21
**Full Double-Entry CA Accounting (F4-F7, Trial Balance, Schedule III Balance Sheet), SHA-256 Audit Chain, .bharatca CA Desk & Multi-OS Installers.**

### Added
- **Full Double-Entry Accounting Engine**: Automatic double-entry ledger derivation from Sales, Credit Notes, Purchases, Debit Notes & Expenses (Debit === Credit) + manual Tally-style F4 Contra, F5 Payment, F6 Receipt & F7 Journal Vouchers, live Trial Balance, and Schedule III Balance Sheet inside Reports.
- **Tamper-Proof SHA-256 Hash-Chained Audit Trail & .bharatca CA Desk**: Cryptographic SHA-256 block chain from Genesis to HEAD (MCA Rule 3(1) ready) with 1-click verification + optional AES-256-GCM encrypted \`.bharatca\` CA Workpaper Package export & inspector.
- **Pre-Built Multi-OS Desktop Installers & Docker**: Automated CI/CD release pipeline building Windows Setup \`.exe\`, Linux \`.deb\` & \`.AppImage\`, macOS App Bundle, Universal Portable ZIP, \`Dockerfile\` & \`docker-compose.yml\`.

## [2.7.0] - 2026-11-21
**Real-Time PC Hard-Drive Live Mirroring, Persistent Storage Lock & Pre-Rendered Architecture Spec.**

### Added
- **Real-Time PC Hard-Drive Live Mirroring**: Linking a local folder in Settings -> Data & Backups automatically mirrors \`BharatGST-Live-Mirror.json\` directly onto your PC hard drive on every bill save (surviving browser cache clears or browser uninstallation), plus automatic \`navigator.storage.persist()\` non-evictable storage protection.
- **Pre-Rendered HTML & \`llms.txt\` Technical Specification**: Search engines and AI tools reading the live URL without executing JavaScript now receive the complete 50+ module architecture and GST compliance matrix directly from \`index.html\` and \`/llms.txt\`.

## [2.6.0] - 2026-11-21
**AI Voice Billing, CA Pre-Filing GST Auditor & Daily Continuous Auto-Update Engine.**

### Added
- **Bharat AI Voice & Fast Command Billing**: Speak or type naturally in Hinglish, Hindi or English inside New Invoice to auto-fill Clients, Products, HSN, Rates and GST slabs 100% offline.
- **Pre-Filing CA GST Health Auditor**: Automatic 0-100% GST Portal Readiness Score in GST Returns checking GSTIN Mod-36 checksums, 4/6-digit HSN codes, State/POS match, Rule 46 gapless numbering and E-Way Bill thresholds.
- **Daily Continuous Auto-Update Engine (v2.6.0)**: Live background version checks, idle auto-install toggle, and 1-click instant update in Settings -> App & updates.

### Fixed
- **Windows 11 High-DPI Laptop Layouts**: Eliminated horizontal scrollbars on New Invoice, fixed Print & PDF column scaling at 125%-200% zoom, and refined compact sticky toolbars.

## [2.5.0] - 2026-11-20
**Live Print & PDF Sync, 5 Bill Languages, 8 Colour Designs & 9-Check Self-Heal.**

### Added
- **5 Print Layouts + 8 Colour Themes + 5 Languages**: English, Hindi, Tamil, Marathi and Bengali invoice headings with A4, A5 and 58mm/80mm POS thermal printing.
- **9-Point Startup Self-Heal**: Automatic storage quota, sequence counter and crash-loop Safe Mode protection.

## [2.4.0] - 2026-11-19
**AES-256-GCM Encrypted Vault, Passkey Unlock & Multi-Staff Role PINs.**

### Added
- **AES-256-GCM + PBKDF2-SHA256 (310,000 rounds) Vault**: Hardware Fingerprint/Passkey unlock, 24-character Recovery Key, and Owner / Billing Staff / CA Accountant roles.
- **9 Indian Industry Presets**: Pharmacy Batch/Expiry, Mobile IMEI/Warranty, Jewellery Purity/Making, Kirana POS, Transport LR, Textiles, Auto Parts & Hardware.
`;

function compareSemver(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

async function handleBrowserApi(path, searchParams, init = {}) {
  const method = String(init.method || 'GET').toUpperCase();
  const state = await getState();

  // ---- Health, Version & Live Daily Auto-Update ----
  if (path === '/api/health') return jsonRes({ ok: true, mode: 'browser' });
  if (path === '/api/version') {
    return jsonRes({
      current: APP_VERSION,
      channel: 'daily',
      autoUpdate: true,
      mode: 'browser',
      pid: 1,
      lockId: 'browser',
      books: 'Browser Encrypted Storage (IndexedDB)',
    });
  }
  if (path === '/api/check-update') {
    let latest = APP_VERSION;
    let buildTime = '';
    let swWaiting = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update?.();
        swWaiting = Boolean(reg?.waiting);
      }
      if (typeof window !== 'undefined' && navigator.onLine !== false) {
        const res = await window.fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data?.version) latest = String(data.version);
          if (data?.buildTime) buildTime = String(data.buildTime);
        }
      }
    } catch { /* offline safe */ }
    const updateAvailable = swWaiting || (latest && APP_VERSION !== 'unknown' && compareSemver(latest, APP_VERSION) > 0);
    return jsonRes({
      updateAvailable,
      current: APP_VERSION,
      latest: latest || APP_VERSION,
      channel: 'daily',
      autoUpdate: true,
      buildTime,
      checkedAt: new Date().toISOString(),
    });
  }
  if (path === '/api/changelog') {
    return jsonRes({
      text: BHARAT_CHANGELOG_MD,
      markdown: BHARAT_CHANGELOG_MD,
    });
  }

  // ---- Local Prefs Mirror ----
  if (path === '/api/local-prefs') {
    if (method === 'GET') return jsonRes({ prefs: state.localPrefs || {} });
    if (method === 'POST') {
      const body = await parseBody(init);
      if (body?.prefs && typeof body.prefs === 'object') {
        state.localPrefs = { ...(state.localPrefs || {}), ...body.prefs };
        await scheduleFlush();
      }
      return jsonRes({ ok: true });
    }
  }

  // ---- App PIN Lock + Option A Encrypted Vault & L2 Staff Roles ----
  if (path === '/api/lock') {
    const vault = state.meta?.vault;
    if (vault?.encrypted) {
      const pub = publicVaultInfo(vault);
      return jsonRes({
        enabled: true,
        encrypted: true,
        unlocked: !!unlockedSession.dek && unlockedSession.appUnlocked,
        length: pub.length,
        pinLength: pub.length,
        users: pub.users,
        hasRecoveryCode: pub.hasRecoveryCode,
        autoLockMinutes: pub.autoLockMinutes,
        lockOnHidden: pub.lockOnHidden,
        activeUser: unlockedSession.activeUser || null,
        local: true,
      });
    }
    const lock = state.meta?.appLock;
    return jsonRes({
      enabled: !!lock,
      encrypted: false,
      unlocked: !lock || unlockedSession.appUnlocked,
      length: lock?.length || 0,
      pinLength: lock?.length || 6,
      users: [],
      autoLockMinutes: lock?.autoLockMinutes ?? 0,
      lockOnHidden: !!lock?.lockOnHidden,
      activeUser: unlockedSession.activeUser || null,
      local: true,
    });
  }

  if (path === '/api/lock/lock-session' && method === 'POST') {
    unlockedSession.appUnlocked = false;
    if (state.meta?.vault?.encrypted) {
      unlockedSession.dek = null;
      unlockedSession.activeUser = null;
      stateCache = null;
    }
    return jsonRes({ ok: true });
  }

  if (path === '/api/lock/verify' && method === 'POST') {
    const wait = checkBrowserPinWait();
    if (wait > 0) return jsonRes({ ok: false, error: 'Too many wrong tries', code: 'wait', wait }, 429);
    const { pin, userId } = await parseBody(init);
    const vault = state.meta?.vault;
    if (vault?.encrypted) {
      try {
        const { dek, user } = await unlockVaultWithPin(vault, pin, userId || null);
        resetBrowserPinFail();
        unlockedSession.dek = dek;
        unlockedSession.appUnlocked = true;
        unlockedSession.activeUser = user;
        const raw = rawSavedEnvelope || await readRawRecord();
        if (raw?.encryptedBooks) {
          const opened = await openRecord(dek, 'books_v1', raw.encryptedBooks);
          const mergedMeta = { ...(opened.metaRest || {}), vault };
          stateCache = mergeWithDefaults({ ...opened, meta: mergedMeta, localPrefs: raw.localPrefs || {} });
        }
        return jsonRes({ ok: true, user });
      } catch {
        const triesLeft = recordBrowserPinFail();
        const nextWait = checkBrowserPinWait();
        if (nextWait > 0) return jsonRes({ ok: false, error: 'Too many wrong tries', code: 'wait', wait: nextWait }, 429);
        return jsonRes({ ok: false, error: 'Wrong PIN', code: 'wrong-pin', triesLeft }, 401);
      }
    }
    const lock = state.meta?.appLock;
    if (!lock) { unlockedSession.appUnlocked = true; return jsonRes({ ok: true }); }
    const h = await hashPin(pin, lock.salt);
    if (h !== lock.hash) {
      const triesLeft = recordBrowserPinFail();
      const nextWait = checkBrowserPinWait();
      if (nextWait > 0) return jsonRes({ ok: false, error: 'Too many wrong tries', code: 'wait', wait: nextWait }, 429);
      return jsonRes({ ok: false, error: 'Wrong PIN', code: 'wrong-pin', triesLeft }, 401);
    }
    resetBrowserPinFail();
    unlockedSession.appUnlocked = true;
    return jsonRes({ ok: true });
  }

  if (path === '/api/lock/setup-vault' && method === 'POST') {
    const { pin, ownerName, autoLockMinutes = 5 } = await parseBody(init);
    if (state.__vaultLocked) return jsonRes({ error: 'Unlock vault first', code: 'vault-locked' }, 423);
    try {
      const { vaultMeta, dek, recoveryCode } = await createVault(pin, {
        ownerName: ownerName || state.profile?.businessName || 'Owner',
        autoLockMinutes,
      });
      delete state.meta.appLock;
      state.meta.vault = vaultMeta;
      unlockedSession.dek = dek;
      unlockedSession.appUnlocked = true;
      unlockedSession.activeUser = {
        id: vaultMeta.users[0].id,
        name: vaultMeta.users[0].name,
        role: 'owner',
        pinLength: vaultMeta.users[0].pinLength,
      };
      await flushState();
      return jsonRes({
        ok: true,
        encrypted: true,
        recoveryCode,
        user: unlockedSession.activeUser,
      });
    } catch (e) {
      return jsonRes({ ok: false, error: e.message }, 400);
    }
  }

  if (path === '/api/lock/recover' && method === 'POST') {
    const wait = checkBrowserPinWait();
    if (wait > 0) return jsonRes({ ok: false, error: 'Too many wrong tries', code: 'wait', wait }, 429);
    const { recoveryCode, newPin } = await parseBody(init);
    const vault = state.meta?.vault;
    if (!vault?.encrypted) return jsonRes({ ok: false, error: 'Encrypted vault is not enabled' }, 400);
    try {
      const { vaultMeta: nextVault, dek, user } = await recoverVaultWithCode(vault, recoveryCode, newPin);
      resetBrowserPinFail();
      unlockedSession.dek = dek;
      unlockedSession.appUnlocked = true;
      unlockedSession.activeUser = user;
      const raw = rawSavedEnvelope || await readRawRecord();
      if (raw?.encryptedBooks) {
        const opened = await openRecord(dek, 'books_v1', raw.encryptedBooks);
        const mergedMeta = { ...(opened.metaRest || {}), vault: nextVault };
        stateCache = mergeWithDefaults({ ...opened, meta: mergedMeta, localPrefs: raw.localPrefs || {} });
      } else {
        state.meta.vault = nextVault;
      }
      await flushState();
      return jsonRes({ ok: true, user });
    } catch (e) {
      const triesLeft = recordBrowserPinFail();
      return jsonRes({ ok: false, error: e.message || 'Invalid recovery code', code: e.code || 'wrong-recovery', triesLeft }, 401);
    }
  }

  if (path === '/api/lock/change-pin' && method === 'POST') {
    const { userId, currentPin, newPin } = await parseBody(init);
    const vault = state.meta?.vault;
    if (!vault?.encrypted) return jsonRes({ ok: false, error: 'Vault not enabled' }, 400);
    try {
      const { dek, user } = await unlockVaultWithPin(vault, currentPin, userId || unlockedSession.activeUser?.id || null);
      const targetId = userId || user.id;
      const nextVault = await changeVaultUserPin(vault, dek, targetId, newPin);
      state.meta.vault = nextVault;
      unlockedSession.dek = dek;
      await flushState();
      return jsonRes({ ok: true });
    } catch {
      return jsonRes({ ok: false, error: 'Current PIN is wrong', code: 'wrong-pin' }, 401);
    }
  }

  if (path === '/api/lock/disable-vault' && method === 'POST') {
    const { currentPin } = await parseBody(init);
    const vault = state.meta?.vault;
    if (!vault?.encrypted) return jsonRes({ ok: true, enabled: false });
    try {
      const { dek, user } = await unlockVaultWithPin(vault, currentPin);
      if (user.role !== 'owner') return jsonRes({ ok: false, error: 'Only Owner can disable Vault encryption' }, 403);
      if (state.__vaultLocked) {
        const raw = rawSavedEnvelope || await readRawRecord();
        const opened = raw?.encryptedBooks ? await openRecord(dek, 'books_v1', raw.encryptedBooks) : emptyState();
        stateCache = mergeWithDefaults({ ...opened, meta: opened.metaRest || {}, localPrefs: raw?.localPrefs || {} });
      } else {
        delete state.meta.vault;
      }
      unlockedSession.dek = null;
      unlockedSession.activeUser = null;
      unlockedSession.appUnlocked = false;
      await flushState();
      return jsonRes({ ok: true, enabled: false, encrypted: false });
    } catch {
      return jsonRes({ ok: false, error: 'Wrong Owner PIN', code: 'wrong-pin' }, 401);
    }
  }

  if (path === '/api/lock/users' && method === 'POST') {
    const { currentPin, name, role, pin } = await parseBody(init);
    const vault = state.meta?.vault;
    if (!vault?.encrypted) return jsonRes({ ok: false, error: 'Enable Encrypted Vault first to add staff roles' }, 400);
    try {
      const { dek, user: actor } = await unlockVaultWithPin(vault, currentPin);
      if (actor.role !== 'owner') return jsonRes({ ok: false, error: 'Only Owner can add staff accounts' }, 403);
      const { vaultMeta: nextVault, user } = await addVaultStaffUser(vault, dek, { name, role, pin });
      state.meta.vault = nextVault;
      await flushState();
      return jsonRes({ ok: true, user });
    } catch (e) {
      return jsonRes({ ok: false, error: e.message || 'Could not add staff user' }, 400);
    }
  }

  const staffDelMatch = path.match(/^\/api\/lock\/users\/([^/]+)$/);
  if (staffDelMatch && method === 'DELETE') {
    const targetId = decodeURIComponent(staffDelMatch[1]);
    const { currentPin } = await parseBody(init);
    const vault = state.meta?.vault;
    if (!vault?.encrypted) return jsonRes({ ok: false, error: 'Vault not enabled' }, 400);
    try {
      const { user: actor } = await unlockVaultWithPin(vault, currentPin);
      if (actor.role !== 'owner') return jsonRes({ ok: false, error: 'Only Owner can remove staff accounts' }, 403);
      state.meta.vault = removeVaultStaffUser(vault, targetId);
      await flushState();
      return jsonRes({ ok: true });
    } catch (e) {
      return jsonRes({ ok: false, error: e.message || 'Wrong Owner PIN' }, 401);
    }
  }

  if (path === '/api/lock/auto-lock' && method === 'POST') {
    const { autoLockMinutes = 5, lockOnHidden = false } = await parseBody(init);
    if (state.meta?.vault?.encrypted) {
      state.meta.vault = {
        ...state.meta.vault,
        autoLockMinutes: Math.max(0, Number(autoLockMinutes) || 0),
        lockOnHidden: !!lockOnHidden,
      };
      await flushState();
      return jsonRes({ ok: true });
    }
    if (state.meta?.appLock) {
      state.meta.appLock = {
        ...state.meta.appLock,
        autoLockMinutes: Math.max(0, Number(autoLockMinutes) || 0),
        lockOnHidden: !!lockOnHidden,
      };
      await flushState();
    }
    return jsonRes({ ok: true });
  }

  if (path === '/api/lock/set' && method === 'POST') {
    const { pin, currentPin } = await parseBody(init);
    const existing = state.meta?.appLock;
    if (existing) {
      const check = await hashPin(currentPin, existing.salt);
      if (check !== existing.hash) return jsonRes({ ok: false, error: 'Wrong current PIN', code: 'wrong-pin' }, 401);
    }
    if (pin === null) {
      delete state.meta.appLock;
      unlockedSession.appUnlocked = false;
    } else {
      const s = String(pin ?? '');
      if (!/^\d{4,8}$/.test(s)) return jsonRes({ ok: false, error: 'PIN must be 4–8 digits' }, 400);
      const salt = uid('salt');
      state.meta.appLock = { salt, hash: await hashPin(s, salt), length: s.length };
      unlockedSession.appUnlocked = true;
    }
    await scheduleFlush();
    return jsonRes({ ok: true, enabled: !!state.meta.appLock });
  }

  // Block all data routes while Option A Encrypted Vault is locked
  if (state.__vaultLocked && path !== '/api/client-errors') {
    return jsonRes({ error: 'Encrypted Vault is locked. Enter your PIN to unlock.', code: 'vault-locked' }, 423);
  }

  // Enforce L2 Staff Role permissions on mutating requests
  if (unlockedSession.activeUser?.role) {
    const deniedMsg = checkRoleApiPermission(unlockedSession.activeUser.role, method, path);
    if (deniedMsg) {
      return jsonRes({ error: deniedMsg, code: 'role-denied', role: unlockedSession.activeUser.role }, 403);
    }
  }

  // ---- Period Lock & Edit History ----
  if (path === '/api/period-lock') {
    if (method === 'GET') return jsonRes({ upTo: state.periodLock || '' });
    if (method === 'POST') {
      const { upTo } = await parseBody(init);
      state.periodLock = String(upTo || '');
      addHistory(state, { kind: 'books', action: state.periodLock ? 'locked' : 'unlocked', id: '', number: '', date: state.periodLock });
      await scheduleFlush();
      return jsonRes({ ok: true, upTo: state.periodLock });
    }
  }
  if (path === '/api/edit-history' && method === 'GET') {
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 200));
    return jsonRes({ entries: (state.editHistory || []).slice(0, limit) });
  }

  // ---- Phone Access & Control Panel ----
  if (path === '/api/phone-access') return jsonRes({ enabled: false, devices: [], urls: [], webMode: true });
  if (path.startsWith('/api/phone-access/')) return jsonRes({ ok: true, devices: [] });
  if (path === '/api/control-panel/status') {
    return jsonRes({
      ok: true,
      webMode: true,
      browserStorage: true,
      platform: 'Web & Offline PWA',
      installKind: 'pwa',
      version: APP_VERSION,
      channel: 'Daily Continuous Auto-Update',
      autoUpdate: true,
      controlScriptsAvailable: true,
      actions: { update: true },
    });
  }
  if (path.startsWith('/api/control-panel/')) return jsonRes({ ok: false, hint: true, error: 'Running in Web / PWA mode — use the Auto-Update card above.' });
  if (path === '/api/errors-log') return jsonRes({ entries: [] });
  if (path === '/api/client-errors') return jsonRes({ ok: true });
  if (path === '/api/save-pdf' || path === '/api/saved-pdf/cancel-mark' || path === '/api/trash-pdf') {
    return jsonRes({ success: true, browserMode: true });
  }

  // ---- Profile (singleton) ----
  if (path === '/api/profile') {
    if (method === 'HEAD') return new Response(null, { status: 200 });
    if (method === 'GET') return jsonRes(state.profile || {});
    if (method === 'POST') {
      state.profile = (await parseBody(init)) || {};
      await scheduleFlush();
      return jsonRes({ success: true });
    }
  }

  // ---- Multi-Business Profiles ----
  if (path === '/api/profiles') {
    if (method === 'GET') {
      const activeGstin = state.profile?.gstin || '';
      const activeName = state.profile?.businessName || '';
      const list = listCol(state, 'profiles').map((p) => {
        const isActive = Boolean((p.gstin && p.gstin === activeGstin) || (!p.gstin && p.businessName && p.businessName === activeName));
        if (p.hideLock) return { id: p.id, hidden: true, isActive };
        return { ...p, isActive };
      });
      list.sort((a, b) => String(a.businessName || '').localeCompare(String(b.businessName || '')));
      return jsonRes(list);
    }
    if (method === 'POST') {
      const { hideLock: _l, hidden: _h, isActive: _a, ...prof } = await parseBody(init);
      if (!prof.id) prof.id = uid('biz');
      const existing = state.collections.profiles[prof.id];
      state.collections.profiles[prof.id] = existing?.hideLock ? { ...prof, hideLock: existing.hideLock } : prof;
      await scheduleFlush();
      return jsonRes({ success: true, id: prof.id });
    }
  }
  if (path === '/api/profiles/unlock' && method === 'POST') {
    const { pin } = await parseBody(init);
    const opened = [];
    for (const p of listCol(state, 'profiles')) {
      if (p.hideLock && (await hashPin(pin, p.hideLock.salt)) === p.hideLock.hash) {
        const key = uid('hkey');
        unlockedSession.hiddenKeys.set(p.id, key);
        const { hideLock: _l, ...pub } = p;
        opened.push({ ...pub, key });
      }
    }
    if (!opened.length) return jsonRes({ ok: false, error: 'wrong-pin', code: 'wrong-pin', triesLeft: 4 }, 401);
    return jsonRes({ ok: true, ids: opened.map((p) => p.id), profiles: opened });
  }
  const profHideMatch = path.match(/^\/api\/profiles\/([^/]+)\/hide-pin$/);
  if (profHideMatch && method === 'POST') {
    const id = decodeURIComponent(profHideMatch[1]);
    const prof = state.collections.profiles[id];
    if (!prof) return jsonRes({ error: 'Not found' }, 404);
    const { pin, currentPin } = await parseBody(init);
    if (prof.hideLock && (await hashPin(currentPin, prof.hideLock.salt)) !== prof.hideLock.hash) {
      return jsonRes({ ok: false, error: 'wrong-pin', code: 'wrong-pin', triesLeft: 4 }, 401);
    }
    const next = { ...prof };
    if (pin === null) {
      delete next.hideLock;
      unlockedSession.hiddenKeys.delete(id);
    } else {
      const salt = uid('salt');
      next.hideLock = { salt, hash: await hashPin(pin, salt), length: String(pin).length };
    }
    state.collections.profiles[id] = next;
    await scheduleFlush();
    const { hideLock: _l, ...pub } = next;
    const key = pin !== null ? uid('hkey') : undefined;
    if (key) unlockedSession.hiddenKeys.set(id, key);
    return jsonRes({ ok: true, hidden: pin !== null, ...(pin !== null ? { key, profile: pub } : {}) });
  }
  const profDelMatch = path.match(/^\/api\/profiles\/([^/]+)$/);
  if (profDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(profDelMatch[1]);
    delete state.collections.profiles[id];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Meta & Atomic Counters ----
  if (path === '/api/number-series/rename' && method === 'POST') {
    const { from, to } = await parseBody(init);
    if (from && to && from !== to && state.meta?.invoiceNumberSeries?.[from]) {
      state.meta.invoiceNumberSeries[to] = state.meta.invoiceNumberSeries[from];
      delete state.meta.invoiceNumberSeries[from];
      await scheduleFlush();
    }
    return jsonRes({ ok: true });
  }
  const metaIncMatch = path.match(/^\/api\/meta\/([^/]+)\/increment$/);
  if (metaIncMatch && method === 'POST') {
    const key = decodeURIComponent(metaIncMatch[1]);
    const { start } = await parseBody(init);
    const next = nextCounterValue(state.meta[key], start);
    state.meta[key] = next;
    await scheduleFlush();
    return jsonRes({ key, value: next });
  }
  const metaRaiseMatch = path.match(/^\/api\/meta\/([^/]+)\/raise$/);
  if (metaRaiseMatch && method === 'POST') {
    const key = decodeURIComponent(metaRaiseMatch[1]);
    const { value } = await parseBody(init);
    const n = Number(value);
    if (Number.isFinite(n) && n > (Number(state.meta[key]) || 0)) {
      state.meta[key] = Math.floor(n);
      await scheduleFlush();
    }
    return jsonRes({ key, value: state.meta[key] ?? 0 });
  }
  const metaMatch = path.match(/^\/api\/meta\/([^/]+)$/);
  if (metaMatch) {
    const key = decodeURIComponent(metaMatch[1]);
    if (key === 'appLock') return jsonRes({ error: 'Forbidden' }, 403);
    if (method === 'GET') return jsonRes({ key, value: state.meta[key] ?? null });
    if (method === 'POST') {
      const { value } = await parseBody(init);
      state.meta[key] = value;
      await scheduleFlush();
      return jsonRes({ success: true, key, value });
    }
  }

  // ---- Bills & Trash ----
  if (path === '/api/bills') {
    if (method === 'GET') {
      const bills = listCol(state, 'bills');
      bills.sort((a, b) => String(b.invoiceDate || b.createdAt || '').localeCompare(String(a.invoiceDate || a.createdAt || '')));
      return jsonRes(bills);
    }
    if (method === 'POST') {
      const bill = await parseBody(init);
      const overwrite = searchParams.get('overwrite') === '1' || searchParams.get('overwrite') === 'true';
      if (!bill.id) bill.id = uid('bill');
      const existingById = state.collections.bills[bill.id];
      if (existingById && !overwrite) {
        return jsonRes({ error: `Invoice "${bill.invoiceNumber || bill.id}" already exists.`, code: 'duplicate-bill' }, 409);
      }
      if (!overwrite && bill.invoiceNumber) {
        const dup = listCol(state, 'bills').find((b) => b.id !== bill.id && b.invoiceNumber === bill.invoiceNumber && (b.invoiceType || 'tax-invoice') === (bill.invoiceType || 'tax-invoice'));
        if (dup) return jsonRes({ error: `Invoice number "${bill.invoiceNumber}" is already used.`, code: 'duplicate-number' }, 409);
      }
      bill.updatedAt = new Date().toISOString();
      if (!bill.createdAt) bill.createdAt = bill.updatedAt;
      state.collections.bills[bill.id] = bill;
      addHistory(state, { kind: 'bill', action: existingById ? 'edited' : 'added', id: bill.id, number: bill.invoiceNumber || '', date: bill.invoiceDate || '', total: bill.totalAmount });
      await scheduleFlush();
      return jsonRes({ success: true, id: bill.id });
    }
  }
  const billDelMatch = path.match(/^\/api\/bills\/([^/]+)$/);
  if (billDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(billDelMatch[1]);
    const existing = state.collections.bills[id];
    if (existing) {
      state.collections.trash[id] = { ...existing, _trashedAt: new Date().toISOString() };
      delete state.collections.bills[id];
      addHistory(state, { kind: 'bill', action: 'deleted', id, number: existing.invoiceNumber || '', date: existing.invoiceDate || '', total: existing.totalAmount });
      await scheduleFlush();
    }
    return jsonRes({ success: true });
  }

  if (path === '/api/trash' && method === 'GET') {
    const list = listCol(state, 'trash');
    list.sort((a, b) => String(b._trashedAt || '').localeCompare(String(a._trashedAt || '')));
    return jsonRes(list);
  }
  const trashRestoreMatch = path.match(/^\/api\/trash\/([^/]+)\/restore$/);
  if (trashRestoreMatch && method === 'POST') {
    const id = decodeURIComponent(trashRestoreMatch[1]);
    const item = state.collections.trash[id];
    if (!item) return jsonRes({ error: 'Not found' }, 404);
    const { _trashedAt: _t, ...restored } = item;
    state.collections.bills[id] = restored;
    delete state.collections.trash[id];
    await scheduleFlush();
    return jsonRes({ success: true, id });
  }
  const trashDelMatch = path.match(/^\/api\/trash\/([^/]+)$/);
  if (trashDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(trashDelMatch[1]);
    delete state.collections.trash[id];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Backups ----
  if (path === '/api/backup-folder') return jsonRes({ path: '' });
  if (path === '/api/backups' && method === 'GET') {
    const dates = Object.keys(state.backups || {}).sort((a, b) => b.localeCompare(a));
    return jsonRes(dates.map((date) => {
      const snap = state.backups[date] || {};
      return { date, createdAt: snap.exportedAt || date, billCount: (snap.bills || []).length, clientCount: (snap.clients || []).length };
    }));
  }
  if (path === '/api/backups/now' && method === 'POST') {
    const body = await parseBody(init);
    const keep = Math.max(3, Math.min(180, Number(body?.keepLastCount) || 30));
    const today = new Date().toISOString().slice(0, 10);
    state.backups[today] = snapshotForBackup(state);
    const allDates = Object.keys(state.backups).sort((a, b) => b.localeCompare(a));
    for (const oldDate of allDates.slice(keep)) {
      delete state.backups[oldDate];
    }
    await scheduleFlush();
    return jsonRes({ success: true, date: today, kept: Object.keys(state.backups).length });
  }
  const backupRestoreMatch = path.match(/^\/api\/backups\/([^/]+)\/restore$/);
  if (backupRestoreMatch && method === 'POST') {
    const date = decodeURIComponent(backupRestoreMatch[1]);
    const snap = state.backups?.[date];
    if (!snap) return jsonRes({ error: 'Backup not found' }, 404);
    await applyImportPayload(state, snap, true);
    await scheduleFlush();
    return jsonRes({ success: true });
  }
  const backupDelMatch = path.match(/^\/api\/backups\/([^/]+)$/);
  if (backupDelMatch && method === 'DELETE') {
    const date = decodeURIComponent(backupDelMatch[1]);
    delete state.backups[date];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Templates (seeds Standard Terms) ----
  if (path === '/api/templates') {
    if (method === 'GET') {
      let list = listCol(state, 'templates');
      if (list.length === 0) {
        const def = { id: 'default', name: 'Standard Terms', content: STANDARD_TERMS };
        state.collections.templates.default = def;
        await scheduleFlush();
        list = [def];
      }
      list.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
      return jsonRes(list);
    }
    if (method === 'POST') {
      const tpl = await parseBody(init);
      if (!tpl.id) tpl.id = uid('tpl');
      state.collections.templates[tpl.id] = tpl;
      await scheduleFlush();
      return jsonRes({ success: true, id: tpl.id });
    }
  }
  const tplDelMatch = path.match(/^\/api\/templates\/([^/]+)$/);
  if (tplDelMatch && method === 'DELETE') {
    delete state.collections.templates[decodeURIComponent(tplDelMatch[1])];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Productions (moves product stock atomically) ----
  if (path === '/api/productions') {
    if (method === 'GET') {
      const rows = listCol(state, 'productions');
      rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return jsonRes(rows);
    }
    if (method === 'POST') {
      const entry = await parseBody(init);
      if (!entry?.id) entry.id = uid('prodn');
      if (state.collections.productions[entry.id]) return jsonRes({ error: 'Already exists' }, 409);
      for (const [pid, delta] of Object.entries(entry.stockApplied || {})) {
        const p = state.collections.products[pid];
        if (p && p.type !== 'service') p.stock = Math.round(((Number(p.stock) || 0) + (Number(delta) || 0)) * 1000) / 1000;
      }
      state.collections.productions[entry.id] = entry;
      await scheduleFlush();
      return jsonRes({ success: true, id: entry.id });
    }
  }
  const prodnDelMatch = path.match(/^\/api\/productions\/([^/]+)$/);
  if (prodnDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(prodnDelMatch[1]);
    const entry = state.collections.productions[id];
    if (!entry) return jsonRes({ error: 'Not found' }, 404);
    for (const [pid, delta] of Object.entries(entry.stockApplied || {})) {
      const p = state.collections.products[pid];
      if (p && p.type !== 'service') p.stock = Math.round(((Number(p.stock) || 0) - (Number(delta) || 0)) * 1000) / 1000;
    }
    delete state.collections.productions[id];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Stock Adjustments ----
  if (path === '/api/stock-adjustments') {
    if (method === 'GET') {
      const list = listCol(state, 'stock-adjustments');
      list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return jsonRes(list);
    }
    if (method === 'POST') {
      const a = await parseBody(init);
      const id = a.id || uid('adj');
      const record = {
        id, date: a.date, productId: a.productId,
        productName: String(a.productName ?? '').slice(0, 200),
        unit: String(a.unit ?? '').slice(0, 20),
        quantity: Number(a.quantity) || 0,
        reason: String(a.reason ?? '').slice(0, 20),
        note: String(a.note ?? '').slice(0, 500),
        stockApplied: { [a.productId]: Number(a.quantity) || 0 },
        createdAt: new Date().toISOString(),
      };
      state.collections['stock-adjustments'][id] = record;
      await scheduleFlush();
      return jsonRes({ success: true, id, record });
    }
  }
  const adjDelMatch = path.match(/^\/api\/stock-adjustments\/([^/]+)$/);
  if (adjDelMatch && method === 'DELETE') {
    const id = decodeURIComponent(adjDelMatch[1]);
    const record = state.collections['stock-adjustments'][id];
    if (!record) return jsonRes({ error: 'Not found' }, 404);
    delete state.collections['stock-adjustments'][id];
    await scheduleFlush();
    return jsonRes({ success: true, record });
  }

  // ---- Cash Book ----
  if (path === '/api/cash-book') {
    if (method === 'GET') {
      const entries = listCol(state, 'cash-book');
      entries.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      return jsonRes(entries);
    }
    if (method === 'POST') {
      const body = await parseBody(init);
      const problem = validateCashEntry(body);
      if (problem) return jsonRes({ error: problem, code: 'bad-request' }, 400);
      const entry = cleanCashEntry(body);
      if (!entry.id) entry.id = uid('cash');
      else entry.updatedAt = new Date().toISOString();
      state.collections['cash-book'][entry.id] = entry;
      await scheduleFlush();
      return jsonRes({ success: true, id: entry.id, entry });
    }
  }
  const cashDelMatch = path.match(/^\/api\/cash-book\/([^/]+)$/);
  if (cashDelMatch && method === 'DELETE') {
    delete state.collections['cash-book'][decodeURIComponent(cashDelMatch[1])];
    await scheduleFlush();
    return jsonRes({ success: true });
  }

  // ---- Bulk Product Price/Stock CSV Update ----
  if (path === '/api/products/price-update' && method === 'POST') {
    const { changes = [], allowStock = false } = await parseBody(init);
    let updated = 0;
    for (const ch of changes) {
      const p = state.collections.products[ch.id];
      if (!p) continue;
      if (ch.sellingPrice !== undefined) { p.sellingPrice = ch.sellingPrice; p.rate = ch.sellingPrice; }
      if (ch.purchasePrice !== undefined) p.purchasePrice = ch.purchasePrice;
      if (ch.mrp !== undefined) p.mrp = ch.mrp;
      if (ch.hsn !== undefined) p.hsn = ch.hsn;
      if (ch.levelPrices && typeof ch.levelPrices === 'object') p.levelPrices = { ...(p.levelPrices || {}), ...ch.levelPrices };
      if (allowStock && ch.stock !== undefined && p.type !== 'service') p.stock = ch.stock;
      updated++;
    }
    await scheduleFlush();
    return jsonRes({ ok: true, updated });
  }

  // ---- Generic CRUD Collections ----
  const GENERIC_COLLECTIONS = {
    clients: { prefix: 'cli', sort: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) },
    products: { prefix: 'prod', sort: (a, b) => String(a.name || '').localeCompare(String(b.name || '')) },
    expenses: { prefix: 'exp', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    purchases: { prefix: 'pur', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    'purchase-orders': { prefix: 'po', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    'debit-notes': { prefix: 'dn', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    recurring: { prefix: 'rec', sort: (a, b) => String(a.clientName || '').localeCompare(String(b.clientName || '')) },
    receipts: { prefix: 'rcp', sort: (a, b) => String(b.date || '').localeCompare(String(a.date || '')) },
    'bank-statements': { prefix: 'stmt', sort: (a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')) },
  };

  for (const [col, cfg] of Object.entries(GENERIC_COLLECTIONS)) {
    if (path === `/api/${col}`) {
      if (method === 'GET') {
        const items = listCol(state, col);
        items.sort(cfg.sort);
        return jsonRes(items);
      }
      if (method === 'POST') {
        const item = await parseBody(init);
        if (!item.id) item.id = uid(cfg.prefix);
        state.collections[col][item.id] = item;
        await scheduleFlush();
        return jsonRes({ success: true, id: item.id });
      }
    }
    const delMatch = path.match(new RegExp(`^/api/${col}/([^/]+)$`));
    if (delMatch && method === 'DELETE') {
      delete state.collections[col][decodeURIComponent(delMatch[1])];
      await scheduleFlush();
      return jsonRes({ success: true });
    }
  }

  // ---- Recurring "Generate Now" ----
  const recGenMatch = path.match(/^\/api\/recurring\/([^/]+)\/generate$/);
  if (recGenMatch && method === 'POST') {
    const id = decodeURIComponent(recGenMatch[1]);
    const rec = state.collections.recurring[id];
    if (!rec) return jsonRes({ error: 'Recurring template not found' }, 404);
    const today = new Date().toISOString().slice(0, 10);
    const nextNum = nextCounterValue(state.meta.counter_INV, 1);
    state.meta.counter_INV = nextNum;
    const invoiceNumber = `INV/${String(nextNum).padStart(4, '0')}`;
    const billId = uid('bill');
    const bill = {
      ...(rec.templateData || {}),
      id: billId,
      invoiceNumber,
      invoiceDate: today,
      clientName: rec.clientName || rec.templateData?.client?.name || '',
      totalAmount: rec.amount || rec.templateData?.totalAmount || 0,
      createdAt: new Date().toISOString(),
    };
    state.collections.bills[billId] = bill;
    rec.lastGenerated = today;
    await scheduleFlush();
    return jsonRes({ success: true, id: billId, invoiceNumber });
  }

  // ---- Export & Import ----
  if (path === '/api/export' && method === 'GET') {
    return jsonRes(snapshotForBackup(state));
  }
  if (path === '/api/import' && method === 'POST') {
    const data = await parseBody(init);
    const overwrite = searchParams.get('overwrite') === '1' || searchParams.get('overwrite') === 'true';
    const counts = await applyImportPayload(state, data, overwrite);
    await scheduleFlush();
    return jsonRes({ success: true, ...counts });
  }

  return jsonRes({ error: `Unhandled browser API route: ${method} ${path}` }, 404);
}

async function applyImportPayload(state, data, overwrite) {
  const counts = {
    billCount: 0, clientCount: 0, templateCount: 0, productCount: 0,
    expenseCount: 0, recurringCount: 0, receiptCount: 0, profileCount: 0,
    purchaseCount: 0, productionCount: 0, purchaseOrderCount: 0,
    debitNoteCount: 0, stockAdjustmentCount: 0, cashBookCount: 0, bankStatementCount: 0,
  };
  if (data.profile && (overwrite || !Object.keys(state.profile || {}).length)) {
    state.profile = data.profile;
  }
  const map = [
    ['bills', data.bills, 'billCount'],
    ['clients', data.clients, 'clientCount'],
    ['templates', data.termsTemplates, 'templateCount'],
    ['products', data.products, 'productCount'],
    ['expenses', data.expenses, 'expenseCount'],
    ['recurring', data.recurring, 'recurringCount'],
    ['receipts', data.receipts, 'receiptCount'],
    ['profiles', data.profiles, 'profileCount'],
    ['purchases', data.purchases, 'purchaseCount'],
    ['productions', data.productions, 'productionCount'],
    ['purchase-orders', data.purchaseOrders, 'purchaseOrderCount'],
    ['debit-notes', data.debitNotes, 'debitNoteCount'],
    ['stock-adjustments', data.stockAdjustments, 'stockAdjustmentCount'],
    ['cash-book', data.cashBook, 'cashBookCount'],
    ['bank-statements', data.bankStatements, 'bankStatementCount'],
  ];
  for (const [col, arr, key] of map) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (!item?.id) continue;
      if (!overwrite && state.collections[col][item.id]) continue;
      state.collections[col][item.id] = item;
      counts[key]++;
    }
  }
  if (data.meta && typeof data.meta === 'object') {
    for (const [k, v] of Object.entries(data.meta)) {
      if (k === 'appLock') continue;
      if (overwrite || state.meta[k] === undefined) state.meta[k] = v;
    }
  }
  return counts;
}

let backendModePromise = null;

export function installBrowserApiFallback() {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function' || window.__bharatBrowserApiInstalled) return;
  window.__bharatBrowserApiInstalled = true;
  const origFetch = window.fetch.bind(window);

  const detectMode = () => {
    if (backendModePromise) return backendModePromise;
    // Fast-path known static hosts so first paint never waits on a 404 round-trip.
    if (/\.github\.io$|\.netlify\.app$|\.vercel\.app$|\.pages\.dev$/i.test(window.location.hostname)) {
      backendModePromise = Promise.resolve('browser');
      return backendModePromise;
    }
    backendModePromise = origFetch('./api/version', { cache: 'no-store' })
      .then((res) => {
        const ct = res.headers.get('content-type') || '';
        return res.ok && ct.includes('application/json') ? 'server' : 'browser';
      })
      .catch(() => 'browser');
    return backendModePromise;
  };

  window.fetch = async (input, init) => {
    const parsed = extractApiPath(input);
    if (!parsed) return origFetch(input, init);
    const mode = await detectMode();
    if (mode === 'server') return origFetch(input, init);
    return handleBrowserApi(parsed.path, parsed.searchParams, init);
  };
}
