# Changelog — Bharat GST Free Billing

All notable daily updates and feature releases of **Bharat GST Free Billing** (Created by **Abhishek Agrahari**) are documented here.
Bharat GST Free Billing follows a **Daily Continuous Release & Safe Auto-Update** cadence — updates deliver automatically without ever interrupting an open invoice or touching your saved business data.

---

## [5.3.0] - 2026-11-21

**Enterprise Year-End Rollover, CA Multi-Client `.bharatca` Hub, GSTR-2B ITC Action Sheet & Zero-Login Support Edition.**

### Added & Improved
- **Multi-Financial Year Rollover Wizard (`src/utils/yearEndRolloverEngine.js`, `src/components/YearEndRolloverPanel.jsx`)**: Automates 31-March Closing Stock valuation (AS-2 / ICDS-II lower of cost or NRV), party-wise Sundry Debtors & Sundry Creditors closing schedules (with Section 43B(h) MSME year-end alerts), idempotent balanced 1-April Opening Balance Journal Voucher (`Dr === Cr` verified), CGST Rule 46(b) new-FY series guidance, and optional Period Lock up to 31 March.
- **CA Multi-Client `.bharatca` Reviewer Hub (`src/utils/caReviewerAnd2bActionEngine.js`, `src/components/CaMultiClientHubPanel.jsx`)**: Allows Chartered Accountants to batch-load 20–50+ plain or AES-256-GCM encrypted `.bharatca` client packages, re-verifies each client's SHA-256 Audit Hash Chain & Trial Balance, ranks `CRITICAL` / `REVIEW` / `CLEAN` clients, and exports a consolidated CA Practice Portfolio Matrix.
- **GSTR-2B vs Purchase Register "Action Taken" ITC Sheet (`src/components/EnterpriseAiHub.jsx`)**: Upgrades AI Fuzzy GSTR-2B reconciliation with stateful per-invoice `Accept ITC (Table 4A)` / `Keep Pending` / `Defer (Missing in 2B - Sec 16(2)(aa))` / `Reject (Sec 17(5) - Table 4D)` decisions, statutory DRC-01C mismatch warnings, live GSTR-3B Table 4 totals, and exportable CA ITC Action Statements.
- **Zero-Login Direct Feedback & Error Bridge + High-Contrast UI + Settings-Scoped Health (`src/utils/zeroLoginFeedback.js`, `src/components/HelpDeskAndReviewModal.jsx`, `src/components/SettingsView.jsx`)**: Replaces mandatory GitHub login with 1-click Zero-Login Direct Submit (local inbox + Web3Forms / Google Form / `/api/feedback` server inbox), fixes dark-mode text contrast in the Help Desk modal, and relocates System, Backup & Data Hygiene Status exclusively to `Settings -> Data & Backups`.

### How to update
- **Web & Installable PWA**: Refresh the page or click **Update** in **Settings → About & Updates** (`v5.2.0` → `v5.3.0`).
- **Desktop / Portable (`Free-GST-Billing.zip`)**: Click **Update** in **Settings**, or download `Free-GST-Billing-v5.3.0.zip` and copy all files except your `data/` folder over your existing installation.

---

## [5.2.0] - 2026-11-21

**Complete Polish, Honest Global Progress, Scoped System Health, Hinglish GST Dictionary & In-App Help Desk Edition — Full `P0`/`P1` Tax & Schema Hardening + Unified Global Activity Drawer + Privacy-Safe Support & Shopkeeper Essentials.**

### Added & Hardened
- **Unified Global Activity & Progress Drawer + Honest Tracked Downloads (`src/utils/operationRegistry.js`, `src/utils/trackedDownload.js`, `src/components/OperationProgressBar.jsx`)**: Tracks concurrent Invoice PDF, Bulk PDF/ZIP (`done/total` + Cancel), GSTR-1/3B JSON/CSV, GSTR-2B Reconciliation, `.json`/`.fgsb` Backups & Restore/Verify, `.bharatca`, Tally/Vyapar Import (`n/total`), P2P Queue → Host ACK, and Storage Self-Heal (`1/9..9/9`) with category icons, WCAG ARIA (`aria-valuenow` omitted when indeterminate), strict PII redaction (`[GSTIN]`, `[PAN]`, `[PHONE]`, `[PIN]`), and honest `DOWNLOAD_INITIATED` (`"File ready; browser download initiated"`) semantics.
- **8-Point Scoped System, Backup & Data Hygiene Scorecard (`src/utils/systemHealthEvaluator.js`, `src/components/SystemHealthScorecard.jsx`)**: Evaluates real profile/FY-scoped records across `System`, `Backup`, `Sync`, `Data Hygiene` (strict 4/6/8-digit numeric HSN regex), and `Compliance Advisory` (reporting `unknown` on empty inventory or untagged MSME purchases rather than false `"100% Safe"`).
- **Serverless In-App Help Desk, Privacy-Safe Error Reporter, Review Card & Hinglish GST Dictionary (`src/components/HelpDeskAndReviewModal.jsx`, `src/components/HelpDictionaryPanel.jsx`, `src/data/helpDictionary.js`)**: Instant Hinglish troubleshooting FAQ, searchable 14-term GST & Income Tax glossary (`HSN`, `ITC`, `GSTR-1/2B/3B/9`, `Sec 43B(h)`, `44AD`, `87A`, `Credit Note`, `FEFO`, `BOM`, `RCM`, `E-Way Bill`), 1-click PII-sanitized GitHub/WhatsApp diagnostic reporter wired to failed operations, and structured 1–5 star review cards.
- **Shopkeeper Essentials (`src/utils/shopEssentials.js`)**: Salted hash + 5-attempt lockout **Staff / Operator Lock PIN**, **1-Click Canonical Sandbox / Demo Store** loader, and **1-Click WhatsApp + Dynamic `upi://pay` Khata Reminder**.
- **`P0-1` Canonical Product GST Schema (`src/utils/canonicalAdapter.js`)**: Unifies `taxPercent` and `gstRate` across `InventoryView`, `InvoiceGenerator`, `#b2b-catalog=z.`, Shareable HTML Catalog, WebRTC P2P, and Tally/Vyapar Importer so standard 5%/12%/18%/28% products never drop to `0%` GST.
- **`P0-2` Canonical Invoice, Credit Note, FY & COGS Engine (`itrAndTaxEngine.js`, `gstNoticeShield.js`, `autonomousMunimAnd43B.js`)**: Reads `data.totals.taxableAmount` & `cgst`/`sgst`/`utgst`/`igst`/`cess` (so a ₹100 + ₹18 GST saved invoice reports exact ₹100 taxable turnover & ₹18 GST in both ITR-3/4 and GSTR-9), subtracts hyphenated `'credit-note'` documents, skips cancelled/quotation/proforma/challan/sales-order documents, enforces Financial Year (`FY`) + Business (`ownerGstin`) filtering, and adds Opening/Closing Stock COGS inputs.
- **`P0-5` & `P1` Verified WebRTC P2P Storage, Persistent Host Dedupe & 6-Digit Rate-Limited PIN (`webrtcP2pSync.js`)**: Verifies `localStorage` read-back before claiming `queued: true` (returning `storageError: true` + auto-downloading emergency JSON on `QuotaExceededError`), persists Counter PC `queueId` deduplication across reloads, upgrades to a 6-digit PIN with 5-attempt lockout, and scrubs `?pin=` from browser history.
- **`P0-6` & `P1` High-Fidelity Tally XML / Vyapar Migration, Atomic Rollback, `SECURITY.md` & Portal Extension (`legacyImporter.js`, `SECURITY.md`, `companion-extension/`)**: Preserves Tally `<ALLINVENTORYENTRIES.LIST>` items and `<LEDGERENTRIES.LIST>` CGST/SGST/IGST breakup, surfaces warnings on ledger-only vouchers, adds atomic batch rollback on migration & BOM saves, updates `SECURITY.md` to official repository advisories, and reports exact matched/missing field counts in `companion-extension`.

---

## [5.1.0] - 2026-11-21

**Audit-Hardened Statutory Tax & POS Polish Edition — CBDT Sec 44AD/44ADA 5%-Cash Cap, Sec 87A Marginal Relief, MSMED Sec 15 (15d vs 45d) 43B(h) Accuracy, `fflate`-Compressed `#b2b-catalog=z.` URLs, Shop POS / CA Pro Mode Toggle & Rich OpenGraph Banner.**

### Added & Hardened
- **Statutory ITR-3/4 & Sec 87A Marginal Relief (`src/utils/itrAndTaxEngine.js`)**: Enforces statutory ≤5% cash-receipt condition for enhanced ₹3 Cr (44AD) / ₹75L (44ADA) limits, implements Section 87A Proviso Marginal Relief above ₹12,00,000 + Surcharge, validates AIS/TIS JSON schemas strictly, and extracts live TDS deductions from books for Form 26Q (Q1–Q4).
- **MSMED Act Sec 15 (15d vs 45d) & Live Product FEFO (`src/utils/autonomousMunimAnd43B.js` + `AutonomousOsPanels.jsx`)**: Enforces 15-day statutory deadline when no written agreement exists (max 45 days with agreement), defaults to verified MSME suppliers only (`isMsme`/`udyamNo`), and runs FEFO expiry allocation directly on live inventory batches.
- **`fflate`-Compressed `#b2b-catalog=z.` Storefront, Progressive Disclosure Toggle & Social Preview**: Shrinks WhatsApp catalog links by ~65% via `fflate` deflate compression (up to 150 items + legacy uncompressed backward compatibility + snapshot timestamp), adds **🏪 Shop POS vs 📊 CA & Pro ERP** sidebar toggle (`WorkspaceModeToggle.jsx`), and ships `public/og-banner.png` OpenGraph & Twitter preview cards.

---

## [5.0.0] - 2026-11-21

**Autonomous Bharat Business & Tax OS — Unifying Tax2Win/CompuTax (ITR-3/4 + AIS/26AS + Form 26Q + Zero-GSP Portal Bridge), TallyPrime (Multi-Godown + FEFO + Manufacturing BOM), and Next-Gen AI (Sec 43B(h) MSME 45-Day Shield + Margin Arbitrage Munim + Serverless `#b2b-catalog=` Storefront).**

### Added
- **Module A — ITR-3/4, AIS/26AS & TDS Form 26Q Engine (`src/utils/itrAndTaxEngine.js`)**: Parses Income Tax AIS/TIS JSON, compares ITR-3 vs Sec 44AD/44ADA ITR-4 Sugam under AY 2027-28 New Regime slabs (including Sec 87A ₹12L rebate), and generates RPU-ready Form 26Q `.txt` files.
- **Module B — Multi-Godown, FEFO Batch Allocator, Manufacturing BOM & E-Way Tracker (`src/utils/godownAndManufacturing.js`)**: Inter-godown stock transfers with Challan, FEFO expiry-sorted batch allocation, Raw-to-Finished BOM landed cost calculation, and 6-hour pre-expiry E-Way Bill extension alerts.
- **Module C — Zero-GSP Chrome/Edge Companion Extension (`companion-extension/`)**: Manifest V3 bridge auto-filling `ewaybillgst.gov.in` and `gst.gov.in` directly from Bharat GST Free Billing with ₹0 GSP API cost.
- **Module D — Sec 43B(h) MSME Shield, Autonomous AI Munim & Serverless Storefront (`src/utils/autonomousMunimAnd43B.js` + `ServerlessCatalogModal.jsx`)**: 45-day MSME tax disallowance countdown, purchase rate hike / margin erosion detector with 1-click reprice, and UTF-8 URL-compressed `#b2b-catalog=` WhatsApp Mini Storefront.

---

## [3.3.0] - 2026-11-21

**Hardened Resilient 5G WebRTC P2P Sync (Offline Sync Queue + Auto-Reconnect), 1-Click Tally XML / Vyapar Excel Importer & Community Launch Kit (`LAUNCH_KIT.md`).**

### Added
- **Hardened WebRTC P2P Sync (`src/utils/webrtcP2pSync.js`)**: Durable local Offline Sync Queue (`bharatgst_p2p_offline_queue`), 10s `PING`/`PONG` heartbeat, automatic 3s reconnect + queue auto-flush, and Counter PC idempotent `queueId` deduplication so zero godown orders are lost when 5G fluctuates.
- **1-Click Tally XML & Vyapar Excel Migration Bridge (`src/utils/legacyImporter.js`)**: Zero-CVE `fflate` `.xlsx`/`.csv` reader + UTF-16LE BOM-safe Tally XML parser importing Customers, HSN Stock Items, Opening Balances, and Tally Sales Vouchers in one click.
- **Community & Product Launch Kit (`LAUNCH_KIT.md`)**: Ready-to-publish launch copy for LinkedIn, Reddit, and Product Hunt.

---

## [3.2.0] - 2026-11-21

**Serverless WebRTC 5G Mobile ↔ PC Live Sync (QR + 4-Digit Counter PIN + Mobile Godown Order Pad).**

### Added
- **Serverless WebRTC P2P Mobile-to-PC Live Sync (`src/utils/webrtcP2pSync.js` + `EnterpriseAiHub.jsx`)**: Connects staff phones (even on 5G mobile data) directly to the Counter PC (broadband/Wi-Fi) via scannable QR + 4-digit Counter Security PIN (`BGST-XXXXXX`). Automatically streams live product stock/rates to the mobile order pad and pushes instant Tax Invoices / Sales Orders straight into the Counter PC's IndexedDB & `BharatGST-Live-Mirror.json` with ₹0 server cost.

---

## [3.1.0] - 2026-11-21

**Enterprise Browser-Native ERP + AI Compliance OS: GST Notice Shield (Sec 17(5) & Rule 37), GSTR-9/CMP-08, AI Fuzzy GSTR-2B, 30-Day Cash/Dead-Stock Forecaster, FIFO Settlement, B2B Catalog, Multi-Tab Live Sync, WebSerial Scale & Silent ESC/POS.**

### Added
- **AI GST Notice Shield & GSTR-9 / CMP-08 Working Papers (`src/utils/gstNoticeShield.js`)**: Flags Section 17(5) blocked ITC, CGST Rule 37 (>180-day unpaid supplier ITC reversal + 18% interest), and Rule 138 E-Way Bill (>₹50,000) risks + GSTR-9 Annual Return (Tables 4, 6, 9, 17) & CMP-08 summaries.
- **AI Fuzzy GSTR-2B Matcher (`src/utils/fuzzyGstr2b.js`)**: Reconciles portal `GSTR-2B.json` against Purchase Bills using Levenshtein distance + trailing numeric core + ±₹2 tolerance, with 1-click WhatsApp supplier notices for missing ITC.
- **On-Device 30-Day Cash-Flow & Dead-Stock Forecaster (`src/utils/aiForecaster.js`)**: Predicts 30-day inflows/outflows, locked dead-stock capital, and fast-moving stockout countdowns.
- **Smart FIFO Lump-Sum Allocator, Shareable B2B Catalog & Multi-Tab Sync (`src/utils/fifoAndCatalog.js` + `BroadcastChannel`)**: Settles customer lump-sum receipts oldest-invoice-first, exports standalone HTML B2B Digital Catalogs with WhatsApp order parsing, and syncs open tabs in real time.
- **Direct Browser Hardware Bridge (`src/utils/hardwareBridge.js`)**: WebSerial electronic weighing scale live capture (kg/g) and WebUSB/WebSerial native ESC/POS 0.2s silent thermal printing.

---

## [3.0.0] - 2026-11-21

**Full Double-Entry CA Accounting (`F4–F7`, Trial Balance, Schedule III Balance Sheet), Tamper-Proof SHA-256 Audit Chain, `.bharatca` CA Desk & Multi-OS Desktop Installers.**

### Added
- **Full Double-Entry Accounting Engine (`src/utils/doubleEntry.js` + `AccountingDesk.jsx`)**: Automatic balanced Debit/Credit ledger postings from Sales Invoices, Credit Notes, Purchase Bills, Debit Notes & Expenses (`Debit === Credit` to ₹0.00) + Tally-style `F4 Contra`, `F5 Payment`, `F6 Receipt` & `F7 Journal Vouchers`, live **Trial Balance**, and **Schedule III Balance Sheet** (with Closing Inventory Valuation & Net Profit bridge) inside *Reports*.
- **Tamper-Proof SHA-256 Hash-Chained Audit Trail (`src/utils/hashChain.js`)**: Chains every voucher from Genesis (`0000…0000`) to HEAD with cryptographic SHA-256 digests (MCA Rule 3(1) ready) and 1-click verification.
- **`.bharatca` Encrypted CA Workpaper Desk**: Export and inspect optional **AES-256-GCM + PBKDF2-SHA256 (310,000 rounds)** encrypted `.bharatca` workpaper bundles containing Trial Balance, Balance Sheet, GST Readiness Score, Vouchers & SHA-256 Audit Proof.
- **Pre-Built Multi-OS Desktop Installers & Docker**: Added `Dockerfile`, `docker-compose.yml`, and automated GitHub Actions release workflow (`.github/workflows/release-installers.yml`) building Windows Setup `.exe`, Linux `.deb` & `.AppImage`, macOS App Bundle, Universal Portable ZIP, and Offline User Guide ZIP on Node.js 22 LTS.

---

## [2.7.0] - 2026-11-21

**Real-Time PC Hard-Drive Live Mirroring, Non-Evictable Storage Lock & Pre-Rendered Technical Specification (`llms.txt`).**

### Added
- **Real-Time PC Hard-Drive Live Mirroring (`BharatGST-Live-Mirror.json`)**: When a local folder is linked via File System Access API in *Settings → Data & Backups*, every invoice/client/product save automatically mirrors `BharatGST-Live-Mirror.json` directly onto your physical hard drive in real time — protecting books even if browser site data is cleared or the browser is uninstalled.
- **Automatic Non-Evictable Browser Storage Lock**: Requests `navigator.storage.persist()` automatically on startup.
- **Pre-Rendered Semantic HTML Shell & `/llms.txt`**: Non-JS web crawlers, search engines, and AI evaluation tools now read the complete verifiable 50+ module architecture directly from `index.html` and `/llms.txt`.

---

## [2.6.0] - 2026-11-21

**AI Voice Billing, CA Pre-Filing GST Auditor, Daily Continuous Auto-Update Engine & Windows 11 High-DPI Laptop Polish.**

### Added
- **Bharat AI Voice & Fast Command Billing**: Speak or type naturally in Hinglish, Hindi (`हिंदी`) or Indian English inside New Invoice (`🎙️ Voice Bill`) to auto-match saved Clients, Products, HSN/SAC codes, Rates, Units, and GST slabs completely offline.
- **Pre-Filing CA GST Health Auditor**: Automatic 0–100% GST Portal Readiness Score inside GST Returns checking 15-digit GSTIN Mod-36 checksums, HSN/SAC completeness, State/POS consistency, Rule 46 gapless invoice numbering, and E-Way Bill thresholds with 1-click Audit CSV export.
- **Daily Continuous Auto-Update Center (`v2.6.0`)**: Live update checking against `version.json`, toggleable idle auto-update, 1-click Service Worker refresh, and live sidebar version badge.
- **10 Complete GST & Business Document Types**: Tax Invoice, Proforma Invoice, Quotation / Estimate, Credit Note, Debit Note, Bill of Supply, Composition Bill, Sales Order, Purchase Order, and Delivery Challan.

### Fixed
- **Windows 11 High-DPI Laptop Layouts (`125%–200%` scale)**: Eliminated horizontal overflow on New Invoice, fixed clipped toolbar buttons, added container-queried Print & PDF responsive controls, and removed sidebar badge overlap.
- **Security & Encryption Documentation**: Unified WebCrypto AES-256-GCM + PBKDF2-SHA256 (310,000-round) vault documentation across the Complete Guide and README.

---

## [2.5.0] - 2026-11-20

**End-to-End Live Print & PDF Engine, 9-Check Self-Healing Diagnostics & Complete Guide Rebrand.**

### Added
- **Live End-to-End Print & PDF Sync**: Every template, 8 colour palettes, 5 Indian bill languages (English, Hindi, Tamil, Marathi, Bengali), A4/A5 & 58mm/80mm thermal POS settings sync live across Settings, Invoice Editor, and PDF exports.
- **9-Point Startup Self-Heal Engine**: Automatic non-destructive startup verification of IndexedDB quota, invoice sequence counters, backup freshness, and crash-loop Safe Mode recovery.
- **Complete Self-Hosted User Guide**: 35 offline-ready documentation pages with instant full-text search.

---

## [2.4.0] - 2026-11-19

**AES-256-GCM Encrypted Vault, Multi-Staff Role Lock, Smart Notification Center & Encrypted `.fgsb` Backups.**

### Added
- **WebCrypto AES-256-GCM + PBKDF2-SHA256 (310,000 Rounds) Vault**: Hardware Passkey / Fingerprint unlock, 24-character offline Recovery Key card, and Multi-Staff Role PINs (`Owner`, `Billing Staff`, `CA / Accountant`).
- **Encrypted `.fgsb` Backup Center & Google Drive Sync**: Password-encrypted backups, automatic snapshots, and optional Google Drive PDF/backup upload.
- **Smart Notification Center**: Live alerts for overdue receivables, low stock, expiring batches, and upcoming GSTR-1 / GSTR-3B filing dates.

---

## [2.3.0] - 2026-11-18

**9 Indian Industry Presets, Native Mobile Bottom Bar & Strict Offline GSTIN/IFSC/UPI Validation.**

### Added
- **9 Specialized Indian Industry Presets**: Pharmacy (Batch, Expiry, Drug Licence), Mobile/Electronics (IMEI, Serial, Warranty), Jewellery (Purity, Gross/Net Wt, Making Charges), Kirana POS, Transport (LR, Vehicle No.), Textiles, Auto Parts, Hardware, and IT/Freelance.
- **Strict Offline Validation**: Modulo-36 GSTIN checksum verification, automatic State + PAN extraction, IFSC, PAN, PIN, and UPI ID validation.
- **Mobile Touch Ergonomics**: Native 5-tab mobile bottom navigation bar and instant Edit / Live Preview switcher.
