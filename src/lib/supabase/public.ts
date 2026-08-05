import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-free Supabase client for use inside `use cache` scopes.
 *
 * Cached scopes (the `use cache` directive) execute in an isolated environment
 * and are forbidden from touching request APIs like `cookies()`/`headers()`.
 * The browser-bound `createServerClientFromCookies()` therefore cannot be
 * used there. This singleton uses the anon key with no session persistence,
 * so every request it issues is subject to the same RLS policies as the
 * browser client (e.g. `menu_items_public_read` filters `available = true`).
 *
 * The security surface is identical to the existing customer-facing reads:
 * only public, RLS-allowed rows are ever returned. Use this exclusively from
 * cached data accessors in `src/lib/data/*`.
 */

let _client: SupabaseClient | null = null;

export function createPublicClient(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  return _client;
}
