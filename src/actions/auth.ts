"use server";

import { createServerClientFromCookies } from "@/lib/supabase/server";
import type { ActionResult } from "./orders";

/**
 * Server-side login action. Authenticates with Supabase and writes auth
 * cookies directly into the response — guaranteeing downstream Server
 * Components (dashboard layout) see the session on the next request.
 */
export async function login(
  email: string,
  password: string,
): Promise<ActionResult> {
  if (!email || !password) {
    return { ok: false, error: "Please enter your email and password." };
  }

  const supabase = await createServerClientFromCookies();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}
