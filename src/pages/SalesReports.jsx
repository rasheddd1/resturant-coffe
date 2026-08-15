import React, { useEffect, useState, useCallback } from 'react';
import DateRangeTabs from '../components/DateRangeTabs.jsx';
import StatCard from '../components/StatCard.jsx';
import { salesReport, topProducts, getSaleDetails } from '../queries/sales.js';
import { printReceipt } from '../lib/receipt.js';
import { subscribeRealtime } from '../lib/realtime.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { PageError } from '../components/AsyncState.jsx';

const ORDER_TYPE_LABEL = { dine_in: '🍽️ صالة', takeaway: '🥡 تيك أواي', delivery: '🛵 دليفري' };

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function isoDate(d) { return d.toISOString().slice(0, 10); }

export default function SalesReports() {
  const [range, setRange] = useState('today');
  const [customFrom, setCustomFrom] = useState(isoDate(new Date()));
  const [customTo, setCustomTo] = useState(isoDate(new Date()));
  const [report, setReport] = useState(null);
  const [top, setTop] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState('');
  const { branchId } = useBranch();

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
      const [rep, tp] = await Promise.all([salesReport({ from, to, branchId }), topProducts({ from, to, limit: 8, branchId })]);
      setReport(rep); setTop(tp);
    } catch (err) { console.error('[SalesReports]', err); setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo, branchId]);

  useEffect(() => {
    load();
    let timer;
    const unsubscribe = subscribeRealtime(['sales'], () => {
      clearTimeout(timer);
      timer = setTimeout(load, 500);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [load]);

  if (loading && !report) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !report) return <PageError error={error} onRetry={load} />;

  const maxDay = Math.max(...report.byDay.map(([, v]) => v), 1);

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

      <div className="flex justify-between items-center flex-wrap gap-12" style={{ marginBottom: 6 }}>
        <div></div>
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨️ طباعة التقرير</button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <StatCard icon="💰" label="إجمالي المبيعات" value={report.totalSales.toFixed(2)} />
        <StatCard icon="🧾" label="عدد الفواتير" value={report.totalOrders} />
        <StatCard icon="📈" label="متوسط الفاتورة" value={report.avgOrder.toFixed(2)} />
        <StatCard icon="💴" label="نقدي" value={`${report.cashCount} / ${report.cashTotal.toFixed(2)}`} />
        <StatCard icon="💳" label="فيزا" value={`${report.visaCount} / ${report.visaTotal.toFixed(2)}`} />
        <StatCard icon="📲" label="إنستاباي" value={`${report.instapayCount} / ${report.instapayTotal.toFixed(2)}`} />
        <StatCard icon="👛" label="محفظة إلكترونية" value={`${report.eWalletCount} / ${report.eWalletTotal.toFixed(2)}`} />
      </div>

      <div className="flex gap-16 flex-wrap" style={{ alignItems: 'flex-start' }}>
        <div className="card card-pad" style={{ flex: '1 1 340px' }}>
          <h3 style={{ marginBottom: 14 }}>المبيعات حسب اليوم</h3>
          <div className="flex-col gap-8">
            {report.byDay.length === 0 ? (
              <div className="text-muted">لا توجد بيانات</div>
            ) : report.byDay.map(([day, val]) => (
              <div className="bar-row" key={day} style={{ marginBottom: 8 }}>
                <div style={{ width: 90, fontSize: 12 }} className="text-muted mono-num">{day}</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(val / maxDay) * 100}%` }} /></div>
                <div style={{ width: 80, textAlign: 'end' }} className="mono-num">{val.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-pad" style={{ flex: '1 1 260px' }}>
          <h3 style={{ marginBottom: 14 }}>الأكثر مبيعاً</h3>
          <div className="flex-col gap-10">
            {top.length === 0 ? (
              <div className="text-muted">لا توجد بيانات</div>
            ) : top.map((p, i) => (
              <div className="flex justify-between items-center" key={p.name} style={{ marginBottom: 8 }}>
                <div className="flex items-center gap-8">
                  <span className="badge badge-muted">{i + 1}</span>
                  <span>{p.name}</span>
                </div>
                <div className="mono-num text-muted">{p.qty} قطعة</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-12" style={{ margin: '20px 0 12px' }}>
        <h3 style={{ margin: 0 }}>الفواتير</h3>
        <div className="flex gap-8">
          <div className="field" style={{ marginBottom: 0, maxWidth: 200 }}>
            <input className="input" placeholder="بحث برقم الفاتورة" value={invoiceSearch} onChange={(e) => setInvoiceSearch(e.target.value)} />
          </div>
          <select className="input" style={{ maxWidth: 180 }} value={orderTypeFilter} onChange={(e) => setOrderTypeFilter(e.target.value)}>
            <option value="">كل الأنواع</option>
            <option value="dine_in">🍽️ صالة</option>
            <option value="takeaway">🥡 تيك أواي</option>
            <option value="delivery">🛵 دليفري</option>
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              {!branchId && <th>الفرع</th>}
              <th>التاريخ</th>
              <th>الكاشير</th>
              <th>النوع</th>
              <th>الإجمالي</th>
              <th>طريقة الدفع</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {report.sales
              .filter((s) => !invoiceSearch || (s.invoice_number || '').toLowerCase().includes(invoiceSearch.toLowerCase()))
              .filter((s) => !orderTypeFilter || s.order_type === orderTypeFilter)
              .map((s) => (
                <tr key={s.id}>
                  <td className="mono-num"><strong>{s.invoice_number}</strong></td>
                  {!branchId && <td>{s.branches?.name || '—'}</td>}
                  <td className="mono-num">{new Date(s.created_at).toLocaleString('ar-EG')}</td>
                  <td>{s.profiles?.full_name || '—'}</td>
                  <td>{ORDER_TYPE_LABEL[s.order_type] || s.order_type}</td>
                  <td className="mono-num">{Number(s.total).toFixed(2)}</td>
                  <td>{s.payment_method}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={async () => {
                        try {
                          const { sale, items } = await getSaleDetails(s.id);
                          printReceipt(sale, items);
                        } catch {
                          alert('حدث خطأ، حاول مرة أخرى');
                        }
                      }}
                    >
                      🧾 معاينة
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {report.sales.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
      </div>
    </div>
  );
}
