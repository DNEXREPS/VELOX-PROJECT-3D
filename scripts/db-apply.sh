#!/usr/bin/env bash
# Apply the Supabase shim, all migrations and the seed to a vanilla Postgres database.
#   scripts/db-apply.sh postgresql://user:pass@host:port/db
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="${1:?database url required}"
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/supabase-shim.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null || { echo "Migration failed: $f" >&2; exit 1; }
done
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/seed.sql" >/dev/null
