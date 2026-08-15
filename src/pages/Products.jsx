import React, { useEffect, useState, useCallback } from 'react';
import { listProductsWithStock, bestSellingProducts, listCategories, createProduct, updateProduct, deleteProduct, createCategory, updateCategory, deleteCategory } from '../queries/products.js';
import { listRawMaterials } from '../queries/rawMaterials.js';
import { getProductRecipe, saveProductRecipe, calcRecipeUnitCost } from '../queries/recipes.js';
import { subscribeRealtime } from '../lib/realtime.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { PageError } from '../components/AsyncState.jsx';

const CATEGORY_ICONS = [
  '📦', '🛒', '🛍️', '🧺', '🧴', '🧼', '🧻', '🧂', '🧃', '🥫', '🧀', '🥛',
  '🍞', '🥖', '🍎', '🍌', '🥕', '🥦', '🍗', '🥩', '🐟', '🧊', '💊', '🧸',
  '👕', '🔧', '🌸', '🎁',
  '🍔', '🍕', '🌭', '🌮', '🌯', '🍟', '🍝', '🍜', '🍛', '🍲', '🍚', '🥙',
  '🥗', '🍖', '🍤', '🥘',
  '☕', '🍵', '🧋', '🥤', '🍰', '🧁', '🍩', '🍪', '🥐', '🍫', '🍨', '🍦'
];

// Resizes/compresses an uploaded image client-side into a small JPEG data
// URL (stored directly in products.image_url — same approach the desktop
// cashier app uses, no external file storage needed).
function fileToResizedDataURL(file, maxSize = 500, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('invalid_image'));
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [top, setTop] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, object = edit
  const [managingCategories, setManagingCategories] = useState(false);
  const { branchId, branches } = useBranch();

  const load = useCallback(async (s = search) => {
    setError(null); setLoading(true);
    try {
      const now = new Date();
      const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [prods, bestSellers, cats] = await Promise.all([
        listProductsWithStock({ search: s, branchId }),
        bestSellingProducts({ from: monthFrom, to: now.toISOString(), limit: 8, branchId }),
        listCategories({ branchId })
      ]);
      setProducts(prods); setTop(bestSellers); setCategories(cats);
    } catch (err) { console.error('[Products]', err); setError(err); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  useEffect(() => {
    load();
    let timer;
    const unsubscribe = subscribeRealtime(['products'], () => {
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

  async function handleDelete(id) {
    if (!window.confirm('هل أنت متأكد من الحذف؟')) return;
    try {
      await deleteProduct(id);
      load();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
    }
  }

  if (loading && !products.length && !categories.length) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !products.length && !categories.length) return <PageError error={error} onRetry={() => load()} />;

  const lowStock = products.filter((p) => !p.is_recipe_product && Number(p.stock_quantity) <= Number(p.low_stock_threshold));

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <h3 style={{ marginBottom: 14 }}>الأكثر مبيعاً (هذا الشهر)</h3>
        <div className="flex-col gap-8">
          {top.length === 0 ? (
            <div className="text-muted">لا توجد بيانات</div>
          ) : top.map((p, i) => (
            <div className="flex justify-between items-center" key={p.name} style={{ marginBottom: 6 }}>
              <div className="flex items-center gap-8">
                <span className="badge badge-muted">{i + 1}</span>
                <span>{p.name}</span>
              </div>
              <div className="mono-num text-muted">{p.qty} قطعة · {p.total.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-12" style={{ marginBottom: 14 }}>
        <div className="field" style={{ maxWidth: 260, marginBottom: 0 }}>
          <input className="input" placeholder="ابحث بالاسم أو الباركود..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-12">
          {lowStock.length > 0 && <span className="badge badge-warning">{lowStock.length} صنف بمخزون منخفض</span>}
          <button className="btn btn-ghost btn-sm" onClick={() => setManagingCategories(true)}>🗂️ إدارة الأقسام</button>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}>+ منتج جديد</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>المنتج</th>
              {!branchId && <th>الفرع</th>}
              <th>القسم</th>
              <th>السعر</th>
              <th>الكمية</th>
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
                  <td>
                    <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {p.image_url ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>{p.categories?.icon || '📦'}</span>}
                    </div>
                  </td>
                  <td><strong>{p.name}</strong></td>
                  {!branchId && <td>{p.branches?.name || '—'}</td>}
                  <td>{p.categories ? `${p.categories.icon || ''} ${p.categories.name}` : <span className="text-muted">بدون قسم</span>}</td>
                  <td className="mono-num">{Number(p.price).toFixed(2)}</td>
                  <td className="mono-num">{p.is_recipe_product ? <span className="badge badge-muted">🍳 وصفة</span> : `${Number(p.stock_quantity)} ${p.unit}`}</td>
                  <td>
                    {p.is_recipe_product ? <span className="badge badge-muted">منتج بوصفة</span>
                      : out ? <span className="badge badge-danger">نفدت الكمية</span>
                      : low ? <span className="badge badge-warning">مخزون منخفض</span>
                      : <span className="badge badge-success">متوفر</span>}
                  </td>
                  <td>
                    <div className="flex gap-8">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(p.id)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {products.length === 0 && <div className="table-empty">لا توجد بيانات</div>}
      </div>

      {editing !== undefined && (
        <ProductModal
          product={editing}
          categories={categories}
          branches={branches}
          defaultBranchId={branchId}
          onClose={() => setEditing(undefined)}
          onSaved={() => { setEditing(undefined); load(); }}
        />
      )}

      {managingCategories && (
        <CategoriesManagerModal
          categories={categories}
          branchId={branchId}
          onClose={() => setManagingCategories(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function CategoriesManagerModal({ categories, branchId, onClose, onChanged }) {
  const [editingCategory, setEditingCategory] = useState(undefined); // undefined = closed, null = new, object = edit

  async function handleDeleteCategory(id) {
    if (!window.confirm('هل أنت متأكد من حذف هذا القسم؟')) return;
    try {
      await deleteCategory(id);
      onChanged();
    } catch (err) {
      const isFkError = err?.code === '23503' || /foreign key|violates|constraint/i.test(err?.message || '');
      alert(isFkError
        ? 'لا يمكن حذف هذا القسم لأنه مرتبط بمنتجات موجودة. عدّل منتجات القسم أولاً أو انقلها لقسم آخر.'
        : 'حدث خطأ، حاول مرة أخرى');
    }
  }

  function handleAddNew() {
    if (!branchId) {
      alert('اختر فرعًا محددًا أولًا لإضافة قسم له (الأقسام مستقلة لكل فرع)');
      return;
    }
    setEditingCategory(null);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>إدارة الأقسام</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="flex justify-end" style={{ marginBottom: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={handleAddNew}>+ قسم جديد</button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>القسم</th><th>إجراءات</th></tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="flex items-center gap-8">
                        <span style={{ width: 28, height: 28, borderRadius: 8, background: `${c.color || '#0F766E'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.icon}</span>
                        <strong>{c.name}</strong>
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingCategory(c)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteCategory(c.id)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {categories.length === 0 && <div className="table-empty">لا توجد أقسام</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
        </div>
      </div>

      {editingCategory !== undefined && (
        <CategoryFormModal
          category={editingCategory}
          branchId={branchId}
          onClose={() => setEditingCategory(undefined)}
          onSaved={() => { setEditingCategory(undefined); onChanged(); }}
        />
      )}
    </div>
  );
}

function CategoryFormModal({ category, branchId, onClose, onSaved }) {
  const [name, setName] = useState(category?.name || '');
  const [nameEn, setNameEn] = useState(category?.name_en || '');
  const [color, setColor] = useState(category?.color || '#0F766E');
  const [icon, setIcon] = useState(category?.icon || '📦');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = { name: name.trim(), name_en: nameEn.trim() || null, color, icon };
    try {
      if (category) await updateCategory(category.id, payload);
      else await createCategory(payload, branchId);
      onSaved();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{category ? 'تعديل قسم' : 'قسم جديد'}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="field"><label>اسم القسم</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>الاسم بالإنجليزية</label><input className="input" value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></div>
          <div className="field"><label>اللون</label><input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 42 }} /></div>
          <div className="field">
            <label>الأيقونة</label>
            <div className="flex gap-8" style={{ flexWrap: 'wrap', maxHeight: 180, overflowY: 'auto', padding: 4 }}>
              {CATEGORY_ICONS.map((ic) => (
                <button
                  type="button"
                  key={ic}
                  className="btn btn-ghost"
                  style={{ fontSize: 18, background: icon === ic ? 'var(--color-primary-light)' : undefined }}
                  onClick={() => setIcon(ic)}
                >
                  {ic}
                </button>
              ))}
            </div>
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

function ProductModal({ product, categories, branches, defaultBranchId, onClose, onSaved }) {
  const showBranchField = !defaultBranchId;
  const [image, setImage] = useState(product?.image_url || '');
  const [rawMaterials, setRawMaterials] = useState([]);
  const [recipeRows, setRecipeRows] = useState([]); // [{ rawMaterialId, quantity }]
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [form, setForm] = useState({
    name: product?.name || '',
    name_en: product?.name_en || '',
    barcode: product?.barcode || '',
    category_id: product?.category_id || '',
    branch_id: product?.branch_id || defaultBranchId || (branches[0]?.id ?? ''),
    price: product?.price ?? 0,
    cost: product?.cost ?? 0,
    stock_quantity: product?.stock_quantity ?? 0,
    low_stock_threshold: product?.low_stock_threshold ?? 5,
    unit: product?.unit || 'قطعة',
    is_active: product?.is_active !== false,
    is_recipe_product: product?.is_recipe_product === true
  });
  const [saving, setSaving] = useState(false);

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  // Recipe (BOM) only makes sense for a product that already exists (it
  // needs a product_id to attach recipe lines to) — load its raw materials
  // list and any existing recipe once we know the product's branch.
  useEffect(() => {
    if (!product) return;
    (async () => {
      const [materials, existingRecipe] = await Promise.all([
        listRawMaterials({ onlyActive: true, branchId: product.branch_id }),
        getProductRecipe(product.id).catch(() => [])
      ]);
      setRawMaterials(materials);
      setRecipeRows(existingRecipe.map((line) => ({ rawMaterialId: line.raw_material_id, quantity: line.quantity })));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  function addRecipeRow() {
    setRecipeRows((rows) => [...rows, { rawMaterialId: rawMaterials[0]?.id || '', quantity: '' }]);
  }
  function updateRecipeRow(index, key, value) {
    setRecipeRows((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  }
  function removeRecipeRow(index) {
    setRecipeRows((rows) => rows.filter((_, i) => i !== index));
  }

  const recipeCost = recipeRows.reduce((sum, row) => {
    const material = rawMaterials.find((m) => m.id === row.rawMaterialId);
    if (!material || material.is_active === false) return sum;
    return sum + Number(row.quantity || 0) * Number(material.cost || 0);
  }, 0);
  const recipeProfit = Number(form.price || 0) - recipeCost;
  const recipeMargin = Number(form.price || 0) > 0 ? (recipeProfit / Number(form.price)) * 100 : 0;

  async function handleSaveRecipe() {
    const validRows = recipeRows.filter((r) => r.rawMaterialId && Number(r.quantity) > 0);
    if (validRows.length !== recipeRows.length) {
      alert('كل مكوّن يجب أن يكون له مادة خام وكمية أكبر من صفر');
      return;
    }
    setSavingRecipe(true);
    try {
      await saveProductRecipe(product.id, validRows);
      alert('تم حفظ الوصفة وتحديث تكلفة المنتج تلقائيًا');
      onSaved();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
    } finally {
      setSavingRecipe(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.branch_id) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      name_en: form.name_en.trim() || null,
      barcode: form.barcode.trim() || null,
      category_id: form.category_id || null,
      price: Number(form.price),
      cost: Number(form.cost || 0),
      // Recipe Product: no stock_quantity of its own — it's tracked purely
      // via its BOM/raw materials instead (see the recipe editor below).
      stock_quantity: form.is_recipe_product ? 0 : Number(form.stock_quantity || 0),
      low_stock_threshold: Number(form.low_stock_threshold || 5),
      unit: form.unit.trim() || 'قطعة',
      is_active: form.is_active,
      is_recipe_product: form.is_recipe_product,
      image_url: image || null
    };
    if (!product) payload.branch_id = form.branch_id;
    try {
      if (product) await updateProduct(product.id, payload);
      else await createProduct(payload);
      onSaved();
    } catch (err) {
      alert(err.message?.includes('duplicate') ? 'الباركود مستخدم بالفعل في هذا الفرع' : 'حدث خطأ، حاول مرة أخرى');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{product ? 'تعديل منتج' : 'منتج جديد'}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="field">
            <label>صورة المنتج</label>
            <div className="flex items-center gap-16">
              <div style={{ width: 72, height: 72, borderRadius: 12, border: '1px dashed var(--color-border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--color-surface-2)' }}>
                {image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>📦</span>}
              </div>
              <div className="flex gap-8">
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  رفع صورة
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setImage(await fileToResizedDataURL(file));
                      } catch {
                        alert('حدث خطأ أثناء تحميل الصورة');
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                {image && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImage('')}>إزالة</button>}
              </div>
            </div>
          </div>
          {showBranchField && (
            <div className="field">
              <label>الفرع</label>
              <select className="input" value={form.branch_id} onChange={(e) => set('branch_id', e.target.value)}>
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
          )}
          <div className="field"><label>اسم المنتج</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          <div className="field"><label>الباركود</label><input className="input" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} /></div>
          <div className="field">
            <label>القسم</label>
            <select className="input" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">بدون قسم</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.icon} {c.name}</option>))}
            </select>
          </div>
          <div className="flex gap-12">
            <div className="field" style={{ flex: 1 }}><label>السعر</label><input className="input" type="number" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>التكلفة</label><input className="input" type="number" step="0.01" value={form.cost} onChange={(e) => set('cost', e.target.value)} /></div>
          </div>
          <div className="field">
            <label>نوع المنتج</label>
            <select className="input" value={form.is_recipe_product ? 'recipe' : 'regular'} onChange={(e) => set('is_recipe_product', e.target.value === 'recipe')}>
              <option value="regular">منتج عادي (بكمية مخزون)</option>
              <option value="recipe">منتج بوصفة (مكونات فقط)</option>
            </select>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>المنتج بوصفة لا يُتابع بكمية مخزون خاصة به — يعتمد فقط على توفر مكونات الوصفة أدناه.</div>
          </div>
          {!form.is_recipe_product && (
            <div className="flex gap-12">
              <div className="field" style={{ flex: 1 }}><label>الكمية</label><input className="input" type="number" step="0.01" value={form.stock_quantity} onChange={(e) => set('stock_quantity', e.target.value)} /></div>
              <div className="field" style={{ flex: 1 }}><label>حد التنبيه</label><input className="input" type="number" step="0.01" value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></div>
            </div>
          )}
          <div className="flex gap-12">
            <div className="field" style={{ flex: 1 }}><label>الوحدة</label><input className="input" value={form.unit} onChange={(e) => set('unit', e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}>
              <label>الحالة</label>
              <select className="input" value={form.is_active ? 'true' : 'false'} onChange={(e) => set('is_active', e.target.value === 'true')}>
                <option value="true">مفعل</option>
                <option value="false">غير مفعل</option>
              </select>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 16, paddingTop: 14 }}>
            <label style={{ fontWeight: 700 }}>الوصفة (المواد الخام) — BOM</label>
            {!product ? (
              <p className="text-muted" style={{ fontSize: 12.5, marginTop: 6 }}>احفظ المنتج أولاً لتتمكن من إضافة وصفة له.</p>
            ) : (
              <>
                <p className="text-muted" style={{ fontSize: 12, marginTop: 2, marginBottom: 10 }}>
                  حدد المواد الخام وكمياتها المستخدمة في وحدة واحدة من هذا المنتج، وسيتم حساب التكلفة تلقائيًا من تكلفة هذه المواد.
                </p>
                {recipeRows.map((row, i) => (
                  <div className="flex gap-8 items-center" key={i} style={{ marginBottom: 8 }}>
                    <select className="input" style={{ flex: 2 }} value={row.rawMaterialId} onChange={(e) => updateRecipeRow(i, 'rawMaterialId', e.target.value)}>
                      <option value="">اختر مادة خام</option>
                      {rawMaterials.map((m) => (<option key={m.id} value={m.id}>{m.name} ({m.unit})</option>))}
                    </select>
                    <input className="input" style={{ flex: 1 }} type="number" step="0.001" min="0.001" placeholder="الكمية" value={row.quantity} onChange={(e) => updateRecipeRow(i, 'quantity', e.target.value)} />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRecipeRow(i)}>🗑️</button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" onClick={addRecipeRow}>➕ إضافة مكوّن</button>
                <div className="flex justify-between items-center flex-wrap gap-8" style={{ marginTop: 10 }}>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>التكلفة التقديرية: <strong className="mono-num">{recipeCost.toFixed(2)}</strong></span>
                  <button type="button" className="btn btn-primary btn-sm" disabled={savingRecipe} onClick={handleSaveRecipe}>{savingRecipe ? '...جارٍ الحفظ' : 'حفظ الوصفة'}</button>
                </div>
                <div className="flex gap-16" style={{ marginTop: 4 }}>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>الربح: <strong className="mono-num">{recipeProfit.toFixed(2)}</strong></span>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>هامش الربح: <strong className="mono-num">{recipeMargin.toFixed(0)}%</strong></span>
                </div>
              </>
            )}
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
