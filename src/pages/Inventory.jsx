import React, { useEffect, useState, useCallback } from 'react';
import { listProductsWithStock } from '../queries/products.js';
import { listMovements, adjustStock, listTransfers, transferStock, inventoryValueReport } from '../queries/inventory.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { PageError } from '../components/AsyncState.jsx';

const MOVEMENT_LABELS = { in: 'إضافة للمخزون', out: 'سحب من المخزون', adjustment: 'تسوية جرد', sale: 'بيع', refund: 'استرجاع' };

export default function Inventory({ profile }) {
  const { branchId, branches } = useBranch();
  const [tab, setTab] = useState('stock');
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [valueReport, setValueReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [allProducts, moves, trans, report] = await Promise.all([
        listProductsWithStock({ branchId }),
        listMovements({ branchId, limit: 100 }),
        listTransfers({ branchId, limit: 100 }),
        inventoryValueReport({ branchId })
      ]);
    // Recipe Products don't track stock_quantity of their own (see
    // product_type in src/pages/Products.jsx) — Main Inventory (stock
    // adjustment + branch transfers) only makes sense for products that do.
    setProducts(allProducts.filter((p) => !p.is_recipe_product));
    setMovements(moves);
    setTransfers(trans);
      setValueReport(report);
    } catch (err) { console.error('[Inventory]', err); setError(err); }
    finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  if (loading && !products.length && !movements.length && !transfers.length) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !products.length && !movements.length && !transfers.length) return <PageError error={error} onRetry={load} />;

  return (
    <div>
      <div className="pill-row" style={{ marginBottom: 16 }}>
        <button className={`pill ${tab === 'stock' ? 'active' : ''}`} onClick={() => setTab('stock')}>الكمية الحالية</button>
        <button className={`pill ${tab === 'value' ? 'active' : ''}`} onClick={() => setTab('value')}>قيمة المخزون</button>
        <button className={`pill ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>سجل الحركات</button>
        <button className={`pill ${tab === 'transfer' ? 'active' : ''}`} onClick={() => setTab('transfer')}>نقل بين الفروع</button>
      </div>

      {tab === 'stock' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>المنتج</th>
                {!branchId && <th>الفرع</th>}
                <th>الكمية</th>
                <th>حد التنبيه</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const low = Number(p.stock_quantity) <= Number(p.low_stock_threshold);
                const out = Number(p.stock_quantity) <= 0;
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong></td>
                    {!branchId && <td>{p.branches?.name || '—'}</td>}
                    <td className="mono-num">{Number(p.stock_quantity)} {p.unit}</td>
                    <td className="mono-num">{Number(p.low_stock_threshold)}</td>
                    <td>
                      {out ? <span className="badge badge-danger">نفدت الكمية</span>
                        : low ? <span className="badge badge-warning">مخزون منخفض</span>
                        : <span className="badge badge-success">متوفر</span>}
                    </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setAdjustTarget(p)}>تعديل الكمية</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {products.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
        </div>
      )}

      {tab === 'value' && valueReport && (
        <div>
          <div className="flex gap-16 flex-wrap" style={{ marginBottom: 20 }}>
            <div className="card card-pad" style={{ flex: 1, minWidth: 160 }}>
              <div className="text-muted" style={{ fontSize: 12.5 }}>قيمة المنتجات</div>
              <div className="mono-num" style={{ fontSize: 20, fontWeight: 700 }}>{valueReport.productsValue.toFixed(2)}</div>
            </div>
            <div className="card card-pad" style={{ flex: 1, minWidth: 160 }}>
              <div className="text-muted" style={{ fontSize: 12.5 }}>قيمة المواد الخام</div>
              <div className="mono-num" style={{ fontSize: 20, fontWeight: 700 }}>{valueReport.rawMaterialsValue.toFixed(2)}</div>
            </div>
            <div className="card card-pad" style={{ flex: 1, minWidth: 160 }}>
              <div className="text-muted" style={{ fontSize: 12.5 }}>إجمالي قيمة المخزون</div>
              <div className="mono-num" style={{ fontSize: 20, fontWeight: 700 }}>{valueReport.totalValue.toFixed(2)}</div>
            </div>
          </div>

          {valueReport.maxProducible.length > 0 && (
            <>
              <h3 style={{ marginBottom: 12 }}>الحد الأقصى القابل للتصنيع</h3>
              <div className="table-wrap" style={{ marginBottom: 20 }}>
                <table className="data-table">
                  <thead><tr><th>المنتج</th><th>الحد الأقصى</th><th>المادة المحدّدة (الأقل توفرًا)</th></tr></thead>
                  <tbody>
                    {valueReport.maxProducible.map((mp) => (
                      <tr key={mp.productId}>
                        <td><strong>{mp.name}</strong></td>
                        <td className="mono-num">{mp.maxUnits}</td>
                        <td>{mp.limitingMaterial || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h3 style={{ marginBottom: 12 }}>قيمة المواد الخام</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>اسم المادة</th><th>الكمية الحالية</th><th>تكلفة الوحدة</th><th>القيمة</th></tr></thead>
              <tbody>
                {valueReport.rawMaterials.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{m.name}</strong> {m.lowStock && <span className="badge badge-warning">مخزون منخفض</span>}</td>
                    <td className="mono-num">{m.stock} {m.unit}</td>
                    <td className="mono-num">{m.cost.toFixed(4)}</td>
                    <td className="mono-num">{m.value.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {valueReport.rawMaterials.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>المنتج</th>
                {!branchId && <th>الفرع</th>}
                <th>النوع</th>
                <th>الكمية</th>
                <th>السبب</th>
                <th>بواسطة</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.products?.name || '—'}</td>
                  {!branchId && <td>{m.branches?.name || '—'}</td>}
                  <td><span className={`badge ${m.quantity >= 0 ? 'badge-success' : 'badge-danger'}`}>{MOVEMENT_LABELS[m.type] || m.type}</span></td>
                  <td className="mono-num">{m.quantity > 0 ? '+' : ''}{Number(m.quantity)}</td>
                  <td>{m.reason || '—'}</td>
                  <td>{m.profiles?.full_name || '—'}</td>
                  <td className="mono-num">{new Date(m.created_at).toLocaleString('ar-EG')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movements.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
        </div>
      )}

      {tab === 'transfer' && (
        <div>
          <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
            <div></div>
            <button className="btn btn-primary" onClick={() => setTransferOpen(true)}>نقل مخزون</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>من فرع</th>
                  <th>إلى فرع</th>
                  <th>الكمية</th>
                  <th>بواسطة</th>
                  <th>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((tr) => (
                  <tr key={tr.id}>
                    <td><strong>{tr.product_name}</strong>{tr.note && <div className="text-muted" style={{ fontSize: 11.5 }}>{tr.note}</div>}</td>
                    <td>{tr.from_branch?.name || '—'}</td>
                    <td>{tr.to_branch?.name || '—'}</td>
                    <td className="mono-num">{Number(tr.quantity)}</td>
                    <td>{tr.profiles?.full_name || '—'}</td>
                    <td className="mono-num">{new Date(tr.created_at).toLocaleString('ar-EG')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transfers.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
          </div>
        </div>
      )}

      {adjustTarget && (
        <AdjustModal product={adjustTarget} profile={profile} onClose={() => setAdjustTarget(null)} onSaved={() => { setAdjustTarget(null); load(); }} />
      )}
      {transferOpen && (
        <TransferModal products={products} branches={branches} profile={profile} onClose={() => setTransferOpen(false)} onSaved={() => { setTransferOpen(false); load(); }} />
      )}
    </div>
  );
}

function AdjustModal({ product, profile, onClose, onSaved }) {
  const [type, setType] = useState('in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!quantity) return;
    setSaving(true);
    try {
      await adjustStock({ productId: product.id, type, quantity: Number(quantity), reason: reason || null, userId: profile.id, branchId: product.branch_id });
      onSaved();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>تعديل الكمية - {product.name}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <p className="text-muted">الكمية الحالية: <strong className="mono-num">{Number(product.stock_quantity)} {product.unit}</strong></p>
          <div className="field">
            <label>نوع الحركة</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="in">إضافة للمخزون</option>
              <option value="out">سحب من المخزون</option>
              <option value="adjustment">تسوية جرد</option>
            </select>
          </div>
          <div className="field"><label>الكمية</label><input className="input" type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div className="field"><label>السبب</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>حفظ</button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({ products, branches, profile, onClose, onSaved }) {
  const [fromProductId, setFromProductId] = useState(products[0]?.id || '');
  const [toBranchId, setToBranchId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!fromProductId || !toBranchId || !quantity) return;
    setSaving(true);
    try {
      await transferStock({ fromProductId, toBranchId, quantity: Number(quantity), note: note || null, userId: profile.id });
      onSaved();
    } catch (err) {
      const messages = { same_branch: 'لا يمكن النقل لنفس الفرع', insufficient_stock: 'الكمية غير كافية', invalid_quantity: 'كمية غير صحيحة' };
      alert(messages[err.message] || 'حدث خطأ، حاول مرة أخرى');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>نقل مخزون</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="field">
            <label>اختر المنتج المطلوب نقله</label>
            <select className="input" value={fromProductId} onChange={(e) => setFromProductId(e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.branches?.name || ''} ({Number(p.stock_quantity)} {p.unit})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>إلى فرع</label>
            <select className="input" value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
              <option value="">اختر الفرع</option>
              {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </select>
          </div>
          <div className="field"><label>الكمية</label><input className="input" type="number" step="0.01" min="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          <div className="field"><label>ملاحظة (اختياري)</label><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>حفظ</button>
        </div>
      </div>
    </div>
  );
}
