import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const site = read("../site.js");
const admin = read("../admin.html");
const contact = read("../contact.html");
const importer = read("../supabase-migrate.html");
const migration = read("../supabase/migrations/003_security_reliability.sql");
const edge = read("../supabase/functions/contact-submit/index.ts");

function inlineScripts(html) {
  return [...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)]
    .map((match) => match[1]).filter((script) => script.trim());
}

test("site.js parses as JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(site));
});

test("admin inline JavaScript parses", () => {
  for (const script of inlineScripts(admin)) assert.doesNotThrow(() => new vm.Script(script));
});

test("migration tool inline JavaScript parses", () => {
  for (const script of inlineScripts(importer)) assert.doesNotThrow(() => new vm.Script(script));
});

test("public contact form submits only through the rate-limited function", () => {
  assert.match(site, /functions\\.invoke\\('contact-submit'/);
  assert.doesNotMatch(site, /from\\('contact_messages'\\)\\.insert/);
  assert.match(contact, /name="website"/);
  assert.match(edge, /consume_contact_rate_limit/);
  assert.match(edge, /429/);
});

test("unpublished media and draft post attachments use the private bucket", () => {
  assert.match(migration, /hopealive-private-media/);
  assert.match(admin, /published\\?MEDIA_BUCKET:PRIVATE_MEDIA_BUCKET/);
  assert.match(admin, /draft\\?PRIVATE_MEDIA_BUCKET:MEDIA_BUCKET/);
  assert.match(admin, /createSignedUrl/);
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
