import { redirect } from "@tanstack/react-router";

import { checkAdminAccess, type AdminAccessResult } from "@/lib/admin-access";
import { supabase } from "@/lib/supabase";
import { checkStaffAccess } from "@/lib/staff-access";

export { isAdminUser } from "@/lib/admin-access";

export function verifyAdminAccess(): Promise<AdminAccessResult> {
  return checkAdminAccess(supabase);
}

export function verifyStaffAccess() {
  return checkStaffAccess(supabase);
}

export async function requireHubManager() {
  const access = await verifyStaffAccess();
  if (!access.allowed) {
    throw redirect({ to: "/admin/login", search: { access: access.reason }, reloadDocument: true });
  }
  if (access.role === "admin") throw redirect({ to: "/admin" });
  return { hubManager: access.manager };
}

export async function requireAdmin() {
  const access = await verifyAdminAccess();

  if (!access.allowed) {
    throw redirect({
      to: "/admin/login",
      search: { access: access.reason },
      reloadDocument: true,
    });
  }
}
