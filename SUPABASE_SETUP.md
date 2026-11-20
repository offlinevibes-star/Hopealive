# HopeAlive Supabase setup and deployment

The public website is a static GitHub Pages site. Browser code uses the Supabase project URL and publishable key only. **Never put a database password, service-role key, Supabase secret key or Turnstile secret in frontend files, GitHub Pages, or website settings.**

## Production safety

Treat the connected HopeAlive project as production. Take and verify an appropriate database backup and export both Storage buckets before applying schema changes. Do not run destructive tests against production. Apply changes first to a separate Supabase test project, confirm the schema and policies, deploy functions there, and run the automated and manual acceptance checks.

## Apply migrations in order

Use Supabase CLI in a trusted workstation or the Supabase SQL Editor, reviewing the SQL and current migration history first:

1. supabase/migrations/001_hopealive_cms.sql
2. supabase/migrations/002_media_library.sql
3. supabase/migrations/003_security_reliability.sql
4. supabase/migrations/004_media_metadata_audit.sql
5. supabase/migrations/005_media_operations_and_contact_limits.sql

Migration 004's administrator auth-event function uses corrected PostgreSQL dollar-quoting in this branch. Migration 005 is additive and:
- Adds media display-name, alt-text and pending-deletion metadata where absent, and creates media search/pagination indexes.
- Creates a private cleanup queue with retry status, attempt count and error details.
- Restricts direct browser deletion of media metadata; destructive cleanup is performed by the server-side media function.
- Adds administrator-only media integrity reporting, reference-aware delete requests and orphan cleanup requests.
- Replaces the posts read policy that used deprecated auth.role() with distinct public-published and admin-read policies.
- Adds global, email and optional trusted-IP rate-limit keys using a service-role-only function.

Do not re-run older migrations blindly. Confirm which versions have already been applied and inspect any SQL Editor-only changes before selecting the next migration. Take a backup before DDL changes.

## Administrator access

1. Invite administrators in Supabase Authentication → Users.
2. Add each invited user's exact Auth UUID to public.admin_users.
3. Do not enable public administrator sign-ups.
4. Enable **Leaked password protection** in Authentication password/security settings. The connected project advisor reported this was disabled during the review; it is a manual dashboard setting.
5. Restrict Auth redirect URLs to the production site, including https://offlinevibes-star.github.io/Hopealive/**.
6. Test an allow-listed admin, a signed-in non-admin and an anonymous visitor in the isolated environment.

The allow-list has RLS enabled and intentionally no browser policy. The boolean is_hopealive_admin() RPC is callable by authenticated users so the dashboard and Edge Functions can check the current user's allow-list membership; it returns only a boolean.

## Deploy Edge Functions

After migrations 001–005 are applied in the target environment:

~~~sh
supabase functions deploy contact-submit --no-verify-jwt
supabase functions deploy admin-media
~~~

- contact-submit intentionally allows anonymous visitors and performs validation, Turnstile verification and rate limiting itself; it must have platform JWT verification disabled.
- admin-media requires an authenticated user JWT and performs its own auth.getUser() and is_hopealive_admin() checks before any service-role operation. Keep platform JWT verification enabled (the default).

The functions use the standard Supabase Edge Function environment variables for project URL, anon key and service-role key. Do not copy secrets into the repo or website.

## Contact form secrets and controls

Set a strong random RATE_LIMIT_SALT and a Cloudflare Turnstile secret in Supabase Edge Function secrets:

~~~sh
supabase secrets set RATE_LIMIT_SALT=YOUR_RANDOM_SECRET
supabase secrets set TURNSTILE_SECRET_KEY=YOUR_TURNSTILE_SECRET
supabase secrets set TURNSTILE_ALLOWED_HOSTNAMES=offlinevibes-star.github.io
~~~

The public Turnstile site key belongs in the public site_settings.settings.turnstileSiteKey field; the secret key must remain a function secret. Production fails closed when the Turnstile secret is absent. Only an isolated local test may set APP_ENV=development to bypass Turnstile.

The contact function enforces a fixed 15-minute global cap (300 requests), per-normalized-email cap (5), and an optional per-IP cap (5). Identifiers are salted SHA-256 hashes; raw sender emails and IP addresses are not stored in the rate-limit table. Limiter database failures fail closed.

### Trusted IP rate limiting

The per-IP layer is intentionally disabled unless TRUST_CF_CONNECTING_IP=true is explicitly set. It reads only cf-connecting-ip; it does not parse client-supplied x-forwarded-for or x-real-ip values. The mere presence of a header is not proof that it was sanitized by the ingress.

Before enabling the flag, verify the actual deployed function route and proxy behavior for this project. Use a temporary diagnostic endpoint in the isolated environment to compare the received cf-connecting-ip with a caller-supplied forged value, confirm that the upstream proxy overwrites it, and remove the diagnostic endpoint afterwards. If that guarantee cannot be verified for the route being used, leave the flag unset; global and email controls still operate. Do not enable IP enforcement on a custom domain or alternate route without repeating this check.

A custom website origin also requires updating CONTACT_ALLOWED_ORIGIN and TURNSTILE_ALLOWED_HOSTNAMES before deploying the contact function.

## Media buckets and privacy

- hopealive-media is public for explicitly approved/published assets.
- hopealive-private-media is private for unpublished Gallery assets and draft attachments.
- Existing public objects are not automatically moved by migrations.
- Obtain appropriate documented consent before publishing identifiable people, especially children and other vulnerable people.
- Do not use public Storage URLs for unpublished content.

## Rate-limit cleanup

Migration 004/005 grants public.cleanup_contact_rate_limits() only to service_role. Schedule it daily through Supabase Cron or another trusted scheduler:

~~~sql
select public.cleanup_contact_rate_limits();
~~~

Scheduling is a manual operations step and is not activated by the migrations.

## Rollout sequence

1. Back up database and both Storage buckets.
2. Apply migrations to a test project.
3. Deploy both Edge Functions to the test project.
4. Configure Turnstile secrets and run contact-form tests, including the invalid-token path and rate-limit thresholds.
5. Run admin media pagination, metadata edits, visibility move, delete-in-use rejection, orphan scan, failure/retry and RLS tests in the test project.
6. Confirm the admin dashboard still loads posts, messages, settings, donations and activity logs.
7. Apply the reviewed migration sequence and deploy function versions to production during an approved rollout window.
8. Only then publish the frontend branch to GitHub Pages.
9. Review security and performance advisors and monitor function/Postgres logs.

Do not state a backup is verified until a restoration has actually been completed and recorded.
