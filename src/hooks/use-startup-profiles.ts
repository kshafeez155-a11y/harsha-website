import { useQuery } from "@tanstack/react-query";
import { publicSupabase } from "@/lib/supabase";
import { loadStartupProfiles, STARTUP_PROFILES_QUERY_KEY } from "@/lib/startup-profiles";

export function useStartupProfiles() {
  return useQuery({
    queryKey: STARTUP_PROFILES_QUERY_KEY,
    queryFn: () => loadStartupProfiles(publicSupabase, { publishedOnly: true }),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
