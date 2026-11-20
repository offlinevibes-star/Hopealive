import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const site = read("../site.js");
const client = read("../supabase-client.js");
const admin = read("../admin.html");
const contact = read("../contact.html");
const importer = read("../supabase-migrate.html");
const migration = read("../supabase/migrations/003_security_reliability.sql");
const mediaMigration = read("../supabase/migrations/004_media_metadata_audit.sql");
const edge = read("../supabase/functions/contact-submit/index.ts");
const edgeValidation = read("../supabase/functions/contact-submit/validation.mjs");
const adminMedia = read("../admin-media.js");
const mediaOperations = read("../supabase/functions/admin-media/index.ts");
const operationsMigration = read("../supabase/migrations/005_media_operations_and_contact_limits.sql");
const auditMigration = read("../supabase/migrations/004_media_metadata_audit.sql");

function inlineScripts(html) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]).filter((script) => script.trim());
}

test("site.js parses as JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(site));
});

test("admin inline JavaScript parses", () => {
  for (const script of inlineScripts(admin)) assert.doesNotThrow(() => new vm.Script(script));
  assert.doesNotThrow(() => new vm.Script(adminMedia));
});

test("migration tool inline JavaScript parses", () => {
  for (const script of inlineScripts(importer)) assert.doesNotThrow(() => new vm.Script(script));
});

test("public contact form submits only through the rate-limited function", () => {
  assert.match(site, /functions\.invoke\('contact-submit'/);
  assert.doesNotMatch(site, /from\('contact_messages'\)\.insert/);
  assert.match(contact, /name="website"/);
  assert.match(edge, /consume_contact_rate_limit/);
  assert.match(edge, /429/);
});

test("unpublished media and draft post attachments use the private bucket", () => {
  assert.match(migration, /hopealive-private-media/);
  assert.match(adminMedia, /published \? MEDIA_BUCKET : PRIVATE_MEDIA_BUCKET/);
  assert.match(admin, /draft\?PRIVATE_MEDIA_BUCKET:MEDIA_BUCKET/);
  assert.match(adminMedia, /createSignedUrl/);
});

test("legacy donation import uses stable upsert keys", () => {
  assert.match(migration, /source_key text/);
  assert.match(importer, /onConflict:'source_key'/);
  assert.match(importer, /legacy-json:/);
});

test("password reset does not disclose a prefilled administrator email", () => {
  const reset = read("../forgot-password.html");
  assert.doesNotMatch(reset, /value="[^"]+@[^"]+"/);
});

test("media display names and alt text are editable without changing Storage paths", () => {
  assert.match(mediaMigration, /add column if not exists display_name text/);
  assert.match(mediaMigration, /add column if not exists alt_text text/);
  assert.match(adminMedia, /data-mdname/);
  assert.match(adminMedia, /data-malt/);
  assert.match(adminMedia, /createSignedUrl\(asset\.storage_path, 300\)/);
  assert.match(adminMedia, /display_name:/);
  assert.match(adminMedia, /alt_text:/);
  assert.match(adminMedia, /display-name edits never change media URLs or video playback/);
  assert.match(site, /cap:m\.display_name\|\|m\.filename/);
  assert.match(site, /alt:m\.alt_text\|\|m\.display_name/);
});

test("contact endpoint enforces streamed byte limits and production Turnstile", () => {
  assert.match(edge, /getReader\(\)/);
  assert.match(edge, /MAX_BODY_BYTES/);
  assert.doesNotMatch(edge, /content-length/);
  assert.match(edge, /!localDev && !turnstileSecret/);
  assert.match(edge, /TURNSTILE_ALLOWED_HOSTNAMES/);
  assert.match(edge, /email:/);
  assert.doesNotMatch(edge, /req\.headers\.get\(["'](?:x-forwarded-for|x-real-ip)["']\)/i);
});

test("admin audit trail is restricted and rate-limit cleanup is service-role only", () => {
  assert.match(mediaMigration, /admin_activity_logs/);
  assert.ok(mediaMigration.includes("record_admin_auth_event"));
  assert.ok(admin.includes("p_action:'login'"));
  assert.ok(admin.includes("p_action:'logout'"));
  assert.match(mediaMigration, /public\.is_hopealive_admin\(\)/);
  assert.match(mediaMigration, /cleanup_contact_rate_limits/);
  assert.match(mediaMigration, /to service_role/);
});


test("media operations use paginated queries and page-scoped private previews", () => {
  assert.match(adminMedia, /select\("\*", \{ count: "exact" \}\)/);
  assert.match(adminMedia, /\.range\(first, first \+ hopeMediaState\.pageSize - 1\)/);
  assert.match(adminMedia, /createSignedUrl\(asset\.storage_path, 300\)/);
  assert.match(adminMedia, /loading="lazy"/);
  assert.match(adminMedia, /preload="none"/);
  assert.match(adminMedia, /queue_orphan_delete/);
});

test("browser code cannot directly delete media Storage objects", () => {
  assert.doesNotMatch(admin, /storage\.from\([^)]*\)\.remove\(/);
  assert.match(operationsMigration, /storage\.objects is shared by/i);
  assert.match(operationsMigration, /drop policy if exists "HopeAlive admins delete media files"/);
  assert.match(operationsMigration, /drop policy if exists "HopeAlive admins delete private media files"/);
});

test("destructive media operations are admin-gated and retryable", () => {
  assert.match(mediaOperations, /auth\.getUser\(\)/);
  assert.match(mediaOperations, /is_hopealive_admin/);
  assert.match(mediaOperations, /enqueue_media_asset_delete/);
  assert.match(mediaOperations, /retry_cleanup/);
  assert.match(operationsMigration, /media_cleanup_jobs/);
  assert.match(operationsMigration, /delete_pending/);
  assert.match(operationsMigration, /hopealive_media_content_references/);
  assert.match(operationsMigration, /get_media_integrity_report/);
});

test("contact validation and layered limits use hashed global, email and optional IP keys", () => {
  assert.match(edge, /consume_contact_rate_limit_v2/);
  assert.match(edge, /global:contact:/);
  assert.match(edge, /email:/);
  assert.match(edge, /ip:/);
  assert.match(edge, /isValidIp/);
  assert.match(edgeValidation, /normalizeContactPayload/);
  assert.match(edgeValidation, /isValidIp/);
  assert.doesNotMatch(edge, /req\.headers\.get\(["'](?:x-forwarded-for|x-real-ip)["']\)/i);
});

test("admin logout does not await audit logging before clearing local session", () => {
  const logout = admin.match(/\$\('#logout'\)\.onclick=async\(\)=>\{[\s\S]*?\};show\('messages'\)/)?.[0] || "";
  assert.ok(logout.includes("db.auth.signOut({scope:'local'})"));
  assert.ok(logout.includes("await Promise.race([auditPromise"));
  assert.ok(logout.indexOf("db.auth.signOut({scope:'local'})") < logout.indexOf("await Promise.race([auditPromise"));
  assert.match(admin, /admin-media\.js/);
});

test("admin auth-event migration uses valid dollar quoting", () => {
  const body = auditMigration.split("create or replace function public.record_admin_auth_event")[1];
  assert.ok(body);
  assert.match(body, /as \$\$[\s\S]*?end;\s*\$\$;/);
});

test("Supabase browser and Edge SDK dependencies are pinned to exact versions", () => {
  assert.ok(admin.includes("@supabase/supabase-js@2.119.2"));
  assert.ok(client.includes("@supabase/supabase-js@2.119.2"));
  assert.ok(edge.includes("@supabase/supabase-js@2.119.2"));
});
