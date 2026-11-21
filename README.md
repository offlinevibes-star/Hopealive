# HopeAlive Foundation website

HopeAlive is a static HTML/CSS/JavaScript website hosted on GitHub Pages, with Supabase providing authentication, CMS data, media storage and the contact submission backend.

## Deploy

1. Keep the website files and the data/ folder at the repository root.
2. In GitHub, open **Settings → Pages** and select **Deploy from a branch → main → /(root)**.
3. Apply the reviewed Supabase migrations in order as documented in [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
4. Deploy the contact-submit and admin-media Edge Functions after the migrations and configure production Turnstile secrets before publishing the updated frontend.

## Admin dashboard

Open /admin.html and sign in using an invited Supabase Auth user whose UUID is in public.admin_users.

- Posts: create, edit, publish and draft content.
- Media library: upload images/videos, edit display names, alt text, captions and categories, and control Gallery publication.
- Media browsing is paginated (24 records per page) with server-side display-name search, image/video and public/private filters, plus date/name sorting.
- Media integrity scan reports unregistered objects, referenced-but-unregistered objects and broken media metadata. Deletion is confirmed, reference-checked and queued for retry on partial failure.
- Settings: use a visual, no-code editor to change public contact/social details, donation information, homepage images, impact figures, gallery items, trustees/team profiles and editable page headings/intros across the main website. Repeatable content sections have Add/Remove controls, URL checks and previews; save to update the public site. The previous raw JSON editor is removed.
- Messages and donations: manage the relevant records.
- Activity log: review administrator activity records.

The display name is separate from the original uploaded filename and Storage object path. Physical Storage renaming is intentionally disabled to preserve URLs and attachment references. See [MEDIA_MANAGEMENT.md](MEDIA_MANAGEMENT.md).

## Security and operations

- Never put a Supabase service-role key, database password or Turnstile secret in frontend files.
- Public bucket objects are public by URL; only publish media approved for public access.
- Obtain and retain appropriate consent before publishing identifiable people, especially children.
- Configure production Turnstile; the contact Edge Function fails closed if the secret is missing.
- Configure IP rate limiting only after validating that the deployed ingress overwrites forged client IP headers.
- Schedule rate-limit cleanup and test database and Storage backups/restores.

## Project documentation

- [Supabase setup](SUPABASE_SETUP.md)
- [Security model](SECURITY.md)
- [Media management](MEDIA_MANAGEMENT.md)
- [Testing](TESTING.md)
- [Backup and recovery](BACKUP_AND_RECOVERY.md)
