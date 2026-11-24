# 🚀 Bharat GST Free Billing `v3.3.0` — Community & Product Launch Kit

Ready-to-publish launch announcements for **LinkedIn**, **Reddit**, **Product Hunt**, and **X / WhatsApp Business & CA Communities**.

---

## 1. LinkedIn Post (Founders, CAs, Traders & Indian SMB Network)

**Headline: Why should Indian small businesses pay ₹5,000+/year or upload private ledgers to third-party servers just to generate GST bills and GSTR-1/2B files?**

Today I’m launching **Bharat GST Free Billing v3.3.0** — a 100% free, open-source (MIT), **Browser-Native ERP & AI GST Compliance OS** built for Indian shopkeepers, wholesalers, manufacturers, freelancers, and Chartered Accountants.

Zero subscriptions. Zero ads. Zero backend cloud lock-in.

Here is what runs right inside your browser (and offline PWA / desktop):

🔹 **Resilient 5G Mobile-to-PC Live Sync (Serverless WebRTC + Offline Queue):** Scan a QR + 4-digit Counter PIN on your phone over 5G/Wi-Fi. Godown staff pull live stock and push invoices to the counter PC in `<100ms` — and if 5G drops in the basement, bills queue locally and auto-flush on reconnect!
🔹 **1-Click Tally XML & Vyapar Excel Migration:** Import your existing TallyPrime `<LEDGER>` / `<STOCKITEM>` XML or Vyapar `.xlsx`/`.csv` stock & party masters in seconds.
🔹 **CA-Grade Double-Entry & GST Notice Shield:** Auto Double-Entry `F4–F7` Vouchers, Trial Balance, Schedule III Balance Sheet, SHA-256 Hash-Chained Audit Trail, `.bharatca` encrypted CA packages, **GSTR-1 / 3B / GSTR-9 / CMP-08**, **AI Fuzzy GSTR-2B Matcher** (`INV/26-27/0045` ↔ `45`), **Section 17(5) Blocked ITC**, and **CGST Rule 37 (180-day reversal)** alerts.
🔹 **Desktop-Class Data Safety:** Non-evictable IndexedDB + **Real-Time Hard-Drive Folder Mirroring** (`BharatGST-Live-Mirror.json` via File System Access API) + AES-256-GCM `.fgsb` encrypted vaults.
🔹 **POS & Direct Hardware Bridge:** 58mm/80mm thermal receipts, dynamic NPCI `upi://pay` QR codes, **WebSerial** electronic weighing scale live capture, and **WebUSB** 0.2s silent ESC/POS printing.
🔹 **100% Offline Hinglish AI Voice Billing:** Speak your invoice naturally in Hinglish, Hindi, or English.

Built for Bharat. Free forever.

🔗 **Try Live App / Install Offline PWA:** https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/  
📖 **35-Page User Guide:** https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/user-guide/  
💻 **GitHub & Release v3.3.0 (MIT):** https://github.com/abhishekagrahari307-max/Bharat-GST-Free-Billing/releases/tag/v3.3.0

`#MakeInIndia #GST #OpenSource #WebRTC #PWA #FinTech #IndianBusiness #CharteredAccountants #TallyAlternative`

---

## 2. Reddit Post (`r/developersIndia`, `r/CharteredAccountants`, `r/IndiaInvestments`)

**Title:** I built a 100% browser-native, serverless GST Billing & Double-Entry ERP (GSTR-1/2B JSON, Resilient 5G WebRTC P2P Sync, Tally/Vyapar Importer, WebSerial Weighing Scale) — Free & MIT Open Source (`v3.3.0`)

Hey everyone,

Most billing tools in India either lock GSTR-1/2B exports behind yearly paywalls, upload sensitive customer/pricing books to proprietary clouds, or require heavy Windows-only installations.

I just shipped **Bharat GST Free Billing v3.3.0**, engineered to run 100% client-side (with optional localhost Node.js / Docker server mode) while matching full desktop ERP capabilities:

- **Hybrid Tri-Mode Storage:** Persistent IndexedDB (`navigator.storage.persist()`) + **File System Access API** (`BharatGST-Live-Mirror.json` mirrors directly onto a local PC folder on every bill save) + WebCrypto **AES-256-GCM** (310,000 PBKDF2 rounds) vault.
- **Resilient Serverless 5G P2P Sync:** Uses WebRTC + STUN with a 4-digit PIN handshake, 10s heartbeat, auto-reconnect, and a durable local **Offline Sync Queue** so warehouse staff on 5G mobile data never lose an order even when signal drops.
- **1-Click Tally XML & Vyapar `.xlsx`/`.csv` Bridge:** Zero-CVE `fflate` spreadsheet parser + UTF-16LE BOM-safe Tally XML parser for instant party & stock migration.
- **CA Double-Entry & Notice Prevention:** Auto Double-Entry postings + `F4–F7` vouchers, Trial Balance, Schedule III Balance Sheet, SHA-256 tamper-proof hash chain, fuzzy GSTR-2B reconciliation, Section 17(5) blocked ITC & Rule 37 (180-day unpaid) alerts, and encrypted `.bharatca` workpaper exports.
- **Direct Hardware APIs:** `WebUSB` / `WebSerial` for 0.2s silent ESC/POS thermal receipt printing and live kg/g weight capture from retail electronic scales.

- **Live App / Offline PWA:** https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/
- **Architecture Spec (`llms.txt`):** https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/llms.txt
- **GitHub Repo & v3.3.0 Release:** https://github.com/abhishekagrahari307-max/Bharat-GST-Free-Billing/releases/tag/v3.3.0

Would love technical & accounting feedback from devs, shop owners, and CAs!

---

## 3. Product Hunt Listing

- **Name:** Bharat GST Free Billing `v3.3.0`
- **Tagline:** Free, serverless GST ERP, Double-Entry Books & POS in your browser with 5G P2P sync.
- **Short Description:** Create GST invoices by Hinglish voice, export portal-ready GSTR-1/3B JSONs, fuzzy-match GSTR-2B, maintain Tally-style Trial Balance & Schedule III Balance Sheets, import Tally XML / Vyapar Excel in 1 click, connect weighing scales via WebSerial, and sync mobile orders to your counter PC over resilient 5G WebRTC—100% free & MIT open-source.
