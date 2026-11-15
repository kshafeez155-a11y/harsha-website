import type { SupabaseClient } from "@supabase/supabase-js";

export type HubRecord = {
  id: string;
  city: string;
  district: string;
  status: "Active" | "Network forming";
  summary: string;
  description: string;
  focus_areas: string[];
  facilities: string[];
  contact_name: string;
  contact_email: string;
  contact_phone: string;
};

export type HubEventRecord = {
  id: string;
  hub_id: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  type: string;
  summary: string;
  is_published: boolean;
};

export type HubManager = {
  hub_id: string;
  user_id: string;
  display_name: string;
  email: string;
  active: boolean;
};

export type HubActivity = {
  id: string;
  hub_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};

export const SCOPED_SUBMISSION_TABLES = [
  "startup_registrations",
  "community_join_applications",
  "event_registrations",
  "meeting_registrations",
] as const;
export type ScopedSubmissionTable = (typeof SCOPED_SUBMISSION_TABLES)[number];
export type HubSubmission = Record<string, unknown> & {
  id: string;
  hub_id: string | null;
  status: string;
  follow_up_notes: string;
  created_at: string;
};

export const HUB_SUBMISSION_LABELS: Record<ScopedSubmissionTable, string> = {
  startup_registrations: "Startup applications",
  community_join_applications: "Community applications",
  event_registrations: "Event registrations",
  meeting_registrations: "Meeting requests",
};

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function validTable(table: ScopedSubmissionTable) {
  if (!SCOPED_SUBMISSION_TABLES.includes(table)) throw new Error("Unsupported request type.");
}

export async function loadHubs(client: SupabaseClient): Promise<HubRecord[]> {
  const { data, error } = await client.from("hubs").select("*").order("city");
  fail(error);
  return (data ?? []) as HubRecord[];
}

export async function loadHubEvents(
  client: SupabaseClient,
  options: { hubId?: string; publishedOnly?: boolean } = {},
): Promise<HubEventRecord[]> {
  let query = client.from("hub_events").select("*");
  if (options.hubId) query = query.eq("hub_id", options.hubId);
  if (options.publishedOnly) query = query.eq("is_published", true);
  const { data, error } = await query.order("date");
  fail(error);
  return (data ?? []) as HubEventRecord[];
}

export async function loadHubManagers(client: SupabaseClient): Promise<HubManager[]> {
  const { data, error } = await client.from("hub_managers").select("*").order("hub_id");
  fail(error);
  return (data ?? []) as HubManager[];
}

export async function loadHubSubmissions(
  client: SupabaseClient,
  table: ScopedSubmissionTable,
  hubId?: string,
): Promise<HubSubmission[]> {
  validTable(table);
  let query = client.from(table).select("*");
  if (hubId) query = query.eq("hub_id", hubId);
  const { data, error } = await query.order("created_at", { ascending: false });
  fail(error);
  return (data ?? []) as HubSubmission[];
}

export async function updateHubSubmission(
  client: SupabaseClient,
  table: ScopedSubmissionTable,
  id: string,
  changes: { status?: string; follow_up_notes?: string },
  hubId?: string,
): Promise<HubSubmission> {
  validTable(table);
  if (!id) throw new Error("Choose a request first.");
  const payload: { status?: string; follow_up_notes?: string } = {};
  if (changes.status !== undefined) payload.status = changes.status;
  if (changes.follow_up_notes !== undefined) {
    if (changes.follow_up_notes.length > 10000)
      throw new Error("Follow-up notes must be under 10,000 characters.");
    payload.follow_up_notes = changes.follow_up_notes.trim();
  }
  if (!Object.keys(payload).length) throw new Error("There are no changes to save.");
  let query = client.from(table).update(payload).eq("id", id);
  if (hubId) query = query.eq("hub_id", hubId);
  const { data, error } = await query.select("*").single();
  fail(error);
  if (!data) throw new Error("This request is no longer available.");
  return data as HubSubmission;
}

export async function assignSubmissionHub(
  client: SupabaseClient,
  table: ScopedSubmissionTable,
  id: string,
  hubId: string | null,
): Promise<void> {
  validTable(table);
  // Event ownership comes from the event. Moving it would misroute attendees.
  if (table === "event_registrations")
    throw new Error("An event registration belongs to its event's hub.");
  const { data, error } = await client
    .from(table)
    .update({ hub_id: hubId })
    .eq("id", id)
    .select("id")
    .single();
  fail(error);
  if (!data) throw new Error("This request is no longer available.");
}

function required(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

export function hubProfilePayload(hub: HubRecord) {
  const email = hub.contact_email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid contact email.");
  return {
    summary: required(hub.summary, "Summary"),
    description: required(hub.description, "Description"),
    focus_areas: hub.focus_areas.map((item) => item.trim()).filter(Boolean),
    facilities: hub.facilities.map((item) => item.trim()).filter(Boolean),
    contact_name: hub.contact_name.trim(),
    contact_email: email,
    contact_phone: hub.contact_phone.trim(),
  };
}

export function hubSlugFromCity(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createHub(
  client: SupabaseClient,
  input: {
    id?: string;
    city: string;
    district: string;
    status?: "Active" | "Network forming";
    summary: string;
    description: string;
    focus_areas?: string[];
    facilities?: string[];
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;
  },
): Promise<HubRecord> {
  const city = required(input.city, "City / Hub name");
  const district = required(input.district, "District");
  const id = (input.id ? input.id.trim().toLowerCase() : hubSlugFromCity(city)) || "";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    throw new Error("Hub ID must contain lowercase letters, numbers, and hyphens.");
  }
  const status = input.status === "Network forming" ? "Network forming" : "Active";
  const profile = hubProfilePayload({
    id,
    city,
    district,
    status,
    summary: input.summary,
    description: input.description,
    focus_areas: input.focus_areas ?? ["Founder meetups", "Community building", "Startup guidance"],
    facilities: input.facilities ?? ["Community sessions", "Mentor introductions", "Event access"],
    contact_name: input.contact_name ?? "",
    contact_email: input.contact_email ?? "",
    contact_phone: input.contact_phone ?? "",
  });
  const { data, error } = await client
    .from("hubs")
    .insert({ id, city, district, status, ...profile })
    .select("*")
    .single();
  if (error?.code === "23505") {
    throw new Error("A hub with this name or ID already exists.");
  }
  fail(error);
  if (!data) throw new Error("Hub could not be created.");
  return data as HubRecord;
}

export async function saveHubProfile(
  client: SupabaseClient,
  hub: HubRecord,
  includeIdentity = false,
): Promise<HubRecord> {
  const payload = hubProfilePayload(hub);
  const fullPayload = includeIdentity
    ? {
        ...payload,
        city: required(hub.city, "City"),
        district: required(hub.district, "District"),
        status: hub.status === "Network forming" ? "Network forming" : "Active",
      }
    : payload;
  const { data, error } = await client
    .from("hubs")
    .update(fullPayload)
    .eq("id", required(hub.id, "Hub"))
    .select("*")
    .single();
  fail(error);
  if (!data) throw new Error("This hub is no longer available.");
  return data as HubRecord;
}

export function hubEventPayload(event: HubEventRecord) {
  const date = required(event.date, "Event date");
  const parsed = new Date(`${date}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("Enter a valid event date.");
  }
  return {
    hub_id: required(event.hub_id, "Hub"),
    title: required(event.title, "Event title"),
    date,
    time: required(event.time, "Event time"),
    venue: required(event.venue, "Venue"),
    type: required(event.type, "Event type"),
    summary: required(event.summary, "Event summary"),
    is_published: event.is_published === true,
  };
}

export async function saveHubEvent(
  client: SupabaseClient,
  event: HubEventRecord,
): Promise<HubEventRecord> {
  const payload = hubEventPayload(event);
  let query;
  if (event.id) {
    // Never include hub_id in an existing event's update.
    const { hub_id, ...changes } = payload;
    query = client.from("hub_events").update(changes).eq("id", event.id).eq("hub_id", hub_id);
  } else {
    query = client.from("hub_events").insert({ ...payload, id: crypto.randomUUID() });
  }
  const { data, error } = await query.select("*").single();
  fail(error);
  if (!data) throw new Error("This event is no longer available.");
  return data as HubEventRecord;
}

export async function loadHubActivity(
  client: SupabaseClient,
  hubId?: string,
): Promise<HubActivity[]> {
  let query = client.from("hub_activity").select("*");
  if (hubId) query = query.eq("hub_id", hubId);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
  fail(error);
  return (data ?? []) as HubActivity[];
}

export async function assignHubManager(
  client: SupabaseClient,
  hubId: string,
  email: string,
  displayName: string,
  password?: string,
): Promise<{ invited: boolean; created?: boolean; passwordUpdated?: boolean }> {
  const payload = {
    p_hub_id: required(hubId, "Hub"),
    p_email: required(email, "Email").toLowerCase(),
    p_display_name: required(displayName, "Manager name"),
  };
  const trimmedPassword = password ?? "";
  if (trimmedPassword && trimmedPassword.length < 8) {
    throw new Error("Choose a password with at least 8 characters.");
  }
  if (!trimmedPassword) {
    const result = await client.rpc("assign_hub_manager", payload);
    if (!result.error) return { invited: false, created: false, passwordUpdated: false };
    if (result.error.code !== "P0002") throw new Error(result.error.message);
  }
  const { data, error } = await client.functions.invoke("manage-hub-manager", {
    body: {
      hub_id: payload.p_hub_id,
      email: payload.p_email,
      display_name: payload.p_display_name,
      ...(trimmedPassword ? { password: trimmedPassword } : {}),
    },
  });
  if (error) {
    let message =
      "Manager account could not be saved. Check that the manage-hub-manager function is deployed, then retry.";
    if (error.context instanceof Response) {
      const body = await error.context.json().catch(() => null);
      if (typeof body?.error === "string") message = body.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return {
    invited: data?.invited === true,
    created: data?.created === true,
    passwordUpdated: data?.passwordUpdated === true,
  };
}

export async function setHubManagerActive(
  client: SupabaseClient,
  hubId: string,
  active: boolean,
): Promise<void> {
  const { data, error } = await client
    .from("hub_managers")
    .update({ active })
    .eq("hub_id", hubId)
    .select("hub_id")
    .single();
  fail(error);
  if (!data) throw new Error("The manager assignment no longer exists.");
}

export async function removeHubManager(client: SupabaseClient, hubId: string): Promise<void> {
  const { data, error } = await client
    .from("hub_managers")
    .delete()
    .eq("hub_id", hubId)
    .select("hub_id")
    .single();
  fail(error);
  if (!data) throw new Error("The manager assignment no longer exists.");
}
