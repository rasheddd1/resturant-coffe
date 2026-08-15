import { supabase } from '../lib/supabase.js';

export async function listProfiles(branchId = null) {
  let query = supabase.from('profiles').select('*, branches(name)').order('created_at', { ascending: true });
  if (branchId) query = query.eq('branch_id', branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateProfileRole(id, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw error;
}

export async function updateProfileBranch(id, branchId) {
  const { error } = await supabase.from('profiles').update({ branch_id: branchId }).eq('id', id);
  if (error) throw error;
}

export async function setProfileActive(id, isActive) {
  const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}
