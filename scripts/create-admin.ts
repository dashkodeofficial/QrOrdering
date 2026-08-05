/**
 * Creates an admin auth user + staff record in Supabase.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env manually (no external deps) ──────────────────────────────
const envPath = resolve(__dirname, "..", ".env");
const envFile = readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envFile.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

// ── Config ──────────────────────────────────────────────────────────────
const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NAME = "Admin";

// ── Script ──────────────────────────────────────────────────────────────
async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Creating admin user: ${ADMIN_EMAIL}`);

  // 1. Check if auth user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existing = existingUsers?.users?.find((u) => u.email === ADMIN_EMAIL);

  let userId: string;

  if (existing) {
    userId = existing.id;
    console.log(`Auth user already exists: ${userId}`);
  } else {
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });

    if (authErr || !authData?.user) {
      console.error("Failed to create auth user:", authErr?.message);
      process.exit(1);
    }

    userId = authData.user.id;
    console.log(`Auth user created: ${userId}`);
  }

  // 2. Check if staff record already exists
  const { data: existingStaff } = await supabase
    .from("staff")
    .select("id, user_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingStaff) {
    console.log(`Staff record already exists: ${existingStaff.id} (role: ${existingStaff.role})`);

    // Update role to ADMIN if it's not already
    if (existingStaff.role !== "ADMIN") {
      const { error } = await supabase
        .from("staff")
        .update({ role: "ADMIN", active: true })
        .eq("id", existingStaff.id);

      if (error) {
        console.error("Failed to update staff role:", error.message);
      } else {
        console.log(`Updated role to ADMIN`);
      }
    }
  } else {
    const { data: staffData, error: staffErr } = await supabase
      .from("staff")
      .insert({
        user_id: userId,
        full_name: ADMIN_NAME,
        role: "ADMIN",
        active: true,
      })
      .select("id")
      .single();

    if (staffErr) {
      console.error("Failed to create staff record:", staffErr.message);
      process.exit(1);
    }

    console.log(`Staff record created: ${staffData.id}`);
  }

  console.log("\n✅ Admin ready!");
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
}

main().catch(console.error);
