import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  updateHubSubmission,
  type HubSubmission,
  type ScopedSubmissionTable,
} from "@/lib/hub-management";
import { supabase } from "@/lib/supabase";
import {
  buttonClass,
  errorText,
  fieldClass,
  Field,
  formatDate,
  Notice,
  panelClass,
  secondaryButtonClass,
  StatusBadge,
} from "./shared";

const statusOptions: Record<ScopedSubmissionTable, string[]> = {
  startup_registrations: ["pending", "reviewed"],
  community_join_applications: ["pending", "reviewed", "approved", "rejected"],
  event_registrations: ["pending", "confirmed", "attended", "cancelled"],
  meeting_registrations: ["pending", "confirmed", "completed", "cancelled"],
};

const detailFields = [
  ["startup_name", "Startup"],
  ["founder_name", "Founder"],
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["city", "City"],
  ["district", "District"],
  ["college_or_company", "College or company"],
  ["profession", "Profession"],
  ["role", "Role"],
  ["startup_stage", "Startup stage"],
  ["problem", "Problem"],
  ["solution", "Solution"],
  ["purpose", "Purpose"],
  ["website", "Website"],
  ["linkedin", "LinkedIn"],
  ["event_id", "Event"],
  ["meeting_id", "Meeting"],
] as const;

function text(record: HubSubmission, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function HubSubmissions({
  table,
  records,
  hubId,
  title,
  description,
  onSaved,
}: {
  table: ScopedSubmissionTable;
  records: HubSubmission[];
  hubId: string;
  title: string;
  description: string;
  onSaved(): Promise<unknown>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<HubSubmission | null>(null);
  const filtered = records.filter((record) => {
    const matches = [
      "name",
      "founder_name",
      "email",
      "phone",
      "startup_name",
      "event_id",
      "meeting_id",
      "city",
    ].some((key) => text(record, key).toLowerCase().includes(query.trim().toLowerCase()));
    return matches && (filter === "all" || record.status === filter);
  });
  const options = [
    ...new Set([...statusOptions[table], ...records.map((record) => record.status)]),
  ];

  return (
    <section className={panelClass}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {records.length} total
        </span>
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search {title.toLowerCase()}</span>
          <Search className="absolute left-3 top-3 text-slate-400" size={19} />
          <input
            className={`${fieldClass} pl-10`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, startup or event…"
            type="search"
          />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select
            className={`${fieldClass} sm:w-44`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">All statuses</option>
            {options.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {filtered.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                {["Applicant", "Contact", "Status", "Received", ""].map((label, index) => (
                  <th key={index} scope="col" className="px-3 py-3">
                    {label || <span className="sr-only">Actions</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((record) => (
                <tr key={record.id}>
                  <td className="min-w-40 px-3 py-4">
                    <p className="font-semibold">
                      {text(record, "name") || text(record, "founder_name") || "Applicant"}
                    </p>
                    {text(record, "startup_name") && (
                      <p className="mt-1 text-xs text-slate-500">{text(record, "startup_name")}</p>
                    )}
                  </td>
                  <td className="px-3 py-4">
                    <p>{text(record, "email") || "—"}</p>
                    <p className="mt-1 text-xs text-slate-500">{text(record, "phone")}</p>
                  </td>
                  <td className="px-3 py-4">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-500">
                    {formatDate(record.created_at)}
                  </td>
                  <td className="px-3 py-4 text-right">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => setSelected(record)}
                    >
                      Review
                      <span className="sr-only">
                        {" "}
                        {text(record, "name") || text(record, "founder_name")}
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
          <p className="font-semibold text-slate-700">
            {records.length ? "No matching records" : "No requests yet"}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {records.length
              ? "Try another search or status."
              : "Requests for your hub will appear here."}
          </p>
        </div>
      )}
      {selected && (
        <SubmissionEditor
          key={selected.id}
          table={table}
          record={selected}
          hubId={hubId}
          onClose={() => setSelected(null)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}

function SubmissionEditor({
  table,
  record,
  hubId,
  onClose,
  onSaved,
}: {
  table: ScopedSubmissionTable;
  record: HubSubmission;
  hubId: string;
  onClose(): void;
  onSaved(): Promise<unknown>;
}) {
  const [status, setStatus] = useState(record.status);
  const [notes, setNotes] = useState(record.follow_up_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState(record.status);
  const finalStartup =
    table === "startup_registrations" && !statusOptions[table].includes(savedStatus);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const changes: { status?: string; follow_up_notes: string } = { follow_up_notes: notes };
      if (!finalStartup && status !== savedStatus) changes.status = status;
      await updateHubSubmission(supabase, table, record.id, changes, hubId);
      setSavedStatus(status);
      await onSaved();
      setNotice("Changes saved.");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 sm:p-8">
        <DialogTitle className="text-xl font-bold">Review request</DialogTitle>
        <DialogDescription>Review applicant details and record your next steps.</DialogDescription>
        <dl className="mb-6 grid gap-4 sm:grid-cols-2">
          {detailFields.map(([key, label]) =>
            text(record, key) ? (
              <div
                key={key}
                className={["problem", "solution", "purpose"].includes(key) ? "sm:col-span-2" : ""}
              >
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                  {text(record, key)}
                </dd>
              </div>
            ) : null,
          )}
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Submitted
            </dt>
            <dd className="mt-1 text-sm">{formatDate(record.created_at)}</dd>
          </div>
        </dl>
        <Notice message={error} error />
        <Notice message={notice} />
        <form className="grid gap-5 border-t border-slate-200 pt-5" onSubmit={save}>
          <Field label="Status">
            <select
              className={fieldClass}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              disabled={saving || finalStartup}
            >
              {finalStartup && <option value={savedStatus}>{savedStatus}</option>}
              {statusOptions[table].map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          {table === "startup_registrations" && (
            <p className="-mt-3 text-xs leading-5 text-slate-500">
              You can review and follow up with founders. Final startup approval and portfolio
              publishing are handled by the owner.
            </p>
          )}
          <Field label="Follow-up notes">
            <textarea
              className={fieldClass}
              rows={5}
              maxLength={5000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={saving}
              placeholder="Record the next step, call outcome or follow-up date."
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={onClose}
              disabled={saving}
            >
              Close
            </button>
            <button type="submit" className={buttonClass} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
