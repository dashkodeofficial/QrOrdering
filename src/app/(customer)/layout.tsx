import { Suspense } from "react";
import { CustomerBottomNav, CustomerTopNav } from "@/components/customer/bottom-nav";
import { AdminProvider } from "@/components/customer/admin-context";
import { getVerifiedSession } from "@/lib/session";
import { getCurrentStaff } from "@/lib/auth";
import { can } from "@/lib/permissions";
import type { ReactNode } from "react";

/**
 * Customer-facing shell — mobile-first app-like layout.
 *
 * Access control: the customer dashboard is only accessible via:
 *   1. A valid QR table session (cookie set by /qr/[token])
 *   2. An authenticated ADMIN staff member
 * Direct URL access without either is blocked.
 *
 * PERFORMANCE: the static shell (nav + main) is rendered immediately and the
 * access check is streamed in behind `<Suspense>`. This removes the two
 * sequential DB queries (`getVerifiedSession`) from the critical paint path
 * so the menu/orders/cart pages can hydrate instantly. The denial screen
 * swaps in only if the streamed check resolves to no session — behavior for
 * legit QR/admin users is unchanged.
 */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<CustomerShell />}>
      <AccessGate>{children}</AccessGate>
    </Suspense>
  );
}

/** Static shell rendered while the access check is in flight (or on denial). */
function CustomerShell({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-app-surface">
      <CustomerTopNav />
      <main className="flex-1 pb-20 lg:pb-0">{children}</main>
      <CustomerBottomNav />
    </div>
  );
}

/**
 * Resolves the customer's access (QR session OR admin staff) and renders the
 * real shell + AdminProvider. When neither is present, renders the denial
 * screen instead of `children`.
 */
async function AccessGate({ children }: { children: ReactNode }) {
  const session = await getVerifiedSession();
  const isAdminAccess = !session ? await checkAdminAccess() : false;

  if (!session && !isAdminAccess) {
    return (
      <CustomerShell>
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-app-surface px-6 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-4xl">
            🔒
          </div>
          <h1 className="mt-6 text-xl font-bold text-app-ink">Access Denied</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            This dashboard is only accessible by scanning the QR code on your table.
            Please scan the QR code to start your order.
          </p>
        </div>
      </CustomerShell>
    );
  }

  return (
    <AdminProvider isAdmin={isAdminAccess}>
      <CustomerShell>{children}</CustomerShell>
    </AdminProvider>
  );
}

async function checkAdminAccess(): Promise<boolean> {
  const staff = await getCurrentStaff();
  if (!staff) return false;
  return can(staff.role, "orders.manage");
}
