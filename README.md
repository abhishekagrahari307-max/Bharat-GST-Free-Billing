# Bharat GST Free Billing 🇮🇳

**100% Free, Open-Source GST Billing, Invoicing, Inventory & Tax Return Web Software for Indian Businesses.**

Built for shopkeepers, wholesalers, traders, freelancers, consultants, service businesses, manufacturers, and Chartered Accountants — with zero subscriptions, zero ads, and zero locked features.

---

## Key Features

- **All GST Document Types**
  - Tax Invoice, Proforma Invoice, Quotation / Estimate, Credit Note, Debit Note, Bill of Supply, Composition Bill, Sales Order, Purchase Order, and Delivery Challan.
- **Automatic Indian GST Calculation**
  - Automatic **CGST + SGST**, **IGST**, **UTGST**, Cess, Reverse Charge (RCM), SEZ & LUT Exports, Place of Supply override, HSN / SAC lookup, and GSTIN checksum validation.
- **GST Return Filing & Reconciliation**
  - Portal-ready **GSTR-1 JSON** and **GSTR-3B JSON** exports, **GSTR-2B** ITC reconciliation, HSN Summary, and **e-Way Bill JSON** generation.
- **TDS, TCS & Income Tax**
  - Section 194C / 194J / 194Q TDS and Section 206C TCS with Form **26Q / 27EQ** summaries, plus **ITR-4** presumptive taxation & Advance Tax helper.
- **Inventory, Barcodes, Purchases & Bill OCR**
  - Multi-unit stock tracking (e.g., `Box = 12 Pcs`), barcode labels & scanner entry, purchase bills with offline **Tesseract OCR**, manufacturing BOM, stock adjustments, and low-stock alerts.
- **Payments, UPI QR, Cash Book & Bank Matching**
  - Dynamic **UPI Payment QR codes** on invoices, Receipt Vouchers, Cash Book, Expense Tracker, Bank Statement CSV/XLSX matching, Client Ledgers, and Aging Statements.
- **A4, A5 & POS Thermal Printing**
  - Multiple PDF visual templates (Modern, Corporate, Classic, Minimalist), **58mm / 80mm thermal receipt printing**, custom brand colours, company logo & digital signature, and 1-click WhatsApp sharing.
- **Multi-Business & Multi-Currency**
  - Switch effortlessly between multiple GSTINs / companies, invoice international clients in **22 currencies** (INR, USD, EUR, GBP, AED, AUD, SGD, etc.), protect books with PIN lock, and take automatic daily backups.

---

## Quick Start

### Prerequisites
- **Node.js 18+** and **npm**

### Run as Web Application (Production Build + Express Server)

```bash
npm install
npm start
```

This builds the frontend + documentation site and starts **Bharat GST Free Billing** at `http://0.0.0.0:3000` (configurable via `PORT` and `HOST` environment variables).

### Development Mode

```bash
npm run dev
```

### Run Unit Tests & Linter

```bash
npm run lint
npm run test:unit
```

---

## Project Structure

- `server.js` — Express backend API, local JSON data store (`data/`), automatic daily backups, PDF storage, and static web/PWA hosting.
- `src/` — React 19 + Vite frontend application (`InvoiceGenerator`, `Dashboard`, `GSTReturns`, `InventoryView`, `PurchaseBills`, `ClientsView`, `ReportsView`, `CashBook`, `IncomeTax`, `SettingsView`, `PrintSettings`).
- `public/` — PWA icons, service worker helpers, and offline OCR assets.
- `docs-site/` — Self-hosted user guide & documentation generator (served automatically at `/docs/`).
- `scripts/` — Automated unit test suites and build utilities.

---

## License

MIT License — see [LICENSE](./LICENSE). Based on open-source work originally by DiceCodes under the MIT License.
