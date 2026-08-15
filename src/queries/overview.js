import { supabase } from '../lib/supabase.js';

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function isoDate(d) { return d.toISOString().slice(0, 10); }

async function salesBetween(from, to, branchId) {
  let query = supabase
    .from('sales')
    .select('id, total, payment_method, created_at')
    .gte('created_at', from)
    .lte('created_at', to)
    .eq('status', 'completed')
    .eq('is_open_ticket', false);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function paymentBreakdown(sales) {
  const byMethod = (method) => sales.filter((s) => s.payment_method === method);
  const sumTotal = (rows) => rows.reduce((s, x) => s + Number(x.total), 0);
  const cash = byMethod('cash');
  const visa = byMethod('visa');
  const instapay = byMethod('instapay');
  const eWallet = byMethod('e_wallet');
  return {
    cashCount: cash.length,
    visaCount: visa.length,
    instapayCount: instapay.length,
    eWalletCount: eWallet.length,
    cashTotal: sumTotal(cash),
    visaTotal: sumTotal(visa),
    instapayTotal: sumTotal(instapay),
    eWalletTotal: sumTotal(eWallet)
  };
}

async function costOfSales(saleIds) {
  if (!saleIds.length) return 0;
  const { data, error } = await supabase
    .from('sale_items')
    .select('quantity, unit_cost, sale_id')
    .in('sale_id', saleIds);
  if (error) throw error;
  return (data || []).reduce((sum, i) => sum + Number(i.unit_cost) * Number(i.quantity), 0);
}

async function expensesBetween(fromDate, toDate, branchId) {
  let query = supabase
    .from('transactions')
    .select('type, amount')
    .gte('txn_date', fromDate)
    .lte('txn_date', toDate);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  const income = (data || []).filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = (data || []).filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  return { income, expense };
}

export async function overviewStats({ branchId = null } = {}) {
  const now = new Date();
  const todayFrom = startOfDay(now).toISOString();
  const todayTo = endOfDay(now).toISOString();
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [todaySales, monthSales] = await Promise.all([
    salesBetween(todayFrom, todayTo, branchId),
    salesBetween(monthFrom, monthTo, branchId)
  ]);

  const todayRevenue = todaySales.reduce((s, x) => s + Number(x.total), 0);
  const monthRevenue = monthSales.reduce((s, x) => s + Number(x.total), 0);

  const [todayCost, monthCost] = await Promise.all([
    costOfSales(todaySales.map((s) => s.id)),
    costOfSales(monthSales.map((s) => s.id))
  ]);

  const [todayTxns, monthTxns] = await Promise.all([
    expensesBetween(isoDate(now), isoDate(now), branchId),
    expensesBetween(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)), branchId)
  ]);

  const todayGrossProfit = todayRevenue - todayCost;
  const monthGrossProfit = monthRevenue - monthCost;

  return {
    todaySalesCount: todaySales.length,
    todayRevenue,
    todayGrossProfit,
    todayExpenses: todayTxns.expense,
    todayNetProfit: todayGrossProfit + todayTxns.income - todayTxns.expense,
    ...paymentBreakdown(todaySales),

    monthSalesCount: monthSales.length,
    monthRevenue,
    monthGrossProfit,
    monthExpenses: monthTxns.expense,
    monthNetProfit: monthGrossProfit + monthTxns.income - monthTxns.expense
  };
}
