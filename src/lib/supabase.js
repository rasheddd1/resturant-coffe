import { createClient } from '@supabase/supabase-js';

// Same Supabase project used by the desktop POS app.
// Reuses the exact schema already defined in pos-system/sql/*.sql —
// no new tables or duplicate logic are introduced here.
const SUPABASE_URL = 'https://khhjewlvyxxzcfkpkeku.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9Sd7a2pHxW10VRfQSfX_7A_vbOozPBV';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'pos-admin-auth-session'
  }
});
