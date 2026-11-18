#!/usr/bin/env bash
# Spin up a throwaway PostgreSQL 16 cluster, apply the Supabase shim, all
# migrations and the seed. Prints the DATABASE_URL for the RLS test-suite.
#   scripts/db-local.sh start | stop
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="${VELOX_PGDATA:-$ROOT/.pgdata}"
PORT="${VELOX_PGPORT:-54329}"
URL="postgresql://postgres@127.0.0.1:$PORT/velox"

run_pg() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }

case "${1:-start}" in
  start)
    rm -rf "$DATA" && mkdir -p "$DATA"
    [ "$(id -u)" = "0" ] && chown postgres "$DATA"
    run_pg "$PGBIN/initdb -D '$DATA' -U postgres --auth=trust >/dev/null"
    run_pg "$PGBIN/pg_ctl -D '$DATA' -o '-p $PORT -k /tmp -c listen_addresses=127.0.0.1' -l '$DATA/log' start >/dev/null"
    for _ in $(seq 1 30); do pg_isready -h 127.0.0.1 -p "$PORT" >/dev/null 2>&1 && break; sleep 0.5; done
    psql -h 127.0.0.1 -p "$PORT" -U postgres -qc "create database velox" >/dev/null
    psql "$URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/supabase-shim.sql" >/dev/null
    for f in "$ROOT"/supabase/migrations/*.sql; do
      psql "$URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null || { echo "Migration failed: $f"; exit 1; }
    done
    psql "$URL" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/seed.sql" >/dev/null
    echo "$URL"
    ;;
  stop)
    run_pg "$PGBIN/pg_ctl -D '$DATA' stop -m fast" >/dev/null 2>&1 || true
    rm -rf "$DATA"
    ;;
esac
