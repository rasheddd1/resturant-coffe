import React, { useEffect, useState, useCallback } from 'react';
import StatCard from '../components/StatCard.jsx';
import { overviewStats } from '../queries/overview.js';
import { subscribeRealtime } from '../lib/realtime.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { PageError } from '../components/AsyncState.jsx';

export default function Overview() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { branchId } = useBranch();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await overviewStats({ branchId });
      setStats(data);
    } catch (err) {
      console.error('[Overview]', err);
      setError(err);
    } finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => {
    load();
    let timer;
    const unsubscribe = subscribeRealtime(['sales', 'sale_items', 'transactions'], () => {
      clearTimeout(timer);
      timer = setTimeout(load, 500);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [load]);

  if (loading && !stats) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !stats) return <PageError error={error} onRetry={load} />;

  return (
    <div>
      <h3 style={{ marginBottom: 12 }}>اليوم</h3>
      <div className="stats-grid" style={{ marginBottom: 22 }}>
        <StatCard icon="🧾" label="عدد الفواتير" value={stats.todaySalesCount} />
        <StatCard icon="💵" label="الإيرادات" value={stats.todayRevenue.toFixed(2)} />
        <StatCard icon="📊" label="إجمالي الربح" value={stats.todayGrossProfit.toFixed(2)} />
        <StatCard icon="⬇️" label="المصروفات" value={stats.todayExpenses.toFixed(2)} accent={{ bg: 'var(--color-danger-light)', text: 'var(--color-danger)' }} />
        <StatCard
          icon={stats.todayNetProfit >= 0 ? '📈' : '📉'}
          label={stats.todayNetProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
          value={stats.todayNetProfit.toFixed(2)}
          accent={stats.todayNetProfit >= 0
            ? { bg: 'var(--color-success-light)', text: 'var(--color-success)' }
            : { bg: 'var(--color-danger-light)', text: 'var(--color-danger)' }}
        />
      </div>

      <h3 style={{ marginBottom: 12 }}>المبيعات حسب طريقة الدفع (اليوم)</h3>
      <div className="stats-grid" style={{ marginBottom: 22 }}>
        <StatCard icon="💴" label="نقدي" value={`${stats.cashCount} / ${stats.cashTotal.toFixed(2)}`} />
        <StatCard icon="💳" label="فيزا" value={`${stats.visaCount} / ${stats.visaTotal.toFixed(2)}`} />
        <StatCard icon="📲" label="إنستاباي" value={`${stats.instapayCount} / ${stats.instapayTotal.toFixed(2)}`} />
        <StatCard icon="👛" label="محفظة إلكترونية" value={`${stats.eWalletCount} / ${stats.eWalletTotal.toFixed(2)}`} />
      </div>

      <h3 style={{ marginBottom: 12 }}>هذا الشهر</h3>
      <div className="stats-grid">
        <StatCard icon="🧾" label="عدد الفواتير" value={stats.monthSalesCount} />
        <StatCard icon="💵" label="الإيرادات" value={stats.monthRevenue.toFixed(2)} />
        <StatCard icon="📊" label="إجمالي الربح" value={stats.monthGrossProfit.toFixed(2)} />
        <StatCard icon="⬇️" label="المصروفات" value={stats.monthExpenses.toFixed(2)} accent={{ bg: 'var(--color-danger-light)', text: 'var(--color-danger)' }} />
        <StatCard
          icon={stats.monthNetProfit >= 0 ? '📈' : '📉'}
          label={stats.monthNetProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
          value={stats.monthNetProfit.toFixed(2)}
          accent={stats.monthNetProfit >= 0
            ? { bg: 'var(--color-success-light)', text: 'var(--color-success)' }
            : { bg: 'var(--color-danger-light)', text: 'var(--color-danger)' }}
        />
      </div>
    </div>
  );
}
