import assert from "node:assert/strict";
import test from "node:test";

import { checkStaffAccess } from "../src/lib/staff-access.ts";

const manager = {
  hub_id: "kadapa", user_id: "manager-id", display_name: "Kadapa lead",
  email: "lead@example.test", active: true,
};
const normalUser = { id: "manager-id", app_metadata: {}, user_metadata: { role: "admin", hub_id: "anantapur" } };

function fakeClient({ user = normalUser, identityError = null, membership = manager,
  membershipError = null, permissions = [true], throwing = false } = {}) {
  const calls = [];
  let permissionCall = 0;
  const query = {
    select(...args) { calls.push(["select", ...args]); return query; },
    eq(...args) { calls.push(["eq", ...args]); return query; },
    async maybeSingle() {
      calls.push(["maybeSingle"]);
      if (throwing) throw new Error("Network failed");
      return { data: membership, error: membershipError };
    },
  };
  const client = {
    auth: {
      async getUser() { calls.push(["getUser"]); return { data: { user }, error: identityError }; },
      async refreshSession() { calls.push(["refreshSession"]); return { error: null }; },
    },
    from(name) { calls.push(["from", name]); return query; },
    async rpc(name) {
      calls.push(["rpc", name]);
      return { data: permissions[Math.min(permissionCall++, permissions.length - 1)], error: null };
    },
  };
  return { client, calls };
}

test("staff routing reads a fresh active assignment for the authenticated user", async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await checkStaffAccess(client), { allowed: true, role: "hub_manager", manager });
  assert.deepEqual(calls, [
    ["getUser"], ["from", "hub_managers"], ["select", "*"],
    ["eq", "user_id", "manager-id"], ["eq", "active", true], ["maybeSingle"],
  ]);
});

test("editable role and hub metadata never substitutes for a valid DB assignment", async () => {
  for (const membership of [null, { ...manager, active: false }, { ...manager, user_id: "another-person" }]) {
    const { client, calls } = fakeClient({ membership });
    const result = await checkStaffAccess(client);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "forbidden");
    assert.equal(calls.some(([method]) => method === "rpc"), false);
  }
});

test("missing or invalid sessions stop staff access before any assignment queries", async () => {
  for (const options of [{ user: null }, { identityError: new Error("Expired") }]) {
    const { client, calls } = fakeClient(options);
    const result = await checkStaffAccess(client);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "session");
    assert.deepEqual(calls, [["getUser"]]);
  }
});

test("database and network errors fail closed with an unavailable result", async () => {
  for (const options of [{ membershipError: { message: "Policy failed" } }, { throwing: true }]) {
    const { client } = fakeClient(options);
    const result = await checkStaffAccess(client);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "unavailable");
  }
});

test("an owner must pass the existing verified database administrator check", async () => {
  const { client, calls } = fakeClient({ user: { id: "owner-id", app_metadata: { role: "admin" } } });
  assert.deepEqual(await checkStaffAccess(client), { allowed: true, role: "admin" });
  assert.equal(calls.some(([method]) => method === "from"), false);
  assert.equal(calls.filter(([method]) => method === "rpc").length, 1);
});

test("owner metadata cannot grant access when database permission has been revoked", async () => {
  const { client, calls } = fakeClient({ user: { id: "owner-id", app_metadata: { role: "admin" } }, permissions: [false] });
  const result = await checkStaffAccess(client);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden");
  assert.equal(calls.filter(([method]) => method === "refreshSession").length, 1);
  assert.equal(calls.some(([method]) => method === "from"), false);
});

test("revocation is respected on the next access check without a new token", async () => {
  const { client } = fakeClient();
  assert.equal((await checkStaffAccess(client)).allowed, true);
  manager.active = false;
  try {
    assert.equal((await checkStaffAccess(client)).allowed, false);
  } finally { manager.active = true; }
});
