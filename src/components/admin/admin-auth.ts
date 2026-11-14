import { redirect } from "@tanstack/react-router";

import { checkAdminAccess, type AdminAccessResult } from "@/lib/admin-access";
import { supabase } from "@/lib/supabase";

export { isAdminUser } from "@/lib/admin-access";

export function verifyAdminAccess(): Promise<AdminAccessResult> {
  return checkAdminAccess(supabase);
}

export async function requireAdmin() {
  const access = await verifyAdminAccess();

  if (!access.allowed) {
    throw redirect({ to: "/admin/login", search: { access: access.reason } });
  }
}
