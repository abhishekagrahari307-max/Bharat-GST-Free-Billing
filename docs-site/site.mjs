// Site-wide settings and the sidebar. The sidebar order is also the
// Previous / Next order at the foot of each page.

export const SITE = {
  name: 'Bharat GST Free Billing',
  folder: 'docs',
  url: 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/user-guide/',
  appUrl: 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/',
  publisher: { name: 'Abhishek Agrahari', url: 'https://abhishekagrahari307-max.github.io/Bharat-GST-Free-Billing/' },
  version: '3.2.0',
  repo: 'https://github.com/abhishekagrahari307-max/Bharat-GST-Free-Billing',
  download: '../',
};

// Search-result titles and descriptions for the pages people search for most.
// Other pages use their own title and the first ~155 characters of their lead.
export const SEO = {
  index: {
    title: 'Bharat GST Free Billing: Complete User Guide & Documentation',
    description: 'Complete user guide for Bharat GST Free Billing (Created by Abhishek Agrahari). Make GST invoices, track payments and stock, and prepare GSTR-1 and GSTR-3B offline.',
  },
  install: {
    title: 'How to install Bharat GST Free Billing on Mobile, Windows, Mac and Linux',
    description: 'Install Bharat GST Free Billing as an offline PWA or desktop package on Android, iOS, Windows, macOS and Linux with zero signup.',
  },
  'first-invoice': {
    title: 'How to make your first GST invoice (step by step)',
    description: 'Make a GST tax invoice in five minutes: add your business, the client and items. CGST, SGST or IGST is worked out for you. Save, download the PDF and send it.',
  },
  invoices: {
    title: 'How to make a GST tax invoice: every field explained',
    description: 'Every part of the invoice screen: document types, GSTIN check, HSN codes, discounts, CGST/SGST/IGST, reverse charge, TDS and TCS, e-way bill, print and WhatsApp.',
  },
  'gst-returns': {
    title: 'GSTR-1 and GSTR-3B JSON from your invoices, and GSTR-2B matching',
    description: 'Build GSTR-1 and GSTR-3B from your invoices and purchases, download the JSON for the GST portal, and match your input tax credit against GSTR-2B.',
  },
  'thermal-printing': {
    title: 'GST bill printing on 58 mm and 80 mm thermal receipt printers',
    description: 'Print GST bills on 58 mm and 80 mm thermal printers: set up the printer, the print preview, auto-print on save, what a receipt shows, and fixes for faint or cut-off prints.',
  },
};

export const NAV = [
  { title: 'Start here', pages: ['index', 'install', 'install-mac', 'install-linux', 'update', 'first-run', 'first-invoice', 'gst-basics', 'security', 'privacy'] },
  { title: 'Invoicing', pages: ['invoices', 'invoice-options', 'thermal-printing', 'dashboard'] },
  { title: 'Clients, stock and payments', pages: ['clients', 'products', 'receipts', 'cash-book', 'recurring'] },
  { title: 'Buying', pages: ['purchases', 'expenses'] },
  { title: 'Tax and reports', pages: ['gst-returns', 'reports', 'income-tax'] },
  { title: 'Setting up', pages: ['settings', 'print-settings', 'backup', 'control-panel', 'phone'] },
  { title: 'Help', pages: ['shortcuts', 'troubleshooting', 'terminal', 'limitations', 'glossary', 'support'] },
];
