-- =====================================================================
-- POS SYSTEM - MIGRATION V11: RAW MATERIALS + RECIPES (BOM) (additive, safe)
-- Run in: Supabase Dashboard -> SQL Editor -> New query
--
-- Adds:
--   1) raw_materials       — ingredients/packaging stock (name, unit, stock, cost)
--   2) product_recipe_items — the BOM: which raw materials + how much of
--      each go into ONE unit of a given product
--   3) inventory_movements gets a new nullable raw_material_id column so the
--      SAME movements ledger products already use also logs raw-material
--      stock changes (reusing the existing table instead of a parallel one)
--
-- Nothing here touches products, sales, or sale_items structurally beyond
-- what's needed for raw_material_id above — a product with no recipe rows
-- keeps working exactly as it does today (see src/lib/db/sales.js).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RAW MATERIALS
-- ---------------------------------------------------------------------
create table if not exists public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  name text not null,
  unit text not null check (unit in ('g', 'kg', 'ml', 'L', 'pcs')),
  stock_quantity numeric(14,3) not null default 0,
  cost numeric(14,4) not null default 0,
  low_stock_threshold numeric(14,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_raw_materials_branch on public.raw_materials(branch_id);

-- reuses the same set_updated_at() trigger function products already use
drop trigger if exists trg_raw_materials_updated_at on public.raw_materials;
create trigger trg_raw_materials_updated_at
  before update on public.raw_materials
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2) PRODUCT RECIPE ITEMS (Bill of Materials lines)
-- ---------------------------------------------------------------------
create table if not exists public.product_recipe_items (
  id uuid primary key default gen_random_uuid(),
  -- a recipe belongs to its product: deleting the product removes its recipe
  product_id uuid not null references public.products(id) on delete cascade,
  -- a raw material used by recipes cannot be hard-deleted out from under
  -- them (same default-restrict behavior products already rely on for
  -- sale_items — see the FK-violation handling in src/pages/products.js)
  raw_material_id uuid not null references public.raw_materials(id),
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_recipe_items_product on public.product_recipe_items(product_id);
create index if not exists idx_recipe_items_material on public.product_recipe_items(raw_material_id);

-- ---------------------------------------------------------------------
-- 3) EXTEND inventory_movements TO ALSO LOG RAW MATERIAL MOVEMENTS
-- ---------------------------------------------------------------------
alter table public.inventory_movements add column if not exists raw_material_id uuid references public.raw_materials(id) on delete cascade;
alter table public.inventory_movements alter column product_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inventory_movements_one_target_check'
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_one_target_check
      check (
        (product_id is not null and raw_material_id is null)
        or (product_id is null and raw_material_id is not null)
      );
  end if;
end $$;

create index if not exists idx_inv_moves_raw_material on public.inventory_movements(raw_material_id);

-- ---------------------------------------------------------------------
-- 4) ROW LEVEL SECURITY — same permissive single-store pattern every
--    other business table already uses (see sql/schema.sql)
-- ---------------------------------------------------------------------
alter table public.raw_materials enable row level security;
alter table public.product_recipe_items enable row level security;

drop policy if exists "raw_materials_all" on public.raw_materials;
create policy "raw_materials_all" on public.raw_materials for all
  to authenticated using (true) with check (true);

drop policy if exists "product_recipe_items_all" on public.product_recipe_items;
create policy "product_recipe_items_all" on public.product_recipe_items for all
  to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------
-- 5) REALTIME (same opt-in list as products/sales/customers)
-- ---------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.raw_materials;
exception when duplicate_object or undefined_object then null;
end $$;
