"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getVerifiedSession } from "@/lib/session";
import { requireCapability } from "@/lib/auth";
import { logActivity } from "@/actions/activity";
import { placeOrderSchema } from "@/lib/validations";
import { sumCartTotal } from "@/lib/format";
import { getPublicSettings } from "@/actions/settings";
import type { OrderStatus, TableStatus } from "@/lib/types/db";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Place an order for the current table session.
 *
 * Trust model: the customer's cart is untrusted. We re-validate the session
 * (anti-spoofing), then for EVERY line item we reload the live menu row and
 * use ITS current price + availability — never the price the browser sent.
 * Total is recomputed server-side.
 */
export async function placeOrder(
  raw: unknown,
): Promise<ActionResult<{ orderId: string }>> {
  // 1. Validate shape (once, used by both QR and admin paths)
  const parsed = placeOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order" };
  }

  // 2. AuthN: valid QR session OR admin with tableId
  const verified = await getVerifiedSession();

  let tableId: string;
  let sessionId: string;

  if (verified) {
    tableId = verified.table_id;
    sessionId = verified.session.id;
  } else {
    // Admin path: no QR session, but authenticated admin with a selected table
    const admin = await requireCapability("orders.manage");
    if (!admin.ok) {
      return { ok: false, error: "Your session has expired. Please re-scan the QR code." };
    }

    if (!parsed.data.tableId) {
      return { ok: false, error: "Please select a table before placing an order." };
    }

    const supabase = createAdminClient();

    // Verify the table exists
    const { data: table } = await supabase
      .from("tables")
      .select("id, status")
      .eq("id", parsed.data.tableId)
      .maybeSingle();

    if (!table) {
      return { ok: false, error: "Selected table not found." };
    }

    // Find an active QR token for this table (needed for session creation)
    const { data: tokenRow } = await supabase
      .from("qr_tokens")
      .select("id")
      .eq("table_id", table.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenRow) {
      return { ok: false, error: "No active QR token for this table. Please generate one first." };
    }

    // Reuse an existing active session for this table if one exists
    const { data: existingSession } = await supabase
      .from("table_sessions")
      .select("id")
      .eq("table_id", table.id)
      .is("ended_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      tableId = table.id;
      sessionId = existingSession.id;
    } else {
      // No active session — create a new one
      const { data: newSession, error: sessionErr } = await supabase
        .from("table_sessions")
        .insert({
          table_id: table.id,
          qr_token_id: tokenRow.id,
          status: "ACTIVE",
        })
        .select("id")
        .single();

      if (sessionErr || !newSession) {
        return { ok: false, error: "Could not create a table session. Please try again." };
      }

      tableId = table.id;
      sessionId = newSession.id;
    }
  }

  const supabase = createAdminClient();

  // 3. Re-fetch live menu rows for every item — use server prices/availability
  const itemIds = parsed.data.items.map((i) => i.menu_item_id);
  const { data: liveItems, error: fetchErr } = await supabase
    .from("menu_items")
    .select("id, name, price_cents, available")
    .in("id", itemIds);

  if (fetchErr) return { ok: false, error: "Could not verify menu items." };

  const liveById = new Map(liveItems.map((m) => [m.id, m]));
  const orderItems: {
    menu_item_id: string;
    name: string;
    unit_price_cents: number;
    quantity: number;
    notes: string | null;
  }[] = [];

  for (const line of parsed.data.items) {
    const live = liveById.get(line.menu_item_id);
    if (!live) {
      return { ok: false, error: `"${line.name}" is no longer on the menu.` };
    }
    if (!live.available) {
      return { ok: false, error: `Sorry, "${live.name}" is no longer available.` };
    }
    orderItems.push({
      menu_item_id: live.id,
      name: live.name,
      unit_price_cents: live.price_cents, // server-authoritative price
      quantity: line.quantity,
      notes: line.notes?.trim() ? line.notes.trim() : null,
    });
  }

  // 4. Check for an existing PLACED order for this table (merge logic).
  //    Primary: same table_session_id. Fallback: same table_id with any
  //    active session (handles cookie expiry → new session for same table).
  let existingOrderId: string | null = null;

  const { data: sameSessionOrder, error: mergeErr } = await supabase
    .from("orders")
    .select("id")
    .eq("table_session_id", sessionId)
    .eq("status", "PLACED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (mergeErr) {
    return { ok: false, error: "Could not check for existing order. Please try again." };
  }

  if (sameSessionOrder) {
    existingOrderId = sameSessionOrder.id;
  } else {
    // Fallback: look for a PLACED order on the same table via any
    // still-active session (ended_at is null).
    const { data: activeSessions } = await supabase
      .from("table_sessions")
      .select("id")
      .eq("table_id", tableId)
      .is("ended_at", null);

    if (activeSessions && activeSessions.length > 0) {
      const sessionIds = activeSessions.map((s) => s.id);
      const { data: sameTableOrder, error: tableErr } = await supabase
        .from("orders")
        .select("id")
        .in("table_session_id", sessionIds)
        .eq("status", "PLACED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tableErr) {
        console.error("Merge fallback query error:", tableErr.message);
      } else if (sameTableOrder) {
        existingOrderId = sameTableOrder.id;
      }
    }
  }

  if (existingOrderId) {
    // Merge: append new items to the existing order
    const { error: itemsErr } = await supabase.from("order_items").insert(
      orderItems.map((i) => ({ ...i, order_id: existingOrderId })),
    );

    if (itemsErr) {
      return { ok: false, error: "Could not add items to the existing order. Please try again." };
    }

    // Recalculate the order total
    await recalcOrderTotal(existingOrderId);

    revalidatePath("/orders");
    revalidatePath(`/orders/${existingOrderId}`);
    revalidatePath(`/admin/orders/${existingOrderId}`);

    return { ok: true, data: { orderId: existingOrderId } };
  }

  // 5. Server-side subtotal + grand total (with tax + service charge)
  const subtotalCents = sumCartTotal(orderItems);
  const { tax_rate_percent: taxRate, service_charge_amount: serviceCharge } = await getPublicSettings();
  const taxCents = Math.round(subtotalCents * taxRate / 100);
  const totalCents = subtotalCents + taxCents + serviceCharge;

  // 6. Insert order + items atomically
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      table_id: tableId,
      table_session_id: sessionId,
      status: "PLACED",
      total_cents: totalCents,
      notes: parsed.data.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (orderErr || !order) {
    return { ok: false, error: "Could not place your order. Please try again." };
  }

  const { error: itemsErr } = await supabase.from("order_items").insert(
    orderItems.map((i) => ({ ...i, order_id: order.id })),
  );

  if (itemsErr) {
    // Best-effort rollback of the parent order
    await supabase.from("orders").delete().eq("id", order.id);
    return { ok: false, error: "Could not save order items. Please try again." };
  }

  // 7. If admin path, mark the table as OCCUPIED so the waiter dashboard reflects it
  if (!verified) {
    await supabase.from("tables").update({ status: "OCCUPIED" }).eq("id", tableId);
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/admin/orders/${order.id}`);

  return { ok: true, data: { orderId: order.id } };
}

export async function cancelOrder(orderId: string): Promise<ActionResult> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();

  // Fetch the order to get table_session_id for auto-available check
  const { data: order } = await supabase
    .from("orders")
    .select("id, table_session_id, table_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "Order not found." };

  const { error } = await supabase
    .from("orders")
    .update({ status: "CANCELLED" })
    .eq("id", orderId)
    .eq("status", "PLACED");

  if (error) return { ok: false, error: "Could not cancel order" };

  await logActivity("order.cancel", {}, orderId);

  // Auto-available: if all orders for this session are now CANCELLED,
  // set the table to AVAILABLE and close the session.
  const { data: remaining } = await supabase
    .from("orders")
    .select("id, status")
    .eq("table_session_id", order.table_session_id)
    .neq("status", "CANCELLED");

  if (!remaining || remaining.length === 0) {
    const now = new Date().toISOString();
    await Promise.all([
      supabase.from("tables").update({ status: "AVAILABLE" }).eq("id", order.table_id),
      supabase
        .from("table_sessions")
        .update({ status: "COMPLETED", ended_at: now })
        .eq("id", order.table_session_id)
        .is("ended_at", null),
    ]);
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/tables");
  return { ok: true, data: undefined };
}

export interface OrderHistoryItem {
  id: string;
  table_id: string;
  table_session_id: string;
  status: OrderStatus;
  total_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  table_name: string | null;
  item_count: number;
}

export interface PaginatedOrders {
  orders: OrderHistoryItem[];
  total: number;
}

export async function getAllOrders(
  page: number = 1,
  pageSize: number = 20,
  statusFilter?: string,
): Promise<ActionResult<PaginatedOrders>> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("orders")
    .select("*, tables(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (statusFilter && statusFilter !== "ALL") {
    query = query.eq("status", statusFilter);
  }

  const { data, error, count } = await query;

  if (error) return { ok: false, error: "Could not load orders." };

  const orderIds = (data ?? []).map((o) => o.id);
  const { data: itemsData } = await supabase
    .from("order_items")
    .select("order_id")
    .in("order_id", orderIds);

  const itemCountMap = new Map<string, number>();
  for (const item of itemsData ?? []) {
    itemCountMap.set(item.order_id, (itemCountMap.get(item.order_id) ?? 0) + 1);
  }

  const orders: OrderHistoryItem[] = (data ?? []).map((o) => ({
    id: o.id,
    table_id: o.table_id,
    table_session_id: o.table_session_id,
    status: o.status as OrderStatus,
    total_cents: o.total_cents,
    notes: o.notes,
    created_at: o.created_at,
    updated_at: o.updated_at,
    table_name: (o as { tables?: { name?: string } | null }).tables?.name ?? null,
    item_count: itemCountMap.get(o.id) ?? 0,
  }));

  return { ok: true, data: { orders, total: count ?? 0 } };
}

export interface OrderInvoiceData {
  orderId: string;
  tableName: string;
  status: string;
  createdAt: string;
  items: { name: string; quantity: number; unit_price_cents: number; notes: string | null }[];
  subtotalCents: number;
  taxRatePercent: number;
  taxCents: number;
  serviceChargeCents: number;
  totalCents: number;
  restaurant: {
    name: string;
    address: string | null;
    phone: string | null;
    receipt_footer: string | null;
  };
}

export async function getOrderInvoice(
  orderId: string,
): Promise<ActionResult<OrderInvoiceData>> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();

  const [orderRes, settingsRes, itemsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("*, tables(name)")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("restaurant_settings")
      .select("name, address, phone, receipt_footer, tax_rate_percent, service_charge_amount")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId),
  ]);

  if (!orderRes.data) return { ok: false, error: "Order not found." };

  const itemsData = itemsRes.data;

  const items = (itemsData ?? []).map((i) => ({
    name: i.name,
    quantity: i.quantity,
    unit_price_cents: i.unit_price_cents,
    notes: i.notes,
  }));

  const subtotalCents = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
  const taxRatePercent = settingsRes.data?.tax_rate_percent ?? 0;
  const serviceChargeCents = settingsRes.data?.service_charge_amount ?? 0;
  const taxCents = Math.round(subtotalCents * taxRatePercent / 100);
  const totalCents = subtotalCents + taxCents + serviceChargeCents;

  return {
    ok: true,
    data: {
      orderId,
      tableName: (orderRes.data as { tables?: { name?: string } | null }).tables?.name ?? "Table",
      status: orderRes.data.status,
      createdAt: orderRes.data.created_at,
      items,
      subtotalCents,
      taxRatePercent,
      taxCents,
      serviceChargeCents,
      totalCents,
      restaurant: {
        name: settingsRes.data?.name ?? "Restaurant",
        address: settingsRes.data?.address ?? null,
        phone: settingsRes.data?.phone ?? null,
        receipt_footer: settingsRes.data?.receipt_footer ?? null,
      },
    },
  };
}

/* ====================================================================== */
/* Internal helper: recalculate order total from items + settings         */
/* ====================================================================== */

async function recalcOrderTotal(orderId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: items } = await supabase
    .from("order_items")
    .select("unit_price_cents, quantity")
    .eq("order_id", orderId);

  const subtotal = (items ?? []).reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
  const { tax_rate_percent: taxRate, service_charge_amount: serviceCharge } = await getPublicSettings();
  const taxCents = Math.round(subtotal * taxRate / 100);
  const totalCents = subtotal + taxCents + serviceCharge;

  await supabase
    .from("orders")
    .update({ total_cents: totalCents, updated_at: new Date().toISOString() })
    .eq("id", orderId);
}

/* ====================================================================== */
/* Admin order details page                                               */
/* ====================================================================== */

export interface AdminOrderItem {
  id: string;
  menu_item_id: string | null;
  name: string;
  unit_price_cents: number;
  quantity: number;
  notes: string | null;
  created_at: string;
}

export interface AdminOrderDetails {
  id: string;
  status: OrderStatus;
  total_cents: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  table_id: string;
  table_name: string | null;
  table_session_id: string;
  items: AdminOrderItem[];
  taxRatePercent: number;
  serviceChargeCents: number;
  subtotalCents: number;
  taxCents: number;
}

export async function getAdminOrderDetails(
  orderId: string,
): Promise<ActionResult<AdminOrderDetails>> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();

  const [orderRes, itemsRes, settings] = await Promise.all([
    supabase
      .from("orders")
      .select("*, tables(name)")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    getPublicSettings(),
  ]);

  if (!orderRes.data) return { ok: false, error: "Order not found." };

  const items: AdminOrderItem[] = (itemsRes.data ?? []).map((i) => ({
    id: i.id,
    menu_item_id: i.menu_item_id,
    name: i.name,
    unit_price_cents: i.unit_price_cents,
    quantity: i.quantity,
    notes: i.notes,
    created_at: i.created_at ?? orderRes.data.created_at,
  }));

  const subtotalCents = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
  const taxRatePercent = settings.tax_rate_percent;
  const serviceChargeCents = settings.service_charge_amount;
  const taxCents = Math.round(subtotalCents * taxRatePercent / 100);

  return {
    ok: true,
    data: {
      id: orderRes.data.id,
      status: orderRes.data.status as OrderStatus,
      total_cents: orderRes.data.total_cents,
      notes: orderRes.data.notes,
      created_at: orderRes.data.created_at,
      updated_at: orderRes.data.updated_at,
      table_id: orderRes.data.table_id,
      table_name:
        (orderRes.data as { tables?: { name?: string } | null }).tables?.name ?? null,
      table_session_id: orderRes.data.table_session_id,
      items,
      taxRatePercent,
      serviceChargeCents,
      subtotalCents,
      taxCents,
    },
  };
}

export async function updateOrderItem(
  itemId: string,
  newQuantity: number,
): Promise<ActionResult> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  if (newQuantity < 1) {
    return removeOrderItem(itemId);
  }

  const supabase = createAdminClient();

  const { data: item } = await supabase
    .from("order_items")
    .select("order_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return { ok: false, error: "Item not found." };

  const { error } = await supabase
    .from("order_items")
    .update({ quantity: newQuantity })
    .eq("id", itemId);

  if (error) return { ok: false, error: "Could not update item." };

  await recalcOrderTotal(item.order_id);

  revalidatePath(`/admin/orders/${item.order_id}`);
  return { ok: true, data: undefined };
}

export async function removeOrderItem(
  itemId: string,
): Promise<ActionResult> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();

  const { data: item } = await supabase
    .from("order_items")
    .select("order_id")
    .eq("id", itemId)
    .maybeSingle();

  if (!item) return { ok: false, error: "Item not found." };

  const { error } = await supabase
    .from("order_items")
    .delete()
    .eq("id", itemId);

  if (error) return { ok: false, error: "Could not remove item." };

  // Check if any items remain; if not, cancel the order
  const { data: remaining } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", item.order_id);

  if (!remaining || remaining.length === 0) {
    // Cancel the order and auto-available the table
    await cancelOrder(item.order_id);
  } else {
    await recalcOrderTotal(item.order_id);
  }

  revalidatePath(`/admin/orders/${item.order_id}`);
  return { ok: true, data: undefined };
}

export async function markBillPaid(orderId: string): Promise<ActionResult> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, table_id, table_session_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { ok: false, error: "Order not found." };

  const now = new Date().toISOString();

  await Promise.all([
    // Set table to AVAILABLE
    supabase.from("tables").update({ status: "AVAILABLE" }).eq("id", order.table_id),
    // Close the session
    supabase
      .from("table_sessions")
      .update({ status: "COMPLETED", ended_at: now })
      .eq("id", order.table_session_id)
      .is("ended_at", null),
    // Resolve any pending REQUEST_BILL waiter requests for this table
    supabase
      .from("waiter_requests")
      .update({ status: "RESOLVED", resolved_at: now })
      .eq("table_id", order.table_id)
      .eq("type", "REQUEST_BILL")
      .neq("status", "RESOLVED"),
  ]);

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/tables");
  return { ok: true, data: undefined };
}

/* ====================================================================== */
/* Tables grid view for admin orders page                                  */
/* ====================================================================== */

export interface TableWithOrder {
  id: string;
  name: string;
  seat_capacity: number;
  status: TableStatus;
  active_order_id: string | null;
  active_order_total_cents: number | null;
  active_order_item_count: number | null;
}

export async function getTablesForOrdersGrid(): Promise<ActionResult<TableWithOrder[]>> {
  const auth = await requireCapability("orders.manage");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();

  const [tablesRes, ordersRes] = await Promise.all([
    supabase.from("tables").select("*").order("name", { ascending: true }),
    supabase
      .from("orders")
      .select("id, table_id, total_cents, status")
      .eq("status", "PLACED"),
  ]);

  if (tablesRes.error) return { ok: false, error: "Could not load tables." };
  if (ordersRes.error) return { ok: false, error: "Could not load orders." };

  const orderByTable = new Map<string, { id: string; total_cents: number }>();
  for (const o of ordersRes.data ?? []) {
    if (!orderByTable.has(o.table_id)) {
      orderByTable.set(o.table_id, { id: o.id, total_cents: o.total_cents });
    }
  }

  const orderIds = [...orderByTable.values()].map((o) => o.id);
  const { data: itemsData } = await supabase
    .from("order_items")
    .select("order_id")
    .in("order_id", orderIds);

  const itemCountMap = new Map<string, number>();
  for (const item of itemsData ?? []) {
    itemCountMap.set(item.order_id, (itemCountMap.get(item.order_id) ?? 0) + 1);
  }

  const tables: TableWithOrder[] = (tablesRes.data ?? []).map((t) => {
    const activeOrder = orderByTable.get(t.id);
    return {
      id: t.id,
      name: t.name,
      seat_capacity: t.seat_capacity,
      status: t.status as TableStatus,
      active_order_id: activeOrder?.id ?? null,
      active_order_total_cents: activeOrder?.total_cents ?? null,
      active_order_item_count: activeOrder ? (itemCountMap.get(activeOrder.id) ?? 0) : null,
    };
  });

  return { ok: true, data: tables };
}
