"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedSession } from "@/lib/session";
import { getCurrentStaff } from "@/lib/auth";
import { getPublicSettings } from "@/actions/settings";
import type { Order, OrderItem, RestaurantTable } from "@/lib/types/db";
import type { ActionResult } from "./orders";

/**
 * Load the current table session's orders. Customers never see orders from
 * other sessions because the query is scoped by the verified table_session_id.
 * Admin fallback: if no QR session, show recent orders (admin mode).
 */
export async function getMyOrders(): Promise<ActionResult<Order[]>> {
  const session = await getVerifiedSession();
  const supabase = createAdminClient();

  if (session) {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("table_session_id", session.session.id)
      .order("created_at", { ascending: false });

    if (error) return { ok: false, error: "Could not load orders." };
    return { ok: true, data: data ?? [] };
  }

  // Admin fallback: show recent orders
  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false, error: "Session expired. Please re-scan the QR code." };
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return { ok: false, error: "Could not load orders." };
  return { ok: true, data: data ?? [] };
}

/**
 * Return the current table session ID for the caller. Used by client-side
 * realtime subscriptions so they only receive updates for this session.
 * Admin fallback: returns null (no session-scoped realtime).
 */
export async function getMySessionId(): Promise<ActionResult<string | null>> {
  const session = await getVerifiedSession();
  if (session) {
    return { ok: true, data: session.session.id };
  }

  // Admin fallback: no specific session
  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false, error: "Session expired. Please re-scan the QR code." };
  }

  return { ok: true, data: null };
}

export async function getMyOrderById(
  orderId: string,
): Promise<ActionResult<{ order: Order; items: OrderItem[]; taxRatePercent: number; serviceChargeAmount: number }>> {
  const session = await getVerifiedSession();
  const supabase = createAdminClient();

  if (session) {
    // Fan out order, items, and public settings in parallel. Settings reads
    // from the cached `use cache` scope, so it returns instantly on warm
    // cache instead of adding a sequential round-trip.
    const [orderRes, itemsRes, settings] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .eq("table_session_id", session.session.id)
        .maybeSingle(),
      supabase.from("order_items").select("*").eq("order_id", orderId),
      getPublicSettings(),
    ]);

    if (orderRes.error || itemsRes.error) {
      return { ok: false, error: "Could not load order details." };
    }

    if (!orderRes.data) {
      return { ok: false, error: "Order not found." };
    }

    return { ok: true, data: { order: orderRes.data, items: itemsRes.data ?? [], taxRatePercent: settings.tax_rate_percent, serviceChargeAmount: settings.service_charge_amount } };
  }

  // Admin fallback: allow viewing any order
  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false, error: "Session expired. Please re-scan the QR code." };
  }

  const [orderRes, itemsRes, settings] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle(),
    supabase.from("order_items").select("*").eq("order_id", orderId),
    getPublicSettings(),
  ]);

  if (orderRes.error || itemsRes.error) {
    return { ok: false, error: "Could not load order details." };
  }

  if (!orderRes.data) {
    return { ok: false, error: "Order not found." };
  }

  return { ok: true, data: { order: orderRes.data, items: itemsRes.data ?? [], taxRatePercent: settings.tax_rate_percent, serviceChargeAmount: settings.service_charge_amount } };
}

/**
 * Fetch all tables for the admin table selector. Only accessible by
 * authenticated staff with orders.manage capability.
 */
export async function getTablesForAdmin(): Promise<ActionResult<RestaurantTable[]>> {
  const staff = await getCurrentStaff();
  if (!staff) {
    return { ok: false, error: "Not authenticated." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tables")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return { ok: false, error: "Could not load tables." };
  }

  return { ok: true, data: data ?? [] };
}
