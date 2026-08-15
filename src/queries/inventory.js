import { supabase } from '../lib/supabase.js';
import { listProductsWithStock } from './products.js';
import { listRawMaterials } from './rawMaterials.js';
import { maxProducibleForProducts } from './recipes.js';

export async function listMovements({ productId = null, branchId = null, limit = 200 } = {}) {
  let query = supabase
    .from('inventory_movements')
    .select('*, products(name), profiles(full_name), branches(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (productId) query = query.eq('product_id', productId);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function adjustStock({ productId, type, quantity, reason, userId, branchId }) {
  const { data: product, error: pErr } = await supabase
    .from('products')
    .select('stock_quantity, branch_id')
    .eq('id', productId)
    .single();
  if (pErr) throw pErr;

  let delta = Number(quantity);
  if (type === 'out') delta = -Math.abs(delta);
  if (type === 'in') delta = Math.abs(delta);

  const newStock = Number(product.stock_quantity) + delta;

  const { error: updateErr } = await supabase.from('products').update({ stock_quantity: newStock }).eq('id', productId);
  if (updateErr) throw updateErr;

  const { error: moveErr } = await supabase.from('inventory_movements').insert({
    product_id: productId,
    type,
    quantity: delta,
    reason,
    created_by: userId,
    branch_id: branchId || product.branch_id
  });
  if (moveErr) throw moveErr;

  return newStock;
}

// Current inventory value (products + raw materials, at stock_quantity ×
// cost) and, per active recipe product, the max units still producible
// based on its limiting ingredient — powers the "قيمة المخزون" tab.
export async function inventoryValueReport({ branchId = null } = {}) {
  const [products, rawMaterials] = await Promise.all([
    listProductsWithStock({ onlyActive: true, branchId }),
    listRawMaterials({ onlyActive: true, branchId })
  ]);

  const productsValue = products.reduce((sum, p) => sum + Number(p.stock_quantity || 0) * Number(p.cost || 0), 0);
  const rawMaterialsValue = rawMaterials.reduce((sum, m) => sum + Number(m.stock_quantity || 0) * Number(m.cost || 0), 0);

  const maxProducible = await maxProducibleForProducts(products);

  return {
    productsValue,
    rawMaterialsValue,
    totalValue: productsValue + rawMaterialsValue,
    rawMaterials: rawMaterials.map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      stock: Number(m.stock_quantity || 0),
      cost: Number(m.cost || 0),
      value: Number(m.stock_quantity || 0) * Number(m.cost || 0),
      lowStock: Number(m.stock_quantity) <= Number(m.low_stock_threshold)
    })),
    maxProducible: maxProducible.map((mp) => ({ productId: mp.product.id, name: mp.product.name, maxUnits: mp.maxUnits, limitingMaterial: mp.limitingMaterial }))
  };
}

export async function listTransfers({ branchId = null, limit = 100 } = {}) {
  let query = supabase
    .from('stock_transfers')
    .select('*, from_branch:from_branch_id(name), to_branch:to_branch_id(name), profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (branchId) query = query.or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function transferStock({ fromProductId, toBranchId, quantity, note, userId }) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw new Error('invalid_quantity');

  const { data: fromProduct, error: fpErr } = await supabase.from('products').select('*').eq('id', fromProductId).single();
  if (fpErr) throw fpErr;

  if (fromProduct.branch_id === toBranchId) throw new Error('same_branch');
  if (Number(fromProduct.stock_quantity) < qty) throw new Error('insufficient_stock');

  let toProduct = null;
  if (fromProduct.barcode) {
    const { data } = await supabase.from('products').select('*').eq('branch_id', toBranchId).eq('barcode', fromProduct.barcode).maybeSingle();
    toProduct = data;
  }
  if (!toProduct) {
    const { data } = await supabase.from('products').select('*').eq('branch_id', toBranchId).eq('name', fromProduct.name).maybeSingle();
    toProduct = data;
  }

  if (toProduct) {
    const { error } = await supabase.from('products').update({ stock_quantity: Number(toProduct.stock_quantity) + qty }).eq('id', toProduct.id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from('products')
      .insert({
        branch_id: toBranchId,
        name: fromProduct.name,
        name_en: fromProduct.name_en,
        barcode: fromProduct.barcode,
        category_id: fromProduct.category_id,
        price: fromProduct.price,
        cost: fromProduct.cost,
        stock_quantity: qty,
        low_stock_threshold: fromProduct.low_stock_threshold,
        unit: fromProduct.unit,
        is_active: true
      })
      .select()
      .single();
    if (error) throw error;
    toProduct = data;
  }

  await supabase.from('products').update({ stock_quantity: Number(fromProduct.stock_quantity) - qty }).eq('id', fromProduct.id);

  await supabase.from('inventory_movements').insert([
    { product_id: fromProduct.id, type: 'out', quantity: -qty, reason: 'نقل إلى فرع آخر', created_by: userId, branch_id: fromProduct.branch_id },
    { product_id: toProduct.id, type: 'in', quantity: qty, reason: 'نقل من فرع آخر', created_by: userId, branch_id: toBranchId }
  ]);

  const { error: transferErr } = await supabase.from('stock_transfers').insert({
    from_branch_id: fromProduct.branch_id,
    to_branch_id: toBranchId,
    from_product_id: fromProduct.id,
    to_product_id: toProduct.id,
    product_name: fromProduct.name,
    quantity: qty,
    note: note || null,
    created_by: userId
  });
  if (transferErr) throw transferErr;

  return toProduct;
}
