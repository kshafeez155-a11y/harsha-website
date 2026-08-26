import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Check,
  CircleAlert,
  KeyRound,
  LoaderCircle,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/components/admin/admin-auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/settings")({
  beforeLoad: requireAdmin,
  component: AdminSettingsPage,
});

type AccountUser = { id: string; email?: string; created_at?: string; last_sign_in_at?: string };

function AdminSettingsPage() {
  const navigate = Route.useNavigate();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setAccountError(error?.message ?? "Unable to load the authenticated account.");
      } else {
        const account = data.user;
        setUser({
          id: account.id,
          email: account.email,
          created_at: account.created_at,
          last_sign_in_at: account.last_sign_in_at,
        });
        setEmail(account.email ?? "");
      }
      setLoading(false);
    }
    void loadUser();
  }, []);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isChangingEmail) return;
    setEmailMessage(null);
    setIsChangingEmail(true);
    const { data, error } = await supabase.auth.updateUser({ email });
    if (error) {
      setEmailMessage({ type: "error", text: error.message });
    } else {
      setUser((current) => (current ? { ...current, email: data.user?.email ?? email } : current));
      setEmailMessage({
        type: "success",
        text: "Email update requested. Check your inbox if confirmation is required.",
      });
    }
    setIsChangingEmail(false);
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isChangingPassword) return;
    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "Use a password with at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: "error", text: "The passwords do not match." });
      return;
    }
    setIsChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setPasswordMessage({ type: "error", text: error.message });
    else {
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage({ type: "success", text: "Password updated successfully." });
    }
    setIsChangingPassword(false);
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAccountError(error.message);
      return;
    }
    await navigate({ to: "/admin/login" });
  }

  return (
    <AdminShell title="Settings" description="Manage your administrator account and preferences.">
      <div className="mb-8">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
          Account
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Admin Settings</h1>
      </div>
      {accountError && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <CircleAlert size={17} className="mt-0.5 shrink-0" />
          {accountError}
        </div>
      )}
      {loading ? (
        <div className="flex items-center gap-3 border border-slate-200 bg-white px-5 py-12 text-sm text-slate-500">
          <LoaderCircle className="animate-spin" size={19} />
          Loading account...
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-[#e9f7a7] text-[#596a00]">
                <UserRound size={19} />
              </span>
              <div>
                <h2 className="text-lg font-bold">Administrator profile</h2>
                <p className="text-sm text-slate-500">Authenticated account information</p>
              </div>
            </div>
            <dl className="mt-7 space-y-5">
              <Info label="Email" value={user?.email ?? "Not available"} />
              <Info label="User ID" value={user?.id ?? "Not available"} />
              <Info label="Account created" value={formatDate(user?.created_at)} />
              <Info label="Last sign-in" value={formatDate(user?.last_sign_in_at)} />
            </dl>
            <p className="mt-7 border-t border-slate-100 pt-5 text-sm leading-6 text-slate-500">
              No profile table or editable profile fields are configured in this project. Account
              details are shown read-only.
            </p>
          </section>
          <section className="border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-sky-100 text-sky-700">
                <Mail size={19} />
              </span>
              <div>
                <h2 className="text-lg font-bold">Change email</h2>
                <p className="text-sm text-slate-500">Supabase may require confirmation.</p>
              </div>
            </div>
            <form onSubmit={handleEmailSubmit} className="mt-7 space-y-4">
              <label className="grid gap-2 text-sm font-semibold">
                New email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11 border border-slate-300 px-3 font-normal outline-none focus:border-slate-700"
                />
              </label>
              {emailMessage && <Message {...emailMessage} />}
              <button
                type="submit"
                disabled={isChangingEmail}
                className="min-h-11 bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isChangingEmail ? "Updating..." : "Update email"}
              </button>
            </form>
          </section>
          <section className="border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-orange-100 text-orange-700">
                <KeyRound size={19} />
              </span>
              <div>
                <h2 className="text-lg font-bold">Change password</h2>
                <p className="text-sm text-slate-500">Use at least 8 characters.</p>
              </div>
            </div>
            <form onSubmit={handlePasswordSubmit} className="mt-7 space-y-4">
              <label className="grid gap-2 text-sm font-semibold">
                New password
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="h-11 border border-slate-300 px-3 font-normal outline-none focus:border-slate-700"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                Confirm new password
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="h-11 border border-slate-300 px-3 font-normal outline-none focus:border-slate-700"
                />
              </label>
              {passwordMessage && <Message {...passwordMessage} />}
              <button
                type="submit"
                disabled={isChangingPassword}
                className="min-h-11 bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isChangingPassword ? "Updating..." : "Update password"}
              </button>
            </form>
          </section>
          <section className="border border-slate-200 bg-white p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                <ShieldCheck size={19} />
              </span>
              <div>
                <h2 className="text-lg font-bold">Account security</h2>
                <p className="text-sm text-slate-500">Your current Supabase Auth session</p>
              </div>
            </div>
            <div className="mt-7 flex items-center gap-3 text-sm text-slate-700">
              <span className="size-2 rounded-full bg-emerald-500" />
              Authenticated as {user?.email ?? "unknown account"}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-6 inline-flex min-h-11 items-center gap-2 border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-1 break-all text-sm text-slate-800">{value}</dd>
    </div>
  );
}
function Message({ type, text }: { type: "success" | "error"; text: string }) {
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 text-sm ${type === "error" ? "text-rose-700" : "text-emerald-700"}`}
    >
      {type === "error" ? <CircleAlert size={16} /> : <Check size={16} />}
      {text}
    </div>
  );
}
function formatDate(value?: string) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
