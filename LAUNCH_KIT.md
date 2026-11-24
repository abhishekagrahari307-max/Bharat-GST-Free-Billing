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

---

## 4. Local Vyapar Mandal / Traders WhatsApp Forward (Hinglish)

> 🇮🇳 **Vyapari Bhaiyon aur CA Saathiyon ke liye 100% FREE GST Billing & Stock Software!**
>
> Ab GST billing, Stock/Godown hisaab aur GSTR-1/3B return ke liye har saal ₹3,000–₹10,000 dene ki zaroorat nahi hai.
>
> **Bharat GST Free Billing (`v3.3.0`)** seedha aapke Mobile ya Computer browser me (bina internet ke bhi) chalta hai:
> ✅ **A4, A5 aur 58mm/80mm Thermal POS Bill** + Dynamic UPI Payment QR Code  
> ✅ **Hinglish Bolkar (Voice) Billing** + Barcode Scanner + Weighing Scale connect  
> ✅ **Tally XML aur Vyapar Excel** se 1-Click Party & Stock Import  
> ✅ **5G Mobile se Counter PC Live Sync** (Godown se bill bhejein, counter par turant print)  
> ✅ **CA-Ready GSTR-1 JSON, GSTR-2B Match, Trial Balance & Balance Sheet**  
> 🔒 **100% Private:** Aapka data kisi bahari company ke server par nahi jaata — seedha aapke PC/Phone me safe rehta hai.
>
> 👉 **Abhi Free Chala Kar Dekhein:** https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/  
> *(Chalak / फीडबैक ke liye app ke "About" tab me "Send Real-World Feedback" dabayein!)*

---

## 5. 10-Bill Real Shop Stress-Test Protocol (Day 1–2)

Create these **10 specific real-world transactions** before public rollout to verify every tax & rounding edge case:
1. **Local B2C Walk-in Cash Bill** (CGST + SGST, 5% + 18% mixed slabs + UPI QR scan check).
2. **Local B2B Registered Party Bill** (valid 15-digit GSTIN, intra-state CGST + SGST, 6-digit HSN).
3. **Inter-State B2B Bill** (different state GSTIN → verify automatic `IGST` switch).
4. **Inter-State Large B2C (`> ₹2,50,000`)** → verify `B2CL` bucket placement in GSTR-1 JSON.
5. **Discount + Round-Off Edge Case** (e.g., ₹999 inclusive/exclusive with `%` discount → verify `CGST === SGST` to the exact paisa).
6. **Credit Note (Sales Return)** against Bill #2 → verify `CDNR` table in GSTR-1 JSON & automatic stock restoration.
7. **Supplier Purchase Bill + Expense Entry** → verify ITC ledger & Section 17(5) / Rule 37 check.
8. **Partial Payment + FIFO Lump-Sum Receipt** (`F6 Receipt`) → verify party outstanding balance drops accurately.
9. **5G Mobile-to-PC P2P Bill** (turn off mobile data for 5 seconds, tap Push Bill → turn data back on → verify Offline Queue auto-flushes to PC).
10. **PC Hard-Drive Folder Mirror + Restore Test** (link a local folder → verify `BharatGST-Live-Mirror.json` updates live).

---

## 6. CA (Chartered Accountant) Review Handover Checklist (Day 3–4)

Export and email/WhatsApp two files from the stress-test above to your CA:
1. **`GSTR1_<GSTIN>_<MMYYYY>.json`** (from *GST Returns → GSTR-1*) — ask your CA to load it into the **Official GST Offline Tool** and confirm **0 schema errors** across `b2b`, `b2cl`, `b2cs`, `cdnr`, `hsn`, and `doc_issue`.
2. **`<FirmName>.bharatca` Workpaper Package** (from *Reports → CA Audit & Workpapers*) — ask your CA to verify:
   - `Trial Balance` (`Total Debit === Total Credit`)
   - `Schedule III Balance Sheet` + Closing Stock Valuation
   - `SHA-256 Audit Chain` integrity check (MCA Rule 3(1) compliance)
   - `Section 17(5)` & `Rule 37 (180-day)` Notice Shield flags

