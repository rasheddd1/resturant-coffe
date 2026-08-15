-- =====================================================================
-- POS SYSTEM - MIGRATION V17: SUPPLIER PURCHASE INVOICES
-- Additive migration: preserves existing suppliers/supplier_payments.
-- Adds purchase invoices, line items, branch-scoped RLS and realtime.
-- Stock and supplier balance are maintained by the application so the
-- rules work identically in Electron's offline SQLite and online mode.
-- =====================================================================

create sequence if not exists public.purchase_invoice_seq start 1;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null default ('PUR-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('purchase_invoice_seq')::text,5,'0')),
  supplier_id uuid not null references public.suppliers(id),
  branch_id uuid not null references public.branches(id),
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  payment_method text not null default 'cash' check (payment_method in ('cash','visa','instapay','e_wallet')),
  notes text,
  status text not null default 'completed' check (status in ('completed','cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing installations may already have public.purchases from migration_v8.
-- CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
alter table public.purchases
  add column if not exists invoice_number text;

alter table public.purchases
  add column if not exists payment_method text not null default 'cash';

update public.purchases
set invoice_number = 'PUR-' || to_char(coalesce(created_at, now()), 'YYYYMMDD-HH24MISS') || '-' || replace(id::text, '-', '')
where invoice_number is null;

alter table public.purchases
  alter column invoice_number set not null;

alter table public.purchases
  add column if not exists status text not null default 'completed';

-- Keep the status domain consistent on upgraded databases.
do $$ begin
  alter table public.purchases
    add constraint purchases_status_check check (status in ('completed','cancelled'));
exception when duplicate_object then null; end $$;

-- Older migration_v8 installations also lack this payment-method constraint.
do $$ begin
  alter table public.purchases
    add constraint purchases_payment_method_check check (payment_method in ('cash','visa','instapay','e_wallet'));
exception when duplicate_object then null; end $$;

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  product_id uuid references public.products(id),
  product_name text not null,
  quantity numeric(12,2) not null default 1,
  unit_cost numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.purchase_items
  add column if not exists item_type text not null default 'product';

-- migration_v8 created this trigger. The application now updates stock itself,
-- so the old trigger must not remain enabled or stock will be doubled.
drop trigger if exists trg_purchase_item_stock on public.purchase_items;

create index if not exists idx_purchases_branch_created on public.purchases(branch_id, created_at desc);
create index if not exists idx_purchases_supplier on public.purchases(supplier_id);
create index if not exists idx_purchases_status on public.purchases(status);
create index if not exists idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index if not exists idx_purchase_items_product on public.purchase_items(product_id);

drop trigger if exists trg_purchases_updated_at on public.purchases;
create trigger trg_purchases_updated_at
  before update on public.purchases
  for each row execute procedure public.set_updated_at();

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;

drop policy if exists "purchases_branch_scoped" on public.purchases;
create policy "purchases_branch_scoped" on public.purchases for all
  to authenticated
  using (public.is_admin() or branch_id = public.current_branch_id())
  with check (public.is_admin() or branch_id = public.current_branch_id());

drop policy if exists "purchase_items_branch_scoped" on public.purchase_items;
create policy "purchase_items_branch_scoped" on public.purchase_items for all
  to authenticated
  using (public.is_admin() or branch_id = public.current_branch_id())
  with check (public.is_admin() or branch_id = public.current_branch_id());

do $$ begin
  alter publication supabase_realtime add table public.purchases;
exception when duplicate_object or undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.purchase_items;
exception when duplicate_object or undefined_object then null; end $$;
