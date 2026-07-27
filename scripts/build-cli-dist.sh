#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
DIST_DIR="${ROOT_DIR}/dist/releases"
WORK_DIR="${ROOT_DIR}/dist/mogcia-cli"

rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}/bin" "${WORK_DIR}/packages/cli/dist" "${DIST_DIR}"

npm run desktop-sdk:build
npm run cli:build

cp -R "${ROOT_DIR}/packages/cli/dist/." "${WORK_DIR}/packages/cli/dist/"
cp "${ROOT_DIR}/packages/cli/README.md" "${WORK_DIR}/README.md"

cat > "${WORK_DIR}/bin/mogcia" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
exec node "${ROOT_DIR}/packages/cli/dist/cli/src/index.js" "$@"
EOF

chmod +x "${WORK_DIR}/bin/mogcia"

cd "${ROOT_DIR}/dist"
rm -f "${DIST_DIR}/mogcia-cli-${VERSION}-macos.zip"
zip -qr "${DIST_DIR}/mogcia-cli-${VERSION}-macos.zip" "mogcia-cli"

echo "Created ${DIST_DIR}/mogcia-cli-${VERSION}-macos.zip"
