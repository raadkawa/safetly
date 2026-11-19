#!/usr/bin/env bash
# Kjører supabase/schema.sql og RLS-testene mot en midlertidig lokal Postgres.
# Krever at Postgres-serverprogrammene (initdb, pg_ctl) og psql er installert.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
[ -n "$BIN" ] || BIN=$(dirname "$(command -v initdb)")
DIR=$(mktemp -d)
AS=()
if [ "$(id -u)" = 0 ]; then
  # Postgres nekter å kjøre som root; bruk postgres-brukeren for den midlertidige mappa.
  chown postgres "$DIR"
  AS=(runuser -u postgres --)
fi
cleanup() { "${AS[@]}" "$BIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${AS[@]}" "$BIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -p 54329 -c listen_addresses=''" -l "$DIR/log" start -w >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h "$DIR" -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
"${PSQL[@]}" -f "$ROOT/supabase/schema.sql"
"${PSQL[@]}" -f "$ROOT/supabase/schema.sql"   # skal kunne kjøres flere ganger
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql"
