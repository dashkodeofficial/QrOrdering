import type { StaffRole } from "./types/db";

/**
 * Role → capability matrix, centralized so the dashboard guard and any
 * conditional UI stay in sync with the spec.
 *
 * ADMIN     : everything
 */
export type Capability =
  | "menu.manage"
  | "menu.view"
  | "orders.manage"
  | "tables.view"
  | "reports.view"
  | "activity.view"
  | "tables.manage"
  | "settings.manage"
  | "spin.manage"
  | "spin.play";

const MATRIX: Record<StaffRole, Capability[]> = {
  ADMIN: [
    "menu.manage", "menu.view", "orders.manage", "tables.view", "tables.manage",
    "reports.view", "activity.view",
    "settings.manage", "spin.manage", "spin.play",
  ],
};

export function can(role: StaffRole | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(cap) ?? false;
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: "Administrator",
};

/** Default landing route for each role after login. */
export const ROLE_HOME: Record<StaffRole, string> = {
  ADMIN: "/admin",
};
