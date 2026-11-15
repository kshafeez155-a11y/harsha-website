import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CalendarDays,
  LoaderCircle,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/components/admin/admin-auth";
import { supabase } from "@/lib/supabase";
import { HubProfileEditor } from "@/components/hub/HubProfileEditor";
import { HubEventEditor } from "@/components/hub/HubEvents";
import {
  assignHubManager,
  assignSubmissionHub,
  createHub,
  HUB_SUBMISSION_LABELS,
  loadHubActivity,
  loadHubEvents,
  loadHubManagers,
  loadHubs,
  loadHubSubmissions,
  SCOPED_SUBMISSION_TABLES,
  removeHubManager,
  setHubManagerActive,
  type HubActivity,
  type HubEventRecord,
  type HubManager,
  type HubRecord,
  type HubSubmission,
  type ScopedSubmissionTable,
} from "@/lib/hub-management";

export const Route = createFileRoute("/admin/hubs")({
  ssr: false,
  beforeLoad: requireAdmin,
  component: HubManagementPage,
});

type Data = {
  hubs: HubRecord[];
  managers: HubManager[];
  events: HubEventRecord[];
  activity: HubActivity[];
  requests: Record<ScopedSubmissionTable, HubSubmission[]>;
};
const inputClass =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-500";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";

function HubManagementPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"hubs" | "content" | "requests" | "activity">("hubs");
  const [hubFilter, setHubFilter] = useState("");
  const [activityHubFilter, setActivityHubFilter] = useState("");
  const [requestType, setRequestType] = useState<ScopedSubmissionTable>(
    "community_join_applications",
  );
  const [selectedHub, setSelectedHub] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [showAddHub, setShowAddHub] = useState(false);
  const [newHubCity, setNewHubCity] = useState("");
  const [newHubDistrict, setNewHubDistrict] = useState("");
  const [newHubStatus, setNewHubStatus] = useState<"Active" | "Network forming">("Active");
  const [newHubSummary, setNewHubSummary] = useState("");
  const [newHubDescription, setNewHubDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [assignment, setAssignment] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [contentHub, setContentHub] = useState("");
  const [editingEvent, setEditingEvent] = useState<HubEventRecord | null>(null);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const [hubs, managers, events, activity, ...requests] = await Promise.all([
        loadHubs(supabase),
        loadHubManagers(supabase),
        loadHubEvents(supabase),
        loadHubActivity(supabase),
        ...SCOPED_SUBMISSION_TABLES.map((table) => loadHubSubmissions(supabase, table)),
      ]);
      setData({
        hubs,
        managers,
        events,
        activity,
        requests: Object.fromEntries(
          SCOPED_SUBMISSION_TABLES.map((table, index) => [table, requests[index]]),
        ),
      } as Data);
    } catch (cause) {
      setData(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Hub management could not be loaded. Please retry.",
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateHub(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const created = await createHub(supabase, {
        city: newHubCity,
        district: newHubDistrict,
        status: newHubStatus,
        summary: newHubSummary,
        description: newHubDescription,
      });
      setNotice(
        `Hub "${created.city}" added! It is now live on the website and ready to have a manager assigned.`,
      );
      setNewHubCity("");
      setNewHubDistrict("");
      setNewHubStatus("Active");
      setNewHubSummary("");
      setNewHubDescription("");
      setShowAddHub(false);
      setSelectedHub(created.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hub could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function saveManager(event: FormEvent) {
    event.preventDefault();
    if (busy || !selectedHub) return;
    const existing = data?.managers.find((manager) => manager.hub_id === selectedHub);
    if (
      existing &&
      existing.email.toLowerCase() !== managerEmail.trim().toLowerCase() &&
      !window.confirm(
        `Replace ${existing.display_name || existing.email} as this hub's manager? Their access will end immediately.`,
      )
    )
      return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const result = await assignHubManager(
        supabase,
        selectedHub,
        managerEmail,
        managerName,
        managerPassword,
      );
      setNotice(
        result.created
          ? "Manager account created in Supabase with your email & password and assigned to this hub. They can sign in immediately at /admin/login to open their Hub Manager Dashboard."
          : result.passwordUpdated
            ? "Manager assigned and password updated in Supabase. They can sign in immediately at /admin/login with the new password."
            : "Manager assigned. They can sign in at /admin/login with their existing password.",
      );
      setManagerEmail("");
      setManagerName("");
      setManagerPassword("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Manager could not be assigned.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleManager(manager: HubManager) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await setHubManagerActive(supabase, manager.hub_id, !manager.active);
      setNotice(
        manager.active ? "Manager access disabled immediately." : "Manager access enabled.",
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Access could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function transfer(row: HubSubmission) {
    if (busy) return;
    const target = assignment[row.id];
    if (target === undefined || target === (row.hub_id ?? "")) return;
    if (
      row.hub_id &&
      !window.confirm(
        "Move this request to the selected hub? Its current manager will lose access.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await assignSubmissionHub(supabase, requestType, row.id, target || null);
      setNotice(
        target ? "Request assigned to the selected hub." : "Request returned to the owner queue.",
      );
      setAssignment({});
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request could not be reassigned.");
    } finally {
      setBusy(false);
    }
  }

  async function removeManager(manager: HubManager) {
    if (
      busy ||
      !window.confirm(
        `Remove ${manager.display_name || manager.email} from ${hubName(manager.hub_id)}? Their hub access will end. Their login account and hub records will be preserved.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await removeHubManager(supabase, manager.hub_id);
      setNotice("Assignment removed. You can assign this person to another hub.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Assignment could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  const allRequests = data ? SCOPED_SUBMISSION_TABLES.flatMap((table) => data.requests[table]) : [];
  const hubName = (id: string | null) =>
    data?.hubs.find((hub) => hub.id === id)?.city ?? "Unassigned";
  const filtered =
    data?.requests[requestType].filter((row) => {
      const matchesHub =
        !hubFilter || (hubFilter === "unassigned" ? !row.hub_id : row.hub_id === hubFilter);
      const search = query.trim().toLowerCase();
      return (
        matchesHub &&
        (!search ||
          [row.name, row.founder_name, row.startup_name, row.email, row.phone].some(
            (value) => typeof value === "string" && value.toLowerCase().includes(search),
          ))
      );
    }) ?? [];

  return (
    <AdminShell
      title="Hub Management"
      description="Assign local managers and oversee every Hanova hub."
    >
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6a7d00]">
            Regional operations
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Hub Management</h1>
          <p className="mt-2 text-sm text-slate-500">
            Each manager works within their assigned hub. You stay in control.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {notice}
        </div>
      )}
      {loading && (
        <div role="status" className="flex items-center gap-3 py-12 text-slate-500">
          <LoaderCircle size={20} className="animate-spin" />
          Loading hubs and requests…
        </div>
      )}
      {!loading && !data && (
        <button className={buttonClass} onClick={() => void load()}>
          Retry loading
        </button>
      )}
      {data && !loading && (
        <>
          <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Hubs", value: data.hubs.length, icon: MapPin },
              {
                label: "Active managers",
                value: data.managers.filter((manager) => manager.active).length,
                icon: ShieldCheck,
              },
              {
                label: "Published events",
                value: data.events.filter((event) => event.is_published).length,
                icon: CalendarDays,
              },
              {
                label: "Unassigned requests",
                value: allRequests.filter((row) => !row.hub_id).length,
                icon: Users,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-5">
                <Icon size={20} className="text-[#6a7d00]" />
                <p className="mt-4 text-3xl font-bold">{value}</p>
                <p className="mt-1 text-sm text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="mb-6 flex flex-wrap gap-2" aria-label="Hub management views">
            {(
              [
                ["hubs", "Hubs & managers"],
                ["content", "Hub profiles & events"],
                ["requests", "Requests & assignments"],
                ["activity", "Activity"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                aria-pressed={tab === value}
                className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${tab === value ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "hubs" && (
            <>
              <div className="mb-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold">Add a new hub</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Create a new regional hub in Supabase so it appears across the website, forms,
                      and manager assignments.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setShowAddHub((current) => !current)}
                    className={
                      showAddHub
                        ? "min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
                        : buttonClass
                    }
                  >
                    {showAddHub ? "Cancel" : "+ Add new hub"}
                  </button>
                </div>
                {showAddHub && (
                  <form onSubmit={handleCreateHub} className="mt-5 grid gap-4 border-t border-slate-100 pt-5">
                    <div className="grid gap-4 md:grid-cols-3">
                      <label className="grid gap-2 text-sm font-semibold">
                        City / Hub name
                        <input
                          required
                          maxLength={100}
                          disabled={busy}
                          value={newHubCity}
                          onChange={(event) => setNewHubCity(event.target.value)}
                          placeholder="e.g. Guntur"
                          className={inputClass}
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold">
                        District
                        <input
                          required
                          maxLength={100}
                          disabled={busy}
                          value={newHubDistrict}
                          onChange={(event) => setNewHubDistrict(event.target.value)}
                          placeholder="e.g. Guntur"
                          className={inputClass}
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-semibold">
                        Hub status
                        <select
                          disabled={busy}
                          value={newHubStatus}
                          onChange={(event) =>
                            setNewHubStatus(event.target.value as "Active" | "Network forming")
                          }
                          className={inputClass}
                        >
                          <option value="Active">Active</option>
                          <option value="Network forming">Network forming</option>
                        </select>
                      </label>
                    </div>
                    <label className="grid gap-2 text-sm font-semibold">
                      Short summary
                      <input
                        required
                        maxLength={500}
                        disabled={busy}
                        value={newHubSummary}
                        onChange={(event) => setNewHubSummary(event.target.value)}
                        placeholder="A one-sentence summary of this regional hub"
                        className={inputClass}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-semibold">
                      About this hub
                      <textarea
                        required
                        rows={3}
                        maxLength={5000}
                        disabled={busy}
                        value={newHubDescription}
                        onChange={(event) => setNewHubDescription(event.target.value)}
                        placeholder="Describe how this hub supports local founders, students, and partners..."
                        className={inputClass}
                      />
                    </label>
                    <div>
                      <button
                        type="submit"
                        disabled={busy || !newHubCity.trim() || !newHubDistrict.trim()}
                        className={buttonClass}
                      >
                        {busy ? "Creating hub…" : "Save new hub"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
              <form
                onSubmit={saveManager}
                className="mb-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
              >
                <h2 className="text-lg font-bold">Create or assign a hub manager</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Set an email and password to create a manager login in Supabase (or update an
                  existing manager’s password). When they sign in at{" "}
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
                    /admin/login
                  </code>{" "}
                  with that email and password, it opens their Hub Manager Dashboard.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-2 text-sm font-semibold">
                    Hub
                    <select
                      required
                      disabled={busy}
                      value={selectedHub}
                      onChange={(event) => setSelectedHub(event.target.value)}
                      className={inputClass}
                    >
                      <option value="">Choose a hub</option>
                      {data.hubs.map((hub) => (
                        <option key={hub.id} value={hub.id}>
                          {hub.city}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Manager name
                    <input
                      required
                      maxLength={150}
                      disabled={busy}
                      value={managerName}
                      onChange={(event) => setManagerName(event.target.value)}
                      className={inputClass}
                      autoComplete="name"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Manager email
                    <input
                      type="email"
                      required
                      disabled={busy}
                      value={managerEmail}
                      onChange={(event) => setManagerEmail(event.target.value)}
                      className={inputClass}
                      autoComplete="email"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Manager password
                    <input
                      type="password"
                      minLength={8}
                      maxLength={128}
                      disabled={busy}
                      value={managerPassword}
                      onChange={(event) => setManagerPassword(event.target.value)}
                      placeholder="Min 8 characters"
                      className={inputClass}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
                <button disabled={busy || !selectedHub} className={`${buttonClass} mt-5`}>
                  {busy ? "Saving…" : "Create / assign manager"}
                </button>
              </form>
              <div className="grid gap-4 lg:grid-cols-2">
                {data.hubs.map((hub) => {
                  const manager = data.managers.find((item) => item.hub_id === hub.id);
                  const hubRequests = allRequests.filter((row) => row.hub_id === hub.id);
                  return (
                    <article
                      key={hub.id}
                      className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                            {hub.district}
                          </p>
                          <h2 className="mt-1 text-2xl font-bold">{hub.city}</h2>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${hub.status === "Active" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}
                        >
                          {hub.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-500">{hub.summary}</p>
                      <div className="mt-5 rounded-lg bg-slate-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Hub manager
                        </p>
                        <p className="mt-2 font-semibold">
                          {manager?.display_name || "Not assigned"}
                        </p>
                        {manager && (
                          <>
                            <p className="mt-1 break-all text-sm text-slate-500">{manager.email}</p>
                            <p
                              className={`mt-2 text-xs font-semibold ${manager.active ? "text-green-700" : "text-red-700"}`}
                            >
                              {manager.active ? "Access enabled" : "Access disabled"}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-500">
                        <span>{hubRequests.length} requests</span>
                        <span>
                          {hubRequests.filter((row) => row.status === "pending").length} pending
                        </span>
                        <span>
                          {
                            data.events.filter(
                              (event) => event.hub_id === hub.id && event.is_published,
                            ).length
                          }{" "}
                          published events
                        </span>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <button
                          className={buttonClass}
                          disabled={busy}
                          onClick={() => {
                            setSelectedHub(hub.id);
                            setManagerName(manager?.display_name ?? "");
                            setManagerEmail(manager?.email ?? "");
                            setManagerPassword("");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Assign / replace
                        </button>
                        {manager && (
                          <button
                            disabled={busy}
                            onClick={() => void toggleManager(manager)}
                            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-50"
                          >
                            {manager.active ? "Disable access" : "Enable access"}
                          </button>
                        )}
                        {manager && (
                          <button
                            disabled={busy}
                            onClick={() => void removeManager(manager)}
                            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red-700 disabled:opacity-50"
                          >
                            Remove assignment
                          </button>
                        )}
                        <a
                          href={`/hubs/${hub.id}`}
                          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-blue-700"
                        >
                          Public hub page
                          <ArrowUpRight size={15} />
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {tab === "content" && (
            <section>
              <label className="mb-6 grid max-w-sm gap-2 text-sm font-semibold">
                Manage hub
                <select
                  value={contentHub}
                  onChange={(event) => setContentHub(event.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose a hub</option>
                  {data.hubs.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.city}
                    </option>
                  ))}
                </select>
              </label>
              {data.hubs
                .filter((hub) => hub.id === contentHub)
                .map((hub) => (
                  <div key={hub.id}>
                    <HubProfileEditor
                      hub={hub}
                      allowIdentityEdit
                      onSaved={async () => {
                        setNotice("Hub profile saved. The public hub page now uses these details.");
                        await load();
                      }}
                    />
                    <div className="mt-7 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <h2 className="text-xl font-bold">{hub.city} events</h2>
                          <p className="mt-1 text-sm text-slate-500">
                            Published events appear on the public website.
                          </p>
                        </div>
                        <button
                          className={buttonClass}
                          onClick={() =>
                            setEditingEvent({
                              id: "",
                              hub_id: hub.id,
                              title: "",
                              date: "",
                              time: "",
                              venue: "",
                              type: "Founder meetup",
                              summary: "",
                              is_published: false,
                            })
                          }
                        >
                          Create event
                        </button>
                      </div>
                      <div className="mt-5 divide-y divide-slate-100">
                        {data.events
                          .filter((event) => event.hub_id === hub.id)
                          .map((event) => (
                            <article
                              key={event.id}
                              className="flex flex-wrap items-center justify-between gap-4 py-4"
                            >
                              <div>
                                <h3 className="font-semibold">{event.title}</h3>
                                <p className="mt-1 text-sm text-slate-500">
                                  {event.date} · {event.time} ·{" "}
                                  {event.is_published ? "Published" : "Draft"}
                                </p>
                              </div>
                              <button
                                className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold"
                                onClick={() => setEditingEvent(event)}
                              >
                                Edit event
                              </button>
                            </article>
                          ))}
                      </div>
                      {!data.events.some((event) => event.hub_id === hub.id) && (
                        <p className="py-8 text-sm text-slate-500">No events for this hub yet.</p>
                      )}
                    </div>
                  </div>
                ))}
              {!contentHub && (
                <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  Choose a hub to edit its public profile and events.
                </p>
              )}
            </section>
          )}
          {tab === "requests" && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
              <h2 className="text-xl font-bold">Requests & hub assignments</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Older requests stay in your unassigned queue until you choose a hub. Event
                registrations follow their event’s hub.
              </p>
              <div className="my-5 grid gap-3 md:grid-cols-3">
                <label className="grid gap-2 text-sm font-semibold">
                  Request type
                  <select
                    value={requestType}
                    onChange={(event) => {
                      setRequestType(event.target.value as ScopedSubmissionTable);
                      setAssignment({});
                    }}
                    className={inputClass}
                  >
                    {SCOPED_SUBMISSION_TABLES.map((table) => (
                      <option key={table} value={table}>
                        {HUB_SUBMISSION_LABELS[table]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Hub
                  <select
                    value={hubFilter}
                    onChange={(event) => setHubFilter(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">All hubs</option>
                    <option value="unassigned">Unassigned</option>
                    {data.hubs.map((hub) => (
                      <option key={hub.id} value={hub.id}>
                        {hub.city}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold">
                  Search
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Name, email or phone"
                    className={inputClass}
                  />
                </label>
              </div>
              <p className="mb-3 text-sm text-slate-500">{filtered.length} requests</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-slate-500">
                      {["Applicant", "Hub", "Status", "Submitted", "Assignment"].map((label) => (
                        <th key={label} className="px-3 py-3 font-semibold">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="max-w-64 px-3 py-4">
                          <p className="font-semibold">
                            {String(
                              row.name || row.founder_name || row.startup_name || "Applicant",
                            )}
                          </p>
                          <p className="mt-1 break-all text-xs text-slate-500">
                            {String(row.email || "")}
                          </p>
                        </td>
                        <td className="px-3 py-4">{hubName(row.hub_id)}</td>
                        <td className="px-3 py-4 capitalize">{row.status}</td>
                        <td className="px-3 py-4">
                          {new Date(row.created_at).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-3 py-4">
                          {requestType === "event_registrations" ? (
                            <span className="text-xs text-slate-500">
                              {row.event_id
                                ? "Linked to event"
                                : "Legacy registration · owner only"}
                            </span>
                          ) : (
                            <div className="flex gap-2">
                              <select
                                aria-label={`Assign ${String(row.name || row.founder_name || "request")} to hub`}
                                className={inputClass}
                                value={assignment[row.id] ?? row.hub_id ?? ""}
                                disabled={busy}
                                onChange={(event) =>
                                  setAssignment((current) => ({
                                    ...current,
                                    [row.id]: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Unassigned</option>
                                {data.hubs.map((hub) => (
                                  <option key={hub.id} value={hub.id}>
                                    {hub.city}
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={
                                  busy ||
                                  assignment[row.id] === undefined ||
                                  assignment[row.id] === (row.hub_id ?? "")
                                }
                                className={buttonClass}
                                onClick={() => void transfer(row)}
                              >
                                Save
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filtered.length && (
                <p className="py-10 text-center text-sm text-slate-500">
                  No requests match these filters.
                </p>
              )}
              <a
                href={
                  {
                    startup_registrations: "/admin/startups",
                    community_join_applications: "/admin/community",
                    event_registrations: "/admin/events",
                    meeting_registrations: "/admin/meetings",
                  }[requestType]
                }
                className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-blue-700"
              >
                Open full {HUB_SUBMISSION_LABELS[requestType].toLowerCase()}
                <ArrowUpRight size={16} />
              </a>
            </section>
          )}
          {tab === "activity" && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-xl font-bold">Recent hub activity</h2>
                <label className="flex items-center gap-3 text-sm font-semibold">
                  Hub
                  <select
                    className={inputClass}
                    value={activityHubFilter}
                    onChange={(event) => setActivityHubFilter(event.target.value)}
                  >
                    <option value="">All hubs</option>
                    {data.hubs.map((hub) => (
                      <option key={hub.id} value={hub.id}>
                        {hub.city}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-sm text-slate-500">
                The latest 100 changes across your hubs.
              </p>
              <div className="mt-5 divide-y divide-slate-100">
                {data.activity
                  .filter((item) => !activityHubFilter || item.hub_id === activityHubFilter)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-start justify-between gap-3 py-4"
                    >
                      <div>
                        <p className="text-sm font-semibold">
                          {hubName(item.hub_id)} · {item.action.replaceAll("_", " ")}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.entity_type.replaceAll("_", " ")} ·{" "}
                          {data.managers.find((manager) => manager.user_id === item.actor_id)
                            ?.display_name ||
                            (item.actor_id ? "Owner / previous staff" : "Public visitor")}
                        </p>
                      </div>
                      <time className="text-xs text-slate-500">
                        {new Date(item.created_at).toLocaleString("en-IN")}
                      </time>
                    </div>
                  ))}
              </div>
              {!data.activity.some(
                (item) => !activityHubFilter || item.hub_id === activityHubFilter,
              ) && (
                <p className="py-10 text-center text-sm text-slate-500">
                  No activity recorded yet.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {editingEvent && (
        <HubEventEditor
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={async (published) => {
            setEditingEvent(null);
            setNotice(
              published ? "Event published on the public website." : "Event saved as a draft.",
            );
            await load();
          }}
        />
      )}
    </AdminShell>
  );
}
