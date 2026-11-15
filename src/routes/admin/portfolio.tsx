import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";

import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/components/admin/admin-auth";
import { StartupProfileEditor } from "@/components/admin/StartupProfileEditor";
import {
  deleteStartupProfile,
  loadStartupProfiles,
  newStartupProfile,
  saveStartupProfile,
  startupProfileError,
  type StartupProfile,
} from "@/lib/startup-profiles";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/admin/portfolio")({
  ssr: false,
  beforeLoad: requireAdmin,
  component: StartupPortfolioPage,
});

function StartupPortfolioPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["startup-profiles", "admin"],
    queryFn: () => loadStartupProfiles(supabase),
  });
  const [editing, setEditing] = useState<StartupProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState("all");
  const profiles = query.data ?? [];
  const filtered = profiles.filter(
    (profile) =>
      [profile.startupName, profile.founderName ?? "", profile.location, profile.industry].some(
        (value) => value.toLowerCase().includes(search.trim().toLowerCase()),
      ) &&
      (visibility === "all" ||
        (visibility === "published" ? profile.isPublished : !profile.isPublished)),
  );

  async function refreshProfiles() {
    await queryClient.invalidateQueries({ queryKey: ["startup-profiles"] });
  }

  async function save(profile: StartupProfile) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await saveStartupProfile(supabase, profile);
      setEditing(null);
      setNotice(
        profile.isPublished
          ? "Startup saved and published on the website."
          : "Draft saved. This startup is hidden from visitors.",
      );
      await refreshProfiles();
    } catch (error) {
      throw new Error(startupProfileError(error));
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(profile: StartupProfile) {
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await saveStartupProfile(supabase, { ...profile, isPublished: !profile.isPublished });
      setNotice(
        profile.isPublished
          ? "Startup unpublished. Visitors can no longer see it."
          : "Startup published on the website.",
      );
      await refreshProfiles();
    } catch (error) {
      setActionError(startupProfileError(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(profile: StartupProfile) {
    if (
      !window.confirm(
        `Delete "${profile.startupName}"? This removes its website card and profile permanently.`,
      )
    )
      return;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      await deleteStartupProfile(supabase, profile.id);
      setNotice("Startup deleted.");
      await refreshProfiles();
    } catch (error) {
      setActionError(startupProfileError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Manage Startups"
      description="Create and update the startups displayed on your website."
    >
      <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#6a7d00]">
            Website content
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Manage Startups</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Add startups, update their profiles, and choose what appears on the founder wall.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => setEditing(newStartupProfile())}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          <Plus size={17} />
          Add startup
        </button>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <span>
          <strong className="text-lg">
            {query.isPending || query.isError ? "—" : profiles.length}
          </strong>{" "}
          <span className="text-slate-500">total startups</span>
        </span>
        <span>
          <strong className="text-lg text-emerald-700">
            {query.isPending || query.isError ? "—" : profiles.filter((p) => p.isPublished).length}
          </strong>{" "}
          <span className="text-slate-500">published</span>
        </span>
        <span>
          <strong className="text-lg text-amber-700">
            {query.isPending || query.isError ? "—" : profiles.filter((p) => !p.isPublished).length}
          </strong>{" "}
          <span className="text-slate-500">drafts</span>
        </span>
        <a
          href="/startups"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 font-semibold text-blue-700"
        >
          View website <ExternalLink size={14} />
        </a>
      </div>
      {notice && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          <Check size={17} />
          {notice}
        </div>
      )}
      {(actionError || query.isError) && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {actionError || startupProfileError(query.error)}
          <button
            type="button"
            onClick={() => {
              setActionError("");
              void query.refetch();
            }}
            className="ml-3 font-bold underline"
          >
            Retry
          </button>
        </div>
      )}
      <div className="mb-6 flex flex-wrap gap-3">
        <label className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-3.5 text-slate-400"
            size={17}
          />
          <span className="sr-only">Search startups</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search startups, founders, city…"
            className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500"
          />
        </label>
        <label>
          <span className="sr-only">Filter by visibility</span>
          <select
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="all">All startups</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching || busy}
          aria-label="Refresh startups"
          className="rounded-lg border border-slate-300 bg-white px-3 text-slate-600 disabled:opacity-50"
        >
          <RefreshCw size={17} className={query.isFetching ? "animate-spin" : ""} />
        </button>
      </div>
      {query.isPending ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-500">
          <LoaderCircle className="animate-spin" size={20} />
          Loading startups…
        </div>
      ) : query.isError ? null : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
          <Building2 size={32} className="mx-auto text-slate-300" />
          <h2 className="mt-4 text-lg font-bold">
            {profiles.length ? "No startups match your search" : "Add your first startup"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {profiles.length
              ? "Try a different search or visibility filter."
              : "Create a profile, add your images, and publish it to the website."}
          </p>
          {!profiles.length && (
            <button
              type="button"
              onClick={() => setEditing(newStartupProfile())}
              className="mt-5 font-semibold text-blue-700"
            >
              + Add startup
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {filtered.map((profile) => (
            <article
              key={profile.id}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start gap-3">
                {profile.startupLogo || profile.coverImage ? (
                  <img
                    src={profile.startupLogo || profile.coverImage}
                    alt=""
                    className="size-14 shrink-0 rounded-xl border border-slate-100 bg-slate-50 object-contain"
                  />
                ) : (
                  <Building2 className="size-14 shrink-0 rounded-xl bg-slate-950 p-4 text-white" />
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-lg font-bold">{profile.startupName}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {profile.founderName} · {profile.location}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${profile.isPublished ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {profile.isPublished ? "Published" : "Draft"}
                </span>
              </div>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
                {profile.shortStory}
              </p>
              <div className="mb-5 mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{profile.stage}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">
                  Order: {profile.sortOrder}
                </span>
                {profile.isFeatured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                    <Star size={12} />
                    Featured story
                  </span>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(profile)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void togglePublished(profile)}
                  className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-slate-600 disabled:opacity-50"
                >
                  {profile.isPublished ? <EyeOff size={15} /> : <Eye size={15} />}
                  {profile.isPublished ? "Unpublish" : "Publish"}
                </button>
                {profile.isPublished && (
                  <a
                    href={`/startups/${profile.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700"
                  >
                    View <ExternalLink size={13} />
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(profile)}
                  aria-label={`Delete ${profile.startupName}`}
                  className="ml-auto p-2 text-slate-400 hover:text-rose-600 disabled:opacity-50"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs leading-5 text-slate-500">
        Looking for submitted applications?{" "}
        <a className="font-semibold text-blue-700 underline" href="/admin/startups">
          Open Startup Applications
        </a>
        .
      </p>
      {editing && (
        <StartupProfileEditor
          key={editing.id || "new"}
          profile={editing}
          busy={busy}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}
