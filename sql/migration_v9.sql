-- =====================================================================
-- POS SYSTEM - MIGRATION V9: ORDER TYPES (Dine In / Take Away / Delivery)
-- Run in: Supabase Dashboard -> SQL Editor -> New query
-- Adds order-type support to every sale so the cashier screen can record
-- how the order was placed:
--   - صالة (dine_in)   -> a table number, optionally kept open (open tab)
--   - تيك أواي (takeaway) -> no table, invoice created directly
--   - دليفري (delivery)   -> customer name/phone (already existed) +
--                            delivery address + delivery fee
-- Fully additive: every new column has a safe default, so existing rows
-- (all historical sales) simply become order_type = 'takeaway' with no
-- table/delivery info, and every existing query keeps working unchanged.
-- =====================================================================

-- 1) add the columns (each with a safe default; nothing here is NOT NULL
--    without a default, so this never fails on a table that already has data)
alter table public.sales add column if not exists order_type text not null default 'takeaway';
alter table public.sales add column if not exists table_number text;
alter table public.sales add column if not exists is_open_ticket boolean not null default false;
alter table public.sales add column if not exists delivery_address text;
alter table public.sales add column if not exists delivery_fee numeric(12,2) not null default 0;

-- 2) constrain order_type to the 3 known values (added after the column
--    exists and is backfilled by the default above, so it never fails on
--    existing rows)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sales_order_type_check'
  ) then
    alter table public.sales
      add constraint sales_order_type_check
      check (order_type in ('dine_in', 'takeaway', 'delivery'));
  end if;
end $$;

-- 3) indexes — created only now that the columns above are guaranteed to
--    exist on every environment this runs against
create index if not exists idx_sales_order_type on public.sales(branch_id, order_type);
create index if not exists idx_sales_open_tickets on public.sales(branch_id, is_open_ticket) where is_open_ticket = true;

-- sales is already part of the supabase_realtime publication (see
-- schema.sql) and already has an updated_at trigger (see migration_v5.sql),
-- so order_type / table_number / is_open_ticket changes already broadcast
-- live and already flow through the offline-first sync engine — nothing
-- else to enable here.
