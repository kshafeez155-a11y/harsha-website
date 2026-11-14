import type { SupabaseClient } from "@supabase/supabase-js";

export type DashboardSubmission = Record<string, unknown> & { source: string; type: string };

type DashboardSource = { table: string; type: string };

export async function loadDashboardData(
  client: Pick<SupabaseClient, "from">,
  sources: readonly DashboardSource[],
) {
  const results = await Promise.all(
    sources.map(async ({ table, type }) => {
      try {
        const result = await client
          .from(table)
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(5);

        if (result.error || result.count === null) {
          return { table, type, count: null, rows: [] as DashboardSubmission[], failed: true };
        }

        return {
          table,
          type,
          count: result.count,
          rows: (result.data ?? []).map((row) => ({
            ...row,
            source: table,
            type,
          })) as DashboardSubmission[],
          failed: false,
        };
      } catch {
        return { table, type, count: null, rows: [] as DashboardSubmission[], failed: true };
      }
    }),
  );

  return {
    counts: Object.fromEntries(results.map(({ table, count }) => [table, count])),
    submissions: results
      .flatMap(({ rows }) => rows)
      .sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at))
      .slice(0, 8),
    failedSources: results.filter(({ failed }) => failed).map(({ type }) => type),
  };
}

export function dateValue(value: unknown) {
  const time = Date.parse(String(value ?? ""));
  return Number.isNaN(time) ? 0 : time;
}
