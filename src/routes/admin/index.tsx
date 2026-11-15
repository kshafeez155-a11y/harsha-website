import { useCallback, useEffect, useRef, useState } from "react";
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
import { requireAdmin, verifyAdminAccess } from "@/components/admin/admin-auth";
import { dateValue, loadDashboardData, type DashboardSubmission } from "@/lib/admin-dashboard";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/")({
  ssr: false,
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
  ["contact_submissions", "Contact submissions", MessageSquare, "/admin/messages"],
] as const;

type Submission = DashboardSubmission;

function AdminPage() {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadDashboard = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const access = await verifyAdminAccess();
      if (!access.allowed) {
        setCounts({});
        setSubmissions([]);
        setErrorMessage(access.message);
        return;
      }

      const result = await loadDashboardData(
        supabase,
        sources.map(([table, type]) => ({ table, type })),
      );
      setCounts(result.counts);
      setSubmissions(result.submissions);
      if (result.failedSources.length) {
        setErrorMessage(
          `Could not load: ${result.failedSources.join(", ")}. Please refresh to retry.`,
        );
      }
    } catch (error) {
      console.error("[Admin dashboard] Could not load submissions", error);
      setCounts({});
      setSubmissions([]);
      setErrorMessage("Submissions are temporarily unavailable. Please try again later.");
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadDashboard();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const interval = window.setInterval(refreshWhenVisible, 30000);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
    };
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
      <a
        href="/admin/hubs"
        className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-lime-200 bg-lime-50 p-5"
      >
        <span>
          <span className="block text-lg font-bold text-slate-950">Manage regional hubs</span>
          <span className="mt-1 block text-sm text-slate-600">
            Assign local managers, review hub activity and route unassigned requests.
          </span>
        </span>
        <span className="inline-flex items-center gap-2 text-sm font-bold text-[#596a00]">
          Hub Management <ArrowUpRight size={17} />
        </span>
      </a>
      <a
        href="/admin/portfolio"
        className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-5"
      >
        <span>
          <span className="block text-lg font-bold text-slate-950">Manage website startups</span>
          <span className="mt-1 block text-sm text-slate-600">
            Add startups, change photos and details, and publish them on your founder wall.
          </span>
        </span>
        <span className="inline-flex items-center gap-2 text-sm font-bold text-blue-700">
          Manage Startups <ArrowUpRight size={17} />
        </span>
      </a>
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
              ) : counts[table] == null ? (
                <span className="text-base font-medium text-slate-500">Unavailable</span>
              ) : (
                counts[table]
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
          <p className="px-5 py-10 text-sm text-slate-500 sm:px-6">
            {errorMessage ? "Recent submissions could not be loaded." : "No submissions found."}
          </p>
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
