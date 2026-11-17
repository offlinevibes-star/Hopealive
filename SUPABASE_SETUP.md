# HopeAlive Supabase CMS setup

This repository is a static GitHub Pages site. Supabase will provide authentication and the private database; the browser will use only the Supabase project URL and publishable/anon key. **Never put the service_role key in website files.**

## 1. Create the Supabase project
1. Create a project at https://supabase.com/dashboard.
2. Choose a strong database password and keep it somewhere private.
3. In Project Settings → API, copy the Project URL and publishable key (or legacy anon key). These are intended for browser use when Row Level Security is enabled.
4. In SQL Editor, run the complete script in `supabase/migrations/001_hopealive_cms.sql`.

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

## Important production notes
- The public contact insert policy validates lengths but is not a full anti-spam/rate-limit system. Before launch, add CAPTCHA/Turnstile and a server-side rate-limited Edge Function.
- Restrict Auth redirect URLs to the HopeAlive GitHub Pages origin and disable public sign-ups after inviting the administrator.
- The database backup is separate from GitHub repository backups. Keep periodic Supabase database backups.
- The initial migration creates the secure backend schema; it does not by itself switch the live website. The site migration follows once the project URL and publishable key are available.
