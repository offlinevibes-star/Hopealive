# Testing

## Automated checks

Run the current static/syntax smoke suite with Node.js 22:

```sh
node --test tests/security-smoke.test.mjs
```

GitHub Actions runs this suite on pull requests and pushes to `main`.

The suite checks JavaScript parsing and key security wiring. It is not a browser end-to-end suite and does not prove Supabase RLS, Storage privacy, Turnstile, or real upload behavior.

## Required isolated integration tests before production

Use a separate Supabase project and non-production administrator account. Verify:
1. Anonymous users cannot list or mutate admin records, private media or activity logs.
2. An allow-listed admin can use the dashboard; a signed-in non-admin is rejected.
3. Public Gallery items render their display name and alt text; unpublished items are not publicly accessible.
4. Private signed URLs expire and are not issued to anonymous users.
5. Contact requests reject oversized bodies, invalid JSON, invalid fields, honeypot submissions and invalid/missing Turnstile tokens.
6. The sixth request in a 15-minute email/IP window is rate-limited.
7. Media upload, metadata edits, publication changes and deletion are checked for Storage/database consistency.
8. Activity entries are visible to admins only and contain no secret or content values.

## Browser acceptance checks

On desktop and mobile, manually test the public pages, contact form, admin sign-in/out, media uploads, video previews, display-name/alt-text/caption edits, Gallery rendering, private media and session expiry. Use test data only.

## Known gaps

Playwright-based browser tests, Supabase integration tests, automated RLS policy assertions and real restore tests have not yet been implemented or run. Do not treat static checks as substitutes for those tests.
