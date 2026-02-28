-- Product/service classification for concepts marked as product.
-- Only productType='product' should be inventory-tracked.

alter table if exists public.concepts
  add column if not exists "productType" text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'concepts_product_type_check'
      and conrelid = 'public.concepts'::regclass
  ) then
    alter table public.concepts
      add constraint concepts_product_type_check
      check ("productType" is null or "productType" in ('product', 'service'));
  end if;
end;
$$;

-- Backfill existing product concepts as inventory products.
update public.concepts
set "productType" = 'product'
where "isProduct" = true
  and coalesce("productType", '') = '';

