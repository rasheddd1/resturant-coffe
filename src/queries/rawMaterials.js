import { supabase } from '../lib/supabase.js';

// branchId: a specific branch uuid, or null to mean "all branches" (admin
// only — enforced by RLS regardless, this is just the app-level query
// shape, same convention as listProductsWithStock in ./products.js).
export async function listRawMaterials({ search = '', onlyActive = false, branchId = null } = {}) {
  let query = supabase.from('raw_materials').select('*, branches(name)').order('created_at', { ascending: false });
  if (branchId) query = query.eq('branch_id', branchId);
  if (search) query = query.ilike('name', `%${search}%`);
  if (onlyActive) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Pure conversion math shared by the "new raw material" live preview (see
// src/pages/RawMaterials.jsx) and createRawMaterial()/purchaseRawMaterial()
// below, so the UI preview and what actually gets saved can never drift
// apart. purchaseQuantity is in the material's purchase_unit (e.g. 20 L);
// conversionFactor is "how many consumption units per one purchase unit"
// (e.g. 1000 ml per L); totalPurchaseCost is the cost of that whole batch.
// Returns the added stock in consumption units and the cost per ONE
// consumption unit for that batch alone (not yet blended with any existing
// stock — see purchaseRawMaterial() for the Weighted Average Cost blend).
export function calcPurchaseConversion({ purchaseQuantity, conversionFactor, totalPurchaseCost }) {
  const qty = Number(purchaseQuantity) || 0;
  const factor = Number(conversionFactor) || 1;
  const totalCost = Number(totalPurchaseCost) || 0;
  const consumptionQty = qty * factor;
  const costPerUnit = consumptionQty > 0 ? totalCost / consumptionQty : 0;
  return { consumptionQty, costPerUnit };
}

// Creates a raw material. Two ways to specify its starting stock/cost:
//  1) The new purchasing fields (purchase_unit/purchase_quantity/
//     total_purchase_cost/conversion_factor) — stock_quantity and cost are
//     then DERIVED automatically via calcPurchaseConversion(), exactly
//     matching the live preview shown while typing.
//  2) Passing stock_quantity/cost directly (legacy shape, still fully
//     supported), in which case nothing here changes them.
export async function createRawMaterial(payload) {
  const row = { ...payload };
  if (row.purchase_quantity != null && row.total_purchase_cost != null) {
    const { consumptionQty, costPerUnit } = calcPurchaseConversion({
      purchaseQuantity: row.purchase_quantity,
      conversionFactor: row.conversion_factor,
      totalPurchaseCost: row.total_purchase_cost
    });
    row.stock_quantity = consumptionQty;
    row.cost = costPerUnit;
  }
  const { data, error } = await supabase.from('raw_materials').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateRawMaterial(id, payload) {
  const { data, error } = await supabase.from('raw_materials').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteRawMaterial(id) {
  const { error } = await supabase.from('raw_materials').delete().eq('id', id);
  if (error) throw error;
}

export async function lowStockRawMaterials({ branchId = null } = {}) {
  let query = supabase
    .from('raw_materials')
    .select('*, branches(name)')
    .eq('is_active', true)
    .order('stock_quantity', { ascending: true });
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).filter((m) => Number(m.stock_quantity) <= Number(m.low_stock_threshold));
}

// Manual stock correction/restock for one raw material — mirrors
// adjustStock() in ./inventory.js exactly, just against raw_materials
// instead of products, logging into the same inventory_movements ledger
// (tagged with raw_material_id instead of product_id).
export async function adjustRawMaterialStock({ rawMaterialId, type, quantity, reason, userId, branchId }) {
  const { data: material, error: mErr } = await supabase
    .from('raw_materials')
    .select('stock_quantity, branch_id')
    .eq('id', rawMaterialId)
    .single();
  if (mErr) throw mErr;

  let delta = Number(quantity);
  if (type === 'out' || type === 'waste') delta = -Math.abs(delta);
  if (type === 'in') delta = Math.abs(delta);
  // 'adjustment' uses delta as given (can be positive or negative)

  const newStock = Number(material.stock_quantity) + delta;

  const { error: updateErr } = await supabase
    .from('raw_materials')
    .update({ stock_quantity: newStock })
    .eq('id', rawMaterialId);
  if (updateErr) throw updateErr;

  const { error: moveErr } = await supabase.from('inventory_movements').insert({
    raw_material_id: rawMaterialId,
    type,
    quantity: delta,
    reason,
    created_by: userId,
    branch_id: branchId || material.branch_id
  });
  if (moveErr) throw moveErr;

  return newStock;
}

// Restocking a raw material via an actual purchase. Unlike
// adjustRawMaterialStock() above (a manual correction that leaves cost
// untouched), this ADDS stock in consumption units (derived from
// purchase_quantity/purchase_unit via calcPurchaseConversion()) and blends
// the new batch's cost into the existing cost/unit using Weighted Average
// Cost:
//   newCost = (oldStock*oldCost + totalPurchaseCost) / (oldStock + addedQty)
// so the material's cost/unit is always the true weighted average of every
// purchase ever made, never just whatever was typed in most recently.
export async function purchaseRawMaterial({
  rawMaterialId,
  purchaseUnit,
  purchaseQuantity,
  totalPurchaseCost,
  conversionFactor,
  reason,
  userId,
  branchId
}) {
  const { data: material, error: mErr } = await supabase
    .from('raw_materials')
    .select('stock_quantity, cost, conversion_factor, branch_id')
    .eq('id', rawMaterialId)
    .single();
  if (mErr) throw mErr;

  const factor = conversionFactor != null ? Number(conversionFactor) : Number(material.conversion_factor || 1);
  const { consumptionQty: addedQty } = calcPurchaseConversion({
    purchaseQuantity,
    conversionFactor: factor,
    totalPurchaseCost
  });
  if (!(addedQty > 0)) throw new Error('invalid_quantity');

  const oldStock = Number(material.stock_quantity) || 0;
  const oldCost = Number(material.cost) || 0;
  const newStock = oldStock + addedQty;
  const newCost = newStock > 0 ? (oldStock * oldCost + Number(totalPurchaseCost || 0)) / newStock : oldCost;

  const { error: updateErr } = await supabase
    .from('raw_materials')
    .update({
      stock_quantity: newStock,
      cost: newCost,
      purchase_unit: purchaseUnit,
      purchase_quantity: Number(purchaseQuantity) || 0,
      total_purchase_cost: Number(totalPurchaseCost) || 0,
      conversion_factor: factor
    })
    .eq('id', rawMaterialId);
  if (updateErr) throw updateErr;

  const { error: moveErr } = await supabase.from('inventory_movements').insert({
    raw_material_id: rawMaterialId,
    type: 'purchase',
    quantity: addedQty,
    reason: reason || null,
    created_by: userId,
    branch_id: branchId || material.branch_id
  });
  if (moveErr) throw moveErr;

  return { stock_quantity: newStock, cost: newCost };
}

// Shared batch primitive behind deductRawMaterialsBatch below: applies a
// signed delta to several raw materials' stock in one pass and logs one
// inventory_movements row per material. usageMap is
// { [rawMaterialId]: positiveQuantityUsed }.
async function applyRawMaterialUsageBatch(usageMap, { sign, reason, userId = null, branchId = null }) {
  const ids = Object.keys(usageMap).filter((id) => Number(usageMap[id]) > 0);
  if (ids.length === 0) return;

  const { data: materials, error: mErr } = await supabase.from('raw_materials').select('id, stock_quantity, branch_id').in('id', ids);
  if (mErr) throw mErr;

  for (const material of materials) {
    const delta = sign * Number(usageMap[material.id]);
    const newStock = Number(material.stock_quantity) + delta;

    const { error: updateErr } = await supabase
      .from('raw_materials')
      .update({ stock_quantity: newStock })
      .eq('id', material.id);
    if (updateErr) throw updateErr;

    const { error: moveErr } = await supabase.from('inventory_movements').insert({
      raw_material_id: material.id,
      type: sign < 0 ? 'sale' : 'refund',
      quantity: delta,
      reason,
      created_by: userId,
      branch_id: branchId || material.branch_id
    });
    if (moveErr) throw moveErr;
  }
}

// Called once per sale (see ./recipes.js -> applyRecipesToSale) with the
// TOTAL quantity of each raw material used across every recipe product in
// the order — one update + one movement per material, not per cart line.
export function deductRawMaterialsBatch(usageMap, opts) {
  return applyRawMaterialUsageBatch(usageMap, { ...opts, sign: -1 });
}

export function restockRawMaterialsBatch(usageMap, opts) {
  return applyRawMaterialUsageBatch(usageMap, { ...opts, sign: 1 });
}
