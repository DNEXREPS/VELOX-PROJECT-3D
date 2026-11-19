/**
 * Fail-closed guard for the database suites. `npm run test:db` exists only to run
 * them, so a missing DATABASE_URL is a configuration error, never a reason to skip
 * (a skipped suite reports green and hides broken RLS).
 */
export function requireDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The database security suites refuse to skip silently.\n" +
        "Start a throwaway database with `npm run db:local` (or `npx supabase start`) and pass its URL:\n" +
        "  DATABASE_URL=postgresql://… npm run test:db",
    );
  }
  if (!/^postgres(ql)?:\/\//.test(url)) throw new Error("DATABASE_URL must be a postgres:// or postgresql:// URL.");
  return url;
}
