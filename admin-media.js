/* Admin media library enhancements: paginated queries and server-side destructive operations. */
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
};

function hopeMediaEscapeLike(value) {
  return String(value || "").replace(/[\\%_]/g, "\\$&");
}
function hopeMediaValidateText(value, max, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + " cannot be empty.");
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
function hopeMediaCard(m) {
  const preview = m.display_url
    ? (m.media_type === "video"
      ? '<video class="media-preview" data-media-preview="true" controls preload="none" src="' + esc(m.display_url) + '"></video>'
      : '<img class="media-preview" data-media-preview="true" loading="lazy" src="' + esc(m.display_url) + '" alt="' + esc(m.alt_text || m.display_name || m.filename) + '">')
    : '<div class="media-preview" role="img" aria-label="Preview unavailable" style="display:grid;place-items:center">Preview unavailable</div>';
  const pending = m.delete_pending === true;
  return '<article class="media-card" data-media-card="' + esc(m.id) + '">' +
    '<div>' + preview + '</div>' +
    '<p><b>' + esc(m.display_name || m.filename) + '</b></p>' +
    '<p class="muted">Original filename: ' + esc(m.filename) +
    '<br>' + esc(m.mime_type) + ' · ' + Number(m.size_bytes || 0).toLocaleString() +
    ' bytes · Uploaded ' + esc(new Date(m.created_at).toLocaleString()) +
    ' · ' + (m.is_published ? "Public" : "Private") +
    '<br>Storage path: ' + esc(m.storage_path) + '</p>' +
    '<label>Display name<input data-mdname="' + esc(m.id) + '" maxlength="180" required value="' + esc(m.display_name || m.filename) + '"></label>' +
    '<label>Alt text<input data-malt="' + esc(m.id) + '" maxlength="500" value="' + esc(m.alt_text || '') + '"></label>' +
    '<label>Category<select data-mcat="' + esc(m.id) + '">' + categoryOptions(m.category, false) + '</select></label>' +
    '<label>Caption<input data-mcaption="' + esc(m.id) + '" maxlength="1000" value="' + esc(m.caption || '') + '"></label>' +
    '<label>Gallery visibility<select data-mpublished="' + esc(m.id) + '">' +
      '<option value="true" ' + (m.is_published ? 'selected' : '') + '>Public gallery</option>' +
      '<option value="false" ' + (!m.is_published ? 'selected' : '') + '>Private / unpublished</option>' +
    '</select></label>' +
    (pending ? '<p class="muted" role="status">Deletion is pending cleanup. Use Retry cleanup above.</p>' : '') +
    '<button type="button" class="b" data-savemedia="' + esc(m.id) + '">Save details</button> ' +
    '<button type="button" class="b danger" data-delmedia="' + esc(m.id) + '" ' + (pending ? 'disabled' : '') + '>Delete</button>' +
    '</article>';
}

async function loadMedia() {
  const panel = $("#media");
  panel.innerHTML =
    '<div class="bar"><h2>Media library</h2><span id="media-count" class="muted">Loading…</span></div>' +
    '<p class="muted">Upload images and videos, edit display names, alt text and captions, and choose whether an item appears in the public Gallery. The original uploaded filename and Storage path are preserved; display-name edits never change media URLs or video playback. Storage visibility moves and deletion run through the authenticated server-side media service. Deletion is blocked while posts or public settings reference the file. Private previews are signed only for the current page.</p>' +
    '<form id="mediaform"><div class="grid">' +
      '<label class="upload-dropzone" id="media-dropzone">Select photos/videos or ZIP<input id="media-files" name="files" type="file" accept=".zip,application/zip,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" multiple required>' +
      '<small>Select multiple files or drag them here. Each extracted file is limited to 50 MB.</small></label>' +
      '<label>Category<select name="category">' + categoryOptions('auto', true) + '</select></label>' +
      '<label>Caption (optional)<input name="caption" maxlength="1000" placeholder="A short description for these files"></label>' +
    '</div><p id="media-selection" class="muted" role="status">No files selected yet.</p>' +
    '<label><span><input type="checkbox" name="published" style="width:auto" checked> List these files in the public Gallery</span></label>' +
    '<button class="b primary" id="media-upload-btn">Upload selected files</button>' +
    '<p id="media-progress" class="muted" role="status" aria-live="polite"></p></form>' +
    '<section aria-labelledby="media-list-heading">' +
      '<div class="bar" style="margin-top:24px"><h3 id="media-list-heading">Uploaded media</h3>' +
        '<div class="actions">' +
          '<input id="media-search" type="search" placeholder="Search display name" aria-label="Search media by name" style="max-width:220px">' +
          '<select id="media-kind" aria-label="Filter media type"><option value="all">All media</option><option value="image">Images</option><option value="video">Videos</option></select>' +
          '<select id="media-visibility" aria-label="Filter media visibility"><option value="all">Public and private</option><option value="public">Public only</option><option value="private">Private only</option></select>' +
          '<select id="media-sort" aria-label="Sort media"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option></select>' +
          '<button type="button" class="b" id="media-scan">Scan integrity</button>' +
          '<button type="button" class="b" id="media-retry">Retry cleanup</button>' +
        '</div>' +
      '</div>' +
      '<div id="media-integrity-report" class="item" aria-live="polite"></div>' +
      '<div class="media-grid" id="media-grid" aria-live="polite"><p class="muted">Loading media…</p></div>' +
      '<div class="bar" style="margin-top:18px"><span id="media-page-label" class="muted"></span>' +
        '<div class="actions"><button type="button" class="b" id="media-prev" disabled>Previous</button><button type="button" class="b" id="media-next" disabled>Next</button></div>' +
      '</div>' +
    '</section>';

  const fileInput = $("#media-files");
  const dropzone = $("#media-dropzone");
  const selection = $("#media-selection");
  const showSelection = () => {
    const files = Array.from(fileInput.files || []);
    const size = files.reduce((sum, file) => sum + file.size, 0);
    selection.textContent = files.length
      ? files.length + " file(s) selected · " + (size / 1024 / 1024).toFixed(2) + " MB total"
      : "No files selected yet.";
  };
  fileInput.onchange = showSelection;
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
    const uploadButton = $("#media-upload-btn");
    if (!selected.length) { progress.textContent = "Select at least one file or ZIP archive."; return; }
    uploadButton.disabled = true;
    try {
      const files = await expandMediaSelection(selected);
      if (!files.length) throw new Error("No supported images or videos were found in that ZIP.");
      let complete = 0;
      progress.textContent = "Uploading 0 of " + files.length + "…";
      for (const file of files) {
        let asset = null;
        try {
          const chosen = category === "auto" ? guessCategory(file.name) : category;
          const bucket = published ? MEDIA_BUCKET : PRIVATE_MEDIA_BUCKET;
          asset = await uploadToStorage(file, chosen, bucket);
          const { error } = await db.from("media_assets").insert({
            filename: asset.filename,
            display_name: asset.filename,
            alt_text: "",
            storage_path: asset.path,
            storage_bucket: asset.bucket,
            public_url: asset.url,
            caption,
            category: chosen,
            media_type: asset.type,
            mime_type: asset.mime_type,
            size_bytes: asset.size_bytes,
            is_published: published,
          });
          if (error) throw error;
          complete++;
          progress.textContent = "Uploaded " + complete + " of " + files.length + ": " + file.name;
        } catch (error) {
          if (asset) {
            try {
              await hopeCleanupDetachedObject(asset.bucket, asset.path);
            } catch (cleanupError) {
              progress.textContent = "Upload failed and cleanup is pending. Run an integrity scan or retry cleanup. " +
                (cleanupError?.message || String(cleanupError));
            }
          }
          throw error;
        }
      }
      say("Uploaded " + complete + " file(s).");
      await loadMedia();
    } catch (error) {
      progress.textContent = "Upload stopped: " + (error?.message || String(error));
      say("Upload error: " + (error?.message || String(error)));
      uploadButton.disabled = false;
    }
  };

  const refresh = async () => {
    await hopeLoadMediaPage();
  };
  $("#media-search").oninput = () => {
    hopeMediaState.query = $("#media-search").value.trim();
    hopeMediaState.page = 0;
    refresh();
  };
  $("#media-kind").onchange = () => { hopeMediaState.type = $("#media-kind").value; hopeMediaState.page = 0; refresh(); };
  $("#media-visibility").onchange = () => { hopeMediaState.visibility = $("#media-visibility").value; hopeMediaState.page = 0; refresh(); };
  $("#media-sort").onchange = () => { hopeMediaState.sort = $("#media-sort").value; hopeMediaState.page = 0; refresh(); };
  $("#media-prev").onclick = () => { if (hopeMediaState.page > 0) { hopeMediaState.page--; refresh(); } };
  $("#media-next").onclick = () => {
    if ((hopeMediaState.page + 1) * hopeMediaState.pageSize < hopeMediaState.count) {
      hopeMediaState.page++;
      refresh();
    }
  };
  $("#media-scan").onclick = async () => {
    const button = $("#media-scan");
    button.disabled = true;
    try {
      const result = await hopeMediaAction({ action: "scan" });
      hopeMediaState.report = result.report;
      hopeRenderMediaReport();
      say("Media integrity scan completed. No files were deleted.");
    } catch (error) {
      say("Integrity scan failed: " + (error?.message || String(error)));
    } finally { button.disabled = false; }
  };
  $("#media-retry").onclick = async () => {
    const button = $("#media-retry");
    button.disabled = true;
    try {
      const result = await hopeMediaAction({ action: "retry_cleanup" });
      say("Cleanup retry finished: " + result.completed + " of " + result.attempted + " job(s) completed.");
      await loadMedia();
    } catch (error) {
      say("Cleanup retry failed: " + (error?.message || String(error)));
    } finally { button.disabled = false; }
  };

  await hopeLoadMediaPage();
}

async function hopeLoadMediaPage() {
  const grid = $("#media-grid");
  if (!grid) return;
  grid.innerHTML = '<p class="muted">Loading media…</p>';
  const first = hopeMediaState.page * hopeMediaState.pageSize;
  let query = db.from("media_assets").select("*", { count: "exact" });
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
  if (error) throw error;
  hopeMediaState.rows = data || [];
  hopeMediaState.count = count || 0;

  const visible = await Promise.all(hopeMediaState.rows.map(async (asset) => {
    const bucket = asset.storage_bucket || MEDIA_BUCKET;
    let displayUrl = bucket === MEDIA_BUCKET ? asset.public_url : null;
    let previewError = false;
    if (bucket === PRIVATE_MEDIA_BUCKET) {
      const { data: signed, error: signError } = await db.storage.from(bucket).createSignedUrl(asset.storage_path, 300);
      if (signError) previewError = true;
      else displayUrl = signed?.signedUrl || null;
    }
    return { ...asset, display_url: displayUrl, preview_error: previewError };
  }));

  $("#media-count").textContent = hopeMediaState.count + " file(s)";
  grid.innerHTML = visible.length
    ? visible.map(hopeMediaCard).join("")
    : '<p class="muted">No media matches these filters.</p>';
  grid.querySelectorAll("[data-media-preview]").forEach((preview) => {
    preview.addEventListener("error", () => {
      const fallback = document.createElement("div");
      fallback.className = "media-preview";
      fallback.setAttribute("role", "img");
      fallback.textContent = "Preview unavailable";
      preview.replaceWith(fallback);
    }, { once: true });
  });
  const pageCount = Math.max(1, Math.ceil(hopeMediaState.count / hopeMediaState.pageSize));
  $("#media-page-label").textContent = "Page " + (hopeMediaState.page + 1) + " of " + pageCount;
  $("#media-prev").disabled = hopeMediaState.page === 0;
  $("#media-next").disabled = (hopeMediaState.page + 1) * hopeMediaState.pageSize >= hopeMediaState.count;
  $("#media-grid").querySelectorAll("[data-savemedia]").forEach((button) => {
    button.onclick = async () => {
      const id = button.dataset.savemedia;
      const asset = hopeMediaState.rows.find((row) => row.id === id);
      if (!asset) return;
      button.disabled = true;
      try {
        const displayName = hopeMediaValidateText($("#media [data-mdname='" + id + "']").value, 180, "Display name");
        const altText = String($("#media [data-malt='" + id + "']").value || "").trim();
        const caption = String($("#media [data-mcaption='" + id + "']").value || "").trim();
        if (altText.length > 500 || caption.length > 1000) throw new Error("Alt text or caption is too long.");
        const category = $("#media [data-mcat='" + id + "']").value;
        if (!MEDIA_CATEGORIES.includes(category)) throw new Error("Choose a valid category.");
        const { error } = await db.from("media_assets").update({
          display_name: displayName,
          alt_text: altText,
          caption,
          category,
          updated_at: new Date().toISOString(),
        }).eq("id", id);
        if (error) throw error;

        const desiredPublished = $("#media [data-mpublished='" + id + "']").value === "true";
        if (desiredPublished !== asset.is_published) {
          const result = await hopeMediaAction({ action: "set_visibility", asset_id: id, is_published: desiredPublished });
          say(result.message || "Media details saved.");
        } else {
          say("Media details saved. The original filename and Storage object path were preserved.");
        }
        await hopeLoadMediaPage();
      } catch (error) {
        if (error?.data?.moved) {
          say(error.data.message + " Media details and visibility were saved; retry cleanup to remove the old object.");
          await hopeLoadMediaPage();
        } else {
          say("Media metadata was saved, but Gallery visibility was not changed: " + (error?.message || String(error)));
          button.disabled = false;
        }
      }
    };
  });
  $("#media-grid").querySelectorAll("[data-delmedia]").forEach((button) => {
    button.onclick = async () => {
      const id = button.dataset.delmedia;
      if (!confirm("Delete this media asset and its Storage object permanently? The server will first check every post, including drafts, and public settings.")) return;
      button.disabled = true;
      try {
        const result = await hopeMediaAction({ action: "delete_asset", asset_id: id });
        say(result.message || "Media deleted.");
        await hopeLoadMediaPage();
      } catch (error) {
        say("Deletion did not fully complete or was blocked. Check the cleanup queue and retry after resolving any references: " + (error?.message || String(error)));
        button.disabled = false;
        await hopeLoadMediaPage();
      }
    };
  });
  if (hopeMediaState.report) hopeRenderMediaReport();
}

function hopeRenderMediaReport() {
  const target = $("#media-integrity-report");
  const report = hopeMediaState.report;
  if (!target || !report) return;
  const orphans = Array.isArray(report.orphaned_objects) ? report.orphaned_objects : [];
  const referenced = Array.isArray(report.referenced_unregistered_objects) ? report.referenced_unregistered_objects : [];
  const broken = Array.isArray(report.broken_records) ? report.broken_records : [];
  target.innerHTML =
    '<h4>Storage integrity report</h4><p class="muted">Checked ' + esc(new Date(report.checked_at).toLocaleString()) +
    ' · ' + orphans.length + ' unreferenced/unregistered object(s) · ' + referenced.length + ' referenced/unregistered object(s) · ' + broken.length + ' broken media record(s). This scan does not delete anything.</p>' +
    (orphans.length
      ? '<h5>Unregistered Storage objects</h5>' + orphans.map((item, index) =>
        '<div class="item"><span>' + esc(item.bucket) + ' / ' + esc(item.path) + '</span> ' +
        '<button type="button" class="b danger" data-queue-orphan="' + index + '">Queue deletion</button></div>'
      ).join("")
      : '<p class="muted">No unreferenced orphaned Storage objects detected.</p>') +
    (referenced.length
      ? '<h5>Unregistered but referenced Storage objects</h5><p class="muted">These objects may still be used by posts or public settings. They are excluded from cleanup until the references are reviewed.</p>' +
        referenced.map((item) => '<div class="item">' + esc(item.bucket) + ' / ' + esc(item.path) + '</div>').join("")
      : '<p class="muted">No referenced, unregistered Storage objects detected.</p>') +
    (broken.length
      ? '<h5>Media records with missing Storage objects</h5>' + broken.map((item, index) =>
        '<div class="item"><span>' + esc(item.display_name || item.path) + ' · ' + esc(item.bucket) + ' / ' + esc(item.path) + '</span> ' +
        (item.is_referenced
          ? '<span class="muted">Referenced by content — not eligible for removal</span>'
          : '<button type="button" class="b danger" data-remove-broken="' + index + '">Remove broken record</button>') + '</div>'
      ).join("")
      : '<p class="muted">No broken media records detected.</p>');

  target.querySelectorAll("[data-queue-orphan]").forEach((button) => {
    button.onclick = async () => {
      const item = orphans[Number(button.dataset.queueOrphan)];
      if (!item || !confirm("Queue permanent deletion of " + item.bucket + " / " + item.path + "? A second server-side reference check runs before deletion.")) return;
      button.disabled = true;
      try {
        const result = await hopeMediaAction({ action: "queue_orphan_delete", bucket: item.bucket, path: item.path });
        say(result.message || "Orphan cleanup completed.");
        const scan = await hopeMediaAction({ action: "scan" });
        hopeMediaState.report = scan.report;
        hopeRenderMediaReport();
        await hopeLoadMediaPage();
      } catch (error) {
        say("Orphan was not deleted: " + (error?.message || String(error)));
        button.disabled = false;
      }
    };
  });
  target.querySelectorAll("[data-remove-broken]").forEach((button) => {
    button.onclick = async () => {
      const item = broken[Number(button.dataset.removeBroken)];
      if (!item || !confirm("Remove the broken database record? The server will block this if a post or public setting still refers to it.")) return;
      button.disabled = true;
      try {
        const result = await hopeMediaAction({ action: "delete_asset", asset_id: item.id });
        say(result.message || "Broken media record removed.");
        const scan = await hopeMediaAction({ action: "scan" });
        hopeMediaState.report = scan.report;
        hopeRenderMediaReport();
        await hopeLoadMediaPage();
      } catch (error) {
        say("Broken record was not removed: " + (error?.message || String(error)));
        button.disabled = false;
      }
    };
  });
}
