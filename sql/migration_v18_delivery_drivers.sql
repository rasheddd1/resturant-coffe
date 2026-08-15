-- DELIVERY DRIVERS / COURIERS
create table if not exists public.delivery_drivers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  name text not null,
  phone text,
  alternate_phone text,
  vehicle text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_drivers_branch on public.delivery_drivers(branch_id);
create index if not exists idx_delivery_drivers_active on public.delivery_drivers(branch_id,is_active);

alter table public.sales add column if not exists delivery_driver_id uuid references public.delivery_drivers(id);
alter table public.sales add column if not exists delivery_status text;

update public.sales set delivery_status = case
  when order_type = 'delivery' and delivery_driver_id is not null then 'assigned'
  when order_type = 'delivery' then 'pending'
  else null end
where delivery_status is null;

alter table public.sales drop constraint if exists sales_delivery_status_check;
alter table public.sales add constraint sales_delivery_status_check
  check (delivery_status is null or delivery_status in ('pending','assigned','out_for_delivery','delivered','partial','failed'));

create index if not exists idx_sales_delivery_driver on public.sales(branch_id,delivery_driver_id,delivery_status);

create table if not exists public.driver_transactions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.delivery_drivers(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  type text not null check (type in ('cash_collection','cash_handover','expense','commission','adjustment')),
  amount numeric(12,2) not null check (amount >= 0),
  sale_id uuid references public.sales(id),
  description text,
  txn_date date not null default current_date,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_driver_transactions_driver on public.driver_transactions(driver_id,txn_date desc);
create index if not exists idx_driver_transactions_sale on public.driver_transactions(sale_id);

alter table public.delivery_drivers enable row level security;
alter table public.driver_transactions enable row level security;

drop policy if exists "delivery_drivers_all" on public.delivery_drivers;
create policy "delivery_drivers_all" on public.delivery_drivers for all using (true) with check (true);
drop policy if exists "driver_transactions_all" on public.driver_transactions;
create policy "driver_transactions_all" on public.driver_transactions for all using (true) with check (true);

alter publication supabase_realtime add table public.delivery_drivers;
alter publication supabase_realtime add table public.driver_transactions;
