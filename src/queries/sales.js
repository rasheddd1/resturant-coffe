import { supabase } from '../lib/supabase.js';
import { findOrCreateCustomer, recordCustomerPurchase } from './customers.js';
import { applyRecipesToSale, assertSufficientRecipeStock } from './recipes.js';

export async function createSale({
  branchId,
  cashierId,
  cart,
  discount = 0,
  tax = 0,
  paidAmount,
  paymentMethod,
  customerName,
  customerPhone,
  notes,
  // Order type: 'dine_in' | 'takeaway' | 'delivery' (defaults to takeaway —
  // same as every sale before this field existed).
  orderType = 'takeaway',
  tableNumber = null,
  deliveryAddress = null,
  deliveryFee = 0,
  // Dine-in "Keep Invoice Open": when true, the invoice is created as an
  // OPEN ticket — not counted as revenue/reports yet, no payment recorded
  // — until it's later closed via closeOpenTicket() below.
  keepOpen = false
}) {
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const fee = orderType === 'delivery' ? Number(deliveryFee || 0) : 0;
  const total = Math.max(subtotal - discount + tax + fee, 0);
  const isOpenTicket = orderType === 'dine_in' && keepOpen;
  const paid = isOpenTicket ? 0 : (paidAmount ?? total);
  const change = isOpenTicket ? 0 : Math.max(paid - total, 0);

  // "Prevent sales if stock is insufficient." Checked BEFORE the sale row
  // (or anything else) is written, so a cart that would over-draw any
  // recipe ingredient never creates a sale. Products without a recipe are
  // entirely unaffected.
  await assertSufficientRecipeStock(cart);

  let customer = null;
  if (customerPhone) {
    customer = await findOrCreateCustomer({
      name: customerName,
      phone: customerPhone,
      branchId,
      address: orderType === 'delivery' ? (deliveryAddress || '') : ''
    });
  }

  const { data: sale, error: saleError } = await supabase
    .from('sales')
    .insert({
      branch_id: branchId,
      cashier_id: cashierId,
      customer_id: customer?.id || null,
      subtotal,
      discount,
      tax,
      total,
      paid_amount: paid,
      change_amount: change,
      payment_method: paymentMethod,
      customer_name: customerName || null,
      notes: notes || null,
      order_type: orderType,
      table_number: orderType === 'dine_in' ? (tableNumber || null) : null,
      delivery_address: orderType === 'delivery' ? (deliveryAddress || null) : null,
      delivery_fee: fee,
      is_open_ticket: isOpenTicket
    })
    .select()
    .single();
  if (saleError) throw saleError;

  // Products with a recipe (Bill of Materials) get their cost computed from
  // raw material costs, and their ingredients deducted from raw_materials
  // stock right here. Products without a recipe are untouched — costByProduct
  // simply won't have an entry for them, so unit_cost falls back to
  // item.cost exactly as before this feature existed. Wrapped as non-fatal:
  // a problem computing/deducting a recipe must never block the sale itself.
  const costByProduct = await applyRecipesToSale(cart, {
    invoiceNumber: sale.invoice_number,
    userId: cashierId,
    branchId
  }).catch((err) => {
    console.error('[recipes] failed to apply recipe deduction:', err.message);
    return {};
  });

  const items = cart.map((item) => ({
    sale_id: sale.id,
    branch_id: branchId,
    product_id: item.id,
    product_name: item.name,
    quantity: item.qty,
    unit_price: item.price,
    unit_cost: costByProduct[item.id] ?? (item.cost || 0),
    discount: item.discount || 0,
    total: item.price * item.qty - (item.discount || 0)
  }));

  const { error: itemsError } = await supabase.from('sale_items').insert(items);
  if (itemsError) throw itemsError;

  if (customer && !isOpenTicket) {
    try {
      await recordCustomerPurchase(customer.id, total);
    } catch {
      /* non-fatal */
    }
  }

  return sale;
}

export async function getSaleDetails(saleId) {
  const { data: sale, error: saleErr } = await supabase.from('sales').select('*').eq('id', saleId).single();
  if (saleErr) throw saleErr;
  const { data: items, error: itemsErr } = await supabase.from('sale_items').select('*').eq('sale_id', saleId);
  if (itemsErr) throw itemsErr;
  return { sale, items: items || [] };
}

// Dine-in "Keep Invoice Open": tickets not yet closed (paid + finalized).
export async function listOpenTickets({ branchId = null } = {}) {
  let query = supabase
    .from('sales')
    .select('*')
    .eq('order_type', 'dine_in')
    .eq('is_open_ticket', true)
    .order('created_at', { ascending: true });
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Closing an open ticket: choose the payment method + amount, mark it
// CLOSED — from this point on it counts as revenue/sales/reports (every
// query below filters is_open_ticket = false).
export async function closeOpenTicket(saleId, { paidAmount, paymentMethod }) {
  const { data: sale, error: getErr } = await supabase.from('sales').select('total, customer_id').eq('id', saleId).single();
  if (getErr) throw getErr;
  const total = Number(sale.total);
  const paid = Number(paidAmount ?? total);
  const change = Math.max(paid - total, 0);

  const { data: updated, error } = await supabase
    .from('sales')
    .update({
      is_open_ticket: false,
      paid_amount: paid,
      change_amount: change,
      payment_method: paymentMethod
    })
    .eq('id', saleId)
    .select()
    .single();
  if (error) throw error;

  if (sale.customer_id) {
    try {
      await recordCustomerPurchase(sale.customer_id, total);
    } catch {
      /* non-fatal */
    }
  }

  return updated;
}

export async function markInvoicePrinted(saleId) {
  const { data: inv } = await supabase.from('invoices').select('printed_count').eq('sale_id', saleId).single();
  await supabase
    .from('invoices')
    .update({ printed_count: (inv?.printed_count || 0) + 1, last_printed_at: new Date().toISOString() })
    .eq('sale_id', saleId);
}

export async function salesReport({ from, to, branchId = null }) {
  let query = supabase
    .from('sales')
    .select('*, profiles(full_name), branches(name)')
    .gte('created_at', from)
    .lte('created_at', to)
    .eq('status', 'completed')
    .eq('is_open_ticket', false)
    .order('created_at', { ascending: false });
  if (branchId) query = query.eq('branch_id', branchId);
  const { data: sales, error } = await query;
  if (error) throw error;

  const totalSales = sales.reduce((s, x) => s + Number(x.total), 0);
  const totalOrders = sales.length;
  const avgOrder = totalOrders ? totalSales / totalOrders : 0;

  const byMethod = (method) => sales.filter((s) => s.payment_method === method);
  const sumTotal = (rows) => rows.reduce((s, x) => s + Number(x.total), 0);
  const cashSales = byMethod('cash');
  const visaSales = byMethod('visa');
  const instapaySales = byMethod('instapay');
  const eWalletSales = byMethod('e_wallet');

  const byDay = {};
  for (const s of sales) {
    const day = s.created_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + Number(s.total);
  }

  return {
    totalSales,
    totalOrders,
    avgOrder,
    cashCount: cashSales.length,
    visaCount: visaSales.length,
    instapayCount: instapaySales.length,
    eWalletCount: eWalletSales.length,
    cashTotal: sumTotal(cashSales),
    visaTotal: sumTotal(visaSales),
    instapayTotal: sumTotal(instapaySales),
    eWalletTotal: sumTotal(eWalletSales),
    byDay: Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])),
    sales
  };
}

export async function salesByBranch({ from, to }) {
  const { data: sales, error } = await supabase
    .from('sales')
    .select('total, branch_id, branches(name)')
    .gte('created_at', from)
    .lte('created_at', to)
    .eq('status', 'completed')
    .eq('is_open_ticket', false);
  if (error) throw error;

  const grouped = {};
  for (const s of sales) {
    const key = s.branch_id;
    if (!grouped[key]) grouped[key] = { branchId: key, name: s.branches?.name || 'غير معروف', invoices: 0, total: 0 };
    grouped[key].invoices += 1;
    grouped[key].total += Number(s.total);
  }
  return Object.values(grouped).sort((a, b) => b.total - a.total);
}

export async function topProducts({ from, to, limit = 10, branchId = null }) {
  let salesQuery = supabase
    .from('sales')
    .select('id')
    .gte('created_at', from)
    .lte('created_at', to)
    .eq('status', 'completed')
    .eq('is_open_ticket', false);
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
