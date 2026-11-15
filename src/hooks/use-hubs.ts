import { useQuery } from "@tanstack/react-query";

import { loadHubEvents, loadHubs } from "@/lib/hub-management";
import { publicSupabase } from "@/lib/supabase";

export function useHubs() {
  return useQuery({
    queryKey: ["hubs", "public"],
    queryFn: () => loadHubs(publicSupabase),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function useHubEvents(hubId?: string) {
  return useQuery({
    queryKey: ["hub-events", "public", hubId ?? "all"],
    queryFn: () => loadHubEvents(publicSupabase, { hubId, publishedOnly: true }),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function formatEventDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
