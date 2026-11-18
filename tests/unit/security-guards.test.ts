/**
 * Static guards over the source tree. They fail the build when a change would quietly
 * remove a security property, e.g. a new server action without an authentication check,
 * the service-role key reaching browser code, or a destructive migration.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const p = join(dir, name);
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
  return out;
}

const sourceFiles = walk("src");

describe("server actions", () => {
  const actionFiles = readdirSync(join(ROOT, "src/server/actions")).map((f) => `src/server/actions/${f}`);
  // Auth actions establish the session themselves (sign in / sign up / reset).
  const PUBLIC_ACTIONS = new Set(["signIn", "signUp", "signOut", "requestPasswordReset", "updatePassword"]);

  it("every exported action authenticates the caller via the server session", () => {
    const missing: string[] = [];
    for (const file of actionFiles) {
      const src = read(file);
      expect(src.startsWith('"use server"'), `${file} must start with "use server"`).toBe(true);
      const parts = src.split(/^export async function /m).slice(1);
      for (const part of parts) {
        const name = part.slice(0, part.indexOf("("));
        if (PUBLIC_ACTIONS.has(name)) continue;
        if (!/\b(getSession|requireSession|moderatorSession)\(/.test(part)) missing.push(`${file}:${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("never trust a user id supplied by the client", () => {
    for (const file of actionFiles) {
      const src = read(file);
      expect(src, file).not.toMatch(/formData\.get\(["'](user_?id|owner_?id|author_?id|reporter_?id)["']\)/i);
      expect(src, file).not.toMatch(/input\.(userId|ownerId|authorId)/);
    }
  });
});

describe("service-role key", () => {
  it("is only referenced by the server-only admin client and CLI scripts", () => {
    const users = sourceFiles.filter((f) => /process\.env(\.SUPABASE_SERVICE_ROLE_KEY|\[["']SUPABASE_SERVICE_ROLE_KEY)/.test(read(f))).map((f) => relative(ROOT, join(ROOT, f)));
    expect(users).toEqual(["src/server/supabase-admin.ts"]);
    expect(read("src/server/supabase-admin.ts")).toMatch(/^import "server-only";/);
  });

  it("the admin client is only imported by the scheduled cleanup route", () => {
    const importers = sourceFiles.filter((f) => /from ["']@\/server\/supabase-admin["']/.test(read(f)));
    expect(importers).toEqual(["src/app/api/cron/storage-cleanup/route.ts"]);
  });

  it("is never exposed through a NEXT_PUBLIC_ variable", () => {
    for (const f of [...sourceFiles, ".env.example"]) expect(read(f), f).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET)/);
  });

  it("client components never import server-only modules (server actions are the only bridge)", () => {
    const offenders = sourceFiles.filter((f) => {
      const src = read(f);
      return /^["']use client["']/.test(src) && /from ["']@\/server\/(?!actions\/)/.test(src.replace(/import type [^;]+;/g, ""));
    });
    expect(offenders).toEqual([]);
  });
});

describe("migrations", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  const strip = (sql: string) => sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("are additive: no dropped tables/columns/schemas, truncations or unbounded deletes", () => {
    const destructive = [
      /\bdrop\s+(table|schema|database|column|view|materialized\s+view|type|extension|sequence)\b/i,
      /\balter\s+table\b[^;]*\bdrop\s+(?!constraint\b|default\b|not\s+null\b)/i,
      /\btruncate\b/i,
      /\bdelete\s+from\s+[\w."]+\s*;/i,
    ];
    const hits: string[] = [];
    for (const f of files) {
      const sql = strip(read(`supabase/migrations/${f}`));
      for (const re of destructive) if (re.test(sql)) hits.push(`${f}: ${re}`);
    }
    expect(hits).toEqual([]);
  });

  it("use monotonically increasing, unique timestamps", () => {
    const versions = files.map((f) => f.split("_")[0]);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort()).toEqual(versions);
  });

  it("enable RLS on every table they create in the public schema", () => {
    const all = files.map((f) => strip(read(`supabase/migrations/${f}`))).join("\n");
    const tables = [...all.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]);
    const missing = tables.filter((t) => !new RegExp(`alter table public\\.${t} enable row level security`, "i").test(all));
    expect(tables.length).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });
});
