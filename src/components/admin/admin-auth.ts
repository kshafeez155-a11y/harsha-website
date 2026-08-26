import { redirect } from "@tanstack/react-router";

import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

function normalizeRole(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim().toLowerCase();
  }

  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string");
    return first ? normalizeRole(first) : null;
  }

  return null;
}

export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }

  const appRole = normalizeRole(user.app_metadata?.role ?? user.app_metadata?.roles);
  const userRole = normalizeRole(user.user_metadata?.role ?? user.user_metadata?.roles);
  if (appRole === "admin" || userRole === "admin") {
    return true;
  }

  const configuredAdmins = String(
    import.meta.env.VITE_ADMIN_EMAILS ?? import.meta.env.VITE_ADMIN_EMAIL ?? "",
  )
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return configuredAdmins.includes((user.email ?? "").trim().toLowerCase());
}

export async function requireAdmin() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !isAdminUser(data.user)) {
    throw redirect({ to: "/admin/login" });
  }
}
