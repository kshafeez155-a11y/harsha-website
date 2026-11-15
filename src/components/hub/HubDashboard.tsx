import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  RefreshCw,
  Settings,
  Users,
  X,
} from "lucide-react";

import {
  loadHubActivity,
  loadHubEvents,
  loadHubs,
  loadHubSubmissions,
  type HubActivity,
  type HubManager,
  type HubSubmission,
} from "@/lib/hub-management";
import { supabase } from "@/lib/supabase";
import { HubAccount } from "./HubAccount";
import { HubEvents } from "./HubEvents";
import { HubProfileEditor } from "./HubProfileEditor";
import { HubSubmissions } from "./HubSubmissions";
import {
  Busy,
  errorText,
  formatDate,
  Notice,
  panelClass,
  secondaryButtonClass,
  StatusBadge,
} from "./shared";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "applications", label: "Startup applications", icon: Building2 },
  { id: "community", label: "Community", icon: Users },
  { id: "events", label: "Events & attendance", icon: CalendarDays },
  { id: "meetings", label: "Meeting requests", icon: MessageSquare },
  { id: "profile", label: "Hub profile", icon: MapPin },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "account", label: "My account", icon: Settings },
] as const;
type View = (typeof navigation)[number]["id"];

async function loadDashboard(manager: HubManager) {
  const identity = await supabase.auth.getUser();
  if (identity.error || identity.data.user?.id !== manager.user_id) {
    throw new Error("Your session has changed. Please sign in again.");
  }
  // Membership is checked against the database on every refresh, so disabling
  // an assignment takes effect without waiting for a token to expire.
  const membership = await supabase
    .from("hub_managers")
    .select("*")
    .eq("user_id", manager.user_id)
    .eq("hub_id", manager.hub_id)
    .eq("active", true)
    .maybeSingle();
  if (membership.error) throw new Error("We could not verify your hub access. Please retry.");
  if (!membership.data)
    throw new Error(
      "Your hub assignment has changed or been disabled. Contact the owner for access.",
    );
  const [hubs, events, startups, community, registrations, meetings, activity] = await Promise.all([
    loadHubs(supabase),
    loadHubEvents(supabase, { hubId: manager.hub_id }),
    loadHubSubmissions(supabase, "startup_registrations", manager.hub_id),
    loadHubSubmissions(supabase, "community_join_applications", manager.hub_id),
    loadHubSubmissions(supabase, "event_registrations", manager.hub_id),
    loadHubSubmissions(supabase, "meeting_registrations", manager.hub_id),
    loadHubActivity(supabase, manager.hub_id),
  ]);
  const hub = hubs.find((item) => item.id === manager.hub_id);
  if (!hub) throw new Error("Your assigned hub is unavailable. Contact the owner.");
  return {
    hub,
    events,
    startups,
    community,
    registrations,
    meetings,
    activity,
    manager: membership.data as HubManager,
  };
}

type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;

export function HubDashboard({ manager }: { manager: HubManager }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const key = ["hub-dashboard", manager.user_id, manager.hub_id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => loadDashboard(manager),
    retry: false,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session?.user && session.user.id !== manager.user_id)) {
        queryClient.clear();
        void navigate({ to: "/admin/login" });
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [manager.user_id, navigate, queryClient]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setAccountError(null);
    try {
      const result = await supabase.auth.signOut();
      if (result.error) throw result.error;
      queryClient.clear();
      await navigate({ to: "/admin/login" });
    } catch (error) {
      setAccountError(errorText(error));
      setSigningOut(false);
    }
  }
  async function refresh() {
    await query.refetch({ throwOnError: true });
  }
  function switchView(next: View) {
    setView(next);
    setMenuOpen(false);
  }
  const label = navigation.find((item) => item.id === view)?.label;
  // Never display retained private data after an authorization or refresh error.
  const data = query.isError ? undefined : query.data;

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-slate-950 px-4 py-5 text-white transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between gap-3 px-3 pb-6">
          <a href="/" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#d9f85a] text-lg font-black text-slate-950">
              H
            </span>
            <span>
              <span className="block text-lg font-bold">Hanova</span>
              <span className="block text-[11px] uppercase tracking-[0.2em] text-slate-400">
                Hub manager
              </span>
            </span>
          </a>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          >
            <X size={21} />
          </button>
        </div>
        <div className="mb-5 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#d9f85a]">
            Your assigned hub
          </p>
          <p className="mt-2 text-lg font-bold">{data?.hub.city ?? "My hub"}</p>
          <p className="mt-1 truncate text-xs text-slate-400">
            {data?.manager.display_name ?? manager.display_name}
          </p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Hub manager navigation">
          {navigation.map(({ id, label: title, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => switchView(id)}
              aria-current={view === id ? "page" : undefined}
              className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition ${view === id ? "bg-[#d9f85a] text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
            >
              <Icon size={18} strokeWidth={1.8} />
              {title}
            </button>
          ))}
        </nav>
        <button
          type="button"
          disabled={signingOut}
          className="mt-4 flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-slate-300 hover:bg-white/10 disabled:opacity-50"
          onClick={() => void signOut()}
        >
          <LogOut size={18} />
          {signingOut ? "Signing out…" : "Log out"}
        </button>
      </aside>
      {menuOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 bg-[#f6f8fb]/95 px-4 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-200 lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
              <MapPin size={16} className="shrink-0" />
              <span className="hidden truncate sm:block">{data?.hub.city ?? "My hub"}</span>
              <ChevronRight size={15} className="hidden shrink-0 sm:block" />
              <span className="truncate font-medium text-slate-900">{label}</span>
            </div>
          </div>
          <button
            type="button"
            disabled={query.isFetching}
            aria-label="Refresh hub information"
            onClick={() => {
              void query.refetch();
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 disabled:opacity-50"
          >
            <RefreshCw size={15} className={query.isFetching ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </header>
        <main className="px-4 py-7 sm:px-8 sm:py-9">
          <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#6a7d00]">
                Hanova hub operations
              </p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {view === "overview" && data ? `${data.hub.city} Hub Dashboard` : label}
              </h1>
              <p className="mt-3 text-sm text-slate-500">
                Manage your local community and keep founders moving forward.
              </p>
            </div>
            {data && (
              <a
                className={secondaryButtonClass}
                href={`/hubs/${encodeURIComponent(data.hub.id)}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} />
                Public hub page
              </a>
            )}
          </div>
          <Notice message={accountError} error />
          {query.isPending && <Busy />}
          {query.isError && (
            <div className={panelClass}>
              <Notice message={errorText(query.error)} error />
              <p className="mb-5 text-sm leading-6 text-slate-500">
                Hub information could not be loaded. Retry, or sign in again if your access has
                changed.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={query.isFetching}
                  onClick={() => {
                    void query.refetch();
                  }}
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={signingOut}
                  onClick={() => void signOut()}
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
          {data && (
            <>
              {view === "overview" && <HubOverview data={data} onView={switchView} />}
              {view === "applications" && (
                <HubSubmissions
                  table="startup_registrations"
                  records={data.startups}
                  hubId={manager.hub_id}
                  title="Startup applications"
                  description="Review founder enquiries, record follow-ups and send ready applications to the owner for a final decision."
                  onSaved={refresh}
                />
              )}
              {view === "community" && (
                <HubSubmissions
                  table="community_join_applications"
                  records={data.community}
                  hubId={manager.hub_id}
                  title="Community applications & members"
                  description="Review local applications. Approved applicants form your hub's community member list; use the status filter to see members."
                  onSaved={refresh}
                />
              )}
              {view === "events" && (
                <HubEvents
                  events={data.events}
                  registrations={data.registrations}
                  hubId={manager.hub_id}
                  onSaved={refresh}
                />
              )}
              {view === "meetings" && (
                <HubSubmissions
                  table="meeting_registrations"
                  records={data.meetings}
                  hubId={manager.hub_id}
                  title="Meeting requests"
                  description="Confirm local meetings, keep follow-up notes and mark requests completed."
                  onSaved={refresh}
                />
              )}
              {view === "profile" && (
                <HubProfileEditor key={data.hub.id} hub={data.hub} onSaved={refresh} />
              )}
              {view === "activity" && <HubActivityList activities={data.activity} />}
              {view === "account" && <HubAccount manager={data.manager} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function HubOverview({ data, onView }: { data: DashboardData; onView(view: View): void }) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const upcoming = data.events.filter((event) => event.is_published && event.date >= today);
  const pendingStartups = data.startups.filter((record) => record.status === "pending").length;
  const pendingCommunity = data.community.filter((record) => record.status === "pending").length;
  const pendingMeetings = data.meetings.filter((record) => record.status === "pending").length;
  const cards = [
    {
      label: "Startup applications",
      value: data.startups.length,
      note: `${pendingStartups} awaiting review`,
      icon: Building2,
      view: "applications" as View,
    },
    {
      label: "Community members",
      value: data.community.filter((record) => record.status === "approved").length,
      note: `${pendingCommunity} new applications`,
      icon: Users,
      view: "community" as View,
    },
    {
      label: "Upcoming events",
      value: upcoming.length,
      note: `${data.registrations.length} event registrations`,
      icon: CalendarDays,
      view: "events" as View,
    },
    {
      label: "Meeting requests",
      value: data.meetings.length,
      note: `${pendingMeetings} awaiting confirmation`,
      icon: MessageSquare,
      view: "meetings" as View,
    },
  ];
  const recent: Array<HubSubmission & { type: string; view: View }> = [
    ...data.startups.map((record) => ({
      ...record,
      type: "Startup application",
      view: "applications" as View,
    })),
    ...data.community.map((record) => ({
      ...record,
      type: "Community application",
      view: "community" as View,
    })),
    ...data.registrations.map((record) => ({
      ...record,
      type: "Event registration",
      view: "events" as View,
    })),
    ...data.meetings.map((record) => ({
      ...record,
      type: "Meeting request",
      view: "meetings" as View,
    })),
  ]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 6);
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, note, icon: Icon, view }) => (
          <button
            key={label}
            type="button"
            className={`${panelClass} group text-left transition hover:border-slate-400`}
            onClick={() => onView(view)}
          >
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-[#f0f5dd] text-[#6a7d00]">
                <Icon size={20} />
              </span>
              <ArrowUpRight size={17} className="text-slate-400 group-hover:text-slate-900" />
            </div>
            <p className="mt-5 text-3xl font-bold">{value}</p>
            <p className="mt-1 text-sm font-semibold">{label}</p>
            <p className="mt-2 text-xs text-slate-500">{note}</p>
          </button>
        ))}
      </div>
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-slate-950 px-6 py-6 text-white">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#d9f85a]">
            Your local community
          </p>
          <h2 className="mt-2 text-xl font-bold">
            Welcome, {data.manager.display_name || "hub manager"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            {data.hub.city}, {data.hub.district} · {data.hub.status}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onView("profile")}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#d9f85a] px-5 text-sm font-semibold text-slate-950"
        >
          Update hub profile
          <ArrowUpRight size={16} />
        </button>
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className={panelClass}>
          <h2 className="mb-5 text-lg font-bold">Latest requests</h2>
          {recent.length ? (
            <div className="divide-y divide-slate-100">
              {recent.map((record) => (
                <button
                  key={`${record.type}:${record.id}`}
                  type="button"
                  className="flex w-full flex-wrap items-center justify-between gap-3 py-4 text-left hover:bg-slate-50"
                  onClick={() => onView(record.view)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {String(record.name || record.founder_name || "Applicant")}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {record.type} · {formatDate(record.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={record.status} />
                </button>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              New hub requests will appear here.
            </p>
          )}
        </section>
        <section className={panelClass}>
          <h2 className="mb-5 text-lg font-bold">Upcoming events</h2>
          {upcoming.length ? (
            <div className="grid gap-4">
              {upcoming.slice(0, 4).map((event) => (
                <div key={event.id} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold">{event.title}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {formatDate(event.date)} · {event.time}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{event.venue}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-5 text-center">
              <CalendarDays className="mx-auto text-slate-400" size={28} />
              <p className="mt-3 text-sm text-slate-500">No published upcoming events.</p>
            </div>
          )}
          <button
            className={`${secondaryButtonClass} mt-5 w-full`}
            type="button"
            onClick={() => onView("events")}
          >
            Manage events
          </button>
        </section>
      </div>
    </div>
  );
}

function HubActivityList({ activities }: { activities: HubActivity[] }) {
  const labels: Record<string, string> = {
    hubs: "Hub profile",
    hub_events: "Event",
    startup_registrations: "Startup application",
    community_join_applications: "Community application",
    event_registrations: "Event registration",
    meeting_registrations: "Meeting request",
    hub_managers: "Manager assignment",
  };
  return (
    <section className={panelClass}>
      <h2 className="text-xl font-bold">Recent hub activity</h2>
      <p className="mt-2 text-sm text-slate-500">
        Changes to your hub's profile, events and requests.
      </p>
      {activities.length ? (
        <ol className="mt-6 divide-y divide-slate-100">
          {activities.map((activity) => (
            <li key={activity.id} className="flex items-start gap-3 py-4">
              <span className="mt-0.5 rounded-full bg-emerald-50 p-2 text-emerald-700">
                <CheckCircle2 size={16} />
              </span>
              <div>
                <p className="text-sm font-medium">
                  {labels[activity.entity_type] ?? "Hub record"} ·{" "}
                  <span className="capitalize">
                    {activity.action.replaceAll("_", " ").toLowerCase()}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDate(activity.created_at)} ·{" "}
                  {new Intl.DateTimeFormat("en-IN", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(activity.created_at))}{" "}
                  IST
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-12 text-center text-sm text-slate-500">
          Activity will appear after your first update.
        </p>
      )}
    </section>
  );
}
