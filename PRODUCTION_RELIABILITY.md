# Production Reliability

## Error Handling

Public Supabase forms prevent duplicate requests, disable submission controls while requests are in flight, preserve input after failure, and reset only after success. Validation messages remain specific. Network/offline failures use safe, actionable messages from `src/lib/reliability.ts`; technical errors remain in development diagnostics without exposing raw database details to visitors.

Admin pages show loading, empty, and error states separately. Existing Refresh controls re-run the current Supabase query and act as retry controls. Update and delete actions are guarded against duplicate clicks, require successful Supabase confirmation before local state changes, and show success or failure feedback.

## Authentication

Admin routes use the Supabase Auth session plus the server-managed `app_metadata.role = admin` authorization contract. The database `is_admin` check must also succeed before dashboard access; a stale JWT is refreshed once. Missing or invalid sessions/claims redirect to `/admin/login`. Protected routes render on the client because the session is stored in the browser. Password fields are cleared after successful changes, and sign-out uses Supabase Auth followed by router navigation.

Public intake uses a separate sessionless Supabase client. A signed-in admin can submit a public form without sending the admin JWT or changing the admin session. Database policies remain the access boundary; see `SUPABASE_SETUP.md` and migration `004_submission_access_repair.sql` for provisioning.

## Application Failure Fallbacks

TanStack Router's root `errorComponent` presents a generic retry/home fallback and invalidates the router before retrying. The server entry normalizes catastrophic SSR errors into a generic HTML error page. Stack traces and implementation details are not shown to users. Errors are captured through the existing `reportLovableError` integration when that host hook is available.

## Network and Offline Behavior

Submission errors detect obvious offline state and common network failures. Users can retry after connectivity returns. This is graceful failure handling, not offline synchronization; unsent form data is not persisted as a queue.

## Monitoring Readiness

No independently configured paid monitoring service was found. The existing error boundary/reporting hook is the integration point for adding Sentry or another approved provider later. Capture unexpected route/component errors, SSR failures, repeated Supabase failures, authentication failures, and backup failures. Do not send passwords, access/refresh tokens, service-role keys, environment values, full sensitive submissions, or unnecessary personal data to monitoring tools. Scrub request headers, form payloads, and database error details before external capture.

## Backup Preparation

See `BACKUP_AND_RECOVERY.md` for the table inventory, backup recommendations, restore precautions, and staging recovery procedure. Backups are not configured or verified by this repository change.

## Remaining Limitations

- Live submission access, admin role authorization, and private PDF storage checks are recorded in `BACKEND_TEST_RESULTS.md`. Backup retention and production monitoring were not checked in that repair.
- Admin query retry is provided through each page's existing Refresh action. The dashboard also refreshes when its tab becomes visible and every 30 seconds while visible; failed totals show as unavailable rather than zero.
- Public forms do not provide offline submission queues.
- Production operators must configure alerting, backups, retention, and the approved Auth admin role in Supabase.
