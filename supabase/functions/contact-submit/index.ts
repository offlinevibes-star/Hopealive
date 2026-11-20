import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://offlinevibes-star.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== "https://offlinevibes-star.github.io") {
    return json({ error: "Origin not allowed" }, 403);
  }
  const length = Number(req.headers.get("content-length") || 0);
  if (length > 12_000) return json({ error: "Request too large" }, 413);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }

  // Honeypot: silently accept bot submissions without storing them.
  if (String(body.website || "").trim()) return json({ ok: true });
  const name = String(body.sender_name || "").trim();
  const email = String(body.sender_email || "").trim().toLowerCase();
  const message = String(body.message || "").trim();
  if (name.length < 1 || name.length > 120 ||
      email.length < 3 || email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      message.length < 1 || message.length > 5000) {
    return json({ error: "Please check your name, email and message." }, 400);
  }

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
  const ipHash = await sha256(ip + (Deno.env.get("RATE_LIMIT_SALT") || ""));
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Message service is not configured." }, 503);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: allowed, error: limitError } = await admin.rpc("consume_contact_rate_limit", { p_ip_hash: ipHash });
  if (limitError) {
    console.error("Contact rate limiter failed", limitError.message);
    return json({ error: "Message service is temporarily unavailable." }, 503);
  }
  if (allowed !== true) return json({ error: "Too many messages. Please wait 15 minutes and try again." }, 429);

  const { error } = await admin.from("contact_messages").insert({
    sender_name: name, sender_email: email, message,
  });
  if (error) {
    console.error("Contact insert failed", error.message);
    return json({ error: "Your message could not be saved. Please try again later." }, 500);
  }
  return json({ ok: true });
});
