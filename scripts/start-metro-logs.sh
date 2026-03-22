#!/usr/bin/env bash
# Stop old Metro, then start with cache clear. Logs → terminal AND ./metro.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "$ROOT/scripts/stop-metro.sh"

echo "=== Metro starting (terminal + metro.log) ==="
exec npm run start:tee
