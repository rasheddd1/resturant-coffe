import { supabase } from './supabase.js';

// The web admin dashboard is intentionally conservative with Supabase Realtime.
// It can be enabled explicitly with VITE_ENABLE_REALTIME=true. This prevents
// noisy websocket/QUIC failures from blocking otherwise usable sections when
// the network or Supabase Realtime endpoint is unavailable.
const ENABLE_REALTIME = import.meta.env.VITE_ENABLE_REALTIME === 'true';

export function subscribeRealtime(tables, onChange) {
  if (!ENABLE_REALTIME || typeof navigator !== 'undefined' && !navigator.onLine) {
    return () => {};
  }

  const channelName = `pos-admin-rt-${tables.join('-')}-${Math.random().toString(36).slice(2, 8)}`;
  const channel = supabase.channel(channelName);
  let settled = false;

  tables.forEach((table) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      try { onChange(table, payload); } catch (err) { console.error('[Realtime listener]', err); }
    });
  });

  channel.subscribe((status) => {
    if (settled) return;
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      settled = true;
      // Realtime is optional; data loaders remain the source of truth.
      supabase.removeChannel(channel);
    }
  });

  return () => {
    settled = true;
    supabase.removeChannel(channel);
  };
}
