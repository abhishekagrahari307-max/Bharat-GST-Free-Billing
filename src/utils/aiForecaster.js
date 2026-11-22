// On-Device Predictive Cash-Flow (30-Day) & Dead-Stock / Stockout Velocity Forecaster (v3.1.0)
// 100% local statistical forecasting — zero external API calls.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

export function forecastCashFlowAndInventory({
  bills = [],
  purchases = [],
  expenses = [],
  products = [],
  asOfDate = new Date().toISOString().slice(0, 10),
} = {}) {
  const nowMs = Date.parse(asOfDate) || Date.now();
  const windowDays = 90;
  const cutoffMs = nowMs - windowDays * 86400000;

  let recentPaidSales = 0;
  let openReceivablesDue30d = 0;
  let overdueReceivables = 0;
  const itemQtySold90d = new Map();
  const itemLastSoldMs = new Map();

  for (const bill of Array.isArray(bills) ? bills : []) {
    if (!bill || bill.cancelled || bill?.data?.cancelled) continue;
    const d = bill.data || {};
    const type = String(d.invoiceType || bill.invoiceType || 'Tax Invoice');
    if (/quotation|estimate|proforma|challan|order|credit note/i.test(type)) continue;

    const total = r2(Math.abs(Number(bill.totalAmount ?? d.grandTotal ?? 0)));
    const status = String(bill.status || d.status || '').toLowerCase();
    const paid = status === 'paid' ? total : r2(Number(bill.amountPaid ?? d.amountPaid ?? 0));
    const due = r2(Math.max(0, total - paid));
    const invMs = Date.parse(String(bill.invoiceDate || d.invoiceDate || '').slice(0, 10));
    const dueMs = Date.parse(String(bill.dueDate || d.dueDate || bill.invoiceDate || '').slice(0, 10));

    if (Number.isFinite(invMs) && invMs >= cutoffMs) {
      recentPaidSales += paid;
    }
    if (due > 0) {
      if (Number.isFinite(dueMs) && dueMs < nowMs) {
        overdueReceivables += due;
      } else {
        openReceivablesDue30d += due;
      }
    }

    for (const it of Array.isArray(d.items) ? d.items : []) {
      const key = String(it?.productId || it?.name || it?.description || '').trim().toLowerCase();
      if (!key) continue;
      const qty = Number(it?.quantity ?? it?.qty ?? 0) || 0;
      if (Number.isFinite(invMs) && invMs >= cutoffMs && qty > 0) {
        itemQtySold90d.set(key, (itemQtySold90d.get(key) || 0) + qty);
      }
      if (Number.isFinite(invMs)) {
        const prev = itemLastSoldMs.get(key) || 0;
        if (invMs > prev) itemLastSoldMs.set(key, invMs);
      }
    }
  }

  let recentExpenseOutflow = 0;
  for (const exp of Array.isArray(expenses) ? expenses : []) {
    const ms = Date.parse(String(exp?.date || exp?.expenseDate || '').slice(0, 10));
    if (Number.isFinite(ms) && ms >= cutoffMs) {
      recentExpenseOutflow += Number(exp?.amount ?? exp?.totalAmount ?? 0) || 0;
    }
  }

  let payablesDue30d = 0;
  for (const pur of Array.isArray(purchases) ? purchases : []) {
    if (!pur || pur.cancelled) continue;
    const total = r2(Number(pur.totalAmount ?? pur.grandTotal ?? pur.amount ?? 0));
    const status = String(pur.status || '').toLowerCase();
    const paid = status === 'paid' ? total : r2(Number(pur.amountPaid || 0));
    payablesDue30d += Math.max(0, total - paid);
  }

  // Expected 30-day inflow = 30-day run-rate of cash sales + 80% of current receivables + 35% recovery of overdue
  const runRate30dSales = r2(recentPaidSales / 3);
  const expectedReceivableCollection = r2(openReceivablesDue30d * 0.8 + overdueReceivables * 0.35);
  const projectedInflow30d = r2(runRate30dSales + expectedReceivableCollection);
  const projectedOutflow30d = r2(recentExpenseOutflow / 3 + payablesDue30d * 0.75);
  const projectedNetCash30d = r2(projectedInflow30d - projectedOutflow30d);

  // Dead-stock & Stockout Velocity Analysis
  const deadStockItems = [];
  const reorderSoonItems = [];
  let lockedDeadStockCapital = 0;

  for (const p of Array.isArray(products) ? products : []) {
    if (!p || p.trackStock === false) continue;
    const stock = Number(p.stock ?? p.currentStock ?? 0) || 0;
    if (stock <= 0) continue;
    const cost = Number(p.purchasePrice ?? p.costPrice ?? p.sellingPrice ?? p.price ?? 0) || 0;
    const idKey = String(p.id || '').trim().toLowerCase();
    const nameKey = String(p.name || '').trim().toLowerCase();
    const sold90 = (itemQtySold90d.get(idKey) || 0) + (idKey !== nameKey ? (itemQtySold90d.get(nameKey) || 0) : 0);
    const lastMs = Math.max(itemLastSoldMs.get(idKey) || 0, itemLastSoldMs.get(nameKey) || 0);
    const daysUnsold = lastMs > 0 ? Math.floor((nowMs - lastMs) / 86400000) : 999;

    if (sold90 === 0 && stock > 0) {
      const capital = r2(stock * cost);
      lockedDeadStockCapital = r2(lockedDeadStockCapital + capital);
      deadStockItems.push({
        name: p.name || 'Item',
        stock,
        capitalLocked: capital,
        daysUnsold: daysUnsold === 999 ? '90+ (No recent sales)' : `${daysUnsold}d`,
      });
    } else if (sold90 > 0) {
      const dailyVelocity = sold90 / 90;
      const daysOfStockLeft = Math.round(stock / dailyVelocity);
      if (daysOfStockLeft <= 21) {
        reorderSoonItems.push({
          name: p.name || 'Item',
          stock,
          dailyVelocity: r2(dailyVelocity),
          daysLeft: daysOfStockLeft,
          suggestedOrderQty: Math.max(1, Math.ceil(dailyVelocity * 30 - stock)),
        });
      }
    }
  }

  deadStockItems.sort((a, b) => b.capitalLocked - a.capitalLocked);
  reorderSoonItems.sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    cashFlow: {
      runRate30dSales,
      expectedReceivableCollection,
      projectedInflow30d,
      projectedOutflow30d,
      projectedNetCash30d,
    },
    deadStockItems: deadStockItems.slice(0, 15),
    lockedDeadStockCapital,
    reorderSoonItems: reorderSoonItems.slice(0, 15),
  };
}
