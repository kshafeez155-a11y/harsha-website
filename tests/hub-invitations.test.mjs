import assert from "node:assert/strict";
import test from "node:test";

import { createManagerInvitationHandler } from "../supabase/functions/manage-hub-manager/handler.ts";

const settings = {
  url: "https://database.example.test", anonKey: "public-key", serviceKey: "private-service-key",
};
const ownerToken = "Bearer owner-session-token";
const body = { hub_id: "kadapa", email: "MANAGER@example.test", display_name: " Kadapa manager ", password: "password1234" };
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

function setup(responses = [], overrides = {}) {
  const calls = [];
  const handler = createManagerInvitationHandler({ ...settings, ...overrides }, async (url, options = {}) => {
    calls.push({ url, ...options });
    if (!responses.length) throw new Error("Unexpected network request");
    const response = responses.shift();
    if (response instanceof Error) throw response;
    return response;
  });
  return { handler, calls };
}

function request(value = body, { method = "POST", authorization = ownerToken, rawBody } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (authorization !== null) headers.set("Authorization", authorization);
  return new Request("https://edge.example.test/manage-hub-manager", {
    method, headers, ...(["POST", "PUT"].includes(method) ? { body: rawBody ?? JSON.stringify(value) } : {}),
  });
}

test("preflight and unsupported methods do not perform any account operations", async () => {
  const { handler, calls } = setup();
  const preflight = await handler(request(null, { method: "OPTIONS", authorization: null }));
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Methods"), /POST/);
  assert.equal((await handler(request(null, { method: "GET" }))).status, 405);
  assert.deepEqual(calls, []);
});

test("incomplete invitation configuration returns an actionable response before making requests", async () => {
  for (const key of ["url", "anonKey", "serviceKey"]) {
    const { handler, calls } = setup([], { [key]: "" });
    const response = await handler(request());
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /not configured/);
    assert.deepEqual(calls, []);
  }
});

test("missing credentials and rejected sessions cannot reach permission checks or invitations", async () => {
  for (const authorization of [null, "Basic forged", "forged"]) {
    const { handler, calls } = setup();
    assert.equal((await handler(request(body, { authorization }))).status, 401);
    assert.deepEqual(calls, []);
  }
  const { handler, calls } = setup([jsonResponse({ error: "Invalid token" }, 401)]);
  assert.equal((await handler(request())).status, 401);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${settings.url}/auth/v1/user`);
  assert.equal(calls[0].headers.Authorization, ownerToken);
  assert.equal(calls[0].headers.apikey, settings.anonKey);
});

test("editable administrator claims and nonboolean RPC responses cannot authorize an invitation", async () => {
  for (const permission of [false, null, { is_admin: true }, "true"]) {
    const { handler, calls } = setup([
      jsonResponse({ id: "ordinary-user", user_metadata: { role: "admin" } }),
      jsonResponse(permission),
    ]);
    assert.equal((await handler(request())).status, 403);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.headers.apikey === settings.anonKey));
    assert.equal(calls.some((call) => call.url.includes("/invite")), false);
  }
});

test("permission lookup failures stop before account assignment or invitation", async () => {
  const { handler, calls } = setup([jsonResponse({ id: "owner" }), jsonResponse({ error: "Unavailable" }, 500)]);
  assert.equal((await handler(request())).status, 403);
  assert.equal(calls.length, 2);
});

test("invalid hub, email, name or JSON is rejected after authorization without account changes", async () => {
  const badBodies = [null, {}, { ...body, hub_id: "../other" }, { ...body, email: "bad" },
    { ...body, display_name: " " }, { ...body, display_name: "a".repeat(151) }, { ...body, email: `${"a".repeat(250)}@x.test` }];
  for (const value of badBodies) {
    const { handler, calls } = setup([jsonResponse({ id: "owner" }), jsonResponse(true)]);
    assert.equal((await handler(request(value))).status, 400);
    assert.equal(calls.length, 2);
  }
  const { handler, calls } = setup([jsonResponse({ id: "owner" }), jsonResponse(true)]);
  assert.equal((await handler(request(body, { rawBody: "{not valid JSON" }))).status, 400);
  assert.equal(calls.length, 2);
});

test("existing users are assigned with the caller's session and never invoke the Auth admin API when no password is provided", async () => {
  const { handler, calls } = setup([jsonResponse({ id: "owner" }), jsonResponse(true), jsonResponse({ hub_id: "kadapa" })]);
  const response = await handler(request({ hub_id: "kadapa", email: "MANAGER@example.test", display_name: " Kadapa manager ", role: "admin" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { created: false, passwordUpdated: false });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url, `${settings.url}/rest/v1/rpc/assign_hub_manager`);
  assert.deepEqual(JSON.parse(calls[2].body), {
    p_hub_id: "kadapa", p_email: "manager@example.test", p_display_name: "Kadapa manager",
  });
  assert.ok(calls.every((call) => call.headers.Authorization === ownerToken));
  assert.ok(calls.every((call) => call.headers.apikey === settings.anonKey));
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("invalid assignments do not create accounts, even when the caller is an owner", async () => {
  for (const code of ["42501", "23503", "23505", "23514"]) {
    const { handler, calls } = setup([
      jsonResponse({ id: "owner" }), jsonResponse(true), jsonResponse({ code, message: "Cannot assign this account" }, 400),
    ]);
    const response = await handler(request());
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "Cannot assign this account");
    assert.equal(calls.length, 3);
    assert.equal(calls.some((call) => call.url.includes("/admin/users")), false);
  }
});

test("new users are created with email and password only after the owner and missing account are verified, then assigned with the owner session", async () => {
  const { handler, calls } = setup([
    jsonResponse({ id: "owner" }), jsonResponse(true), jsonResponse({ code: "P0002" }, 404),
    jsonResponse({ id: "new-manager" }), jsonResponse({ hub_id: "kadapa" }),
  ]);
  const response = await handler(request({ ...body, role: "admin", active: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { created: true, passwordUpdated: true });
  assert.equal(calls.length, 5);
  const creation = calls[3];
  assert.equal(new URL(creation.url).pathname, "/auth/v1/admin/users");
  assert.deepEqual(JSON.parse(creation.body), {
    email: "manager@example.test",
    password: "password1234",
    email_confirm: true,
    user_metadata: { display_name: "Kadapa manager" },
  });
  assert.equal(creation.headers.Authorization, `Bearer ${settings.serviceKey}`);
  assert.equal(creation.headers.apikey, settings.serviceKey);
  assert.equal(calls[4].headers.Authorization, ownerToken);
  assert.equal(calls[4].headers.apikey, settings.anonKey);
  assert.equal(calls[4].body, calls[2].body);
  assert.equal(calls.filter((call) => call.headers.apikey === settings.serviceKey).length, 1);
});

test("failed account creation does not claim a successful creation or proceed to a final assignment", async () => {
  const { handler, calls } = setup([
    jsonResponse({ id: "owner" }), jsonResponse(true), jsonResponse({ code: "P0002" }, 404),
    jsonResponse({ error: "Auth unavailable" }, 500),
  ]);
  const response = await handler(request());
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /could not be created/);
  assert.equal(calls.length, 4);
});

test("a created account with failed assignment reports the recoverable partial result", async () => {
  const { handler, calls } = setup([
    jsonResponse({ id: "owner" }), jsonResponse(true), jsonResponse({ code: "P0002" }, 404),
    jsonResponse({ id: "new-manager" }), jsonResponse({ error: "Assignment changed concurrently" }, 409),
  ]);
  const response = await handler(request());
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /account was created.*Click Save again/i);
  assert.equal(calls.length, 5);
});

test("network failures return a generic unavailable result without exposing keys or backend details", async () => {
  const { handler, calls } = setup([new Error(`Network detail ${settings.serviceKey}`)]);
  const response = await handler(request());
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.doesNotMatch(text, /private-service-key|Network detail/);
  assert.equal(calls.length, 1);
});
