"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionForFeedback } from "@/lib/session";
import { getCurrentStaff } from "@/lib/auth";
import { feedbackSchema } from "@/lib/validations";
import type { ActionResult } from "./orders";

/**
 * Submit feedback. Feedback is gated on having at least one PLACED
 * order on the session.
 */
export async function submitFeedback(
  raw: unknown,
): Promise<ActionResult> {
  const verified = await getSessionForFeedback();
  if (!verified) {
    const staff = await getCurrentStaff();
    if (staff) {
      return { ok: false, error: "Feedback is only available from a table QR session." };
    }
    return { ok: false, error: "Session expired — please re-scan the QR code." };
  }

  const parsed = feedbackSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid feedback" };
  }

  const supabase = createAdminClient();

  // Gate: placed order on this session.
  const { data: placed } = await supabase
    .from("orders")
    .select("id")
    .eq("table_session_id", verified.session.id)
    .eq("status", "PLACED")
    .limit(1)
    .maybeSingle();
  if (!placed) {
    return { ok: false, error: "Feedback opens after your order is placed." };
  }

  // One feedback per session.
  const { data: existing } = await supabase
    .from("feedback")
    .select("id")
    .eq("table_session_id", verified.session.id)
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "Thank you — we already received your feedback." };
  }

  const { error } = await supabase.from("feedback").insert({
    table_session_id: verified.session.id,
    order_id: placed.id,
    food_rating: parsed.data.food_rating,
    service_rating: parsed.data.service_rating,
    comment: parsed.data.comment?.trim() || null,
  });

  if (error) return { ok: false, error: "Could not submit feedback. Try again." };

  revalidatePath(`/orders`);
  return { ok: true, data: undefined };
}
