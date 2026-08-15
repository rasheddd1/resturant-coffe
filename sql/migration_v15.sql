-- =====================================================================
-- POS SYSTEM - MIGRATION V15 (additive, safe to run on existing DB)
-- Run in: Supabase Dashboard -> SQL Editor -> New query
--
-- Cash Drawer reconciliation ("جرد الشيفت"):
--   1) CASH_SHIFTS   - one row per open/close cycle of a branch's drawer:
--      opening float, who opened/closed it, the actual counted cash at
--      close time, the system-computed expected cash, and the difference.
--   2) CASH_MOVEMENTS - manual cash in/out logged against an open shift
--      (e.g. "أضفت فكة للدرج" / "سحبت نقدية لدفع مصروف مباشرة من الدرج").
-- Expected cash itself is NOT stored as a running total (that would need
-- constant writes/sync churn) — it's computed on demand from: opening_float
-- + completed cash sales during the shift window - cash sales refunded
-- during the shift window + cash_in movements - cash_out movements. See
-- computeExpectedCash() in src/lib/db/cashShifts.js.
-- =====================================================================

create table if not exists public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  opened_by uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  opening_float numeric(12,2) not null default 0,
  closed_by uuid references public.profiles(id),
  closed_at timestamptz,
  -- Filled only at close time — a physical count the cashier/manager typed in.
  actual_cash_counted numeric(12,2),
  -- Snapshot of what computeExpectedCash() returned at the moment of
  -- closing, stored so shift history stays meaningful even though the
  -- underlying sales/movements it was computed from remain query-able.
  expected_cash numeric(12,2),
  difference numeric(12,2),
  status text not null default 'open' check (status in ('open','closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one open shift per branch at a time.
create unique index if not exists idx_cash_shifts_one_open_per_branch
  on public.cash_shifts(branch_id) where status = 'open';

create index if not exists idx_cash_shifts_branch on public.cash_shifts(branch_id);
create index if not exists idx_cash_shifts_status on public.cash_shifts(status);

drop trigger if exists trg_cash_shifts_updated_at on public.cash_shifts;
create trigger trg_cash_shifts_updated_at
  before update on public.cash_shifts
  for each row execute procedure public.set_updated_at();

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.cash_shifts(id) on delete cascade,
  branch_id uuid references public.branches(id),
  type text not null check (type in ('cash_in','cash_out')),
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_movements_shift on public.cash_movements(shift_id);
create index if not exists idx_cash_movements_branch on public.cash_movements(branch_id);

alter table public.cash_shifts enable row level security;
alter table public.cash_movements enable row level security;

drop policy if exists "cash_shifts_all" on public.cash_shifts;
create policy "cash_shifts_all" on public.cash_shifts for all
  to authenticated using (true) with check (true);

drop policy if exists "cash_movements_all" on public.cash_movements;
create policy "cash_movements_all" on public.cash_movements for all
  to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table public.cash_shifts;
exception when duplicate_object or undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.cash_movements;
exception when duplicate_object or undefined_object then null; end $$;
