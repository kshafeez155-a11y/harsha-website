import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAdminAccess, isAdminUser } from "./admin-access.ts";
import type { HubManager } from "./hub-management.ts";

export type StaffAccessResult =
  | { allowed: true; role: "admin" }
  | { allowed: true; role: "hub_manager"; manager: HubManager }
  | { allowed: false; reason: "session" | "forbidden" | "unavailable"; message: string };

export async function checkStaffAccess(client: SupabaseClient): Promise<StaffAccessResult> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user)
      return { allowed: false, reason: "session", message: "Please sign in to continue." };
    if (isAdminUser(data.user)) {
      const access = await checkAdminAccess(client);
      return access.allowed ? { allowed: true, role: "admin" } : access;
    }
    // Assignment is server-managed and read afresh; editable profile metadata
    // and a previously issued access token cannot grant or retain hub access.
    const membership = await client
      .from("hub_managers")
      .select("*")
      .eq("user_id", data.user.id)
      .eq("active", true)
      .maybeSingle();
    if (membership.error)
      return {
        allowed: false,
        reason: "unavailable",
        message:
          "Hub access could not be verified. Please try again or contact your administrator.",
      };
    if (
      !membership.data ||
      membership.data.active !== true ||
      membership.data.user_id !== data.user.id
    ) {
      return {
        allowed: false,
        reason: "forbidden",
        message: "This account has no active hub assignment. Contact your administrator.",
      };
    }
    return { allowed: true, role: "hub_manager", manager: membership.data as HubManager };
  } catch {
    return {
      allowed: false,
      reason: "unavailable",
      message: "Staff access could not be verified. Please try again.",
    };
  }
}
