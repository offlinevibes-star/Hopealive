# Testing

## Local static and unit checks

Use Node.js 22:

~~~sh
node --check site.js
node --test tests/*.test.mjs
~~~

The suite parses the public site, admin inline scripts and media manager; checks security-sensitive wiring, direct Storage-delete restrictions and advisory-lock SQL wiring; and exercises pure contact input normalization/IP validation. The RLS and browser suites are opt-in and will be skipped unless their test-only credentials, safety confirmation and optional dependencies are present. It does not prove Supabase RLS, Storage permissions, Turnstile, Edge Function ingress headers, real media operations, or browser workflows.

## Isolated Supabase integration checks still required

Use a dedicated non-production Supabase project and separate Auth users (one allow-listed administrator and one signed-in non-admin). Never point destructive/integration tests at the live project.

Verify:
1. Anonymous users can read only published posts and media.
2. Anonymous users cannot read private media, admin activity logs, contact messages, donations or drafts.
3. A signed-in non-admin cannot insert/update/delete posts or media, access admin activity or change Storage objects.
4. The allow-listed admin can perform permitted CMS and media operations.
5. Private media signed URLs are issued only to admins and expire.
6. The cleanup queue handles successful deletion, Storage failure, metadata failure, retries, stale-running jobs and repeated requests. Concurrent workers cannot claim the same fresh job; stale running jobs become reclaimable after the retry timeout. Concurrent content-reference writes and delete/visibility requests must serialize through the shared/exclusive advisory lock so a referenced object is never removed.
7. Media in use by a published or draft post or public setting cannot be deleted or moved between buckets. Exercise a concurrent post/site-setting reference write against delete and visibility requests in separate transactions.
8. Orphaned objects, referenced-but-unregistered objects and broken database records are correctly distinguished.
9. Contact requests reject malformed JSON, oversized bodies, invalid fields, honeypot, missing/invalid/expired Turnstile, repeated email, repeated IP, global limit and rate-limit database failure.
10. For IP controls, prove the hosted ingress overwrites a forged client cf-connecting-ip header before setting TRUST_CF_CONNECTING_IP=true.

The opt-in suite is in tests/supabase-rls.integration.test.mjs. Install @supabase/supabase-js in the isolated test workspace and set HOPEALIVE_TEST_URL, HOPEALIVE_TEST_ANON_KEY, HOPEALIVE_TEST_ADMIN_EMAIL, HOPEALIVE_TEST_ADMIN_PASSWORD, HOPEALIVE_TEST_NONADMIN_EMAIL, HOPEALIVE_TEST_NONADMIN_PASSWORD, and HOPEALIVE_TEST_CONFIRM_ISOLATED=I_CONFIRM_THIS_IS_NOT_PRODUCTION. It rejects the known production project ref. The test admin-media function must be deployed to the test project. The suite creates temporary probe records only in that confirmed isolated project and attempts cleanup if an unexpected RLS permission is granted.

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

The opt-in Playwright smoke test is in tests/admin.browser.test.mjs. Install Playwright and set HOPEALIVE_E2E_BASE_URL, HOPEALIVE_E2E_SUPABASE_URL, HOPEALIVE_E2E_ANON_KEY, HOPEALIVE_E2E_ADMIN_EMAIL, HOPEALIVE_E2E_ADMIN_PASSWORD and HOPEALIVE_E2E_CONFIRM_ISOLATED=I_CONFIRM_THIS_IS_NOT_PRODUCTION. The browser suite rewrites frontend requests from the configured production project URL to the explicitly supplied test project and intercepts the audit RPC to simulate failure. It covers login, the paginated media controls and logout during audit failure; it does not yet automate the full post CRUD, upload/video, reference-blocking and contact/CAPTCHA scenarios listed above.

## CI

GitHub Actions runs syntax and Node smoke/unit tests on pull requests and pushes to main. Workflow action references are pinned to immutable commit SHAs, checkout credentials are not persisted, permissions are read-only and Dependabot checks GitHub Actions updates weekly. These are supply-chain hardening measures, not a substitute for integration/E2E tests.
