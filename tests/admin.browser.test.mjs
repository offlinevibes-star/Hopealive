import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const env = process.env;
const baseUrl = env.HOPEALIVE_E2E_BASE_URL || "";
const supabaseUrl = env.HOPEALIVE_E2E_SUPABASE_URL || "";
const anonKey = env.HOPEALIVE_E2E_ANON_KEY || "";
const email = env.HOPEALIVE_E2E_ADMIN_EMAIL || "";
const password = env.HOPEALIVE_E2E_ADMIN_PASSWORD || "";
const confirmed = env.HOPEALIVE_E2E_CONFIRM_ISOLATED === "I_CONFIRM_THIS_IS_NOT_PRODUCTION";
const productionRef = "thnrxtxhkmfqnoooqcwc";
let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  // This optional suite is enabled only in a workspace with Playwright installed.
}

test("HopeAlive admin browser smoke: login, paginated media view and audit-independent logout", {
  skip: !(baseUrl && supabaseUrl && anonKey && email && password && confirmed && chromium),
}, async () => {
  assert.ok(!supabaseUrl.includes(productionRef), "Refusing to run browser tests against the production HopeAlive project.");

  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const target = resolve(root, relative);
      if (target !== root && !target.startsWith(root + sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(target);
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
      };
      response.writeHead(200, { "content-type": types[extname(target)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise((resolveStart) => server.listen(0, "127.0.0.1", resolveStart));
  const address = server.address();
  const localOrigin = "http://127.0.0.1:" + address.port;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    await context.route("https://thnrxtxhkmfqnoooqcwc.supabase.co/**", async (route) => {
      const target = new URL(route.request().url());
      const replacement = new URL(supabaseUrl);
      target.hostname = replacement.hostname;
      target.protocol = replacement.protocol;
      target.port = replacement.port;
      const headers = { ...route.request().headers(), apikey: anonKey };
      await route.continue({ url: target.toString(), headers });
    });
    await context.route("**/rest/v1/rpc/record_admin_auth_event", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "simulated audit outage" }) })
    );

    const page = await context.newPage();
    await page.goto(new URL("/admin.html", localOrigin).toString());
    await page.locator('#loginform [name="email"]').fill(email);
    await page.locator('#loginform [name="password"]').fill(password);
    await page.locator('#loginform button[type="submit"], #loginform button').first().click();
    await page.locator("#workspace:not(.hidden)").waitFor({ state: "visible", timeout: 20000 });

    await page.locator('[data-tab="media"]').click();
    await page.locator("#media-grid").waitFor({ state: "visible", timeout: 20000 });
    assert.equal(await page.locator("#media-search").count(), 1);
    assert.equal(await page.locator("#media-visibility").count(), 1);
    assert.equal(await page.locator("#media-pagination").count(), 1);
    assert.ok(await page.locator("#media-pagination .hm-page-button").count() >= 2);
    assert.equal(await page.locator("#media-sort").count(), 1);
    assert.equal(await page.locator("#media-kind").count(), 1);

    await page.locator("#logout").click();
    await page.locator("#login:not(.hidden)").waitFor({ state: "visible", timeout: 10000 });
    assert.equal(await page.locator("#workspace:not(.hidden)").count(), 0);
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolveStop, rejectStop) => server.close((error) => error ? rejectStop(error) : resolveStop()));
  }
});
