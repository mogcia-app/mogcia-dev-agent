# 社内システム全体再設計 Phase 1 現状分析

調査日: 2026-09-23

## 技術構成

- Next.js 16 App Router / React 19 / TypeScript
- Firebase Authentication、Cloud Firestore、Firebase Storage
- 業務書き込みは `/api/business/*` の Route Handler を通し、Firebase Admin SDK で監査情報を付与
- 一部一覧は Firestore のリアルタイム購読を利用
- Web のほか、Desktop Widget、macOS App、CLI、Desktop SDK を同一リポジトリで管理

## 現在のページとルート

| ルート | 現在の役割 | 判定 | 再設計での扱い |
| --- | --- | --- | --- |
| `/home` | 進行中プロジェクト、正式タスク、Agent 導線 | 統合過多 | 個人ワークメモと想起支援へ変更。正式タスクは期限表示だけに限定 |
| `/calendar` | 予定とタスクの月・週・一覧表示、予定 CRUD | 維持 | 予定とタスクの視覚差、関連先導線を強化 |
| `/templates` | 再利用文面と生成 | 維持 | ナレッジと分離して独立維持 |
| `/leads` | 契約前営業案件の一覧・詳細 | 改善 | 現在状況、次回対応、次回予定、最終接触を先に表示 |
| `/sales/companies` | 契約後の会社一覧・詳細 | 改善 | 現在の関係、サービス、担当、最終接触、次回予定、重要メモを概要で集約 |
| `/products` | 商材マスター | 維持 | 営業・案件管理は追加しない |
| `/agent` | 現在は Knowledge/Wiki | 役割不一致 | 既存 `AgentPageClient` に接続し、開発依頼・実行結果専用へ戻す |
| `/settings/desktop` | Desktop 接続設定 | 維持 | サイドバー下部に固定 |
| `/projects` | ルート未実装 | 新設必要 | 独立した一覧と詳細を追加 |
| `/knowledge` | ディレクトリのみでルート未実装 | 移動先 | 現在 `/agent` にある Knowledge をナレッジとして接続 |
| `/tasks` | ディレクトリのみでルート未実装 | 既存機能不足 | 正式タスクのデータと各詳細内表示は維持。ナビゲーション主項目にはしない |

## データモデル

### 既存の主要コレクション

- `projects`: 会社・商材関連、状態、フェーズ、開始日、目標日、概要
- `tasks`: 担当者、優先度、状態、期限、会社・営業先・商材・プロジェクト関連、進捗ログ
- `leads`: 契約前営業先、営業状態、次回対応、次回予定、会社化先
- `companies`: 契約後会社、サービス、担当者、最終接触、次回予定、メモ
- `products`: 商材の詳細マスター
- `calendarEvents`: 参加者・会社・営業先・商材・プロジェクト・場所・URL・繰り返しを保持
- `businessTemplates`: 再利用文面
- `agentKnowledgeNodes`: フォルダ／ページのツリーと Markdown 本文
- `agentKnowledgeRecent`: ユーザー別の最近見た Knowledge ページ
- `agentRequests` / `agentRuns` / `developmentProjects` / `developmentJobs`: Agent 開発依頼と実行結果

### 不足しているデータ

- HOME 専用の「今やってること」「やること」「忘れない」。正式タスクと分離した保存先が必要
- プロジェクトの「現在地」「次」。既存 `phase` と `description` だけでは用途が曖昧
- Knowledge のお気に入り
- 横断検索の共通結果形式

## 共通コンポーネントと依存

- `WorkspaceShell`: 認証、全体ナビゲーション、最近開いたトップレベルページを担当
- `PageHeader`: 各一覧の共通見出し
- `TaskFormModal` / `TaskDetailDrawer`: 正式タスク CRUD の共通 UI
- `useWorkspaceOptions`: 会社、営業先、商材、プロジェクト、商談を常時購読
- `KnowledgeWorkspace`: ツリー、Markdown、検索、最近見たページ記録、一括作成を実装済み
- 会社詳細はタスク、活動、プロジェクト、サービス、ファイル、メモへ依存
- 営業詳細は活動、商談、タスク、テンプレート、カレンダーへ依存
- Desktop / Agent API も `tasks`、`companies`、`leads`、`products` を参照するため、既存フィールドの削除は影響が大きい

## 重複・役割の曖昧さ

1. HOME が正式タスク管理を主役にしており、個人の簡易メモが存在しない
2. HOME の進行中プロジェクトが唯一のプロジェクト UI になっている
3. `/agent` が Wiki を表示し、Agent 本体が未接続
4. 営業先と会社には次回予定がある一方、現在状況と「次に必要なこと」の見せ方がページごとに異なる
5. Knowledge の保存先名に `agent` が残り、UI 上の役割とデータ名がずれている
6. サイドバーがアイコンのみで、分類名と各機能の役割を読み取れない

## 変更分類

### 維持

- カレンダー、テンプレート、商材、会社、営業リスト、正式タスク、Agent 実行基盤
- Knowledge のツリー、Markdown、検索、最近見た、一括作成
- 既存 DB コレクションとフィールド

### 移動

- Knowledge UI: `/agent` から `/knowledge`（ナレッジ）へ
- Agent 開発依頼 UI: 未使用状態から `/agent` へ
- プロジェクト UI: HOME 内だけの表示から `/projects` と `/projects/[id]` へ

### 統合

- 全体ナビゲーションと横断検索を `WorkspaceShell` に集約
- 営業先／会社／プロジェクト詳細は「現在 → 重要情報 → 次 → 詳細 → 履歴」の順に統一

### 非表示

- HOME から Agent ウィジェットと正式タスクの編集中心 UI を外す
- Knowledge の AI 構成作成はナレッジの主要目的ではないため、既存機能は維持しつつ主ボタンから外す候補

### 削除候補（今回は削除しない）

- `HomeAgent`
- `HomeWeeklySchedule`
- HOME 専用の `HomeTasksPanel`（正式タスク部品として再利用余地あり）
- Knowledge 関連コレクション名の `agent` 接頭辞
- 旧 URL パラメータや互換タブ名

これらは参照元と Desktop/CLI 互換性の確認が必要なため、実削除しない。

## DB フィールド削除候補

なし。既存の Desktop、Agent、API が広く参照しているため、今回の再設計では追加と意味の明確化のみ行う。

