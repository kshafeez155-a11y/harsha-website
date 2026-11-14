import { createSupabaseClients } from "./supabase-clients";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const { supabase, publicSupabase } = createSupabaseClients(supabaseUrl, supabaseAnonKey);

export async function verifySupabaseConnection() {
  const { error } = await supabase.auth.getSession();

  if (error) {
    console.error("[Supabase] Connection test failed:", error.message);
    return false;
  }

  console.info("[Supabase] Connection test passed");
  return true;
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  void verifySupabaseConnection();
}
