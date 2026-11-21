// Pure Double-Entry Accounting Engine for Bharat GST Free Billing (v3.0.0)
// Supports Tally-style Vouchers (F4 Contra, F5 Payment, F6 Receipt, F7 Journal),
// automatic double-entry ledger derivation from Sales/Purchases/Expenses/CashBook,
// Trial Balance (Dr === Cr verified), and Schedule III Balance Sheet.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

export const VOUCHER_TYPES = [
  { code: 'CONTRA', shortcut: 'F4', label: 'Contra (F4)', hint: 'Cash deposit to bank, withdrawal, or bank-to-bank transfer' },
  { code: 'PAYMENT', shortcut: 'F5', label: 'Payment (F5)', hint: 'Pay supplier, rent, salary, tax challan, drawings, or asset purchase' },
  { code: 'RECEIPT', shortcut: 'F6', label: 'Receipt (F6)', hint: 'Receive customer payment, owner capital, bank loan, or misc income' },
  { code: 'JOURNAL', shortcut: 'F7', label: 'Journal (F7)', hint: 'Non-cash adjustment: depreciation, provisions, GST set-off, opening balances' },
];

export const CHART_OF_ACCOUNTS = [
  { code: 'OWNER_CAPITAL', name: "Owner's Capital Account", group: 'Shareholders / Proprietor Funds', nature: 'equity' },
  { code: 'DRAWINGS', name: 'Drawings / Personal Withdrawals', group: 'Shareholders / Proprietor Funds', nature: 'equity' },
  { code: 'SECURED_LOANS', name: 'Bank & Business Loans', group: 'Non-Current Liabilities (Loans)', nature: 'liability' },
  { code: 'SUNDRY_CREDITORS', name: 'Sundry Creditors (Trade Payables)', group: 'Current Liabilities', nature: 'liability' },
  { code: 'OUTPUT_CGST', name: 'Output CGST Payable', group: 'Duties & Taxes', nature: 'liability' },
  { code: 'OUTPUT_SGST', name: 'Output SGST Payable', group: 'Duties & Taxes', nature: 'liability' },
  { code: 'OUTPUT_IGST', name: 'Output IGST Payable', group: 'Duties & Taxes', nature: 'liability' },
  { code: 'OUTPUT_CESS', name: 'Output Cess Payable', group: 'Duties & Taxes', nature: 'liability' },
  { code: 'TDS_PAYABLE', name: 'TDS / TCS Payable', group: 'Duties & Taxes', nature: 'liability' },
  { code: 'EXPENSES_PAYABLE', name: 'Outstanding Expenses Payable', group: 'Current Liabilities', nature: 'liability' },
  { code: 'FIXED_ASSETS', name: 'Fixed Assets (Plant, IT & Furniture)', group: 'Property, Plant & Equipment', nature: 'asset' },
  { code: 'SUNDRY_DEBTORS', name: 'Sundry Debtors (Trade Receivables)', group: 'Current Assets', nature: 'asset' },
  { code: 'CASH_IN_HAND', name: 'Cash-in-Hand', group: 'Cash & Bank Balances', nature: 'asset' },
  { code: 'BANK_ACCOUNTS', name: 'Bank Accounts (Current / UPI / NEFT)', group: 'Cash & Bank Balances', nature: 'asset' },
  { code: 'INPUT_CGST', name: 'Input CGST (ITC Receivable)', group: 'Input Tax Credit (ITC)', nature: 'asset' },
  { code: 'INPUT_SGST', name: 'Input SGST (ITC Receivable)', group: 'Input Tax Credit (ITC)', nature: 'asset' },
  { code: 'INPUT_IGST', name: 'Input IGST (ITC Receivable)', group: 'Input Tax Credit (ITC)', nature: 'asset' },
  { code: 'TDS_RECEIVABLE', name: 'TDS / TCS Receivable', group: 'Current Assets', nature: 'asset' },
  { code: 'SALES_ACCOUNT', name: 'Sales Account (Goods & Services)', group: 'Revenue from Operations', nature: 'income' },
  { code: 'SALES_RETURNS', name: 'Sales Returns (Credit Notes)', group: 'Revenue from Operations', nature: 'expense' },
  { code: 'OTHER_INCOME', name: 'Other & Rounding Income', group: 'Other Income', nature: 'income' },
  { code: 'PURCHASE_ACCOUNT', name: 'Purchases Account', group: 'Purchases of Stock-in-Trade', nature: 'expense' },
  { code: 'PURCHASE_RETURNS', name: 'Purchase Returns (Debit Notes)', group: 'Purchases of Stock-in-Trade', nature: 'income' },
  { code: 'DIRECT_EXPENSES', name: 'Direct & Freight Expenses', group: 'Direct Expenses', nature: 'expense' },
  { code: 'OPERATING_EXPENSES', name: 'Operating & Administrative Expenses', group: 'Indirect Expenses', nature: 'expense' },
  { code: 'DEPRECIATION', name: 'Depreciation & Amortisation', group: 'Indirect Expenses', nature: 'expense' },
];

const ACCOUNT_MAP = Object.fromEntries(CHART_OF_ACCOUNTS.map((a) => [a.code, a]));

export function getAccountMeta(code) {
  return ACCOUNT_MAP[code] || {
    code: String(code || 'MISC'),
    name: String(code || 'Miscellaneous Account'),
    group: 'Current Assets',
    nature: 'asset',
  };
}

export function r2(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function isBankMode(mode) {
  const m = String(mode || '').toLowerCase();
  return /upi|bank|neft|rtgs|imps|card|cheque|check|online|transfer|dd|net/.test(m);
}

function cashOrBankAccount(mode) {
  return isBankMode(mode) ? 'BANK_ACCOUNTS' : 'CASH_IN_HAND';
}

function balanceVoucherLines(rawLines) {
  const merged = new Map();
  for (const l of rawLines) {
    if (!l || !l.account) continue;
    const dr = r2(Math.max(0, Number(l.debit) || 0));
    const cr = r2(Math.max(0, Number(l.credit) || 0));
    if (dr === 0 && cr === 0) continue;
    const prev = merged.get(l.account) || { account: l.account, debit: 0, credit: 0 };
    prev.debit = r2(prev.debit + dr);
    prev.credit = r2(prev.credit + cr);
    merged.set(l.account, prev);
  }
  const lines = [];
  for (const item of merged.values()) {
    if (item.debit > item.credit) {
      lines.push({ account: item.account, debit: r2(item.debit - item.credit), credit: 0 });
    } else if (item.credit > item.debit) {
      lines.push({ account: item.account, debit: 0, credit: r2(item.credit - item.debit) });
    }
  }
  const sumDr = r2(lines.reduce((s, x) => s + x.debit, 0));
  const sumCr = r2(lines.reduce((s, x) => s + x.credit, 0));
  const diff = r2(sumDr - sumCr);
  if (Math.abs(diff) > 0 && Math.abs(diff) <= 5) {
    if (diff > 0) {
      lines.push({ account: 'OTHER_INCOME', debit: 0, credit: diff });
    } else {
      lines.push({ account: 'OPERATING_EXPENSES', debit: Math.abs(diff), credit: 0 });
    }
  }
  return lines;
}

function extractBillPaidAmount(bill) {
  const d = bill?.data || bill || {};
  const total = r2(Math.abs(Number(bill?.totalAmount ?? d.grandTotal ?? d.totalAmount ?? 0)));
  const status = String(bill?.status || d.status || '').toLowerCase();
  if (status === 'paid') return { paid: total, mode: d.paymentMethod || d.paymentMode || 'Cash' };
  const payments = Array.isArray(bill?.payments) ? bill.payments : (Array.isArray(d.payments) ? d.payments : []);
  if (payments.length > 0) {
    const sum = r2(payments.reduce((s, p) => s + (Number(p?.amount) || 0), 0));
    const lastMode = payments[payments.length - 1]?.method || payments[payments.length - 1]?.mode || d.paymentMethod || 'Cash';
    return { paid: Math.min(total, Math.max(0, sum)), mode: lastMode };
  }
  const directPaid = r2(Number(bill?.amountPaid ?? d.amountPaid ?? 0));
  return { paid: Math.min(total, Math.max(0, directPaid)), mode: d.paymentMethod || d.paymentMode || 'Cash' };
}

function isNonPostingDocType(type) {
  const t = String(type || '').toLowerCase();
  return (
    t.includes('quotation') ||
    t.includes('estimate') ||
    t.includes('proforma') ||
    t.includes('challan') ||
    t.includes('sales order') ||
    t.includes('purchase order')
  );
}

/**
 * Automatically derives balanced double-entry journal vouchers from operational records.
 */
export function deriveAutoJournalEntries({
  bills = [],
  purchases = [],
  debitNotes = [],
  expenses = [],
  fromDate = '',
  toDate = '',
} = {}) {
  const inRange = (dt) => {
    const s = String(dt || '').slice(0, 10);
    if (!s) return true;
    if (fromDate && s < fromDate) return false;
    if (toDate && s > toDate) return false;
    return true;
  };

  const entries = [];

  // 1. Sales Invoices & Credit Notes
  for (const bill of Array.isArray(bills) ? bills : []) {
    if (!bill || bill.cancelled || bill?.data?.cancelled || String(bill.status || '').toLowerCase() === 'cancelled') continue;
    const d = bill.data || {};
    const docType = d.invoiceType || bill.invoiceType || 'Tax Invoice';
    if (isNonPostingDocType(docType)) continue;
    const date = String(bill.invoiceDate || d.invoiceDate || bill.createdAt || '').slice(0, 10);
    if (!inRange(date)) continue;

    const total = r2(Math.abs(Number(bill.totalAmount ?? d.grandTotal ?? 0)));
    if (total <= 0) continue;
    const cgst = r2(Math.abs(Number(d.totalCgst ?? d.cgstAmount ?? 0)));
    const sgst = r2(Math.abs(Number(d.totalSgst ?? d.sgstAmount ?? 0)));
    const igst = r2(Math.abs(Number(d.totalIgst ?? d.igstAmount ?? 0)));
    const cess = r2(Math.abs(Number(d.totalCess ?? d.cessAmount ?? 0)));
    const totalTax = r2(cgst + sgst + igst + cess);
    const taxable = r2(Math.max(0, total - totalTax));
    const { paid, mode } = extractBillPaidAmount(bill);
    const due = r2(Math.max(0, total - paid));
    const party = bill.clientName || d.client?.name || 'Walk-in Customer';
    const isCreditNote = String(docType).toLowerCase().includes('credit note');

    const raw = [];
    if (!isCreditNote) {
      if (paid > 0) raw.push({ account: cashOrBankAccount(mode), debit: paid, credit: 0 });
      if (due > 0) raw.push({ account: 'SUNDRY_DEBTORS', debit: due, credit: 0 });
      if (taxable > 0) raw.push({ account: 'SALES_ACCOUNT', debit: 0, credit: taxable });
      if (cgst > 0) raw.push({ account: 'OUTPUT_CGST', debit: 0, credit: cgst });
      if (sgst > 0) raw.push({ account: 'OUTPUT_SGST', debit: 0, credit: sgst });
      if (igst > 0) raw.push({ account: 'OUTPUT_IGST', debit: 0, credit: igst });
      if (cess > 0) raw.push({ account: 'OUTPUT_CESS', debit: 0, credit: cess });
    } else {
      if (taxable > 0) raw.push({ account: 'SALES_RETURNS', debit: taxable, credit: 0 });
      if (cgst > 0) raw.push({ account: 'OUTPUT_CGST', debit: cgst, credit: 0 });
      if (sgst > 0) raw.push({ account: 'OUTPUT_SGST', debit: sgst, credit: 0 });
      if (igst > 0) raw.push({ account: 'OUTPUT_IGST', debit: igst, credit: 0 });
      if (cess > 0) raw.push({ account: 'OUTPUT_CESS', debit: cess, credit: 0 });
      if (paid > 0) raw.push({ account: cashOrBankAccount(mode), debit: 0, credit: paid });
      if (due > 0) raw.push({ account: 'SUNDRY_DEBTORS', debit: 0, credit: due });
    }

    const lines = balanceVoucherLines(raw);
    if (lines.length >= 2) {
      entries.push({
        id: `auto-bill-${bill.id || bill.invoiceNumber}`,
        voucherNo: bill.invoiceNumber || d.invoiceNumber || 'INV',
        voucherType: isCreditNote ? 'CREDIT_NOTE' : 'SALES',
        date: date || new Date().toISOString().slice(0, 10),
        narration: `${docType} — ${party}`,
        source: 'auto',
        lines,
      });
    }
  }

  // 2. Purchase Bills
  for (const pur of Array.isArray(purchases) ? purchases : []) {
    if (!pur || pur.cancelled) continue;
    const date = String(pur.billDate || pur.date || pur.createdAt || '').slice(0, 10);
    if (!inRange(date)) continue;
    const total = r2(Math.abs(Number(pur.totalAmount ?? pur.grandTotal ?? pur.amount ?? 0)));
    if (total <= 0) continue;
    const cgst = r2(Math.abs(Number(pur.cgst ?? pur.totalCgst ?? 0)));
    const sgst = r2(Math.abs(Number(pur.sgst ?? pur.totalSgst ?? 0)));
    const igst = r2(Math.abs(Number(pur.igst ?? pur.totalIgst ?? 0)));
    const taxFallback = cgst + sgst + igst === 0 ? r2(Math.abs(Number(pur.gstAmount ?? pur.taxAmount ?? 0))) : 0;
    const effCgst = taxFallback > 0 ? r2(taxFallback / 2) : cgst;
    const effSgst = taxFallback > 0 ? r2(taxFallback - effCgst) : sgst;
    const totalTax = r2(effCgst + effSgst + igst);
    const taxable = r2(Math.max(0, total - totalTax));
    const status = String(pur.status || '').toLowerCase();
    const paid = status === 'paid'
      ? total
      : Math.min(total, Math.max(0, r2(Number(pur.amountPaid || 0))));
    const due = r2(Math.max(0, total - paid));
    const mode = pur.paymentMethod || pur.paymentMode || 'Bank';

    const raw = [];
    if (taxable > 0) raw.push({ account: 'PURCHASE_ACCOUNT', debit: taxable, credit: 0 });
    if (effCgst > 0) raw.push({ account: 'INPUT_CGST', debit: effCgst, credit: 0 });
    if (effSgst > 0) raw.push({ account: 'INPUT_SGST', debit: effSgst, credit: 0 });
    if (igst > 0) raw.push({ account: 'INPUT_IGST', debit: igst, credit: 0 });
    if (paid > 0) raw.push({ account: cashOrBankAccount(mode), debit: 0, credit: paid });
    if (due > 0) raw.push({ account: 'SUNDRY_CREDITORS', debit: 0, credit: due });

    const lines = balanceVoucherLines(raw);
    if (lines.length >= 2) {
      entries.push({
        id: `auto-pur-${pur.id || pur.billNumber}`,
        voucherNo: pur.billNumber || pur.invoiceNumber || 'PUR',
        voucherType: 'PURCHASE',
        date: date || new Date().toISOString().slice(0, 10),
        narration: `Purchase — ${pur.vendorName || pur.supplierName || 'Supplier'}`,
        source: 'auto',
        lines,
      });
    }
  }

  // 3. Purchase Returns (Debit Notes)
  for (const dn of Array.isArray(debitNotes) ? debitNotes : []) {
    if (!dn || dn.cancelled) continue;
    const date = String(dn.date || dn.noteDate || dn.createdAt || '').slice(0, 10);
    if (!inRange(date)) continue;
    const total = r2(Math.abs(Number(dn.totalAmount ?? dn.grandTotal ?? dn.amount ?? 0)));
    if (total <= 0) continue;
    const igst = r2(Math.abs(Number(dn.igst ?? dn.totalIgst ?? 0)));
    const cgst = r2(Math.abs(Number(dn.cgst ?? dn.totalCgst ?? 0)));
    const sgst = r2(Math.abs(Number(dn.sgst ?? dn.totalSgst ?? 0)));
    const taxable = r2(Math.max(0, total - cgst - sgst - igst));
    const lines = balanceVoucherLines([
      { account: 'SUNDRY_CREDITORS', debit: total, credit: 0 },
      { account: 'PURCHASE_RETURNS', debit: 0, credit: taxable },
      { account: 'INPUT_CGST', debit: 0, credit: cgst },
      { account: 'INPUT_SGST', debit: 0, credit: sgst },
      { account: 'INPUT_IGST', debit: 0, credit: igst },
    ]);
    if (lines.length >= 2) {
      entries.push({
        id: `auto-dn-${dn.id || dn.noteNumber}`,
        voucherNo: dn.noteNumber || 'DN',
        voucherType: 'DEBIT_NOTE',
        date: date || new Date().toISOString().slice(0, 10),
        narration: `Debit Note — ${dn.vendorName || dn.supplierName || 'Supplier'}`,
        source: 'auto',
        lines,
      });
    }
  }

  // 4. Business Expenses
  for (const exp of Array.isArray(expenses) ? expenses : []) {
    if (!exp) continue;
    const date = String(exp.date || exp.expenseDate || exp.createdAt || '').slice(0, 10);
    if (!inRange(date)) continue;
    const total = r2(Math.abs(Number(exp.amount ?? exp.totalAmount ?? 0)));
    if (total <= 0) continue;
    const gst = r2(Math.abs(Number(exp.gstAmount || 0)));
    const base = r2(Math.max(0, total - gst));
    const cat = String(exp.category || '').toLowerCase();
    const expAccount = /freight|carriage|transport|packing|labour|direct/.test(cat)
      ? 'DIRECT_EXPENSES'
      : 'OPERATING_EXPENSES';
    const halfGst = r2(gst / 2);
    const otherHalf = r2(gst - halfGst);
    const payAcct = cashOrBankAccount(exp.paymentMethod || exp.paymentMode || 'Cash');

    const raw = [{ account: expAccount, debit: base, credit: 0 }];
    if (halfGst > 0) raw.push({ account: 'INPUT_CGST', debit: halfGst, credit: 0 });
    if (otherHalf > 0) raw.push({ account: 'INPUT_SGST', debit: otherHalf, credit: 0 });
    raw.push({ account: payAcct, debit: 0, credit: total });

    const lines = balanceVoucherLines(raw);
    if (lines.length >= 2) {
      entries.push({
        id: `auto-exp-${exp.id || date}`,
        voucherNo: exp.reference || `EXP-${String(exp.id || '').slice(-4).toUpperCase() || '01'}`,
        voucherType: 'EXPENSE',
        date: date || new Date().toISOString().slice(0, 10),
        narration: `${exp.category || 'Expense'}${exp.description ? ` — ${exp.description}` : ''}`,
        source: 'auto',
        lines,
      });
    }
  }

  return entries;
}

/**
 * Validates & normalises a manual Tally-style voucher (F4 Contra, F5 Payment, F6 Receipt, F7 Journal).
 */
export function validateManualVoucher(draft = {}) {
  const voucherType = VOUCHER_TYPES.some((v) => v.code === draft.voucherType) ? draft.voucherType : 'JOURNAL';
  const date = String(draft.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rawLines = Array.isArray(draft.lines) ? draft.lines : [];
  const cleanedLines = [];
  for (const line of rawLines) {
    if (!line || !line.account) continue;
    const debit = r2(Math.max(0, Number(line.debit) || 0));
    const credit = r2(Math.max(0, Number(line.credit) || 0));
    if (debit === 0 && credit === 0) continue;
    if (debit > 0 && credit > 0) {
      return { valid: false, error: 'Each voucher line must be either Debit OR Credit, not both on the same line.' };
    }
    cleanedLines.push({ account: String(line.account), debit, credit });
  }
  if (cleanedLines.length < 2) {
    return { valid: false, error: 'A double-entry voucher needs at least 2 ledger lines (1 Debit and 1 Credit).' };
  }
  const totalDebit = r2(cleanedLines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = r2(cleanedLines.reduce((s, l) => s + l.credit, 0));
  const diff = r2(Math.abs(totalDebit - totalCredit));
  if (totalDebit <= 0 || diff >= 0.01) {
    return {
      valid: false,
      error: `Total Debit (₹${totalDebit.toFixed(2)}) must equal Total Credit (₹${totalCredit.toFixed(2)}) — difference ₹${diff.toFixed(2)}.`,
      totalDebit,
      totalCredit,
      difference: diff,
    };
  }
  if (voucherType === 'CONTRA') {
    const allCashBank = cleanedLines.every((l) => l.account === 'CASH_IN_HAND' || l.account === 'BANK_ACCOUNTS');
    if (!allCashBank) {
      return { valid: false, error: 'Contra (F4) vouchers can only move money between Cash-in-Hand and Bank Accounts.' };
    }
  }
  return {
    valid: true,
    voucher: {
      id: draft.id || `jv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      voucherNo: String(draft.voucherNo || '').trim() || `${voucherType.slice(0, 3)}-${Date.now().toString().slice(-5)}`,
      voucherType,
      date,
      narration: String(draft.narration || '').trim() || `${voucherType} Voucher`,
      source: 'manual',
      createdAt: draft.createdAt || new Date().toISOString(),
      lines: cleanedLines,
    },
    totalDebit,
    totalCredit,
    difference: 0,
  };
}

/**
 * Computes the complete Trial Balance from all journal vouchers (auto + manual).
 */
export function computeTrialBalance(vouchers = []) {
  const ledger = new Map();
  for (const v of Array.isArray(vouchers) ? vouchers : []) {
    if (!v || !Array.isArray(v.lines)) continue;
    for (const line of v.lines) {
      if (!line || !line.account) continue;
      const meta = getAccountMeta(line.account);
      const cur = ledger.get(line.account) || {
        code: line.account,
        name: meta.name,
        group: meta.group,
        nature: meta.nature,
        grossDebit: 0,
        grossCredit: 0,
        voucherCount: 0,
      };
      cur.grossDebit = r2(cur.grossDebit + (Number(line.debit) || 0));
      cur.grossCredit = r2(cur.grossCredit + (Number(line.credit) || 0));
      cur.voucherCount += 1;
      ledger.set(line.account, cur);
    }
  }

  const rows = [];
  for (const item of ledger.values()) {
    const net = r2(item.grossDebit - item.grossCredit);
    const closingDebit = net > 0 ? net : 0;
    const closingCredit = net < 0 ? Math.abs(net) : 0;
    if (closingDebit === 0 && closingCredit === 0 && item.grossDebit === 0 && item.grossCredit === 0) continue;
    rows.push({
      ...item,
      closingDebit,
      closingCredit,
    });
  }

  const natureOrder = { asset: 1, liability: 2, equity: 3, income: 4, expense: 5 };
  rows.sort((a, b) => (natureOrder[a.nature] || 9) - (natureOrder[b.nature] || 9) || a.name.localeCompare(b.name));

  const totalDebit = r2(rows.reduce((s, r) => s + r.closingDebit, 0));
  const totalCredit = r2(rows.reduce((s, r) => s + r.closingCredit, 0));
  const difference = r2(Math.abs(totalDebit - totalCredit));

  return {
    rows,
    totalDebit,
    totalCredit,
    difference,
    isBalanced: difference < 0.01,
  };
}

/**
 * Computes a Schedule III-aligned Balance Sheet + Trading/P&L Net Profit bridge.
 * Closing Inventory valuation (`closingStockValue`) appears in Current Assets AND
 * Trading Account credit, preserving exact Assets === Equity + Liabilities identity.
 */
export function computeBalanceSheet(trialBalance, { closingStockValue = 0 } = {}) {
  const rows = Array.isArray(trialBalance?.rows) ? trialBalance.rows : [];
  const stockVal = r2(Math.max(0, Number(closingStockValue) || 0));

  let totalIncome = 0;
  let totalExpense = 0;
  const assets = [];
  const liabilities = [];
  const equity = [];

  for (const r of rows) {
    const netDr = r2(r.closingDebit - r.closingCredit); // >0 debit balance, <0 credit balance
    if (r.nature === 'income') {
      totalIncome = r2(totalIncome + (r.closingCredit - r.closingDebit));
    } else if (r.nature === 'expense') {
      totalExpense = r2(totalExpense + (r.closingDebit - r.closingCredit));
    } else if (r.nature === 'equity') {
      // Credit balance is positive equity; Drawings (debit balance) reduces equity
      equity.push({
        code: r.code,
        name: r.name,
        group: r.group,
        amount: r2(-netDr),
      });
    } else if (r.nature === 'liability') {
      if (netDr <= 0) {
        liabilities.push({ code: r.code, name: r.name, group: r.group, amount: Math.abs(netDr) });
      } else {
        assets.push({ code: r.code, name: `${r.name} (Advance / Debit Bal)`, group: 'Current Assets', amount: netDr });
      }
    } else {
      // asset
      if (netDr >= 0) {
        assets.push({ code: r.code, name: r.name, group: r.group, amount: netDr });
      } else {
        liabilities.push({ code: r.code, name: `${r.name} (Overdraft / Credit Bal)`, group: 'Current Liabilities', amount: Math.abs(netDr) });
      }
    }
  }

  if (stockVal > 0) {
    assets.push({
      code: 'CLOSING_STOCK',
      name: 'Closing Inventory (Valued at Cost)',
      group: 'Inventories',
      amount: stockVal,
    });
  }

  const netProfit = r2(totalIncome + stockVal - totalExpense);
  equity.push({
    code: 'CURRENT_PERIOD_PROFIT',
    name: netProfit >= 0 ? 'Surplus — Net Profit for Period (from P&L)' : 'Deficit — Net Loss for Period (from P&L)',
    group: 'Reserves & Surplus',
    amount: netProfit,
  });

  const totalEquity = r2(equity.reduce((s, x) => s + x.amount, 0));
  const totalLiabilities = r2(liabilities.reduce((s, x) => s + x.amount, 0));
  const totalEquityAndLiabilities = r2(totalEquity + totalLiabilities);
  const totalAssets = r2(assets.reduce((s, x) => s + x.amount, 0));
  const difference = r2(Math.abs(totalAssets - totalEquityAndLiabilities));

  return {
    equity: equity.filter((x) => Math.abs(x.amount) >= 0.01),
    liabilities: liabilities.filter((x) => Math.abs(x.amount) >= 0.01),
    assets: assets.filter((x) => Math.abs(x.amount) >= 0.01),
    totalIncome,
    totalExpense,
    closingStockValue: stockVal,
    netProfit,
    totalEquity,
    totalLiabilities,
    totalEquityAndLiabilities,
    totalAssets,
    difference,
    isBalanced: difference < 0.01,
  };
}

/**
 * Computes total inventory valuation at cost (`stock * purchasePrice`) from products list.
 */
export function computeInventoryValuation(products = []) {
  let total = 0;
  for (const p of Array.isArray(products) ? products : []) {
    if (!p || p.trackStock === false) continue;
    const qty = Number(p.stock ?? p.currentStock ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const unitCost = Number(p.purchasePrice ?? p.costPrice ?? p.sellingPrice ?? p.price ?? 0);
    if (!Number.isFinite(unitCost) || unitCost <= 0) continue;
    total += qty * unitCost;
  }
  return r2(total);
}
