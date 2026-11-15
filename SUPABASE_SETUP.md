# Supabase setup

Use the same Supabase project for this website's environment variables, submission tables, Auth users, and Storage. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong in the ignored `.env.local` for local development. The anon/publishable key is intended for the browser; never put a service-role/secret key in any `VITE_` variable.

## Schema and access repair

For a fresh project, apply the migrations in `supabase/migrations` in numeric order. For an existing project with all nine submission tables, apply `004_submission_access_repair.sql` using the project's SQL editor or a trusted migration connection. This repair is idempotent and does not delete submission rows or files. It aborts with a clear error if required tables or Supabase Storage are missing.

The repair enables submission RLS, restores explicit anonymous form INSERT grants, and requires the server-managed `app_metadata.role` to equal `admin` for authenticated reads, updates, and deletes. It replaces only known Hanova policy names. Restrictive guards prevent other permissive policies from widening access; unrelated restrictive policies are preserved and may still need operator review if they deny an intended operation.

It also creates or repairs the private `pitch-decks` bucket with PDF-only uploads, a 10 MB limit, anonymous uploads to `intake/<uuid>.pdf`, and admin-only reads/deletes. Existing pitch-deck objects cannot be overwritten through the public client. Policies on other storage buckets remain unchanged.

Repository migration files describe the intended configuration; their presence does not prove they have been applied to the live project.

## Startup content management

Apply `supabase/migrations/005_startup_profiles.sql` after the earlier migrations to enable **Manage Startups** at `/admin/portfolio` in the admin dashboard. This adds `public.startup_profiles` and the public `startup-images` bucket. It preserves the existing verified startup, its page URL, complete portfolio, and milestones; rerunning the migration does not overwrite dashboard edits. Private startup applications remain in `startup_registrations`.

Administrators can create and edit startup profiles, save drafts, publish or unpublish them, feature selected stories, and change their display order. Published profiles supply the homepage founder wall, startup directory, and startup detail pages. Public visitors can read published profiles; only accounts with server-managed `app_metadata.role = "admin"` can see drafts or change startup records and images. Image uploads accept JPEG, PNG, WebP, and GIF up to 5 MB. Uploaded images are public assets and must not contain private application documents.

The seeded founder story uses the current website's `/images/` assets. New images can use an uploaded public URL, a full http(s) URL, or an existing local `/images/` path. Website and portfolio links must use full http(s) URLs. The page slug `register` is reserved for the public application form. Dashboard writes wait for a returned database row before showing success, and an empty published catalogue stays empty rather than showing old sample startups.

## Hub managers and separate dashboards

Apply `supabase/migrations/006_hub_management.sql` **after migrations 001–005 and before deploying the updated frontend**. It creates the eight existing hubs and two existing events, manager assignments, hub activity and request ownership. Reapplying it preserves edits and existing requests. Historical requests remain unassigned and visible only to the owner until allocated through **Hub Management → Requests & assignments**.

- Staff login: `/admin/login`. The verified role determines the destination.
- Owner dashboard: `/admin`, with **Hub Management** at `/admin/hubs`.
- Hub manager dashboard: `/hub-dashboard`. Each manager has an individual Auth account and one active hub assignment. Each hub has one manager. More granular staff roles are outside this initial version.

The owner can assign or replace managers, disable access immediately, remove an assignment to move someone to another hub, edit hub profiles and events, review all requests, transfer requests and inspect activity. Event registrations stay tied to their event's hub; historical event registrations without a known event stay owner-only. Hub managers can review local startup enquiries, approve local community applications, manage local event registrations and attendance, handle meeting requests, publish local events, edit public hub content and save follow-up notes. Final startup approvals, the main startup portfolio, private pitch-deck PDFs, permanent deletion, global settings and staff permissions remain owner-only. Managers cannot reverse an owner's final startup decision.

Assignments are stored in a protected database table rather than editable user metadata. RLS checks the current assignment on every read/write. The dashboard rechecks assignments on refresh, every 30 seconds and on window focus, hides cached private records after a failed refresh, and clears its cache on sign-out. Database access ends immediately when the owner disables or replaces an assignment. Browser menus alone do not enforce these restrictions.

Hub profiles and published events now come from the database. Community, startup and meeting forms require an explicit valid hub; event registrations store their selected event and its hub. Attendee city does not determine ownership. Meeting registrations also preserve the existing chapter meeting ID. Public forms continue using the separate anonymous client. Database errors show retry states rather than silently restoring static sample content.

### Enable manager invitation emails

Existing Auth users can be assigned immediately after migration 006 through the owner dashboard. Inviting a new account from that screen additionally requires the `manage-hub-manager` Supabase Edge Function:

1. Set `HUB_MANAGER_REDIRECT_URL` in the project's Edge Function secrets to the exact website password setup URL, for example `https://YOUR_WEBSITE/admin/login?setup=true`. Add that URL and any intended local development counterpart to Supabase Auth's allowed redirect URLs. Keep the Auth Site URL set to the intended website.
2. Configure Supabase Auth email delivery for invitations and password recovery.
3. Deploy the function with `supabase functions deploy manage-hub-manager --project-ref YOUR_PROJECT_REF` from this repository. `supabase/config.toml` turns off the gateway's legacy JWT check for this function; the handler independently verifies the bearer session using Auth and the database `is_admin` RPC before any privileged operation.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` inside the Edge Function environment. Keep the service key there; it must never be added to frontend variables. The privileged key is used only for the Auth invitation. Assignment still runs as the verified owner through `assign_hub_manager`, and the redirect target comes from the trusted environment rather than browser input.

New managers use the invitation email to set a password of at least 12 characters. Existing managers can use **Send password setup email** on Staff login. For a manually created Auth account, assign the same email in Hub Management. If an email was sent but assignment failed, retry the same assignment; it will finish using the existing account without creating a duplicate.

### Hub verification

`npm test` covers public hub rendering, the actual form payloads, routing, account authorization and invitation behavior. `tests/hub-security.test.mjs` also runs the complete migrations in isolated PostgreSQL via optional `@electric-sql/pglite`, exercises real RLS as anonymous users, owners and two different hub managers, and checks that disabling a manager revokes access. It uses no live users or submissions. Install PGlite outside the project and set `HANOVA_PGLITE_MODULE` to its absolute `dist/index.js` path to enable that integration test on another machine; it reports an explicit skip when unavailable.

Migration files and local test results do not apply database changes or deploy an Edge Function. Activate those pieces in the same Supabase project before releasing the frontend. No privileged production migration connection was configured for this implementation.

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

| Public intake                           | Database table                | Admin page                   |
| --------------------------------------- | ----------------------------- | ---------------------------- |
| Homepage contact form                   | `contact_submissions`         | `/admin/messages`            |
| Community join                          | `community_join_applications` | `/admin/community`           |
| Chapter application                     | `chapter_applications`        | `/admin/chapters`            |
| Event registration                      | `event_registrations`         | `/admin/events`              |
| Meeting registration                    | `meeting_registrations`       | `/admin/meetings`            |
| Founder connection                      | `founder_connection_requests` | `/admin/founder-connections` |
| Partnership application                 | `partner_applications`        | `/admin/partners`            |
| Startup registration, including its PDF | `startup_registrations`       | `/admin/startups`            |

`pitch_deck_submissions` has its own `/admin/pitch-decks` page, but no active public form currently writes to it. Startup registration PDFs belong to their startup application; they do not create a separate pitch-deck submission.

After verification, delete only the labelled test records and exact recorded PDF paths through an authorized admin workflow. Use the manifest's exact email values (`contact_email` for contact records, `email` for other forms) and file paths to identify the test artifacts. Preserve real submissions and do not clear a whole table or bucket. Anonymous clients cannot read/delete these files, so cleanup requires admin access. Keep the manifest until every recorded artifact has been removed, then remove it locally.
