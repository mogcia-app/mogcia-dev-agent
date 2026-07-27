# MOGCIA CLI

ターミナルからMOGCIAを操作するためのCLIです。

## ビルド

```bash
npm run cli:build
```

## ローカル実行

```bash
npm run mogcia -- help
npm run mogcia -- status
npm run mogcia -- list
```

## 初回ログイン

Web側の `/settings/desktop` で端末トークンを発行してから実行します。

```bash
npm run mogcia -- login
```

入力するもの:

- MOGCIA Agent URL
- デスクトップアクセストークン

トークンはmacOS Keychainに保存します。

## よく使うコマンド

```bash
mogcia status
mogcia list
mogcia run memo
mogcia task add "提案資料を送付" --company "八女上陽" --due "tomorrow 18:00" --priority high
mogcia company search "八女上陽"
mogcia company log
mogcia preview home
mogcia doctor
```

## 営業PCへ配る時

最終的には、GitHub Releases / Cloud Storage などにCLI一式を置いて、以下のような一発インストールにできます。

```bash
curl -fsSL https://example.com/mogcia/install-cli.sh | bash
```

トークンはコマンドに含めず、インストール後に `mogcia login` で登録します。
