import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { verifyStaffAccess } from "@/components/admin/admin-auth";
import { isAdminAccessFailureReason, type AdminAccessFailureReason } from "@/lib/admin-access";
import { supabase } from "@/lib/supabase";

const STAFF_LOGIN_MESSAGES: Record<AdminAccessFailureReason, string> = {
  session: "Please sign in again to continue to your dashboard.",
  forbidden: "This account does not have access to this dashboard. Contact your administrator.",
  unavailable: "We could not verify your staff access. Please try again.",
};

export const Route = createFileRoute("/admin/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { access?: AdminAccessFailureReason; setup?: boolean } => ({
    access: isAdminAccessFailureReason(search.access) ? search.access : undefined,
    setup: search.setup === true || search.setup === "true" ? true : undefined,
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = Route.useNavigate();
  const { access, setup } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [settingPassword, setSettingPassword] = useState(setup === true);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    access ? STAFF_LOGIN_MESSAGES[access] : null,
  );

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setSettingPassword(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function enterDashboard() {
    const staffAccess = await verifyStaffAccess();
    if (!staffAccess.allowed) {
      await supabase.auth.signOut();
      setErrorMessage(staffAccess.message);
      return;
    }
    setPassword("");
    await navigate({ to: staffAccess.role === "admin" ? "/admin" : "/hub-dashboard" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      if (settingPassword) {
        if (password.length < 12 || password !== confirmPassword) {
          setErrorMessage("Use at least 12 characters and enter the same password twice.");
          return;
        }
        const identity = await supabase.auth.getUser();
        if (identity.error || !identity.data.user) {
          setErrorMessage(
            "This invitation or password reset link has expired. Ask your administrator to resend it, or request a password reset below.",
          );
          return;
        }
        const updated = await supabase.auth.updateUser({ password });
        if (updated.error) {
          setErrorMessage(updated.error.message);
          return;
        }
        await enterDashboard();
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        setErrorMessage("Unable to sign in. Check your email and password and try again.");
        return;
      }

      await enterDashboard();
    } catch (error) {
      console.error("[Admin login] Sign in failed", error);
      setErrorMessage("Unable to sign in. Check your email and password and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resetPassword() {
    if (isSubmitting) return;
    if (!email.trim()) {
      setErrorMessage("Enter your email address first.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/admin/login?setup=true`,
      });
      if (error) throw error;
      setNotice("If an account exists for this email, a password setup link will arrive shortly.");
    } catch {
      setErrorMessage("The password setup email could not be sent. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-medium text-muted-foreground">Hanova</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            {settingPassword ? "Set your password" : "Staff login"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {settingPassword
              ? "Choose a password to open your dashboard."
              : "Sign in to your owner or assigned hub dashboard."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required={!settingPassword}
              className="h-11 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            {settingPassword ? "New password" : "Password"}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={settingPassword ? "new-password" : "current-password"}
              minLength={settingPassword ? 12 : undefined}
              required
              className="h-11 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          {settingPassword && (
            <label className="grid gap-2 text-sm font-medium text-foreground">
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                required
                className="h-11 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          )}

          {notice && (
            <p role="status" className="text-sm text-green-700">
              {notice}
            </p>
          )}

          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting
              ? "Please wait..."
              : settingPassword
                ? "Save password and continue"
                : "Sign in"}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void resetPassword()}
            className="min-h-11 text-sm font-medium text-muted-foreground underline disabled:opacity-60"
          >
            Send password setup email
          </button>
          {settingPassword && (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setSettingPassword(false);
                setPassword("");
                setConfirmPassword("");
                setNotice(null);
                setErrorMessage(null);
              }}
              className="min-h-11 text-sm font-medium underline"
            >
              Back to sign in
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
