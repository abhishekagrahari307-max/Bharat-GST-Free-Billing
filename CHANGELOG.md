# Changelog — Bharat GST Free Billing

All notable daily updates and feature releases of **Bharat GST Free Billing** (Created by **Abhishek Agrahari**) are documented here.
Bharat GST Free Billing follows a **Daily Continuous Release & Safe Auto-Update** cadence — updates deliver automatically without ever interrupting an open invoice or touching your saved business data.

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
