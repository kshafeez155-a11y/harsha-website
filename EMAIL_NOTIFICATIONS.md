# Email Notifications

Date: 2026-08-23

## Audit Result

No email provider, Supabase Edge Function, server-side mail endpoint, provider SDK, queue, or email delivery-status column exists in this repository. No browser code sends email or contains a provider secret. The current forms save submissions to Supabase and show in-app success/error feedback only.

Real submission forms audited:

- Startup registration: `startup_registrations`, user email available.
- Chapter application: `chapter_applications`, user email available.
- Community join: `community_join_applications`, user email available.
- Event registration: `event_registrations`, user email available.
- Meeting registration: `meeting_registrations`, user email available.
- Partner application: `partner_applications`, user email available.
- Founder connection request: `founder_connection_requests`, user email available.
- Contact form: `contact_submissions`, contact email available.

Admin login/settings also use email, but authentication emails are handled by Supabase Auth and are not application notifications. The unused `PitchDeckUpload.tsx` component is not a submission flow and does not send email.

## Decision

Transactional email delivery is not implemented yet because no provider or secure server-side execution environment is configured. This avoids falsely claiming delivery and avoids placing provider credentials in `VITE_*` variables or browser code.

Recommended first events, once a provider is configured:

1. Send a user confirmation after each successful public submission, using the email already collected by that form.
2. Send an admin notification for startup, chapter, partner, founder connection, pitch-deck, and contact submissions only after a fixed server-side destination is configured.
3. Add event/meeting confirmations only when the product has a stable event or meeting identity and the message content is defined.

## Recommended Secure Architecture

Use one Supabase Edge Function such as `send-transactional-email` after the database insert succeeds. The browser should send only a validated event type and sanitized submission identifier or minimal payload. The function must:

- Validate the request and authenticated context where required.
- Use a fixed allowlist of event types.
- Read the provider key from an Edge Function secret, never from `VITE_*` environment variables.
- Read the admin destination from an Edge Function secret, never from frontend source.
- Validate recipient email format server-side.
- Load sensitive submission details server-side when possible.
- Reject arbitrary admin recipient addresses.
- Return only delivery-request success/failure, never provider credentials or raw secrets.
- Apply rate limiting and abuse controls before sending public-triggered mail.

The database insert must remain the source-of-truth operation. Email failure must not roll back or falsely mark a successful submission as failed. The UI should distinguish “saved, notification unavailable” from “submission failed.”

## Provider Configuration

No provider is selected or configured. When one is approved, configure its values only as server-side Edge Function secrets, for example:

- `EMAIL_PROVIDER_API_KEY`
- `EMAIL_FROM_ADDRESS`
- `ADMIN_NOTIFICATION_EMAIL`

Do not add these as `VITE_` variables. Do not commit values. A sender domain should be verified with the provider before production use.

## Templates

User confirmations should contain a clear confirmation title, the submission category, a short next-step message, and the existing Hanova contact method when appropriate. Admin notifications should contain only the category, timestamp, record identifier, and the minimum contact context needed for follow-up. Never include passwords, tokens, provider responses containing secrets, or unnecessary full submission text.

## Abuse and Duplicate Protection

Current forms already prevent duplicate clicks while a request is in flight. That prevents the obvious browser double-submit case, but it is not rate limiting and does not provide cross-device idempotency. A future Edge Function should enforce request authentication/context, rate limits, payload size limits, and an idempotency key derived from the successful submission event. Do not retry the database insert when retrying an email.

A honeypot/CAPTCHA or server-side rate limit should be evaluated before enabling public-triggered email, because public forms can otherwise be abused to send mail. No such protection is configured in this repository.

## Error Handling

Until a provider is configured, no email request is made and no email success is shown. After implementation, provider failures should be logged in protected backend logs and surfaced to the user as a non-blocking notification failure after the database insert succeeds. Do not expose provider error bodies, API keys, or internal stack traces.

## Local Development and Deployment

Local development currently has no email delivery. Use a provider sandbox/test recipient restriction when an Edge Function is added. Keep secrets in Supabase Edge Function secrets or the approved server secret store. Deploy the function separately, verify sender-domain configuration, and test with non-sensitive addresses before enabling production recipients.

## Database Status

No migration was created. Existing tables do not contain notification-delivery status, and adding status columns is not justified until a concrete provider, retry policy, and operational reporting requirement exist. If delivery tracking becomes necessary, prefer a separate notification-attempt table or a carefully designed migration rather than storing provider secrets or raw provider responses.

## Remaining Limitations

- No user confirmation emails are currently sent.
- No admin notification emails are currently sent.
- No provider delivery, bounce, retry, or suppression state is available.
- No server-side rate limiter or CAPTCHA is configured.
- Live Supabase/Edge Function configuration was not available for verification.
