import { useState, type FormEvent } from "react";
import { ExternalLink } from "lucide-react";

import { saveHubProfile, type HubRecord } from "@/lib/hub-management";
import { supabase } from "@/lib/supabase";
import {
  buttonClass,
  errorText,
  fieldClass,
  Field,
  Notice,
  panelClass,
  secondaryButtonClass,
} from "./shared";

export function HubProfileEditor({
  hub,
  onSaved,
  allowIdentityEdit = false,
}: {
  hub: HubRecord;
  onSaved(): Promise<unknown>;
  allowIdentityEdit?: boolean;
}) {
  const [draft, setDraft] = useState({ ...hub });
  const [focusAreas, setFocusAreas] = useState(hub.focus_areas.join("\n"));
  const [facilities, setFacilities] = useState(hub.facilities.join("\n"));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function change(key: keyof HubRecord, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const saved = await saveHubProfile(
        supabase,
        {
          ...draft,
          focus_areas: focusAreas.split("\n"),
          facilities: facilities.split("\n"),
        },
        allowIdentityEdit,
      );
      setDraft(saved);
      setFocusAreas(saved.focus_areas.join("\n"));
      setFacilities(saved.facilities.join("\n"));
      await onSaved();
      setNotice("Hub profile updated. Your changes are visible on the public hub page.");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={panelClass}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{draft.city || hub.city} Hub profile</h2>
          <p className="mt-2 text-sm text-slate-500">
            Keep your public hub information and contact details current.
          </p>
        </div>
        <a
          href={`/hubs/${encodeURIComponent(hub.id)}`}
          target="_blank"
          rel="noreferrer"
          className={secondaryButtonClass}
        >
          <ExternalLink size={16} />
          View public page
        </a>
      </div>
      <Notice message={error} error />
      <Notice message={notice} />
      <form onSubmit={save}>
        <fieldset disabled={saving} className="grid gap-5">
          {allowIdentityEdit ? (
            <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
              <Field label="City / Hub name">
                <input
                  className={fieldClass}
                  value={draft.city}
                  maxLength={100}
                  required
                  onChange={(e) => change("city", e.target.value)}
                />
              </Field>
              <Field label="District">
                <input
                  className={fieldClass}
                  value={draft.district}
                  maxLength={100}
                  required
                  onChange={(e) => change("district", e.target.value)}
                />
              </Field>
              <Field label="Hub status">
                <select
                  className={fieldClass}
                  value={draft.status}
                  onChange={(e) => change("status", e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Network forming">Network forming</option>
                </select>
              </Field>
            </div>
          ) : (
            <div className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">City</p>
                <p className="mt-1 text-sm font-semibold">{hub.city}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  District
                </p>
                <p className="mt-1 text-sm font-semibold">{hub.district}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Hub status
                </p>
                <p className="mt-1 text-sm font-semibold">{hub.status}</p>
              </div>
            </div>
          )}
          <Field label="Short summary">
            <input
              className={fieldClass}
              value={draft.summary}
              maxLength={500}
              required
              onChange={(e) => change("summary", e.target.value)}
            />
          </Field>
          <Field label="About this hub">
            <textarea
              className={fieldClass}
              rows={5}
              value={draft.description}
              maxLength={5000}
              required
              onChange={(e) => change("description", e.target.value)}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Focus areas (one per line)">
              <textarea
                className={fieldClass}
                rows={5}
                maxLength={2000}
                value={focusAreas}
                onChange={(e) => setFocusAreas(e.target.value)}
              />
            </Field>
            <Field label="Facilities and support (one per line)">
              <textarea
                className={fieldClass}
                rows={5}
                maxLength={2000}
                value={facilities}
                onChange={(e) => setFacilities(e.target.value)}
              />
            </Field>
          </div>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
            Contact details below are displayed publicly on your hub page. Use the contact
            information you want visitors to use.
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contact person">
              <input
                className={fieldClass}
                value={draft.contact_name}
                autoComplete="name"
                maxLength={120}
                onChange={(e) => change("contact_name", e.target.value)}
              />
            </Field>
            <Field label="Contact email">
              <input
                className={fieldClass}
                type="email"
                value={draft.contact_email}
                autoComplete="email"
                maxLength={254}
                onChange={(e) => change("contact_email", e.target.value)}
              />
            </Field>
            <Field label="Contact phone">
              <input
                className={fieldClass}
                type="tel"
                value={draft.contact_phone}
                autoComplete="tel"
                maxLength={40}
                onChange={(e) => change("contact_phone", e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <button type="submit" className={buttonClass}>
              {saving ? "Saving…" : "Save hub profile"}
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
