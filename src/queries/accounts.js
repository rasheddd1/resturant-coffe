import { supabase } from '../lib/supabase.js';

export async function createTransaction(payload) {
  const { data, error } = await supabase.from('transactions').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

export async function listTransactions({ from, to, type = null, branchId = null } = {}) {
  let query = supabase
    .from('transactions')
    .select('*, profiles(full_name), branches(name)')
    .order('txn_date', { ascending: false });
  if (from) query = query.gte('txn_date', from);
  if (to) query = query.lte('txn_date', to);
  if (type) query = query.eq('type', type);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function accountsSummary({ from, to, branchId = null }) {
  let salesQuery = supabase
    .from('sales')
    .select('id, total, status, created_at')
    .gte('created_at', from)
    .lte('created_at', to)
    .eq('status', 'completed')
    .eq('is_open_ticket', false);
  if (branchId) salesQuery = salesQuery.eq('branch_id', branchId);
  const { data: sales, error: salesErr } = await salesQuery;
  if (salesErr) throw salesErr;

  const saleIds = sales.map((s) => s.id);
  const salesRevenue = sales.reduce((sum, s) => sum + Number(s.total), 0);

  let costOfGoods = 0;
  if (saleIds.length) {
    const { data: items, error: itemsErr } = await supabase
      .from('sale_items')
      .select('quantity, unit_cost, sale_id')
      .in('sale_id', saleIds);
    if (itemsErr) throw itemsErr;
    costOfGoods = items.reduce((sum, i) => sum + Number(i.unit_cost) * Number(i.quantity), 0);
  }

  const grossProfit = salesRevenue - costOfGoods;

  let txnQuery = supabase
    .from('transactions')
    .select('type, amount')
    .gte('txn_date', from.slice(0, 10))
    .lte('txn_date', to.slice(0, 10));
  if (branchId) txnQuery = txnQuery.eq('branch_id', branchId);
  const { data: txns, error: txnErr } = await txnQuery;
  if (txnErr) throw txnErr;

  const manualIncome = txns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const manualExpense = txns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const netProfit = grossProfit + manualIncome - manualExpense;

  return { salesRevenue, costOfGoods, grossProfit, manualIncome, manualExpense, netProfit, salesCount: sales.length };
}
