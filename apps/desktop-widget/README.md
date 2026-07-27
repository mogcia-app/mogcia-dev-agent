# MOGCIA Desktop Widget

Xcodeなしで使える、MOGCIAの常設デスクトップウィジェットです。

## 起動

```bash
npm run desktop-widget:start
```

本番URLを指定する場合:

```bash
MOGCIA_DESKTOP_BASE_URL=https://your-mogcia-url.example.com npm run desktop-widget:start
```

## 初回設定

1. Web側で `/settings/desktop` を開く
2. 「新しい端末を追加」でトークンを発行する
3. ウィジェットの「MOGCIA URL」と「アクセストークン」に入力する
4. 「保存して接続」を押す

## できること

- 今日のタスク確認
- 会社検索
- メモのAI整理
- 活動ログ/タスク/会社メモへの登録
- 常に前面表示
- Macログイン時の自動起動

## 補足

トークンはElectronの `safeStorage` が使える環境では暗号化して保存します。
トークンを再発行したい場合は、Web側で端末を無効化してから新しい端末を追加してください。
