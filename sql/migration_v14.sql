-- =====================================================================
-- POS SYSTEM - MIGRATION V14 (additive, safe to run on existing DB)
-- Run in: Supabase Dashboard -> SQL Editor -> New query
--
-- FIXES A BUG introduced in migration_v13.sql: when updating the
-- sale_items stock-decrement trigger to skip Recipe Products, the
-- branch_id column was accidentally dropped from the inventory_movements
-- insert. Since inventory_movements.branch_id is NOT NULL (see
-- migration_v4.sql), every sale item sync started failing with:
--   null value in column "branch_id" of relation "inventory_movements"
--   violates not-null constraint
-- This restores it — nothing else changes.
-- =====================================================================

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
