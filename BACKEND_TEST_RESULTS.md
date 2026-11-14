# Form submission investigation

Verified on 2026-11-14 (Asia/Calcutta).

## Reproduced failures

- With an admin session already saved, the previous shared Supabase client sent that admin JWT on public inserts and PDF uploads. The public-write regression checks failed before the client isolation fix.
- The previous admin predicate accepted browser-editable role metadata. Its regression assertion failed before authorization was aligned with the server-managed role.
- A live startup PDF upload returned HTTP 404, `Bucket not found`, for `pitch-decks`. Startup registration uploads its required PDF before inserting the application, so this prevents a startup row from being saved.
- The dashboard previously converted missing/failed totals to zero and could present a failed load as an empty list.

## Completed local fixes and checks

- Eight active public forms now use a separate anonymous client, including startup uploads. Admin authentication and reads keep their own session.
- Admin access requires exact `app_metadata.role = admin` and a successful database `is_admin` check. Stale tokens refresh once; missing access produces a clear failure.
- Protected admin routes use browser-side rendering, matching their browser-stored Auth session.
- Dashboard query failures show unavailable totals, preserve other successful lists, and remain distinct from an empty database. The dashboard refreshes on tab focus and every 30 seconds while visible.
- Contact totals link to `/admin/messages`.
- All 43 regression tests pass (`npm test`), including actual form handlers, error retention, confirmed-save timing, session isolation, role checks, and partial dashboard failures.
- TypeScript (`tsc --noEmit`), the production build (`npm run build`), and local route checks pass.

## Live checks completed

Labelled diagnostic rows were successfully inserted into:

- `contact_submissions`
- `community_join_applications`
- `chapter_applications`
- `event_registrations`
- `meeting_registrations`
- `partner_applications`
- `founder_connection_requests`

After the live repair, every active intake returned HTTP 201, including startup registration, and the required PDF upload succeeded. Anonymous reads are denied with PostgreSQL `42501` (HTTP 401), without exposing submission data.

The live PostgreSQL verification used the existing approved account's ID and current app metadata with `SET LOCAL ROLE authenticated` inside rollback transactions. Assertions confirmed the admin can read the diagnostic row from all eight active forms and the PDF's private storage metadata. A second transaction with no server-managed admin role, even with editable `user_metadata.role = admin`, could read zero private rows across all nine submission tables and the PDF bucket. All four verification assertions passed. No password-based browser sign-in was performed or password collected; the user should sign out and back in to receive the updated role claim.

## Live repair applied

The prepared repair was applied through the authenticated, project-scoped Supabase MCP connection as migration `hanova_submission_access_repair`. It restored the admin helper/policies/grants, assigned the approved existing account its server-managed admin role, and created the private PDF-only `pitch-decks` bucket with a 10 MB limit. All nine submission-table counts were unchanged by that migration; existing submitted records were preserved.

The source repair is `supabase/migrations/004_submission_access_repair.sql`, with account provisioning guidance in `SUPABASE_SETUP.md`. The ignored `.hanova-admin-repair.local` records the concrete approved transaction. No secret key, password, or access token was written into these files. The user approved the SQL/migration tools for this repair run; those tool-approval overrides were invocation-local, not saved as a global approval policy.

One clearly labelled diagnostic startup and its PDF are retained for the user to confirm in `/admin/startups`. The other 15 exact-filter diagnostic records were removed, and the database confirmed zero extra diagnostic rows in the other seven intake tables. The ignored `.hanova-diagnostic.local` manifest records those outcomes. Real user records and storage files were outside the cleanup filters.
