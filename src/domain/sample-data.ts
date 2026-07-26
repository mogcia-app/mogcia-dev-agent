import type { Client, Project, RuleLayer, TimelineEvent } from "./types";
import { baseRules } from "./rules";

export const clients: Client[] = [
  {
    id: "client-nagisa",
    name: "株式会社なぎさホテル",
    industry: "ホテル",
    contactName: "高橋様",
    services: ["HP制作", "公式LINE運用", "SNS運用"]
  },
  {
    id: "client-kissa",
    name: "喫茶こもれび",
    industry: "飲食",
    contactName: "森様",
    services: ["LP制作", "SNS運用"]
  },
  {
    id: "client-agency",
    name: "代理店A / 美容クリニック案件",
    industry: "美容",
    contactName: "代理店 佐藤様",
    services: ["HP制作", "commo."]
  }
];

export const projects: Project[] = [
  {
    id: "project-nagisa-site",
    clientId: "client-nagisa",
    name: "夏季宿泊キャンペーン導線改善",
    source: "direct-client",
    mode: "production",
    status: "承認待ち",
    services: ["HP制作", "公式LINE運用"],
    owner: "営業: 石田",
    nextAction: "不足確認後、石田承認へ進行"
  },
  {
    id: "project-kissa-sns",
    clientId: "client-kissa",
    name: "Instagram月次運用",
    source: "internal",
    mode: "production",
    status: "運用中",
    services: ["SNS運用"],
    owner: "Operation Agent",
    nextAction: "月初に投稿企画と承認依頼を作成"
  },
  {
    id: "project-agency-lp",
    clientId: "client-agency",
    name: "美容クリニック予約LP",
    source: "agency",
    mode: "production",
    status: "確認待ち",
    services: ["LP制作", "commo."],
    owner: "Sales Agent",
    nextAction: "代理店経由の送付前に石田承認"
  }
];

export const projectRules: RuleLayer[] = [
  ...baseRules,
  {
    id: "service-line",
    scope: "service",
    name: "公式LINE運用",
    priority: 20,
    rules: [
      "一斉配信は必ず承認後に実行する",
      "配信前日に最終確認タスクを作成する"
    ]
  },
  {
    id: "industry-hotel",
    scope: "industry",
    name: "ホテル",
    priority: 50,
    rules: [
      "予約導線、季節キャンペーン、再来店導線を優先する",
      "写真素材がない場合はPlaceholderであることを明記する"
    ]
  },
  {
    id: "client-nagisa-rule",
    scope: "client",
    name: "株式会社なぎさホテル",
    priority: 60,
    rules: [
      "ブランドカラーは深緑と白を基本にする",
      "高級感よりも親しみと清潔感を優先する"
    ]
  }
];

export const timeline: TimelineEvent[] = [
  {
    id: "tl-1",
    clientId: "client-nagisa",
    kind: "minutes",
    title: "初回ヒアリング実施",
    date: "7月3日",
    summary: "予約導線、LINE登録、Instagram流入の課題を確認"
  },
  {
    id: "tl-2",
    clientId: "client-nagisa",
    kind: "task",
    title: "確認範囲整理",
    date: "7月5日",
    summary: "トップ、客室、キャンペーン、LINE登録導線を確認範囲に設定"
  },
  {
    id: "tl-3",
    clientId: "client-nagisa",
    kind: "task",
    title: "石田承認待ち",
    date: "7月6日",
    summary: "直案件のため開発着手前に承認を要求"
  },
  {
    id: "tl-4",
    clientId: "client-kissa",
    kind: "sns",
    title: "月間投稿企画",
    date: "8月1日",
    summary: "投稿企画、撮影素材依頼、承認期限を自動生成"
  },
  {
    id: "tl-5",
    clientId: "client-kissa",
    kind: "report",
    title: "月次レポート送信準備",
    date: "9月1日",
    summary: "来月やるべきこと、改善提案、改善案作成ボタンを表示"
  }
];
