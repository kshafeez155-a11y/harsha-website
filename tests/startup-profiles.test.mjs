import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { startupStories } from "../src/data/startupStories.ts";
import {
  deleteStartupProfile, loadStartupProfiles, newStartupProfile,
  parseStartupProfile, saveStartupProfile, slugifyStartupName, startupProfilePayload,
} from "../src/lib/startup-profiles.ts";

const profile = {
  ...newStartupProfile(), ...startupStories[0], stage: "Growth Stage",
  website: "https://example.com", isPublished: true, isFeatured: true, sortOrder: 2,
};

function fakeClient(result = {}) {
  const calls = [];
  const query = {
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
    async single() { calls.push(["single"]); return result; },
  };
  for (const method of ["select", "insert", "update", "delete", "eq", "order"]) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  return { calls, client: { from(table) { calls.push(["from", table]); return query; } } };
}

test("a new startup is a draft and has no database identity", () => {
  const draft = newStartupProfile();
  assert.equal(draft.id, "");
  assert.equal(draft.isPublished, false);
  assert.equal(draft.isFeatured, false);
  assert.deepEqual(draft.milestones, []);
  assert.equal(slugifyStartupName("  A Company & Café!  "), "a-company-cafe");
});

test("basic edits round-trip every existing milestone and portfolio item", () => {
  const payload = startupProfilePayload({ ...profile, startupName: "Updated business" });
  const actual = parseStartupProfile({ ...payload, id: "real-id" });
  assert.equal(actual.startupName, "Updated business");
  assert.equal(actual.id, "real-id");
  assert.equal(actual.sortOrder, 2);
  for (const key of ["milestones", "mediaPortfolio", "technologyPortfolio", "portfolioHeading", "mediaDivisionName", "technologyDivisionDescription"]) {
    assert.deepEqual(actual[key], profile[key], key);
  }
  assert.equal("id" in payload, false);
  assert.equal("created_at" in payload, false);
});

test("missing required fields and invalid routing/stage/order are rejected before saving", () => {
  for (const key of ["startupName", "founderName", "location", "industry", "shortStory"]) {
    assert.throws(() => startupProfilePayload({ ...profile, [key]: " " }), /required/);
  }
  for (const slug of ["", "Bad Slug", "a--b", "../other", "register"]) {
    assert.throws(() => startupProfilePayload({ ...profile, slug }), /page URL/i);
  }
  assert.throws(() => startupProfilePayload({ ...profile, stage: "Unknown" }), /stage/);
  assert.throws(() => startupProfilePayload({ ...profile, sortOrder: 1.5 }), /whole number/);
});

test("executable, credential-bearing, and remote-relative URLs cannot be saved", () => {
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,anything", "//other.example/a", "https://user:pass@example.com/a"]) {
    for (const key of ["website", "startupLogo", "founderImage", "coverImage"]) {
      assert.throws(() => startupProfilePayload({ ...profile, [key]: url }), /http\(s\)/);
    }
  }
  assert.throws(() => startupProfilePayload({ ...profile, startupLogo: "/images/../secret" }), /http\(s\)/);
  assert.throws(() => startupProfilePayload({ ...profile, website: "/images/logo.png" }), /http\(s\)/);
  assert.doesNotThrow(() => startupProfilePayload({ ...profile, startupLogo: "/images/logo.png" }));
  assert.throws(() => startupProfilePayload({
    ...profile, mediaPortfolio: [{ name: "Project", description: "", url: "javascript:alert(1)", linkLabel: "Open" }],
  }), /Portfolio links/);
});

test("public listing explicitly filters published profiles and keeps configured order", async () => {
  const row = { ...startupProfilePayload(profile), id: "one" };
  const { client, calls } = fakeClient({ data: [row], error: null });
  const actual = await loadStartupProfiles(client, { publishedOnly: true });
  assert.deepEqual(calls, [
    ["from", "startup_profiles"], ["select", "*"], ["eq", "is_published", true],
    ["order", "sort_order", { ascending: true }], ["order", "created_at", { ascending: true }],
  ]);
  assert.equal(actual[0].id, "one");
  assert.deepEqual(actual[0].milestones, profile.milestones);
});

test("an empty live catalogue stays empty and read failures cannot resurrect static profiles", async () => {
  const empty = fakeClient({ data: [], error: null });
  assert.deepEqual(await loadStartupProfiles(empty.client, { publishedOnly: true }), []);
  const missing = fakeClient({ data: null, error: { code: "PGRST205" } });
  await assert.rejects(loadStartupProfiles(missing.client), /migration 005/);
  const denied = fakeClient({ data: null, error: { code: "42501" } });
  await assert.rejects(loadStartupProfiles(denied.client), /permission/);
});

test("admin reads include drafts while public reads remain filtered", async () => {
  const { client, calls } = fakeClient({ data: [], error: null });
  await loadStartupProfiles(client);
  assert.equal(calls.some(([method]) => method === "eq"), false);
});

test("create and update wait for an actual returned row; existing identity determines update", async () => {
  const payload = startupProfilePayload(profile);
  const created = fakeClient({ data: { ...payload, id: "saved" }, error: null });
  const result = await saveStartupProfile(created.client, profile);
  assert.equal(result.id, "saved");
  assert.equal(created.calls[1][0], "insert");
  assert.deepEqual(created.calls[1][1], payload);
  const updated = fakeClient({ data: { ...payload, id: "saved" }, error: null });
  await saveStartupProfile(updated.client, { ...profile, id: "saved" });
  assert.equal(updated.calls[1][0], "update");
  assert.deepEqual(updated.calls[2], ["eq", "id", "saved"]);
  const noRow = fakeClient({ data: null, error: null });
  await assert.rejects(saveStartupProfile(noRow.client, profile), /not saved/);
});

test("duplicate slugs report an actionable failure and invalid input never makes an API call", async () => {
  const duplicate = fakeClient({ data: null, error: { code: "23505" } });
  await assert.rejects(saveStartupProfile(duplicate.client, profile), /already in use/);
  const invalid = fakeClient();
  await assert.rejects(saveStartupProfile(invalid.client, { ...profile, startupName: "" }), /required/);
  assert.equal(invalid.calls.length, 0);
});

test("deletion targets exactly one profile and does not claim success on denied or absent rows", async () => {
  const deleted = fakeClient({ data: { id: "saved" }, error: null });
  await deleteStartupProfile(deleted.client, "saved");
  assert.deepEqual(deleted.calls, [["from", "startup_profiles"], ["delete"], ["eq", "id", "saved"], ["select", "id"], ["single"]]);
  const absent = fakeClient({ data: null, error: null });
  await assert.rejects(deleteStartupProfile(absent.client, "missing"), /not deleted/);
  const denied = fakeClient({ data: null, error: { code: "42501" } });
  await assert.rejects(deleteStartupProfile(denied.client, "saved"), /permission/);
  await assert.rejects(deleteStartupProfile(deleted.client, ""), /Choose/);
});

test("migration seeds the complete verified story without fake startups or overwriting edits", () => {
  const migration = fs.readFileSync(new URL("../supabase/migrations/005_startup_profiles.sql", import.meta.url), "utf8");
  const seedDetails = migration.match(/'({"portfolioHeading".+})'::jsonb/);
  assert.ok(seedDetails, "Expected preserved seed story details");
  const actual = JSON.parse(seedDetails[1].replace(/''/g, "'"));
  const { slug, startupName, founderName, location, industry, shortStory, startupLogo, founderImage, coverImage, ...expected } = startupStories[0];
  assert.deepEqual(actual, expected);
  assert.match(migration, /on conflict \(slug\) do nothing/);
  assert.doesNotMatch(migration, /Startup Two|Startup Three|delete from public\.startup_registrations/i);
});
