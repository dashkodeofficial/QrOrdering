import type { StaffRole } from "./types/db";

/**
 * Role → capability matrix, centralized so the dashboard guard and any
 * conditional UI stay in sync with the spec.
 *
 * ADMIN     : everything
 * MANAGER   : menu, orders, tables, reports (not owner settings)
 */
export type Capability =
  | "menu.manage"
  | "menu.view"
  | "orders.manage"
  | "tables.view"
  | "reports.view"
  | "activity.view"
  | "staff.manage"
  | "tables.manage"
  | "settings.manage"
  | "spin.manage"
  | "spin.play";

const MATRIX: Record<StaffRole, Capability[]> = {
  ADMIN: [
    "menu.manage", "menu.view", "orders.manage", "tables.view", "tables.manage",
    "reports.view", "activity.view",
    "staff.manage", "settings.manage", "spin.manage", "spin.play",
  ],
  MANAGER: [
    "menu.manage", "menu.view", "orders.manage", "tables.view",
    "reports.view", "activity.view", "spin.manage", "spin.play",
  ],
};

export function can(role: StaffRole | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(cap) ?? false;
}

export const ROLE_LABEL: Record<StaffRole, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
};

/** Default landing route for each role after login. */
export const ROLE_HOME: Record<StaffRole, string> = {
  ADMIN: "/admin",
  MANAGER: "/admin",
};
