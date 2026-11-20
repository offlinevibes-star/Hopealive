# Backup and recovery

This is an operational runbook, not evidence that automated backups are enabled or that a restoration has been tested. The repository review did not execute a backup, export Storage files, or restore a project.

## Backup scope

A complete HopeAlive backup has two independent parts:

1. **Postgres database**: schema, migration history, administrator allow-list, posts, media metadata, cleanup jobs, site settings, contact records and donations.
2. **Storage object bytes**: both hopealive-media (public) and hopealive-private-media (private), preserving bucket and object paths.

Database backups do not contain Storage object bytes. Back up both buckets separately and protect the private bucket archive as sensitive data.

## Database backup

1. In Supabase Dashboard, review the project's backup/PITR options and enable the strongest retention tier available for the plan.
2. From a trusted workstation, create an encrypted database export using the supported Supabase CLI/database connection procedure.
3. Store the export in access-restricted, encrypted storage separate from the production project.
4. Record the export timestamp, project ref, database version, migration versions and checksum.
5. Retain more than one recovery point and document retention/deletion policy.

## Storage backup

1. Use the Supabase CLI or an authenticated Storage API client from a trusted workstation.
2. Export both buckets, preserving exact object paths and visibility metadata.
3. Build a manifest with bucket, object path, byte size, MIME type and SHA-256 checksum.
4. Encrypt the archive; strictly restrict access to private media, especially images/videos of children or vulnerable people.
5. Verify archive checksums before considering the backup complete.

## Restore procedure

1. Create or select an isolated recovery project; do not experiment on the live project.
2. Restore the database backup using the current Supabase-supported restore procedure.
3. Verify restored migration history before applying any later migrations. Do not re-run migrations already represented in the restored schema.
4. Restore both Storage buckets and their object paths. Reapply bucket privacy and Storage policies from the reviewed migrations.
5. Compare each media_assets.storage_bucket + storage_path value and each post JSON media attachment against the restored Storage object manifest.
6. Review media_cleanup_jobs: do not blindly replay old destructive jobs after a restore. Reconcile their state with actual restored object bytes first.
7. Check Auth users, admin allow-list membership, RLS, posts, public site settings, contact messages, donations and activity logs.
8. Generate new short-lived signed URLs for private objects and verify anonymous users cannot read them.
9. Open representative published and draft posts; verify images and video playback.
10. Run the static, isolated Supabase integration and browser acceptance suites. Record all discrepancies.
11. Switch traffic only after the recovery owner signs off.

## Recover deleted media

- Restore the affected object from the Storage archive using the exact bucket and path.
- Confirm the corresponding media_assets row exists and points to the restored object.
- If the row was deleted, restore the database record from backup or recreate the metadata after validating filename, display name, alt text, caption, category, MIME type and publication state.
- Check all post/settings references and verify public/private visibility.
- Do not restore a private object into the public bucket unless publication and consent are explicitly approved.

## Recover database records and migrations

- For accidental record edits/deletions, use point-in-time recovery or a database export in an isolated project. Compare the target rows and their dependencies before applying a controlled repair to production.
- For a failed migration, inspect the migration history and actual schema first. Restore into a test project, correct the migration or add a forward-fix migration, then verify it before production.
- Do not rewrite a migration already applied to a live environment; add a new migration for schema corrections.
- Ensure Edge Functions are deployed in a version compatible with the restored schema.

## Recovery verification log

Record:
- Backup/restore date and operator
- Project ref and database version
- Migration versions restored
- Number of database media rows
- Number of Storage objects restored in each bucket
- Missing/broken/orphan media reconciliation results
- Public/private access tests
- Posts and Gallery playback tests
- Test suite and browser run results
- Approval to resume traffic

## Status

No backup configuration, encrypted database export, Storage archive, restore, checksum verification, or recovery drill was performed during this code change. Run a full isolated restore exercise before treating this runbook as tested.
