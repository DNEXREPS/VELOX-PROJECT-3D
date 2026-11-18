/**
 * Security & reliability end-to-end checks (Milestone 1) against a running production
 * build + a LOCAL Supabase stack. Never point this at a hosted project: it creates users,
 * uploads objects with the service role and reads the cleanup queue directly.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
 *   CRON_SECRET=… DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *   [SERVER_LOG=/path/to/next-start.log] node tests/e2e/security.e2e.mjs [baseUrl]
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const root = execSync("npm root -g").toString().trim();
    return createRequire(`${root}/`)("playwright");
  }
}
const { chromium } = await loadPlaywright();

const BASE = process.argv[2] ?? "http://localhost:3000";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON = process.env.CRON_SECRET;
const DB = process.env.DATABASE_URL;
const LOG = process.env.SERVER_LOG;
for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: SB, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, CRON_SECRET: CRON, DATABASE_URL: DB })) {
  if (!v) throw new Error(`${k} is required`);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(SB)) throw new Error("Refusing to run against a non-local Supabase project");

const db = new pg.Pool({ connectionString: DB, max: 2 });
const q = async (sql, params) => (await db.query(sql, params)).rows;

// 1×1 PNG (valid IHDR → passes the dimension check)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const stamp = Date.now().toString(36);
const user = { email: `sec_${stamp}@example.test`, username: `sec_${stamp}`, password: "velox-sec-2026" };
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
    console.log("PASS", name);
  } catch (e) {
    results.push(["FAIL", name]);
    console.log("FAIL", name, "-", String(e.message).split("\n")[0]);
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const waitFor = async (fn, ms = 30000, every = 500) => {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await new Promise((r) => setTimeout(r, every));
  }
};

const storage = (key = SERVICE) => ({
  async upload(bucket, path, body = PNG) {
    const r = await fetch(`${SB}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "image/png", "x-upsert": "true" }, body });
    if (!r.ok) throw new Error(`upload ${path}: ${r.status} ${await r.text()}`);
  },
  async list(bucket, prefix, limit = 1000, offset = 0) {
    const r = await fetch(`${SB}/storage/v1/object/list/${bucket}`, { method: "POST", headers: { authorization: `Bearer ${key}`, apikey: key === SERVICE ? SERVICE : ANON, "content-type": "application/json" }, body: JSON.stringify({ prefix, limit, offset }) });
    if (!r.ok) throw new Error(`list ${prefix}: ${r.status}`);
    return r.json();
  },
});
const admin = storage(SERVICE);
/** Count objects under a folder, recursively. */
async function countObjects(bucket, folder) {
  let n = 0;
  for (let offset = 0; ; offset += 1000) {
    const page = await admin.list(bucket, folder, 1000, offset);
    for (const e of page) n += e.id === null ? await countObjects(bucket, `${folder}/${e.name}`) : 1;
    if (page.length < 1000) return n;
  }
}

const browser = await chromium.launch();

// ---------------------------------------------------------------------------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
});
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept());
let uid = "";
let bikeId = "";

await step("CSP header with a per-request nonce on every page; all framework scripts carry it", async () => {
  const a = await fetch(`${BASE}/`);
  const b = await fetch(`${BASE}/`);
  const csp = a.headers.get("content-security-policy") ?? "";
  assert(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/.test(csp), "script-src nonce missing");
  assert(!/script-src[^;]*unsafe-(inline|eval)/.test(csp), "unsafe script source");
  assert(csp !== b.headers.get("content-security-policy"), "nonce is reused across requests");
  const nonce = /nonce-([^']+)/.exec(csp)[1];
  const html = await a.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  assert(scripts.length > 0 && scripts.every((s) => s.includes(`nonce="${nonce}"`)), "a script tag lacks the nonce");
  for (const h of ["x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "strict-transport-security", "cross-origin-opener-policy"]) {
    assert(a.headers.get(h), `missing ${h}`);
  }
  const redirect = await fetch(`${BASE}/dashboard`, { redirect: "manual" });
  assert(redirect.status === 307 && redirect.headers.get("content-security-policy"), "redirects must carry the CSP too");
});

await step("register (account for the remaining checks)", async () => {
  await page.goto(`${BASE}/register`);
  await page.fill("#email", user.email);
  await page.fill("#username", user.username);
  await page.fill("#password", user.password);
  await page.fill("#confirmPassword", user.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  uid = (await q("select id from profiles where username = $1", [user.username]))[0].id;
});

await step("no CSP violations on public and private pages, including the 3D studio", async () => {
  await page.goto(`${BASE}/garage/new`);
  await page.fill("#name", "Sec Bike");
  await page.selectOption("#category", "road");
  await page.selectOption("#visibility", "public");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/garage\/[0-9a-f-]{36}$/, { timeout: 20000 });
  bikeId = page.url().split("/").pop();
  const violations = [];
  for (const path of ["/", "/explore", "/components", "/community", `/garage/${bikeId}`, `/garage/${bikeId}/studio`, `/bike/${user.username}/sec-bike`]) {
    await page.goto(`${BASE}${path}`);
    if (path === "/" || path.endsWith("/studio")) {
      await page.locator("canvas").first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(1500);
      assert((await page.locator("[data-testid=bike-viewer] canvas").count()) > 0, `3D canvas missing on ${path}`);
    } else {
      await page.waitForLoadState("networkidle");
    }
    violations.push(...(await page.evaluate(() => window.__csp)).map((v) => `${path}: ${v}`));
  }
  assert(violations.length === 0, `violations: ${violations.join(" | ")}`);
});

await step("CSP blocks script and event-handler markup injected into server HTML (stored-XSS simulation)", async () => {
  // Rewrite a real server response, keeping its real CSP header, as if user content had
  // smuggled markup into the HTML. Parser-inserted scripts without the nonce must not run.
  await page.route(`${BASE}/community`, async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(
      "<body",
      '<body data-x="1"><script>window.__injected = true</script><img src="data:," onerror="window.__handler = true"><script src="https://evil.example/x.js"></script',
    );
    await route.fulfill({ response: res, body: html });
  });
  await page.goto(`${BASE}/community`);
  await page.waitForLoadState("networkidle");
  const r = await page.evaluate(() => ({ injected: !!window.__injected, handler: !!window.__handler, violations: window.__csp }));
  await page.unroute(`${BASE}/community`);
  assert(!r.injected && !r.handler, `injected code executed: ${JSON.stringify(r)}`);
  assert(r.violations.some((v) => v.startsWith("script-src")), `no violation was reported: ${JSON.stringify(r.violations)}`);
  // The page itself still works (framework scripts carry the nonce).
  assert(await page.getByRole("button", { name: "Publish" }).isVisible(), "page did not hydrate");
});

await step("image upload: real images accepted, oversized/forged images rejected", async () => {
  await page.goto(`${BASE}/garage/${bikeId}`);
  const input = page.locator('input[type=file][name=file]');
  await input.setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Upload" }).click();
  await waitFor(async () => (await q("select count(*)::int as n from bicycle_images where bicycle_id = $1", [bikeId]))[0].n === 1, 15000);
  await input.setInputFiles({ name: "photo2.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Upload" }).click();
  await waitFor(async () => (await q("select count(*)::int as n from bicycle_images where bicycle_id = $1", [bikeId]))[0].n === 2, 15000);

  const bomb = Buffer.from(PNG);
  bomb.writeUInt32BE(60000, 16);
  bomb.writeUInt32BE(60000, 20);
  await input.setInputFiles({ name: "bomb.png", mimeType: "image/png", buffer: bomb });
  await page.getByRole("button", { name: "Upload" }).click();
  await page.getByText("Image dimensions are too large").first().waitFor({ timeout: 10000 });
  await input.setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await page.getByRole("button", { name: "Upload" }).click();
  await page.getByText("Only JPEG, PNG or WebP").first().waitFor({ timeout: 10000 });
  assert((await q("select count(*)::int as n from bicycle_images where bicycle_id = $1", [bikeId]))[0].n === 2, "rejected file was stored");
});

await step("deleting one image removes exactly that object (row first, queued cleanup)", async () => {
  const [img] = await q("select storage_path from bicycle_images where bicycle_id = $1 order by created_at desc limit 1", [bikeId]);
  await page.goto(`${BASE}/garage/${bikeId}`);
  await page.getByRole("button", { name: "Delete image" }).first().click();
  await waitFor(async () => (await q("select count(*)::int as n from bicycle_images where bicycle_id = $1", [bikeId]))[0].n === 1, 15000);
  const gone = await waitFor(async () => (await admin.list("bicycle-media", `${uid}/${bikeId}`)).length === 1, 20000);
  assert(gone, "object not removed");
  const jobs = await q("select status from private.storage_cleanup_jobs where owner_id = $1 and object_path is not null", [uid]);
  assert(jobs.length === 1 && jobs[0].status === "done", `job state ${JSON.stringify(jobs)} (${img.storage_path})`);
});

await step("deleting a bicycle removes >1,000 objects incl. orphans, sub-folders and maintenance photos", async () => {
  // Orphans the database does not know about (e.g. an upload whose row insert failed) + a sub-folder.
  const names = Array.from({ length: 1050 }, (_, i) => `${uid}/${bikeId}/bulk/${String(i).padStart(4, "0")}.png`);
  for (let i = 0; i < names.length; i += 25) await Promise.all(names.slice(i, i + 25).map((n) => admin.upload("bicycle-media", n)));
  await admin.upload("bicycle-media", `${uid}/${bikeId}/orphan.png`);
  const [rec] = await q(
    "insert into maintenance_records (bicycle_id, owner_id, maintenance_type, title, performed_on) values ($1, $2, 'inspection', 'Check', current_date) returning id",
    [bikeId, uid],
  );
  await admin.upload("maintenance-media", `${uid}/${rec.id}/p.png`);
  await q("insert into maintenance_photos (record_id, owner_id, storage_path) values ($1, $2, $3)", [rec.id, uid, `${uid}/${rec.id}/p.png`]);
  // A sibling object that must survive.
  await admin.upload("bicycle-media", `${uid}/keep-me.png`);
  assert((await countObjects("bicycle-media", `${uid}/${bikeId}`)) === 1052, "setup failed");

  await page.goto(`${BASE}/garage/${bikeId}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete bicycle" }).click();
  await page.locator('[role=alertdialog] input').fill("Sec Bike");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL("**/garage", { timeout: 20000 });

  const empty = await waitFor(async () => (await countObjects("bicycle-media", `${uid}/${bikeId}`)) === 0 && (await countObjects("maintenance-media", `${uid}/${rec.id}`)) === 0, 60000, 1000);
  assert(empty, "bicycle folder or maintenance photos still present");
  assert((await admin.list("bicycle-media", uid)).some((e) => e.name === "keep-me.png"), "unrelated object was deleted");
  const jobs = await q("select bucket, status, attempts from private.storage_cleanup_jobs where owner_id = $1 and prefix is not null order by bucket", [uid]);
  assert(jobs.length === 2 && jobs.every((j) => j.status === "done"), `jobs: ${JSON.stringify(jobs)}`);
});

await step("scheduled cleanup: rejects missing/invalid secrets, processes queued jobs with the service role", async () => {
  assert((await fetch(`${BASE}/api/cron/storage-cleanup`)).status === 401, "no auth accepted");
  assert((await fetch(`${BASE}/api/cron/storage-cleanup`, { headers: { authorization: "Bearer wrong" } })).status === 401, "wrong secret accepted");
  await admin.upload("avatars", `${uid}/stale.png`);
  await q("insert into private.storage_cleanup_jobs (bucket, owner_id, object_path, reason) values ('avatars', $1, $2, 'e2e')", [uid, `${uid}/stale.png`]);
  const r = await fetch(`${BASE}/api/cron/storage-cleanup`, { headers: { authorization: `Bearer ${CRON}` } });
  const body = await r.json();
  assert(r.status === 200 && body.done >= 1, `cron response ${r.status} ${JSON.stringify(body)}`);
  assert((await admin.list("avatars", uid)).every((e) => e.name !== "stale.png"), "object still present");
});

await step("avatars: public URLs work, but the bucket cannot be listed anonymously", async () => {
  await admin.upload("avatars", `${uid}/face.png`);
  const pub = await fetch(`${SB}/storage/v1/object/public/avatars/${uid}/face.png`);
  assert(pub.status === 200, `public avatar URL returned ${pub.status}`);
  const anonList = await storage(ANON).list("avatars", uid);
  assert(Array.isArray(anonList) && anonList.length === 0, `anonymous listing returned ${anonList.length} objects`);
  const anonRoot = await storage(ANON).list("avatars", "");
  assert(anonRoot.length === 0, "anonymous root listing enumerates user folders");
});

await step("rate limits: the UI shows a clear message after 5 posts; the raw API returns HTTP 429", async () => {
  for (let i = 1; i <= 5; i++) {
    await page.goto(`${BASE}/community`);
    await page.fill("#p-title", `Rate test ${i}`);
    await page.getByRole("button", { name: "Publish" }).click();
    await page.waitForURL(/\/community\/[0-9a-f-]{36}/, { timeout: 15000 });
  }
  await page.goto(`${BASE}/community`);
  await page.fill("#p-title", "One too many");
  await page.getByRole("button", { name: "Publish" }).click();
  await page.getByText("You're doing that too often").first().waitFor({ timeout: 10000 });

  // Bypass attempt: talk to PostgREST directly with the user's own token.
  const tok = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: user.password }) })).json();
  const r = await fetch(`${SB}/rest/v1/community_posts`, {
    method: "POST",
    headers: { apikey: ANON, authorization: `Bearer ${tok.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({ author_id: uid, title: "direct API" }),
  });
  const err = await r.json();
  assert(r.status === 429 && err.code === "PT429", `direct API returned ${r.status} ${JSON.stringify(err)}`);
});

await step("client error beacon: same-origin only, validated, scrubbed into the server log", async () => {
  const ok = await page.evaluate(async () =>
    (await fetch("/api/monitoring/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "3d-load", message: "GLB failed for e2e-probe@example.com", model: "velox-placeholder-road" }) })).status,
  );
  assert(ok === 204, `same-origin report returned ${ok}`);
  const cross = await fetch(`${BASE}/api/monitoring/client-error`, { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ kind: "3d-load", message: "x" }) });
  assert(cross.status === 403, `cross-origin report returned ${cross.status}`);
  const bad = await page.evaluate(async () => (await fetch("/api/monitoring/client-error", { method: "POST", body: JSON.stringify({ kind: "shell", message: 1 }) })).status);
  assert(bad === 400, `invalid report returned ${bad}`);
  if (LOG && existsSync(LOG)) {
    const log = readFileSync(LOG, "utf8");
    assert(log.includes('"op":"client.3d-load"'), "event not found in server log");
    assert(!log.includes("e2e-probe@example.com"), "e-mail address leaked into the log");
    assert(log.includes('"op":"post.create.rate_limited"'), "rate-limit event not logged");
  }
});

await step("3D failures are reported: GLB load failure (2D fallback) and real WebGL context loss; navigation is not", async () => {
  // Beacons are not visible to Playwright's request events, so assert on the server log.
  assert(LOG && existsSync(LOG), "SERVER_LOG is required for this check");
  const count = (op) => readFileSync(LOG, "utf8").split("\n").filter((l) => l.includes(`"op":"${op}"`)).length;
  const lost0 = count("client.webgl-context-lost");
  const load0 = count("client.3d-load");
  const p = await ctx.newPage();

  // Normal navigation away from a mounted viewer (R3F drops the context on unmount) is not a failure.
  await p.goto(`${BASE}/`);
  await p.locator("[data-testid=bike-viewer] canvas").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.goto(`${BASE}/explore`);
  await p.waitForTimeout(1500);
  assert(count("client.webgl-context-lost") === lost0, "navigation was reported as a context loss");

  // Real context loss while the viewer is on screen.
  await p.goto(`${BASE}/`);
  await p.locator("[data-testid=bike-viewer] canvas").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    const c = document.querySelector("[data-testid=bike-viewer] canvas");
    c.getContext("webgl2").getExtension("WEBGL_lose_context").loseContext();
  });
  assert(await waitFor(async () => count("client.webgl-context-lost") === lost0 + 1, 8000, 250), "context loss not reported");

  // Model asset unavailable → interactive 2D fallback + report.
  await p.route("**/models/*.glb", (route) => route.fulfill({ status: 404, body: "missing" }));
  await p.goto(`${BASE}/`);
  await p.locator("[data-testid=bike-viewer] svg").first().waitFor({ timeout: 20000 });
  assert(await waitFor(async () => count("client.3d-load") > load0, 8000, 250), "GLB load failure not reported");
  await p.close();
});

await step("password reset link (token-hash flow) sets a new password", async () => {
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: JSON.stringify({ type: "recovery", email: user.email }) })).json();
  const hash = link.hashed_token ?? link.properties?.hashed_token;
  assert(hash, "no hashed_token");
  const fresh = await browser.newContext();
  const p = await fresh.newPage();
  await p.goto(`${BASE}/auth/callback?token_hash=${hash}&type=recovery`);
  await p.waitForURL("**/reset-password", { timeout: 15000 });
  await p.fill("#password", "velox-new-2026x");
  await p.fill("#confirmPassword", "velox-new-2026x");
  await p.click("button[type=submit]");
  await p.getByText("Password updated").first().waitFor({ timeout: 10000 });
  await fresh.close();
  // A recovery link works once.
  const other = await browser.newContext();
  const reused = await other.newPage();
  await reused.goto(`${BASE}/auth/callback?token_hash=${hash}&type=recovery`);
  await reused.waitForURL(/\/login\?error=callback/, { timeout: 15000 });
  await other.close();
  const login = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email: user.email, password: "velox-new-2026x" }) });
  assert(login.ok, "new password does not work");
});

await step("sign-up confirmation link (token-hash flow) signs the rider in", async () => {
  const email = `confirm_${stamp}@example.test`;
  const link = await (await fetch(`${SB}/auth/v1/admin/generate_link`, { method: "POST", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: JSON.stringify({ type: "signup", email, password: "velox-conf-2026", data: { username: `conf_${stamp}` } }) })).json();
  const hash = link.hashed_token ?? link.properties?.hashed_token;
  assert(hash, `no hashed_token: ${JSON.stringify(link).slice(0, 120)}`);
  const fresh = await browser.newContext();
  const p = await fresh.newPage();
  await p.goto(`${BASE}/auth/callback?token_hash=${hash}&type=email&next=/dashboard`);
  await p.waitForURL("**/dashboard", { timeout: 15000 });
  await fresh.close();
});

await browser.close();
await db.end();
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} security checks passed`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
