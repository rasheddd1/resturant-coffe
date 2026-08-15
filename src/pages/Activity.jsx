import React, { useEffect, useState, useCallback } from 'react';
import { recentActivity } from '../queries/activity.js';
import { subscribeRealtime } from '../lib/realtime.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { PageError } from '../components/AsyncState.jsx';

export default function Activity() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { branchId } = useBranch();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setEvents(await recentActivity({ limit: 50, branchId })); }
    catch (err) { console.error('[Activity]', err); setError(err); }
    finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => {
    load();
    let timer;
    const unsubscribe = subscribeRealtime(['sales', 'inventory_movements', 'transactions'], () => {
      clearTimeout(timer);
      timer = setTimeout(load, 500);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [load]);

  if (loading && !events.length) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !events.length) return <PageError error={error} onRetry={load} />;

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 16, background: 'var(--color-surface-2)', border: 'none' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          آخر الأنشطة عبر جميع الأجهزة المتصلة بنفس قاعدة البيانات — مبنية من الفواتير وحركات المخزون والحركات المالية الفعلية.
        </p>
      </div>
      <div className="card">
        {events.length === 0 ? (
          <div className="table-empty">لا توجد أنشطة بعد</div>
        ) : (
          events.map((e, idx) => (
            <div
              key={e.id}
              className="flex items-center gap-12"
              style={{ padding: '13px 16px', borderBottom: idx === events.length - 1 ? 'none' : '1px solid var(--color-border)' }}
            >
              <div style={{ fontSize: 20 }}>{e.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.title}</div>
                <div className="text-muted" style={{ fontSize: 12 }}>{e.detail}</div>
              </div>
              <div style={{ textAlign: 'end', flexShrink: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{e.by}</div>
                <div className="text-muted mono-num" style={{ fontSize: 11 }}>{new Date(e.at).toLocaleString('ar-EG')}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
