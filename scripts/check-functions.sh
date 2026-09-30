#!/bin/sh
# Type-checks every Supabase edge function with Deno (uses a local deno, or runs it via npx).
set -e
DENO="deno"
command -v deno >/dev/null 2>&1 || DENO="npx -y deno"
for dir in supabase/functions/*/; do
  name=$(basename "$dir")
  [ "$name" = "_shared" ] && continue
  echo "deno check $name"
  (cd "$dir" && $DENO check --quiet index.ts)
done
