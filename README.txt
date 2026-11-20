HopeAlive Foundation website

## Deploy the website
1. Keep the website files and the `data` folder in the root of the GitHub Pages repository.
2. In GitHub, open Settings > Pages and select Deploy from a branch > main > /(root).

## Configure Supabase
1. Create/open the HopeAlive Supabase project.
2. Run `supabase/migrations/001_hopealive_cms.sql` in the Supabase SQL Editor.
3. Run `supabase/migrations/002_media_library.sql` in the same SQL Editor. This creates the public `hopealive-media` bucket, the media library and post attachment column, and administrator-only file-management policies.
4. Invite the administrator in Supabase Authentication > Users and add that user's UUID to `public.admin_users` as described in `SUPABASE_SETUP.md`.

## Use the admin dashboard
Open `yoursite/admin.html` and sign in with the invited, allow-listed Supabase administrator email and password.

- **Posts:** create, edit, publish or draft posts. Add photos and MP4, WebM or MOV video attachments directly to a post.
- **Media library:** upload multiple images/videos or a ZIP archive, automatically extract ZIP contents in the browser, use filename-based category suggestions or choose a category, add captions, publish items to the public Gallery, and update or delete media.
- **Settings:** manage the hero image, trustees, contact details, social links, donation details and other site settings.
- **Messages and Donations:** manage website enquiries and donation records.

The browser uploader accepts images and videos up to 50 MB per file. Public visitors can view published media; only allow-listed administrators can upload, list, edit or delete files. The bucket is public by URL: hiding an item from the Gallery does not make its direct URL private. Obtain appropriate consent before publishing identifiable people, especially children. Keep the Supabase service-role key and database password private. Never put either in website code.

## Optional comments
Enable GitHub Discussions, obtain the Giscus configuration at giscus.app, and enter the values in Admin > Settings.
