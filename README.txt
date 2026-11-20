HopeAlive Foundation website v3 (static, GitHub Pages ready, with admin)

1. Upload ALL files and the data folder to the ROOT of your GitHub repo (index.html at the root). Delete the old posts.js if it is still there.
2. Repo > Settings > Pages > Deploy from a branch > main / (root) > Save.
3. ADMIN: open yoursite/admin.html. Sign in with your repo name (owner/name) and a GitHub fine-grained token:
   GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token >
   Only select repositories (your site) > Permissions > Contents: Read and write. Keep the token private.
4. In admin you can write, edit, draft and delete blog posts, upload photos, and manage hero photo, impact numbers,
   gallery, trustees, contact details, social links, bank details, donation link, contact form and comments.
   Changes go live about a minute after saving. Content lives in data/posts.json and data/settings.json.
5. Media setup: in Supabase SQL Editor, run `supabase/migrations/002_media_library.sql` after the initial CMS migration. It creates the public media bucket and admin-only upload/edit/delete policies. Images and videos up to 50 MB per file are accepted.
5. Comments (optional): enable Discussions on your repo, get the Giscus values at giscus.app and paste them in admin > Settings.
