import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/components/admin/admin-auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/startups")({
  beforeLoad: requireAdmin,
  component: StartupApplicationsPage,
});

type StartupApplication = Record<string, unknown> & { id?: string };
type Status = "pending" | "reviewed" | "approved" | "rejected";

const statuses: Status[] = ["pending", "reviewed", "approved", "rejected"];
const visibleColumns = [
  ["startup_name", "Startup / company"],
  ["founder_name", "Founder"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["city", "City / location"],
  ["startup_stage", "Stage"],
] as const;

function StartupApplicationsPage() {
  const [applications, setApplications] = useState<StartupApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [selectedApplication, setSelectedApplication] = useState<StartupApplication | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function loadApplications() {
    setIsRefreshing(true);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from("startup_registrations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin startups] Could not load applications", error);
      setErrorMessage(error.message);
      setApplications([]);
    } else {
      setApplications((data ?? []) as StartupApplication[]);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }

  useEffect(() => {
    void loadApplications();
  }, []);

  const filteredApplications = applications.filter((application) => {
    const searchText = search.trim().toLowerCase();
    const matchesSearch =
      !searchText ||
      [
        getText(application, "startup_name"),
        getText(application, "company_name"),
        getText(application, "founder_name"),
        getText(application, "email"),
        getText(application, "phone"),
        getText(application, "city"),
        getText(application, "location"),
      ].some((value) => value.toLowerCase().includes(searchText));
    const matchesStatus = statusFilter === "all" || getStatus(application) === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function updateStatus(status: Status) {
    if (!selectedApplication?.id || isUpdating) return;
    setIsUpdating(true);
    setNotice(null);
    setErrorMessage(null);
    const { data, error } = await supabase
      .from("startup_registrations")
      .update({ status })
      .eq("id", selectedApplication.id)
      .select()
      .single();

    if (error) {
      console.error("[Admin startups] Could not update status", error);
      setErrorMessage(`Status update failed: ${error.message}`);
    } else {
      const updated = data as StartupApplication;
      setApplications((current) =>
        current.map((application) => (application.id === updated.id ? updated : application)),
      );
      setSelectedApplication(updated);
      setNotice("Application status updated successfully.");
    }
    setIsUpdating(false);
  }

  async function deleteApplication() {
    if (!selectedApplication?.id || isDeleting) return;
    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this startup application?",
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setNotice(null);
    setErrorMessage(null);
    const pitchDeckPath = getText(selectedApplication, "pitch_deck_path");
    if (pitchDeckPath) {
      const { error: storageError } = await supabase.storage
        .from("pitch-decks")
        .remove([pitchDeckPath]);
      if (storageError) {
        console.error("[Admin startups] Pitch deck cleanup failed", storageError);
        setErrorMessage(`Deletion failed: pitch deck cleanup was blocked. ${storageError.message}`);
        setIsDeleting(false);
        return;
      }
    }
    const { error } = await supabase
      .from("startup_registrations")
      .delete()
      .eq("id", selectedApplication.id);

    if (error) {
      console.error("[Admin startups] Could not delete application", error);
      setErrorMessage(`Deletion failed: ${error.message}`);
    } else {
      setApplications((current) =>
        current.filter((application) => application.id !== selectedApplication.id),
      );
      setSelectedApplication(null);
      setNotice("Application deleted successfully.");
    }
    setIsDeleting(false);
  }

  function refresh() {
    setNotice(null);
    void loadApplications();
  }

  return (
    <AdminShell
      title="Startup Applications"
      description="Review and manage startup applications submitted to Hanova."
    >
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
            Intake
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Startup Applications</h1>
          <p className="mt-2 text-sm text-slate-500">{applications.length} total applications</p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {notice && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <Check size={17} />
          {notice}
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
            className="ml-auto p-1"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {errorMessage && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <CircleAlert className="mt-0.5 shrink-0" size={17} />
          <span>{errorMessage}</span>
        </div>
      )}

      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block min-w-0 flex-1 sm:max-w-md">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-3.5 text-slate-400"
            />
            <span className="sr-only">Search applications</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search startups, founders, email..."
              className="h-11 w-full border border-slate-300 bg-slate-50 pl-10 pr-3 text-sm outline-none transition-colors focus:border-slate-600 focus:bg-white"
            />
          </label>
          <label className="relative flex min-w-40 items-center">
            <span className="sr-only">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as Status | "all")}
              className="h-11 w-full appearance-none border border-slate-300 bg-white px-3 pr-9 text-sm font-medium capitalize outline-none focus:border-slate-600"
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3 text-slate-500"
            />
          </label>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 px-5 py-16 text-sm text-slate-500">
            <LoaderCircle className="animate-spin" size={19} /> Loading applications...
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <FileText className="mx-auto text-slate-300" size={30} />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {applications.length === 0
                ? "No startup applications yet"
                : "No applications match your filters"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {applications.length === 0
                ? "New submissions will appear here."
                : "Try a different search or status."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {visibleColumns.map(([, label]) => (
                    <th key={label} className="px-4 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Submitted</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApplications.map((application, index) => (
                  <tr key={application.id ?? index} className="transition-colors hover:bg-slate-50">
                    <td className="max-w-48 truncate px-4 py-4 font-semibold text-slate-900">
                      {getText(application, "startup_name", "company_name") || "Unnamed startup"}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {getText(application, "founder_name", "founder") || "Not provided"}
                    </td>
                    <td className="max-w-52 truncate px-4 py-4 text-slate-600">
                      {getText(application, "email") || "Not provided"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getText(application, "phone") || "Not provided"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getText(application, "city", "location") || "Not provided"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getText(application, "startup_stage", "stage") || "Not provided"}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={getStatus(application)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                      {formatDate(application.created_at)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedApplication(application);
                          setNotice(null);
                          setErrorMessage(null);
                        }}
                        className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedApplication && (
        <ApplicationDetails
          application={selectedApplication}
          isUpdating={isUpdating}
          isDeleting={isDeleting}
          onClose={() => setSelectedApplication(null)}
          onStatusChange={updateStatus}
          onDelete={deleteApplication}
        />
      )}
    </AdminShell>
  );
}

function ApplicationDetails({
  application,
  isUpdating,
  isDeleting,
  onClose,
  onStatusChange,
  onDelete,
}: {
  application: StartupApplication;
  isUpdating: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onStatusChange: (status: Status) => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-details-title"
        className="max-h-[92vh] w-full overflow-y-auto bg-white shadow-2xl sm:max-w-3xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
              Application details
            </p>
            <h2 id="application-details-title" className="mt-1 text-2xl font-bold">
              {getText(application, "startup_name", "company_name") || "Unnamed startup"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Submitted {formatDate(application.created_at)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={20} />
          </button>
        </header>
        <div className="space-y-7 px-5 py-6 sm:px-7">
          <div>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
              Status
            </h3>
            <div className="flex flex-wrap gap-2">
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={isUpdating || getStatus(application) === status}
                  onClick={() => onStatusChange(status)}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium capitalize transition-colors disabled:cursor-not-allowed ${getStatus(application) === status ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600 hover:border-slate-900"}`}
                >
                  {isUpdating && getStatus(application) !== status ? "Updating..." : status}
                </button>
              ))}
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {Object.entries(application)
              .filter(([key]) => key !== "id")
              .map(([key, value]) => (
                <DetailField key={key} label={labelFor(key)} value={value} />
              ))}
          </dl>
        </div>
        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 size={16} />
            {isDeleting ? "Deleting..." : "Delete application"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: unknown }) {
  const text = formatValue(value);
  const isUrl = typeof value === "string" && /^https?:\/\//.test(value);
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
        {isUrl ? (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sky-700 underline underline-offset-2"
          >
            {text}
            <ExternalLink size={13} />
          </a>
        ) : (
          text
        )}
      </dd>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
      {status}
    </span>
  );
}

function getText(row: StartupApplication, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
}

function getStatus(row: StartupApplication): Status {
  const value = getText(row, "status").toLowerCase();
  return statuses.includes(value as Status) ? (value as Status) : "pending";
}

function formatDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
        date,
      );
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function labelFor(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
