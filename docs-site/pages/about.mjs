// About & Support - Complete Guide companion page for Bharat GST Free Billing
// (Created by Abhishek Agrahari). Preserves all section anchors referenced by
// HelpButton components across the app.
import { SITE } from '../site.mjs';

const ui = (s) => `<span class="ui">${s}</span>`;
const share = encodeURIComponent(`I make my GST invoices with Bharat GST Free Billing (Created by Abhishek Agrahari). It is 100% free, works offline and keeps data safe on your own device: ${SITE.appUrl}`);

export default [
{
  slug: 'support',
  title: 'About Bharat GST Free Billing',
  nav: 'About & Support',
  lead: 'Created by Abhishek Agrahari — 100% free, offline-ready, AES-256-GCM encrypted GST billing, inventory, and tax suite for businesses across Bharat.',
  body: `
<section id="about">
<h2>Free forever for every business in Bharat</h2>
<p><b>Bharat GST Free Billing</b> is created and maintained by <b>Abhishek Agrahari</b> for Indian shopkeepers, wholesalers, freelancers, manufacturers, clinics, pharmacies, and CAs. There are no ads, no mandatory accounts, no subscriptions, and zero locked features — your invoices, client ledgers, and inventory stay 100% under your control on your own device.</p>
<p>Under <b>Safe and private</b> in the app, each card explains how your business books are protected: local-first IndexedDB &amp; AES-256-GCM vault encryption, offline PWA operation, zero trackers, automatic daily snapshots, encrypted <code>.fgsb</code> backups, multi-staff PIN access, and self-healing diagnostics. See <a href="security.html">Is it safe? Security and privacy</a> and <a href="privacy.html">Privacy Notice</a>.</p>
</section>

<section id="upi">
<h2>Built-in UPI payment QR on your invoices</h2>
<p>Bharat GST Free Billing never charges you fees or takes commissions. You can add your own business UPI ID in <b>Settings → Company → Bank &amp; UPI</b> so every invoice prints a dynamic UPI QR code payable directly to your own bank account via GPay, PhonePe, Paytm, or BHIM.</p>
<div class="table-wrap"><table>
  <tr><th>Feature</th><th>How it works</th></tr>
  <tr><td><b>Dynamic Invoice Amount</b></td><td>Encodes the exact net receivable amount and invoice number so customers never mistype figures.</td></tr>
  <tr><td><b>Multi-Bank Switcher</b></td><td>Save multiple bank accounts / UPI IDs in Settings and choose which account appears on each invoice.</td></tr>
  <tr><td><b>100% Offline QR Generation</b></td><td>QR codes are drawn directly inside your browser without calling any third-party QR server.</td></tr>
</table></div>
</section>

<section id="supporters-card">
<h2>Community milestones</h2>
<p>Every feature in Bharat GST Free Billing — Tax Invoice, Proforma, Quotation, Credit Note, Bill of Supply, Composition Bill, Delivery Challan, GSTR-1 / GSTR-3B JSON, GSTR-2B reconciliation, e-Way Bill JSON, Inventory, Purchase OCR, Expense Tracker, and Cash Book — is unlocked for every user from day one.</p>
</section>

<section id="supporters" class="supporters" hidden>
<h2>Community</h2>
<p class="supporters-total"></p>
</section>

<section id="free-ways">
<h2>Share with fellow businesses</h2>
<p>If Bharat GST Free Billing saves time for your shop, office, or CA practice, share it with another business owner:</p>
<ul>
  <li><strong><a href="https://wa.me/?text=${share}">Share on WhatsApp</a></strong>: send Bharat GST Free Billing to a fellow trader, shopkeeper, or accountant.</li>
  <li><strong>Export regular backups</strong>: use <a href="backup.html">Settings → Data &amp; Backups</a> to download encrypted <code>.fgsb</code> or JSON backups to your USB drive or Google Drive.</li>
</ul>
</section>

<section id="weekly">
<h2>Continuous updates &amp; self-healing protection</h2>
<p>Bharat GST Free Billing updates safely in the background without ever interrupting an open invoice. Before any update or restore, your existing invoices, clients, products, and print settings remain untouched on your device.</p>
<div class="table-wrap"><table>
  <tr><th>Protection</th><th>What it does</th></tr>
  <tr><td>${ui('Safe Idle Update')}</td><td>Applies new app versions only when you are not typing an unsaved bill.</td></tr>
  <tr><td>${ui('Self-Heal Diagnostics')}</td><td>Automatically checks storage quota, invoice sequence counters, backup freshness, and print sync.</td></tr>
  <tr><td>${ui('Problem Log')}</td><td>Records unexpected errors locally in <a href="troubleshooting.html#problem-log">Troubleshooting &amp; Problem Log</a> with zero PII sent anywhere.</td></tr>
</table></div>
</section>

<section id="whats-new">
<h2>What's new</h2>
<p>The <b>What's new</b> card in the app summarizes recent improvements and fixes included in your current version. After an update, a quick highlight card shows what was added or improved — never while you are in the middle of billing or while the app is locked.</p>
</section>

<section id="services">
<h2>Industry-ready out of the box</h2>
<p>Bharat GST Free Billing adapts to your exact line of work in <b>Settings → Features → Industry Presets</b>: Pharmacy &amp; Medical (Batch, Expiry, Drug Licence), Mobile &amp; Electronics (IMEI / Serial, Warranty), Jewellery (Purity, Gross/Net Wt, Making Charges), Retail / Kirana (Thermal POS, MRP), Transport, Freelance / IT Services, Textiles, Auto Parts, and Hardware.</p>
</section>

<section id="in-the-app">
<h2>In the app</h2>
<p>Open <b>About</b> near the bottom of the left sidebar inside <a href="../">Bharat GST Free Billing</a> to view platform highlights, security &amp; privacy guarantees, release notes, and the local Problem Log.</p>
</section>
`,
},
];
