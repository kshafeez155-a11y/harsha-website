import assert from "node:assert/strict";
import test from "node:test";

import { checkAdminAccess, isAdminUser } from "../src/lib/admin-access.ts";

const administrator = { app_metadata: { role: "admin" } };

function mockClient({
  users = [{ data: { user: administrator }, error: null }],
  permissions = [{ data: true, error: null }],
  refreshError = null,
  rpcThrows = false,
} = {}) {
  const calls = { getUser: 0, rpc: 0, refresh: 0 };
  const client = {
    auth: {
      async getUser() {
        const result = users[Math.min(calls.getUser, users.length - 1)];
        calls.getUser += 1;
        return result;
      },
      async refreshSession() {
        calls.refresh += 1;
        return { error: refreshError };
      },
    },
    async rpc(name) {
      assert.equal(name, "is_admin");
      const result = permissions[Math.min(calls.rpc, permissions.length - 1)];
      calls.rpc += 1;
      if (rpcThrows) throw new Error("Network request failed");
      return result;
    },
  };
  return { client, calls };
}

test("user-editable metadata and an email address cannot grant administrator access", () => {
  assert.equal(
    isAdminUser({
      app_metadata: {},
      user_metadata: { role: "admin", roles: ["admin"] },
      email: "admin@example.com",
    }),
    false,
  );
});

test("the role must match the database's exact app_metadata.role contract", () => {
  assert.equal(isAdminUser(administrator), true);
  for (const user of [
    null,
    undefined,
    {},
    { app_metadata: {} },
    { app_metadata: { role: "Admin" } },
    { app_metadata: { role: " admin " } },
    { app_metadata: { role: ["admin"] } },
    { app_metadata: { roles: ["admin"] } },
  ]) {
    assert.equal(isAdminUser(user), false);
  }
});

test("a verified account needs database authorization before dashboard access", async () => {
  const { client, calls } = mockClient();
  assert.deepEqual(await checkAdminAccess(client), { allowed: true });
  assert.deepEqual(calls, { getUser: 1, rpc: 1, refresh: 0 });
});

test("an absent or rejected session never reaches the database permission check", async () => {
  for (const identity of [
    { data: { user: null }, error: null },
    { data: { user: administrator }, error: new Error("Invalid token") },
  ]) {
    const { client, calls } = mockClient({ users: [identity] });
    const result = await checkAdminAccess(client);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "session");
    assert.equal(calls.rpc, 0);
  }
});

test("ordinary accounts are denied even if their editable metadata says admin", async () => {
  const { client, calls } = mockClient({
    users: [
      { data: { user: { app_metadata: {}, user_metadata: { role: "admin" } } }, error: null },
    ],
  });
  const result = await checkAdminAccess(client);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden");
  assert.equal(calls.rpc, 0);
});

test("a stale JWT is refreshed once and access is granted only after the database agrees", async () => {
  const { client, calls } = mockClient({
    permissions: [
      { data: false, error: null },
      { data: true, error: null },
    ],
  });
  assert.deepEqual(await checkAdminAccess(client), { allowed: true });
  assert.deepEqual(calls, { getUser: 2, rpc: 2, refresh: 1 });
});

test("database denial remains a permission error after one refresh", async () => {
  const { client, calls } = mockClient({ permissions: [{ data: false, error: null }] });
  const result = await checkAdminAccess(client);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden");
  assert.deepEqual(calls, { getUser: 2, rpc: 2, refresh: 1 });
});

test("a missing database permission function is reported as unavailable, not an empty dashboard", async () => {
  const { client, calls } = mockClient({
    permissions: [{ data: null, error: { code: "PGRST202", message: "Function not found" } }],
  });
  const result = await checkAdminAccess(client);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "unavailable");
  assert.match(result.message, /could not verify/i);
  assert.doesNotMatch(result.message, /PGRST202|Function not found/);
  assert.deepEqual(calls, { getUser: 2, rpc: 2, refresh: 1 });
});

test("revoking a role during a refresh prevents admission", async () => {
  const { client, calls } = mockClient({
    users: [
      { data: { user: administrator }, error: null },
      { data: { user: { app_metadata: {} } }, error: null },
    ],
    permissions: [{ data: false, error: null }],
  });
  const result = await checkAdminAccess(client);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "forbidden");
  assert.deepEqual(calls, { getUser: 2, rpc: 1, refresh: 1 });
});

test("an expired refresh token requires sign-in again", async () => {
  const { client, calls } = mockClient({
    permissions: [{ data: false, error: null }],
    refreshError: new Error("Refresh token expired"),
  });
  const result = await checkAdminAccess(client);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "session");
  assert.deepEqual(calls, { getUser: 1, rpc: 1, refresh: 1 });
});

test("network failures cannot authorize an account", async () => {
  const { client } = mockClient({ rpcThrows: true });
  const result = await checkAdminAccess(client);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "unavailable");
});
