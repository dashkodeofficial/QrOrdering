"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedSession } from "@/lib/session";
import { getCurrentStaff, requireCapability } from "@/lib/auth";
import type { WaiterRequestType } from "@/lib/types/db";
import type { ActionResult } from "./orders";

export interface PendingRequest {
  id: string;
  type: WaiterRequestType;
  status: string;
  table_id: string;
  table_name: string | null;
  created_at: string;
}

/**
 * Customer-initiated waiter requests (Call Waiter / Need Water / Need Cutlery
 * / Need Assistance). Validated against the QR session on the server.
 */
export async function createWaiterRequest(
  type: WaiterRequestType,
): Promise<ActionResult> {
  const verified = await getVerifiedSession();
  if (!verified) {
    const staff = await getCurrentStaff();
    if (staff) {
      return { ok: false, error: "Waiter requests are only available from a table QR session." };
    }
    return { ok: false, error: "Session expired — please re-scan the QR code." };
  }

  // Throttle: one pending request of this type per session
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("waiter_requests")
    .select("id")
    .eq("table_session_id", verified.session.id)
    .eq("type", type)
    .neq("status", "RESOLVED")
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "You already have a pending request of this type." };
  }

  const { error } = await supabase.from("waiter_requests").insert({
    table_session_id: verified.session.id,
    table_id: verified.table_id,
    type,
    status: "PENDING",
  });

  if (error) return { ok: false, error: "Could not send request. Try again." };

  // Bill requests also advance the table + session status for staff visibility.
  if (type === "REQUEST_BILL") {
    await Promise.all([
      supabase
        .from("tables")
        .update({ status: "BILL_REQUESTED" })
        .eq("id", verified.table_id),
      supabase
        .from("table_sessions")
        .update({ status: "BILL_REQUESTED" })
        .eq("id", verified.session.id),
    ]);
  }

  revalidatePath(`/orders`);
  return { ok: true, data: undefined };
}

/**
 * Fetch all pending waiter requests for the floating admin panel.
 */
export async function getPendingRequests(): Promise<ActionResult<PendingRequest[]>> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("waiter_requests")
    .select("id, type, status, table_id, created_at, tables(name)")
    .in("status", ["PENDING", "ACKNOWLEDGED"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { ok: false, error: "Could not load requests." };

  const requests: PendingRequest[] = (data ?? []).map((r) => ({
    id: r.id,
    type: r.type as WaiterRequestType,
    status: r.status,
    table_id: r.table_id,
    table_name:
      (r as { tables?: { name?: string } | null }).tables?.name ?? null,
    created_at: r.created_at,
  }));

  return { ok: true, data: requests };
}

/**
 * Resolve (dismiss) a waiter request from the admin panel.
 */
export async function resolveRequest(requestId: string): Promise<ActionResult> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("waiter_requests")
    .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
    .eq("id", requestId)
    .neq("status", "RESOLVED");

  if (error) return { ok: false, error: "Could not resolve request." };

  return { ok: true, data: undefined };
}
