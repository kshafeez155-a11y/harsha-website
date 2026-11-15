import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

// Real PostgreSQL RLS verification, without a live Supabase project or project
// dependency changes. To run elsewhere install @electric-sql/pglite in a temp
// directory and set HANOVA_PGLITE_MODULE to its dist/index.js file.
const temporaryModule = path.join(os.tmpdir(), "hanova-hub-db-tests/node_modules/@electric-sql/pglite/dist/index.js");
let PGlite;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  const modulePath = process.env.HANOVA_PGLITE_MODULE || temporaryModule;
  if (fs.existsSync(modulePath)) ({ PGlite } = await import(pathToFileURL(modulePath).href));
}

const ids = {
  owner: "11111111-1111-4111-8111-111111111111",
  kadapa: "22222222-2222-4222-8222-222222222222",
  anantapur: "33333333-3333-4333-8333-333333333333",
  ordinary: "44444444-4444-4444-8444-444444444444",
};

test("hub ownership and staff permissions are enforced by PostgreSQL", {
  skip: PGlite ? false : "Install optional PGlite or set HANOVA_PGLITE_MODULE to run PostgreSQL integration checks.",
}, async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema storage;
    create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid; $$;
    create function auth.role() returns text language sql stable as $$ select auth.jwt() ->> 'role'; $$;
    grant usage on schema auth, public, storage to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
  const migrationDir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of fs.readdirSync(migrationDir).filter((name) => /^00[1-5]_.*\.sql$/.test(name)).sort()) {
    await db.exec(fs.readFileSync(new URL(file, migrationDir), "utf8"));
  }
  // A real pre-migration submission must never acquire an inferred hub owner.
  await db.exec(`insert into public.meeting_registrations (name, phone, email, city, role, purpose, consent_given)
    values ('Legacy request', '9000000000', 'legacy@example.test', 'Kadapa', 'Founder', 'Legacy follow-up', true);`);
  const migration = fs.readFileSync(new URL("006_hub_management.sql", migrationDir), "utf8");
  await db.exec(migration);
  await db.exec(migration);
  for (const [name, id] of Object.entries(ids)) {
    await db.query("insert into auth.users (id, email, raw_app_meta_data) values ($1, $2, $3::jsonb)",
      [id, `${name}@example.test`, JSON.stringify(name === "owner" ? { role: "admin" } : {})]);
  }

  async function asRole(role, identity, run) {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({
      role, ...(identity ? { sub: ids[identity] } : {}),
      app_metadata: identity === "owner" ? { role: "admin" } : {},
      // Editable metadata must have no effect on any authorization decision.
      user_metadata: { role: "admin", hub_id: "kadapa" },
    })]);
    try { return await run(); }
    finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims', '{}', false)");
    }
  }
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const fail = async (sql, params, pattern = /permission|row-level security|owner|assignment|status|event|hub/i) =>
    assert.rejects(db.query(sql, params), pattern);

  await t.test("seeding is repeatable and preserves legacy requests without assigning a hub", async () => {
    assert.equal((await rows("select count(*)::int as total from public.hubs"))[0].total, 8);
    assert.equal((await rows("select count(*)::int as total from public.hub_events"))[0].total, 2);
    assert.equal((await rows("select hub_id from public.meeting_registrations where email = 'legacy@example.test'"))[0].hub_id, null);
  });

  await t.test("only the owner can assign existing accounts and owner accounts cannot become managers", async () => {
    await asRole("authenticated", "owner", async () => {
      await rows("select public.assign_hub_manager('kadapa', 'KADAPA@example.test', 'Kadapa manager')");
      await rows("select public.assign_hub_manager('anantapur', 'anantapur@example.test', 'Anantapur manager')");
      await fail("select public.assign_hub_manager('tirupati', 'owner@example.test', 'Owner')", [], /owner/i);
      await fail("select public.assign_hub_manager('tirupati', 'missing@example.test', 'Missing')", [], /invite/i);
      await fail("select public.assign_hub_manager('tirupati', 'kadapa@example.test', 'Duplicate')", [], /another hub/i);
    });
    await asRole("authenticated", "ordinary", async () => {
      await fail("select public.assign_hub_manager('tirupati', 'ordinary@example.test', 'Self promotion')", [], /owner/i);
      assert.deepEqual(await rows("select * from public.hub_managers"), []);
      assert.deepEqual(await rows("select * from public.meeting_registrations"), []);
    });
  });

  await t.test("anonymous users can submit scoped intake but cannot forge management fields or read private records", async () => {
    await asRole("anon", null, async () => {
      assert.equal((await rows("select * from public.hubs")).length, 8);
      await fail("select * from public.hub_managers", []);
      await fail("select * from public.hub_activity", []);
      await fail("select * from public.meeting_registrations", []);
      for (const hub of ["kadapa", "anantapur"]) {
        await db.query(`insert into public.community_join_applications
          (name,phone,email,city,district,college_or_company,profession,startup_stage,consent_given,hub_id)
          values ('Visitor','9000000000',$1,'Different city','Other district','Example','Founder','mvp',true,$2)`, [`${hub}@visitor.test`, hub]);
        await db.query(`insert into public.startup_registrations
          (startup_name,founder_name,problem,solution,startup_stage,phone,email,consent_given,hub_id)
          values ('Startup','Founder','Problem','Solution','mvp','9000000000',$1,true,$2)`, [`${hub}@startup.test`, hub]);
        await db.query(`insert into public.meeting_registrations
          (name,phone,email,city,role,purpose,consent_given,hub_id,meeting_id)
          values ('Visitor','9000000000',$1,'Different city','Founder','A request',true,$2,'existing-chapter-meeting')`, [`${hub}@meeting.test`, hub]);
      }
      await fail(`insert into public.meeting_registrations
        (name,phone,email,city,role,purpose,consent_given,hub_id,status)
        values ('Forged','9000000000','forged@example.test','Kadapa','Founder','Forged',true,'kadapa','confirmed')`, []);
    });
  });

  await t.test("selected events control ownership and unpublished or mismatched events cannot receive public registrations", async () => {
    await asRole("authenticated", "owner", async () => {
      await db.query(`insert into public.hub_events (id,hub_id,title,date,time,is_published)
        values ('draft-kadapa','kadapa','Draft','2027-01-01','10:00',false)`);
    });
    await asRole("anon", null, async () => {
      assert.equal((await rows("select * from public.hub_events where id = 'draft-kadapa'")).length, 0);
      const sql = `insert into public.event_registrations (name,phone,email,city,purpose,consent_given,hub_id,event_id)
        values ('Attendee','9000000000','event@example.test','Tirupati','Learn',true,$1,$2)`;
      await fail(sql, ["anantapur", "kadapa-idea-validation-workshop"], /selected hub/i);
      await fail(sql, ["kadapa", "draft-kadapa"], /not available/i);
      await fail(sql, ["kadapa", null], /published event/i);
      await db.query(sql, [null, "kadapa-idea-validation-workshop"]);
    });
    assert.equal((await rows("select hub_id from public.event_registrations where email = 'event@example.test'"))[0].hub_id, "kadapa");
  });

  await t.test("active managers see only their hub's private records and cannot see unassigned legacy records", async () => {
    // Simulate a stale, overly permissive policy: the new restrictive guard
    // still prevents cross-hub data disclosure.
    await db.exec('create policy "legacy broad authenticated access" on public.meeting_registrations for select to authenticated using (true)');
    for (const hub of ["kadapa", "anantapur"]) {
      await asRole("authenticated", hub, async () => {
        for (const table of ["startup_registrations", "community_join_applications", "meeting_registrations"]) {
          const result = await rows(`select hub_id from public.${table}`);
          assert.equal(result.length, 1, table);
          assert.ok(result.every((r) => r.hub_id === hub), table);
        }
        assert.equal((await rows("select * from public.hub_managers")).length, 1);
        assert.deepEqual(await rows("select * from public.contact_submissions"), []);
        assert.deepEqual(await rows("select * from public.pitch_deck_submissions"), []);
      });
    }
  });

  await t.test("managers may update follow-ups and local statuses but cannot change ownership, personal data or final startup decisions", async () => {
    await asRole("authenticated", "kadapa", async () => {
      await db.query("update public.community_join_applications set status = 'approved', follow_up_notes = 'Contacted applicant' where hub_id = 'kadapa'");
      await db.query("update public.startup_registrations set status = 'reviewed' where hub_id = 'kadapa'");
      await db.query("update public.event_registrations set status = 'attended' where hub_id = 'kadapa'");
      await db.query("update public.meeting_registrations set status = 'confirmed' where hub_id = 'kadapa'");
      await fail("update public.meeting_registrations set phone = 'stolen' where hub_id = 'kadapa'", [], /only update/i);
      await fail("update public.meeting_registrations set hub_id = 'anantapur' where hub_id = 'kadapa'", [], /only update/i);
      await fail("update public.startup_registrations set status = 'approved' where hub_id = 'kadapa'", [], /reserved/i);
      await fail("update public.event_registrations set status = 'approved' where hub_id = 'kadapa'", [], /reserved/i);
      assert.equal((await db.query("update public.meeting_registrations set status = 'confirmed' where hub_id = 'anantapur'")).affectedRows, 0);
      assert.equal((await db.query("delete from public.meeting_registrations where hub_id = 'kadapa'")).affectedRows, 0);
      assert.equal((await db.query("update public.hub_managers set active = true")).affectedRows, 0);
      await fail("insert into public.hub_activity (hub_id,action,entity_type,entity_id) values ('kadapa','forged','fake','fake')", []);
    });
    assert.equal((await rows("select status from public.meeting_registrations where hub_id = 'anantapur'"))[0].status, "pending");
  });

  await t.test("profile edits and event publishing are scoped; managers cannot move events, change hub identity or delete events", async () => {
    await asRole("authenticated", "kadapa", async () => {
      await db.query("update public.hubs set contact_name = 'Local contact', description = 'Updated by Kadapa' where id = 'kadapa'");
      await fail("update public.hubs set city = 'Changed city' where id = 'kadapa'", [], /owner/i);
      assert.equal((await db.query("update public.hubs set description = 'Unauthorized' where id = 'anantapur'")).affectedRows, 0);
      await db.query("update public.hub_events set is_published = true where id = 'draft-kadapa'");
      await fail("update public.hub_events set hub_id = 'anantapur' where id = 'draft-kadapa'", [], /cannot be changed/i);
      assert.equal((await db.query("delete from public.hub_events where id = 'draft-kadapa'")).affectedRows, 0);
      await fail("insert into public.hub_events (id,hub_id,title,date,time) values ('cross-hub','anantapur','Invalid','2027-01-01','10:00')", []);
    });
    await asRole("anon", null, async () => {
      assert.equal((await rows("select * from public.hub_events where id = 'draft-kadapa'")).length, 1);
      assert.equal((await rows("select contact_name from public.hubs where id = 'kadapa'"))[0].contact_name, "Local contact");
    });
  });

  await t.test("owner can allocate legacy records and retains final approval while managers cannot read private pitch decks", async () => {
    await db.exec("insert into storage.objects (bucket_id,name) values ('pitch-decks','intake/private.pdf')");
    await asRole("authenticated", "owner", async () => {
      assert.equal((await rows("select * from public.meeting_registrations")).length, 3);
      await db.query("update public.meeting_registrations set hub_id = 'kadapa' where email = 'legacy@example.test'");
      await db.query("update public.startup_registrations set status = 'approved' where hub_id = 'kadapa'");
      assert.equal((await rows("select * from storage.objects where bucket_id = 'pitch-decks'")).length, 1);
    });
    await asRole("authenticated", "kadapa", async () => {
      assert.equal((await rows("select * from public.meeting_registrations")).length, 2);
      assert.deepEqual(await rows("select * from storage.objects where bucket_id = 'pitch-decks'"), []);
      await db.query("update public.startup_registrations set follow_up_notes = 'Owner approved; arranging follow-up' where hub_id = 'kadapa'");
      await fail("update public.startup_registrations set status = 'reviewed' where hub_id = 'kadapa'", [], /final startup decision/i);
    });
  });

  await t.test("revoking an assignment blocks access immediately, including updates, drafts and local activity", async () => {
    await asRole("authenticated", "owner", async () => {
      await db.query("update public.hub_managers set active = false where hub_id = 'kadapa'");
      await db.query("update public.hub_events set is_published = false where id = 'draft-kadapa'");
    });
    await asRole("authenticated", "kadapa", async () => {
      assert.deepEqual(await rows("select * from public.meeting_registrations"), []);
      assert.deepEqual(await rows("select * from public.hub_activity"), []);
      assert.deepEqual(await rows("select * from public.hub_events where id = 'draft-kadapa'"), []);
      assert.equal((await db.query("update public.hubs set description = 'Disabled manager edit' where id = 'kadapa'")).affectedRows, 0);
      assert.equal((await db.query("update public.meeting_registrations set follow_up_notes = 'Disabled edit'")).affectedRows, 0);
      assert.equal((await rows("select active from public.hub_managers"))[0].active, false);
    });
  });

  await t.test("activity is attributable and never copies private submission content into public metadata", async () => {
    const activity = await rows("select * from public.hub_activity where hub_id = 'kadapa'");
    assert.ok(activity.some((a) => a.actor_id === ids.kadapa && a.entity_type === "community_join_applications" && a.action === "update"));
    assert.ok(activity.some((a) => a.actor_id === ids.owner && a.entity_type === "hub_managers"));
    assert.ok(activity.every((a) => !JSON.stringify(a).includes("Contacted applicant")));
    await asRole("authenticated", "anantapur", async () => {
      assert.ok((await rows("select * from public.hub_activity")).every((a) => a.hub_id === "anantapur"));
    });
  });
});
