import assert from "node:assert/strict";
import { test } from "node:test";

import { createSupabaseClients } from "../src/lib/supabase-clients.ts";

const projectUrl = "https://intake-test.supabase.co";
const anonKey = "public-anonymous-test-key";
const adminStorageKey = "sb-intake-test-auth-token";
const userId = "dc343f2a-eaf8-4b53-9174-10f58b95d5f5";

function createFixture() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const accessToken = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: userId, role: "authenticated", exp: expiresAt }),
    "test-signature",
  ].join(".");
  const session = {
    access_token: accessToken,
    refresh_token: "test-refresh-token",
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: userId,
      email: "admin@example.test",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: { role: "admin" },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
  const savedSession = JSON.stringify(session);
  const values = new Map([[adminStorageKey, savedSession]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const requests = [];
  const fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    const isPublicWrite = request.method === "POST";
    if (isPublicWrite && request.headers.get("authorization") !== `Bearer ${anonKey}`) {
      return Response.json(
        { code: "42501", message: "new row violates row-level security policy" },
        { status: 403 },
      );
    }
    if (new URL(request.url).pathname.startsWith("/storage/v1/object/")) {
      return Response.json({ Key: "pitch-decks/intake/test.pdf", Id: "test-object" });
    }
    return request.method === "POST"
      ? new Response(null, { status: 201 })
      : Response.json([]);
  };
  const clients = createSupabaseClients(projectUrl, anonKey, {
    auth: {
      storage,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch },
  });

  return { ...clients, requests, accessToken, savedSession, values };
}

test("public form inserts stay anonymous with a persisted admin session", async (t) => {
  const fixture = createFixture();
  const adminSession = await fixture.supabase.auth.getSession();
  assert.equal(adminSession.data.session?.access_token, fixture.accessToken);

  const tables = [
    "contact_submissions",
    "startup_registrations",
    "community_join_applications",
    "chapter_applications",
    "event_registrations",
    "meeting_registrations",
    "founder_connection_requests",
    "partner_applications",
  ];

  for (const table of tables) {
    await t.test(table, async () => {
      const { error } = await fixture.publicSupabase.from(table).insert({ name: "Test intake" });
      const request = fixture.requests.at(-1);
      assert.equal(request.method, "POST");
      assert.equal(new URL(request.url).pathname, `/rest/v1/${table}`);
      assert.equal(
        request.headers.get("authorization"),
        `Bearer ${anonKey}`,
        "Public inserts must not inherit the persisted admin access token",
      );
      assert.equal(error, null);
    });
  }

  const publicSession = await fixture.publicSupabase.auth.getSession();
  assert.equal(publicSession.data.session, null);
});

test("public PDF uploads stay anonymous with a persisted admin session", async () => {
  const fixture = createFixture();
  await fixture.supabase.auth.getSession();

  const { error } = await fixture.publicSupabase.storage
    .from("pitch-decks")
    .upload("intake/test.pdf", new Blob(["%PDF-1.4 test"], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: false,
    });

  const request = fixture.requests.at(-1);
  assert.equal(new URL(request.url).pathname, "/storage/v1/object/pitch-decks/intake/test.pdf");
  assert.equal(request.method, "POST");
  assert.equal(
    request.headers.get("authorization"),
    `Bearer ${anonKey}`,
    "Public uploads must not inherit the persisted admin access token",
  );
  assert.equal(error, null);
});

test("public operations preserve the admin session and authenticated reads", async () => {
  const fixture = createFixture();
  await fixture.supabase.auth.getSession();
  await fixture.publicSupabase.from("contact_submissions").insert({ message: "Test message" });

  const { error } = await fixture.supabase.from("contact_submissions").select("id");
  assert.equal(error, null);
  assert.equal(
    fixture.requests.at(-1).headers.get("authorization"),
    `Bearer ${fixture.accessToken}`,
    "Admin reads must continue to use the signed-in admin session",
  );
  assert.equal(fixture.values.get(adminStorageKey), fixture.savedSession);
  const adminSession = await fixture.supabase.auth.getSession();
  assert.equal(adminSession.data.session?.access_token, fixture.accessToken);
});
