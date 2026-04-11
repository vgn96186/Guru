#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v adb >/dev/null 2>&1; then
  echo "adb is not installed or not on PATH."
  exit 1
fi

if ! adb devices | awk 'NR > 1 && $2 == "device" { found = 1 } END { exit found ? 0 : 1 }'; then
  echo "No adb device detected. Connect a device and run: adb devices"
  exit 1
fi

adb reverse tcp:8081 tcp:8081 >/dev/null 2>&1 || true

# Always start Metro with a cleared cache so JS/UI changes are guaranteed
# to be picked up by the development client.
npx expo start --dev-client --localhost --port 8081 -c &
METRO_PID=$!

cleanup() {
  kill "$METRO_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in {1..45}; do
  if curl -fsS http://127.0.0.1:8081/status >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

adb shell am start \
  -n "com.anonymous.gurustudy.dev/com.anonymous.gurustudy.MainActivity" \
  -a android.intent.action.VIEW \
  -d "exp+guru-study-dev://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" \
  >/dev/null 2>&1 || true

wait "$METRO_PID"
