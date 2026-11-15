import { useState, type FormEvent } from "react";
import { CalendarDays, Plus } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { saveHubEvent, type HubEventRecord, type HubSubmission } from "@/lib/hub-management";
import { supabase } from "@/lib/supabase";
import { HubSubmissions } from "./HubSubmissions";
import {
  buttonClass,
  errorText,
  fieldClass,
  Field,
  formatDate,
  Notice,
  panelClass,
  secondaryButtonClass,
} from "./shared";

export function HubEvents({
  events,
  registrations,
  hubId,
  onSaved,
}: {
  events: HubEventRecord[];
  registrations: HubSubmission[];
  hubId: string;
  onSaved(): Promise<unknown>;
}) {
  const [editing, setEditing] = useState<HubEventRecord | null>(null);
  const [filter, setFilter] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  function create() {
    setEditing({
      id: "",
      hub_id: hubId,
      title: "",
      date: "",
      time: "",
      venue: "",
      type: "Founder meetup",
      summary: "",
      is_published: false,
    });
  }

  return (
    <div className="grid gap-6">
      <section className={panelClass}>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Hub events</h2>
            <p className="mt-2 text-sm text-slate-500">
              Plan local events and publish them on your hub page.
            </p>
          </div>
          <button type="button" className={buttonClass} onClick={create}>
            <Plus size={17} />
            Create event
          </button>
        </div>
        <Notice message={notice} />
        {events.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {events.map((event) => (
              <article key={event.id} className="rounded-xl border border-slate-200 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${event.is_published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                  >
                    {event.is_published ? "Published" : "Draft"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {registrations.filter((record) => record.event_id === event.id).length}{" "}
                    registrations
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold">{event.title}</h3>
                <p className="mt-3 flex items-start gap-2 text-sm text-slate-600">
                  <CalendarDays size={17} className="mt-0.5 shrink-0" />
                  <span>
                    {formatDate(event.date)} · {event.time}
                  </span>
                </p>
                <p className="mt-2 text-sm text-slate-500">{event.venue}</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">{event.summary}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => {
                      setNotice(null);
                      setEditing(event);
                    }}
                  >
                    Edit event
                  </button>
                  {event.is_published && (
                    <a
                      href={`/events/?hub=${encodeURIComponent(hubId)}`}
                      target="_blank"
                      rel="noreferrer"
                      className={secondaryButtonClass}
                    >
                      View listing
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
            <CalendarDays className="mx-auto text-slate-400" size={30} />
            <h3 className="mt-3 font-semibold">Create your first hub event</h3>
            <p className="mt-2 text-sm text-slate-500">
              Save a draft, then publish when the details are ready.
            </p>
          </div>
        )}
      </section>
      <div className="flex justify-end">
        <Field label="Show registrations for">
          <select
            className={`${fieldClass} sm:max-w-sm`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">All hub events</option>
            {events.map((event) => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <HubSubmissions
        key={filter}
        table="event_registrations"
        records={registrations.filter((record) => !filter || record.event_id === filter)}
        hubId={hubId}
        title="Event registrations"
        description="Confirm attendees, record attendance and keep follow-up notes."
        onSaved={onSaved}
      />
      {editing && (
        <HubEventEditor
          event={editing}
          onClose={() => setEditing(null)}
          onSaved={async (published) => {
            await onSaved();
            setEditing(null);
            setNotice(
              published
                ? "Event saved and published on your hub page."
                : "Event saved as a draft. It is hidden from the public listing.",
            );
          }}
        />
      )}
    </div>
  );
}

export function HubEventEditor({
  event,
  onClose,
  onSaved,
}: {
  event: HubEventRecord;
  onClose(): void;
  onSaved(published: boolean): Promise<unknown>;
}) {
  const [draft, setDraft] = useState({ ...event });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function change<K extends keyof HubEventRecord>(key: K, value: HubEventRecord[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function save(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveHubEvent(supabase, draft);
      // Keep the confirmed identity even if refreshing the surrounding page
      // fails, so retrying updates this event instead of inserting it again.
      setDraft(saved);
      await onSaved(saved.is_published);
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
        <DialogTitle>{draft.id ? "Edit hub event" : "Create hub event"}</DialogTitle>
        <DialogDescription>
          Published events appear in the public event listing and your hub page.
        </DialogDescription>
        <Notice message={error} error />
        <form className="grid gap-5" onSubmit={save}>
          <fieldset disabled={saving} className="grid gap-5">
            <Field label="Event title">
              <input
                autoFocus
                className={fieldClass}
                value={draft.title}
                maxLength={180}
                required
                onChange={(e) => change("title", e.target.value)}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Date">
                <input
                  type="date"
                  className={fieldClass}
                  value={draft.date}
                  required
                  onChange={(e) => change("date", e.target.value)}
                />
              </Field>
              <Field label="Time (IST)">
                <input
                  className={fieldClass}
                  value={draft.time}
                  maxLength={100}
                  placeholder="4:00 PM – 7:00 PM"
                  required
                  onChange={(e) => change("time", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Venue">
              <input
                className={fieldClass}
                value={draft.venue}
                maxLength={300}
                required
                onChange={(e) => change("venue", e.target.value)}
              />
            </Field>
            <Field label="Event type">
              <input
                className={fieldClass}
                value={draft.type}
                maxLength={100}
                placeholder="Workshop, founder meetup, networking…"
                required
                onChange={(e) => change("type", e.target.value)}
              />
            </Field>
            <Field label="Summary">
              <textarea
                className={fieldClass}
                value={draft.summary}
                rows={4}
                maxLength={2000}
                required
                onChange={(e) => change("summary", e.target.value)}
              />
            </Field>
            <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 accent-blue-600"
                checked={draft.is_published}
                onChange={(e) => change("is_published", e.target.checked)}
              />
              <span>
                <span className="block font-semibold">Publish this event</span>
                <span className="mt-1 block leading-6 text-slate-500">
                  Visitors can see and register for published events. Clear this to keep a draft or
                  remove an event from public listings.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" className={secondaryButtonClass} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={buttonClass}>
                {saving ? "Saving…" : "Save event"}
              </button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
