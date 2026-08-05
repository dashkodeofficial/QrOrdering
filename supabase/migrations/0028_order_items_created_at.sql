-- ============================================================================
-- 0028_order_items_created_at.sql
-- Add created_at to order_items so merged orders can group items by
-- submission batch.
-- ============================================================================

alter table order_items add column if not exists created_at timestamptz not null default now();

create index if not exists order_items_created_at_idx on order_items(created_at);

-- Add order_items to realtime publication (already added in 0022, but guard)
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;
