#!/bin/bash
# build-release.sh — Build arm64-v8a release APK and upload to Google Drive via rclone
# Usage: bash scripts/build-release.sh [version] [versionCode]
#   e.g.: bash scripts/build-release.sh 1.4 14

set -euo pipefail

VERSION="${1:-1.4}"
VERSION_CODE="${2:-14}"
APK_NAME="Guru-v${VERSION}-arm64.apk"
GDRIVE_DEST="Gdrive:builds/"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GRADLE_FILE="$PROJECT_ROOT/android/app/build.gradle"
APK_OUTPUT="$PROJECT_ROOT/android/app/build/outputs/apk/release/app-release.apk"

echo "========================================"
echo "  Guru Release Build v${VERSION} (${VERSION_CODE})"
echo "  ABI: arm64-v8a only"
echo "========================================"

# --- Step 1: Patch version in build.gradle ---
echo "[1/5] Setting version to ${VERSION} (code: ${VERSION_CODE})..."
sed -i "s/versionCode [0-9]*/versionCode ${VERSION_CODE}/" "$GRADLE_FILE"
sed -i "s/versionName \"[^\"]*\"/versionName \"${VERSION}\"/" "$GRADLE_FILE"

# --- Step 2: Export JS bundle (Expo) ---
echo "[2/5] Exporting JS bundle..."
cd "$PROJECT_ROOT"
npx expo export:embed \
  --platform android \
  --entry-file node_modules/expo-router/entry.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res/ 2>/dev/null || true

# --- Step 3: Build release APK (arm64-v8a only) ---
echo "[3/5] Building release APK (arm64-v8a)..."
cd "$PROJECT_ROOT/android"

# Filter to arm64-v8a only via gradle property
./gradlew assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  --build-cache \
  --warning-mode=none \
  -q

if [ ! -f "$APK_OUTPUT" ]; then
  echo "ERROR: APK not found at $APK_OUTPUT"
  echo "Checking for APK in other locations..."
  find "$PROJECT_ROOT/android/app/build/outputs" -name "*.apk" 2>/dev/null
  exit 1
fi

APK_SIZE=$(du -h "$APK_OUTPUT" | cut -f1)
echo "    APK built: $APK_SIZE"

# --- Step 4: Upload to Google Drive ---
echo "[4/5] Uploading ${APK_NAME} to ${GDRIVE_DEST}..."
rclone copyto "$APK_OUTPUT" "${GDRIVE_DEST}${APK_NAME}" --progress

# --- Step 5: Verify upload ---
echo "[5/5] Verifying upload..."
REMOTE_SIZE=$(rclone size "${GDRIVE_DEST}${APK_NAME}" 2>/dev/null | grep "Total size" || echo "unknown")
echo "    Remote: ${REMOTE_SIZE}"

echo ""
echo "========================================"
echo "  Done! ${APK_NAME} uploaded to Google Drive"
echo "  Local:  ${APK_OUTPUT}"
echo "  Remote: ${GDRIVE_DEST}${APK_NAME}"
echo "========================================"
