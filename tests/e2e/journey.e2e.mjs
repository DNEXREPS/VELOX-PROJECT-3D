/**
 * End-to-end journey against a running app + local Supabase.
 *   npx supabase start && npm run build && npm start
 *   node tests/e2e/journey.e2e.mjs [baseUrl] [screenshotDir]
 * Covers: register → create bicycle → studio (select, compatibility, preview, save revision)
 * → history → analytics → maintenance → public passport (privacy) → community post/like/comment.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

/** Use the project's playwright if installed, otherwise the globally installed one. */
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const root = execSync("npm root -g").toString().trim();
    return createRequire(`${root}/`)("playwright");
  }
}
const playwright = await loadPlaywright();
const { chromium } = playwright;

const BASE = process.argv[2] ?? "http://localhost:3000";
const SHOTS = process.argv[3] ?? "e2e-screenshots";
mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now().toString(36);
const user = { email: `rider_${stamp}@example.test`, username: `rider_${stamp}`, password: "velox-test-2026" };
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
    console.log("PASS", name);
  } catch (e) {
    results.push(["FAIL", name, e.message.split("\n")[0]]);
    console.log("FAIL", name, "-", e.message.split("\n")[0]);
  }
};
const expectText = async (page, text, timeout = 15000) => page.getByText(text, { exact: false }).first().waitFor({ timeout });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
let bikeUrl = "";

await step("landing renders with 3D showcase", async () => {
  await page.goto(BASE);
  await expectText(page, "The digital twin of your bicycle");
  await page.locator("canvas").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/01-landing.png` });
});

await step("register a new rider", async () => {
  await page.goto(`${BASE}/register`);
  await page.fill("#email", user.email);
  await page.fill("#username", user.username);
  await page.fill("#password", user.password);
  await page.fill("#confirmPassword", user.password);
  await page.click("button[type=submit]");
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  await expectText(page, "Welcome back");
});

await step("create a bicycle (with private serial number)", async () => {
  await page.goto(`${BASE}/garage/new`);
  await page.fill("#name", "E2E Endurance");
  await page.fill("#brand", "Testbrand");
  await page.fill("#model", "TB-1");
  await page.selectOption("#category", "road");
  await page.fill("#model_year", "2025");
  await page.fill("#color_hex", "#8a2b2b");
  await page.fill("#weight_kg", "8.4");
  await page.fill("#estimated_value", "3200");
  await page.selectOption("#visibility", "public");
  await page.fill("#serial_number", "SERIAL-E2E-SECRET");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/garage\/[0-9a-f-]{36}$/, { timeout: 20000 });
  bikeUrl = page.url();
  await expectText(page, "E2E Endurance");
  await expectText(page, "SERIAL-E2E-SECRET");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOTS}/02-bike-overview.png`, fullPage: true });
});

async function addPart(slotLabel, partName) {
  await page.locator("aside nav button", { hasText: slotLabel }).first().click();
  await page.getByRole("button", { name: /^(Add part|Replace part)$/ }).click();
  const row = page.locator("li", { hasText: partName }).last();
  await row.waitFor({ timeout: 15000 });
  await row.getByRole("button", { name: "Preview" }).click();
}

await step("studio: select parts, check compatibility, preview and save a revision", async () => {
  await page.goto(`${bikeUrl}/studio`);
  await page.locator("canvas").first().waitFor({ timeout: 20000 });
  await addPart("Frame", "Demo Endurance Carbon Disc Frame");
  await addPart("Wheelset", "Demo Alloy Disc Wheelset");
  // Incompatible option is flagged (XDR cassette on HG wheelset)
  await page.locator("aside nav button", { hasText: "Cassette" }).first().click();
  await page.getByRole("button", { name: /^(Add part|Replace part)$/ }).click();
  const xdr = page.locator("li", { hasText: "Demo R12 Cassette 10–33 (XDR)" }).last();
  await xdr.waitFor();
  await xdr.getByText("Incompatible").waitFor();
  const hg = page.locator("li", { hasText: "Demo R12 Cassette 11–34" }).last();
  await hg.getByText("Compatible").waitFor();
  await hg.getByRole("button", { name: "Preview" }).click();
  await addPart("Rear tire", "Demo Gravel Tire 700×40");
  await expectText(page, "Incompatible"); // 40mm tire vs 32mm clearance in pending panel
  // Classic viewer scales the tire; the modular engine (NEXT_PUBLIC_ASSEMBLY_ENGINE=1) regenerates it.
  if (process.env.E2E_ASSEMBLY_ENGINE === "1") {
    await page.getByTestId("geometry-rear_tire").filter({ hasText: "Generated from recorded dimensions" }).last().waitFor({ timeout: 15000 });
  } else {
    await expectText(page, "tire geometry scaled to 40 mm");
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/03-studio-pending.png` });
  // Swap the tire for a compatible one, then save.
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: /^(Add part|Replace part)$/ }).click();
  await page.locator("li", { hasText: "Demo Road Tire 700×28" }).last().getByRole("button", { name: "Preview" }).click();
  await page.fill('input[aria-label="Change description"]', "Initial build");
  await page.getByRole("button", { name: "Save revision" }).click();
  await expectText(page, "Saved as revision 1");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/04-studio-saved.png` });
});

await step("studio: replacement creates revision 2 (history not overwritten)", async () => {
  await page.locator("aside nav button", { hasText: "Cassette" }).first().click();
  await page.getByRole("button", { name: "Replace part" }).click();
  await page.locator("li", { hasText: "Demo R11 Cassette 11–28" }).last().getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Save revision" }).click();
  await expectText(page, "Saved as revision 2");
});

await step("history shows both revisions with snapshots", async () => {
  await page.goto(`${bikeUrl}/history`);
  await expectText(page, "Revision 2");
  await expectText(page, "Revision 1");
  await expectText(page, "Demo R11 Cassette 11–28");
  await page.screenshot({ path: `${SHOTS}/05-history.png`, fullPage: true });
});

await step("components tab shows compatibility report", async () => {
  await page.goto(`${bikeUrl}/components`);
  await expectText(page, "Compatibility report");
  await expectText(page, "incompatible"); // 11s cassette vs nothing? report lists counts
  await page.screenshot({ path: `${SHOTS}/06-components.png`, fullPage: true });
});

await step("analytics computes from recorded data only", async () => {
  await page.goto(`${bikeUrl}/analytics`);
  await expectText(page, "Total component weight");
  await expectText(page, "3.14 kg"); // 980 + 1650 + 260 + 250 g (all demo weights known)
  await expectText(page, "Unavailable"); // no crankset recorded → gearing unavailable, not guessed
  await page.screenshot({ path: `${SHOTS}/07-analytics.png`, fullPage: true });
});

await step("maintenance: log a record with a reminder", async () => {
  await page.goto(`${bikeUrl}/maintenance`);
  await page.getByRole("button", { name: "Log maintenance" }).click();
  await page.fill("#m-title", "Chain wax");
  await page.selectOption("#m-type", "lubrication");
  await page.selectOption("#m-slot", "chain");
  await page.fill("#m-cost", "12.5");
  await page.fill("#m-dist", "1520");
  const due = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await page.fill("#m-next", due);
  await page.getByRole("button", { name: "Save record" }).click();
  await expectText(page, "Chain wax");
  await expectText(page, "in 5d");
  await page.screenshot({ path: `${SHOTS}/08-maintenance.png`, fullPage: true });
});

await step("dashboard shows reminders and build activity", async () => {
  await page.goto(`${BASE}/dashboard`);
  await expectText(page, "Chain wax");
  await expectText(page, "Rev 2");
  await page.screenshot({ path: `${SHOTS}/09-dashboard.png`, fullPage: true });
});

await step("community: publish a post linked to the passport, like and comment", async () => {
  await page.goto(`${BASE}/community`);
  await page.fill("#p-title", "Finished my endurance build");
  await page.selectOption("#p-bike", { label: "E2E Endurance" });
  await page.fill("#p-body", "Disc, 2x12, 28 mm tires.");
  await page.getByRole("button", { name: "Publish" }).click();
  await page.waitForURL(/\/community\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Like" }).click();
  await page.getByRole("button", { name: "Unlike" }).waitFor();
  await page.fill('textarea[aria-label="Comment"]', "Looks great");
  await page.getByRole("button", { name: "Comment" }).click();
  await expectText(page, "Looks great");
  await page.screenshot({ path: `${SHOTS}/10-post.png`, fullPage: true });
});

await step("public passport hides private data from anonymous visitors", async () => {
  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await anon.newPage();
  const res = await p.goto(`${BASE}/bike/${user.username}/e2e-endurance`);
  if (res.status() !== 200) throw new Error(`status ${res.status()}`);
  await p.getByText("Digital Bike Passport").first().waitFor();
  await p.getByText("Demo Endurance Carbon Disc Frame").first().waitFor();
  const html = await p.content();
  if (html.includes("SERIAL-E2E-SECRET")) throw new Error("serial number leaked");
  if (html.includes("3,200") || html.includes("3200")) throw new Error("hidden value leaked");
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${SHOTS}/11-passport.png`, fullPage: true });
  const missing = await p.goto(`${BASE}/bike/${user.username}/does-not-exist`);
  if (missing.status() !== 404) throw new Error(`expected 404, got ${missing.status()}`);
  const guarded = await p.goto(`${bikeUrl}`);
  if (!p.url().includes("/login")) throw new Error("garage not protected");
  void guarded;
  await anon.close();
});

await step("explore lists the public build", async () => {
  await page.goto(`${BASE}/explore?q=E2E`);
  await expectText(page, "E2E Endurance");
  await page.screenshot({ path: `${SHOTS}/12-explore.png` });
});

await step("component registry search + detail", async () => {
  await page.goto(`${BASE}/components?category=cassettes&sort=weight_asc`);
  await expectText(page, "Demo R11 Cassette 11–28");
  await page.screenshot({ path: `${SHOTS}/13-components.png` });
  await page.goto(`${BASE}/components/demo-r12-cassette-11-34`);
  await expectText(page, "Demo data: this is a fictional sample");
  await page.screenshot({ path: `${SHOTS}/14-component-detail.png`, fullPage: true });
});

await step("mobile: studio and garage render without horizontal overflow", async () => {
  const m = await browser.newContext({ ...playwright.devices["iPhone 13"], storageState: await ctx.storageState() });
  const mp = await m.newPage();
  for (const [path, name] of [["/garage", "15-mobile-garage"], [`${new URL(bikeUrl).pathname}/studio`, "16-mobile-studio"], [new URL(bikeUrl).pathname, "17-mobile-overview"], ["/", "18-mobile-landing"]]) {
    await mp.goto(`${BASE}${path}`);
    await mp.waitForTimeout(2500);
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`${path} overflows horizontally by ${overflow}px`);
    await mp.screenshot({ path: `${SHOTS}/${name}.png` });
  }
  // Bottom sheet opens when a part is selected
  await mp.goto(`${BASE}${new URL(bikeUrl).pathname}/studio`);
  await mp.getByRole("button", { name: "Parts", exact: true }).click();
  await mp.getByRole("dialog").locator("nav button", { hasText: "Cassette" }).click();
  await mp.getByText("Replace part").waitFor();
  await mp.waitForTimeout(1200);
  await mp.screenshot({ path: `${SHOTS}/19-mobile-sheet.png` });
  await m.close();
});

await step("delete bicycle requires typed confirmation", async () => {
  await page.goto(bikeUrl);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete bicycle" }).click();
  const confirmBtn = page.getByRole("button", { name: "Delete permanently" });
  if (await confirmBtn.isEnabled()) throw new Error("delete enabled without confirmation");
  await page.getByRole("button", { name: "Cancel" }).click();
});

await browser.close();
const relevantErrors = consoleErrors.filter((e) => !/favicon|Download the React DevTools/.test(e));
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
if (relevantErrors.length) console.log("Console errors:\n" + [...new Set(relevantErrors)].slice(0, 15).join("\n"));
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
