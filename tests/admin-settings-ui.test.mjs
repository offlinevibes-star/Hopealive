import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
const settingsStart = adminHtml.indexOf("async function loadSettings(){");
const settingsEnd = adminHtml.indexOf("\nasync function loadDonations()", settingsStart);
assert.ok(settingsStart >= 0 && settingsEnd > settingsStart, "settings editor function must exist");
const settingsSource = adminHtml.slice(settingsStart, settingsEnd);
const siteJs = await readFile(new URL("../site.js", import.meta.url), "utf8");
const publicPages = await Promise.all(["index.html", "about.html", "programmes.html", "team.html", "gallery.html", "contact.html", "get-involved.html"].map((name) => readFile(new URL("../" + name, import.meta.url), "utf8")));
const inlineScripts = [...adminHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim());

test("admin inline JavaScript parses", () => {
  for (const source of inlineScripts) new vm.Script(source);
});

test("settings editor uses friendly visual fields instead of JSON editing", () => {
  assert.match(settingsSource, /Website settings/);
  assert.match(settingsSource, /Make updates using simple forms/);
  assert.match(settingsSource, /sf-layout/);
  assert.match(settingsSource, /data-setting-path/);
  assert.doesNotMatch(settingsSource, /id=["']sj["']/);
  assert.doesNotMatch(settingsSource, /Settings JSON<textarea/);
});

test("site content arrays can be added and removed without losing the draft", () => {
  assert.match(settingsSource, /data-add-array/);
  assert.match(settingsSource, /data-remove-array/);
  assert.match(settingsSource, /const bindArrayControls/);
  assert.match(settingsSource, /const refreshArray/);
  assert.doesNotMatch(settingsSource, /loadSettingsDraft/);
  assert.match(settingsSource, /model\[key\]\.push/);
  assert.match(settingsSource, /model\[key\]\.splice/);
});

test("settings save is validated and persists through the existing protected table", () => {
  assert.match(settingsSource, /const allowed=\['email','phone','whatsapp','social','bank','donateLink','formspree','hero','giscus','stats','gallery','team','turnstileSiteKey','content'\]/);
  assert.match(settingsSource, /new URL\(value,location\.origin\)/);
  assert.match(settingsSource, /db\.from\('site_settings'\)\.upsert/);
  assert.match(settingsSource, /Save changes/);
});

test("settings editor includes editable homepage, gallery, team and contact fields", () => {
  for (const label of ["Public contact email", "Homepage image URL", "Gallery items", "Trustees &amp; team", "Donation details", "Social profiles"]) {
    assert.ok(settingsSource.includes(label), "missing settings section: " + label);
  }
  assert.match(settingsSource, /@media\(max-width:850px\)/);
  assert.match(settingsSource, /@media\(max-width:560px\)/);
});

test("main site headings and page copy are editable from settings", () => {
  assert.match(settingsSource, /Main website text/);
  assert.match(settingsSource, /homeHeroTitle/);
  assert.match(settingsSource, /field\(label,'content\.'\+key/);
  assert.match(settingsSource, /contactIntro/);
  assert.match(settingsSource, /volunteerText/);
  assert.match(siteJs, /const applySiteContent/);
  assert.match(siteJs, /node\.textContent=value/);
  for (const page of publicPages) assert.match(page, /data-site-content=/);
});
