#!/usr/bin/env bash
set -euo pipefail

APP_NAME="MOGCIA Desktop Widget.app"
INSTALL_ROOT="${MOGCIA_INSTALL_ROOT:-${HOME}/.mogcia}"
BIN_DIR="${MOGCIA_BIN_DIR:-${HOME}/.local/bin}"
APP_DIR="${MOGCIA_APP_DIR:-${HOME}/Applications}"
BASE_URL="${MOGCIA_RELEASE_BASE_URL:-${1:-}}"
VERSION="${MOGCIA_VERSION:-${2:-0.1.0}}"

if [[ -z "${BASE_URL}" ]]; then
  echo "MOGCIA_RELEASE_BASE_URL is required." >&2
  echo "Example:" >&2
  echo "  curl -fsSL https://example.com/mogcia/install-mogcia-tools.sh | bash -s -- https://example.com/mogcia 0.1.0" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

CLI_ZIP="mogcia-cli-${VERSION}-macos.zip"
WIDGET_ZIP="mogcia-desktop-widget-${VERSION}-macos.zip"

echo "Installing MOGCIA tools ${VERSION}"
mkdir -p "${INSTALL_ROOT}" "${BIN_DIR}" "${APP_DIR}"

curl -fL "${BASE_URL}/${CLI_ZIP}" -o "${TMP_DIR}/${CLI_ZIP}"
curl -fL "${BASE_URL}/${WIDGET_ZIP}" -o "${TMP_DIR}/${WIDGET_ZIP}"

unzip -q -o "${TMP_DIR}/${CLI_ZIP}" -d "${INSTALL_ROOT}"
cat > "${BIN_DIR}/mogcia" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec node "${INSTALL_ROOT}/mogcia-cli/packages/cli/dist/cli/src/index.js" "\$@"
EOF
chmod +x "${BIN_DIR}/mogcia"

unzip -q -o "${TMP_DIR}/${WIDGET_ZIP}" -d "${TMP_DIR}/widget"
rm -rf "${APP_DIR}/${APP_NAME}"
cp -R "${TMP_DIR}/widget/${APP_NAME}" "${APP_DIR}/${APP_NAME}"

echo ""
echo "Installed:"
echo "  CLI: ${BIN_DIR}/mogcia"
echo "  Widget: ${APP_DIR}/${APP_NAME}"
echo ""
echo "If mogcia is not found, add this to your shell profile:"
echo "  export PATH=\"${BIN_DIR}:\$PATH\""
echo ""
echo "Next:"
echo "  1. Open MOGCIA /settings/desktop and create a desktop token."
echo "  2. Run: mogcia login"
echo "  3. Open: ${APP_DIR}/${APP_NAME}"
