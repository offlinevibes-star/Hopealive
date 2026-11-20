# Testing

## Local static and unit checks

Use Node.js 22:

~~~sh
node --check site.js
node --test tests/*.test.mjs
~~~

The suite parses the public site, admin inline scripts and media manager; checks security-sensitive wiring; and exercises pure contact input normalization/IP validation. It does not prove Supabase RLS, Storage permissions, Turnstile, Edge Function ingress headers, real media operations, or browser workflows.

## Isolated Supabase integration checks still required

Use a dedicated non-production Supabase project and separate Auth users (one allow-listed administrator and one signed-in non-admin). Never point destructive/integration tests at the live project.

Verify:
1. Anonymous users can read only published posts and media.
2. Anonymous users cannot read private media, admin activity logs, contact messages, donations or drafts.
3. A signed-in non-admin cannot insert/update/delete posts or media, access admin activity or change Storage objects.
4. The allow-listed admin can perform permitted CMS and media operations.
5. Private media signed URLs are issued only to admins and expire.
6. The cleanup queue handles successful deletion, Storage failure, metadata failure, retries, stale-running jobs and repeated requests.
7. Media in use by a published or draft post or public setting cannot be deleted or moved between buckets.
8. Orphaned objects, referenced-but-unregistered objects and broken database records are correctly distinguished.
9. Contact requests reject malformed JSON, oversized bodies, invalid fields, honeypot, missing/invalid/expired Turnstile, repeated email, repeated IP, global limit and rate-limit database failure.
10. For IP controls, prove the hosted ingress overwrites a forged client cf-connecting-ip header before setting TRUST_CF_CONNECTING_IP=true.

The repo's static checks do not currently constitute a full live RLS integration test suite. Use test accounts and disposable media only.

## Browser acceptance checks still required

Run desktop and mobile browser tests with isolated test data. Exercise:
- Admin login as an allow-listed user and rejection of a non-admin.
- Admin logout with audit RPC success and forced audit RPC failure.
- Create/edit/publish/unpublish/delete posts.
- Upload representative image and video formats.
- Rename display name; edit caption and alt text; confirm original filename, Storage path, URLs and playback remain unchanged.
- Public/private visibility moves and session expiry.
- Media search, page navigation, type/visibility filters and all sort orders with more than one page of fixtures.
- Delete unused media; reject deletion of media used by a published post and a draft post.
- Integrity report and explicitly confirmed orphan cleanup/retry.
- Contact form success and validation/error states.
- Keyboard navigation, screen-reader labels, mobile layout and loading/empty/error states.

Playwright browser E2E tests and a runnable isolated RLS fixture suite are still outstanding; configure the test environment before marking acceptance criteria complete.

## CI

GitHub Actions runs syntax and Node smoke/unit tests on pull requests and pushes to main. Workflow action references are pinned to immutable commit SHAs, checkout credentials are not persisted, permissions are read-only and Dependabot checks GitHub Actions updates weekly. These are supply-chain hardening measures, not a substitute for integration/E2E tests.
