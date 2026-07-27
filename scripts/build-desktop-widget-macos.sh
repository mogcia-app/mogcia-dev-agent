#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/apps/desktop-widget/package.json').version")"
DIST_DIR="${ROOT_DIR}/dist/releases"
APP_DIR="${ROOT_DIR}/dist/MOGCIA Desktop Widget.app"
ELECTRON_APP="${ROOT_DIR}/apps/desktop-widget/node_modules/electron/dist/Electron.app"
APP_RESOURCE_DIR="${APP_DIR}/Contents/Resources/app"

if [[ ! -d "${ELECTRON_APP}" ]]; then
  echo "Electron binary is missing. Run: npm --prefix apps/desktop-widget install" >&2
  exit 1
fi

rm -rf "${APP_DIR}"
mkdir -p "${DIST_DIR}"
cp -R "${ELECTRON_APP}" "${APP_DIR}"
rm -rf "${APP_RESOURCE_DIR}"
mkdir -p "${APP_RESOURCE_DIR}"

cp "${ROOT_DIR}/apps/desktop-widget/package.json" "${APP_RESOURCE_DIR}/package.json"
cp "${ROOT_DIR}/apps/desktop-widget/main.js" "${APP_RESOURCE_DIR}/main.js"
cp "${ROOT_DIR}/apps/desktop-widget/preload.js" "${APP_RESOURCE_DIR}/preload.js"
cp -R "${ROOT_DIR}/apps/desktop-widget/renderer" "${APP_RESOURCE_DIR}/renderer"
cp -R "${ROOT_DIR}/apps/desktop-widget/node_modules" "${APP_RESOURCE_DIR}/node_modules"

/usr/libexec/PlistBuddy -c "Set :CFBundleName MOGCIA Desktop Widget" "${APP_DIR}/Contents/Info.plist" >/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName MOGCIA Desktop Widget" "${APP_DIR}/Contents/Info.plist" >/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.mogcia.desktop-widget" "${APP_DIR}/Contents/Info.plist" >/dev/null
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable Electron" "${APP_DIR}/Contents/Info.plist" >/dev/null

rm -f "${DIST_DIR}/mogcia-desktop-widget-${VERSION}-macos.zip"
cd "${ROOT_DIR}/dist"
ditto -c -k --sequesterRsrc --keepParent "MOGCIA Desktop Widget.app" "${DIST_DIR}/mogcia-desktop-widget-${VERSION}-macos.zip"

echo "Created ${DIST_DIR}/mogcia-desktop-widget-${VERSION}-macos.zip"
