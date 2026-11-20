import test from "node:test";
import assert from "node:assert/strict";

const env = process.env;
const url = env.HOPEALIVE_TEST_URL || "";
const anonKey = env.HOPEALIVE_TEST_ANON_KEY || "";
const adminEmail = env.HOPEALIVE_TEST_ADMIN_EMAIL || "";
const adminPassword = env.HOPEALIVE_TEST_ADMIN_PASSWORD || "";
const userEmail = env.HOPEALIVE_TEST_NONADMIN_EMAIL || "";
const userPassword = env.HOPEALIVE_TEST_NONADMIN_PASSWORD || "";
const confirmed = env.HOPEALIVE_TEST_CONFIRM_ISOLATED === "I_CONFIRM_THIS_IS_NOT_PRODUCTION";
const configured = Boolean(url && anonKey && adminEmail && adminPassword && userEmail && userPassword && confirmed);
const productionRef = "thnrxtxhkmfqnoooqcwc";

let createClient;
try {
  ({ createClient } = await import("@supabase/supabase-js"));
} catch {
  // This optional suite runs after @supabase/supabase-js is installed in the test workspace.
}

test("HopeAlive RLS and Storage integration checks", { skip: !configured || !createClient }, async (t) => {
  assert.ok(!url.includes(productionRef), "Refusing to run integration tests against the production HopeAlive project.");
  const makeClient = () => createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const anon = makeClient();
  const admin = makeClient();
  const nonAdmin = makeClient();

  const adminLogin = await admin.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  assert.ifError(adminLogin.error);
  const userLogin = await nonAdmin.auth.signInWithPassword({ email: userEmail, password: userPassword });
  assert.ifError(userLogin.error);
  assert.ok(adminLogin.data.user?.id);
  assert.ok(userLogin.data.user?.id);
  assert.notEqual(adminLogin.data.user.id, userLogin.data.user.id);

  const adminRole = await admin.rpc("is_hopealive_admin");
  assert.ifError(adminRole.error);
  assert.equal(adminRole.data, true);
  const nonAdminRole = await nonAdmin.rpc("is_hopealive_admin");
  assert.ifError(nonAdminRole.error);
  assert.equal(nonAdminRole.data, false);

  await t.test("anonymous reads are limited to published content", async () => {
    const posts = await anon.from("posts").select("id,is_draft");
    assert.ifError(posts.error);
    assert.ok((posts.data || []).every((post) => post.is_draft === false));

    const privateMedia = await anon.from("media_assets").select("id").eq("is_published", false);
    assert.ifError(privateMedia.error);
    assert.equal(privateMedia.data?.length || 0, 0);

    const privateObjects = await anon.storage.from("hopealive-private-media").list("", { limit: 5 });
    assert.ok(privateObjects.error || (privateObjects.data || []).length === 0);
  });

  await t.test("anonymous and non-admin users cannot read administrator records", async () => {
    for (const client of [anon, nonAdmin]) {
      const messages = await client.from("contact_messages").select("id").limit(1);
      assert.ok(messages.error || (messages.data || []).length === 0);
      const activity = await client.from("admin_activity_logs").select("id").limit(1);
      assert.ok(activity.error || (activity.data || []).length === 0);
      const drafts = await client.from("posts").select("id").eq("is_draft", true);
      assert.ifError(drafts.error);
      assert.equal(drafts.data?.length || 0, 0);
    }
  });

  await t.test("non-admin inserts cannot create posts or media records", async () => {
    const suffix = crypto.randomUUID();
    const post = await nonAdmin.from("posts").insert({
      slug: "rls-probe-" + suffix,
      title: "RLS probe",
      excerpt: "",
      body_html: "",
      is_draft: true,
    }).select("id").maybeSingle();

    if (!post.error && post.data?.id) {
      await admin.from("posts").delete().eq("id", post.data.id);
    }
    assert.ok(post.error, "A signed-in non-admin unexpectedly inserted a post.");

    const media = await nonAdmin.from("media_assets").insert({
      filename: "rls-probe.png",
      display_name: "RLS probe",
      storage_path: "rls-probe/" + suffix + ".png",
      public_url: null,
      storage_bucket: "hopealive-private-media",
      media_type: "image",
      mime_type: "image/png",
      size_bytes: 1,
      is_published: false,
    }).select("id").maybeSingle();

    if (!media.error && media.data?.id) {
      await admin.from("media_assets").delete().eq("id", media.data.id);
    }
    assert.ok(media.error, "A signed-in non-admin unexpectedly inserted a media record.");
  });

  await t.test("non-admin cannot upload to a protected Storage bucket", async () => {
    const path = "rls-probe/" + crypto.randomUUID() + ".png";
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const upload = await nonAdmin.storage.from("hopealive-private-media").upload(path, new Blob([png], { type: "image/png" }), {
      contentType: "image/png",
      upsert: false,
    });
    if (!upload.error) await admin.storage.from("hopealive-private-media").remove([path]);
    assert.ok(upload.error, "A signed-in non-admin unexpectedly uploaded to private media Storage.");
  });

  await t.test("allow-listed administrators can read protected admin data", async () => {
    const messages = await admin.from("contact_messages").select("id").limit(1);
    assert.ifError(messages.error);
    const activity = await admin.from("admin_activity_logs").select("id").limit(1);
    assert.ifError(activity.error);
    const media = await admin.from("media_assets").select("id").limit(1);
    assert.ifError(media.error);
  });

  await Promise.all([admin.auth.signOut(), nonAdmin.auth.signOut()]);
});
