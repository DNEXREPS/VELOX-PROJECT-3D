/**
 * P1 studio E2E — modular assembly viewer in the real garage studio.
 *
 * Needs a running app built with NEXT_PUBLIC_ASSEMBLY_ENGINE=1 and the local Supabase stack
 * (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment).
 *
 *   node tests/e2e/studio-assembly.e2e.mjs [baseUrl]
 *   E2E_BROWSER=webkit E2E_DEVICE="iPhone 15" node tests/e2e/studio-assembly.e2e.mjs
 *
 * Setup uses the normal product paths only: UI registration, UI bike creation, and the
 * apply_bicycle_configuration RPC called with the rider's OWN session token (RLS applies;
 * no service-role key). Then, through the UI: modular render, real part replacement,
 * missing-dimension state, before/after, 2D view, saving a revision, classic fallback,
 * unsupported category, manifest integrity failure, mobile layout.
 */
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return createRequire(`${execSync("npm root -g").toString().trim()}/`)("playwright");
  }
}
const pw = await loadPlaywright();
const BASE = process.argv[2] ?? "http://localhost:3000";
const ENGINE = process.env.E2E_BROWSER ?? "chromium";
const DEVICE = process.env.E2E_DEVICE;
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SB_URL || !SB_ANON) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  process.exit(2);
}

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
const assert = (c, m) => {
  if (!c) throw new Error(m);
};

const browser = await pw[ENGINE].launch();
const ctxOpts = DEVICE ? { ...pw.devices[DEVICE] } : { viewport: { width: 1440, height: 950 } };
console.log(`engine=${ENGINE} device=${DEVICE ?? "desktop"} (${browser.version()})`);
const ctx = await browser.newContext(ctxOpts);
// Record CSP violations from the first script on every page.
await ctx.addInitScript(() => {
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (e) => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
});
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

const stamp = `${Date.now().toString(36)}${ENGINE.slice(0, 2)}${DEVICE ? DEVICE.replace(/\W/g, "").slice(0, 6) : ""}`.toLowerCase();
const user = { email: `studio_${stamp}@example.test`, username: `studio_${stamp}`.slice(0, 30), password: "velox-test-2026" };
const bikes = {};

// ---------------------------------------------------------------- helpers
const studioState = (p = page) => p.evaluate(() => (window.__veloxStudio ? JSON.parse(JSON.stringify(window.__veloxStudio)) : null));
async function settle(p = page, timeout = 40000) {
  try {
    await p.waitForFunction(
      () => {
        const s = window.__veloxStudio;
        if (!s?.render || s.render.pending !== 0) return false;
        return s.nodes.every((n) => (n.sig ? s.render.rendered[n.id] === n.sig : s.render.rendered[n.id] === undefined));
      },
      null,
      { timeout },
    );
  } catch (e) {
    const s = await studioState(p).catch(() => null);
    console.log("  settle diagnostics:", JSON.stringify(s && { nodes: s.nodes.map((n) => `${n.id}:${n.status}`), rendered: Object.keys(s.render?.rendered ?? {}), pending: s.render?.pending, errors: s.render?.errors }));
    throw e;
  }
  await p.waitForTimeout(400);
}
/** Wait until the studio publishes a fingerprint different from `before`, then settle. */
async function changedFrom(before, p = page) {
  await p.waitForFunction((f) => window.__veloxStudio && window.__veloxStudio.fingerprint !== f, before, { timeout: 15000 });
  await settle(p);
}
const snap = (p = page) =>
  p.evaluate(() => {
    const src = document.querySelector("[data-testid=assembly-canvas] canvas");
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] > 140) lit++;
      h = Math.imul(h ^ (d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16)), 16777619) >>> 0;
    }
    return { hash: h, lit, pixels: d.length / 4 };
  });

const desktop = () => page.viewportSize().width >= 1024;
async function selectSlot(label) {
  if (desktop()) {
    await page.locator("aside nav button", { hasText: label }).first().click();
  } else {
    await page.getByRole("button", { name: "Parts", exact: true }).click();
    await page.getByRole("dialog").locator("nav button", { hasText: label }).first().click();
  }
  await page.getByRole("button", { name: /^(Add part|Replace part)$/ }).waitFor({ timeout: 10000 });
}
/** Phones/tablets: the part sheet covers the pending-changes bar; close it like a user would. */
async function closePanel() {
  if (desktop()) return;
  const close = page.getByRole("button", { name: "Close panel" });
  if (await close.isVisible()) await close.click();
}
async function previewPart(label, partName) {
  await selectSlot(label);
  await page.getByRole("button", { name: /^(Add part|Replace part)$/ }).click();
  const row = page.locator("li", { hasText: partName }).last();
  await row.waitFor({ timeout: 15000 });
  await row.getByRole("button", { name: "Preview" }).click();
}

async function sb(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${SB_URL}${path}`, {
    method,
    headers: { apikey: SB_ANON, Authorization: `Bearer ${token ?? SB_ANON}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
async function createBike(name, category) {
  await page.goto(`${BASE}/garage/new`);
  await page.fill("#name", name);
  await page.fill("#brand", "Testbrand");
  await page.fill("#model", category);
  await page.selectOption("#category", category);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/garage\/[0-9a-f-]{36}$/, { timeout: 20000 });
  return page.url().split("/").pop();
}

const ROAD_BUILD = {
  frame: "demo-endurance-carbon-disc-frame",
  fork: "demo-carbon-disc-fork",
  wheelset: "demo-alloy-disc-wheelset",
  front_tire: "demo-road-tire-700x28",
  rear_tire: "demo-road-tire-700x28",
  stem: "demo-alloy-stem-100",
  handlebar: "demo-alloy-drop-bar-420",
  seatpost: "demo-carbon-seatpost-27-2",
  crankset: "demo-r12-crankset-50-34",
  cassette: "demo-r12-cassette-11-34",
  chain: "demo-r12-chain",
  front_rotor: "demo-rotor-160-centerlock",
  rear_rotor: "demo-rotor-160-centerlock",
};

// ---------------------------------------------------------------- setup
await step("setup: register a rider, create road / gravel / mountain bikes, apply a full road build (own token, RLS)", async () => {
  await page.goto(`${BASE}/register`);
  await page.fill("#email", user.email);
  await page.fill("#username", user.username);
  await page.fill("#password", user.password);
  await page.fill("#confirmPassword", user.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  bikes.road = await createBike("Studio Road", "road");
  bikes.gravel = await createBike("Studio Gravel", "gravel");
  bikes.mtb = await createBike("Studio MTB", "mountain");
  const { access_token: token } = await sb("/auth/v1/token?grant_type=password", { method: "POST", body: { email: user.email, password: user.password } });
  const slugs = [...new Set(Object.values(ROAD_BUILD))];
  const rows = await sb(`/rest/v1/components?select=id,slug&slug=in.(${slugs.join(",")})`, { token });
  const id = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
  assert(slugs.every((s) => id[s]), `missing seeded components: ${slugs.filter((s) => !id[s])}`);
  const rev = await sb("/rest/v1/rpc/apply_bicycle_configuration", {
    method: "POST",
    token,
    body: { p_bicycle_id: bikes.road, p_changes: Object.entries(ROAD_BUILD).map(([slot, slug]) => ({ slot, component_id: id[slug] })), p_description: "E2E road build" },
  });
  assert(rev.revision_number === 1, `revision ${rev.revision_number}`);
});

// ---------------------------------------------------------------- modular viewer
await step("studio renders the full road build in the modular viewer (all parts, verified assets, no CSP violations)", async () => {
  await page.goto(`${BASE}/garage/${bikes.road}/studio`);
  await page.getByTestId("modular-viewer").waitFor({ timeout: 30000 });
  await settle();
  const s = await studioState();
  assert(s.viewer === "modular" && s.mode === "3d", `viewer ${s.viewer}/${s.mode}`);
  assert(s.nodes.length === 14 && s.nodes.every((n) => n.status === "ok"), `nodes: ${s.nodes.map((n) => `${n.id}:${n.status}`)}`);
  assert(s.render.errors.length === 0, `render errors: ${s.render.errors}`);
  assert(s.render.report.integrityFailures.length === 0, "integrity failures");
  assert(s.render.report.fingerprintMismatches.length === 0, "decoded geometry differs from pipeline");
  const shot = await snap();
  assert(shot.lit / shot.pixels > 0.005, `canvas looks empty (${shot.lit} lit)`);
  const csp = await page.evaluate(() => window.__cspViolations);
  assert(csp.length === 0, `CSP violations: ${csp}`);
  // Measurements are labelled with their quality (estimate: frame geometry chart not recorded).
  assert((await page.getByTestId("measure-wheelbaseMm").getAttribute("data-quality")) === "estimate", "wheelbase quality label");
});

await step("selected part shows its truthful 3D status (representative fork, generated stem)", async () => {
  await selectSlot("Fork");
  assert((await page.getByTestId("geometry-fork").first().getAttribute("data-representation")) === "representative", "fork representation");
  await page.getByText("Not a model of this exact product.").first().waitFor();
  await selectSlot("Stem");
  assert((await page.getByTestId("geometry-stem").first().getAttribute("data-representation")) === "generated", "stem representation");
});

await step("replacing the stem (UI picker) regenerates it, moves the handlebar and changes pixels; Show saved restores the saved assembly", async () => {
  const before = await studioState();
  const shot = await snap();
  await previewPart("Stem", "Demo Alloy Stem 90 mm (35 mm clamp)");
  await changedFrom(before.fingerprint);
  const after = await studioState();
  const stem = (s) => s.nodes.find((n) => n.id === "stem");
  assert(stem(after).sig !== stem(before).sig && after.render.geometry.stem !== before.render.geometry.stem, "stem geometry unchanged");
  assert(after.derived.barClampMm.x < before.derived.barClampMm.x, `bar clamp x ${before.derived.barClampMm.x} → ${after.derived.barClampMm.x}`);
  assert((await snap()).hash !== shot.hash, "pixels unchanged after replacement");
  // The stem's 35 mm clamp vs the 31.8 mm bar is reported, not hidden.
  const barWarnings = after.nodes.find((n) => n.id === "handlebar").warnings;
  assert(barWarnings.some((w) => w.startsWith("interface_mismatch:bar_clamp")), `clamp mismatch not reported: ${barWarnings}`);
  await page.getByTestId("toggle-before").click();
  await changedFrom(after.fingerprint);
  const saved = await studioState();
  assert(saved.showingBefore && saved.fingerprint === before.fingerprint, "Show saved did not restore the saved assembly");
  await page.getByTestId("toggle-before").click();
  await changedFrom(before.fingerprint);
});

await step("a bar without recorded drop shows 'needs verification' and no stale bar geometry", async () => {
  const before = await studioState();
  await previewPart("Handlebar", "Demo Carbon Drop Bar 400");
  await changedFrom(before.fingerprint);
  const s = await studioState();
  const bar = s.nodes.find((n) => n.id === "handlebar");
  assert(bar.status === "missing_dimensions" && bar.missing.includes("drop_mm"), JSON.stringify(bar));
  assert(s.render.rendered.handlebar === undefined, "old handlebar still rendered");
  await page.getByText("Unavailable — needs verification: drop not recorded").first().waitFor();
});

await step("2D side view is drawn from the same assembly and is interactive", async () => {
  await page.getByTestId("toggle-2d").click();
  const svg = page.getByTestId("assembly-2d");
  await svg.waitFor();
  assert((await svg.locator("polyline").count()) >= 6, "2D polylines missing");
  assert((await studioState()).mode === "2d", "mode not 2d");
  await page.getByTestId("toggle-2d").click();
  await page.getByTestId("assembly-canvas").waitFor();
  await settle();
});

await step("saving creates revision 2 and the viewer shows the saved geometry", async () => {
  await closePanel();
  await page.getByRole("button", { name: "Cancel all" }).click();
  await settle();
  const before = await studioState();
  await previewPart("Front rotor", "Demo Rotor 140 mm Center Lock");
  await changedFrom(before.fingerprint);
  const preview = await studioState();
  await closePanel();
  await page.fill('input[aria-label="Change description"]', "Smaller front rotor");
  await page.getByRole("button", { name: "Save revision" }).click();
  await page.getByText("Saved as revision 2").first().waitFor({ timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector("[data-testid=toggle-before]"), null, { timeout: 15000 });
  await settle();
  const after = await studioState();
  assert(after.fingerprint === preview.fingerprint, "saved assembly differs from the previewed one");
  await page.reload();
  await page.getByTestId("modular-viewer").waitFor({ timeout: 30000 });
  await settle();
  assert((await studioState()).fingerprint === preview.fingerprint, "reloaded assembly differs (revision not persisted)");
});

await step("Classic viewer is selectable, remembered, and switching back works", async () => {
  await page.getByTestId("viewer-switch").getByRole("button", { name: "Classic" }).click();
  await page.getByTestId("modular-viewer").waitFor({ state: "detached" });
  await page.locator("canvas").first().waitFor({ timeout: 20000 });
  await page.reload();
  await page.getByTestId("viewer-switch").waitFor();
  assert((await page.getByTestId("modular-viewer").count()) === 0, "classic choice not remembered");
  await page.getByTestId("viewer-switch").getByRole("button", { name: "Modular (beta)" }).click();
  await page.getByTestId("modular-viewer").waitFor({ timeout: 30000 });
  await settle();
});

await step("unsupported category (gravel) shows an explicit notice and the classic viewer", async () => {
  await page.goto(`${BASE}/garage/${bikes.gravel}/studio`);
  const notice = page.getByTestId("engine-notice");
  await notice.waitFor({ timeout: 20000 });
  assert(/isn't available for gravel bikes/.test(await notice.innerText()), await notice.innerText());
  assert((await page.getByTestId("modular-viewer").count()) === 0, "modular viewer shown for gravel");
  await page.locator("canvas").first().waitFor({ timeout: 20000 });
});

await step("empty mountain bike: modular viewer with explicit empty states, no crash", async () => {
  await page.goto(`${BASE}/garage/${bikes.mtb}/studio`);
  await page.getByTestId("modular-viewer").waitFor({ timeout: 30000 });
  const s = await studioState();
  assert(s.nodes.length === 0, `unexpected nodes ${s.nodes.map((n) => n.id)}`);
  await selectSlot("Frame");
  await page.getByText("No part recorded for this position.").first().waitFor();
});

await step("tampered asset manifest is rejected: classic viewer with notice, nothing from the manifest rendered", async () => {
  const p2 = await ctx.newPage();
  await p2.route("**/model-assets/manifest-*.json", async (route) => {
    const res = await route.fetch();
    const body = Buffer.from(await res.body());
    body[body.length - 3] ^= 0x01;
    await route.fulfill({ response: res, body });
  });
  await p2.goto(`${BASE}/garage/${bikes.road}/studio`);
  const notice = p2.getByTestId("engine-notice");
  await notice.waitFor({ timeout: 20000 });
  assert(/could not be verified/.test(await notice.innerText()), await notice.innerText());
  assert((await p2.getByTestId("modular-viewer").count()) === 0, "modular viewer shown with an unverified manifest");
  await p2.close();
});

await step("layout: no horizontal overflow in the studio", async () => {
  await page.goto(`${BASE}/garage/${bikes.road}/studio`);
  await page.getByTestId("modular-viewer").waitFor({ timeout: 30000 });
  await settle();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, `overflows horizontally by ${overflow}px`);
});

await step("no uncaught page errors", async () => {
  // WebKit reports same-origin fetches cancelled by a navigation (RSC prefetches, the classic
  // viewer's GLB) as "… due to access control checks". Those are aborts, not application errors.
  const host = new URL(BASE).host;
  const aborted = (e) => e.includes(`${host}/`) && /due to access control checks/.test(e);
  const relevant = pageErrors.filter((e) => !/ResizeObserver loop/.test(e) && !aborted(e));
  assert(relevant.length === 0, relevant.slice(0, 3).join(" | "));
});

await browser.close();
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} studio checks passed (${ENGINE}${DEVICE ? `, ${DEVICE}` : ""})`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
