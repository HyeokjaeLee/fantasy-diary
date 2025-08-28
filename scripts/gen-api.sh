#!/usr/bin/env bash
set -euo pipefail

# Load local env if present (Next.js style)
if [ -f ".env.local" ]; then
  set +u
  set -a
  # shellcheck source=/dev/null
  . ".env.local"
  set +a
  set -u
fi

# Paths
OUT_DIR="__generated__/supabase"
OPENAPI_JSON="$OUT_DIR/openapi.json"
CLIENT_OUT="$OUT_DIR/hey"

# Env checks
: "${NEXT_PUBLIC_SUPABASE_URL:?ERROR: NEXT_PUBLIC_SUPABASE_URL is not set}"
: "${NEXT_PUBLIC_SUPABASE_ANON_KEY:?ERROR: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set}"

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL%/}"
ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY"

mkdir -p "$OUT_DIR" "$CLIENT_OUT"

# 1) Fetch OpenAPI schema from PostgREST
curl -sS "${SUPABASE_URL}/rest/v1/" \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${ANON_KEY}" \
  -H "Accept: application/openapi+json" \
  -o "$OPENAPI_JSON"

echo "Saved OpenAPI schema to $OPENAPI_JSON"

# 2) Clean previous output
rm -rf "$CLIENT_OUT"/* || true

# 3) Generate typed client via Hey API (fetch client)
# Requires: devDependency @hey-api/openapi-ts
bun openapi-ts

echo "Hey API client generated at $CLIENT_OUT"
