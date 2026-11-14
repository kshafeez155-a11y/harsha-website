# Supabase setup

Use the same Supabase project for this website's environment variables, submission tables, Auth users, and Storage. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong in the ignored `.env.local` for local development. The anon/publishable key is intended for the browser; never put a service-role/secret key in any `VITE_` variable.

## Schema and access repair

For a fresh project, apply the migrations in `supabase/migrations` in numeric order. For an existing project with all nine submission tables, apply `004_submission_access_repair.sql` using the project's SQL editor or a trusted migration connection. This repair is idempotent and does not delete submission rows or files. It aborts with a clear error if required tables or Supabase Storage are missing.

The repair enables submission RLS, restores explicit anonymous form INSERT grants, and requires the server-managed `app_metadata.role` to equal `admin` for authenticated reads, updates, and deletes. It replaces only known Hanova policy names. Restrictive guards prevent other permissive policies from widening access; unrelated restrictive policies are preserved and may still need operator review if they deny an intended operation.

It also creates or repairs the private `pitch-decks` bucket with PDF-only uploads, a 10 MB limit, anonymous uploads to `intake/<uuid>.pdf`, and admin-only reads/deletes. Existing pitch-deck objects cannot be overwritten through the public client. Policies on other storage buckets remain unchanged.

Repository migration files describe the intended configuration; their presence does not prove they have been applied to the live project.

## Authorize an existing administrator

The account must already exist in Supabase Auth. Run this SQL only from the project's trusted SQL editor/connection, replacing the placeholder with that existing user's email:

```sql
do $$
declare
  admin_email text := 'REPLACE_WITH_EXISTING_ADMIN_EMAIL';
  changed_users integer;
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'admin')
  where lower(email) = lower(admin_email);

  get diagnostics changed_users = row_count;
  if changed_users <> 1 then
    raise exception 'Expected one existing Auth account, found %; check the email and project.', changed_users;
  end if;
end;
$$;
```

This preserves existing app metadata and creates no user or password. Sign out of the website and sign back in afterward so the access token contains the updated claim. `user_metadata.role` and frontend email lists do not grant database access. Keep RLS enabled and use the public anon/publishable client for public forms; the admin client keeps its separate signed-in session.

## Verify submissions

Run the local regression tests with `npm test`. These use mocked network requests and create no live submissions.

Run `npm run test:submissions` for read-only access probes against the configured project. An anonymous read denied with PostgreSQL code `42501` (HTTP 401 or 403) is expected after the repair and is not counted as a diagnostic failure. The probe requests zero rows. An empty or denied anonymous read does not prove an admin can read rows or establish the full live schema: private submission data is intentionally unavailable to public visitors.

Run `node scripts/test-submissions.mjs --submit` only when you intend to create labelled live test rows and a small PDF. The script uses a unique `Hanova diagnostic <uuid>` marker and an `example.invalid` email, and records successful rows/files in the ignored `.hanova-diagnostic.local` cleanup manifest. Failed operations are reported without showing credentials.

Sign in with the authorized admin account, open the matching pages below, and confirm that each diagnostic marker is visible. Test reading the uploaded PDF and updating a submission status too. The public visitor must still be unable to read private submissions or pitch decks. A missing or inaccessible `is_admin` RPC in an anonymous request alone does not establish whether the helper exists: its EXECUTE permission is intentionally restricted to authenticated users.

| Public intake | Database table | Admin page |
| --- | --- | --- |
| Homepage contact form | `contact_submissions` | `/admin/messages` |
| Community join | `community_join_applications` | `/admin/community` |
| Chapter application | `chapter_applications` | `/admin/chapters` |
| Event registration | `event_registrations` | `/admin/events` |
| Meeting registration | `meeting_registrations` | `/admin/meetings` |
| Founder connection | `founder_connection_requests` | `/admin/founder-connections` |
| Partnership application | `partner_applications` | `/admin/partners` |
| Startup registration, including its PDF | `startup_registrations` | `/admin/startups` |

`pitch_deck_submissions` has its own `/admin/pitch-decks` page, but no active public form currently writes to it. Startup registration PDFs belong to their startup application; they do not create a separate pitch-deck submission.

After verification, delete only the labelled test records and exact recorded PDF paths through an authorized admin workflow. Use the manifest's exact email values (`contact_email` for contact records, `email` for other forms) and file paths to identify the test artifacts. Preserve real submissions and do not clear a whole table or bucket. Anonymous clients cannot read/delete these files, so cleanup requires admin access. Keep the manifest until every recorded artifact has been removed, then remove it locally.
