type Settings = { url: string; anonKey: string; serviceKey: string };

// The service key stays in the Edge Function environment. Callers must pass
// their own verified owner session; assignment runs with that session's RLS.
export function createManagerInvitationHandler(
  settings: Settings,
  requestFetch: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    };
    const reply = (status: number, body: object) =>
      new Response(JSON.stringify(body), { status, headers: cors });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { error: "Use POST." });
    if (!settings.url || !settings.anonKey || !settings.serviceKey)
      return reply(503, {
        error:
          "Manager account setup is not configured. Ask the site administrator to check the Edge Function environment.",
      });
    const token = request.headers.get("Authorization");
    if (!token?.startsWith("Bearer "))
      return reply(401, { error: "Sign in as the owner to assign a manager." });
    const userHeaders = {
      apikey: settings.anonKey,
      Authorization: token,
      "Content-Type": "application/json",
    };
    const adminHeaders = {
      apikey: settings.serviceKey,
      Authorization: `Bearer ${settings.serviceKey}`,
      "Content-Type": "application/json",
    };
    try {
      const identity = await requestFetch(`${settings.url}/auth/v1/user`, { headers: userHeaders });
      if (!identity.ok) return reply(401, { error: "Your session expired. Sign in again." });
      const permission = await requestFetch(`${settings.url}/rest/v1/rpc/is_admin`, {
        method: "POST",
        headers: userHeaders,
        body: "{}",
      });
      if (!permission.ok || (await permission.json()) !== true)
        return reply(403, { error: "Only the owner can assign hub managers." });
      const body = await request.json().catch(() => null);
      const rawPassword = typeof body?.password === "string" ? body.password : "";
      if (
        !body ||
        typeof body.hub_id !== "string" ||
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(body.hub_id) ||
        typeof body.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
        typeof body.display_name !== "string" ||
        !body.display_name.trim() ||
        body.display_name.length > 150 ||
        body.email.length > 254 ||
        (rawPassword && (rawPassword.length < 8 || rawPassword.length > 128))
      ) {
        return reply(400, {
          error:
            "Choose a hub and provide a valid manager name, email, and password (at least 8 characters).",
        });
      }
      const assignment = {
        p_hub_id: body.hub_id,
        p_email: body.email.trim().toLowerCase(),
        p_display_name: body.display_name.trim(),
      };
      const assign = () =>
        requestFetch(`${settings.url}/rest/v1/rpc/assign_hub_manager`, {
          method: "POST",
          headers: userHeaders,
          body: JSON.stringify(assignment),
        });
      const first = await assign();
      if (first.ok) {
        const assignedRecord = await first.json().catch(() => null);
        if (rawPassword && assignedRecord && typeof assignedRecord.user_id === "string") {
          const updated = await requestFetch(
            `${settings.url}/auth/v1/admin/users/${encodeURIComponent(assignedRecord.user_id)}`,
            {
              method: "PUT",
              headers: adminHeaders,
              body: JSON.stringify({
                password: rawPassword,
                email_confirm: true,
                user_metadata: { display_name: assignment.p_display_name },
              }),
            },
          );
          if (!updated.ok) {
            return reply(502, {
              error:
                "The manager was assigned, but their password could not be updated. Please try setting the password again.",
            });
          }
          return reply(200, { created: false, passwordUpdated: true });
        }
        return reply(200, { created: false, passwordUpdated: false });
      }
      const initialError = await first.json().catch(() => ({}));
      if (initialError.code !== "P0002")
        return reply(400, { error: initialError.message || "This hub could not be assigned." });
      if (!rawPassword) {
        return reply(400, {
          error: "Enter a password (at least 8 characters) to create this new manager account.",
        });
      }
      const created = await requestFetch(`${settings.url}/auth/v1/admin/users`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          email: assignment.p_email,
          password: rawPassword,
          email_confirm: true,
          user_metadata: { display_name: assignment.p_display_name },
        }),
      });
      if (!created.ok)
        return reply(502, {
          error:
            "The manager account could not be created in Supabase Auth. Check the email and password and retry.",
        });
      const final = await assign();
      if (!final.ok)
        return reply(409, {
          error:
            "The account was created in Supabase, but hub assignment failed. Click Save again to complete assignment.",
        });
      return reply(200, { created: true, passwordUpdated: true });
    } catch {
      return reply(503, {
        error: "Manager account setup is temporarily unavailable. Please retry.",
      });
    }
  };
}
