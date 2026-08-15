import { supabase } from '../lib/supabase.js';

export async function branchComparison({ from, to }) {
  const { data: branches, error: branchesErr } = await supabase.from('branches').select('id, name').eq('is_active', true);
  if (branchesErr) throw branchesErr;

  const { data: sales, error: salesErr } = await supabase
    .from('sales')
    .select('id, total, branch_id')
    .gte('created_at', from)
    .lte('created_at', to)
    .eq('status', 'completed');
  if (salesErr) throw salesErr;

  const saleIds = sales.map((s) => s.id);
  let costByBranch = {};
  if (saleIds.length) {
    const { data: items, error: itemsErr } = await supabase
      .from('sale_items')
      .select('quantity, unit_cost, branch_id')
      .in('sale_id', saleIds);
    if (itemsErr) throw itemsErr;
    for (const it of items) {
      costByBranch[it.branch_id] = (costByBranch[it.branch_id] || 0) + Number(it.unit_cost) * Number(it.quantity);
    }
  }

  const { data: txns, error: txnErr } = await supabase
    .from('transactions')
    .select('type, amount, branch_id')
    .gte('txn_date', from.slice(0, 10))
    .lte('txn_date', to.slice(0, 10));
  if (txnErr) throw txnErr;

  const { data: customers, error: custErr } = await supabase.from('customers').select('id, branch_id');
  if (custErr) throw custErr;

  const { data: products, error: prodErr } = await supabase.from('products').select('branch_id, stock_quantity, cost').eq('is_active', true);
  if (prodErr) throw prodErr;

  return branches.map((b) => {
    const branchSales = sales.filter((s) => s.branch_id === b.id);
    const revenue = branchSales.reduce((sum, s) => sum + Number(s.total), 0);
    const cost = costByBranch[b.id] || 0;
    const grossProfit = revenue - cost;

    const branchTxns = txns.filter((t) => t.branch_id === b.id);
    const expense = branchTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    const income = branchTxns.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);

    const customersCount = customers.filter((c) => c.branch_id === b.id).length;
    const inventoryValue = products
      .filter((p) => p.branch_id === b.id)
      .reduce((s, p) => s + Number(p.stock_quantity) * Number(p.cost), 0);

    return {
      branchId: b.id,
      name: b.name,
      invoices: branchSales.length,
      revenue,
      profit: grossProfit + income - expense,
      expenses: expense,
      customersCount,
      inventoryValue
    };
  }).sort((a, b) => b.revenue - a.revenue);
}
