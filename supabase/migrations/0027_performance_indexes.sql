-- ============================================================================
-- 0027_performance_indexes.sql
-- Performance indexes identified by auditing every WHERE / ORDER BY / JOIN in
-- the Server Actions and the public menu/settings reads.
--
-- Strategy:
--   * Add composite indexes that match real query shapes (filter + order).
--   * Drop single-column subset indexes that are now redundant, to keep the
--     write path cheap and the planner's choice unambiguous.
--   * All statements are idempotent (`if not exists` / `if exists`) so the
--     migration is safe to re-run and safe on already-migrated databases.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- MENU ITEMS
-- Customer menu query:  where available = true order by sort_order
-- (covers the RLS predicate `available = true` too, so the planner can use
--  the index for both the policy and the query).
-- ---------------------------------------------------------------------------
create index if not exists menu_items_available_sort_idx
  on menu_items(available, sort_order)
  where available = true;

-- FK lookups / admin "count items in category" (deleteCategory).
create index if not exists menu_items_category_id_idx
  on menu_items(category_id);

-- The old single-column partial index is a strict subset of the new
-- composite one — drop it to avoid maintaining two overlapping indexes.
drop index if exists menu_items_available_idx;

-- ---------------------------------------------------------------------------
-- CATEGORIES
-- Customer menu:  order by sort_order
-- ---------------------------------------------------------------------------
create index if not exists categories_sort_order_idx
  on categories(sort_order);

-- ---------------------------------------------------------------------------
-- ORDERS
-- Kitchen board:  where status in (...) order by created_at asc
-- (composite covers the equality on status + the sort on created_at).
-- ---------------------------------------------------------------------------
create index if not exists orders_status_created_idx
  on orders(status, created_at asc);

-- Customer "my orders":  where table_session_id = ? order by created_at desc
-- (composite replaces the old single-column prefix index).
create index if not exists orders_session_created_idx
  on orders(table_session_id, created_at desc);

-- The old single-column indexes are subsumed by the composites above for
-- the two hot queries. `orders_recent_idx` (created_at desc) is still used
-- by the admin "recent 20 orders" fallback in getMyOrders, so keep it.
-- `orders_status_idx` and `orders_session_idx` are redundant — drop them.
drop index if exists orders_status_idx;
drop index if exists orders_session_idx;

-- ---------------------------------------------------------------------------
-- ORDER ITEMS
-- Report joins:  join menu_items on id  (get_category_stats)
-- ---------------------------------------------------------------------------
create index if not exists order_items_menu_item_id_idx
  on order_items(menu_item_id);

-- order_items_order_idx (order_id) already exists from 0009 — retained.

-- ---------------------------------------------------------------------------
-- NOTE on qr_tokens / table_sessions / waiter_requests / staff / tables:
--   Their existing indexes (0006, 0007, 0011, 0012, 0005) already match the
--   query shapes used by /qr/[token], getVerifiedSession, and the waiter
--   board. No additions needed.
-- ---------------------------------------------------------------------------
