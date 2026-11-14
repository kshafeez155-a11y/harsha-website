import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  CircleAlert,
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

export const Route = createFileRoute("/admin/chapters")({
  ssr: false,
  beforeLoad: requireAdmin,
  component: ChapterApplicationsPage,
});
type Application = Record<string, unknown> & { id?: string };
type Status = "pending" | "reviewed" | "approved" | "rejected";
const statuses: Status[] = ["pending", "reviewed", "approved", "rejected"];
const columns = [
  "Applicant",
  "Email",
  "Phone",
  "Organization",
  "City",
  "Profession",
  "Status",
  "Submitted",
  "Action",
];

function ChapterApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [selected, setSelected] = useState<Application | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setRefreshing(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("chapter_applications")
      .select("*")
      .order("created_at", { ascending: false });
    if (loadError) {
      console.error("[Admin chapters] Load failed", loadError);
      setError(`Loading failed: ${loadError.message}`);
      setApplications([]);
    } else setApplications((data ?? []) as Application[]);
    setLoading(false);
    setRefreshing(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const filtered = applications.filter((application) => {
    const text = query.trim().toLowerCase();
    const matches =
      !text ||
      ["name", "email", "phone", "city", "district", "organization", "profession", "linkedin"].some(
        (key) => getText(application, key).toLowerCase().includes(text),
      );
    return matches && (filter === "all" || status(application) === filter);
  });

  async function changeStatus(nextStatus: Status) {
    if (!selected?.id || updating) return;
    setUpdating(true);
    setNotice(null);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("chapter_applications")
      .update({ status: nextStatus })
      .eq("id", selected.id)
      .select()
      .single();
    if (updateError) {
      console.error("[Admin chapters] Status update failed", updateError);
      setError(`Status update failed: ${updateError.message}`);
    } else {
      const updated = data as Application;
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelected(updated);
      setNotice("Application status updated successfully.");
    }
    setUpdating(false);
  }

  async function remove() {
    if (
      !selected?.id ||
      deleting ||
      !window.confirm("Are you sure you want to permanently delete this chapter application?")
    )
      return;
    setDeleting(true);
    setNotice(null);
    setError(null);
    const { error: deleteError } = await supabase
      .from("chapter_applications")
      .delete()
      .eq("id", selected.id);
    if (deleteError) {
      console.error("[Admin chapters] Delete failed", deleteError);
      setError(`Deletion failed: ${deleteError.message}`);
    } else {
      setApplications((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      setNotice("Application deleted successfully.");
    }
    setDeleting(false);
  }

  return (
    <AdminShell
      title="Chapter Applications"
      description="Review and manage chapter applications submitted to Hanova."
    >
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
            Community leadership
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Chapter Applications</h1>
          <p className="mt-2 text-sm text-slate-500">{applications.length} total applications</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
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
            className="ml-auto"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <CircleAlert size={17} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      <section className="border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:justify-between">
          <label className="relative block flex-1 sm:max-w-md">
            <Search size={17} className="absolute left-3 top-3.5 text-slate-400" />
            <span className="sr-only">Search chapter applications</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search applicants, organization, city..."
              className="h-11 w-full border border-slate-300 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-slate-600 focus:bg-white"
            />
          </label>
          <label className="relative min-w-40">
            <span className="sr-only">Filter by status</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as Status | "all")}
              className="h-11 w-full appearance-none border border-slate-300 bg-white px-3 pr-9 text-sm capitalize outline-none"
            >
              <option value="all">All statuses</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3 top-3 text-slate-500"
            />
          </label>
        </div>
        {loading ? (
          <div className="flex justify-center gap-3 px-5 py-16 text-sm text-slate-500">
            <LoaderCircle className="animate-spin" size={19} />
            Loading applications...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <FileText className="mx-auto text-slate-300" size={30} />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {applications.length
                ? "No applications match your filters"
                : "No chapter applications yet"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className={`px-4 py-3 font-semibold ${column === "Action" ? "text-right" : ""}`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((application, index) => (
                  <tr key={application.id ?? index} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-semibold">
                      {getText(application, "name") || "Unnamed applicant"}
                    </td>
                    <td className="max-w-48 truncate px-4 py-4 text-slate-600">
                      {getText(application, "email") || "Not provided"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getText(application, "phone") || "Not provided"}
                    </td>
                    <td className="max-w-44 truncate px-4 py-4 text-slate-600">
                      {getText(application, "organization") || "Not provided"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getText(application, "city", "district") || "Not provided"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getText(application, "profession") || "Not provided"}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge value={status(application)} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                      {formatDate(application.created_at)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(application);
                          setError(null);
                          setNotice(null);
                        }}
                        className="font-semibold underline decoration-slate-300 underline-offset-4"
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
      {selected && (
        <Details
          application={selected}
          updating={updating}
          deleting={deleting}
          onClose={() => setSelected(null)}
          onStatus={changeStatus}
          onDelete={remove}
        />
      )}
    </AdminShell>
  );
}

function Details({
  application,
  updating,
  deleting,
  onClose,
  onStatus,
  onDelete,
}: {
  application: Application;
  updating: boolean;
  deleting: boolean;
  onClose: () => void;
  onStatus: (value: Status) => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="chapter-details"
        className="max-h-[92vh] w-full overflow-y-auto bg-white shadow-2xl sm:max-w-3xl"
      >
        <header className="sticky top-0 z-10 flex justify-between border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
              Application details
            </p>
            <h2 id="chapter-details" className="mt-1 text-2xl font-bold">
              {getText(application, "name") || "Unnamed applicant"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Submitted {formatDate(application.created_at)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close details"
            onClick={onClose}
            className="p-2 text-slate-500"
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
              {statuses.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={updating || status(application) === value}
                  onClick={() => onStatus(value)}
                  className={`rounded-full border px-3 py-1.5 text-sm capitalize disabled:cursor-not-allowed ${status(application) === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-600"}`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {Object.entries(application)
              .filter(([key]) => key !== "id")
              .map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {label(key)}
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
                    {formatValue(value)}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-5 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-rose-200 px-4 text-sm font-semibold text-rose-700 disabled:opacity-60"
          >
            <Trash2 size={16} />
            {deleting ? "Deleting..." : "Delete application"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 bg-slate-950 px-5 text-sm font-semibold text-white"
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
function StatusBadge({ value }: { value: Status }) {
  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">
      {value}
    </span>
  );
}
function getText(row: Application, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
}
function status(row: Application): Status {
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
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
