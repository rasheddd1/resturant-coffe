import { supabase } from '../lib/supabase.js';

// The current schema has no dedicated branches/devices-activity table, so this
// reconstructs a live "recent activity" feed from the real actions already
// recorded across sales, inventory_movements and transactions — attributed
// to whichever user (profile) and branch performed each one.
export async function recentActivity({ limit = 40, branchId = null } = {}) {
  let salesQ = supabase
    .from('sales')
    .select('id, invoice_number, total, payment_method, status, created_at, profiles(full_name), branches(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  let movesQ = supabase
    .from('inventory_movements')
    .select('id, type, quantity, reason, created_at, products(name), profiles(full_name), branches(name)')
    .order('created_at', { ascending: false })
    .limit(limit);
  let txnsQ = supabase
    .from('transactions')
    .select('id, type, amount, category, created_at, profiles(full_name), branches(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (branchId) {
    salesQ = salesQ.eq('branch_id', branchId);
    movesQ = movesQ.eq('branch_id', branchId);
    txnsQ = txnsQ.eq('branch_id', branchId);
  }

  const [salesRes, movesRes, txnsRes] = await Promise.all([salesQ, movesQ, txnsQ]);

  if (salesRes.error) throw salesRes.error;
  if (movesRes.error) throw movesRes.error;
  if (txnsRes.error) throw txnsRes.error;

  const events = [
    ...salesRes.data.map((s) => ({
      id: `sale-${s.id}`,
      type: 'sale',
      icon: s.status === 'refunded' ? '↩️' : '🧾',
      title: s.status === 'refunded' ? `استرجاع فاتورة ${s.invoice_number}` : `فاتورة بيع ${s.invoice_number}`,
      detail: `${Number(s.total).toFixed(2)} · ${s.payment_method}${s.branches?.name ? ' · ' + s.branches.name : ''}`,
      by: s.profiles?.full_name || '—',
      at: s.created_at
    })),
    ...movesRes.data.map((m) => ({
      id: `move-${m.id}`,
      type: 'inventory',
      icon: Number(m.quantity) >= 0 ? '📥' : '📤',
      title: `${m.products?.name || 'منتج'} — ${movementLabel(m.type)}`,
      detail: `${Number(m.quantity) > 0 ? '+' : ''}${Number(m.quantity)} ${m.reason ? '· ' + m.reason : ''}${m.branches?.name ? ' · ' + m.branches.name : ''}`,
      by: m.profiles?.full_name || '—',
      at: m.created_at
    })),
    ...txnsRes.data.map((t) => ({
      id: `txn-${t.id}`,
      type: 'transaction',
      icon: t.type === 'income' ? '⬆️' : '⬇️',
      title: t.type === 'income' ? 'إيراد يدوي' : 'مصروف يدوي',
      detail: `${Number(t.amount).toFixed(2)} ${t.category ? '· ' + t.category : ''}${t.branches?.name ? ' · ' + t.branches.name : ''}`,
      by: t.profiles?.full_name || '—',
      at: t.created_at
    }))
  ];

  return events.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
}

function movementLabel(type) {
  return { in: 'إضافة للمخزون', out: 'سحب من المخزون', adjustment: 'تسوية جرد', sale: 'بيع', refund: 'استرجاع' }[type] || type;
}
