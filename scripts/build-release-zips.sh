#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT_DIR}/scripts/build-cli-dist.sh"
"${ROOT_DIR}/scripts/build-desktop-widget-macos.sh"
cp "${ROOT_DIR}/scripts/install-mogcia-tools.sh" "${ROOT_DIR}/dist/releases/install-mogcia-tools.sh"

echo "Release files are in ${ROOT_DIR}/dist/releases"
