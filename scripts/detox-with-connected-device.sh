#!/usr/bin/env bash
# Resolves DETOX_ADB_NAME from `adb devices` so Detox can attach without manual serials.
# Prefers Genymotion; if several Genymotion devices are connected, prefers a tablet
# (model/product line contains "tablet", case-insensitive — matches custom tablet VMs).
set -euo pipefail

if [[ -n "${DETOX_ADB_NAME:-}" ]]; then
  echo "[detox] Using preset DETOX_ADB_NAME=$DETOX_ADB_NAME" >&2
  exec "$@"
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "adb not found. Install Android platform-tools or set ANDROID_HOME." >&2
  exit 1
fi

pick_device() {
  local long
  long=$(adb devices -l 2>/dev/null || true)

  # All Genymotion serials (device:genymotion in long listing)
  local gm_lines
  gm_lines=$(echo "$long" | grep 'device:genymotion' | grep ' device ' || true)
  local gm_count
  gm_count=$(echo "$gm_lines" | sed '/^$/d' | wc -l | tr -d ' ')

  if [[ "${gm_count:-0}" -gt 1 ]]; then
    # Prefer tablet-shaped Genymotion when multiple (e.g. phone + custom tablet VM)
    local tab
    tab=$(echo "$gm_lines" | grep -iE 'model:.*[Tt]ablet|product:.*[Tt]ablet' | awk '$2=="device"{print $1; exit}')
    if [[ -n "${tab:-}" ]]; then
      echo "$tab"
      return
    fi
  fi

  # Single (or first) Genymotion — includes custom tablet as only device
  local g
  g=$(echo "$long" | awk '/device:genymotion/ && $2=="device" { print $1; exit }')
  if [[ -n "${g:-}" ]]; then
    echo "$g"
    return
  fi

  # Fallback: first device in "device" state
  adb devices 2>/dev/null | awk 'NR>1 && $2=="device" { print $1; exit }'
}

SERIAL=$(pick_device)
if [[ -z "${SERIAL:-}" ]]; then
  echo "No usable Android device in 'adb devices'. Start Genymotion (or connect a device), then retry." >&2
  exit 1
fi

export DETOX_ADB_NAME="$SERIAL"
echo "[detox] Using adb device: $DETOX_ADB_NAME" >&2
exec "$@"
