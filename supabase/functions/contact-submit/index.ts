import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_ORIGIN = Deno.env.get("CONTACT_ALLOWED_ORIGIN") || "https://offlinevibes-star.github.io";
const MAX_BODY_BYTES = 12_000;
const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function readBodyLimited(req: Request): Promise<string> {
  if (!req.body) throw new Error("empty");
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError("too_large"); }
    chunks.push(value);
  }
  const joined = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN) return json({ error: "Origin not allowed." }, 403);
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "Content type must be application/json." }, 415);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await readBodyLimited(req));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "Invalid request." }, 400);
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RangeError && error.message === "too_large") return json({ error: "Request too large." }, 413);
    return json({ error: "Invalid request." }, 400);
  }
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });
  const name = typeof body.sender_name === "string" ? body.sender_name.trim() : "";
  const email = typeof body.sender_email === "string" ? body.sender_email.trim().toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (name.length < 1 || name.length > 120 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(name) ||
      email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      message.length < 1 || message.length > 5000) return json({ error: "Please check your name, email and message." }, 400);

  const localDev = Deno.env.get("APP_ENV") === "development";
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!localDev && !secret) {
    console.error("Contact verification is not configured.");
    return json({ error: "Message verification is temporarily unavailable." }, 503);
  }
  if (secret) {
    const token = typeof body.turnstile_token === "string" ? body.turnstile_token : "";
    if (!token || token.length > 2048) return json({ error: "Please complete the verification challenge." }, 400);
    try {
      const trustedIp = Deno.env.get("TRUST_CF_CONNECTING_IP") === "true" ? req.headers.get("cf-connecting-ip") || undefined : undefined;
      const params = new URLSearchParams({ secret, response: token }); if (trustedIp) params.set("remoteip", trustedIp);
      const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params, signal: AbortSignal.timeout(5000),
      });
      if (!verification.ok) return json({ error: "Verification service is unavailable." }, 503);
      const result = await verification.json();
      const hosts = (Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES") || "offlinevibes-star.github.io").split(",").map(x => x.trim()).filter(Boolean);
      if (result.success !== true || !hosts.includes(result.hostname)) return json({ error: "Verification failed. Please try again." }, 400);
    } catch { return json({ error: "Verification service is unavailable." }, 503); }
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), salt = Deno.env.get("RATE_LIMIT_SALT");
  if (!supabaseUrl || !serviceKey || !salt) return json({ error: "Message service is temporarily unavailable." }, 503);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const emailHash = await sha256("email:" + email + ":" + salt);
  const { data: emailAllowed, error: emailError } = await admin.rpc("consume_contact_rate_limit", { p_ip_hash: emailHash });
  if (emailError) { console.error("Contact rate limiter failed."); return json({ error: "Message service is temporarily unavailable." }, 503); }
  if (emailAllowed !== true) return json({ error: "Too many messages from this address. Please try again later." }, 429);
  if (Deno.env.get("TRUST_CF_CONNECTING_IP") === "true") {
    const ip = req.headers.get("cf-connecting-ip");
    if (ip && ip.length <= 64) {
      const ipHash = await sha256("ip:" + ip + ":" + salt);
      const { data: ipAllowed, error } = await admin.rpc("consume_contact_rate_limit", { p_ip_hash: ipHash });
      if (error) return json({ error: "Message service is temporarily unavailable." }, 503);
      if (ipAllowed !== true) return json({ error: "Too many messages. Please wait before trying again." }, 429);
    }
  }
  const { error } = await admin.from("contact_messages").insert({ sender_name: name, sender_email: email, message });
  if (error) { console.error("Contact insert failed."); return json({ error: "Your message could not be saved. Please try again later." }, 500); }
  return json({ ok: true });
});
