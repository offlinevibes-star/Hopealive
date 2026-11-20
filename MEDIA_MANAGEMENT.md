# Media management

## Editing media names and descriptions

In **Admin → Media library**, each image and video exposes:
- **Display name**: editable, required, max 180 characters; shown as the human-readable title in the media library and public Gallery.
- **Original filename**: the upload filename, retained as immutable source metadata.
- **Alt text**: editable, max 500 characters; used as the public image's alternative text.
- **Caption**: editable, max 1,000 characters.
- **Storage path**: the immutable object path used by existing URLs and playback.
- Category, MIME type, byte size, upload date and public/private status.

A display-name edit does not rename the physical Storage object. This is deliberate: a Storage move and database update are not one atomic transaction, and physical renaming could break links held in posts, settings or external pages. Changing a display name therefore preserves image URLs, video playback, references and file extensions.

## Large-library browsing

The media library requests 24 metadata records per page, with server-side search by display name, image/video filters, public/private visibility filters and sorting by upload date or name. Private-media signed preview URLs are generated only for private files on the current page, not for the entire library. Image previews are lazy-loaded and video previews do not preload their media data.

The query uses the media_assets metadata table. Missing private objects, inaccessible signed URLs or missing public URLs show a non-destructive unavailable-preview state; they do not hide the metadata record.

## Publication and private media

- Published Gallery assets live in the public hopealive-media bucket.
- Unpublished assets live in the private hopealive-private-media bucket and are previewed with short-lived signed URLs.
- Visibility moves are handled by the authenticated admin-media Edge Function. The target object is copied first; only then is the metadata switched. The old object is recorded in the cleanup queue and removed after the metadata update.
- Visibility changes are blocked when a post (published or draft) or public site setting refers to the asset path/URL. Update those content references first.
- The metadata switch and cleanup queue insertion are committed together in Postgres. Storage object copying/deletion remains a separate Storage API operation; the cleanup queue makes incomplete steps observable and retryable.

## Safe deletion

The **Delete** action requires confirmation and calls the authenticated admin-media Edge Function. The server checks references across published and unpublished posts and public site settings before enqueuing deletion. The media row is marked pending, the Storage object is removed idempotently, and then the metadata row is deleted. If either operation fails, the cleanup job records its status, attempt count and error for retry.

Deletion is blocked while the asset is referenced. An administrator should remove or update the content reference first; never work around this guard by deleting the Storage object directly.

## Integrity report and orphan cleanup

Use **Scan integrity** to identify:
- Unregistered Storage objects with no matching media row and no detected post/settings reference (potential orphan candidates).
- Unregistered Storage objects still referenced by posts/settings (shown separately and not eligible for automatic cleanup).
- Media database rows whose Storage object is missing (broken records), with records still referenced by content explicitly marked as blocked from removal.

The scan is report-only. It does not delete or repair files. A separate confirmation is required to queue an orphan deletion or remove an unreferenced broken record; the server repeats its authorization, registration and reference checks immediately before cleanup. Failed, pending and stale-running cleanup jobs can be retried with **Retry cleanup**.

The reference scan searches the full serialized post rows (including the JSON attachment list and featured image fields) and public website settings. Treat this as a safety guard, not a substitute for human review: custom HTML or external systems may contain references that are not represented in those database fields.

## Operational requirements

1. Apply migrations 001–005 in order in a reviewed maintenance window.
2. Deploy admin-media with JWT verification enabled (the function independently checks the signed-in user's identity and admin allow-list membership before using the service role).
3. Confirm the function's Supabase environment has its standard URL, anon key and service-role key configured. Never expose the service-role key in browser code.
4. Exercise upload, metadata edits, visibility moves, delete-in-use rejection, transient Storage failure and cleanup retry in an isolated Supabase project before production rollout.
5. Keep separate database and Storage backups. A database backup does not include the bytes stored in the two buckets.

## Known limitations

- The original upload filename and actual Storage object name/path are not editable; only the display name, alt text, caption and category are editable.
- The integrity scan can only detect references represented in HopeAlive's posts and public site settings. Review external pages or systems before destructive cleanup.
- Storage and Postgres cannot participate in one transaction. The durable cleanup queue handles the asynchronous tail, but operational monitoring and periodic retry remain necessary.
- No production cleanup, media movement, browser E2E run or disaster-recovery restoration was performed while preparing this branch.
