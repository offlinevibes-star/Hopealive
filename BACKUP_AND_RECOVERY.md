# Backup and recovery

This document is a runbook, not evidence that backups are enabled or that a restore has been tested.

## Database

1. In Supabase Dashboard, review the project's backup/PITR options and enable the strongest retention tier available for the plan.
2. For an additional export, use the Supabase CLI/database connection from a trusted workstation and store the dump in encrypted, access-restricted storage.
3. Keep migration files in Git and record the migration version alongside each backup.
4. To restore, create or select an isolated recovery project, restore the database backup using the supported Supabase restore procedure, then apply only migrations that are newer than the backup.
5. Verify Auth users, administrator allow-list membership, RLS policies, posts, settings, media metadata and donation/message records.

## Storage media

Database backups do not by themselves prove that Storage objects are backed up. Export both buckets separately:
- `hopealive-media` (public, approved assets)
- `hopealive-private-media` (private, unpublished assets)

Use the Supabase CLI or an authenticated Storage API client to download objects while preserving bucket and object paths. Encrypt the archive and restrict access, particularly for private media involving children or vulnerable people. Keep a manifest of bucket, object path, size and checksum.

## Recovery verification

1. Restore database and Storage archives into an isolated project.
2. Compare every `media_assets.storage_bucket` and `storage_path` against the restored object manifest.
3. Confirm public URLs work only for public assets.
4. Generate fresh signed URLs for private objects and confirm anonymous access is denied.
5. Open representative posts and Gallery entries and verify image/video playback.
6. Document discrepancies before switching production traffic.

## Retention and deletion

Set retention according to legal/consent obligations and organizational policy. Encrypt backups at rest and in transit, limit access to named operators, audit access, and securely expire old copies. If a person withdraws consent, remove the live asset and assess whether backup copies must be retained or purged under the applicable policy.

## Status

No backup configuration, media export, database restore, or recovery drill was executed as part of this code change. Schedule and document a restore exercise before relying on this runbook.
