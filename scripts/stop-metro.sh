#!/usr/bin/env bash
# Stop Metro/Expo for this repo only (does not kill other Node apps).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pkill -f "${ROOT}/node_modules/.bin/expo" 2>/dev/null || true
pkill -f "npm run generate:bundled-env && NODE_ENV=development expo start" 2>/dev/null || true

for p in 8081 8082 8083 19000 19001 19002; do
  for pid in $(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true); do
    kill -9 "$pid" 2>/dev/null || true
  done
done

echo "Metro/Expo for Guru stopped (ports 8081–8083, 19000–19002 cleared)."
exit 0
