"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/lib/auth";
import type { ActionResult } from "./orders";
import type { Order, OrderItem, RestaurantTable } from "@/lib/types/db";

export interface OrderWithItems extends Order {
  items: OrderItem[];
  table_name?: string;
}

export async function getTables(): Promise<ActionResult<RestaurantTable[]>> {
  const auth = await requireCapability("tables.view");
  if (!auth.ok) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tables")
    .select("*")
    .order("name", { ascending: true });

  if (error) return { ok: false, error: "Could not load tables." };
  return { ok: true, data: data ?? [] };
}
