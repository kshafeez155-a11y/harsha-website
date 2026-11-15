import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";

import type { HubManager } from "@/lib/hub-management";
import { supabase } from "@/lib/supabase";
import { buttonClass, errorText, fieldClass, Field, Notice, panelClass } from "./shared";

export function HubAccount({ manager }: { manager: HubManager }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const result = await supabase.auth.updateUser({ password });
      if (result.error) throw result.error;
      setPassword("");
      setConfirmation("");
      setNotice("Your password has been updated.");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className={panelClass}>
        <h2 className="text-xl font-bold">Your account</h2>
        <dl className="mt-6 grid gap-5">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</dt>
            <dd className="mt-1 text-sm">{manager.display_name}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
            <dd className="mt-1 break-words text-sm">{manager.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access</dt>
            <dd className="mt-1 text-sm">Assigned hub manager</dd>
          </div>
        </dl>
        <p className="mt-6 text-sm leading-6 text-slate-500">
          Contact the owner if you need your hub assignment or account details changed.
        </p>
      </section>
      <section className={panelClass}>
        <h2 className="mb-5 flex items-center gap-2 text-xl font-bold">
          <KeyRound size={20} />
          Change password
        </h2>
        <Notice message={error} error />
        <Notice message={notice} />
        <form onSubmit={changePassword}>
          <fieldset disabled={saving} className="grid gap-5">
            <Field label="New password">
              <input
                className={fieldClass}
                type="password"
                autoComplete="new-password"
                value={password}
                minLength={8}
                required
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirm new password">
              <input
                className={fieldClass}
                type="password"
                autoComplete="new-password"
                value={confirmation}
                minLength={8}
                required
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            <button type="submit" className={buttonClass}>
              {saving ? "Updating…" : "Update password"}
            </button>
          </fieldset>
        </form>
      </section>
    </div>
  );
}
