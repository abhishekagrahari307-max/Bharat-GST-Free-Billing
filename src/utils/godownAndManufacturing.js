// Module B (v5.0.0): Enterprise Supply Chain — Multi-Godown Stock Transfer,
// FEFO (First-Expiry First-Out) Batch Allocator, Manufacturing BOM Costing & E-Way Bill Validity Tracker.
// NOTE: Keep free of ../store.js and ../components/* imports (server test isolation).

function r2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0;
}

function r3(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 1000) / 1000 : 0;
}

/**
 * 1. Multi-Godown Stock Transfer (e.g. MANDI_GODOWN -> MAIN_COUNTER)
 * Pure state transformer returning the updated product record + Stock Transfer Challan summary.
 */
export function computeGodownStockTransfer(product, {
  fromGodown = 'MAIN',
  toGodown = 'GODOWN_A',
  qty = 0,
  batchNo = 'DEFAULT',
  transferDate = new Date().toISOString().slice(0, 10),
} = {}) {
  if (!product) throw new Error('Select a valid product for godown transfer.');
  const moveQty = Number(qty);
  if (!Number.isFinite(moveQty) || moveQty <= 0) {
    throw new Error('Transfer quantity must be greater than zero.');
  }
  const src = String(fromGodown || 'MAIN').trim().toUpperCase();
  const dst = String(toGodown || 'GODOWN_A').trim().toUpperCase();
  if (src === dst) {
    throw new Error('Source and destination godowns must be different.');
  }

  const baseTotal = Number(product.stock ?? product.stockQty ?? 0) || 0;
  const godownStock = {
    ...(product.godownStock || { MAIN: baseTotal }),
  };
  const available = Number(godownStock[src] || 0);
  if (available < moveQty) {
    throw new Error(`${src} me sirf ${available} ${product.unit || 'PCS'} stock uplabdh hai.`);
  }

  godownStock[src] = r3(available - moveQty);
  godownStock[dst] = r3(Number(godownStock[dst] || 0) + moveQty);

  const updatedProduct = {
    ...product,
    godownStock,
    lastGodownTransfer: {
      challanNo: `GDT-${Date.now().toString().slice(-6)}`,
      fromGodown: src,
      toGodown: dst,
      qty: moveQty,
      batchNo,
      transferDate,
    },
  };

  return {
    updatedProduct,
    godownStock,
    challan: updatedProduct.lastGodownTransfer,
  };
}

/**
 * 2. FEFO (First-Expiry, First-Out) Batch Allocator for Pharmacy, FMCG, Kirana & Agro Billing
 * Automatically picks non-expired batches sorted by earliest expiryDate.
 */
export function allocateBatchesFEFO(batches = [], requiredQty = 0, todayIso = new Date().toISOString().slice(0, 10)) {
  const validBatches = (Array.isArray(batches) ? batches : [])
    .filter((b) => Number(b?.qty) > 0 && (!b?.expiryDate || String(b.expiryDate) >= todayIso))
    .sort((a, b) => String(a.expiryDate || '9999-12-31').localeCompare(String(b.expiryDate || '9999-12-31')));

  let remaining = Number(requiredQty) || 0;
  const allocations = [];

  for (const batch of validBatches) {
    if (remaining <= 0) break;
    const take = r3(Math.min(Number(batch.qty), remaining));
    allocations.push({
      batchNo: String(batch.batchNo || 'BATCH-1'),
      expiryDate: batch.expiryDate || 'N/A',
      allocatedQty: take,
      mrp: Number(batch.mrp || 0),
    });
    remaining = r3(remaining - take);
  }

  return {
    fulfilled: remaining === 0,
    shortfall: Math.max(0, remaining),
    allocations,
  };
}

/**
 * 3. Bill of Materials (BOM) & Manufacturing Journal Costing Engine
 * Converts Raw Materials (with wastage %) -> Finished Goods and computes exact Landed Cost per Unit.
 */
export function computeManufacturingBOM({
  finishedItem,
  producedQty = 1,
  rawMaterials = [], // [{ product, qtyPerUnit, wastagePercent }]
  additionalOverheadCost = 0,
} = {}) {
  if (!finishedItem) throw new Error('Select a finished good product.');
  const outQty = Number(producedQty);
  if (!Number.isFinite(outQty) || outQty <= 0) {
    throw new Error('Produced quantity must be greater than zero.');
  }
  if (!Array.isArray(rawMaterials) || rawMaterials.length === 0) {
    throw new Error('Add at least one raw material line to run BOM production.');
  }

  let totalRawCost = 0;
  const updatedRawProducts = [];
  const consumptionBreakdown = [];

  for (const rm of rawMaterials) {
    const rmItem = rm?.product;
    if (!rmItem) throw new Error('Raw material product missing.');
    const wastageFactor = 1 + (Number(rm.wastagePercent) || 0) / 100;
    const totalConsumed = r3(Number(rm.qtyPerUnit || 0) * outQty * wastageFactor);
    const avail = Number(rmItem.stock ?? rmItem.stockQty ?? 0) || 0;

    if (avail < totalConsumed) {
      throw new Error(
        `Insufficient raw material "${rmItem.name}". Required: ${totalConsumed}, Available: ${avail}`
      );
    }

    const unitCost = Number(rmItem.purchasePrice ?? rmItem.purchaseRate ?? rmItem.price ?? rmItem.sellingPrice ?? 0) || 0;
    const lineCost = r2(totalConsumed * unitCost);
    totalRawCost = r2(totalRawCost + lineCost);

    updatedRawProducts.push({
      ...rmItem,
      stock: r3(avail - totalConsumed),
    });
    consumptionBreakdown.push({
      id: rmItem.id,
      name: rmItem.name,
      consumedQty: totalConsumed,
      wastagePercent: Number(rm.wastagePercent || 0),
      unitCost,
      lineCost,
    });
  }

  const totalProductionCost = r2(totalRawCost + (Number(additionalOverheadCost) || 0));
  const landedCostPerUnit = r2(totalProductionCost / outQty);
  const prevFinishedStock = Number(finishedItem.stock ?? finishedItem.stockQty ?? 0) || 0;

  const updatedFinishedProduct = {
    ...finishedItem,
    stock: r3(prevFinishedStock + outQty),
    purchasePrice: landedCostPerUnit,
  };

  return {
    finishedItem: finishedItem.name,
    producedQty: outQty,
    totalRawCost,
    additionalOverheadCost: r2(additionalOverheadCost),
    totalProductionCost,
    landedCostPerUnit,
    consumptionBreakdown,
    updatedRawProducts,
    updatedFinishedProduct,
  };
}

/**
 * 4. NIC E-Way Bill Validity & 6-Hour Pre-Expiry Auto-Extend Tracker (Rule 138(10) CGST Rules)
 * Standard cargo: 1 day per 200 km (or part thereof). Over-Dimensional Cargo (ODC): 1 day per 20 km.
 */
export function estimateEwayBillValidity({
  distanceKm = 100,
  isOverDimensionalCargo = false,
  generatedAtIso = new Date().toISOString(),
  nowIso = new Date().toISOString(),
} = {}) {
  const km = Math.max(1, Number(distanceKm) || 1);
  const kmPerDay = isOverDimensionalCargo ? 20 : 200;
  const validityDays = Math.ceil(km / kmPerDay);

  const genMs = new Date(generatedAtIso).getTime();
  const expiresAtMs = genMs + validityDays * 24 * 60 * 60 * 1000;
  const nowMs = new Date(nowIso).getTime();
  const hoursRemaining = r2((expiresAtMs - nowMs) / (1000 * 60 * 60));

  return {
    distanceKm: km,
    validityDays,
    expiresAtIso: new Date(expiresAtMs).toISOString(),
    hoursRemaining,
    needsExtensionAlert: hoursRemaining <= 6 && hoursRemaining >= -8,
    status:
      hoursRemaining < 0
        ? 'EXPIRED_EXTEND_WITHIN_8H'
        : hoursRemaining <= 6
          ? 'EXPIRING_WITHIN_6H'
          : 'ACTIVE_VALID',
  };
}
