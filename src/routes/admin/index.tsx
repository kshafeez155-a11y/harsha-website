import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CalendarDays,
  FileText,
  Handshake,
  LoaderCircle,
  MessageSquare,
  Network,
  RefreshCw,
  Users,
} from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/components/admin/admin-auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/")({
  beforeLoad: requireAdmin,
  component: AdminPage,
});

const sources = [
  ["startup_registrations", "Startup applications", Building2, "/admin/startups"],
  ["chapter_applications", "Chapter applications", Network, "/admin/chapters"],
  ["community_join_applications", "Community applications", Users, "/admin/community"],
  ["event_registrations", "Event registrations", CalendarDays, "/admin/events"],
  ["meeting_registrations", "Meeting registrations", MessageSquare, "/admin/meetings"],
  ["partner_applications", "Partner applications", Handshake, "/admin/partners"],
  ["founder_connection_requests", "Founder connections", Users, "/admin/founder-connections"],
  ["pitch_deck_submissions", "Pitch deck submissions", FileText, "/admin/pitch-decks"],
  ["contact_submissions", "Contact submissions", MessageSquare, "/admin"],
] as const;

type Submission = Record<string, unknown> & { source: string; type: string };

function AdminPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const results = await Promise.all(
        sources.map(async ([table, type]) => {
          const result = await supabase
            .from(table)
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(5);
          return { table, type, ...result };
        }),
      );

      const failed = results.find((result) => result.error);
      if (failed?.error) {
        console.error("[Admin dashboard] Could not load submissions", failed.error);
        setErrorMessage(
          "Some submissions could not be loaded. Check the table read policies for the authenticated admin role.",
        );
      }

      setCounts(Object.fromEntries(results.map((result) => [result.table, result.count ?? 0])));
      setSubmissions(
        results
          .flatMap(
            (result) =>
              (result.data ?? []).map((row) => ({
                ...row,
                source: result.table,
                type: result.type,
              })) as Submission[],
          )
          .sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at))
          .slice(0, 8),
      );
    } catch (error) {
      console.error("[Admin dashboard] Could not load submissions", error);
      setErrorMessage("Submissions are temporarily unavailable. Please try again later.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <AdminShell
      title="Dashboard"
      description="Welcome back. Here is an overview of Hanova activity."
    >
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
            Overview
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Admin Dashboard</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={isRefreshing}
          className="inline-flex min-h-10 items-center gap-2 border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />
          {errorMessage ? "Retry" : "Refresh"}
        </button>
      </div>
      {errorMessage && (
        <div
          role="alert"
          className="mb-6 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          {errorMessage}
        </div>
      )}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Submission totals">
        {sources.map(([table, title, Icon, to], index) => (
          <a
            key={table}
            href={to}
            className="group border border-slate-200 bg-white p-5 shadow-[0_8px_24px_-20px_rgba(15,23,42,0.4)] transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-start justify-between">
              <span
                className={`grid size-10 place-items-center rounded-lg ${index % 3 === 0 ? "bg-[#e9f7a7] text-[#596a00]" : index % 3 === 1 ? "bg-sky-100 text-sky-700" : "bg-orange-100 text-orange-700"}`}
              >
                <Icon size={19} />
              </span>
              <ArrowUpRight
                size={17}
                className="text-slate-300 transition-colors group-hover:text-slate-700"
              />
            </div>
            <p className="mt-5 text-sm font-medium text-slate-500">{title}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">
              {isLoading ? (
                <LoaderCircle className="animate-spin text-slate-300" size={28} />
              ) : (
                (counts[table] ?? 0)
              )}
            </p>
          </a>
        ))}
      </section>
      <section className="mt-10 border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold">Recent submissions</h2>
            <p className="mt-1 text-sm text-slate-500">The latest activity across Hanova forms.</p>
          </div>
          <Activity size={20} className="text-[#7d9400]" />
        </div>
        {isLoading ? (
          <div className="flex items-center gap-3 px-5 py-10 text-sm text-slate-500 sm:px-6">
            <LoaderCircle className="animate-spin" size={18} /> Loading submissions...
          </div>
        ) : submissions.length === 0 ? (
          <p className="px-5 py-10 text-sm text-slate-500 sm:px-6">No submissions found.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {submissions.map((submission, index) => (
              <div
                key={`${submission.source}-${String(submission.id ?? index)}`}
                className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_1fr_140px_100px] sm:items-center sm:px-6"
              >
                <div>
                  <p className="font-semibold">{displayName(submission)}</p>
                  <p className="text-xs text-slate-500">{submission.type}</p>
                </div>
                <p className="truncate text-sm text-slate-600">{displayEmail(submission)}</p>
                <p className="text-sm text-slate-500">{formatDate(submission.created_at)}</p>
                <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
                  {String(submission.status ?? "received")}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}

function dateValue(value: unknown) {
  const time = Date.parse(String(value ?? ""));
  return Number.isNaN(time) ? 0 : time;
}
function formatDate(value: unknown) {
  const time = dateValue(value);
  return time
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
        time,
      )
    : "Unknown date";
}
function displayName(row: Submission) {
  return String(
    row.startup_name ??
      row.founder_name ??
      row.contact_name ??
      row.organization ??
      row.name ??
      "Unnamed submission",
  );
}
function displayEmail(row: Submission) {
  return String(row.email ?? row.contact_email ?? "No email provided");
}
