#!/bin/bash
set -euo pipefail

BASE_URL="https://mogcia-dev-agent.vercel.app"
KEYCHAIN_SERVICE="mogcia-desktop-token"
KEYCHAIN_ACCOUNT="default"
APP_ID="app.mogcia.desktop"
COMMAND="${1:-help}"

case "$COMMAND" in
  setup|login)
    echo "MOGCIA Desktop 初回設定"
    echo "社員アカウントでログインする画面を開きます。"
    PAIR_DIR="$(/usr/bin/mktemp -d /private/tmp/mogcia-pair.XXXXXX)"
    trap '/bin/rm -rf "$PAIR_DIR"' EXIT
    MACHINE_NAME="$(/usr/sbin/scutil --get ComputerName 2>/dev/null || /bin/hostname)"
    /usr/bin/curl -fsS -X POST -H 'Content-Type: application/json' -d "{\"machineName\":\"$MACHINE_NAME\"}" "$BASE_URL/api/desktop/pairing/start" -o "$PAIR_DIR/start.json"
    PAIRING_ID="$(/usr/bin/plutil -extract data.pairingId raw -o - "$PAIR_DIR/start.json")"
    PAIRING_SECRET="$(/usr/bin/plutil -extract data.secret raw -o - "$PAIR_DIR/start.json")"
    CONNECT_URL="$(/usr/bin/plutil -extract data.connectURL raw -o - "$PAIR_DIR/start.json")"
    /usr/bin/open "$CONNECT_URL"
    echo "ブラウザでログインし、『苗字を連携』を押してください。"
    echo "連携完了を待っています…"
    TOKEN=""
    FAMILY_NAME=""
    for _ in {1..150}; do
      HTTP_CODE="$(/usr/bin/curl -sS -o "$PAIR_DIR/claim.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "{\"pairingId\":\"$PAIRING_ID\",\"secret\":\"$PAIRING_SECRET\"}" "$BASE_URL/api/desktop/pairing/claim")"
      if [[ "$HTTP_CODE" == "200" ]]; then
        TOKEN="$(/usr/bin/plutil -extract data.token raw -o - "$PAIR_DIR/claim.json")"
        FAMILY_NAME="$(/usr/bin/plutil -extract data.familyName raw -o - "$PAIR_DIR/claim.json")"
        break
      fi
      if [[ "$HTTP_CODE" != "202" ]]; then echo "連携に失敗しました。mogcia setupをもう一度実行してください。" >&2; exit 1; fi
      /bin/sleep 2
    done
    if [[ -z "$TOKEN" ]]; then echo "連携がタイムアウトしました。mogcia setupをもう一度実行してください。" >&2; exit 1; fi
    /usr/bin/security add-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w "$TOKEN" -U >/dev/null
    /usr/bin/defaults write "$APP_ID" mogcia.baseUrl "$BASE_URL"
    HTTP_CODE="$(/usr/bin/curl -sS -o /tmp/mogcia-verify.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/desktop/auth/verify")"
    if [[ "$HTTP_CODE" != "200" ]]; then
      /usr/bin/security delete-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" >/dev/null 2>&1 || true
      echo "認証できませんでした。トークンを確認してください。" >&2
      exit 1
    fi
    echo "${FAMILY_NAME}として連携しました。MOGCIAを起動します。"
    /usr/bin/pkill -x MOGCIADesktop >/dev/null 2>&1 || true
    /bin/sleep 1
    /usr/bin/open -na /Applications/MOGCIA.app
    ;;
  status)
    if TOKEN="$(/usr/bin/security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w 2>/dev/null)"; then
      HTTP_CODE="$(/usr/bin/curl -sS -o /tmp/mogcia-status.json -w '%{http_code}' -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/desktop/auth/verify")"
      [[ "$HTTP_CODE" == "200" ]] && echo "MOGCIA Desktop: 接続済み" || { echo "MOGCIA Desktop: 再設定が必要です"; exit 1; }
    else
      echo "MOGCIA Desktop: 未設定（mogcia setup を実行してください）"
      exit 1
    fi
    ;;
  logout)
    /usr/bin/security delete-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" >/dev/null 2>&1 || true
    /usr/bin/pkill -x MOGCIADesktop >/dev/null 2>&1 || true
    echo "MOGCIA Desktopからログアウトしました。"
    ;;
  open)
    /usr/bin/defaults write "$APP_ID" mogcia.baseUrl "$BASE_URL"
    /usr/bin/pkill -x MOGCIADesktop >/dev/null 2>&1 || true
    /bin/sleep 1
    /usr/bin/open -na /Applications/MOGCIA.app
    ;;
  help|-h|--help)
    echo "使い方:"
    echo "  mogcia setup   初回設定"
    echo "  mogcia status  接続確認"
    echo "  mogcia open    MOGCIAを開く"
    echo "  mogcia logout  ログアウト"
    ;;
  *)
    echo "不明なコマンドです: $COMMAND" >&2
    echo "mogcia help で使い方を確認できます。" >&2
    exit 1
    ;;
esac
