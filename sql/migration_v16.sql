-- =====================================================================
-- POS SYSTEM - MIGRATION V16: SUPPLIERS (additive, safe to run on existing DB)
-- Run in: Supabase Dashboard -> SQL Editor -> New query
--
-- Adds a standalone Suppliers module — ported over from the sister
-- "suppliers" system — so vendors and what the store owes them can be
-- tracked here too:
--   1) suppliers         — vendor directory with a running balance (what
--      the store currently owes), same shape/pattern as customers.
--   2) supplier_payments — money paid toward a supplier's balance; the
--      canonical cash record for supplier payments (see getAvailableFunds
--      in src/lib/db/accounts.js — do not also log these as a manual
--      expense, that would subtract the same payment twice).
--
-- This system doesn't have a separate purchase-invoices module (raw
-- materials are restocked directly — see migration_v11/v12.sql), so unlike
-- the sister system a supplier's balance/statement here is driven purely by
-- manual adjustments and payments recorded against them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) SUPPLIERS
-- ---------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  notes text,
  -- amount the store currently owes this supplier (adjusted manually via
  -- adjustSupplierBalance, decreases automatically with each payment)
  balance numeric(12,2) not null default 0,
  branch_id uuid not null references public.branches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_suppliers_branch on public.suppliers(branch_id);

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2) SUPPLIER PAYMENTS (money paid toward a supplier's balance)
-- ---------------------------------------------------------------------
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cash' check (method in ('cash', 'visa', 'instapay', 'e_wallet')),
  note text,
  txn_date date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_payments_supplier on public.supplier_payments(supplier_id);
create index if not exists idx_supplier_payments_branch on public.supplier_payments(branch_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3) ROW LEVEL SECURITY — same permissive single-store pattern every
--    other business table already uses (see sql/schema.sql / migration_v11.sql)
-- ---------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.supplier_payments enable row level security;

drop policy if exists "suppliers_all" on public.suppliers;
create policy "suppliers_all" on public.suppliers for all
  to authenticated using (true) with check (true);

drop policy if exists "supplier_payments_all" on public.supplier_payments;
create policy "supplier_payments_all" on public.supplier_payments for all
  to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 4) REALTIME (same opt-in list as customers/products)
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.suppliers;
exception when duplicate_object or undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.supplier_payments;
exception when duplicate_object or undefined_object then null;
end $$;
