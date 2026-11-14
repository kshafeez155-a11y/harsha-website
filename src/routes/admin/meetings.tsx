import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarCheck2,
  Check,
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

export const Route = createFileRoute("/admin/meetings")({
  ssr: false,
  beforeLoad: requireAdmin,
  component: MeetingRegistrationsPage,
});
type Registration = Record<string, unknown> & { id?: string };

function MeetingRegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Registration | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setRefreshing(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("meeting_registrations")
      .select("*")
      .order("created_at", { ascending: false });
    if (loadError) {
      console.error("[Admin meetings] Load failed", loadError);
      setError(`Loading failed: ${loadError.message}`);
      setRegistrations([]);
    } else setRegistrations((data ?? []) as Registration[]);
    setLoading(false);
    setRefreshing(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const filtered = registrations.filter((registration) => {
    const text = query.trim().toLowerCase();
    return (
      !text ||
      ["name", "email", "phone", "city", "role", "purpose"].some((key) =>
        getText(registration, key).toLowerCase().includes(text),
      )
    );
  });

  async function remove() {
    if (
      !selected?.id ||
      deleting ||
      !window.confirm("Are you sure you want to permanently delete this meeting registration?")
    )
      return;
    setDeleting(true);
    setNotice(null);
    setError(null);
    const { error: deleteError } = await supabase
      .from("meeting_registrations")
      .delete()
      .eq("id", selected.id);
    if (deleteError) {
      console.error("[Admin meetings] Delete failed", deleteError);
      setError(`Deletion failed: ${deleteError.message}`);
    } else {
      setRegistrations((current) => current.filter((item) => item.id !== selected.id));
      setSelected(null);
      setNotice("Registration deleted successfully.");
    }
    setDeleting(false);
  }

  return (
    <AdminShell
      title="Meeting Registrations"
      description="Review and manage meeting registrations submitted to Hanova."
    >
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
            Meetings
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Meeting Registrations</h1>
          <p className="mt-2 text-sm text-slate-500">{registrations.length} total registrations</p>
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
        <div className="border-b border-slate-200 p-4">
          <label className="relative block min-w-0 sm:max-w-md">
            <Search size={17} className="absolute left-3 top-3.5 text-slate-400" />
            <span className="sr-only">Search meeting registrations</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search names, email, city, role..."
              className="h-11 w-full border border-slate-300 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-slate-600 focus:bg-white"
            />
          </label>
        </div>
        {loading ? (
          <div className="flex justify-center gap-3 px-5 py-16 text-sm text-slate-500">
            <LoaderCircle className="animate-spin" size={19} />
            Loading registrations...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <CalendarCheck2 className="mx-auto text-slate-300" size={30} />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {registrations.length
                ? "No registrations match your search"
                : "No meeting registrations yet"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {[
                    "Registrant",
                    "Email",
                    "Phone",
                    "City",
                    "Role",
                    "Purpose",
                    "Submitted",
                    "Action",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className={`px-4 py-3 font-semibold ${heading === "Action" ? "text-right" : ""}`}
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((registration, index) => (
                  <tr key={registration.id ?? index} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-semibold">
                      {getText(registration, "name") || "Unnamed registrant"}
                    </td>
                    <td className="max-w-48 truncate px-4 py-4 text-slate-600">
                      {getText(registration, "email") || "Not provided"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getText(registration, "phone") || "Not provided"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getText(registration, "city") || "Not provided"}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {getText(registration, "role") || "Not provided"}
                    </td>
                    <td className="max-w-52 truncate px-4 py-4 text-slate-600">
                      {getText(registration, "purpose") || "Not provided"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-500">
                      {formatDate(registration.created_at)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(registration);
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
          registration={selected}
          deleting={deleting}
          onClose={() => setSelected(null)}
          onDelete={remove}
        />
      )}
    </AdminShell>
  );
}

function Details({
  registration,
  deleting,
  onClose,
  onDelete,
}: {
  registration: Registration;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-details"
        className="max-h-[92vh] w-full overflow-y-auto bg-white shadow-2xl sm:max-w-2xl"
      >
        <header className="sticky top-0 z-10 flex justify-between border-b border-slate-200 bg-white px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
              Registration details
            </p>
            <h2 id="meeting-details" className="mt-1 text-2xl font-bold">
              {getText(registration, "name") || "Unnamed registrant"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Submitted {formatDate(registration.created_at)}
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
        <dl className="grid gap-x-6 gap-y-5 px-5 py-6 sm:grid-cols-2 sm:px-7">
          {Object.entries(registration)
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
        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-5 sm:flex-row sm:justify-between sm:px-7">
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-rose-200 px-4 text-sm font-semibold text-rose-700 disabled:opacity-60"
          >
            <Trash2 size={16} />
            {deleting ? "Deleting..." : "Delete registration"}
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
function getText(row: Registration, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
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
