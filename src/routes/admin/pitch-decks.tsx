import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Eye,
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

export const Route = createFileRoute("/admin/pitch-decks")({
  beforeLoad: requireAdmin,
  component: PitchDeckSubmissionsPage,
});

type PitchDeckSubmission = Record<string, unknown> & { id?: string };
type Status = "pending" | "reviewed" | "approved" | "rejected";

const statuses: Status[] = ["pending", "reviewed", "approved", "rejected"];
const visibleColumns = [
  ["startup_name", "Startup"],
  ["founder_name", "Founder"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["startup_stage", "Stage"],
  ["industry", "Industry"],
] as const;

function getText(record: PitchDeckSubmission, key: string) {
  const value = record[key];
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

function getStatus(record: PitchDeckSubmission): Status {
  const value = getText(record, "status");
  return statuses.includes(value as Status) ? (value as Status) : "pending";
}

function PitchDeckSubmissionsPage() {
  const [submissions, setSubmissions] = useState<PitchDeckSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [selectedSubmission, setSelectedSubmission] = useState<PitchDeckSubmission | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpeningDeck, setIsOpeningDeck] = useState(false);

  const loadSubmissions = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("pitch_deck_submissions")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Admin pitch decks] Could not load submissions", error);
      setErrorMessage(error.message);
      setSubmissions([]);
    } else {
      setSubmissions((data ?? []) as PitchDeckSubmission[]);
      if (!selectedSubmission && (data ?? []).length > 0) {
        setSelectedSubmission((data ?? [])[0] as PitchDeckSubmission);
      }
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }, [selectedSubmission]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const filteredSubmissions = submissions.filter((submission) => {
    const searchText = search.trim().toLowerCase();
    const matchesSearch =
      !searchText ||
      [
        getText(submission, "startup_name"),
        getText(submission, "founder_name"),
        getText(submission, "email"),
        getText(submission, "phone"),
        getText(submission, "industry"),
        getText(submission, "description"),
      ].some((value) => value.toLowerCase().includes(searchText));

    const matchesStatus = statusFilter === "all" || getStatus(submission) === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function updateStatus(status: Status) {
    if (!selectedSubmission?.id || isUpdating) return;

    setIsUpdating(true);
    setNotice(null);
    setErrorMessage(null);

    const { data, error } = await supabase
      .from("pitch_deck_submissions")
      .update({ status })
      .eq("id", selectedSubmission.id)
      .select()
      .single();

    if (error) {
      console.error("[Admin pitch decks] Could not update status", error);
      setErrorMessage(`Status update failed: ${error.message}`);
    } else {
      const updated = data as PitchDeckSubmission;
      setSubmissions((current) =>
        current.map((submission) => (submission.id === updated.id ? updated : submission)),
      );
      setSelectedSubmission(updated);
      setNotice("Submission status updated successfully.");
    }

    setIsUpdating(false);
  }

  async function handleViewPitchDeck() {
    if (!selectedSubmission?.id) return;
    const pitchDeckPath = getText(selectedSubmission, "pitch_deck_path");
    if (!pitchDeckPath) {
      setErrorMessage("No pitch deck file is attached to this submission.");
      return;
    }

    setIsOpeningDeck(true);
    setErrorMessage(null);

    const { data, error } = await supabase.storage
      .from("pitch-decks")
      .createSignedUrl(pitchDeckPath, 60);

    if (error) {
      console.error("[Admin pitch decks] Could not create signed URL", error);
      setErrorMessage(`Could not open the pitch deck: ${error.message}`);
      setIsOpeningDeck(false);
      return;
    }

    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }

    setIsOpeningDeck(false);
  }

  async function deleteSubmission() {
    if (!selectedSubmission?.id || isDeleting) return;

    const confirmed = window.confirm(
      "Are you sure you want to permanently delete this pitch deck submission?",
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setNotice(null);
    setErrorMessage(null);

    const pitchDeckPath = getText(selectedSubmission, "pitch_deck_path");
    if (pitchDeckPath) {
      const { error: storageError } = await supabase.storage
        .from("pitch-decks")
        .remove([pitchDeckPath]);
      if (storageError) {
        console.error("[Admin pitch decks] Pitch deck cleanup failed", storageError);
        setErrorMessage(
          `Deletion failed: the pitch deck could not be removed from storage. ${storageError.message}`,
        );
        setIsDeleting(false);
        return;
      }
    }

    const { error } = await supabase
      .from("pitch_deck_submissions")
      .delete()
      .eq("id", selectedSubmission.id);

    if (error) {
      console.error("[Admin pitch decks] Could not delete submission", error);
      setErrorMessage(`Deletion failed: ${error.message}`);
    } else {
      setSubmissions((current) =>
        current.filter((submission) => submission.id !== selectedSubmission.id),
      );
      setSelectedSubmission((current) =>
        current && current.id === selectedSubmission.id ? null : current,
      );
      setNotice("Submission deleted successfully.");
    }

    setIsDeleting(false);
  }

  function refresh() {
    setNotice(null);
    void loadSubmissions();
  }

  return (
    <AdminShell
      title="Pitch Deck Submissions"
      description="Review pitch deck submissions submitted to Hanova."
    >
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
            Intake
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Pitch Deck Submissions</h1>
          <p className="mt-2 text-sm text-slate-500">{submissions.length} total submissions</p>
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
            <span className="sr-only">Search submissions</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search startup, founder, email..."
              className="h-11 w-full border border-slate-300 bg-slate-50 pl-10 pr-3 text-sm outline-none transition-colors focus:border-slate-600 focus:bg-white"
            />
          </label>

          <label className="relative flex min-w-40 items-center">
            <span className="sr-only">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as Status | "all")}
              className="h-11 w-full appearance-none border border-slate-300 bg-slate-50 pl-3 pr-9 text-sm outline-none transition-colors focus:border-slate-600 focus:bg-white"
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="pointer-events-none absolute right-3 text-slate-400"
            />
          </label>
        </div>

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 p-8 text-slate-600">
            <LoaderCircle size={18} className="animate-spin" />
            Loading pitch deck submissions...
          </div>
        ) : errorMessage ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 p-8 text-center">
            <CircleAlert size={32} className="text-rose-500" />
            <div>
              <p className="text-lg font-semibold text-slate-900">We could not load submissions</p>
              <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadSubmissions()}
              className="inline-flex items-center justify-center border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Retry
            </button>
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
            <FileText size={32} className="text-slate-300" />
            <div>
              <p className="text-lg font-semibold text-slate-900">
                No pitch deck submissions found
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Try adjusting your search or status filter.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-700">
                  {visibleColumns.map(([key, label]) => (
                    <th key={key} className="border-b border-slate-200 px-4 py-3 font-semibold">
                      {label}
                    </th>
                  ))}
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">Status</th>
                  <th className="border-b border-slate-200 px-4 py-3 font-semibold">Deck</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((submission) => (
                  <tr
                    key={submission.id as string}
                    onClick={() => setSelectedSubmission(submission)}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                      selectedSubmission?.id === submission.id ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    {visibleColumns.map(([key]) => (
                      <td key={key} className="border-b border-slate-200 px-4 py-3 align-top">
                        {getText(submission, key) || "—"}
                      </td>
                    ))}
                    <td className="border-b border-slate-200 px-4 py-3 align-top">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.03em] text-slate-700">
                        {getStatus(submission)}
                      </span>
                    </td>
                    <td className="border-b border-slate-200 px-4 py-3 align-top">
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {getText(submission, "pitch_deck_path") ? "Available" : "Not attached"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedSubmission && !isLoading && !errorMessage && (
        <section className="mt-8 border border-slate-200 bg-white p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                Selected submission
              </p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">
                {getText(selectedSubmission, "startup_name") || "Startup submission"}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {getText(selectedSubmission, "pitch_deck_path") && (
                <button
                  type="button"
                  onClick={() => void handleViewPitchDeck()}
                  disabled={isOpeningDeck}
                  className="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Eye size={15} />
                  {isOpeningDeck ? "Opening..." : "View pitch deck"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void deleteSubmission()}
                disabled={isDeleting}
                className="inline-flex items-center justify-center gap-2 border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={15} />
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["Founder", "founder_name"],
              ["Email", "email"],
              ["Phone", "phone"],
              ["Startup stage", "startup_stage"],
              ["Industry", "industry"],
              ["Created", "created_at"],
            ].map(([label, key]) => (
              <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-sm text-slate-800">
                  {key === "created_at"
                    ? getText(selectedSubmission, key)
                      ? new Date(getText(selectedSubmission, key)).toLocaleString()
                      : "—"
                    : getText(selectedSubmission, key) || "—"}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Description
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {getText(selectedSubmission, "description") || "No description provided."}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">Status:</span>
              <select
                value={getStatus(selectedSubmission)}
                onChange={(event) => void updateStatus(event.target.value as Status)}
                disabled={isUpdating}
                className="h-10 border border-slate-300 bg-white px-3 text-sm outline-none transition-colors focus:border-slate-600"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-sm text-slate-600">
              {getText(selectedSubmission, "pitch_deck_path")
                ? `Stored path: ${getText(selectedSubmission, "pitch_deck_path")}`
                : "No storage file attached"}
            </div>
          </div>
        </section>
      )}
    </AdminShell>
  );
}
