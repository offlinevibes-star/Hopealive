/* HopeAlive admin media library: paginated, searchable and persistence-verified */
const hopeMediaState = {
  page: 0,
  pageSize: 24,
  query: "",
  type: "all",
  visibility: "all",
  sort: "newest",
  count: 0,
  rows: [],
  report: null,
  requestId: 0,
};

function hopeMediaEscapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}
function hopeMediaValidateText(value, max, field, required) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(field + " cannot be empty.");
  if (text.length > max) throw new Error(field + " must be " + max + " characters or fewer.");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) {
    throw new Error(field + " contains invalid control characters.");
  }
  return text;
}
async function hopeMediaAction(payload) {
  const { data, error } = await db.functions.invoke("admin-media", { body: payload });
  if (error) throw error;
  if (!data) throw new Error("Media operation returned an empty response.");
  if (data.ok !== true) {
    const failure = new Error(data.message || "Media operation did not complete.");
    failure.data = data;
    throw failure;
  }
  return data;
}
async function hopeCleanupDetachedObject(bucket, path) {
  return hopeMediaAction({ action: "queue_orphan_delete", bucket, path });
}
function hopeMediaEscapeHtml(value) {
  return esc(value == null ? "" : String(value));
}
function hopeMediaCard(asset) {
  const id = hopeMediaEscapeHtml(asset.id);
  const previewUrl = asset.display_url ? hopeMediaEscapeHtml(asset.display_url) : "";
  const preview = previewUrl
    ? (asset.media_type === "video"
      ? '<video data-hm-preview controls preload="none" playsinline src="' + previewUrl + '"></video>'
      : '<img data-hm-preview loading="lazy" decoding="async" src="' + previewUrl + '" alt="' + hopeMediaEscapeHtml(asset.alt_text || asset.display_name || asset.filename) + '">')
    : '<div class="hm-placeholder"><span>▧</span>Preview unavailable</div>';
  const isVideo = asset.media_type === "video";
  const pending = asset.delete_pending === true;
  return '<article class="hm-card" data-hm-card="' + id + '">' +
    '<div class="hm-preview">' + preview + '<span class="hm-type-tag">' + (isVideo ? "VIDEO" : "IMAGE") + '</span></div>' +
    '<div class="hm-card-content">' +
      '<div class="hm-card-head"><h4>' + hopeMediaEscapeHtml(asset.display_name || asset.filename) + '</h4>' +
        '<span class="hm-visibility ' + (asset.is_published ? "" : "private") + '">' + (asset.is_published ? "PUBLIC" : "PRIVATE") + '</span></div>' +
      '<div class="hm-file-meta"><span>Original: ' + hopeMediaEscapeHtml(asset.filename) + '</span>' +
        '<span>' + Number(asset.size_bytes || 0).toLocaleString() + ' bytes · ' + new Date(asset.created_at).toLocaleDateString() + '</span></div>' +
      '<label class="hm-form-field">Display name<input data-mdname="' + id + '" maxlength="180" required value="' + hopeMediaEscapeHtml(asset.display_name || asset.filename) + '" autocomplete="off"></label>' +
      '<details class="hm-details"><summary>More details and visibility</summary><div class="hm-edit-fields">' +
        '<label class="hm-form-field">Alt text<textarea data-malt="' + id + '" maxlength="500" rows="2">' + hopeMediaEscapeHtml(asset.alt_text || "") + '</textarea></label>' +
        '<label class="hm-form-field">Caption<textarea data-mcaption="' + id + '" maxlength="1000" rows="2">' + hopeMediaEscapeHtml(asset.caption || "") + '</textarea></label>' +
        '<label class="hm-form-field">Category<select data-mcat="' + id + '">' + categoryOptions(asset.category, false) + '</select></label>' +
        '<label class="hm-form-field">Gallery visibility<select data-mpublished="' + id + '">' +
          '<option value="true" ' + (asset.is_published ? "selected" : "") + '>Public Gallery</option>' +
          '<option value="false" ' + (!asset.is_published ? "selected" : "") + '>Private / unpublished</option>' +
        '</select></label>' +
        '<div class="hm-file-meta"><span>Storage: ' + hopeMediaEscapeHtml(asset.storage_bucket || MEDIA_BUCKET) + '</span><span>Path: ' + hopeMediaEscapeHtml(asset.storage_path) + '</span></div>' +
      '</div></details>' +
      (pending ? '<p class="hm-pending" role="status">Deletion is pending. Use Retry cleanup.</p>' : '') +
      '<div class="hm-card-actions"><button type="button" class="hm-btn hm-btn-primary" data-hm-save="' + id + '"' + (pending ? " disabled" : "") + '>Save changes</button>' +
      '<button type="button" class="hm-btn hm-btn-danger" data-hm-delete="' + id + '"' + (pending ? " disabled" : "") + '>Delete</button></div>' +
    '</div></article>';
}
function hopeMediaPages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let page = start; page <= end; page++) pages.push(page);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}
function hopeMediaPagination() {
  const totalPages = Math.max(1, Math.ceil(hopeMediaState.count / hopeMediaState.pageSize));
  const first = hopeMediaState.count ? hopeMediaState.page * hopeMediaState.pageSize + 1 : 0;
  const last = Math.min(hopeMediaState.count, (hopeMediaState.page + 1) * hopeMediaState.pageSize);
  const pages = hopeMediaPages(hopeMediaState.page + 1, totalPages);
  const buttons = pages.map((page) => page === "…"
    ? '<span class="hm-page-ellipsis">…</span>'
    : '<button type="button" class="hm-page-button" data-hm-page="' + page + '" ' +
      (page === hopeMediaState.page + 1 ? 'aria-current="page"' : "") + '>' + page + '</button>').join("");
  const target = $("#media-pagination");
  if (!target) return;
  target.innerHTML =
    '<span class="hm-page-info">Showing ' + first + '–' + last + ' of ' + hopeMediaState.count + ' files · Page ' +
      (hopeMediaState.page + 1) + ' of ' + totalPages + '</span>' +
    '<div class="hm-page-buttons">' +
      '<button type="button" class="hm-page-button" data-hm-prev ' + (hopeMediaState.page === 0 ? "disabled" : "") + '>Previous</button>' +
      buttons +
      '<button type="button" class="hm-page-button" data-hm-next ' + (hopeMediaState.page + 1 >= totalPages ? "disabled" : "") + '>Next</button>' +
    '</div>';
  target.querySelectorAll("[data-hm-page]").forEach((button) => {
    button.onclick = () => { hopeMediaState.page = Number(button.dataset.hmPage) - 1; hopeLoadMediaPage(); };
  });
  const previous = target.querySelector("[data-hm-prev]");
  const next = target.querySelector("[data-hm-next]");
  if (previous) previous.onclick = () => { if (hopeMediaState.page > 0) { hopeMediaState.page--; hopeLoadMediaPage(); } };
  if (next) next.onclick = () => { if ((hopeMediaState.page + 1) * hopeMediaState.pageSize < hopeMediaState.count) { hopeMediaState.page++; hopeLoadMediaPage(); } };
}
function hopeMediaRenderReport() {
  const target = $("#media-integrity-report");
  const report = hopeMediaState.report;
  if (!target || !report) { if (target) target.innerHTML = ""; return; }
  const orphans = Array.isArray(report.orphaned_objects) ? report.orphaned_objects : [];
  const referenced = Array.isArray(report.referenced_unregistered_objects) ? report.referenced_unregistered_objects : [];
  const broken = Array.isArray(report.broken_records) ? report.broken_records : [];
  let html = '<div class="hm-report"><h4>Storage health check</h4><p>Checked ' +
    hopeMediaEscapeHtml(new Date(report.checked_at).toLocaleString()) + ' · ' + orphans.length +
    ' unregistered objects · ' + referenced.length + ' referenced objects · ' + broken.length +
    ' missing-file records. This scan does not delete anything.</p>';
  if (orphans.length) {
    html += '<h5 class="hm-report-subhead">Unregistered objects safe to review</h5><div class="hm-report-list">' +
      orphans.map((item, index) => '<div class="hm-report-item"><span>' +
        hopeMediaEscapeHtml(item.bucket + " / " + item.path) +
        '</span><button type="button" class="hm-btn hm-btn-danger" data-hm-orphan="' + index + '">Queue delete</button></div>').join("") +
      '</div>';
  }
  if (referenced.length) {
    html += '<h5 class="hm-report-subhead">Unregistered but referenced</h5><div class="hm-report-list">' +
      referenced.map((item) => '<div class="hm-report-item"><span>' +
        hopeMediaEscapeHtml(item.bucket + " / " + item.path) +
        '</span><span>In use — blocked</span></div>').join("") + '</div>';
  }
  if (broken.length) {
    html += '<h5 class="hm-report-subhead">Media records with missing files</h5><div class="hm-report-list">' +
      broken.map((item, index) => '<div class="hm-report-item"><span>' +
        hopeMediaEscapeHtml(item.display_name || item.path) + ' · ' + hopeMediaEscapeHtml(item.bucket + " / " + item.path) +
        '</span>' + (item.is_referenced
          ? '<span>In use — blocked</span>'
          : '<button type="button" class="hm-btn hm-btn-danger" data-hm-broken="' + index + '">Remove record</button>') +
        '</div>').join("") + '</div>';
  }
  if (!orphans.length && !referenced.length && !broken.length) {
    html += '<p>No missing or unregistered media was found.</p>';
  }
  target.innerHTML = html + '</div>';
  target.querySelectorAll("[data-hm-orphan]").forEach((button) => {
    button.onclick = async () => {
      const item = orphans[Number(button.dataset.hmOrphan)];
      if (!item || !confirm("Queue permanent deletion of " + item.bucket + " / " + item.path + "?")) return;
      button.disabled = true;
      try {
        const result = await hopeMediaAction({ action: "queue_orphan_delete", bucket: item.bucket, path: item.path });
        say(result.message || "Orphan cleanup completed.");
        await hopeMediaRunScan();
      } catch (error) {
        say("The object was not deleted: " + (error.message || String(error)));
        button.disabled = false;
      }
    };
  });
  target.querySelectorAll("[data-hm-broken]").forEach((button) => {
    button.onclick = async () => {
      const item = broken[Number(button.dataset.hmBroken)];
      if (!item || !confirm("Remove this broken media record? The server will recheck content references.")) return;
      button.disabled = true;
      try {
        const result = await hopeMediaAction({ action: "delete_asset", asset_id: item.id });
        say(result.message || "Broken media record removed.");
        await hopeMediaRunScan();
        await hopeLoadMediaPage();
      } catch (error) {
        say("The record was not removed: " + (error.message || String(error)));
        button.disabled = false;
      }
    };
  });
}
async function hopeMediaRunScan() {
  const button = $("#media-scan");
  if (button) button.disabled = true;
  try {
    const result = await hopeMediaAction({ action: "scan" });
    hopeMediaState.report = result.report;
    hopeMediaRenderReport();
    say("Media health check completed. No files were removed by the scan.");
  } catch (error) {
    say("Health check failed: " + (error.message || String(error)));
  } finally { if (button) button.disabled = false; }
}
async function hopeMediaSave(button) {
  const id = button.dataset.hmSave;
  const asset = hopeMediaState.rows.find((row) => row.id === id);
  if (!asset) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const displayName = hopeMediaValidateText($("#media [data-mdname='" + id + "']").value, 180, "Display name", true);
    const altText = hopeMediaValidateText($("#media [data-malt='" + id + "']").value, 500, "Alt text", false);
    const caption = hopeMediaValidateText($("#media [data-mcaption='" + id + "']").value, 1000, "Caption", false);
    const category = $("#media [data-mcat='" + id + "']").value;
    if (!MEDIA_CATEGORIES.includes(category)) throw new Error("Choose a valid category.");
    const { data: saved, error } = await db.from("media_assets").update({
      display_name: displayName,
      alt_text: altText,
      caption,
      category,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select("id,display_name,alt_text,caption,category,updated_at").maybeSingle();
    if (error) {
      if (/display_name|alt_text|column/i.test(error.message || "")) {
        throw new Error("The media name fields are not installed in the database yet. Apply migration 004_media_metadata_audit.sql, then try again.");
      }
      throw error;
    }
    if (!saved || saved.id !== id) {
      throw new Error("No media row was updated. Your admin session or media update permission may have expired; sign in again or ask an administrator to check the media update policy.");
    }
    const desiredPublished = $("#media [data-mpublished='" + id + "']").value === "true";
    let visibilityWarning = "";
    if (desiredPublished !== asset.is_published) {
      try {
        const result = await hopeMediaAction({ action: "set_visibility", asset_id: id, is_published: desiredPublished });
        visibilityWarning = result.cleanup && result.cleanup.status !== "completed"
          ? " Details saved. Visibility changed; old-file cleanup is pending."
          : " Details and Gallery visibility saved.";
      } catch (visibilityError) {
        visibilityWarning = " Details saved, but Gallery visibility did not change: " + (visibilityError.message || String(visibilityError));
      }
    }
    say(visibilityWarning
      ? visibilityWarning.trim()
      : "Saved successfully. The original filename and file URL are unchanged.");
    await hopeLoadMediaPage();
  } catch (error) {
    say("Could not save media details: " + (error.message || String(error)));
    button.disabled = false;
    button.textContent = originalText;
  }
}
async function hopeMediaDelete(button) {
  const id = button.dataset.hmDelete;
  const asset = hopeMediaState.rows.find((row) => row.id === id);
  if (!asset || !confirm("Delete this media file permanently? Files used by posts or website settings are protected.")) return;
  button.disabled = true;
  button.textContent = "Deleting…";
  try {
    const result = await hopeMediaAction({ action: "delete_asset", asset_id: id });
    say(result.message || "Media deleted.");
    if ((hopeMediaState.page * hopeMediaState.pageSize) >= Math.max(0, hopeMediaState.count - 1) && hopeMediaState.page > 0) {
      hopeMediaState.page--;
    }
    await hopeLoadMediaPage();
  } catch (error) {
    say("Deletion was not completed: " + (error.message || String(error)));
    button.disabled = false;
    button.textContent = "Delete";
    await hopeLoadMediaPage();
  }
}
async function hopeLoadMediaPage() {
  const grid = $("#media-grid");
  if (!grid) return;
  const requestId = ++hopeMediaState.requestId;
  grid.innerHTML = '<div class="hm-skeleton"></div><div class="hm-skeleton"></div><div class="hm-skeleton"></div>';
  const first = hopeMediaState.page * hopeMediaState.pageSize;
  try {
    let query = db.from("media_assets").select(
      "id,filename,display_name,alt_text,storage_path,storage_bucket,public_url,caption,category,media_type,mime_type,size_bytes,is_published,delete_pending,created_at,updated_at",
      { count: "exact" },
    );
    if (hopeMediaState.query) {
      query = query.ilike("display_name", "%" + hopeMediaEscapeLike(hopeMediaState.query) + "%");
    }
    if (hopeMediaState.type !== "all") query = query.eq("media_type", hopeMediaState.type);
    if (hopeMediaState.visibility !== "all") {
      query = query.eq("is_published", hopeMediaState.visibility === "public");
    }
    if (hopeMediaState.sort === "name") {
      query = query.order("display_name", { ascending: true }).order("id", { ascending: true });
    } else {
      query = query.order("created_at", { ascending: hopeMediaState.sort === "oldest" }).order("id", { ascending: true });
    }
    const { data, error, count } = await query.range(first, first + hopeMediaState.pageSize - 1);
    if (error) {
      if (/display_name|alt_text|column/i.test(error.message || "")) {
        throw new Error("The media library needs database migration 004 for editable names and pagination. The live database is missing display_name/alt_text.");
      }
      throw error;
    }
    if (requestId !== hopeMediaState.requestId) return;
    hopeMediaState.rows = data || [];
    hopeMediaState.count = count || 0;
    const pages = Math.max(1, Math.ceil(hopeMediaState.count / hopeMediaState.pageSize));
    if (hopeMediaState.page >= pages) {
      hopeMediaState.page = pages - 1;
      return hopeLoadMediaPage();
    }
    const visible = await Promise.all(hopeMediaState.rows.map(async (asset) => {
      const bucket = asset.storage_bucket || MEDIA_BUCKET;
      let displayUrl = bucket === MEDIA_BUCKET ? asset.public_url : null;
      if (bucket === PRIVATE_MEDIA_BUCKET) {
        const { data: signed, error: signError } = await db.storage.from(bucket).createSignedUrl(asset.storage_path, 300);
        if (!signError) displayUrl = signed?.signedUrl || null;
      }
      return { ...asset, display_url: displayUrl };
    }));
    if (requestId !== hopeMediaState.requestId) return;
    grid.innerHTML = visible.length
      ? visible.map(hopeMediaCard).join("")
      : '<div class="hm-empty"><strong>No media found</strong><p>Try changing the search or filters, or upload your first image or video.</p></div>';
    $("#media-count").textContent = hopeMediaState.count.toLocaleString() + " files";
    $("#media-stat-total").textContent = hopeMediaState.count.toLocaleString();
    $("#media-stat-images").textContent = hopeMediaState.rows.filter((row) => row.media_type === "image").length.toLocaleString();
    $("#media-stat-videos").textContent = hopeMediaState.rows.filter((row) => row.media_type === "video").length.toLocaleString();
    grid.querySelectorAll("[data-hm-preview]").forEach((preview) => {
      preview.addEventListener("error", () => {
        const placeholder = document.createElement("div");
        placeholder.className = "hm-placeholder";
        placeholder.innerHTML = "<span>▧</span>Preview unavailable";
        preview.replaceWith(placeholder);
      }, { once: true });
    });
    hopeMediaPagination();
    grid.querySelectorAll("[data-hm-save]").forEach((button) => button.onclick = () => hopeMediaSave(button));
    grid.querySelectorAll("[data-hm-delete]").forEach((button) => button.onclick = () => hopeMediaDelete(button));
    hopeMediaRenderReport();
  } catch (error) {
    if (requestId !== hopeMediaState.requestId) return;
    grid.innerHTML = '<div class="hm-error"><strong>Media could not be loaded</strong><p>' +
      hopeMediaEscapeHtml(error.message || String(error)) +
      '</p><button type="button" class="hm-btn" id="hm-media-retry">Try again</button></div>';
    const retry = $("#hm-media-retry");
    if (retry) retry.onclick = hopeLoadMediaPage;
    $("#media-count").textContent = "Unavailable";
    $("#media-pagination").innerHTML = "";
    say("Media library: " + (error.message || String(error)));
  }
}
async function loadMedia() {
  const panel = $("#media");
  panel.classList.add("hm-panel");
  panel.innerHTML =
    '<div class="hm-wrap">' +
      '<header class="hm-hero"><div><p class="hm-eyebrow">Content management</p><h2>Media library</h2>' +
        '<p class="hm-intro">Organise images and videos, edit the names shown in the public Gallery, and control whether a file is public or private. Renaming a display name never changes its original file or web address.</p></div>' +
        '<div class="hm-hero-actions"><button type="button" class="hm-btn" id="media-scan">Check storage</button><button type="button" class="hm-btn" id="media-retry">Retry cleanup</button></div></header>' +
      '<div class="hm-stats"><div class="hm-stat"><span>Files in library</span><strong id="media-stat-total">—</strong></div>' +
        '<div class="hm-stat"><span>Images on this page</span><strong id="media-stat-images">—</strong></div>' +
        '<div class="hm-stat"><span>Videos on this page</span><strong id="media-stat-videos">—</strong></div></div>' +
      '<section class="hm-upload"><div class="hm-section-title"><div><h3>Add new media</h3><p>Upload photos or videos, individually or in a ZIP archive.</p></div></div>' +
        '<form id="mediaform"><div class="hm-upload-grid">' +
          '<label class="hm-dropzone" id="media-dropzone"><strong>Select or drop photos, videos or ZIP files</strong><small>JPEG, PNG, WebP, GIF, MP4, WebM and MOV · max 50 MB per file</small><input id="media-files" name="files" type="file" accept=".zip,application/zip,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple required hidden><span class="hm-file-name" id="media-selection">No files selected</span></label>' +
          '<label class="hm-form-field">Category<select name="category">' + categoryOptions("auto", true) + '</select></label>' +
          '<label class="hm-form-field">Gallery caption<input name="caption" maxlength="1000" placeholder="Optional description"></label>' +
        '</div><div class="hm-upload-footer"><label class="hm-check"><input type="checkbox" name="published" checked> Publish to public Gallery</label>' +
          '<button type="submit" class="hm-btn hm-btn-primary" id="media-upload-btn">Upload files</button></div>' +
          '<p class="hm-progress" id="media-progress" role="status" aria-live="polite"></p></form></section>' +
      '<section class="hm-library"><div class="hm-section-title"><div><h3>Uploaded media</h3><p>Search, filter and update the details shown to visitors.</p></div><span id="media-count" class="hm-page-info">Loading…</span></div>' +
        '<div class="hm-toolbar"><label class="hm-form-field hm-search"><span class="hidden">Search by display name</span><input id="media-search" type="search" placeholder="Search display names…" aria-label="Search media by display name"></label>' +
          '<label class="hm-form-field">Media type<select id="media-kind"><option value="all">All media</option><option value="image">Images</option><option value="video">Videos</option></select></label>' +
          '<label class="hm-form-field">Visibility<select id="media-visibility"><option value="all">Public and private</option><option value="public">Public only</option><option value="private">Private only</option></select></label>' +
          '<label class="hm-form-field">Sort by<select id="media-sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select></label></div>' +
        '<div id="media-integrity-report" style="margin-bottom:14px" aria-live="polite"></div>' +
        '<div class="hm-grid" id="media-grid" aria-live="polite"><div class="hm-skeleton"></div><div class="hm-skeleton"></div><div class="hm-skeleton"></div></div>' +
        '<div class="hm-pagination" id="media-pagination"></div></section></div>';

  const fileInput = $("#media-files");
  const dropzone = $("#media-dropzone");
  const selection = $("#media-selection");
  const showSelection = () => {
    const files = Array.from(fileInput.files || []);
    selection.textContent = files.length
      ? files.length + " file(s) · " + (files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1) + " MB"
      : "No files selected";
  };
  fileInput.onchange = showSelection;
  dropzone.onclick = (event) => { if (event.target !== fileInput) fileInput.click(); };
  dropzone.ondragover = (event) => { event.preventDefault(); dropzone.classList.add("dragging"); };
  dropzone.ondragleave = () => dropzone.classList.remove("dragging");
  dropzone.ondrop = (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
    const transfer = new DataTransfer();
    Array.from(event.dataTransfer.files || []).forEach((file) => transfer.items.add(file));
    fileInput.files = transfer.files;
    showSelection();
  };
  $("#mediaform").onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const selected = Array.from(fileInput.files || []);
    const category = form.get("category");
    const caption = String(form.get("caption") || "").trim();
    const published = form.has("published");
    const progress = $("#media-progress");
    const button = $("#media-upload-btn");
    if (!selected.length) { progress.textContent = "Choose at least one file."; return; }
    button.disabled = true;
    try {
      const files = await expandMediaSelection(selected);
      if (!files.length) throw new Error("No supported photos or videos were found.");
      let complete = 0;
      progress.textContent = "Uploading 0 of " + files.length + "…";
      for (const file of files) {
        let asset = null;
        try {
          const chosen = category === "auto" ? guessCategory(file.name) : category;
          asset = await uploadToStorage(file, chosen, published ? MEDIA_BUCKET : PRIVATE_MEDIA_BUCKET);
          const { error } = await db.from("media_assets").insert({
            filename: asset.filename, display_name: asset.filename, alt_text: "",
            storage_path: asset.path, storage_bucket: asset.bucket, public_url: asset.url,
            caption, category: chosen, media_type: asset.type, mime_type: asset.mime_type,
            size_bytes: asset.size_bytes, is_published: published,
          });
          if (error) throw error;
          complete++;
          progress.textContent = "Uploaded " + complete + " of " + files.length + " · " + file.name;
        } catch (error) {
          if (asset) {
            try { await hopeCleanupDetachedObject(asset.bucket, asset.path); }
            catch (cleanupError) { progress.textContent += " Cleanup is pending: " + cleanupError.message; }
          }
          throw error;
        }
      }
      say("Uploaded " + complete + " file(s).");
      fileInput.value = "";
      showSelection();
      progress.textContent = "Upload complete.";
      await hopeLoadMediaPage();
    } catch (error) {
      progress.textContent = "Upload stopped: " + (error.message || String(error));
      say("Upload error: " + (error.message || String(error)));
    } finally { button.disabled = false; }
  };

  let searchTimer = null;
  $("#media-search").oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      hopeMediaState.query = $("#media-search").value.trim();
      hopeMediaState.page = 0;
      hopeLoadMediaPage();
    }, 260);
  };
  $("#media-search").onkeydown = (event) => {
    if (event.key === "Enter") {
      clearTimeout(searchTimer);
      hopeMediaState.query = event.target.value.trim();
      hopeMediaState.page = 0;
      hopeLoadMediaPage();
    }
  };
  $("#media-kind").onchange = () => { hopeMediaState.type = $("#media-kind").value; hopeMediaState.page = 0; hopeLoadMediaPage(); };
  $("#media-visibility").onchange = () => { hopeMediaState.visibility = $("#media-visibility").value; hopeMediaState.page = 0; hopeLoadMediaPage(); };
  $("#media-sort").onchange = () => { hopeMediaState.sort = $("#media-sort").value; hopeMediaState.page = 0; hopeLoadMediaPage(); };
  $("#media-scan").onclick = hopeMediaRunScan;
  $("#media-retry").onclick = async () => {
    const button = $("#media-retry");
    button.disabled = true;
    try {
      const { data, error } = await db.functions.invoke("admin-media", { body: { action: "retry_cleanup" } });
      if (error) throw error;
      if (!data || data.ok !== true) throw new Error(data?.message || "Cleanup retry failed.");
      say("Cleanup checked " + data.attempted + " job(s); " + data.completed + " completed.");
      await hopeLoadMediaPage();
    } catch (error) {
      say("Cleanup retry failed: " + (error.message || String(error)));
    } finally { button.disabled = false; }
  };
  await hopeLoadMediaPage();
}
