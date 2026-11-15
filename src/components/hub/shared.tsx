import type { ReactNode } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";

export const fieldClass =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500";
export const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
export const panelClass = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-6";

export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "This action could not be completed. Please try again.";
}

export function Notice({ message, error = false }: { message: string | null; error?: boolean }) {
  if (!message) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mb-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {error && <CircleAlert size={18} className="mt-0.5 shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}

export function Busy({ label = "Loading hub information…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500"
    >
      <LoaderCircle size={21} className="animate-spin" />
      {label}
    </div>
  );
}

export function formatDate(value: string | undefined) {
  if (!value) return "Not provided";
  const date = new Date(value.length === 10 ? `${value}T00:00:00+05:30` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
        date,
      );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${["approved", "attended", "completed", "confirmed"].includes(status) ? "bg-emerald-50 text-emerald-700" : ["rejected", "cancelled"].includes(status) ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800"}`}
    >
      {status || "pending"}
    </span>
  );
}
