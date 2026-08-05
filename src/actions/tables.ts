"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability, requireAnyStaff } from "@/lib/auth";
import { can, type Capability } from "@/lib/permissions";
import { tableSchema } from "@/lib/validations";
import { generateQrToken } from "@/lib/qr";
import type { ActionResult } from "./orders";

/* ======================= TABLES ========================================= */

export async function createTable(
  raw: unknown,
): Promise<ActionResult<{ id: string; token: string }>> {
  const auth = await requireCapability("tables.manage");
  if (!auth.ok) return auth;

  const parsed = tableSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };

  const supabase = createAdminClient();

  // Create table + QR token in one logical step.
  const { data: table, error: tableErr } = await supabase
    .from("tables")
    .insert({
      name: parsed.data.name,
      seat_capacity: parsed.data.seat_capacity,
    })
    .select("id")
    .single();

  if (tableErr || !table) return { ok: false, error: "Could not create table." };

  const token = generateQrToken();
  const { error: tokenErr } = await supabase.from("qr_tokens").insert({
    table_id: table.id,
    token,
  });

  if (tokenErr) {
    await supabase.from("tables").delete().eq("id", table.id);
    return { ok: false, error: "Could not generate QR token." };
  }

  revalidatePath("/admin/tables");
  return { ok: true, data: { id: table.id, token } };
}

export async function updateTable(
  id: string,
  raw: unknown,
): Promise<ActionResult> {
  const auth = await requireCapability("tables.manage");
  if (!auth.ok) return auth;

  const parsed = tableSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("tables")
    .update({
      name: parsed.data.name,
      seat_capacity: parsed.data.seat_capacity,
    })
    .eq("id", id);

  if (error) return { ok: false, error: "Update failed." };
  revalidatePath("/admin/tables");
  return { ok: true, data: undefined };
}

export async function deleteTable(id: string): Promise<ActionResult> {
  const auth = await requireCapability("tables.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();

  // 1. Find all session IDs for this table (needed to delete payments + sessions)
  const { data: sessions } = await supabase
    .from("table_sessions")
    .select("id")
    .eq("table_id", id);

  const sessionIds = (sessions ?? []).map((s) => s.id);

  // 2. Delete payments referencing those sessions (RESTRICT FK)
  if (sessionIds.length > 0) {
    await supabase.from("payments").delete().in("table_session_id", sessionIds);
  }

  // 3. Delete orders for this table (RESTRICT FK on tables + table_sessions;
  //    order_items cascade from orders)
  await supabase.from("orders").delete().eq("table_id", id);

  // 4. Delete table_sessions (waiter_requests + feedback cascade)
  await supabase.from("table_sessions").delete().eq("table_id", id);

  // 5. Finally delete the table (qr_tokens + remaining waiter_requests cascade)
  const { error } = await supabase.from("tables").delete().eq("id", id);
  if (error) return { ok: false, error: "Delete failed." };

  revalidatePath("/admin/tables");
  return { ok: true, data: undefined };
}


/**
 * Update table lifecycle status (used by waiters/cashier in Phase 2,
 * exposed here for completeness).
 */
export async function updateTableStatus(
  tableId: string,
  status: string,
): Promise<ActionResult> {
  const staff = await requireAnyStaff();
  if (!staff) return { ok: false, error: "Please log in." };
  const canUpdate = (["tables.manage", "tables.view", "waiter.view", "payments.manage"] as Capability[]).some((c) =>
    can(staff.role, c),
  );
  if (!canUpdate) return { ok: false, error: "You do not have permission to update table status." };

  const valid = ["AVAILABLE", "OCCUPIED", "BILL_REQUESTED", "PAYMENT_PENDING", "CLEANING"];
  if (!valid.includes(status)) return { ok: false, error: "Invalid status" };

  const supabase = createAdminClient();

  if (status === "AVAILABLE") {
    // Close any active sessions for this table
    const now = new Date().toISOString();
    await Promise.all([
      supabase.from("tables").update({ status }).eq("id", tableId),
      supabase
        .from("table_sessions")
        .update({ status: "COMPLETED", ended_at: now })
        .eq("table_id", tableId)
        .is("ended_at", null),
    ]);
  } else {
    const { error } = await supabase.from("tables").update({ status }).eq("id", tableId);
    if (error) return { ok: false, error: "Update failed." };
  }

  revalidatePath("/admin/tables");
  revalidatePath("/waiter");
  return { ok: true, data: undefined };
}

