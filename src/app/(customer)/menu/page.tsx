import { getMenu } from "@/lib/data/menu";
import { getPublicSettingsCached } from "@/lib/data/settings";
import MenuContent from "@/components/customer/menu-content";

/**
 * Menu page — prerendered static shell (Cache Components).
 *
 * The menu + restaurant settings are public, slowly-changing data, so they
 * are fetched through `use cache` scopes tagged `'menu'` / `'settings'` and
 * served from the static shell. Neither fetch touches `cookies()`/`headers()`,
 * so the entire page is eligible for prerendering.
 *
 * The only request-specific value is the `?table=` search param (used by
 * waiters to preselect a table). That is a runtime value, so it is read on
 * the client via `useSearchParams()` inside `MenuContent` (already a client
 * component) rather than awaited here — awaiting it would force the whole
 * page dynamic and defeat the prerender.
 *
 * The customer layout's access gate (which reads the `qr-table-session`
 * cookie) is wrapped in its own `<Suspense>` boundary, so it streams in
 * without blocking this page's static shell.
 */
export default async function MenuPage() {
  // Public, cacheable data — fetched in parallel from `use cache` scopes.
  const [menu, settings] = await Promise.all([
    getMenu(),
    getPublicSettingsCached(),
  ]);

  return (
    <>
      {/* Compact header */}
      <div className="border-b border-border/40 bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
              Scan &bull; Order &bull; Eat
            </span>
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-app-ink sm:text-2xl lg:text-3xl">
            {settings.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-lg">
            Browse our menu and order your favorites directly from your table.
          </p>
        </div>
      </div>

      <MenuContent
        categories={menu.categories}
        items={menu.items}
        taxRatePercent={settings.tax_rate_percent}
        serviceChargeAmount={settings.service_charge_amount}
      />
    </>
  );
}
