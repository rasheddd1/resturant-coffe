import React, { useEffect, useState, useCallback } from 'react';
import { listProductsWithStock, listCategories, getProductByBarcode } from '../queries/products.js';
import { createSale, markInvoicePrinted, listOpenTickets, closeOpenTicket, getSaleDetails } from '../queries/sales.js';
import { findCustomerByPhone } from '../queries/customers.js';
import { printReceipt } from '../lib/receipt.js';
import { useBranch } from '../hooks/useBranch.jsx';
import { subscribeRealtime } from '../lib/realtime.js';
import { PageError } from '../components/AsyncState.jsx';
import { PAYMENT_METHODS } from '../lib/paymentMethods.js';

export default function Cashier({ profile }) {
  const { branchId, branches } = useBranch();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [invoice, setInvoice] = useState(null); // { sale, items }
  const [openTicketsOpen, setOpenTicketsOpen] = useState(false);
  const [toast, setToastMsg] = useState('');

  const load = useCallback(async () => {
    if (!branchId) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [prods, cats] = await Promise.all([
        listProductsWithStock({ branchId, onlyActive: true }),
        listCategories({ branchId })
      ]);
      setProducts(prods); setCategories(cats);
    } catch (err) { console.error('[Cashier]', err); setError(err); }
    finally { setLoading(false); }
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let timer;
    const unsubscribe = subscribeRealtime(['products'], () => {
      clearTimeout(timer);
      timer = setTimeout(load, 400);
    });
    return unsubscribe;
  }, [load]);

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2600);
  }

  const filtered = products.filter((p) => {
    const matchCat = !activeCategory || p.category_id === activeCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search);
    return matchCat && matchSearch;
  });

  function addToCart(product) {
    const stock = Number(product.stock_quantity);
    setCart((prev) => {
      const existing = prev.find((c) => c.id === product.id);
      // Recipe Products (BOM-only) never track their own stock_quantity —
      // the real ingredient-availability check (assertSufficientRecipeStock)
      // runs at checkout instead.
      if (product.is_recipe_product) {
        if (existing) return prev.map((c) => (c.id === product.id ? { ...c, qty: c.qty + 1 } : c));
        return [...prev, { id: product.id, name: product.name, price: Number(product.price), cost: Number(product.cost || 0), qty: 1, stock: Infinity, unit: product.unit, image_url: product.image_url || null, icon: product.categories?.icon || null, isRecipeProduct: true }];
      }
      if (existing) {
        if (existing.qty + 1 > stock) { showToast('الكمية المتوفرة غير كافية'); return prev; }
        return prev.map((c) => (c.id === product.id ? { ...c, qty: c.qty + 1 } : c));
      }
      if (stock <= 0) { showToast('الكمية المتوفرة غير كافية'); return prev; }
      return [...prev, { id: product.id, name: product.name, price: Number(product.price), cost: Number(product.cost || 0), qty: 1, stock, unit: product.unit, image_url: product.image_url || null, icon: product.categories?.icon || null }];
    });
  }

  function setQty(id, qty) {
    setCart((prev) => {
      const item = prev.find((c) => c.id === id);
      if (!item) return prev;
      if (!Number.isFinite(qty) || qty <= 0) return prev.filter((c) => c.id !== id);
      if (qty > item.stock) { showToast('الكمية المتوفرة غير كافية'); qty = item.stock; }
      return prev.map((c) => (c.id === id ? { ...c, qty } : c));
    });
  }

  function changeQty(id, delta) {
    setCart((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, qty: c.qty + delta } : c)).filter((c) => c.qty > 0);
      return next;
    });
  }

  function removeItem(id) {
    setCart((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleBarcodeEnter(e) {
    if (e.key !== 'Enter') return;
    const value = search.trim();
    if (!value) return;
    try {
      const product = await getProductByBarcode(value, branchId);
      if (product) { addToCart(product); setSearch(''); }
      else showToast('لم يتم العثور على منتج بهذا الباركود');
    } catch {
      showToast('حدث خطأ، حاول مرة أخرى');
    }
  }

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  if (!branchId) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🏬</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>اختر فرعًا محددًا</div>
        <div className="text-muted" style={{ marginTop: 6 }}>اختر فرعًا من القائمة أعلى الصفحة لبدء عمليات البيع</div>
      </div>
    );
  }

  if (loading && !products.length) return <div className="page-loader"><div className="spinner" /></div>;
  if (error && !products.length) return <PageError error={error} onRetry={load} />;

  return (
    <div className="cashier-layout">
      <div>
        <div className="field" style={{ marginBottom: 10 }}>
          <input
            className="input"
            placeholder="امسح الباركود أو ابحث عن منتج..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleBarcodeEnter}
          />
        </div>
        <div className="pill-row" style={{ marginBottom: 12 }}>
          <button className={`pill ${activeCategory === '' ? 'active' : ''}`} onClick={() => setActiveCategory('')}>الكل</button>
          {categories.map((c) => (
            <button key={c.id} className={`pill ${activeCategory === c.id ? 'active' : ''}`} onClick={() => setActiveCategory(c.id)}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
        <div className="product-grid">
          {filtered.length === 0 && <div className="empty-state" style={{ gridColumn: '1/-1' }}><div className="empty-icon">🔍</div>لا توجد بيانات</div>}
          {filtered.map((p) => (
            <button key={p.id} className="product-tile" disabled={!p.is_recipe_product && Number(p.stock_quantity) <= 0} onClick={() => addToCart(p)}>
              <div className="p-icon">
                {p.image_url ? <img src={p.image_url} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} /> : (p.categories?.icon || '📦')}
              </div>
              <div className="p-name">{p.name}</div>
              <div className="p-price">{Number(p.price).toFixed(2)}</div>
              <div className="p-stock">{p.is_recipe_product ? '🍳' : `الكمية: ${Number(p.stock_quantity)} ${p.unit}`}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="cart-panel">
        <div className="cart-header">
          <h3>سلة المبيعات</h3>
          <div className="flex gap-8">
            <button className="btn btn-ghost btn-sm" onClick={() => setOpenTicketsOpen(true)}>🍽️ الطاولات المفتوحة</button>
            {cart.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setCart([])}>🗑️ تفريغ</button>}
          </div>
        </div>
        <div className="cart-items">
          {cart.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🛒</div>السلة فارغة</div>
          ) : cart.map((item) => (
            <div className="cart-item" key={item.id}>
              <div style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {item.image_url ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 15 }}>{item.icon || '📦'}</span>}
              </div>
              <div className="ci-info">
                <div className="ci-name">{item.name}</div>
                <div className="ci-price">{item.price.toFixed(2)} × {item.qty} = <strong>{(item.price * item.qty).toFixed(2)}</strong></div>
              </div>
              <div className="qty-control">
                <button onClick={() => changeQty(item.id, -1)}>−</button>
                <input
                  className="qty-input mono-num"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={item.qty}
                  style={{ width: 44, textAlign: 'center', border: 'none', background: 'transparent' }}
                  onChange={(e) => setQty(item.id, Math.floor(Number(e.target.value)))}
                  onFocus={(e) => e.target.select()}
                />
                <button onClick={() => { if (item.qty + 1 > item.stock) { showToast('الكمية المتوفرة غير كافية'); return; } changeQty(item.id, 1); }}>+</button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => removeItem(item.id)}>✕</button>
            </div>
          ))}
        </div>
        <div className="cart-summary">
          <div className="summary-row total-row"><span>الإجمالي</span><span className="mono-num">{subtotal.toFixed(2)}</span></div>
        </div>
        <div className="cart-footer">
          <button className="btn btn-primary btn-block" disabled={cart.length === 0} onClick={() => setCheckoutOpen(true)}>إتمام البيع</button>
        </div>
      </div>

      {checkoutOpen && (
        <CheckoutModal
          cart={cart}
          branchId={branchId}
          profile={profile}
          storeName={branches.find((b) => b.id === branchId)?.name}
          onClose={() => setCheckoutOpen(false)}
          onDone={(sale, items) => {
            setCheckoutOpen(false);
            setCart([]);
            load();
            setInvoice({ sale, items });
          }}
        />
      )}

      {invoice && (
        <InvoiceModal
          sale={invoice.sale}
          items={invoice.items}
          storeName={branches.find((b) => b.id === branchId)?.name}
          onClose={() => setInvoice(null)}
        />
      )}

      {openTicketsOpen && (
        <OpenTicketsModal
          branchId={branchId}
          onClose={() => setOpenTicketsOpen(false)}
          onChanged={load}
        />
      )}

      {toast && <div className="toast toast-error" style={{ position: 'fixed', bottom: 90, insetInlineEnd: 16, background: 'var(--color-danger)', color: '#fff', padding: '10px 16px', borderRadius: 10, fontWeight: 700, zIndex: 200 }}>{toast}</div>}
    </div>
  );
}

function CheckoutModal({ cart, branchId, profile, storeName, onClose, onDone }) {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [knownCustomer, setKnownCustomer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [orderType, setOrderType] = useState('takeaway');
  const [tableNumber, setTableNumber] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [keepOpen, setKeepOpen] = useState(false);

  const fee = orderType === 'delivery' ? Number(deliveryFee || 0) : 0;
  const total = Math.max(subtotal - Number(discount || 0) + Number(tax || 0) + fee, 0);
  const change = Math.max(Number(paidAmount || total) - total, 0);

  useEffect(() => {
    if (customerPhone.trim().length < 6) { setKnownCustomer(null); return; }
    const t = setTimeout(async () => {
      try {
        const existing = await findCustomerByPhone(customerPhone.trim(), branchId);
        setKnownCustomer(existing);
        if (existing) {
          if (!customerName.trim()) setCustomerName(existing.name);
          // Delivery requirement: auto-fill the customer's saved address.
          if (existing.address && !deliveryAddress.trim()) setDeliveryAddress(existing.address);
        }
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerPhone]);

  async function handleConfirm() {
    const isOpenTicket = orderType === 'dine_in' && keepOpen;
    const paid = Number(paidAmount || total);
    if (!isOpenTicket && paid < total) { alert('المبلغ المدفوع غير كافٍ'); return; }
    if (orderType === 'dine_in' && !tableNumber.trim()) { alert('من فضلك أدخل رقم الطاولة'); return; }
    setSaving(true);
    try {
      const sale = await createSale({
        branchId,
        cashierId: profile.id,
        cart,
        discount: Number(discount || 0),
        tax: Number(tax || 0),
        paidAmount: paid,
        paymentMethod,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        orderType,
        tableNumber: tableNumber.trim(),
        deliveryAddress: deliveryAddress.trim(),
        deliveryFee: Number(deliveryFee || 0),
        keepOpen
      });
      const items = cart.map((c) => ({ product_name: c.name, quantity: c.qty, unit_price: c.price, total: c.price * c.qty }));
      onDone(sale, items);
    } catch (err) {
      if (err?.code === 'insufficient_raw_material_stock') {
        const names = (err.shortages || []).map((s) => s.name).join('، ');
        alert(`الكمية غير كافية من: ${names}`);
      } else {
        alert('حدث خطأ أثناء إتمام البيع');
      }
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>إتمام البيع</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="field"><label>اسم العميل (اختياري)</label><input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
          <div className="field"><label>رقم الهاتف</label><input className="input" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} /></div>
          {knownCustomer && (
            <div className="card card-pad" style={{ background: 'var(--color-success-light)', border: 'none', marginBottom: 14, padding: '10px 14px' }}>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>👤 عميل سابق: {knownCustomer.name}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>إجمالي مشترياته: {Number(knownCustomer.total_purchases).toFixed(2)} · الزيارات: {knownCustomer.visits_count}</div>
            </div>
          )}
          <div className="field">
            <label>نوع الطلب</label>
            <select className="input" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
              <option value="takeaway">تيك أواي</option>
              <option value="dine_in">صالة</option>
              <option value="delivery">توصيل</option>
            </select>
          </div>
          {orderType === 'dine_in' && (
            <>
              <div className="field"><label>رقم الطاولة</label><input className="input" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} /></div>
              <div className="field">
                <label className="flex items-center gap-8" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} />
                  <span>إبقاء الفاتورة مفتوحة (طلب صالة قيد التقديم)</span>
                </label>
                {keepOpen && (
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                    لن يتم تسجيلها كمبيعات إلا بعد إغلاقها واختيار طريقة الدفع من "الطاولات المفتوحة".
                  </div>
                )}
              </div>
            </>
          )}
          {orderType === 'delivery' && (
            <div className="flex gap-12">
              <div className="field" style={{ flex: 2 }}><label>عنوان التوصيل</label><input className="input" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} /></div>
              <div className="field" style={{ flex: 1 }}><label>رسوم التوصيل</label><input className="input" type="number" step="0.01" value={deliveryFee} onChange={(e) => setDeliveryFee(e.target.value)} /></div>
            </div>
          )}
          <div className="flex gap-12">
            <div className="field" style={{ flex: 1 }}><label>الخصم</label><input className="input" type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
            <div className="field" style={{ flex: 1 }}><label>الضريبة</label><input className="input" type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} /></div>
          </div>
          {!keepOpen && (
            <>
              <div className="field">
                <label>طريقة الدفع</label>
                <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
                </select>
              </div>
              <div className="field"><label>المبلغ المدفوع</label><input className="input" type="number" step="0.01" placeholder={total.toFixed(2)} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} /></div>
            </>
          )}
          <div className="card card-pad" style={{ background: 'var(--color-primary-light)', border: 'none' }}>
            <div className="summary-row"><span>المجموع الفرعي</span><span className="mono-num">{subtotal.toFixed(2)}</span></div>
            {fee > 0 && <div className="summary-row"><span>رسوم التوصيل</span><span className="mono-num">{fee.toFixed(2)}</span></div>}
            <div className="summary-row total-row"><span>الإجمالي</span><span className="mono-num">{total.toFixed(2)}</span></div>
            {!keepOpen && <div className="summary-row"><span>الباقي</span><span className="mono-num">{change.toFixed(2)}</span></div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleConfirm}>{saving ? '...جارٍ الحفظ' : (keepOpen ? 'فتح الفاتورة' : 'إتمام البيع')}</button>
        </div>
      </div>
    </div>
  );
}

function InvoiceModal({ sale, items, storeName, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>فاتورة {sale.invoice_number}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="empty-state">
            <div className="empty-icon">{sale.is_open_ticket ? '🍽️' : '✅'}</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{sale.is_open_ticket ? 'الفاتورة مفتوحة' : 'تمت العملية بنجاح'}</div>
            <div className="text-muted" style={{ marginTop: 6 }}>الإجمالي: {Number(sale.total).toFixed(2)}</div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              printReceipt(sale, items, storeName);
              try { await markInvoicePrinted(sale.id); } catch { /* ignore */ }
            }}
          >
            🖨️ طباعة
          </button>
        </div>
      </div>
    </div>
  );
}

// Dine-in "Keep Invoice Open": the list of tables/tickets still open, with
// a "preview/print" action (doesn't close anything, doesn't record a
// payment method — just lets the cashier show the customer the current
// total) and a "close" action that opens CloseTicketModal below.
function OpenTicketsModal({ branchId, onClose, onChanged }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(null); // ticket being closed

  const load = useCallback(async () => {
    const data = await listOpenTickets({ branchId });
    setTickets(data);
    setLoading(false);
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  async function handlePreview(ticket) {
    try {
      const { sale, items } = await getSaleDetails(ticket.id);
      printReceipt(sale, items);
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>الطاولات المفتوحة</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          {loading ? (
            <div className="page-loader" style={{ minHeight: 120 }}><div className="spinner" /></div>
          ) : tickets.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🍽️</div>لا توجد طاولات مفتوحة حاليًا</div>
          ) : (
            tickets.map((t) => (
              <div className="cart-item" key={t.id} style={{ alignItems: 'center' }}>
                <div className="ci-info">
                  <div className="ci-name">🪑 طاولة {t.table_number || '—'} — {t.invoice_number}</div>
                  <div className="ci-price text-muted">{new Date(t.created_at).toLocaleTimeString('ar-EG')} · <strong className="mono-num">{Number(t.total).toFixed(2)}</strong></div>
                </div>
                <div className="flex gap-8">
                  <button className="btn btn-ghost btn-sm" onClick={() => handlePreview(t)}>🖨️ طباعة</button>
                  <button className="btn btn-primary btn-sm" onClick={() => setClosing(t)}>إغلاق الفاتورة</button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إغلاق</button>
        </div>
      </div>

      {closing && (
        <CloseTicketModal
          ticket={closing}
          onClose={() => setClosing(null)}
          onClosed={() => { setClosing(null); load(); onChanged(); }}
        />
      )}
    </div>
  );
}

// Dine-in "Keep Invoice Open" flow, step 2 — closing an open ticket: show
// the payment dialog (method + amount), then close the invoice — this is
// what makes it count as sales/revenue/reports (every report query filters
// is_open_ticket = false) — and print the cashier receipt.
function CloseTicketModal({ ticket, onClose, onClosed }) {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidAmount, setPaidAmount] = useState(Number(ticket.total).toFixed(2));
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      const updated = await closeOpenTicket(ticket.id, {
        paidAmount: Number(paidAmount || ticket.total),
        paymentMethod
      });
      try {
        const { sale, items } = await getSaleDetails(updated.id);
        printReceipt(sale, items);
      } catch { /* non-fatal */ }
      onClosed();
    } catch {
      alert('حدث خطأ، حاول مرة أخرى');
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>إغلاق الفاتورة — {ticket.invoice_number}</h3><button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="field">
            <label>طريقة الدفع</label>
            <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (<option key={m.value} value={m.value}>{m.label}</option>))}
            </select>
          </div>
          <div className="field"><label>المبلغ المدفوع</label><input className="input" type="number" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} /></div>
          <div className="card card-pad" style={{ background: 'var(--color-primary-light)', border: 'none' }}>
            <div className="summary-row total-row"><span>الإجمالي</span><span className="mono-num">{Number(ticket.total).toFixed(2)}</span></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>إلغاء</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleConfirm}>{saving ? '...جارٍ الحفظ' : 'إغلاق الفاتورة'}</button>
        </div>
      </div>
    </div>
  );
}
