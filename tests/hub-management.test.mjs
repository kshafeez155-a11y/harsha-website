import assert from "node:assert/strict";
import test from "node:test";

import {
  assignHubManager, assignSubmissionHub, createHub, hubEventPayload, hubProfilePayload,
  loadHubActivity, loadHubEvents, loadHubSubmissions, saveHubEvent, saveHubProfile,
  setHubManagerActive, updateHubSubmission,
} from "../src/lib/hub-management.ts";

function fakeClient(result = { data: [], error: null }, rpcResults = [], functionResult = { data: { invited: true }, error: null }) {
  const calls = [];
  let rpcCall = 0;
  const query = {
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    async single() { calls.push(["single"]); return result; },
  };
  for (const method of ["select", "insert", "update", "delete", "eq", "order", "limit"]) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  return {
    calls,
    client: {
      from(table) { calls.push(["from", table]); return query; },
      async rpc(...args) { calls.push(["rpc", ...args]); return rpcResults[rpcCall++] || { data: {}, error: null }; },
      functions: { async invoke(...args) { calls.push(["invoke", ...args]); return functionResult; } },
    },
  };
}

const hub = {
  id: "kadapa", city: "Kadapa", district: "YSR Kadapa", status: "Active",
  summary: " Local summary ", description: " Detailed description ",
  focus_areas: [" Ideas ", ""], facilities: [" Mentors "],
  contact_name: " Lead ", contact_email: "lead@example.test", contact_phone: " 9000000000 ",
};
const event = {
  id: "existing-event", hub_id: "kadapa", title: " Local meetup ", date: "2027-02-28",
  time: " 10:00 AM ", venue: " Local hall ", type: " Workshop ", summary: " Learn together ", is_published: true,
};

test("public and manager event queries apply their requested publication and hub scope", async () => {
  const { client, calls } = fakeClient();
  await loadHubEvents(client, { hubId: "kadapa", publishedOnly: true });
  assert.deepEqual(calls, [
    ["from", "hub_events"], ["select", "*"], ["eq", "hub_id", "kadapa"],
    ["eq", "is_published", true], ["order", "date"],
  ]);
});

test("manager intake and activity queries preserve hub filters and bounded recent activity", async () => {
  const { client, calls } = fakeClient();
  await loadHubSubmissions(client, "meeting_registrations", "anantapur");
  await loadHubActivity(client, "anantapur");
  assert.deepEqual(calls, [
    ["from", "meeting_registrations"], ["select", "*"], ["eq", "hub_id", "anantapur"], ["order", "created_at", { ascending: false }],
    ["from", "hub_activity"], ["select", "*"], ["eq", "hub_id", "anantapur"], ["order", "created_at", { ascending: false }], ["limit", 100],
  ]);
});

test("request helpers reject arbitrary table access before constructing a query", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(loadHubSubmissions(client, "auth.users", "kadapa"), /Unsupported/);
  await assert.rejects(updateHubSubmission(client, "hub_managers", "id", { status: "approved" }), /Unsupported/);
  await assert.rejects(assignSubmissionHub(client, "contact_submissions", "id", "kadapa"), /Unsupported/);
  assert.deepEqual(calls, []);
});

test("manager updates allow only status and notes, retain both identity filters, and trim notes", async () => {
  const saved = { id: "request-id", status: "confirmed" };
  const { client, calls } = fakeClient({ data: saved, error: null });
  const actual = await updateHubSubmission(client, "meeting_registrations", "request-id", {
    status: "confirmed", follow_up_notes: " Contacted visitor ",
    hub_id: "anantapur", phone: "overwrite", created_at: "forged",
  }, "kadapa");
  assert.equal(actual, saved);
  assert.deepEqual(calls, [
    ["from", "meeting_registrations"], ["update", { status: "confirmed", follow_up_notes: "Contacted visitor" }],
    ["eq", "id", "request-id"], ["eq", "hub_id", "kadapa"], ["select", "*"], ["single"],
  ]);
});

test("empty, oversized and missing-record updates are reported rather than succeeding silently", async () => {
  const { client, calls } = fakeClient({ data: null, error: null });
  await assert.rejects(updateHubSubmission(client, "meeting_registrations", "", { status: "confirmed" }), /Choose/);
  await assert.rejects(updateHubSubmission(client, "meeting_registrations", "id", {}), /no changes/i);
  await assert.rejects(updateHubSubmission(client, "meeting_registrations", "id", { follow_up_notes: "a".repeat(10001) }), /10,000/);
  assert.deepEqual(calls, []);
  await assert.rejects(updateHubSubmission(client, "meeting_registrations", "id", { status: "confirmed" }), /no longer available/);
});

test("profile payloads exclude identity, location, status and arbitrary injected fields", async () => {
  const payload = hubProfilePayload({ ...hub, is_admin: true, updated_at: "forged" });
  assert.deepEqual(payload, {
    summary: "Local summary", description: "Detailed description", focus_areas: ["Ideas"], facilities: ["Mentors"],
    contact_name: "Lead", contact_email: "lead@example.test", contact_phone: "9000000000",
  });
  const { client, calls } = fakeClient({ data: hub, error: null });
  await saveHubProfile(client, hub);
  assert.deepEqual(calls[1], ["update", payload]);
  assert.deepEqual(calls[2], ["eq", "id", "kadapa"]);
  assert.throws(() => hubProfilePayload({ ...hub, contact_email: "bad email" }), /valid contact email/);
  const createdHub = await createHub(client, {
    city: "Guntur City",
    district: "Guntur",
    status: "Active",
    summary: "Regional hub in Guntur",
    description: "Supporting founders in Guntur.",
  });
  assert.equal(createdHub, hub);
  const insertCall = calls.find(([method]) => method === "insert");
  assert.equal(insertCall[1].id, "guntur-city");
  assert.equal(insertCall[1].city, "Guntur City");
  assert.equal(insertCall[1].district, "Guntur");
  assert.equal(insertCall[1].status, "Active");
});

test("event payloads validate actual calendar dates and required content", () => {
  for (const date of ["2027-02-29", "2027-13-01", "2027-04-31", "01/02/2027", "bad"]) {
    assert.throws(() => hubEventPayload({ ...event, date }), /valid event date/);
  }
  assert.equal(hubEventPayload({ ...event, date: "2028-02-29" }).date, "2028-02-29");
  for (const field of ["hub_id", "title", "time", "venue", "type", "summary"]) {
    assert.throws(() => hubEventPayload({ ...event, [field]: " " }), /required/);
  }
  assert.equal(hubEventPayload({ ...event, is_published: "true" }).is_published, false);
});

test("updating an event cannot rewrite its hub or identity and uses its original ownership as a filter", async () => {
  const { client, calls } = fakeClient({ data: event, error: null });
  await saveHubEvent(client, { ...event, actor_id: "forged" });
  const update = calls.find(([method]) => method === "update")[1];
  assert.equal("hub_id" in update, false);
  assert.equal("id" in update, false);
  assert.equal("actor_id" in update, false);
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["eq", "id", "existing-event"])));
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["eq", "hub_id", "kadapa"])));
});

test("new events use a generated identity and preserve only permitted event fields", async () => {
  const { client, calls } = fakeClient({ data: event, error: null });
  await saveHubEvent(client, { ...event, id: "", actor_id: "forged" });
  const insert = calls.find(([method]) => method === "insert")[1];
  assert.match(insert.id, /^[0-9a-f-]{36}$/);
  assert.equal(insert.hub_id, "kadapa");
  assert.equal("actor_id" in insert, false);
  assert.equal(calls.some(([method]) => method === "update"), false);
});

test("event registrations cannot be moved to a different hub by the allocation helper", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(assignSubmissionHub(client, "event_registrations", "id", "anantapur"), /event's hub/);
  assert.deepEqual(calls, []);
});

test("owner allocations and manager revocations save only the intended field and require a real returned row", async () => {
  const { client, calls } = fakeClient({ data: { id: "id" }, error: null });
  await assignSubmissionHub(client, "meeting_registrations", "id", null);
  await setHubManagerActive(client, "kadapa", false);
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["update", { hub_id: null }])));
  assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(["update", { active: false }])));
  const unavailable = fakeClient({ data: null, error: null }).client;
  await assert.rejects(setHubManagerActive(unavailable, "kadapa", false), /no longer exists/);
});

test("existing accounts are assigned by authenticated RPC without invoking the edge function when no password is set", async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await assignHubManager(client, "kadapa", "LEAD@EXAMPLE.TEST", " Local lead "), {
    invited: false,
    created: false,
    passwordUpdated: false,
  });
  assert.deepEqual(calls, [["rpc", "assign_hub_manager", {
    p_hub_id: "kadapa", p_email: "lead@example.test", p_display_name: "Local lead",
  }]]);
});

test("providing a password or a missing Auth account invokes the manage-hub-manager function", async () => {
  const { client, calls } = fakeClient(undefined, [{ data: null, error: { code: "P0002", message: "Missing account" } }], {
    data: { invited: false, created: true, passwordUpdated: true },
    error: null,
  });
  assert.deepEqual(await assignHubManager(client, "kadapa", "lead@example.test", "Lead", "password1234"), {
    invited: false,
    created: true,
    passwordUpdated: true,
  });
  assert.deepEqual(calls[0], ["invoke", "manage-hub-manager", {
    body: { hub_id: "kadapa", email: "lead@example.test", display_name: "Lead", password: "password1234" },
  }]);
  const forbidden = fakeClient(undefined, [{ data: null, error: { code: "42501", message: "Owner required" } }]);
  await assert.rejects(assignHubManager(forbidden.client, "kadapa", "lead@example.test", "Lead"), /Owner required/);
  assert.equal(forbidden.calls.some(([method]) => method === "invoke"), false);
});

test("failed invitation responses preserve actionable server errors and data failures propagate", async () => {
  const { client } = fakeClient(undefined, [{ data: null, error: { code: "P0002" } }], {
    data: null, error: { context: new Response(JSON.stringify({ error: "Email delivery not configured" }), { status: 502 }) },
  });
  await assert.rejects(assignHubManager(client, "kadapa", "lead@example.test", "Lead"), /Email delivery not configured/);
  const failedQuery = fakeClient({ data: null, error: { message: "Hub access revoked" } }).client;
  await assert.rejects(loadHubEvents(failedQuery, { hubId: "kadapa" }), /Hub access revoked/);
});
