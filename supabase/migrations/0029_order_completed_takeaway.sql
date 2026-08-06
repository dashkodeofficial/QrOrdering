-- ============================================================================
-- 0029_order_completed_takeaway.sql
-- 1. Add COMPLETED to order_status enum (for Mark as Paid)
-- 2. Make table_id and table_session_id nullable (for takeaway/delivery orders)
-- 3. Add order_type column to distinguish dine-in from takeaway
-- ============================================================================

-- 1. Add COMPLETED to order_status enum
do $$ begin
  alter type order_status add value if not exists 'COMPLETED';
exception when duplicate_object then null; end $$;

-- 2. Make table_id and table_session_id nullable for takeaway/delivery orders
alter table orders alter column table_id drop not null;
alter table orders alter column table_session_id drop not null;

-- 3. Add order_type column
alter table orders add column if not exists order_type text not null default 'DINE_IN'
  check (order_type in ('DINE_IN','TAKEAWAY','DELIVERY'));

-- 4. Add index on order_type for filtering
create index if not exists orders_order_type_idx on orders(order_type);

-- 5. Add orders table to realtime publication (idempotent via DO block)
do $$ begin
  alter publication supabase_realtime add table orders;
exception when duplicate_object then null; end $$;
