/**
 * Validate deployment configuration without printing secret values.
 *   npm run env:check -- --target production [--file .env.production.local]
 * Exit code 1 when there are errors.
 */
import { readFileSync } from "node:fs";
import { checkEnv, type EnvTarget } from "../src/lib/env-check";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = (opt("target") ?? "production") as EnvTarget;
if (!["local", "preview", "production"].includes(target)) {
  console.error("--target must be local, preview or production");
  process.exit(2);
}

let env: Record<string, string | undefined> = { ...process.env };
const file = opt("file");
if (file) {
  env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "") || undefined;
  }
}

const issues = checkEnv(env, target);
for (const i of issues) console.log(`${i.level === "error" ? "✗" : "!"} ${i.variable}: ${i.message}`);
const errors = issues.filter((i) => i.level === "error").length;
console.log(errors ? `\n${errors} error(s) for target "${target}".` : `\nConfiguration OK for target "${target}"${issues.length ? " (with warnings)" : ""}.`);
process.exit(errors ? 1 : 0);
