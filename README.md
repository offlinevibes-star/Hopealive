# HopeAlive Foundation website

HopeAlive is a static HTML/CSS/JavaScript website hosted on GitHub Pages, with Supabase providing authentication, CMS data, media storage and the contact submission backend.

## Deploy

1. Keep the website files and the `data/` folder at the repository root.
2. In GitHub, open **Settings → Pages** and select **Deploy from a branch → main → /(root)**.
3. Apply Supabase migrations in order as documented in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
4. Deploy the `contact-submit` Edge Function and configure production Turnstile secrets before enabling the updated contact form.

## Admin dashboard

Open `/admin.html` and sign in using an invited Supabase Auth user whose UUID is in `public.admin_users`.

- Posts: create, edit, publish and draft content.
- Media library: upload images/videos, edit display names, alt text, captions and categories, and control Gallery publication.
- Settings: edit public website settings.
- Messages and donations: manage the relevant records.
- Activity log: review the latest administrator record changes.

The display name is separate from the original uploaded filename and Storage object path. The current browser-only workflow intentionally does not rename Storage objects; see [MEDIA_MANAGEMENT.md](MEDIA_MANAGEMENT.md).

## Security and operations

- Never put a Supabase service-role key, database password or Turnstile secret in frontend files.
- Public bucket objects are public by URL; only publish media approved for public access.
- Obtain and retain appropriate consent before publishing identifiable people, especially children.
- Configure production Turnstile; the contact Edge Function fails closed if the secret is missing.
- Schedule rate-limit cleanup and test backups/restores.

## Project documentation

- [Supabase setup](SUPABASE_SETUP.md)
- [Security model](SECURITY.md)
- [Media management](MEDIA_MANAGEMENT.md)
- [Testing](TESTING.md)
- [Backup and recovery](BACKUP_AND_RECOVERY.md)
