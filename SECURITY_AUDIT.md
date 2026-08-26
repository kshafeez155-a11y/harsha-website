# Supabase Security Audit

Date: 2026-08-23

## Scope and Limitations

This is a repository and migration audit. The remote Supabase project's live policies, grants, Auth user metadata, storage configuration, and logs were not available in this workspace, so those items must be verified after applying the migration.

## Admin Authorization

Before hardening, `src/components/admin/admin-auth.ts` treated any valid Supabase Auth session as an administrator. This was a security risk: a normal authenticated user could reach admin routes, and any future permissive authenticated RLS policy would expose submissions.

The hardening contract is:

- Supabase Auth authenticates the user.
- A trusted operator sets `app_metadata.role` to `admin` for approved users.
- `public.is_admin()` checks that server-managed claim in RLS.
- Frontend protected routes require the same claim for user experience, but RLS remains the enforcement boundary.

`app_metadata` must be changed through the Supabase Dashboard or a trusted server-side administrative workflow. It must never be writable from the browser client.

## Table Inventory and Access Matrix

All nine tables have RLS enabled in `001_initial_schema.sql`. Public pages do not read any submission table. Public forms insert only their intended fields. Admin pages read all records; status-capable pages update status; management pages delete records as implemented.

| Table | Purpose | Public anon | Authenticated non-admin | Authorized admin |
|---|---|---|---|---|
| `contact_submissions` | Contact form messages | `INSERT` submitted columns only | No access | `SELECT`, `UPDATE`, `DELETE` |
| `startup_registrations` | Startup applications | `INSERT` submitted columns only | No access | `SELECT`, `UPDATE`, `DELETE` |
| `chapter_applications` | Chapter leader applications | `INSERT` submitted columns only | No access | `SELECT`, `UPDATE`, `DELETE` |
| `community_join_applications` | Community applications | `INSERT` submitted columns only | No access | `SELECT`, `UPDATE`, `DELETE` |
| `event_registrations` | Event registrations | `INSERT` submitted columns only | No access | `SELECT`, `UPDATE`, `DELETE` |
| `meeting_registrations` | Meeting registrations | `INSERT` submitted columns only | No access | `SELECT`, `UPDATE`, `DELETE` |
| `partner_applications` | Partner applications | `INSERT` submitted columns only | No access | `SELECT`, `UPDATE`, `DELETE` |
| `founder_connection_requests` | Founder connection requests | `INSERT` submitted columns only | No access | `SELECT`, `UPDATE`, `DELETE` |
| `pitch_deck_submissions` | Pitch deck metadata | `INSERT` submitted columns only | No access | `SELECT`, `UPDATE`, `DELETE` |

There are no public `SELECT`, `UPDATE`, or `DELETE` permissions. There are no authenticated non-admin submission permissions. Authenticated insert is not granted because all current public forms submit as `anon` and no authenticated form write is required by the application.

## Public Insert Columns

`002_security_hardening.sql` revokes table-level insert from `anon` and grants only these columns:

- `contact_submissions`: `contact_name`, `contact_phone`, `contact_email`, `message`
- `startup_registrations`: `startup_name`, `founder_name`, `problem`, `solution`, `startup_stage`, `website`, `linkedin`, `phone`, `email`, `pitch_deck_path`, `consent_given`
- `chapter_applications`: `name`, `phone`, `email`, `city`, `district`, `profession`, `organization`, `linkedin`, `entrepreneurship_experience`, `weekly_commitment`, `motivation`, `city_ecosystem`, `first_meetup_plan`, `community_reach`, `consent_given`
- `community_join_applications`: `name`, `phone`, `email`, `city`, `district`, `college_or_company`, `profession`, `startup_stage`, `startup_name`, `consent_given`
- `event_registrations`: `name`, `phone`, `email`, `city`, `purpose`, `consent_given`
- `meeting_registrations`: `name`, `phone`, `email`, `city`, `role`, `purpose`, `consent_given`
- `founder_connection_requests`: `name`, `phone`, `email`, `city`, `startup_name`, `founder`, `startup_stage`, `meeting_purpose`, `context`, `desired_outcome`, `preferred_date`, `preferred_time`, `consent_given`
- `partner_applications`: `name`, `email`, `phone`, `organization`, `location`, `website`, `organization_type`, `partnership_interest`, `contribution`, `goal`, `community_reach`, `ecosystem_experience`, `consent_given`
- `pitch_deck_submissions`: `founder_name`, `startup_name`, `email`, `phone`, `startup_stage`, `industry`, `pitch_deck_path`, `description`

Server-managed `id`, `created_at`, and status fields cannot be supplied by the anonymous role after the migration.

## Issues Found and Fixed

1. **Any authenticated user was treated as an admin.** Fixed in `src/components/admin/admin-auth.ts` by requiring the server-managed `app_metadata.role` claim.
2. **Admin RLS policies were missing.** Added admin-only `SELECT`, `UPDATE`, and `DELETE` policies for every submission table.
3. **Public table insert grants were broader than the form payloads.** Added column-scoped anon insert grants while preserving public form behavior.
4. **No database-level admin boundary existed.** Added locked-down `public.is_admin()` and used it in every admin policy.
5. **Table grants were not explicit in the repository.** The hardening migration removes accidental `PUBLIC` table privileges and grants authenticated DML privileges only where RLS can restrict them to admins.
6. **No report or deployment instructions existed.** Added this report and the migration comments/manual steps.

## Migration

- `supabase/migrations/002_security_hardening.sql`

The migration preserves tables and data, keeps RLS enabled, replaces the existing public insert policies safely with `DROP POLICY IF EXISTS`, and does not grant access to ordinary authenticated users.

## Manual Supabase Steps

1. Review `002_security_hardening.sql`.
2. Apply it through the Supabase CLI or SQL editor.
3. In the Supabase SQL Editor, replace the placeholder email in this read-only query with the existing administrator's email to identify the account without exposing credentials:

```sql
select id, email, raw_app_meta_data ->> 'role' as role
from auth.users
where lower(email) = lower('admin@example.com');
```

4. After verifying the returned email is the intended account, run this trusted admin operation. It preserves all existing app metadata and changes only the server-managed role claim:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
	|| jsonb_build_object('role', 'admin')
where lower(email) = lower('admin@example.com')
returning id, email, raw_app_meta_data ->> 'role' as role;
```

5. Sign out and sign in again, or refresh the Auth session, so the new claim is present in the access token.
6. Verify in the Supabase Dashboard that RLS is enabled and the expected policies exist on all nine tables.
7. Test with a non-admin Auth user: admin routes should redirect, and direct table reads/updates/deletes should return no rows or an authorization error.
8. Test each public form after applying the column grants.

Do not put a service-role key, password, access token, or refresh token in frontend code or `VITE_*` variables.

## Environment and Frontend Review

- The frontend uses only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `.gitignore` excludes `.env`, `.env.local`, and `*.local` files.
- `.env.example` contains placeholders only.
- No service-role key, hardcoded secret, manual Auth token storage, password logging, or token display was found in the audited source.
- `StartupProgressTracker` uses local storage for non-sensitive UI progress only.

## Remaining Risks

- The current project has no database-backed admin/profile table and no existing role provisioning workflow. The trusted `app_metadata` assignment is a required operational step.
- Remote policy state and grants cannot be confirmed from repository files alone.
- The frontend still loads all fields for authorized admins, including contact information and submitted application content; restrict dashboard access and staff accounts accordingly.
- The migration grants admin updates on all submission tables for consistency, although current UI status updates exist only on selected tables.
- Storage policies for future pitch-deck file objects are not present in this repository and must be designed before enabling private file access.
