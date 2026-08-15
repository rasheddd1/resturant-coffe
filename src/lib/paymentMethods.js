// Accepted payment methods system-wide (matches the desktop POS app and
// sql/migration_v13.sql's payment_method check constraint on `sales`).
// "Mixed" was removed; "Card" was replaced by the three concrete
// electronic methods actually used.
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقدي' },
  { value: 'visa', label: 'فيزا' },
  { value: 'instapay', label: 'إنستاباي' },
  { value: 'e_wallet', label: 'محفظة إلكترونية' }
];

export function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label || value;
}

export function paymentMethodOptions(selected='cash') {
  return PAYMENT_METHODS.map((m)=>`<option value="${m.value}" ${m.value===selected?'selected':''}>${m.label}</option>`).join('');
}
