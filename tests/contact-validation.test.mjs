import test from "node:test";
import assert from "node:assert/strict";
import { isValidIp, normalizeContactPayload } from "../supabase/functions/contact-submit/validation.mjs";

test("contact payload trims fields and normalizes email casing", () => {
  assert.deepEqual(
    normalizeContactPayload({
      sender_name: "  Ada Lovelace ",
      sender_email: " ADA@EXAMPLE.COM ",
      message: " Hello ",
    }),
    { name: "Ada Lovelace", email: "ada@example.com", message: "Hello" },
  );
});

test("contact payload rejects malformed and out-of-range fields", () => {
  assert.equal(normalizeContactPayload([]), null);
  assert.equal(normalizeContactPayload(null), null);
  assert.equal(normalizeContactPayload({ sender_name: "", sender_email: "a@b.co", message: "x" }), null);
  assert.equal(normalizeContactPayload({ sender_name: "A", sender_email: "not-an-email", message: "x" }), null);
  assert.equal(normalizeContactPayload({ sender_name: "A", sender_email: "a@b.co", message: "" }), null);
  assert.equal(normalizeContactPayload({ sender_name: "A".repeat(121), sender_email: "a@b.co", message: "x" }), null);
  assert.equal(normalizeContactPayload({ sender_name: "A", sender_email: "a@b.co", message: "x".repeat(5001) }), null);
  assert.equal(normalizeContactPayload({ sender_name: "A\u0000B", sender_email: "a@b.co", message: "x" }), null);
});

test("trusted IP validation accepts IPv4 and IPv6, rejects header injection", () => {
  assert.equal(isValidIp("203.0.113.10"), true);
  assert.equal(isValidIp("2001:db8::1"), true);
  assert.equal(isValidIp("127.0.0.1, 198.51.100.4"), false);
  assert.equal(isValidIp("not-an-ip"), false);
  assert.equal(isValidIp("203.0.113.999"), false);
  assert.equal(isValidIp(""), false);
});
