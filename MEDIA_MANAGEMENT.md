# Media management

## Editing names and descriptions

In **Admin → Media library**, each item exposes:
- **Display name**: the human-readable title shown in the public Gallery;
- **Alt text**: descriptive text used by the public image's `alt` attribute;
- **Caption**: supplementary visible description;
- **Original filename**: retained metadata from the upload;
- **Storage path**: the existing object path, shown only to signed-in administrators;
- category, MIME type, byte size and public/private publication status.

Save details to update the metadata record. The public Gallery reads the display name, caption and alt text from `media_assets`.

## Storage filename changes

Storage-object rename is intentionally disabled. Supabase Storage object movement and Postgres metadata updates are separate operations and cannot be committed as one transaction. A browser-only copy/update/delete sequence cannot guarantee atomic rollback or preserve every reference. Display-name edits do not touch the object path, URLs, thumbnails or video references.

## Visibility and consent

- Published assets live in the public `hopealive-media` bucket.
- Unpublished assets live in the private `hopealive-private-media` bucket and are previewed through short-lived signed URLs.
- Publishing/unpublishing currently copies the object and updates the media row; inspect both sides if an operation fails.
- Do not publish identifiable photographs or videos of children or vulnerable people without documented, appropriate consent.
- Deletion is permanent at the object level. Check post attachments and other references before deleting.

## Current limitations

The current manager still loads the media metadata collection in one request. Search and type filters run client-side; server pagination, automated orphan reconciliation, reference-aware delete protection and a transactional media-operation service remain future work.
