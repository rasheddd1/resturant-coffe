import { supabase } from '../lib/supabase.js';

export async function getProductByBarcode(barcode, branchId) {
  let query = supabase.from('products').select('*, categories(id, name, color, icon)').eq('barcode', barcode);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProduct(payload) {
  const { data, error } = await supabase.from('products').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, payload) {
  const { data, error } = await supabase.from('products').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export async function listCategories({ branchId = null } = {}) {
  let query = supabase.from('categories').select('*').order('created_at', { ascending: true });
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// categories are per-branch, so creating one always needs a specific branchId
export async function createCategory(payload, branchId) {
  const { data, error } = await supabase.from('categories').insert({ ...payload, branch_id: branchId }).select().single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id, payload) {
  const { data, error } = await supabase.from('categories').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function listProductsWithStock({ search = '', branchId = null, categoryId = null, onlyActive = false } = {}) {
  let query = supabase.from('products').select('*, categories(id, name, icon), branches(name)').order('stock_quantity', { ascending: true });
  if (branchId) query = query.eq('branch_id', branchId);
  if (categoryId) query = query.eq('category_id', categoryId);
  if (onlyActive) query = query.eq('is_active', true);
  if (search) query = query.or(`name.ilike.%${search}%,barcode.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function bestSellingProducts({ from, to, limit = 10, branchId = null }) {
  let salesQuery = supabase
    .from('sales')
    .select('id')
    .gte('created_at', from)
    .lte('created_at', to)
    .eq('status', 'completed');
  if (branchId) salesQuery = salesQuery.eq('branch_id', branchId);
  const { data: sales, error: sErr } = await salesQuery;
  if (sErr) throw sErr;
  const saleIds = sales.map((s) => s.id);
  if (!saleIds.length) return [];

  const { data: items, error } = await supabase
    .from('sale_items')
    .select('product_name, quantity, total')
    .in('sale_id', saleIds);
  if (error) throw error;

  const grouped = {};
  for (const it of items) {
    if (!grouped[it.product_name]) grouped[it.product_name] = { name: it.product_name, qty: 0, total: 0 };
    grouped[it.product_name].qty += Number(it.quantity);
    grouped[it.product_name].total += Number(it.total);
  }
  return Object.values(grouped).sort((a, b) => b.qty - a.qty).slice(0, limit);
}
