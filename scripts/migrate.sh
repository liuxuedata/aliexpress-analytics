#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL environment variable is required}"

for f in independent.sql ozon.sql meta.sql; do
  if [ -f "$f" ]; then
    psql "$SUPABASE_DB_URL" -f "$f"
  fi
done
