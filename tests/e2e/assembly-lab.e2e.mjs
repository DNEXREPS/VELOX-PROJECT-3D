/**
 * Modular assembly lab E2E (production renderer, P1) (/lab/assembly, server started with VELOX_LABS=1).
 *
 *   node tests/e2e/assembly-lab.e2e.mjs [baseUrl]
 *   E2E_BROWSER=webkit E2E_DEVICE="iPhone 15" node tests/e2e/assembly-lab.e2e.mjs   (macOS CI)
 *   E2E_SUPABASE=1 → also load the assets from the local Supabase public bucket
 *
 * Proves: independently authored parts assemble, replacements change the rendered pixels
 * and the decoded geometry, missing data never shows stale geometry, integrity failures
 * stop loading, memory returns to baseline, and the CSP/decoder matrix behaves.
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
const ctxOpts = DEVICE ? { ...pw.devices[DEVICE] } : { viewport: { width: 1400, height: 1000 } };
console.log(`engine=${ENGINE} device=${DEVICE ?? "desktop"} (${browser.version()})`);

async function openLab(query = "", setup, { waitSettle = true } = {}) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (setup) await setup(page);
  await page.goto(`${BASE}/lab/assembly${query}`);
  if (waitSettle) await settle(page);
  return { ctx, page, errors };
}

/** Wait until every resolvable node is rendered with its current source and nothing is loading. */
async function settle(page, timeout = 30000) {
  try {
    await waitSettled(page, timeout);
  } catch (e) {
    // Diagnostics for CI: which node / decoder step did not finish.
    const s = await page.evaluate(() => window.__veloxLab && { nodes: window.__veloxLab.nodes.map((n) => `${n.id}:${n.status}:${n.sig ? "sig" : "-"}`), rendered: window.__veloxLab.render?.rendered, pending: window.__veloxLab.render?.pending, errors: window.__veloxLab.render?.errors, report: window.__veloxLab.render?.report, csp: window.__veloxLab.cspViolations }).catch(() => null);
    console.log("  settle diagnostics:", JSON.stringify(s));
    throw e;
  }
}
async function waitSettled(page, timeout) {
  await page.waitForFunction(
    () => {
      const s = window.__veloxLab;
      if (!s?.render || s.render.pending !== 0) return false;
      return s.nodes.every((n) => (n.sig ? s.render.rendered[n.id] === n.sig : s.render.rendered[n.id] === undefined));
    },
    null,
    { timeout },
  );
  await page.waitForTimeout(400); // demand frameloop: let the next frame draw
}
const state = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__veloxLab)));
const setConfig = async (page, patch) => {
  const seq = await page.evaluate((p) => {
    const before = window.__veloxLab.seq;
    window.__veloxLabSet(p);
    return before;
  }, patch);
  // Wait for the state published AFTER this change, then for it to finish rendering.
  await page.waitForFunction((s) => window.__veloxLab?.seq > s, seq, { timeout: 10000 });
  await settle(page);
};
/** Click a preset button (real UI path) and wait for the resulting state to render. */
const clickPreset = async (page, id) => {
  const seq = await page.evaluate(() => window.__veloxLab.seq);
  await page.getByTestId(`preset-${id}`).click();
  await page.waitForFunction((s) => window.__veloxLab?.seq > s, seq, { timeout: 10000 });
  await settle(page);
};
/** Hash + coverage of the rendered WebGL canvas. */
const snap = (page) =>
  page.evaluate(() => {
    const src = document.querySelector("[data-testid=assembly-canvas] canvas");
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext("2d");
    g.drawImage(src, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let fg = 0;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] + d[i + 1] + d[i + 2];
      if (lum > 140) fg++;
      h = Math.imul(h ^ (d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16)), 16777619) >>> 0;
    }
    return { hash: h, fg, pixels: d.length / 4 };
  });
const pixelDiff = (a, b) => Math.abs(a.fg - b.fg) / a.pixels;
/** GPU counters read live after a fresh frame. */
const gpu = async (page) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
  return page.evaluate(() => window.__veloxAssemblyMemory());
};

const { page, errors, ctx } = await openLab();

await step("assembles the full road build (frame, fork, wheels, tires, cockpit, seatpost, drivetrain, rotors)", async () => {
  const s = await state(page);
  assert(s.nodes.length === 14, `nodes: ${s.nodes.map((n) => n.id).join(",")}`);
  assert(s.nodes.every((n) => n.status === "ok"), `nodes: ${s.nodes.map((n) => `${n.id}:${n.status}`).join(",")}`);
  assert(s.nodes.every((n) => n.warnings.length === 0), `warnings: ${JSON.stringify(s.nodes.filter((n) => n.warnings.length))}`);
  assert(s.render.report.decoder === "wasm", `decoder ${s.render.report.decoder} (${s.render.report.decoderError})`);
  assert(s.render.report.integrityFailures.length === 0, "integrity failures");
  assert(s.render.report.fingerprintMatches >= 2 && s.render.report.fingerprintMismatches.length === 0, `fingerprints: ${JSON.stringify(s.render.report.fingerprintMismatches)}`);
  assert(s.cspViolations.length === 0, `CSP violations: ${s.cspViolations}`);
  assert(s.render.report.ktx2 === "disabled", `ktx2 ${s.render.report.ktx2}`);
  const shot = await snap(page);
  assert(shot.fg / shot.pixels > 0.005, `canvas looks empty (${shot.fg} lit pixels)`);
  assert((await page.locator("[data-testid=assembly-2d] polyline").count()) >= 8, "2D projection missing");
  assert((await page.getByTestId("geometry-fork").getAttribute("data-representation")) === "representative", "fork not labelled representative");
  assert((await page.getByTestId("geometry-stem").getAttribute("data-representation")) === "generated", "stem not labelled generated");
});

await step("replacing an authored part (fork) changes decoded geometry, pixels, 2D view and derived geometry", async () => {
  const before = await state(page);
  const shot = await snap(page);
  const svg = await page.locator("[data-testid=assembly-2d]").innerHTML();
  await setConfig(page, { parts: { fork: "demo-rigid-mtb-fork-470" } });
  const after = await state(page);
  assert(after.render.rendered.fork.includes("fork-mtb-rigid-demo"), "new fork not rendered");
  assert(after.render.geometry.fork !== before.render.geometry.fork, "decoded fork geometry unchanged");
  assert(after.derived.wheelbaseMm > before.derived.wheelbaseMm, "wheelbase did not change");
  assert(after.fingerprint !== before.fingerprint, "assembly fingerprint unchanged");
  assert((await snap(page)).hash !== shot.hash, "rendered pixels identical after replacement");
  assert((await page.locator("[data-testid=assembly-2d]").innerHTML()) !== svg, "2D view unchanged");
  await setConfig(page, { preset: "road" });
});

await step("replacing generated parts regenerates them and moves dependants (stem, crank, cassette, rotor)", async () => {
  const swaps = [
    ["stem", "demo-alloy-stem-90-35", (a, b) => b.derived.barClampMm.x < a.derived.barClampMm.x],
    ["crankset", "demo-m12-crankset-175-30", (a, b) => Math.abs(a.derived.lowestPedalMm - b.derived.lowestPedalMm - 2.5) < 0.05],
    ["cassette", "demo-r11-cassette-11-28", () => true],
    ["front_rotor", "demo-rotor-140-centerlock", () => true],
  ];
  for (const [slot, part, check] of swaps) {
    const a = await state(page);
    const shot = await snap(page);
    await setConfig(page, { parts: { [slot]: part } });
    const b = await state(page);
    const id = a.nodes.find((n) => n.slot === slot).id;
    assert(b.render.geometry[id] !== a.render.geometry[id], `${slot}: geometry unchanged`);
    assert((await snap(page)).hash !== shot.hash, `${slot}: pixels unchanged`);
    assert(check(a, b), `${slot}: measurement did not change as expected`);
    if (slot === "cassette") assert(b.render.geometry.chain !== a.render.geometry.chain, "chain did not follow the cassette");
  }
  await setConfig(page, { preset: "road" });
});

await step("tire width regenerates the tires and raises the bike", async () => {
  const before = await state(page);
  await setConfig(page, { parts: { front_tire: "demo-gravel-tire-700x40", rear_tire: "demo-gravel-tire-700x40#rear" } });
  const after = await state(page);
  assert(after.render.geometry.tire_front !== before.render.geometry.tire_front, "tire geometry unchanged");
  assert(after.derived.bbHeightMm > before.derived.bbHeightMm + 8, `BB height ${before.derived.bbHeightMm} → ${after.derived.bbHeightMm}`);
  await setConfig(page, { preset: "road" });
});

await step("hardtail preset replaces frame geometry and every component", async () => {
  const before = await state(page);
  const shot = await snap(page);
  await clickPreset(page, "hardtail");
  const after = await state(page);
  assert(after.nodes.every((n) => n.status === "ok"), `nodes: ${after.nodes.map((n) => `${n.id}:${n.status}`).join(",")}`);
  assert(after.render.geometry.frame !== before.render.geometry.frame, "frame geometry unchanged");
  assert(after.render.geometry.handlebar !== before.render.geometry.handlebar, "flat bar not generated");
  assert(pixelDiff(shot, await snap(page)) > 0.0005, "frame swap barely changed the image");
  await clickPreset(page, "road");
});

await step("MTB demo: hardtail fork 470 → 480 loads the second verified fork asset and moves the front wheel", async () => {
  await clickPreset(page, "hardtail");
  const before = await state(page);
  const shot = await snap(page);
  await setConfig(page, { parts: { fork: "demo-rigid-mtb-fork-480" } });
  const after = await state(page);
  assert(after.nodes.every((n) => n.status === "ok" && n.warnings.length === 0), `nodes: ${JSON.stringify(after.nodes.filter((n) => n.status !== "ok" || n.warnings.length))}`);
  assert(after.render.rendered.fork.includes("fork-demo-mtb-480"), "new fork asset not rendered");
  assert(after.render.geometry.fork !== before.render.geometry.fork, "decoded fork geometry unchanged");
  assert(after.render.report.integrityFailures.length === 0 && after.render.report.fingerprintMismatches.length === 0, "integrity / fingerprint failure");
  assert(after.derived.wheelbaseMm > before.derived.wheelbaseMm, "wheelbase did not grow");
  assert((await snap(page)).hash !== shot.hash, "pixels unchanged");
  await clickPreset(page, "road");
});

await step("missing dimensions: explicit 'needs verification' state and no stale geometry", async () => {
  await setConfig(page, { parts: { handlebar: "demo-carbon-drop-bar-400" } });
  const s = await state(page);
  const bar = s.nodes.find((n) => n.id === "handlebar");
  assert(bar.status === "missing_dimensions" && bar.missing.includes("drop_mm"), JSON.stringify(bar));
  assert(s.render.rendered.handlebar === undefined && s.render.geometry.handlebar === undefined, "old handlebar geometry still on screen");
  assert(await page.getByTestId("node-handlebar").getByText("Unavailable — needs verification: drop not recorded").isVisible(), "missing state not shown");
  await setConfig(page, { preset: "road" });
});

await step("a part without a 3D model removes the old fork (and everything mounted on it)", async () => {
  await setConfig(page, { parts: { fork: "demo-steel-rim-fork" } });
  const s = await state(page);
  for (const id of ["fork", "wheel_front", "tire_front", "rotor_front"]) assert(s.render.rendered[id] === undefined, `${id} still rendered`);
  assert(await page.getByTestId("node-fork").getByText("No 3D model for this part").isVisible(), "no-model state not shown");
  await setConfig(page, { preset: "road" });
});

await step("rim-brake wheelset: rotors explicitly unavailable, not floating", async () => {
  await setConfig(page, { parts: { wheelset: "demo-alloy-rim-brake-wheelset" } });
  const s = await state(page);
  for (const id of ["rotor_front", "rotor_rear"]) {
    assert(s.nodes.find((n) => n.id === id).status === "host_unavailable", `${id} not host_unavailable`);
    assert(s.render.rendered[id] === undefined, `${id} still rendered`);
  }
  await setConfig(page, { preset: "road" });
});

await step("reference-counted cache: memory returns to baseline after repeated swaps", async () => {
  const base = { ...(await state(page)), mem: await gpu(page) };
  for (let i = 0; i < 4; i++) {
    for (const parts of [{ fork: "demo-rigid-mtb-fork-470" }, { crankset: "demo-m12-crankset-175-30" }, { stem: "demo-alloy-stem-90-35" }, { fork: "demo-carbon-disc-fork", crankset: "demo-r12-crankset-50-34", stem: "demo-alloy-stem-100" }]) await setConfig(page, { parts });
    await clickPreset(page, "hardtail");
    await clickPreset(page, "road");
  }
  const end = { ...(await state(page)), mem: await gpu(page) };
  assert(end.fingerprint === base.fingerprint, "did not return to the same assembly");
  assert(end.mem.geometries === base.mem.geometries, `geometries ${base.mem.geometries} → ${end.mem.geometries}`);
  assert(end.mem.textures === base.mem.textures, `textures ${base.mem.textures} → ${end.mem.textures}`);
  console.log(`  GPU: ${base.mem.geometries} geometries / ${base.mem.textures} textures before and after 24 swaps`);
  assert(JSON.stringify(end.render.cachedAssets.sort()) === JSON.stringify(base.render.cachedAssets.sort()), `cache ${end.render.cachedAssets}`);
});
await ctx.close();

await step("integrity: a tampered asset is rejected before parsing and never rendered", async () => {
  const lab = await openLab("", async (p) => {
    await p.route("**/models/fork/fork-demo-carbon-disc/**", async (route) => {
      const res = await route.fetch();
      const body = Buffer.from(await res.body());
      body[body.length - 8] ^= 0xff;
      await route.fulfill({ response: res, body });
    });
  }, { waitSettle: false });
  const p = lab.page;
  await p.waitForFunction(() => window.__veloxLab?.render?.report?.integrityFailures?.length > 0, null, { timeout: 20000 });
  const s = await state(p);
  assert(s.render.rendered.fork === undefined, "tampered fork rendered");
  assert(s.render.report.integrityFailures[0].includes("SHA-256 mismatch"), s.render.report.integrityFailures[0]);
  await lab.ctx.close();
});

await step("CSP without WebAssembly (older Safari model): JS decoder, same geometry, PNG textures", async () => {
  const lab = await openLab("?csp=no-wasm&ktx2=1");
  const s = await state(lab.page);
  assert(s.render.report.decoder === "js-reference", `decoder ${s.render.report.decoder}`);
  assert(s.render.report.fingerprintMatches >= 2 && s.render.report.fingerprintMismatches.length === 0, "decoded geometry differs under the JS decoder");
  assert(Object.values(s.render.report.textures).every((t) => t === "png-fallback"), JSON.stringify(s.render.report.textures));
  assert(s.cspViolations.every((v) => v.startsWith("script-src") && v.includes("wasm")), `unexpected violations: ${s.cspViolations}`);
  assert(s.nodes.every((n) => s.render.rendered[n.id] === n.sig), "not all nodes rendered");
  await lab.ctx.close();
});

await step("KTX2 opt-in documents the transcoder finding: blocked by CSP (needs 'unsafe-eval'), falls back to PNG, no 'unsafe-eval' granted", async () => {
  const lab = await openLab("?ktx2=1");
  await lab.page.waitForFunction(() => Object.keys(window.__veloxLab?.render?.report?.textures ?? {}).length > 0, null, { timeout: 20000 });
  const s = await state(lab.page);
  const tex = Object.values(s.render.report.textures);
  const csp = await lab.page.evaluate(async () => (await fetch(location.href)).headers.get("content-security-policy"));
  const tokens = (/script-src ([^;]*)/.exec(csp)?.[1] ?? "").split(" ");
  assert(!tokens.includes("'unsafe-eval'"), "unsafe-eval was granted");
  if (tex[0] === "ktx2") console.log("  note: KTX2 transcoded in this engine without 'unsafe-eval'");
  else assert(tex[0] === "png-fallback", `texture ${tex[0]}`);
  assert(s.nodes.every((n) => s.render.rendered[n.id] === n.sig), "scene did not finish after KTX2 failure");
  await lab.ctx.close();
});

if (process.env.E2E_SUPABASE === "1") {
  await step("assets served from the public Supabase bucket pass the same integrity and fingerprint checks", async () => {
    const lab = await openLab("?source=supabase");
    const s = await state(lab.page);
    assert(s.source === "supabase", "wrong source");
    assert(s.render.report.integrityChecks >= 2 && s.render.report.integrityFailures.length === 0, "integrity");
    assert(s.render.report.fingerprintMatches >= 2, "fingerprints");
    assert(s.cspViolations.length === 0, `CSP violations: ${s.cspViolations}`);
    await lab.ctx.close();
  });
}

const relevant = errors.filter((e) => !/WebGL|THREE\./.test(e));
if (relevant.length) console.log("page errors:", relevant.slice(0, 5));
await browser.close();
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} lab checks passed (${ENGINE}${DEVICE ? `, ${DEVICE}` : ""})`);
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
