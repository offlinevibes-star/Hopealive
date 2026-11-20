# HopeAlive Supabase production setup

The public website is hosted as a static GitHub Pages site. The browser uses only the Supabase project URL and publishable key. **Never place the database password, service-role key, or other server secrets in website files or `site_settings`.**

## Apply the database migrations

Run these migrations in order in the HopeAlive Supabase project's SQL Editor:

1. `supabase/migrations/001_hopealive_cms.sql`
2. `supabase/migrations/002_media_library.sql`
3. `supabase/migrations/003_security_reliability.sql`

Migration 003 is additive and preserves existing media objects. It:
- Adds a stable source key to legacy donation imports so repeat imports upsert instead of creating duplicates.
- Creates a private media bucket for unpublished gallery items and draft-post attachments.
- Keeps the existing public bucket for approved/published website media and restricts future uploads to approved raster/video MIME types.
- Adds a server-side contact rate-limit table/function and removes direct anonymous inserts into the contact table.
- Consolidates overlapping post/settings read policies while retaining public published reads and allow-listed admin access.

Do not skip migrations or run 003 before 002. Take a database backup before applying schema changes.

## Administrator access

1. In Supabase Authentication → Users, invite each administrator.
2. Add each invited user's exact Auth UUID to `public.admin_users`.
3. Do not enable public administrator sign-ups.
4. In Authentication settings, enable **Leaked password protection** (Have I Been Pwned checks) and set a suitable minimum password length.
5. Restrict allowed redirect URLs to the production site, including:
   `https://offlinevibes-star.github.io/Hopealive/**`
6. Test sign-in, password recovery, sign-out, and removal from the admin allow-list.

The database advisor may report `admin_users` as RLS-enabled without policies. That is intentional: browser roles must not enumerate the allow-list. The `is_hopealive_admin()` SECURITY DEFINER RPC is intentionally executable by authenticated users so the dashboard can check its own authorization; it returns only a boolean.

## Expose the Data API schema

In Project Settings → API (or the project's Data API settings), confirm that `public` is included in the exposed schemas. The site calls the Supabase Data API for `posts`, `site_settings`, `media_assets`, and admin-only tables. SQL grants and RLS policies alone do not expose a schema through PostgREST.

Keep RLS enabled and test both anonymous and administrator access after changing exposure settings.

## Deploy the contact Edge Function

The public contact form now calls `contact-submit`; it no longer inserts directly into `contact_messages`.

From the repository root, after migration 003 has been applied:

```sh
supabase functions deploy contact-submit --no-verify-jwt
```

This endpoint intentionally does not require a Supabase user JWT because visitors are anonymous. The function validates the request, applies a limit of five submissions per IP hash per 15 minutes, uses a honeypot, and inserts through the server-side service role. The service-role key must remain in Supabase's function environment only.

The function allows the GitHub Pages origin `https://offlinevibes-star.github.io`. If the site uses a custom domain, update the function's CORS/origin allow-list before deployment.

### Turnstile (recommended)

The function supports Cloudflare Turnstile when configured:

1. Create a Turnstile widget for the production site hostname in Cloudflare.
2. Put the **site key** in the public website settings JSON as `"turnstileSiteKey": "YOUR_SITE_KEY"`.
3. Store the **secret key** as a Supabase Edge Function secret, never in the website:
   ```sh
   supabase secrets set TURNSTILE_SECRET_KEY=YOUR_SECRET_KEY
   ```
4. Redeploy `contact-submit` and test valid, missing, and invalid challenges.

Until both keys are configured, the honeypot and server-side rate limit remain active, but Turnstile verification is not enforced.

## Media privacy and consent

- The `hopealive-media` bucket remains public for media intentionally published on the public website.
- The new `hopealive-private-media` bucket is private. New unpublished Gallery media and draft-post attachments go there and are shown to administrators through short-lived signed URLs.
- Publishing copies the asset to the public bucket; unpublishing moves it back to private storage.
- Existing published assets are not moved by migration 003. The current project had 94 media rows, all marked published, and 94 objects in the public bucket at the time of review.
- If older draft posts already have attachments in the public bucket, edit and save each draft once to move those attachments to private storage.
- Obtain and retain appropriate consent before publishing identifiable people, especially children. A public object URL is accessible to anyone who has it.

## Donation import

Run the legacy import from the admin dashboard only after migration 003. Posts and settings are upserted. Donations now receive deterministic `source_key` values and are upserted by that key, so rerunning the same import will not duplicate those imported rows. Manually entered donations are not overwritten.

If an earlier version of the importer was run before source keys existed, reconcile any old imported donation rows manually before re-importing them; the new key cannot automatically identify historical duplicates.

## Public website settings

Every value in `site_settings.settings` is public. Only store verified public contact details, approved images, public social links, donation instructions, and other content intended for visitors. Never store private staff details, passwords, payment-provider secrets, service-role keys, or other credentials there. The admin editor now validates the top-level settings keys and displays this warning.

Published post HTML is sanitized with DOMPurify before it is rendered. If the sanitizer CDN cannot load, the post body is rendered as escaped text rather than trusted raw HTML.

## Backups, tests, and rollout

1. Enable the strongest database backup/PITR option available for the Supabase plan and periodically test a restore.
2. Merge the GitHub pull request only after the GitHub Actions static smoke tests pass.
3. Apply migration 003 and deploy the Edge Function before publishing the new frontend. This order prevents the new contact form from calling an undeployed function.
4. Configure Turnstile and leaked-password protection before public launch.
5. Test on desktop and mobile:
   - Public pages and published posts load; drafts stay hidden.
   - Draft media previews work only for signed-in admins.
   - Publishing/unpublishing media copies between buckets and updates metadata.
   - Contact form success, validation, honeypot, rate-limit (sixth request), and Turnstile.
   - Donation import can be run twice without increasing imported donation count.
   - Admin CRUD, session expiry, password recovery, and unauthorized accounts.
6. Review Supabase security/performance advisors after migration and monitor Edge Function/Postgres logs.

The GitHub Actions tests are static syntax/security smoke checks; they do not replace browser, end-to-end, permission, or restore testing.
