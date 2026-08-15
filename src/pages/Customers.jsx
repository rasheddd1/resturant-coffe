import React, { useEffect, useState, useCallback } from 'react';
import { listCustomers, getCustomerPurchaseHistory, whatsappLink, createCustomer, updateCustomer, deleteCustomer } from '../queries/customers.js';
import { getSaleDetails } from '../queries/sales.js';
import { printReceipt } from '../lib/receipt.js';
import { subscribeRealtime } from '../lib/realtime.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { PageError } from '../components/AsyncState.jsx';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(null); // { customer, sales }
  const [editing, setEditing] = useState(undefined);
  const { branchId, branches } = useBranch();

  const load = useCallback(async (s = search) => {
    setLoading(true); setError(null);
    try { setCustomers(await listCustomers({ search: s, branchId })); }
    catch (err) { console.error('[Customers]', err); setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    load();
    let timer;
    const unsubscribe = subscribeRealtime(['customers'], () => {
      clearTimeout(timer);
      timer = setTimeout(() => load(), 500);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function openHistory(customer) {
    const sales = await getCustomerPurchaseHistory(customer.id);
    setHistory({ customer, sales });
  }

  async function handleDelete(id) {
    if (!window.confirm('هل أنت متأكد من الحذف؟')) return;
    try {
      await deleteCustomer(id);
      load();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
    }
  }

  if (loading && !customers.length) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !customers.length) return <PageError error={error} onRetry={() => load()} />;

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-12" style={{ marginBottom: 16 }}>
        <div className="field" style={{ maxWidth: 300, marginBottom: 0 }}>
          <input className="input" placeholder="ابحث بالاسم أو الهاتف..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}>+ عميل جديد</button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              {!branchId && <th>الفرع</th>}
              <th>الهاتف</th>
              <th>عنوان التوصيل</th>
              <th>إجمالي المشتريات</th>
              <th>عدد الزيارات</th>
              <th>آخر زيارة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                {!branchId && <td>{c.branches?.name || '—'}</td>}
                <td className="mono-num">{c.phone || <span className="text-muted">بدون رقم</span>}</td>
                <td>{c.address || <span className="text-muted">—</span>}</td>
                <td className="mono-num">{Number(c.total_purchases).toFixed(2)}</td>
                <td className="mono-num">{c.visits_count}</td>
                <td className="mono-num">{c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('ar-EG') : 'لم يزر بعد'}</td>
                <td>
                  <div className="flex gap-8">
                    {c.phone && (
                      <a className="btn btn-ghost btn-sm" href={whatsappLink(c.phone)} target="_blank" rel="noreferrer">💬</a>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => openHistory(c)}>🧾</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(c)}>✏️</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(c.id)}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
      </div>

      {history && (
        <div className="more-sheet-overlay" style={{ alignItems: 'center' }} onClick={() => setHistory(null)}>
          <div className="card" style={{ width: 640, maxWidth: '94vw', maxHeight: '84vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="card-pad">
              <div className="flex justify-between items-center" style={{ marginBottom: 14 }}>
                <h3>سجل مشتريات {history.customer.name}</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setHistory(null)}>✕</button>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة</th><th>إجراءات</th></tr>
                  </thead>
                  <tbody>
                    {history.sales.map((s) => (
                      <tr key={s.id}>
                        <td className="mono-num">{s.invoice_number}</td>
                        <td className="mono-num">{new Date(s.created_at).toLocaleString('ar-EG')}</td>
                        <td className="mono-num">{Number(s.total).toFixed(2)}</td>
                        <td>{s.status}</td>
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
                {history.sales.length === 0 && <div className="table-empty">لا توجد فواتير</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {editing !== undefined && (
        <CustomerModal
          customer={editing}
          branches={branches}
          defaultBranchId={branchId}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); load(); }}
        />
      )}
    </div>
  );
}

function CustomerModal({ customer, branches, defaultBranchId, onClose, onSaved }) {
  const showBranchField = !defaultBranchId;
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [branchId, setBranchId] = useState(customer?.branch_id || defaultBranchId || (branches[0]?.id ?? ''));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = { name: name.trim(), phone: phone.trim() || null, address: address.trim() || null };
    if (!customer) payload.branch_id = branchId;
    try {
      if (customer) await updateCustomer(customer.id, payload);
      else await createCustomer(payload);
      onSaved();
    } catch (err) {
      alert(err.message?.includes('duplicate') ? 'رقم الهاتف مستخدم بالفعل في هذا الفرع' : 'حدث خطأ، حاول مرة أخرى');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{customer ? 'تعديل عميل' : 'عميل جديد'}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          {showBranchField && (
            <div className="field">
              <label>الفرع</label>
              <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
          )}
          <div className="field"><label>اسم العميل</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>رقم الهاتف</label><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="field"><label>عنوان التوصيل</label><textarea className="input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>حفظ</button>
        </div>
      </div>
    </div>
  );
}
