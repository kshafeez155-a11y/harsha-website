# Supabase Storage Audit

Date: 2026-08-23

## Decision

File uploads are genuinely required for startup intake. The public startup registration form has a required `pitch_deck` PDF field, the existing `startup_registrations` table already has `pitch_deck_path`, and the product includes a pitch-deck submission workflow. No unrelated upload features were added.

## Upload Inventory

| Feature | Uploader | File | Database reference | Visibility |
|---|---|---|---|---|
| Startup registration pitch deck | Public startup applicant | PDF, maximum 10 MB | `startup_registrations.pitch_deck_path` | Private |

No profile image, startup logo, company logo, event image, resume, or other document upload is currently required by the active forms. `PitchDeckUpload.tsx` is an unused demonstration component and was not connected to a second upload flow.

## Storage Architecture

Migration: `supabase/migrations/003_pitch_deck_storage.sql`

- Bucket: `pitch-decks`
- Public: No
- Maximum object size: 10 MB, enforced by bucket configuration
- Allowed MIME type: `application/pdf`
- Path: `intake/<crypto.randomUUID()>.pdf`
- Database value: the Storage object path only, never a permanent signed URL

The browser validates PDF MIME type, non-empty file, and the 10 MB limit for user experience. Storage bucket configuration and the object policy provide server-side enforcement boundaries. The original filename is not used as the object path.

## Permissions

- Anonymous visitors: insert only objects in `pitch-decks` whose generated-looking path is under `intake/` and whose Storage metadata MIME type is `application/pdf`.
- Ordinary authenticated users: no read, upload, update, or delete access.
- Authorized admins: read and delete objects in the bucket through the `public.is_admin()` claim mechanism from migration `002_security_hardening.sql`.
- Public read: denied. Permanent public URLs are not generated.

The current startup admin delete flow removes the Storage object before deleting the database row. If cleanup is denied or fails, the row remains visible and deletion reports the Storage error. If the database insert fails after upload, the public form attempts to remove the newly uploaded object and reports the form failure without exposing Storage internals.

## Manual Supabase Steps

1. Review and apply `002_security_hardening.sql` first, then apply `003_pitch_deck_storage.sql`.
2. Verify the `pitch-decks` bucket is private, limited to 10 MB, and restricted to `application/pdf`.
3. Verify the three `storage.objects` policies in the Supabase Dashboard.
4. Confirm the approved Auth administrator has server-managed `app_metadata.role = admin` and has refreshed their session.
5. Test with a non-sensitive sample PDF as an anonymous visitor: upload and startup row insertion should succeed.
6. Verify an ordinary authenticated user cannot list, download, or delete objects.
7. Verify an authorized admin can access required objects using authenticated access or a short-lived signed URL generated when a future admin view action is added.

Do not put a service-role key in the browser or use a permanent public URL for these files. Do not upload sensitive real documents during testing.

## Cleanup and Recovery

Failed database inserts trigger best-effort object cleanup and log only a safe operational error. Operators should periodically compare `pitch_deck_path` values with objects in the bucket to identify orphaned files. Clean orphaned objects only after review and backup. Database row deletion attempts Storage cleanup first to avoid dangling references.

## Limitations

- The migration and policies are repository artifacts and have not been verified against a live Supabase project from this workspace.
- Client-side MIME and size checks can be bypassed; bucket configuration and Storage policies must be verified after deployment.
- Anonymous uploads are necessary because the public startup form is unauthenticated. Rate limiting, abuse detection, and malware scanning are not configured here and should be considered before high-volume production intake.
- The existing admin startup details view currently displays the stored path; a future enhancement can generate short-lived signed download URLs for authorized admins without storing them.
