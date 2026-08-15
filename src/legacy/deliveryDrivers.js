import { t, toast } from './compat.js';
import {
  listDeliveryDrivers,
  createDeliveryDriver,
  updateDeliveryDriver,
  listDriverTransactions,
  createDriverTransaction,
  recordDeliveryCollection,
  recordDriverHandover,
  calculateDriverLedger
} from '../queries/deliveryDrivers.js';
import { listDeliveryOrders, updateDeliveryStatus } from '../queries/deliveryDrivers.js';

const STATUS = {
  pending: 'لم يُسلّم',
  assigned: 'تم التكليف',
  out_for_delivery: 'مع المندوب',
  delivered: 'تم التسليم',
  partial: 'تحصيل جزئي',
  failed: 'تعذر التسليم'
};
const STATUS_CLASS = {
  pending: 'badge-muted',
  assigned: 'badge-info',
  out_for_delivery: 'badge-warning',
  delivered: 'badge-success',
  partial: 'badge-warning',
  failed: 'badge-danger'
};
const TX = {
  cash_collection: 'تحصيل من عميل',
  cash_handover: 'توريد للمحل',
  expense: 'مصروف',
  commission: 'عمولة',
  adjustment: 'تسوية'
};

const money = (v) => Number(v || 0).toFixed(2);
const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const shortId = (v) => v ? String(v).slice(-8).toUpperCase() : '—';

export async function renderDeliveryDrivers(container, profile, branchId) {
  if (!branchId) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🏬</div><div style="font-weight:700">${t('select_branch')}</div></div>`;
    return;
  }

  let drivers = [];
  let orders = [];

  async function load() {
    [drivers, orders] = await Promise.all([
      listDeliveryDrivers({ branchId }),
      listDeliveryOrders({ branchId })
    ]);
    draw();
  }

  function driverStats(d) {
    const myOrders = orders.filter(o => o.delivery_driver_id === d.id && !['delivered', 'failed'].includes(o.delivery_status));
    const total = orders.filter(o => o.delivery_driver_id === d.id);
    const due = total.reduce((s, o) => s + Math.max(Number(o.total || 0) - Number(o.paid_amount || 0), 0), 0);
    return { orders: myOrders.length, totalOrders: total.length, due };
  }

  function openDriverForm(driver = null) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:560px">
        <div class="modal-header"><div><h3>${driver ? 'تعديل المندوب' : 'إضافة مندوب دليفري'}</h3><div class="text-muted">بيانات التواصل والمركبة والحالة</div></div><button class="btn btn-icon" data-close>✕</button></div>
        <form id="driver-form" class="modal-body">
          <div class="field"><label>اسم المندوب</label><input class="input" name="name" required value="${esc(driver?.name || '')}" /></div>
          <div class="flex gap-12" style="flex-wrap:wrap"><div class="field" style="flex:1;min-width:200px"><label>رقم التواصل</label><input class="input" name="phone" type="tel" value="${esc(driver?.phone || '')}" /></div><div class="field" style="flex:1;min-width:200px"><label>رقم إضافي</label><input class="input" name="alternate_phone" type="tel" value="${esc(driver?.alternate_phone || '')}" /></div></div>
          <div class="field"><label>المركبة</label><input class="input" name="vehicle" placeholder="موتوسيكل / سكوتر / سيارة" value="${esc(driver?.vehicle || '')}" /></div>
          <div class="field"><label>ملاحظات</label><textarea class="input" name="notes" rows="3">${esc(driver?.notes || '')}</textarea></div>
          <label class="flex items-center gap-8"><input type="checkbox" name="is_active" ${driver?.is_active !== false ? 'checked' : ''}/> المندوب نشط ويظهر في أوردرات الدليفري</label>
        </form>
        <div class="modal-footer"><button class="btn btn-ghost" data-close>إلغاء</button><button class="btn btn-primary" id="save-driver">حفظ البيانات</button></div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    overlay.querySelector('#save-driver').onclick = async () => {
      const fd = new FormData(overlay.querySelector('#driver-form'));
      const payload = {
        name: String(fd.get('name') || '').trim(),
        phone: String(fd.get('phone') || '').trim(),
        alternate_phone: String(fd.get('alternate_phone') || '').trim(),
        vehicle: String(fd.get('vehicle') || '').trim(),
        notes: String(fd.get('notes') || '').trim(),
        is_active: fd.get('is_active') === 'on',
        branch_id: branchId,
        updated_at: new Date().toISOString()
      };
      if (!payload.name) return toast('اكتب اسم المندوب', 'error');
      try {
        if (driver) await updateDeliveryDriver(driver.id, payload);
        else await createDeliveryDriver(payload);
        close();
        await load();
        toast('تم حفظ المندوب', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };
  }

  function buildOrderRow(o) {
    const total = Number(o.total || 0);
    const paid = Number(o.paid_amount || 0);
    const due = Math.max(total - paid, 0);
    const status = o.delivery_status || 'pending';
    return `<tr>
      <td><strong>${esc(o.invoice_number || 'فاتورة')}</strong><div class="text-muted" style="font-size:11px">#${shortId(o.id)}</div></td>
      <td><strong>${esc(o.customer_name || 'عميل نقدي')}</strong><div class="text-muted">${esc(o.customer_phone || 'لا يوجد رقم')}</div></td>
      <td><div>${esc(o.delivery_address || 'بدون عنوان')}</div><div class="text-muted" style="font-size:11px">${o.delivery_address ? '📍 عنوان دليفري' : '⚠️ يحتاج عنوان'}</div></td>
      <td class="mono-num"><strong>${money(total)}</strong></td>
      <td class="mono-num"><strong>${money(paid)}</strong>${due > 0 ? `<div class="text-danger" style="font-size:11px;font-weight:700">متبقي ${money(due)}</div>` : `<div class="text-success" style="font-size:11px;font-weight:700">مدفوع بالكامل</div>`}</td>
      <td><span class="badge ${STATUS_CLASS[status] || 'badge-muted'}">${esc(STATUS[status] || status || '—')}</span></td>
      <td><div class="flex gap-8" style="flex-wrap:wrap;align-items:center">
        ${due > 0 ? `<button class="btn btn-sm btn-success" data-collect="${o.id}" data-due="${due}">💰 تحصيل ${money(due)}</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-view-order="${o.id}">عرض التفاصيل</button>
        <select class="input" style="width:145px;padding:6px 8px" data-status="${o.id}">${Object.entries(STATUS).map(([k,v]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div></td>
    </tr>`;
  }

  function openOrderDetails(order) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const total = Number(order.total || 0), paid = Number(order.paid_amount || 0), due = Math.max(total - paid, 0);
    overlay.innerHTML = `<div class="modal-box" style="max-width:620px">
      <div class="modal-header"><div><h3>📦 تفاصيل الأوردر</h3><div class="text-muted">${esc(order.invoice_number || shortId(order.id))}</div></div><button class="btn btn-icon" data-close>✕</button></div>
      <div class="modal-body">
        <div class="detail-grid">
          <div><span>العميل</span><strong>${esc(order.customer_name || 'عميل نقدي')}</strong></div>
          <div><span>رقم التواصل</span><strong>${esc(order.customer_phone || '—')}</strong></div>
          <div class="detail-grid-wide"><span>العنوان</span><strong>${esc(order.delivery_address || '—')}</strong></div>
          <div><span>الإجمالي</span><strong>${money(total)} ج</strong></div>
          <div><span>المحصل</span><strong>${money(paid)} ج</strong></div>
          <div><span>المتبقي</span><strong class="${due > 0 ? 'text-danger' : 'text-success'}">${money(due)} ج</strong></div>
          <div><span>الحالة</span><strong>${esc(STATUS[order.delivery_status] || '—')}</strong></div>
          <div><span>النوع</span><strong>${order.payment_method === 'cash' ? 'تحصيل نقدي' : esc(order.payment_method || '—')}</strong></div>
        </div>
        ${order.notes ? `<div class="detail-note"><strong>ملاحظات:</strong> ${esc(order.notes)}</div>` : ''}
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" data-close>إغلاق</button>${due > 0 ? `<button class="btn btn-success" data-collect-detail>💰 تحصيل ${money(due)}</button>` : ''}</div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-close]').forEach(b => b.onclick = () => overlay.remove());
    overlay.querySelector('[data-collect-detail]')?.addEventListener('click', () => {
      overlay.remove();
      document.querySelector('[data-collect="' + order.id + '"]')?.click();
    });
  }

  function askAmount({ title, label, defaultValue = '', max = null, descriptionLabel = '' }) {
    return new Promise((resolve) => {
      const m = document.createElement('div');
      m.className = 'modal-overlay';
      m.innerHTML = `<div class="modal-box" style="max-width:470px">
        <div class="modal-header"><div><h3>${title}</h3>${max !== null ? `<div class="text-muted">المتاح: ${money(max)} ج</div>` : ''}</div><button class="btn btn-icon" data-close>✕</button></div>
        <div class="modal-body"><div class="field"><label>${label}</label><input class="input" id="amount" type="number" min="0.01" step="0.01" value="${esc(defaultValue)}" /></div>
        ${descriptionLabel ? `<div class="field"><label>${descriptionLabel}</label><input class="input" id="description" /></div>` : ''}</div>
        <div class="modal-footer"><button class="btn btn-ghost" data-cancel>إلغاء</button><button class="btn btn-primary" data-save>تأكيد</button></div>
      </div>`;
      document.body.appendChild(m);
      const close = (v) => { m.remove(); resolve(v); };
      m.querySelector('[data-close]').onclick = () => close(null);
      m.querySelector('[data-cancel]').onclick = () => close(null);
      m.querySelector('[data-save]').onclick = () => {
        const amount = Number(m.querySelector('#amount').value);
        if (!Number.isFinite(amount) || amount <= 0 || (max !== null && amount > Number(max))) return toast('أدخل مبلغًا صحيحًا', 'error');
        close({ amount, description: m.querySelector('#description')?.value?.trim() || '' });
      };
      m.addEventListener('click', e => { if (e.target === m) close(null); });
      setTimeout(() => m.querySelector('#amount')?.focus(), 0);
    });
  }

  function askTransaction() {
    return new Promise((resolve) => {
      const m = document.createElement('div');
      m.className = 'modal-overlay';
      m.innerHTML = `<div class="modal-box" style="max-width:540px">
        <div class="modal-header"><div><h3>➕ حركة مالية للمندوب</h3><div class="text-muted">الحركات تظهر فورًا في كشف الحساب</div></div><button class="btn btn-icon" data-close>✕</button></div>
        <div class="modal-body"><div class="field"><label>نوع الحركة</label><select class="input" id="tx-type"><option value="commission">عمولة مستحقة</option><option value="expense">مصروف</option><option value="adjustment">تسوية / سلفة</option></select></div>
          <div class="field"><label>المبلغ</label><input class="input" id="tx-amount" type="number" min="0.01" step="0.01" /></div>
          <div class="field"><label>البيان</label><input class="input" id="tx-description" placeholder="مثال: عمولة اليوم / سلفة / مصروف بنزين" /></div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" data-cancel>إلغاء</button><button class="btn btn-primary" data-save>حفظ الحركة</button></div>
      </div>`;
      document.body.appendChild(m);
      const close = (v) => { m.remove(); resolve(v); };
      m.querySelector('[data-close]').onclick = () => close(null);
      m.querySelector('[data-cancel]').onclick = () => close(null);
      m.querySelector('[data-save]').onclick = () => {
        const amount = Number(m.querySelector('#tx-amount').value);
        if (!Number.isFinite(amount) || amount <= 0) return toast('أدخل مبلغًا صحيحًا', 'error');
        close({ type: m.querySelector('#tx-type').value, amount, description: m.querySelector('#tx-description').value.trim() });
      };
    });
  }

  async function openDetails(driver) {
    let txns = await listDriverTransactions({ driverId: driver.id, branchId });
    let myOrders = orders.filter(o => o.delivery_driver_id === driver.id);
    let ledger = calculateDriverLedger(txns);
    let activeTab = 'orders';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box delivery-driver-panel">
      <div class="modal-header driver-modal-header">
        <div class="driver-heading"><div class="driver-avatar">${esc((driver.name || 'م').charAt(0))}</div><div><div class="driver-title-row"><h3>${esc(driver.name)}</h3><span class="badge ${driver.is_active ? 'badge-success' : 'badge-muted'}">${driver.is_active ? 'نشط' : 'موقوف'}</span></div><div class="text-muted">${driver.phone ? `📞 ${esc(driver.phone)}` : 'بدون رقم'}${driver.alternate_phone ? ` · ${esc(driver.alternate_phone)}` : ''}${driver.vehicle ? ` · 🛵 ${esc(driver.vehicle)}` : ''}</div></div></div>
        <button class="btn btn-ghost" data-close>إغلاق</button>
      </div>
      <div class="modal-body driver-dashboard-body">
        <div class="driver-kpi-grid">
          <div class="driver-kpi kpi-primary"><div class="stat-label">العهدة الحالية</div><div class="stat-value mono-num">${money(ledger.cashWithDriver)} ج</div><div class="kpi-hint">المحصّل − المورّد − المصروفات</div></div>
          <div class="driver-kpi"><div class="stat-label">إجمالي التحصيل</div><div class="stat-value mono-num">${money(ledger.moneyCollected)} ج</div><div class="kpi-hint">من عملاء الدليفري</div></div>
          <div class="driver-kpi"><div class="stat-label">إجمالي التوريد</div><div class="stat-value mono-num">${money(ledger.moneyHandedOver)} ج</div><div class="kpi-hint">المسلّم للمحل</div></div>
          <div class="driver-kpi"><div class="stat-label">عمولات مستحقة</div><div class="stat-value mono-num">${money(ledger.commissions)} ج</div><div class="kpi-hint">مستحقات منفصلة عن العهدة</div></div>
        </div>

        <div class="driver-mini-summary">
          <div><span>الأوردرات مع المندوب</span><strong id="summary-orders">0</strong></div>
          <div><span>قيمة الأوردرات</span><strong id="summary-total">0.00 ج</strong></div>
          <div><span>المطلوب تحصيله</span><strong id="summary-due">0.00 ج</strong></div>
        </div>

        <div class="driver-toolbar"><div class="driver-tabs" role="tablist"><button class="driver-tab active" data-tab="orders">📦 الأوردرات</button><button class="driver-tab" data-tab="custody">💰 العهدة والحركات</button><button class="driver-tab" data-tab="statement">📒 كشف الحساب</button></div><div class="driver-actions"><button class="btn btn-primary" id="handover">💵 تسجيل توريد عهدة</button><button class="btn btn-accent" id="financial">➕ حركة مالية</button></div></div>

        <div id="driver-tab-content"></div>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('[data-close]').onclick = close;

    function refreshSummary() {
      const active = myOrders.filter(o => !['delivered', 'failed'].includes(o.delivery_status));
      const activeTotal = active.reduce((s, o) => s + Number(o.total || 0), 0);
      const due = active.reduce((s, o) => s + Math.max(Number(o.total || 0) - Number(o.paid_amount || 0), 0), 0);
      overlay.querySelector('#summary-orders').textContent = active.length;
      overlay.querySelector('#summary-total').textContent = `${money(activeTotal)} ج`;
      overlay.querySelector('#summary-due').textContent = `${money(due)} ج`;
    }

    function getStatementRows() {
      const sorted = [...txns].sort((a,b) => `${a.txn_date || ''}${a.created_at || ''}`.localeCompare(`${b.txn_date || ''}${b.created_at || ''}`));
      let balance = 0;
      return sorted.map((x) => {
        let plus = 0, minus = 0;
        if (x.type === 'cash_collection' || x.type === 'commission' || x.type === 'adjustment') plus = Number(x.amount || 0);
        if (x.type === 'cash_handover' || x.type === 'expense') minus = Number(x.amount || 0);
        balance += plus - minus;
        return { ...x, plus, minus, balance };
      }).reverse();
    }

    function timelineRows() {
      const items = [
        ...txns.map(x => ({ kind: 'tx', date: x.txn_date, time: x.created_at || '', title: TX[x.type] || x.type, desc: x.description || '', amount: Number(x.amount || 0), tx: x.type })),
        ...myOrders.map(o => ({ kind: 'order', date: (o.created_at || '').slice(0,10), time: o.created_at || '', title: `أوردر ${o.invoice_number || shortId(o.id)}`, desc: `${o.customer_name || 'عميل'} · ${STATUS[o.delivery_status] || '—'}`, amount: Number(o.total || 0), tx: 'order' }))
      ];
      return items.sort((a,b) => `${b.date || ''}${b.time || ''}`.localeCompare(`${a.date || ''}${a.time || ''}`)).slice(0, 30);
    }

    function renderTab() {
      const host = overlay.querySelector('#driver-tab-content');
      if (activeTab === 'orders') {
        host.innerHTML = `<div class="section-heading"><div><h4>أوردرات المندوب</h4><p class="text-muted">كل أوردر مع العميل والعنوان وحالة التحصيل لحظة بلحظة.</p></div><span class="badge badge-muted">${myOrders.length} أوردر</span></div>
          <div class="table-wrap"><table class="data-table driver-orders-table"><thead><tr><th>الفاتورة</th><th>العميل والتواصل</th><th>العنوان</th><th>الإجمالي</th><th>المحصل / المتبقي</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>${myOrders.map(buildOrderRow).join('')}</tbody></table>${myOrders.length === 0 ? `<div class="table-empty">لا توجد أوردرات مع هذا المندوب حاليًا</div>` : ''}</div>`;
      } else if (activeTab === 'custody') {
        host.innerHTML = `<div class="section-heading"><div><h4>العهدة والحركات المالية</h4><p class="text-muted">راقب النقدية التي استلمها المندوب وما تم توريده أو صرفه.</p></div><span class="driver-balance-chip">العهدة الحالية <strong>${money(ledger.cashWithDriver)} ج</strong></span></div>
          <div class="driver-custody-cards"><div><span>التحصيلات</span><strong>+ ${money(ledger.moneyCollected)} ج</strong></div><div><span>التوريدات</span><strong>− ${money(ledger.moneyHandedOver)} ج</strong></div><div><span>المصروفات</span><strong>− ${money(ledger.expenses)} ج</strong></div><div><span>التعديلات</span><strong>${money(ledger.adjustments)} ج</strong></div></div>
          <div class="timeline">${timelineRows().map(item => `<div class="timeline-item"><div class="timeline-dot ${item.kind === 'order' ? 'order' : 'money'}">${item.kind === 'order' ? '📦' : '💰'}</div><div class="timeline-content"><div class="timeline-top"><strong>${esc(item.title)}</strong><span>${esc(item.date || '—')}</span></div><div class="text-muted">${esc(item.desc)}</div>${item.kind === 'tx' ? `<div class="timeline-amount ${item.tx === 'cash_collection' || item.tx === 'commission' || item.tx === 'adjustment' ? 'plus' : 'minus'}">${item.tx === 'cash_collection' || item.tx === 'commission' || item.tx === 'adjustment' ? '+' : '-'} ${money(item.amount)} ج</div>` : `<div class="timeline-amount neutral">قيمة الأوردر ${money(item.amount)} ج</div>`}</div></div>`).join('') || `<div class="table-empty">لا توجد حركات مسجلة</div>`}</div>`;
      } else {
        const rows = getStatementRows();
        host.innerHTML = `<div class="section-heading"><div><h4>كشف حساب المندوب</h4><p class="text-muted">كشف زمني يوضح الزيادة والنقصان والرصيد بعد كل حركة.</p></div><span class="driver-balance-chip">الرصيد الجاري <strong>${money(rows[0]?.balance || 0)} ج</strong></span></div>
          <div class="table-wrap"><table class="data-table driver-statement-table"><thead><tr><th>التاريخ</th><th>الحركة</th><th>البيان</th><th>زيادة</th><th>خصم</th><th>الرصيد</th><th>الفاتورة</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(x.txn_date || '—')}</td><td><strong>${esc(TX[x.type] || x.type)}</strong></td><td>${esc(x.description || '—')}</td><td class="mono-num text-success">${x.plus ? `+ ${money(x.plus)}` : '—'}</td><td class="mono-num text-danger">${x.minus ? `− ${money(x.minus)}` : '—'}</td><td class="mono-num"><strong>${money(x.balance)}</strong></td><td>${esc(x.sale_id ? shortId(x.sale_id) : '—')}</td></tr>`).join('')}</tbody></table>${rows.length === 0 ? `<div class="table-empty">لا توجد حركات مالية</div>` : ''}</div>`;
      }

      host.querySelectorAll('[data-status]').forEach(sel => sel.addEventListener('change', async () => {
        try {
          const id = sel.dataset.status;
          await updateDeliveryStatus(id, sel.value);
          const o = myOrders.find(x => x.id === id);
          if (o) o.delivery_status = sel.value;
          refreshSummary();
          renderTab();
          toast('تم تحديث حالة الأوردر', 'success');
        } catch (e) { toast(e.message, 'error'); }
      }));

      host.querySelectorAll('[data-collect]').forEach(btn => btn.addEventListener('click', async () => {
        const result = await askAmount({ title: '💵 تحصيل من العميل', label: 'مبلغ التحصيل', defaultValue: btn.dataset.due, max: Number(btn.dataset.due) });
        if (!result) return;
        try {
          await recordDeliveryCollection({ driverId: driver.id, saleId: btn.dataset.collect, amount: result.amount, branchId, createdBy: profile.id });
          [txns, orders] = await Promise.all([
            listDriverTransactions({ driverId: driver.id, branchId }),
            listDeliveryOrders({ branchId })
          ]);
          myOrders = orders.filter(o => o.delivery_driver_id === driver.id);
          ledger = calculateDriverLedger(txns);
          refreshSummary();
          renderTab();
          toast('تم تسجيل التحصيل وتحديث العهدة', 'success');
        } catch (e) { toast(e.message, 'error'); }
      }));

      host.querySelectorAll('[data-view-order]').forEach(btn => btn.addEventListener('click', () => openOrderDetails(myOrders.find(o => o.id === btn.dataset.viewOrder))));
    }

    overlay.querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      overlay.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === tab));
      renderTab();
    }));

    overlay.querySelector('#handover').onclick = async () => {
      const max = Math.max(Number(ledger.cashWithDriver || 0), 0);
      if (max <= 0) return toast('لا توجد عهدة متاحة للتوريد حاليًا', 'error');
      const result = await askAmount({ title: '🏦 تسجيل توريد عهدة', label: 'مبلغ التوريد', defaultValue: money(max), max, descriptionLabel: 'ملاحظات التوريد' });
      if (!result) return;
      try {
        await recordDriverHandover({ driverId: driver.id, amount: result.amount, branchId, createdBy: profile.id, description: result.description });
        txns = await listDriverTransactions({ driverId: driver.id, branchId });
        ledger = calculateDriverLedger(txns);
        refreshSummary();
        renderTab();
        toast('تم تسجيل التوريد وتحديث العهدة', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };

    overlay.querySelector('#financial').onclick = async () => {
      const result = await askTransaction();
      if (!result) return;
      try {
        await createDriverTransaction({
          driver_id: driver.id,
          type: result.type,
          amount: result.amount,
          branch_id: branchId,
          description: result.description,
          txn_date: new Date().toISOString().slice(0, 10),
          created_by: profile.id
        });
        txns = await listDriverTransactions({ driverId: driver.id, branchId });
        ledger = calculateDriverLedger(txns);
        refreshSummary();
        renderTab();
        toast('تم تسجيل الحركة المالية', 'success');
      } catch (e) { toast(e.message, 'error'); }
    };

    refreshSummary();
    renderTab();
  }

  function draw() {
    const activeDrivers = drivers.filter(d => d.is_active);
    const assignedOrders = orders.filter(o => o.delivery_driver_id && !['delivered', 'failed'].includes(o.delivery_status));
    const totalDue = orders.filter(o => o.delivery_driver_id).reduce((s, o) => s + Math.max(Number(o.total || 0) - Number(o.paid_amount || 0), 0), 0);
    container.innerHTML = `<div class="page-header"><div><h2>🛵 ${t('delivery_drivers_title')}</h2><p class="text-muted">إدارة المناديب، الأوردرات، التحصيل، التوريدات وكشف الحساب المالي.</p></div><button class="btn btn-primary" id="add-driver">+ إضافة مندوب</button></div>
      <div class="flex gap-16" style="margin-bottom:16px;flex-wrap:wrap"><div class="stat-card driver-list-kpi"><div class="stat-icon">🛵</div><div class="stat-label">المندوبون النشطون</div><div class="stat-value mono-num">${activeDrivers.length}</div></div><div class="stat-card driver-list-kpi"><div class="stat-icon">📦</div><div class="stat-label">أوردرات مع المناديب</div><div class="stat-value mono-num">${assignedOrders.length}</div></div><div class="stat-card driver-list-kpi"><div class="stat-icon">💰</div><div class="stat-label">إجمالي المبالغ غير المحصلة</div><div class="stat-value mono-num">${money(totalDue)} ج</div></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>المندوب</th><th>التواصل</th><th>المركبة</th><th>الأوردرات الحالية</th><th>المطلوب تحصيله</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${drivers.map(d => { const st = driverStats(d); return `<tr><td><strong>${esc(d.name)}</strong><div class="text-muted">${d.notes ? esc(d.notes) : ''}</div></td><td>${esc(d.phone || '—')}${d.alternate_phone ? `<div class="text-muted">${esc(d.alternate_phone)}</div>` : ''}</td><td>${esc(d.vehicle || '—')}</td><td class="mono-num">${st.orders}</td><td class="mono-num">${money(st.due)} ج</td><td><span class="badge ${d.is_active ? 'badge-success' : 'badge-muted'}">${d.is_active ? 'نشط' : 'موقوف'}</span></td><td><div class="flex gap-8" style="flex-wrap:wrap"><button class="btn btn-sm btn-primary" data-details="${d.id}">فتح الحساب</button><button class="btn btn-sm btn-ghost" data-edit="${d.id}">تعديل</button><button class="btn btn-sm btn-ghost" data-toggle="${d.id}">${d.is_active ? 'إيقاف' : 'تفعيل'}</button></div></td></tr>`; }).join('')}</tbody></table>${drivers.length === 0 ? `<div class="table-empty">لا يوجد مناديب مضافون</div>` : ''}</div>`;
    container.querySelector('#add-driver').onclick = () => openDriverForm();
    container.querySelectorAll('[data-details]').forEach(b => b.onclick = () => openDetails(drivers.find(d => d.id === b.dataset.details)));
    container.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openDriverForm(drivers.find(d => d.id === b.dataset.edit)));
    container.querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => { const d = drivers.find(x => x.id === b.dataset.toggle); try { await updateDeliveryDriver(d.id, { is_active: !d.is_active, updated_at: new Date().toISOString() }); await load(); toast(d.is_active ? 'تم إيقاف المندوب' : 'تم تفعيل المندوب', 'success'); } catch (e) { toast(e.message, 'error'); } });
  }

  await load();
}
