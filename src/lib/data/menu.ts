import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { Category, MenuItem } from "@/lib/types/db";

/**
 * Cached, public menu data — the single source of truth for the customer
 * `/menu` page and the admin menu preview.
 *
 * `use cache` stores the return value keyed by the (empty) argument list.
 * `cacheTag('menu')` lets menu mutations invalidate it on demand via
 * `revalidateTag('menu')` in `src/actions/menu.ts`. `cacheLife('hours')`
 * sets a stale-while-revalidate window of 1h (server) / 5m (client) so even
 * a missed invalidation self-heals within an hour.
 *
 * SECURITY: uses the cookie-free anon client (`createPublicClient`), so RLS
 * applies — `menu_items_public_read` filters `available = true` and
 * `categories_public_read` is fully open. This is the exact same data the
 * browser client was already reading; only the transport changed.
 */
/** Lean category shape returned to the client (drops `created_at`). */
export type MenuCategory = Pick<Category, "id" | "name" | "slug" | "sort_order">;

/**
 * Lean menu item shape returned to the customer (drops `created_at`/
 * `updated_at`). `available` is kept because the client filter UI and the
 * cart both reference it. This is a subset of `MenuItem` — every field here
 * exists on `MenuItem`, so it is structurally assignable *into* code that
 * reads only these fields.
 */
export type MenuListItem = Pick<
  MenuItem,
  "id" | "category_id" | "name" | "description" | "price_cents" | "image_url" | "available" | "popular" | "sort_order"
>;

export interface MenuData {
  categories: MenuCategory[];
  items: MenuListItem[];
}

export async function getMenu(): Promise<MenuData> {
  "use cache";
  cacheLife("hours");
  cacheTag("menu");

  const supabase = createPublicClient();

  const [categoriesRes, itemsRes] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, sort_order")
      .order("sort_order", { ascending: true }),
    supabase
      .from("menu_items")
      .select("id, category_id, name, description, price_cents, image_url, available, popular, sort_order")
      .eq("available", true)
      .order("sort_order", { ascending: true }),
  ]);

  // On a cache refresh failure we still serve the previous good value, so we
  // don't hard-fail the page. The next mutation/tag-invalidation will retry.
  return {
    categories: categoriesRes.data ?? [],
    items: itemsRes.data ?? [],
  };
}
