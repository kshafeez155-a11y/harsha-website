type AdminIdentity = { app_metadata?: Record<string, unknown> };

type UserResponse = {
  data: { user: AdminIdentity | null };
  error: unknown;
};

type PermissionResponse = { data: unknown; error: unknown };

export type AdminAccessClient = {
  auth: {
    getUser(): PromiseLike<UserResponse>;
    refreshSession(): PromiseLike<{ error: unknown }>;
  };
  rpc(name: "is_admin"): PromiseLike<PermissionResponse>;
};

export const ADMIN_ACCESS_MESSAGES = {
  session: "Please sign in again to continue to the admin dashboard.",
  forbidden: "This account does not have administrator access.",
  unavailable: "We could not verify your administrator access. Please try again.",
} as const;

export type AdminAccessFailureReason = keyof typeof ADMIN_ACCESS_MESSAGES;

export type AdminAccessResult =
  { allowed: true } | { allowed: false; reason: AdminAccessFailureReason; message: string };

export function isAdminUser(user: AdminIdentity | null | undefined): boolean {
  return user?.app_metadata?.role === "admin";
}

export function isAdminAccessFailureReason(value: unknown): value is AdminAccessFailureReason {
  return value === "session" || value === "forbidden" || value === "unavailable";
}

function denied(reason: AdminAccessFailureReason): AdminAccessResult {
  return { allowed: false, reason, message: ADMIN_ACCESS_MESSAGES[reason] };
}

export async function checkAdminAccess(client: AdminAccessClient): Promise<AdminAccessResult> {
  try {
    const identity = await client.auth.getUser();
    if (identity.error || !identity.data.user) return denied("session");
    if (!isAdminUser(identity.data.user)) return denied("forbidden");

    const permission = await client.rpc("is_admin");
    if (!permission.error && permission.data === true) return { allowed: true };

    // Auth may return updated account metadata while the saved JWT still has
    // the previous role. Refresh once, then verify the database permission again.
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error) return denied("session");

    const refreshedIdentity = await client.auth.getUser();
    if (refreshedIdentity.error || !refreshedIdentity.data.user) return denied("session");
    if (!isAdminUser(refreshedIdentity.data.user)) return denied("forbidden");

    const refreshedPermission = await client.rpc("is_admin");
    if (refreshedPermission.error) return denied("unavailable");
    return refreshedPermission.data === true ? { allowed: true } : denied("forbidden");
  } catch {
    return denied("unavailable");
  }
}
