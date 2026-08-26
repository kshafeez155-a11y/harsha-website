import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { isAdminUser } from "@/components/admin/admin-auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = Route.useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.user) {
        setErrorMessage("Unable to sign in. Check your email and password and try again.");
        return;
      }

      if (!isAdminUser(data.user)) {
        await supabase.auth.signOut();
        setErrorMessage(
          "Your credentials were accepted, but this account is not configured as a Hanova administrator. Add your email to VITE_ADMIN_EMAILS or set the Supabase admin role claim.",
        );
        return;
      }

      await navigate({ to: "/admin" });
    } catch (error) {
      console.error("[Admin login] Sign in failed", error);
      setErrorMessage("Unable to sign in. Check your email and password and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-medium text-muted-foreground">Hanova</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Admin login</h1>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="h-11 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="h-11 rounded-md border border-input bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

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
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
