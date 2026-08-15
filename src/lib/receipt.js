function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString('ar-EG', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function buildReceiptHTML(sale, items, storeName = 'المتجر') {
  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="text-align:right;">${it.product_name}</td>
        <td style="text-align:center;">${it.quantity}</td>
        <td style="text-align:center;">${Number(it.unit_price).toFixed(2)}</td>
        <td style="text-align:left;">${Number(it.total).toFixed(2)}</td>
      </tr>`
    )
    .join('');

  return `
  <html dir="rtl" lang="ar">
  <head>
    <meta charset="UTF-8" />
    <style>
      * { box-sizing: border-box; font-family: 'Tajawal', Arial, sans-serif; }
      body { width: 80mm; margin: 0; padding: 10px; font-size: 12px; color: #111; }
      .center { text-align: center; }
      h2 { margin: 4px 0; font-size: 16px; }
      hr { border: none; border-top: 1.5px dashed #333; margin: 8px 0; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th { border-bottom: 1px solid #000; padding: 4px 2px; text-align: right; }
      td { padding: 4px 2px; }
      .totals div { display: flex; justify-content: space-between; margin: 3px 0; }
      .totals .grand { font-weight: bold; font-size: 14px; border-top: 2px solid #111; padding-top: 5px; margin-top: 5px; }
      .footer { text-align: center; margin-top: 12px; font-weight: 700; }
    </style>
  </head>
  <body>
    <div class="center"><h2>${storeName}</h2></div>
    <hr />
    <p>رقم الفاتورة: ${sale.invoice_number}</p>
    <p>التاريخ: ${formatDate(sale.created_at)}</p>
    ${sale.customer_name ? `<p>العميل: ${sale.customer_name}</p>` : ''}
    <hr />
    <table>
      <thead><tr><th>الصنف</th><th style="text-align:center;">الكمية</th><th style="text-align:center;">السعر</th><th style="text-align:left;">الإجمالي</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <hr />
    <div class="totals">
      <div><span>المجموع الفرعي</span><span>${Number(sale.subtotal).toFixed(2)}</span></div>
      <div><span>الخصم</span><span>${Number(sale.discount).toFixed(2)}</span></div>
      <div><span>الضريبة</span><span>${Number(sale.tax).toFixed(2)}</span></div>
      <div class="grand"><span>الإجمالي الكلي</span><span>${Number(sale.total).toFixed(2)}</span></div>
      <div><span>المدفوع</span><span>${Number(sale.paid_amount).toFixed(2)}</span></div>
      <div><span>الباقي</span><span>${Number(sale.change_amount).toFixed(2)}</span></div>
    </div>
    <div class="footer"><p>شكراً لتعاملكم معنا</p></div>
  </body>
  </html>`;
}

export function printReceipt(sale, items, storeName) {
  const html = buildReceiptHTML(sale, items, storeName);
  const win = window.open('', '_blank', 'width=360,height=640');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}
