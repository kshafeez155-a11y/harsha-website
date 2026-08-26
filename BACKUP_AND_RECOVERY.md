# Backup and Recovery

## Protected Data

Hanova stores form submissions in these Supabase tables:

- `contact_submissions`: contact names, contact details, and messages.
- `startup_registrations`: startup and founder applications, submitted descriptions, links, and pitch-deck paths.
- `chapter_applications`: chapter leader contact, organization, experience, motivation, and meetup plans.
- `community_join_applications`: community member contact, location, organization, profession, and startup details.
- `event_registrations`: event attendee contact, city, and attendance purpose.
- `meeting_registrations`: meeting attendee contact, city, role, and purpose.
- `partner_applications`: organization contact, location, partnership category, goals, and proposals.
- `founder_connection_requests`: founder contact, startup context, connection purpose, desired outcome, and preferred times.
- `pitch_deck_submissions`: founder/startup contact, stage, industry, description, and pitch-deck paths.

The most important data to preserve is all submitted application and contact content, status decisions, timestamps, and any future private storage objects referenced by pitch-deck paths.

## Recommended Backup Approach

1. Use Supabase's managed database backups and point-in-time recovery according to the project's plan.
2. For an additional independent copy, schedule encrypted `pg_dump` exports through a trusted server or CI job. Never run database exports from the browser and never expose a service-role key to the frontend.
3. Store exports in access-controlled, encrypted storage with a retention policy appropriate for business and privacy requirements.
4. Back up database schema/migrations in source control and keep storage-object metadata with the corresponding database backup.
5. Run backups at least daily; use more frequent point-in-time recovery for active production intake.

## Verify Backups

In the Supabase Dashboard, verify that database backups and point-in-time recovery are enabled for the production project and that the retention window meets operational needs. Confirm the last successful backup timestamp and review failed-backup alerts.

## Before Destructive Changes

- Review the migration in code review.
- Take or confirm a recent backup.
- Record the current schema, RLS policies, grants, and Auth configuration.
- Test the migration against a staging project populated with representative, non-production data.
- Plan rollback or restore steps before applying changes.
- Avoid destructive SQL against production unless the restore path has been verified.

## Recovery and Testing

Restore into a separate staging project first. Verify table counts, recent records, indexes, migrations, RLS behavior, Auth configuration, and any storage objects. Run the application's build and protected admin smoke tests against staging before considering production recovery.

Never test destructive restore or deletion procedures directly against production data. Recovery procedures should be rehearsed with a non-production project and documented with recovery time and recovery point objectives.
