# HopeAlive Supabase CMS setup

This repository is a static GitHub Pages site. Supabase will provide authentication and the private database; the browser will use only the Supabase project URL and publishable/anon key. **Never put the service_role key in website files.**

## 1. Create the Supabase project
1. Create a project at https://supabase.com/dashboard.
2. Choose a strong database password and keep it somewhere private.
3. In Project Settings → API, copy the Project URL and publishable key (or legacy anon key). These are intended for browser use when Row Level Security is enabled.
4. In SQL Editor, run `supabase/migrations/001_hopealive_cms.sql`, then run `supabase/migrations/002_media_library.sql`. The second migration creates the public `hopealive-media` bucket (50 MB per file), the media library metadata table, post attachments, and policies that restrict upload/update/delete to approved administrators.

## 2. Create the first administrator
1. In Authentication → Users, invite the administrator's email address.
2. Confirm the user has signed in/accepted the invitation.
3. Copy that user's UUID from Authentication → Users.
4. In SQL Editor run this statement, replacing the placeholder with that exact UUID:

```sql
insert into public.admin_users (user_id)
values ('PASTE-ADMIN-USER-UUID-HERE');
```

Only UUIDs explicitly added to `admin_users` can administer content or read private messages. Do not create a public sign-up flow for administrators.

## 3. Send the connection details
Send the Project URL and publishable/anon key in this chat when ready. These are public client configuration values, not passwords. **Do not send the database password or service_role/secret key.**

I can then wire the existing HopeAlive pages to Supabase, migrate the current posts/settings, replace the GitHub-token login with Supabase Auth, and add the private inbox.

## Tables and access
- `posts`: public visitors can read published posts; administrators manage all posts.
- `site_settings`: public site settings are readable; only administrators can change them.
- `donations`: administrator-only.
- `contact_messages`: visitors can submit; only allow-listed administrators can read/update/delete.
- `admin_users`: protected allow-list used by the database authorization function.
- `media_assets`: public visitors can read published media metadata; only allow-listed administrators can manage it. File objects are served from the public `hopealive-media` bucket, while RLS restricts uploads and mutations.

## Important production notes
- The public contact insert policy validates lengths but is not a full anti-spam/rate-limit system. Before launch, add CAPTCHA/Turnstile and a server-side rate-limited Edge Function.
- Restrict Auth redirect URLs to the HopeAlive GitHub Pages origin and disable public sign-ups after inviting the administrator.
- The database backup is separate from GitHub repository backups. Keep periodic Supabase database backups.
- The initial migration creates the secure CMS backend. The second migration enables media uploads. The website code is configured to display published gallery media and post attachments after both migrations have been run.

## Media uploads

Open `admin.html` and sign in as an allow-listed administrator. Use **Media library** to upload multiple images or short videos, choose a category (or use filename-based suggestions), add captions, and publish them in the public Gallery. When creating or editing a post, use **Photos and videos in this post** to attach media directly to that post. The browser uploader accepts images and MP4, WebM, or MOV videos up to 50 MB each. Storage files are publicly viewable by URL; only allow-listed administrators can upload, edit, list, or delete files. Hiding an item from the Gallery only removes its listing; it does not make its URL private. Obtain appropriate consent before publishing identifiable people, especially children.
