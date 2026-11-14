import assert from "node:assert/strict";
import test from "node:test";

import { loadDashboardData } from "../src/lib/admin-dashboard.ts";

function fakeClient(results) {
  return {
    from(table) {
      return {
        select() {
          return {
            order() {
              return {
                async limit() {
                  const result = results[table];
                  if (result instanceof Error) throw result;
                  return result;
                },
              };
            },
          };
        },
      };
    },
  };
}

const sources = [
  { table: "community_join_applications", type: "Community applications" },
  { table: "startup_registrations", type: "Startup applications" },
];

test("a failed table is unavailable, never a false zero or an empty success", async () => {
  const result = await loadDashboardData(
    fakeClient({
      community_join_applications: { data: null, count: null, error: { code: "42501" } },
      startup_registrations: { data: [], count: 0, error: null },
    }),
    sources,
  );
  assert.equal(result.counts.community_join_applications, null);
  assert.equal(result.counts.startup_registrations, 0);
  assert.deepEqual(result.failedSources, ["Community applications"]);
});

test("a network failure in one query preserves successful submissions from another", async () => {
  const result = await loadDashboardData(
    fakeClient({
      community_join_applications: new Error("Network request failed"),
      startup_registrations: {
        data: [{ id: "startup-1", startup_name: "Example", created_at: "2026-01-02T00:00:00Z" }],
        count: 7,
        error: null,
      },
    }),
    sources,
  );
  assert.equal(result.counts.community_join_applications, null);
  assert.equal(result.counts.startup_registrations, 7);
  assert.equal(result.submissions[0].source, "startup_registrations");
  assert.deepEqual(result.failedSources, ["Community applications"]);
});

test("recent submissions combine tables chronologically without changing total counts", async () => {
  const result = await loadDashboardData(
    fakeClient({
      community_join_applications: {
        data: [{ id: "community-1", created_at: "2026-01-03T00:00:00Z" }],
        count: 20,
        error: null,
      },
      startup_registrations: {
        data: [{ id: "startup-1", created_at: "2026-01-02T00:00:00Z" }],
        count: 15,
        error: null,
      },
    }),
    sources,
  );
  assert.deepEqual(
    result.submissions.map(({ id }) => id),
    ["community-1", "startup-1"],
  );
  assert.equal(result.counts.community_join_applications, 20);
  assert.equal(result.counts.startup_registrations, 15);
  assert.deepEqual(result.failedSources, []);
});

test("a missing exact count is surfaced as unavailable", async () => {
  const result = await loadDashboardData(
    fakeClient({ community_join_applications: { data: [], count: null, error: null } }),
    sources.slice(0, 1),
  );
  assert.equal(result.counts.community_join_applications, null);
  assert.deepEqual(result.failedSources, ["Community applications"]);
});
