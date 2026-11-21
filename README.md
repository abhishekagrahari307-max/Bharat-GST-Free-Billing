# Bharat GST Free Billing 🇮🇳 (`v3.0.0` · Full Double-Entry CA Suite + Multi-OS Installers + AI Voice PWA)

**100% Free, Open-Source (MIT), Offline-First & Cryptographically Secured AI Voice GST Billing, Full Double-Entry Accounting (`F4–F7`, Trial Balance, Schedule III Balance Sheet), SHA-256 Audit Trail, Inventory & Tax Filing Suite for Bharat.**

Created & maintained by **Abhishek Agrahari** — built for Indian retail shops, kirana stores, pharmacies, mobile/electronics dealers, jewellers, wholesalers, manufacturers, restaurants, freelancers, exporters, and Chartered Accountants. **Zero subscriptions, zero ads, zero signup, and zero locked features — forever.**

🌐 **Live Web & Installable Offline PWA:** [https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/](https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/)  
📖 **Complete Self-Hosted User Guide (35 Pages, EN + GST Guides):** [https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/user-guide/](https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/user-guide/)  
📄 **Machine-Readable Architecture Spec (`llms.txt`):** [https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/llms.txt](https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/llms.txt)  
📦 **Multi-OS Desktop Releases (`.exe`, `.deb`, `.AppImage`, `macOS`, `Portable ZIP`, `Docker`):** [GitHub Releases](https://github.com/abhishekagrahari307-max/Bharat-GST-Free-Billing/releases)

---

## 🚀 Exclusive Next-Gen Capabilities in `v3.0.0`

1. **📒 Full Double-Entry Accounting Engine (`F4–F7` Vouchers, Trial Balance & Schedule III Balance Sheet)**
   - Sales, Credit Notes, Purchases, Debit Notes & Expenses **auto-post balanced Debit/Credit ledger lines (`Dr === Cr`)** automatically — zero accounting complexity for shopkeepers!
   - Full Tally-style **`F4 Contra`**, **`F5 Payment`**, **`F6 Receipt`**, and **`F7 Journal Vouchers (JV)`** with keyboard shortcuts, live **Trial Balance**, and **Schedule III Balance Sheet** (with Closing Inventory Valuation & P&L Net Profit bridge).
2. **🔐 Tamper-Proof SHA-256 Hash-Chained Audit Trail + `.bharatca` CA Workpaper Desk**
   - Every voucher is cryptographically chained from Genesis (`0000…0000`) to HEAD via **SHA-256** (MCA Rule 3(1) audit-trail ready) with 1-click verification.
   - Export & inspect **AES-256-GCM encrypted `.bharatca` CA Workpaper Packages** containing Trial Balance, Balance Sheet, GST Readiness Score, Vouchers & Audit Proof.
3. **📦 Multi-OS Desktop Installers + Docker + Zero-Install PWA**
   - Automated CI/CD builds **Windows Setup `.exe`**, **Linux `.deb` & `.AppImage`**, **macOS App Bundle**, **Universal Portable ZIP**, plus root **`Dockerfile` & `docker-compose.yml`**.
4. **💾 Hybrid Tri-Mode Storage + Real-Time PC Hard-Drive Live Mirroring (`Zero Browser-Cache Risk`)**
   - **Instant Offline PWA** with automatic `navigator.storage.persist()` non-evictable storage lock on Android, iOS, Windows, macOS & Linux.
   - **Real-Time Direct PC Hard-Drive Folder Sync (`File System Access API`)**: Link any physical folder on your PC/Laptop (`D:\BharatGST-Books` or `Documents\BharatGST`) in *Settings → Data & Backups* — every bill save automatically mirrors `BharatGST-Live-Mirror.json` + dated/encrypted `.fgsb` backups directly onto your hard disk (safe even if browser cache is cleared or the browser is uninstalled!), plus optional **Google Drive Auto-Sync**.
   - **Full Localhost Node.js Desktop Server (`server.js` / Docker)**: Native OS filesystem `data/` storage, daily ZIP backups, and **Same-Wi-Fi Phone/Tablet QR + 6-Digit PIN Pairing**.
2. **🎙️ Bharat AI Voice & Fast Command Billing (`100% Offline`)**
   - Speak or type naturally in **Hinglish**, **Hindi (`हिंदी`)**, or **Indian English** inside *New Invoice* (`🎙️ Voice Bill`) — e.g. *"Client Sharma Medical, 3 Dolo 650 strip rate 32 gst 12%, 2 Basmati Rice 5kg rate 450 gst 5%"*.
   - Automatically matches saved Clients, Products, HSN/SAC codes, Selling Prices, Units, and GST slabs with zero cloud API keys and 100% privacy.
2. **🩺 Pre-Filing CA GST Health & Portal Readiness Auditor**
   - Built-in **0–100% GST Portal Readiness Score** inside *GST Returns* validating 15-character B2B GSTIN Mod-36 checksums, 4/6-digit HSN/SAC completeness, State vs Place-of-Supply consistency, CGST Rule 46 gapless invoice numbering, B2CL inter-state rules, and E-Way Bill (`₹50,000+`) thresholds — with 1-click Audit CSV export.
3. **🔄 Daily Continuous Safe Auto-Update Engine**
   - Ships on a **Daily Continuous Update Channel** (`version.json` + Service Worker background sync + Desktop in-app updater).
   - Automatically checks for updates on launch and every 30 minutes, applying updates **only when idle** (never while typing an open invoice) while preserving 100% of your saved books.
4. **🔐 Real WebCrypto AES-256-GCM Encrypted Vault & Multi-Staff Roles**
   - Encrypts browser/PWA books at rest using **AES-256-GCM + PBKDF2-SHA256 (310,000 iterations)** (`src/utils/cryptoVault.js`), **WebAuthn Fingerprint / Passkey unlock**, **Multi-Staff Role PINs** (*Owner / Billing Staff / CA Accountant*), per-business PIN lock, and a downloadable **24-character offline Recovery Key**.
5. **🏭 9 Specialized Indian Industry Presets + Business Type Wizard**
   - Pharmacy & Medical (*Batch No., Expiry, Drug Licence*), Mobile & Electronics (*IMEI / Serial No., Warranty*), Jewellery (*Purity, Gross/Net Wt, Making Charges*), Retail / Kirana POS, Transport (*LR No., Vehicle No.*), Textiles, Auto Parts, Hardware, and IT / Freelance Consulting.

---

## 📋 Complete Feature Matrix (Everything Included Free)

| Category | Included in Bharat GST Free Billing (`v2.7.0`) |
|---|---|
| **10 Document Types** | Tax Invoice, Proforma Invoice, Quotation / Estimate, Credit Note, Debit Note (Purchase Return), Bill of Supply, Composition Bill, Sales Order (with dispatch tracking), Purchase Order, Delivery Challan, Recurring Invoices |
| **Indian & Export Tax Engine** | Auto **CGST + SGST**, **IGST**, **UTGST**, Cess, Reverse Charge (RCM), SEZ & LUT Zero-Rated Exports, International Billing (**23 countries, 22 currencies** — VAT/SST/MwSt), GSTIN Mod-36 checksum + auto State/PAN fill |
| **GST, e-Invoice & Income Tax** | Portal-ready **GSTR-1 JSON & CSV**, **GSTR-3B JSON & CSV**, **GSTR-2B ITC Reconciliation**, **e-Invoice IRP JSON & QR**, **e-Way Bill JSON**, **TDS / TCS (Form 26Q / 27EQ)**, **Income Tax Calculator (Old vs New Regime, Sec 87A, 234B/234C)**, Books Period Lock after filing |
| **Printing & Customisation** | **5 Sheet Layouts + 8 Colour Palettes**, **5 Bill Languages** (*English, Hindi, Tamil, Marathi, Bengali*), **A4 / A5 / Letter & 58mm / 80mm POS Thermal Receipt Printing**, Dark Mode, custom UI Accent & Zoom, Logo, Stamp, Signature, Dynamic Offline UPI Payment QR |
| **Inventory, Barcode & OCR** | Real-time Stock Tracking, **Multi-Unit Conversion** (`1 Box = 12 Pcs`), **Barcode Scanner & Label Printing**, Serial / IMEI / Batch tracking, Low-Stock & Expiry Alerts, **Manufacturing BOM**, Purchase Bills with **Offline Tesseract Photo OCR** |
| **Migration & E-Commerce** | 1-Click Data Import from **Vyapar**, **Tally XML**, **Excel / CSV**, and **Flipkart Seller Orders → GST Invoices** |
| **Accounting & Reports** | **Profit & Loss (COGS)**, Party-wise Outstanding & Aging, **Client & Supplier Statement PDFs**, Stock Valuation, Product Performance, Receipt Vouchers, **Cash Book**, Expense Tracker, Cost Centres, **Bank Statement CSV/XLSX Reconciliation** |
| **Backup, Sync & Multi-Device** | Automatic Daily Snapshots, AES-256 Encrypted `.fgsb` Backups, **Google Drive Auto-Backup**, **Same-Wi-Fi Phone/Tablet QR Pairing**, Edit History Audit Trail, Trash Bin Recovery, 9-Check Startup Self-Healing Engine |
| **Platforms** | Instant Browser / Offline Installable **PWA** (Windows, macOS, Linux, Android, iPhone/iPad) + Local **Node.js Desktop Server** (`Windows / macOS / Linux / Docker`) |

---

## ⚡ Quick Start

### Use Instantly (Zero Install) or Install as Offline App
Open **[https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/](https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/)** in Chrome, Edge, Brave, or Safari and click **Settings → App & Offline Install → Install Desktop / Mobile App** for 100% offline use.

### Run Locally with Node.js (18+)

```bash
npm install
npm start
```

Starts **Bharat GST Free Billing** at `http://0.0.0.0:3000`.

### Development, Release Gate & Automated Tests (60+ Test Suites)

```bash
npm run dev
npm run lint
npm run test:unit
node scripts/guard-release.mjs
```

---

## 📄 License

Open-source under the [MIT License](./LICENSE) — Created by **Abhishek Agrahari**. Free forever for every business in Bharat.
