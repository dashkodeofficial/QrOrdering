import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Cached, public restaurant settings — shared by the root layout (primary
 * color + favicon), the customer menu/cart/order pages (tax + service
 * charge), and the Server Action `getPublicSettings`.
 *
 * Tagged `'settings'` so `updateSettings` / `uploadFavicon` can invalidate
 * every consumer at once via `revalidateTag('settings')`.
 *
 * Uses the anon client under RLS (`settings_public_read` is open to anon),
 * so this is safe to call from a `use cache` scope (no cookies/headers).
 */

export interface PublicSettings {
  name: string;
  tax_rate_percent: number;
  service_charge_amount: number;
  primary_color: string;
  favicon_url: string | null;
}

export interface LayoutSettings {
  primary_color: string;
  favicon_url: string | null;
}

const DEFAULT_PRIMARY_COLOR = "#e23744";

export async function getPublicSettingsCached(): Promise<PublicSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("restaurant_settings")
    .select("name, tax_rate_percent, service_charge_amount, primary_color, favicon_url")
    .limit(1)
    .maybeSingle();

  return {
    name: data?.name ?? "Restaurant",
    tax_rate_percent: data?.tax_rate_percent ?? 0,
    service_charge_amount: data?.service_charge_amount ?? 0,
    primary_color: data?.primary_color ?? DEFAULT_PRIMARY_COLOR,
    favicon_url: data?.favicon_url ?? null,
  };
}

export async function getLayoutSettingsCached(): Promise<LayoutSettings> {
  "use cache";
  cacheLife("hours");
  cacheTag("settings");

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("restaurant_settings")
    .select("primary_color, favicon_url")
    .limit(1)
    .maybeSingle();

  return {
    primary_color: data?.primary_color ?? DEFAULT_PRIMARY_COLOR,
    favicon_url: data?.favicon_url ?? null,
  };
}
