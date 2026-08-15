import React, { useEffect, useState, useCallback } from 'react';
import DateRangeTabs from '../components/DateRangeTabs.jsx';
import StatCard from '../components/StatCard.jsx';
import { accountsSummary, listTransactions, createTransaction, deleteTransaction } from '../queries/accounts.js';
import { subscribeRealtime } from '../lib/realtime.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { PageError } from '../components/AsyncState.jsx';

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function isoDate(d) { return d.toISOString().slice(0, 10); }

// Minimal CSV builder (Excel opens .csv natively) — no external dependency
// needed. Values are quoted and any embedded quote is doubled per the CSV
// spec.
function downloadCSV(filename, headers, rows) {
  const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))].join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Accounting({ profile }) {
  const [range, setRange] = useState('today');
  const [customFrom, setCustomFrom] = useState(isoDate(new Date()));
  const [customTo, setCustomTo] = useState(isoDate(new Date()));
  const [summary, setSummary] = useState(null);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [txnModal, setTxnModal] = useState(null); // 'income' | 'expense' | null
  const { branchId, branches } = useBranch();

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
      const [s, t] = await Promise.all([
        accountsSummary({ from, to, branchId }),
        listTransactions({ from: from.slice(0, 10), to: to.slice(0, 10), branchId })
      ]);
      setSummary(s); setTxns(t);
    } catch (err) { console.error('[Accounting]', err); setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, customFrom, customTo, branchId]);

  useEffect(() => {
    load();
    let timer;
    const unsubscribe = subscribeRealtime(['transactions', 'sales'], () => {
      clearTimeout(timer);
      timer = setTimeout(load, 500);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [load]);

  if (loading && !summary) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !summary) return <PageError error={error} onRetry={load} />;

  async function handleDeleteTxn(id) {
    if (!window.confirm('هل أنت متأكد من الحذف؟')) return;
    try {
      await deleteTransaction(id);
      load();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
    }
  }

  const isLoss = summary.netProfit < 0;

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
        <div className="flex gap-8">
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨️ طباعة الحسابات</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              downloadCSV(
                `accounts-${isoDate(new Date())}.csv`,
                ['التاريخ', 'النوع', 'التصنيف', 'الوصف', 'المبلغ'],
                txns.map((tx) => [tx.txn_date, tx.type === 'income' ? 'إيراد' : 'مصروف', tx.category || '', tx.description || '', Number(tx.amount).toFixed(2)])
              )
            }
          >
            📊 تصدير Excel
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setTxnModal('expense')}>➖ إضافة مصروف</button>
          <button className="btn btn-accent btn-sm" onClick={() => setTxnModal('income')}>➕ إضافة إيراد</button>
        </div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 16, marginTop: 10 }}>
        <StatCard icon="💰" label="إيرادات المبيعات" value={summary.salesRevenue.toFixed(2)} />
        <StatCard icon="📦" label="تكلفة البضاعة" value={summary.costOfGoods.toFixed(2)} />
        <StatCard icon="📊" label="إجمالي الربح" value={summary.grossProfit.toFixed(2)} />
        <StatCard icon="⬆️" label="إيرادات يدوية" value={`+${summary.manualIncome.toFixed(2)}`} accent={{ bg: 'var(--color-success-light)', text: 'var(--color-success)' }} />
        <StatCard icon="⬇️" label="مصروفات يدوية" value={`-${summary.manualExpense.toFixed(2)}`} accent={{ bg: 'var(--color-danger-light)', text: 'var(--color-danger)' }} />
        <StatCard
          icon={isLoss ? '📉' : '📈'}
          label={isLoss ? 'صافي الخسارة' : 'صافي الربح'}
          value={summary.netProfit.toFixed(2)}
          accent={isLoss ? { bg: 'var(--color-danger-light)', text: 'var(--color-danger)' } : { bg: 'var(--color-success-light)', text: 'var(--color-success)' }}
        />
      </div>

      <h3 style={{ margin: '18px 0 12px' }}>سجل الحركات المالية</h3>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              {!branchId && <th>الفرع</th>}
              <th>النوع</th>
              <th>التصنيف</th>
              <th>الوصف</th>
              <th>المبلغ</th>
              <th>بواسطة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((tx) => (
              <tr key={tx.id}>
                <td className="mono-num">{tx.txn_date}</td>
                {!branchId && <td>{tx.branches?.name || '—'}</td>}
                <td><span className={`badge ${tx.type === 'income' ? 'badge-success' : 'badge-danger'}`}>{tx.type === 'income' ? 'إيراد' : 'مصروف'}</span></td>
                <td>{tx.category || '—'}</td>
                <td>{tx.description || '—'}</td>
                <td className="mono-num">{tx.type === 'income' ? '+' : '-'}{Number(tx.amount).toFixed(2)}</td>
                <td>{tx.profiles?.full_name || '—'}</td>
                <td><button className="btn btn-ghost btn-sm" onClick={() => handleDeleteTxn(tx.id)}>🗑️</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {txns.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
      </div>

      {txnModal && (
        <TransactionModal
          type={txnModal}
          branches={branches}
          defaultBranchId={branchId}
          profile={profile}
          onClose={() => setTxnModal(null)}
          onSaved={() => { setTxnModal(null); load(); }}
        />
      )}
    </div>
  );
}

function TransactionModal({ type, branches, defaultBranchId, profile, onClose, onSaved }) {
  const showBranchField = !defaultBranchId;
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [txnDate, setTxnDate] = useState(isoDate(new Date()));
  const [branchId, setBranchId] = useState(defaultBranchId || (branches[0]?.id ?? ''));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!amount || (!branchId)) return;
    setSaving(true);
    try {
      await createTransaction({
        type,
        branch_id: branchId,
        amount: Number(amount),
        category: category.trim() || null,
        description: description.trim() || null,
        txn_date: txnDate,
        created_by: profile.id
      });
      onSaved();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{type === 'income' ? 'إضافة إيراد' : 'إضافة مصروف'}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          {showBranchField && (
            <div className="field">
              <label>الفرع</label>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
          )}
          <div className="field"><label>المبلغ</label><input className="input" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="field"><label>التصنيف</label><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
          <div className="field"><label>الوصف</label><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="field"><label>التاريخ</label><input className="input" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className={`btn ${type === 'income' ? 'btn-accent' : 'btn-danger'}`} disabled={saving} onClick={handleSave}>حفظ</button>
        </div>
      </div>
    </div>
  );
}
