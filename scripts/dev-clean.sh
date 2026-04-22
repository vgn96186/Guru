#!/usr/bin/env bash
# Guru one-shot dev launcher.
# Kills stale Metro + adb, then rebuilds+installs+deeplinks into the app.
# Never shows Expo launcher page. Eliminates DebugServerException from stale state.
set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[dev-clean] killing stale Metro on 8081..."
npm run stop:metro >/dev/null 2>&1 || true

echo "[dev-clean] resetting adb server..."
adb kill-server >/dev/null 2>&1 || true
adb start-server >/dev/null 2>&1 || true

echo "[dev-clean] waiting for device..."
adb wait-for-device

echo "[dev-clean] launching (rebuild + reverse + Metro + deeplink)..."
exec npm run android
