import React, { useEffect, useState, useCallback } from 'react';
import DateRangeTabs from '../components/DateRangeTabs.jsx';
import { branchComparison } from '../queries/comparison.js';
import { subscribeRealtime } from '../lib/realtime.js';
import { PageError } from '../components/AsyncState.jsx';

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function isoDate(d) { return d.toISOString().slice(0, 10); }

export default function BranchComparison() {
  const [range, setRange] = useState('month');
  const [customFrom, setCustomFrom] = useState(isoDate(new Date()));
  const [customTo, setCustomTo] = useState(isoDate(new Date()));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  function getRangeDates() {
    const now = new Date();
    if (range === 'today') return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    if (range === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { from: first.toISOString(), to: last.toISOString() };
    }
    return { from: new Date(customFrom + 'T00:00:00').toISOString(), to: new Date(customTo + 'T23:59:59').toISOString() };
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { from, to } = getRangeDates();
      setRows(await branchComparison({ from, to }));
    } catch (err) { console.error('[BranchComparison]', err); setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo]);

  useEffect(() => {
    load();
    let timer;
    const unsubscribe = subscribeRealtime(['sales', 'sale_items', 'transactions', 'products', 'customers'], () => {
      clearTimeout(timer);
      timer = setTimeout(load, 500);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [load]);

  if (loading && !rows.length) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !rows.length) return <PageError error={error} onRetry={load} />;

  const maxRevenue = Math.max(...rows.map((r) => r.revenue), 1);

  return (
    <div>
      <DateRangeTabs
        range={range}
        onChange={setRange}
        customFrom={customFrom}
        customTo={customTo}
        onCustomChange={(k, v) => (k === 'from' ? setCustomFrom(v) : setCustomTo(v))}
        onApplyCustom={load}
      />

      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 14 }}>الإيرادات حسب الفرع</h3>
        <div className="flex-col gap-8">
          {rows.length === 0 ? (
            <div className="text-muted">لا توجد بيانات</div>
          ) : rows.map((r) => (
            <div className="bar-row" key={r.branchId} style={{ marginBottom: 8 }}>
              <div style={{ width: 120, fontSize: 13, fontWeight: 700 }} className="mono-num">{r.name}</div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(r.revenue / maxRevenue) * 100}%` }} /></div>
              <div style={{ width: 90, textAlign: 'end' }} className="mono-num"><strong>{r.revenue.toFixed(2)}</strong></div>
            </div>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>الفرع</th>
              <th>عدد الفواتير</th>
              <th>الإيرادات</th>
              <th>الربح/الخسارة</th>
              <th>المصروفات</th>
              <th>عدد العملاء</th>
              <th>قيمة المخزون</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.branchId}>
                <td><strong>{r.name}</strong></td>
                <td className="mono-num">{r.invoices}</td>
                <td className="mono-num">{r.revenue.toFixed(2)}</td>
                <td className="mono-num" style={{ color: r.profit < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                  {r.profit.toFixed(2)}
                </td>
                <td className="mono-num">{r.expenses.toFixed(2)}</td>
                <td className="mono-num">{r.customersCount}</td>
                <td className="mono-num">{r.inventoryValue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
      </div>
    </div>
  );
}
