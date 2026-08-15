import { supabase } from '../lib/supabase.js';
import { deductRawMaterialsBatch } from './rawMaterials.js';

// Recipe lines for one product, each joined with its raw material's current
// name/unit/cost/stock/status — used both by the Products page (recipe
// editor) and by applyRecipesToSale()/assertSufficientRecipeStock() below.
export async function getProductRecipe(productId) {
  const { data, error } = await supabase
    .from('product_recipe_items')
    .select('*, raw_materials(id, name, unit, cost, stock_quantity, is_active)')
    .eq('product_id', productId);
  if (error) throw error;
  return data || [];
}

// Same, but for several products at once — used at checkout time where the
// cart can contain many different recipe products, so this is one query
// instead of one per cart line.
export async function getRecipesForProducts(productIds) {
  if (!productIds || productIds.length === 0) return {};
  const { data, error } = await supabase
    .from('product_recipe_items')
    .select('*, raw_materials(id, name, unit, cost, stock_quantity, is_active)')
    .in('product_id', productIds);
  if (error) throw error;

  const byProduct = {};
  for (const row of data || []) {
    if (!byProduct[row.product_id]) byProduct[row.product_id] = [];
    byProduct[row.product_id].push(row);
  }
  return byProduct;
}

// Replaces a product's entire recipe (delete-all-then-insert), then
// immediately persists the recomputed cost onto products.cost (see
// recalculateProductCost below) — this is what makes "recalculate
// automatically when the recipe changes" true at the data layer.
export async function saveProductRecipe(productId, items) {
  const { error: delErr } = await supabase.from('product_recipe_items').delete().eq('product_id', productId);
  if (delErr) throw delErr;

  let data = [];
  if (items && items.length > 0) {
    const rows = items.map((it) => ({
      product_id: productId,
      raw_material_id: it.rawMaterialId,
      quantity: Number(it.quantity)
    }));
    const inserted = await supabase.from('product_recipe_items').insert(rows).select();
    if (inserted.error) throw inserted.error;
    data = inserted.data;
  }

  await recalculateProductCost(productId);
  return data;
}

// Cost of ONE unit of the product, computed from its current recipe's raw
// material costs (0 if the recipe list is empty — callers fall back to the
// product's own manual `cost` field in that case). A recipe line whose raw
// material has been deactivated contributes nothing.
export function calcRecipeUnitCost(recipeItems) {
  return (recipeItems || [])
    .filter((item) => item.raw_materials?.is_active !== false)
    .reduce((sum, item) => sum + Number(item.quantity) * Number(item.raw_materials?.cost || 0), 0);
}

// Cost is never entered manually for a recipe product — it's always "sum of
// (ingredient unit cost × quantity used)" over the ACTIVE recipe lines,
// recomputed fresh from the database and written onto products.cost.
export async function recalculateProductCost(productId) {
  const recipeItems = await getProductRecipe(productId);
  const cost = calcRecipeUnitCost(recipeItems);
  const { error } = await supabase.from('products').update({ cost }).eq('id', productId);
  if (error) throw error;
  return cost;
}

// Recalculates automatically when a raw material's purchase price /
// conversion factor / active status changes (see RawMaterials.jsx): finds
// every product whose recipe references the given raw material and
// refreshes each one's persisted cost.
export async function recalculateProductCostsForRawMaterial(rawMaterialId) {
  const { data, error } = await supabase
    .from('product_recipe_items')
    .select('product_id')
    .eq('raw_material_id', rawMaterialId);
  if (error) throw error;

  const productIds = [...new Set((data || []).map((r) => r.product_id))];
  await Promise.all(productIds.map((id) => recalculateProductCost(id)));
  return productIds;
}

// Given a cart and its resolved recipes, returns the total quantity of each
// raw material the cart would consume: { [rawMaterialId]: totalQtyNeeded }.
function calcRecipeUsage(cart, recipesByProduct) {
  const usageMap = {};
  for (const item of cart) {
    const recipeLines = recipesByProduct[item.id];
    if (!recipeLines || recipeLines.length === 0) continue;
    for (const line of recipeLines) {
      const used = Number(line.quantity) * Number(item.qty);
      usageMap[line.raw_material_id] = (usageMap[line.raw_material_id] || 0) + used;
    }
  }
  return usageMap;
}

// "Prevent sales if stock is insufficient." Called BEFORE anything about
// the sale is written, so a cart that would over-draw any ingredient never
// creates a sale, sale_items, or a partial stock deduction — checkout fails
// cleanly up front with a clear error identifying which raw material ran
// short. Products without a recipe are entirely unaffected.
export async function assertSufficientRecipeStock(cart) {
  const productIds = [...new Set(cart.map((item) => item.id).filter(Boolean))];
  const recipesByProduct = await getRecipesForProducts(productIds);
  const usageMap = calcRecipeUsage(cart, recipesByProduct);

  const shortages = [];
  for (const [rawMaterialId, needed] of Object.entries(usageMap)) {
    let materialInfo = null;
    for (const lines of Object.values(recipesByProduct)) {
      const match = lines.find((l) => l.raw_material_id === rawMaterialId);
      if (match) { materialInfo = match.raw_materials; break; }
    }
    const available = Number(materialInfo?.stock_quantity || 0);
    if (needed > available) {
      shortages.push({ rawMaterialId, name: materialInfo?.name || rawMaterialId, needed, available });
    }
  }

  if (shortages.length > 0) {
    const err = new Error('insufficient_raw_material_stock');
    err.code = 'insufficient_raw_material_stock';
    err.shortages = shortages;
    throw err;
  }
}

// Called from queries/sales.js right after a sale's items are decided,
// BEFORE inserting sale_items. For every cart line whose product has a
// recipe: computes that line's true per-unit cost from the recipe's raw
// materials, and aggregates how much of each raw material the whole order
// used. Cart lines for products with NO recipe are left completely alone.
// Returns { [productId]: unitCost }.
export async function applyRecipesToSale(cart, { invoiceNumber, userId, branchId }) {
  const productIds = [...new Set(cart.map((item) => item.id).filter(Boolean))];
  const recipesByProduct = await getRecipesForProducts(productIds);

  const costByProductId = {};
  for (const item of cart) {
    const recipeLines = recipesByProduct[item.id];
    if (!recipeLines || recipeLines.length === 0) continue; // no recipe: normal behavior, untouched
    costByProductId[item.id] = calcRecipeUnitCost(recipeLines);
  }

  const usageMap = calcRecipeUsage(cart, recipesByProduct);

  if (Object.keys(usageMap).length > 0) {
    await deductRawMaterialsBatch(usageMap, {
      reason: `بيع - فاتورة ${invoiceNumber || ''}`.trim(),
      userId,
      branchId
    });
  }

  return costByProductId;
}

// "Show the maximum number of products that can still be produced based on
// the limiting ingredient." For one product's recipe, that's the minimum,
// across every ingredient line, of how many times that ingredient's
// current stock covers what one unit needs. A product with no recipe has
// no ingredient limit (returns null).
export function calcMaxProducible(recipeLines) {
  if (!recipeLines || recipeLines.length === 0) return null;
  let max = Infinity;
  let limitingMaterial = null;
  for (const line of recipeLines) {
    const need = Number(line.quantity);
    if (!(need > 0)) continue;
    const available = Number(line.raw_materials?.stock_quantity || 0);
    const possible = Math.floor(available / need);
    if (possible < max) {
      max = possible;
      limitingMaterial = line.raw_materials?.name || null;
    }
  }
  return { maxUnits: Number.isFinite(max) ? max : 0, limitingMaterial };
}

// Same, for every active recipe product in a branch at once — powers the
// "max producible" view on the Inventory page.
export async function maxProducibleForProducts(products) {
  const recipeProducts = (products || []).filter((p) => p.is_active !== false);
  const productIds = recipeProducts.map((p) => p.id);
  const recipesByProduct = await getRecipesForProducts(productIds);

  return recipeProducts
    .filter((p) => recipesByProduct[p.id]?.length)
    .map((p) => ({ product: p, ...calcMaxProducible(recipesByProduct[p.id]) }));
}
