#!/bin/sh
# Writes the public runtime config (no secrets!) consumed by the app at startup.
set -eu
if [ -z "${AIRTABLE_API_KEY:-}" ]; then
  echo "oreas: WARNING – AIRTABLE_API_KEY is not set; the Airtable proxy will be rejected." >&2
fi
esc() { printf '%s' "$1" | sed 's/[\\"]/\\&/g'; }
cat > /usr/share/nginx/html/config.json <<JSON
{"mode":"proxy","baseId":"$(esc "${AIRTABLE_BASE_ID:-}")"}
JSON
echo "oreas: wrote config.json (base ${AIRTABLE_BASE_ID:-<unset>})"
