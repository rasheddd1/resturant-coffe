import { supabase } from '../lib/supabase.js';

export async function createCustomer(payload) {
  const { data, error } = await supabase.from('customers').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateCustomer(id, payload) {
  const { data, error } = await supabase.from('customers').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
}

export async function findCustomerByPhone(phone, branchId) {
  if (!phone) return null;
  let query = supabase.from('customers').select('*').eq('phone', phone);
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

export async function findOrCreateCustomer({ name, phone, branchId, address = '' }) {
  if (!phone) return null;
  const existing = await findCustomerByPhone(phone, branchId);
  if (existing) {
    if (address && address !== existing.address) {
      return updateCustomer(existing.id, { address });
    }
    return existing;
  }
  const { data, error } = await supabase
    .from('customers')
    .insert({ name: name || phone, phone, branch_id: branchId, address: address || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function recordCustomerPurchase(customerId, amount) {
  const { data: customer, error: getErr } = await supabase
    .from('customers')
    .select('total_purchases, visits_count')
    .eq('id', customerId)
    .single();
  if (getErr) throw getErr;
  const { error } = await supabase
    .from('customers')
    .update({
      total_purchases: Number(customer.total_purchases) + Number(amount),
      visits_count: Number(customer.visits_count) + 1,
      last_visit_at: new Date().toISOString()
    })
    .eq('id', customerId);
  if (error) throw error;
}

export async function listCustomers({ search = '', branchId = null } = {}) {
  let query = supabase.from('customers').select('*, branches(name)').order('last_visit_at', { ascending: false, nullsFirst: false });
  if (branchId) query = query.eq('branch_id', branchId);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getCustomerPurchaseHistory(customerId) {
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export function whatsappLink(phone) {
  const digits = (phone || '').replace(/[^\d+]/g, '');
  return `https://wa.me/${digits.replace('+', '')}`;
}
