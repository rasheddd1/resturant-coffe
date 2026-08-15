import React, { useEffect, useState, useCallback } from 'react';
import {
  listRawMaterials,
  createRawMaterial,
  updateRawMaterial,
  deleteRawMaterial,
  adjustRawMaterialStock,
  purchaseRawMaterial,
  calcPurchaseConversion
} from '../queries/rawMaterials.js';
import { recalculateProductCostsForRawMaterial } from '../queries/recipes.js';
import { subscribeRealtime } from '../lib/realtime.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { PageError } from '../components/AsyncState.jsx';

const UNITS = ['g', 'kg', 'ml', 'L', 'pcs'];

export default function RawMaterials({ profile }) {
  const { branchId, branches } = useBranch();
  const showBranchColumn = !branchId;
  const [materials, setMaterials] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [purchaseTarget, setPurchaseTarget] = useState(null);

  const load = useCallback(async (s = search) => {
    setLoading(true); setError(null);
    try { setMaterials(await listRawMaterials({ search: s, branchId })); }
    catch (err) { console.error('[RawMaterials]', err); setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    load();
    let timer;
    const unsubscribe = subscribeRealtime(['raw_materials'], () => {
      clearTimeout(timer);
      timer = setTimeout(() => load(), 400);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleDelete(material) {
    if (!window.confirm('هل أنت متأكد من الحذف؟')) return;
    try {
      await deleteRawMaterial(material.id);
      load();
    } catch (err) {
      // A raw material used in a product's recipe can't be hard-deleted
      // (FK restrict) — offer to deactivate instead, same pattern products
      // already use for categories/products in use.
      const isFkError = err?.code === '23503' || /foreign key|violates|constraint/i.test(err?.message || '');
      if (!isFkError) { alert('حدث خطأ، حاول مرة أخرى'); return; }
      const wantsDeactivate = window.confirm('هذه المادة مستخدمة في وصفة منتج ولا يمكن حذفها. هل تريد إيقافها بدلاً من ذلك؟');
      if (!wantsDeactivate) return;
      try {
        await updateRawMaterial(material.id, { is_active: false });
        load();
      } catch {
        alert('حدث خطأ، حاول مرة أخرى');
      }
    }
  }

  if (loading && !materials.length) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !materials.length) return <PageError error={error} onRetry={() => load()} />;

  const lowStockMaterials = materials.filter((m) => m.is_active && Number(m.stock_quantity) <= Number(m.low_stock_threshold));
  const inventoryValue = materials.reduce((sum, m) => sum + Number(m.stock_quantity || 0) * Number(m.cost || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center flex-wrap gap-12" style={{ marginBottom: 18 }}>
        <div className="field" style={{ maxWidth: 300, marginBottom: 0 }}>
          <input className="input" placeholder="ابحث عن مادة خام..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-12">
          <div className="text-muted" style={{ fontSize: 12.5 }}>قيمة المخزون: <strong className="mono-num">{inventoryValue.toFixed(2)}</strong></div>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}>+ مادة خام جديدة</button>
        </div>
      </div>

      {lowStockMaterials.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 16, borderColor: 'var(--color-warning, #D4A017)' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>⚠️ تنبيهات مخزون منخفض</div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            {lowStockMaterials.map((m) => `${m.name} (${Number(m.stock_quantity)} ${m.unit})`).join(' · ')}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>اسم المادة</th>
              {showBranchColumn && <th>الفرع</th>}
              <th>وحدة الاستهلاك</th>
              <th>الكمية الحالية</th>
              <th>تكلفة الوحدة</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const low = Number(m.stock_quantity) <= Number(m.low_stock_threshold);
              const out = Number(m.stock_quantity) <= 0;
              return (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong></td>
                  {showBranchColumn && <td>{m.branches?.name || '—'}</td>}
                  <td>{m.unit}</td>
                  <td>
                    <span className="mono-num">{Number(m.stock_quantity)} {m.unit}</span>{' '}
                    {out ? <span className="badge badge-danger">نفدت الكمية</span> : low ? <span className="badge badge-warning">مخزون منخفض</span> : null}
                  </td>
                  <td className="mono-num">{Number(m.cost).toFixed(4)}</td>
                  <td><span className={`badge ${m.is_active ? 'badge-success' : 'badge-muted'}`}>{m.is_active ? 'مفعل' : 'غير مفعل'}</span></td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-ghost btn-sm" title="تسجيل شراء" onClick={() => setPurchaseTarget(m)}>🛒</button>
                      <button className="btn btn-ghost btn-sm" title="تعديل الكمية" onClick={() => setAdjustTarget(m)}>📉</button>
                      <button className="btn btn-ghost btn-sm" title="تعديل" onClick={() => setEditing(m)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" title="حذف" onClick={() => handleDelete(m)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {materials.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
      </div>

      {editing !== undefined && (
        <MaterialModal
          material={editing}
          branches={branches}
          branchId={branchId}
          showBranchColumn={showBranchColumn}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); load(); }}
        />
      )}
      {adjustTarget && (
        <AdjustModal material={adjustTarget} profile={profile} onClose={() => setAdjustTarget(null)} onSaved={() => { setAdjustTarget(null); load(); }} />
      )}
      {purchaseTarget && (
        <PurchaseModal material={purchaseTarget} profile={profile} onClose={() => setPurchaseTarget(null)} onSaved={() => { setPurchaseTarget(null); load(); }} />
      )}
    </div>
  );
}

// Create/edit modal. For a NEW material, stock_quantity/cost are DERIVED
// from the purchase fields (purchase unit/quantity/total cost + a
// conversion factor) via calcPurchaseConversion() — a live preview updates
// as you type. For an EXISTING material, cost/stock are read-only: they can
// only change from here on via the dedicated Purchase (🛒, Weighted Average
// Cost) or Adjust Stock (📉, manual correction) actions.
function MaterialModal({ material, branches, branchId, showBranchColumn, onClose, onSaved }) {
  const [form, setForm] = useState({
    branch_id: material?.branch_id || branchId || (branches[0]?.id ?? ''),
    name: material?.name || '',
    unit: material?.unit || 'g',
    purchase_unit: material?.purchase_unit || '',
    purchase_quantity: material?.purchase_quantity ?? '',
    conversion_factor: material?.conversion_factor ?? 1,
    total_purchase_cost: material?.total_purchase_cost ?? '',
    low_stock_threshold: material?.low_stock_threshold ?? 0,
    is_active: material?.is_active !== false
  });
  const [saving, setSaving] = useState(false);

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  const { consumptionQty, costPerUnit } = calcPurchaseConversion({
    purchaseQuantity: form.purchase_quantity,
    conversionFactor: form.conversion_factor,
    totalPurchaseCost: form.total_purchase_cost
  });

  async function handleSave() {
    if (!form.name.trim()) return;
    if (!material && showBranchColumn && !form.branch_id) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      unit: form.unit,
      low_stock_threshold: Number(form.low_stock_threshold || 0),
      is_active: form.is_active
    };
    if (!material) {
      payload.branch_id = showBranchColumn ? form.branch_id : branchId;
      payload.purchase_unit = form.purchase_unit.trim() || null;
      payload.purchase_quantity = Number(form.purchase_quantity || 0);
      payload.conversion_factor = Number(form.conversion_factor || 1);
      payload.total_purchase_cost = Number(form.total_purchase_cost || 0);
    }
    try {
      if (material) {
        await updateRawMaterial(material.id, payload);
        // A material can only change cost via a purchase, but is_active
        // toggles right here — and an ingredient going inactive changes
        // every product that uses it (excluded from cost calculation).
        await recalculateProductCostsForRawMaterial(material.id);
      } else {
        await createRawMaterial(payload);
      }
      onSaved();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{material ? 'تعديل مادة خام' : 'مادة خام جديدة'}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          {!material && showBranchColumn && (
            <div className="field">
              <label>الفرع</label>
              <select className="input" value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
          )}
          <div className="field"><label>اسم المادة</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field">
            <label>وحدة الاستهلاك</label>
            <select className="input" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
              {UNITS.map((u) => (<option key={u} value={u}>{u}</option>))}
            </select>
          </div>

          {!material ? (
            <>
              <div className="flex gap-12">
                <div className="field" style={{ flex: 1 }}><label>وحدة الشراء</label><input className="input" placeholder="L, Kg, Box..." value={form.purchase_unit} onChange={(e) => set('purchase_unit', e.target.value)} /></div>
                <div className="field" style={{ flex: 1 }}><label>كمية الشراء</label><input className="input" type="number" step="0.001" min="0" value={form.purchase_quantity} onChange={(e) => set('purchase_quantity', e.target.value)} /></div>
              </div>
              <div className="flex gap-12">
                <div className="field" style={{ flex: 1 }}><label>معامل التحويل</label><input className="input" type="number" step="0.000001" min="0.000001" value={form.conversion_factor} onChange={(e) => set('conversion_factor', e.target.value)} /></div>
                <div className="field" style={{ flex: 1 }}><label>إجمالي تكلفة الشراء</label><input className="input" type="number" step="0.01" min="0" value={form.total_purchase_cost} onChange={(e) => set('total_purchase_cost', e.target.value)} /></div>
              </div>
              <div className="field">
                <div className="text-muted mono-num" style={{ fontSize: 12.5, background: 'var(--color-surface-2)', borderRadius: 8, padding: '8px 10px' }}>
                  المعاينة: {form.purchase_quantity || 0} {form.purchase_unit || '?'} = {consumptionQty.toLocaleString('en-US')} {form.unit} | تكلفة الوحدة = {costPerUnit.toFixed(4)}
                </div>
              </div>
            </>
          ) : (
            <div className="flex gap-12">
              <div className="field" style={{ flex: 1 }}>
                <label>الكمية الحالية</label>
                <div className="input mono-num" style={{ background: 'var(--color-surface-2)' }}>{Number(material.stock_quantity)} {material.unit}</div>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>تكلفة الوحدة</label>
                <div className="input mono-num" style={{ background: 'var(--color-surface-2)' }}>{Number(material.cost).toFixed(4)}</div>
              </div>
            </div>
          )}
          {material && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: -6, marginBottom: 6 }}>
              لتحديث الكمية أو التكلفة استخدم "تسجيل شراء" (🛒) أو "تعديل الكمية" (📉).
            </p>
          )}

          <div className="field"><label>حد التنبيه للمخزون المنخفض</label><input className="input" type="number" step="0.001" value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></div>
          <div className="field">
            <label>الحالة</label>
            <select className="input" value={form.is_active ? 'true' : 'false'} onChange={(e) => set('is_active', e.target.value === 'true')}>
              <option value="true">مفعل</option>
              <option value="false">غير مفعل</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>حفظ</button>
        </div>
      </div>
    </div>
  );
}

// Manual correction/waste — does NOT touch cost, only stock_quantity.
// Restocking with an actual purchase (which DOES affect cost via Weighted
// Average Cost) is the separate PurchaseModal below.
function AdjustModal({ material, profile, onClose, onSaved }) {
  const [type, setType] = useState('in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!quantity) return;
    setSaving(true);
    try {
      await adjustRawMaterialStock({
        rawMaterialId: material.id,
        type,
        quantity: Number(quantity),
        reason: reason || null,
        userId: profile.id,
        branchId: material.branch_id
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
        <div className="modal-header"><h3>تعديل الكمية - {material.name}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <p className="text-muted">الكمية الحالية: <strong className="mono-num">{Number(material.stock_quantity)} {material.unit}</strong></p>
          <div className="field">
            <label>نوع الحركة</label>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="in">إضافة للمخزون</option>
              <option value="out">سحب من المخزون</option>
              <option value="adjustment">تسوية جرد</option>
              <option value="waste">هالك</option>
            </select>
          </div>
          <div className="field"><label>الكمية</label><input className="input" type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
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

// Restock via an actual purchase: adds stock (converted from purchase_unit
// to the material's consumption unit) and blends the new batch's cost into
// the running Weighted Average Cost — never simply overwrites the old cost.
function PurchaseModal({ material, profile, onClose, onSaved }) {
  const [form, setForm] = useState({
    purchase_unit: material.purchase_unit || '',
    purchase_quantity: '',
    conversion_factor: material.conversion_factor ?? 1,
    total_purchase_cost: '',
    reason: ''
  });
  const [saving, setSaving] = useState(false);

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  const { consumptionQty } = calcPurchaseConversion({
    purchaseQuantity: form.purchase_quantity,
    conversionFactor: form.conversion_factor,
    totalPurchaseCost: form.total_purchase_cost
  });
  const oldStock = Number(material.stock_quantity) || 0;
  const oldCost = Number(material.cost) || 0;
  const newStock = oldStock + consumptionQty;
  const newCost = newStock > 0 ? (oldStock * oldCost + Number(form.total_purchase_cost || 0)) / newStock : oldCost;

  async function handleSave() {
    if (!form.purchase_unit.trim() || !form.purchase_quantity || !form.total_purchase_cost) return;
    setSaving(true);
    try {
      await purchaseRawMaterial({
        rawMaterialId: material.id,
        purchaseUnit: form.purchase_unit.trim(),
        purchaseQuantity: Number(form.purchase_quantity),
        totalPurchaseCost: Number(form.total_purchase_cost),
        conversionFactor: Number(form.conversion_factor || 1),
        reason: form.reason || null,
        userId: profile.id,
        branchId: material.branch_id
      });
      // A raw material's purchase price / conversion factor just changed —
      // recalculate the persisted cost of every product whose recipe uses it.
      await recalculateProductCostsForRawMaterial(material.id);
      onSaved();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>تسجيل شراء - {material.name}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <p className="text-muted" style={{ fontSize: 12.5 }}>سجّل عملية الشراء بوحدتها الأصلية، وسيتم تحويلها تلقائيًا لوحدة الاستهلاك مع تحديث المتوسط المرجّح للتكلفة.</p>
          <p className="text-muted">الكمية الحالية: <strong className="mono-num">{oldStock} {material.unit}</strong> · تكلفة الوحدة: <strong className="mono-num">{oldCost.toFixed(4)}</strong></p>
          <div className="flex gap-12">
            <div className="field" style={{ flex: 1 }}><label>وحدة الشراء</label><input className="input" placeholder="L, Kg, Box..." value={form.purchase_unit} onChange={(e) => set('purchase_unit', e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>كمية الشراء</label><input className="input" type="number" step="0.001" min="0.001" value={form.purchase_quantity} onChange={(e) => set('purchase_quantity', e.target.value)} /></div>
          </div>
          <div className="flex gap-12">
            <div className="field" style={{ flex: 1 }}><label>معامل التحويل</label><input className="input" type="number" step="0.000001" min="0.000001" value={form.conversion_factor} onChange={(e) => set('conversion_factor', e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>إجمالي تكلفة الشراء</label><input className="input" type="number" step="0.01" min="0" value={form.total_purchase_cost} onChange={(e) => set('total_purchase_cost', e.target.value)} /></div>
          </div>
          <div className="field">
            <div className="text-muted mono-num" style={{ fontSize: 12.5, background: 'var(--color-surface-2)', borderRadius: 8, padding: '8px 10px' }}>
              المعاينة: +{consumptionQty.toLocaleString('en-US')} {material.unit} → الكمية {newStock.toLocaleString('en-US')} {material.unit} | تكلفة الوحدة (متوسط مرجّح) = {newCost.toFixed(4)}
            </div>
          </div>
          <div className="field"><label>السبب (اختياري)</label><input className="input" value={form.reason} onChange={(e) => set('reason', e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>حفظ</button>
        </div>
      </div>
    </div>
  );
}
