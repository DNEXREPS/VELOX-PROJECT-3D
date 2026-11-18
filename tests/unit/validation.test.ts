import { describe, expect, it } from "vitest";
import { applyConfigurationSchema, bicycleSchema, loginSchema, maintenanceSchema, registerSchema, slugify, profileSchema, componentQuerySchema, reportSchema } from "@/lib/validation/schemas";
import { isAuthPage, isProtectedPath, safeRedirectPath } from "@/lib/auth/routes";
import { detectImageType, validateImageFile } from "@/lib/uploads";
import { sanitizeSearch, pageRange } from "@/lib/postgrest";
import { fromDbError, fromZodError } from "@/lib/action-result";

describe("authentication validation", () => {
  it("validates registration input", () => {
    const ok = registerSchema.safeParse({ email: " Rider@Example.com ", username: "Fast_Rider", password: "correcthorse9", confirmPassword: "correcthorse9" });
    expect(ok.success && ok.data).toMatchObject({ email: "rider@example.com", username: "fast_rider" });
    expect(registerSchema.safeParse({ email: "x@y.z", username: "ab", password: "short1", confirmPassword: "short1" }).success).toBe(false);
    const mismatch = registerSchema.safeParse({ email: "x@y.co", username: "rider", password: "longenough1", confirmPassword: "longenough2" });
    expect(mismatch.success).toBe(false);
    expect(fromZodError(mismatch.error!).fieldErrors?.confirmPassword).toBeDefined();
  });

  it("requires letters and digits in passwords", () => {
    expect(registerSchema.safeParse({ email: "a@b.co", username: "rider", password: "onlyletterss", confirmPassword: "onlyletterss" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.co", username: "rider", password: "1234567890", confirmPassword: "1234567890" }).success).toBe(false);
  });

  it("validates login input", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("protects authenticated routes and guards auth pages", () => {
    expect(isProtectedPath("/garage")).toBe(true);
    expect(isProtectedPath("/garage/abc/studio")).toBe(true);
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/garagex")).toBe(false);
    expect(isProtectedPath("/explore")).toBe(false);
    expect(isProtectedPath("/bike/alice/road")).toBe(false);
    expect(isAuthPage("/login")).toBe(true);
  });

  it("only allows same-origin relative redirects", () => {
    expect(safeRedirectPath("/garage/1?x=2")).toBe("/garage/1?x=2");
    expect(safeRedirectPath("//evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("https://evil.com")).toBe("/dashboard");
    expect(safeRedirectPath("/\\evil.com")).toBe("/dashboard");
    expect(safeRedirectPath(null)).toBe("/dashboard");
  });
});

describe("bicycle & profile validation", () => {
  it("coerces form strings and treats empty strings as missing", () => {
    const r = bicycleSchema.parse({ name: " Tarmac ", category: "road", model_year: "2024", weight_kg: "", estimated_value: "3200.5", visibility: "public", is_primary: "on", purchase_date: "" });
    expect(r).toMatchObject({ name: "Tarmac", model_year: 2024, estimated_value: 3200.5, is_primary: true, visibility: "public" });
    expect(r.weight_kg).toBeUndefined();
    expect(r.purchase_date).toBeUndefined();
  });

  it("rejects invalid bicycle values", () => {
    expect(bicycleSchema.safeParse({ name: "", category: "road" }).success).toBe(false);
    expect(bicycleSchema.safeParse({ name: "x", category: "spaceship" }).success).toBe(false);
    expect(bicycleSchema.safeParse({ name: "x", category: "road", model_year: "1700" }).success).toBe(false);
    expect(bicycleSchema.safeParse({ name: "x", category: "road", color_hex: "red" }).success).toBe(false);
    expect(bicycleSchema.safeParse({ name: "x", category: "road", purchase_date: "2999-01-01" }).success).toBe(false);
  });

  it("slugifies names safely", () => {
    expect(slugify("Ålpine Gravel — 2024!")).toBe("alpine-gravel-2024");
    expect(slugify("!!!")).toBe("bike");
  });

  it("validates profile website protocol", () => {
    expect(profileSchema.safeParse({ username: "rider", website_url: "javascript:alert(1)" }).success).toBe(false);
    expect(profileSchema.safeParse({ username: "rider", website_url: "https://velox.bike" }).success).toBe(true);
  });
});

describe("configuration & maintenance validation", () => {
  const id = "3f2a8d1e-1b2c-4d5e-8f9a-0b1c2d3e4f5a";
  it("requires a component or custom name unless removing", () => {
    expect(applyConfigurationSchema.safeParse({ bicycleId: id, changes: [{ slot: "chain" }] }).success).toBe(false);
    expect(applyConfigurationSchema.safeParse({ bicycleId: id, changes: [{ slot: "chain", remove: true }] }).success).toBe(true);
    expect(applyConfigurationSchema.safeParse({ bicycleId: id, changes: [{ slot: "chain", custom_name: "KMC" }] }).success).toBe(true);
    expect(applyConfigurationSchema.safeParse({ bicycleId: id, changes: [] }).success).toBe(false);
    expect(applyConfigurationSchema.safeParse({ bicycleId: id, changes: [{ slot: "wings", remove: true }] }).success).toBe(false);
  });

  it("validates maintenance dates, currency and distances", () => {
    const base = { maintenance_type: "repair", title: "Fix", performed_on: "2026-01-10" };
    expect(maintenanceSchema.safeParse(base).success).toBe(true);
    expect(maintenanceSchema.safeParse({ ...base, cost: "20" }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ ...base, cost: "20", currency: "EUR" }).success).toBe(true);
    expect(maintenanceSchema.safeParse({ ...base, next_due_on: "2026-01-01" }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ ...base, distance_km: "500", next_due_distance_km: "400" }).success).toBe(false);
    expect(maintenanceSchema.safeParse({ ...base, performed_on: "2999-01-01" }).success).toBe(false);
  });

  it("falls back to safe defaults for catalogue query params", () => {
    expect(componentQuerySchema.parse({ sort: "drop table", page: "-3" })).toMatchObject({ sort: "name", page: 1 });
    expect(reportSchema.safeParse({ target_type: "post", target_id: id, reason: "spam" }).success).toBe(true);
  });
});

describe("upload validation", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  const svg = new TextEncoder().encode("<svg onload=alert(1)>");

  it("detects types from magic bytes, not names", () => {
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(jpg)).toBe("image/jpeg");
    expect(detectImageType(webp)).toBe("image/webp");
    expect(detectImageType(svg)).toBeNull();
  });

  it("enforces size and content", async () => {
    expect((await validateImageFile(new Blob([png], { type: "image/png" }), 1024)).ok).toBe(true);
    expect((await validateImageFile(new Blob([svg], { type: "image/png" }), 1024)).ok).toBe(false);
    expect((await validateImageFile(new Blob([new Uint8Array(2048)]), 1024)).ok).toBe(false);
    expect((await validateImageFile("not a file", 1024)).ok).toBe(false);
  });
});

describe("query helpers", () => {
  it("strips PostgREST filter syntax from search input", () => {
    expect(sanitizeSearch("cassette,name.eq.x)")).toBe("cassette name.eq.x");
    expect(sanitizeSearch("%_*")).toBeNull();
    expect(sanitizeSearch("")).toBeNull();
    expect(pageRange(3, 10)).toEqual([20, 29]);
  });

  it("maps database errors to safe messages", () => {
    expect(fromDbError({ code: "42501", message: "permission denied for table bicycles" })).toEqual({ ok: false, error: "You do not have permission to do that." });
    expect(fromDbError({ code: "XX000", message: "internal detail" })).toEqual({ ok: false, error: "Something went wrong." });
  });
});
