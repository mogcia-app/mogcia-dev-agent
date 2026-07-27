# MOGCIA Desktop / CLI Distribution

営業PCへCLIとデスクトップウィジェットを配布するための手順です。

## 配布zipを作成

```bash
npm run dist:tools
```

生成先:

```text
dist/releases/
  install-mogcia-tools.sh
  mogcia-cli-0.1.0-macos.zip
  mogcia-desktop-widget-0.1.0-macos.zip
```

## 配布先にアップロード

`dist/releases/` の3ファイルを同じディレクトリにアップロードします。

例:

```text
https://example.com/mogcia/install-mogcia-tools.sh
https://example.com/mogcia/mogcia-cli-0.1.0-macos.zip
https://example.com/mogcia/mogcia-desktop-widget-0.1.0-macos.zip
```

## 営業PCで一発インストール

```bash
curl -fsSL https://example.com/mogcia/install-mogcia-tools.sh | bash -s -- https://example.com/mogcia 0.1.0
```

インストール先:

- CLI: `~/.local/bin/mogcia`
- CLI本体: `~/.mogcia/mogcia-cli`
- Widget: `~/Applications/MOGCIA Desktop Widget.app`

## 初回設定

1. MOGCIA Webの `/settings/desktop` を開く
2. 「新しい端末を追加」でトークンを発行する
3. 営業PCで `mogcia login`
4. `~/Applications/MOGCIA Desktop Widget.app` を開く
5. MOGCIA URLとトークンを登録する

## 補足

`mogcia` コマンドが見つからない場合:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

zshなら `~/.zshrc` に追記します。
