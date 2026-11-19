/**
 * Record SHA-256 checksums of new migrations in supabase/migration-checksums.json.
 * Existing entries are never rewritten: applied migrations are immutable. Change the
 * schema with a NEW migration instead. `tests/unit/security-guards.test.ts` verifies
 * every migration against this file.
 *   npm run db:checksums
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..", "supabase", "migrations");
const file = join(__dirname, "..", "supabase", "migration-checksums.json");
const current: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
let added = 0;
for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (current[name]) continue;
  current[name] = createHash("sha256").update(readFileSync(join(dir, name))).digest("hex");
  added++;
  console.log(`recorded ${name}`);
}
writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`);
console.log(added ? `${added} migration(s) recorded.` : "No new migrations.");
