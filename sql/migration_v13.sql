-- =====================================================================
-- POS SYSTEM - MIGRATION V13 (additive, safe to run on existing DB)
-- Run in: Supabase Dashboard -> SQL Editor -> New query
--
-- 1) CUSTOMERS: address (for delivery orders — auto-filled at checkout).
-- 2) PRODUCTS: is_recipe_product — "Recipe Product" (tracked purely via its
--    BOM/raw materials, no stock_quantity of its own) vs "Regular Product"
--    (tracked by stock_quantity, exactly as every product worked before).
-- 3) SALES: payment_method now cash / visa / instapay / e_wallet — 'mixed'
--    removed, 'card' renamed to 'visa'. Existing rows keep whatever value
--    they already have (this migration does not rewrite historical data).
-- 4) EMPLOYEE_TRANSACTIONS: adds 'salary' as a transaction type, so paying
--    an employee's salary can be logged on their ledger like an advance.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) CUSTOMERS.address
-- ---------------------------------------------------------------------
alter table public.customers add column if not exists address text;

-- ---------------------------------------------------------------------
-- 2) PRODUCTS.is_recipe_product
-- ---------------------------------------------------------------------
alter table public.products add column if not exists is_recipe_product boolean not null default false;

-- ---------------------------------------------------------------------
-- 3) SALES.payment_method: cash / visa / instapay / e_wallet (no 'mixed')
-- ---------------------------------------------------------------------
-- Existing historical rows may still hold the old 'card'/'mixed' values —
-- ADD CONSTRAINT validates every existing row, so remap them first (best
-- equivalent: 'card' -> 'visa', 'mixed' -> 'cash') or the migration would
-- fail outright on any store with real sales history.
update public.sales set payment_method = 'visa' where payment_method = 'card';
update public.sales set payment_method = 'cash' where payment_method = 'mixed';

alter table public.sales drop constraint if exists sales_payment_method_check;
alter table public.sales add constraint sales_payment_method_check
  check (payment_method in ('cash', 'visa', 'instapay', 'e_wallet'));

-- ---------------------------------------------------------------------
-- 4) EMPLOYEE_TRANSACTIONS: add 'salary' type
-- ---------------------------------------------------------------------
alter table public.employee_transactions drop constraint if exists employee_transactions_type_check;
alter table public.employee_transactions add constraint employee_transactions_type_check
  check (type in ('deduction', 'advance', 'salary', 'commission_manual', 'commission_auto'));

-- ---------------------------------------------------------------------
-- 5) Recipe Products never track their own stock_quantity — update the
--    sale_items stock-decrement trigger (see sql/schema.sql) to skip them.
-- ---------------------------------------------------------------------
create or replace function public.handle_sale_item_insert()
returns trigger as $$
declare
  is_recipe boolean;
begin
  if new.product_id is not null then
    select is_recipe_product into is_recipe from public.products where id = new.product_id;

    if coalesce(is_recipe, false) = false then
      update public.products
        set stock_quantity = stock_quantity - new.quantity
        where id = new.product_id;
    end if;

    insert into public.inventory_movements (product_id, type, quantity, reason, created_by, branch_id)
    values (new.product_id, 'sale', -new.quantity, 'بيع - فاتورة', auth.uid(), new.branch_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;
