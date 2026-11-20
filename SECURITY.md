# Security model and operational checklist

## Authentication and authorization

- Supabase Auth authenticates administrators.
- `public.admin_users` is the single administrator allow-list. Do not enable public admin registration.
- The `is_hopealive_admin()` SECURITY DEFINER function returns only a boolean and uses an empty search path.
- RLS policies must remain enabled. Anonymous visitors may read public content only; administrative mutations require an allow-listed authenticated user.

## Contact submissions

The `contact-submit` Edge Function:
- accepts JSON POST only and enforces a 12 KB limit while reading the actual request stream;
- validates field types and lengths and handles a honeypot;
- requires Turnstile in production and fails closed if its secret is missing or verification fails;
- hashes sender email for a five-submission/15-minute control;
- optionally adds IP-based limiting only when `TRUST_CF_CONNECTING_IP=true` and the deployment is behind a confirmed trusted Cloudflare proxy;
- never trusts `x-forwarded-for`, `x-real-ip`, or other client-controlled forwarding headers;
- returns generic errors and does not expose secrets.

Required Edge Function secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, and `RATE_LIMIT_SALT`. Configure `CONTACT_ALLOWED_ORIGIN` and `TURNSTILE_ALLOWED_HOSTNAMES` when using a custom domain. Do not set `APP_ENV=development` in production.

## Storage

- `hopealive-media` is public for deliberately published content. Public URLs are accessible to anyone who obtains them.
- `hopealive-private-media` is private; the admin dashboard uses signed URLs for previews.
- Storage writes are restricted to administrators by Storage RLS policies.
- Unpublished media must not be placed in the public bucket.

## Secrets and hosting headers

The static GitHub Pages host does not provide arbitrary response-header configuration through repository files. Configure security headers at a reverse proxy/CDN if one is introduced. A strict CSP must account for the existing inline scripts and Supabase/Turnstile/CDN origins; do not deploy a policy that silently blocks authentication or contact verification.

## Operational checks

- Review Supabase Database and Storage RLS policies after schema changes.
- Enable leaked-password protection in Supabase Auth.
- Keep the service-role key only in Edge Function secrets.
- Schedule `public.cleanup_contact_rate_limits()` daily.
- Review the administrator activity log and Supabase function logs.
- Treat public media as permanently discoverable even if later removed from the Gallery; use private storage for unapproved material.
