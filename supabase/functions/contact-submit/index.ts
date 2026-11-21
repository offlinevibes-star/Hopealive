import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";
import { isValidIp, MAX_BODY_BYTES, normalizeContactPayload } from "./validation.mjs";

const SITE_ORIGIN = Deno.env.get("CONTACT_ALLOWED_ORIGIN") || "https://offlinevibes-star.github.io";
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
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError("too_large");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(joined);
}
function suspicious(reason: string, req: Request) {
  // Never log the sender's email, message or raw IP address.
  console.warn("Contact submission rejected", {
    reason,
    requestId: (req.headers.get("sb-request-id") || "").slice(0, 80),
  });
}
async function consumeLimit(admin: ReturnType<typeof createClient>, keyHash: string, limit: number) {
  const { data, error } = await admin.rpc("consume_contact_rate_limit_v2", {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: 900,
  });
  if (error) return { allowed: false, failed: true };
  return { allowed: data === true, failed: false };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN) {
    suspicious("origin", req);
    return json({ error: "Origin not allowed." }, 403);
  }
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    suspicious("content_type", req);
    return json({ error: "Content type must be application/json." }, 415);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await readBodyLimited(req));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      suspicious("malformed_body", req);
      return json({ error: "Invalid request." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RangeError && error.message === "too_large") {
      suspicious("body_too_large", req);
      return json({ error: "Request too large." }, 413);
    }
    suspicious("invalid_json", req);
    return json({ error: "Invalid request." }, 400);
  }

  // Honeypot responses deliberately look successful to automated form fillers.
  if (typeof body.website === "string" && body.website.trim()) return json({ ok: true });
  const normalized = normalizeContactPayload(body);
  if (!normalized) {
    suspicious("invalid_fields", req);
    return json({ error: "Please check your name, email and message." }, 400);
  }

  const localDev = Deno.env.get("APP_ENV") === "development";
  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const salt = Deno.env.get("RATE_LIMIT_SALT");
  if ((!localDev && !turnstileSecret) || !supabaseUrl || !serviceKey || !salt) {
    console.error("Contact verification or persistence is not configured.");
    return json({ error: "Message verification is temporarily unavailable." }, 503);
  }

  // cf-connecting-ip is used only after an operator explicitly enables the hosted
  // Supabase/Cloudflare ingress configuration. Never trust client X-Forwarded-For.
  const trustCfIp = Deno.env.get("TRUST_CF_CONNECTING_IP") === "true";
  let clientIp: string | null = null;
  if (trustCfIp) {
    const candidate = req.headers.get("cf-connecting-ip");
    if (!candidate || !isValidIp(candidate)) {
      suspicious("trusted_ip_header_missing_or_invalid", req);
      return json({ error: "Message service is temporarily unavailable." }, 503);
    }
    clientIp = candidate.trim();
  }

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const globalHash = await sha256("global:contact:" + salt);
  const emailHash = await sha256("email:" + normalized.email + ":" + salt);

  // The global cap protects verification/persistence services from bulk abuse.
  // Per-email/IP quotas are consumed only after a successful challenge so a caller
  // cannot lock another sender out by submitting invalid or missing CAPTCHA tokens.
  const globalResult = await consumeLimit(service, globalHash, 300);
  if (globalResult.failed) {
    console.error("Contact rate limiter unavailable.");
    return json({ error: "Message service is temporarily unavailable." }, 503);
  }
  if (!globalResult.allowed) {
    suspicious("global_limit", req);
    return json({ error: "Too many messages. Please try again later." }, 429);
  }

  if (turnstileSecret) {
    const token = typeof body.turnstile_token === "string" ? body.turnstile_token : "";
    if (!token || token.length > 2048) {
      suspicious("turnstile_missing", req);
      return json({ error: "Please complete the verification challenge." }, 400);
    }
    try {
      const params = new URLSearchParams({ secret: turnstileSecret, response: token });
      if (clientIp) params.set("remoteip", clientIp);
      const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
        signal: AbortSignal.timeout(5000),
      });
      if (!verification.ok) {
        console.error("Turnstile verification service unavailable.");
        return json({ error: "Verification service is unavailable." }, 503);
      }
      const result = await verification.json();
      const hosts = (Deno.env.get("TURNSTILE_ALLOWED_HOSTNAMES") || "offlinevibes-star.github.io")
        .split(",").map((value) => value.trim()).filter(Boolean);
      if (result.success !== true || !hosts.includes(result.hostname)) {
        suspicious("turnstile_failed", req);
        return json({ error: "Verification failed. Please try again." }, 400);
      }
    } catch {
      console.error("Turnstile verification request failed.");
      return json({ error: "Verification service is unavailable." }, 503);
    }
  }

  const emailResult = await consumeLimit(service, emailHash, 5);
  if (emailResult.failed) {
    console.error("Contact email rate limiter unavailable.");
    return json({ error: "Message service is temporarily unavailable." }, 503);
  }
  if (!emailResult.allowed) {
    suspicious("email_limit", req);
    return json({ error: "Too many messages. Please try again later." }, 429);
  }

  if (clientIp) {
    const ipHash = await sha256("ip:" + clientIp + ":" + salt);
    const ipResult = await consumeLimit(service, ipHash, 5);
    if (ipResult.failed) {
      console.error("Contact IP rate limiter unavailable.");
      return json({ error: "Message service is temporarily unavailable." }, 503);
    }
    if (!ipResult.allowed) {
      suspicious("ip_limit", req);
      return json({ error: "Too many messages. Please wait before trying again." }, 429);
    }
  }

  const { error } = await service.from("contact_messages").insert({
    sender_name: normalized.name,
    sender_email: normalized.email,
    message: normalized.message,
  });
  if (error) {
    console.error("Contact message insert failed.");
    return json({ error: "Your message could not be saved. Please try again later." }, 500);
  }
  return json({ ok: true });
});
