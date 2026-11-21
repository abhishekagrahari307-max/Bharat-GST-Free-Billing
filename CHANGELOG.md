# Changelog — Bharat GST Free Billing

All notable daily updates and feature releases of **Bharat GST Free Billing** (Created by **Abhishek Agrahari**) are documented here.
Bharat GST Free Billing follows a **Daily Continuous Release & Safe Auto-Update** cadence — updates deliver automatically without ever interrupting an open invoice or touching your saved business data.

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
