import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.119.2";

const SITE_ORIGIN = Deno.env.get("CONTACT_ALLOWED_ORIGIN") || "https://offlinevibes-star.github.io";
const PUBLIC_BUCKET = "hopealive-media";
const PRIVATE_BUCKET = "hopealive-private-media";
const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function readJson(req: Request) {
  if (!req.body) throw new Error("Request body is required.");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > 8192) {
      await reader.cancel();
      throw new Error("Request body is too large.");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.replace(/[\r\n]/g, " ").slice(0, 900);
}

async function objectExists(admin: ReturnType<typeof createClient>, bucket: string, path: string) {
  const separator = path.lastIndexOf("/");
  const folder = separator >= 0 ? path.slice(0, separator) : "";
  const filename = separator >= 0 ? path.slice(separator + 1) : path;
  const { data, error } = await admin.storage.from(bucket).list(folder, {
    limit: 100, offset: 0, search: filename,
  });
  if (error) throw error;
  return (data || []).some((item) => item.name === filename);
}

async function removeObjectIdempotently(admin: ReturnType<typeof createClient>, bucket: string, path: string) {
  if (!await objectExists(admin, bucket, path)) return;
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (error && await objectExists(admin, bucket, path)) throw error;
}

async function contentIsReferenced(admin: ReturnType<typeof createClient>, bucket: string, path: string, publicUrl: string | null) {
  const { data, error } = await admin.rpc("hopealive_media_content_references", {
    p_storage_bucket: bucket,
    p_storage_path: path,
    p_public_url: publicUrl,
  });
  if (error) throw error;
  return data === true;
}

async function processJob(admin: ReturnType<typeof createClient>, jobId: string) {
  const { data: job, error: readError } = await admin.from("media_cleanup_jobs")
    .select("*").eq("id", jobId).maybeSingle();
  if (readError) throw readError;
  if (!job) throw new Error("Cleanup job not found.");
  if (job.status === "completed") return { id: job.id, status: "completed" };

  const { error: claimError } = await admin.from("media_cleanup_jobs").update({
    status: "running",
    attempts: Number(job.attempts || 0) + 1,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);
  if (claimError) throw claimError;

  try {
    if (await contentIsReferenced(admin, job.storage_bucket, job.storage_path, job.reference_url || null)) {
      const message = "The Storage path is now referenced by a post or public setting; cleanup was blocked.";
      await admin.from("media_cleanup_jobs").update({
        status: "blocked", last_error: message, updated_at: new Date().toISOString(),
      }).eq("id", jobId);
      return { id: job.id, status: "blocked", message };
    }

    if (job.operation === "delete_orphan") {
      const { data: registered, error: registeredError } = await admin.from("media_assets")
        .select("id").eq("storage_bucket", job.storage_bucket)
        .eq("storage_path", job.storage_path).limit(1);
      if (registeredError) throw registeredError;
      if (registered?.length) {
        const message = "The object is now registered in the media library; cleanup was blocked.";
        await admin.from("media_cleanup_jobs").update({
          status: "blocked", last_error: message, updated_at: new Date().toISOString(),
        }).eq("id", jobId);
        return { id: job.id, status: "blocked", message };
      }
    }

    await removeObjectIdempotently(admin, job.storage_bucket, job.storage_path);

    if (job.operation === "delete_asset" && job.media_asset_id) {
      const { error: deleteError } = await admin.from("media_assets")
        .delete().eq("id", job.media_asset_id).eq("delete_pending", true);
      if (deleteError) throw deleteError;
    }

    const { error: doneError } = await admin.from("media_cleanup_jobs").update({
      status: "completed", last_error: null, completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    if (doneError) throw doneError;
    return { id: job.id, status: "completed" };
  } catch (error) {
    const message = safeError(error);
    await admin.from("media_cleanup_jobs").update({
      status: "failed", last_error: message, updated_at: new Date().toISOString(),
    }).eq("id", jobId);
    return { id: job.id, status: "failed", message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN) return json({ ok: false, message: "Origin not allowed." }, 403);

  let body: Record<string, unknown>;
  try {
    const parsed = await readJson(req);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ ok: false, message: "Invalid request." }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    return json({ ok: false, message: safeError(error) }, 400);
  }

  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return json({ ok: false, message: "Administrator sign-in required." }, 401);
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    console.error("Media operations are not configured.");
    return json({ ok: false, message: "Media service is not configured." }, 503);
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) return json({ ok: false, message: "Administrator sign-in required." }, 401);
  const { data: isAdmin, error: adminCheckError } = await authClient.rpc("is_hopealive_admin");
  if (adminCheckError) {
    console.error("Could not verify media administrator authorization.");
    return json({ ok: false, message: "Administrator authorization could not be verified." }, 503);
  }
  if (isAdmin !== true) return json({ ok: false, message: "Administrator access required." }, 403);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const action = body.action;

  if (action === "scan") {
    const { data, error } = await authClient.rpc("get_media_integrity_report");
    if (error) return json({ ok: false, message: "Integrity scan failed: " + safeError(error) });
    return json({ ok: true, report: data });
  }

  if (action === "delete_asset") {
    const assetId = typeof body.asset_id === "string" ? body.asset_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
      return json({ ok: false, message: "Invalid media identifier." }, 400);
    }
    const { data: jobId, error } = await authClient.rpc("enqueue_media_asset_delete", { p_asset_id: assetId });
    if (error) {
      const conflict = error.code === "23503" || /referenced|in use/i.test(error.message || "");
      return json({ ok: false, message: safeError(error) }, conflict ? 200 : 400);
    }
    const outcome = await processJob(admin, jobId);
    return json({
      ok: outcome.status === "completed",
      message: outcome.status === "completed" ? "Media deleted." : (outcome.message || "Deletion is queued for retry."),
      cleanup: outcome,
    });
  }

  if (action === "queue_orphan_delete") {
    const bucket = typeof body.bucket === "string" ? body.bucket : "";
    const path = typeof body.path === "string" ? body.path : "";
    if (![PUBLIC_BUCKET, PRIVATE_BUCKET].includes(bucket) || !path.trim() || path.length > 1024) {
      return json({ ok: false, message: "Invalid Storage object." }, 400);
    }
    const { data: jobId, error } = await authClient.rpc("enqueue_media_orphan_delete", {
      p_bucket: bucket, p_path: path,
    });
    if (error) return json({ ok: false, message: safeError(error) });
    const outcome = await processJob(admin, jobId);
    return json({
      ok: outcome.status === "completed",
      message: outcome.status === "completed" ? "Orphaned Storage object removed." : (outcome.message || "Cleanup is queued for retry."),
      cleanup: outcome,
    });
  }

  if (action === "retry_cleanup") {
    const staleRunningBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const [queued, stale] = await Promise.all([
      admin.from("media_cleanup_jobs").select("id")
        .in("status", ["pending", "failed", "blocked"])
        .order("created_at", { ascending: true }).limit(10),
      admin.from("media_cleanup_jobs").select("id")
        .eq("status", "running").lt("updated_at", staleRunningBefore)
        .order("created_at", { ascending: true }).limit(10),
    ]);
    if (queued.error || stale.error) {
      return json({ ok: false, message: "Could not load cleanup jobs: " + safeError(queued.error || stale.error) });
    }
    const jobs = [...(queued.data || []), ...(stale.data || [])]
      .filter((job, index, all) => all.findIndex((item) => item.id === job.id) === index)
      .slice(0, 10);
    const results = [];
    for (const job of jobs) results.push(await processJob(admin, job.id));
    const completed = results.filter((item) => item.status === "completed").length;
    return json({
      ok: true, attempted: results.length, completed,
      pending: results.filter((item) => item.status !== "completed"),
    });
  }

  if (action === "set_visibility") {
    const assetId = typeof body.asset_id === "string" ? body.asset_id : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId) ||
        typeof body.is_published !== "boolean") {
      return json({ ok: false, message: "Invalid visibility request." }, 400);
    }
    const { data: asset, error: assetError } = await admin.from("media_assets")
      .select("*").eq("id", assetId).maybeSingle();
    if (assetError || !asset) return json({ ok: false, message: assetError ? safeError(assetError) : "Media record not found." });
    if (asset.delete_pending) return json({ ok: false, message: "This media item is pending deletion and cannot be moved." });
    const sourceBucket = asset.storage_bucket || PUBLIC_BUCKET;
    const targetBucket = body.is_published ? PUBLIC_BUCKET : PRIVATE_BUCKET;
    if (sourceBucket === targetBucket) return json({ ok: true, moved: false, message: "Visibility is unchanged." });

    if (await contentIsReferenced(admin, sourceBucket, asset.storage_path, asset.public_url)) {
      return json({ ok: false, message: "This media file is referenced by a post or public setting. Update those references before changing visibility." });
    }
    const { data: blob, error: downloadError } = await admin.storage.from(sourceBucket).download(asset.storage_path);
    if (downloadError || !blob) return json({ ok: false, message: "Could not read the source Storage object: " + safeError(downloadError) });
    const { error: uploadError } = await admin.storage.from(targetBucket).upload(asset.storage_path, blob, {
      contentType: asset.mime_type, cacheControl: "31536000", upsert: false,
    });
    if (uploadError) return json({ ok: false, message: "Could not copy the Storage object: " + safeError(uploadError) });

    const targetUrl = targetBucket === PUBLIC_BUCKET
      ? admin.storage.from(PUBLIC_BUCKET).getPublicUrl(asset.storage_path).data.publicUrl
      : null;
    const { data: cleanupJobId, error: switchError } = await admin.rpc("set_media_asset_visibility", {
      p_asset_id: assetId,
      p_target_bucket: targetBucket,
      p_target_path: asset.storage_path,
      p_target_public_url: targetUrl,
    });
    if (switchError) {
      // Keep the destination copy for inspection; do not risk deleting a pre-existing object.
      return json({ ok: false, message: "The database was not updated; the original remains intact. A destination copy may need orphan review: " + safeError(switchError) });
    }
    const cleanup = cleanupJobId ? await processJob(admin, cleanupJobId) : null;
    return json({
      ok: !cleanup || cleanup.status === "completed",
      moved: true,
      message: cleanup && cleanup.status !== "completed"
        ? "Visibility changed, but old-object cleanup is pending and can be retried."
        : "Visibility updated.",
      cleanup,
    });
  }

  return json({ ok: false, message: "Unsupported media action." }, 400);
});
