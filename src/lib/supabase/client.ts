import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (singleton). Uses the anon key, so every
 * request is subject to Row Level Security. Customer-facing reads (menu,
 * categories) and realtime subscriptions flow through here.
 *
 * Customer WRITES never use this client — they go through Server Actions
 * that validate the QR token server-side with the service-role key.
 *
 * Singleton: a single browser client is created once and shared across all
 * call sites (kitchen, waiter, cashier, customer orders, admin tabs). This
 * ensures the auth session is established once and shared by every realtime
 * subscription — creating multiple `createBrowserClient` instances can
 * cause auth-state issues that silently break realtime delivery.
 *
 * The `create` factory has no explicit return-type annotation so TypeScript
 * infers the exact `SupabaseClient` generic instantiation from the actual
 * `createBrowserClient(...)` call. `ReturnType<typeof create>` therefore
 * matches the type callers got before the singleton refactor, preserving
 * realtime callback payload typing (e.g. `.on("postgres_changes", ...)`).
 */
function create() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let client: ReturnType<typeof create> | null = null;

export function createClient() {
  if (!client) {
    client = create();
  }
  return client;
}
