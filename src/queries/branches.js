import { supabase } from '../lib/supabase.js';

export async function listBranches({ onlyActive = false } = {}) {
  let query = supabase.from('branches').select('*').order('created_at', { ascending: true });
  if (onlyActive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
