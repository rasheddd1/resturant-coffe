-- =====================================================================
-- POS SYSTEM - MIGRATION V12: RAW MATERIALS PURCHASING + COSTING (additive, safe)
-- Run in: Supabase Dashboard -> SQL Editor -> New query (after migration_v11.sql)
--
-- Context: migration_v11.sql already introduced raw_materials with a single
-- `unit` (the unit stock/recipes are tracked in — the CONSUMPTION unit,
-- e.g. ml/g/pcs) and a single `cost` (cost per one consumption unit).
-- Nothing about that changes here — every existing query, recipe, and sale
-- keeps working exactly as-is.
--
-- This migration only ADDS the purchasing side on top of it: how a material
-- was bought (purchase unit/quantity/total cost, e.g. "20 L for 300"), and
-- a conversion factor so the app can turn that into consumption-unit stock
-- and a cost-per-consumption-unit automatically (e.g. 20 L = 20,000 ml =>
-- cost/ml = 300/20000 = 0.015), then keep a running Weighted Average Cost
-- as more purchases come in (see purchaseRawMaterial() in
-- src/lib/db/rawMaterials.js).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RAW MATERIALS: purchasing/conversion columns
-- ---------------------------------------------------------------------
alter table public.raw_materials add column if not exists purchase_unit text;
alter table public.raw_materials add column if not exists purchase_quantity numeric(14,3) not null default 0;
alter table public.raw_materials add column if not exists total_purchase_cost numeric(14,4) not null default 0;
-- how many consumption units (raw_materials.unit) make up ONE purchase unit
-- (raw_materials.purchase_unit) — e.g. purchase_unit='L', unit='ml' => 1000.
-- Defaults to 1 (purchase unit === consumption unit) so every material that
-- existed before this migration keeps behaving exactly as it did.
alter table public.raw_materials add column if not exists conversion_factor numeric(14,6) not null default 1 check (conversion_factor > 0);

comment on column public.raw_materials.unit is 'Consumption unit — what stock_quantity, cost, and recipe quantities are measured in (e.g. ml, g, pcs)';
comment on column public.raw_materials.cost is 'Cost per ONE consumption unit — a running Weighted Average Cost updated automatically on every purchase, never edited by hand once a material has been purchased at least once';
comment on column public.raw_materials.purchase_unit is 'Unit the material is bought in (e.g. L, Kg, Box) — purely informational + used to compute conversion_factor, may differ from the consumption unit';
comment on column public.raw_materials.purchase_quantity is 'Quantity of the most recent purchase, in purchase_unit';
comment on column public.raw_materials.total_purchase_cost is 'Total cost of the most recent purchase (not per-unit)';

-- ---------------------------------------------------------------------
-- 2) INVENTORY MOVEMENTS: widen the movement-type ledger to also cover
--    'purchase' (restocking a raw material) and 'waste' (spoilage/breakage)
--    — additive only, every existing type keeps working unchanged.
-- ---------------------------------------------------------------------
alter table public.inventory_movements drop constraint if exists inventory_movements_type_check;
alter table public.inventory_movements add constraint inventory_movements_type_check
  check (type in ('in', 'out', 'adjustment', 'sale', 'refund', 'purchase', 'waste'));
