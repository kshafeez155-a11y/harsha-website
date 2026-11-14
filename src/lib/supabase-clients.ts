import { createClient, type SupabaseClientOptions } from "@supabase/supabase-js";

export function createSupabaseClients(
  url: string,
  anonKey: string,
  options: SupabaseClientOptions<"public"> = {},
) {
  const supabase = createClient(url, anonKey, options);
  // Public intake policies use the anon role, even when an administrator is signed in.
  const publicSupabase = createClient(url, anonKey, {
    auth: {
      storageKey: "hanova-public-intake",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: options.global?.fetch },
  });

  return { supabase, publicSupabase };
}
