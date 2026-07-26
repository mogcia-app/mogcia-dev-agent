import type { Client, Project, QuickActionDraft, QuickCaptureAnalysis, SalesContactKind } from "./types";

const contactKindRules: Array<{ keyword: string; kind: SalesContactKind }> = [
  { keyword: "電話", kind: "電話" },
  { keyword: "商談", kind: "商談" },
  { keyword: "訪問", kind: "訪問" },
  { keyword: "資料", kind: "資料送付" },
  { keyword: "メール", kind: "メール" },
  { keyword: "社内", kind: "社内メモ" }
];

const concernKeywords = ["気にしていた", "懸念", "不安", "負担", "難しい", "高い", "迷っている"];
const interestKeywords = ["興味", "関心", "やりたい", "検討", "LINE", "SNS", "Demo", "資料"];
const requestKeywords = ["欲しい", "追加", "修正", "見たい", "送って", "作って", "確認"];
const promiseKeywords = ["約束", "送付", "電話", "連絡", "確認", "提出", "追加"];

export function analyzeQuickCapture({
  rawText,
  clients,
  projects,
  inputBy
}: {
  rawText: string;
  clients: Client[];
  projects: Project[];
  inputBy: string;
}): QuickCaptureAnalysis {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const text = lines.join(" ");
  const companyCandidates = findCompanyCandidates(text, lines, clients);
  const topCompany = companyCandidates[0];
  const relatedProject = topCompany?.clientId ? projects.find((project) => project.clientId === topCompany.clientId) : undefined;
  const contactKind = contactKindRules.find((rule) => text.includes(rule.keyword))?.kind ?? "営業メモ";
  const nextActions = extractActions(lines, inputBy);
  const concerns = lines.filter((line) => concernKeywords.some((keyword) => line.includes(keyword)));
  const interests = lines.filter((line) => interestKeywords.some((keyword) => line.includes(keyword)));
  const requests = lines.filter((line) => requestKeywords.some((keyword) => line.includes(keyword)));
  const promises = lines.filter((line) => promiseKeywords.some((keyword) => line.includes(keyword)));
  const salesState = text.includes("失注") ? "失注" : text.includes("保留") ? "保留" : text.includes("提案") ? "提案中" : "見込み";
  const unresolved = [];
  if (!topCompany) unresolved.push("会社未確定");
  if (nextActions.some((action) => !action.due)) unresolved.push("期限未確定の次回アクションあり");

  return {
    companyName: topCompany?.name ?? lines[0],
    companyCandidates,
    projectId: relatedProject?.id,
    contactKind,
    facts: lines.filter((line) => !nextActions.some((action) => line.includes(action.title))),
    interests,
    concerns,
    requests,
    promises,
    nextActions,
    importantInfo: Array.from(new Set([...concerns, ...interests, ...requests])).slice(0, 6),
    salesState,
    confidence: topCompany ? topCompany.score : 0.35,
    unresolved
  };
}

function findCompanyCandidates(text: string, lines: string[], clients: Client[]): QuickCaptureAnalysis["companyCandidates"] {
  const candidates = clients
    .map((client) => {
      const nameHits = scoreName(text, client.name);
      const firstLineHits = scoreName(lines[0] ?? "", client.name);
      const industryHits = client.industry && text.includes(client.industry) ? 0.1 : 0;
      return { clientId: client.id, name: client.name, score: Math.min(1, nameHits + firstLineHits + industryHits) };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (candidates.length > 0) return candidates;
  const guessedName = lines[0]?.replace(/[、。]/g, "").trim();
  return guessedName ? [{ name: guessedName, score: 0.35 }] : [];
}

function scoreName(text: string, name: string): number {
  if (!text || !name) return 0;
  if (text.includes(name)) return 0.9;
  const normalizedName = name.replace(/株式会社|有限会社|合同会社|倶楽部|クラブ|\s/g, "");
  if (normalizedName && text.includes(normalizedName)) return 0.65;
  const parts = normalizedName.match(/.{2,}/g) ?? [];
  return parts.some((part) => text.includes(part)) ? 0.35 : 0;
}

function extractActions(lines: string[], fallbackAssignee: string): QuickActionDraft[] {
  return lines
    .filter((line) => /する|して|電話|連絡|送付|追加|修正|確認|作成/.test(line))
    .slice(0, 4)
    .map((line) => ({
      title: normalizeActionTitle(line),
      assignee: extractAssignee(line) ?? fallbackAssignee,
      due: extractDue(line),
      importance: /至急|重要|必ず|期限|来週|明日/.test(line) ? "high" : "medium"
    }));
}

function normalizeActionTitle(line: string): string {
  return line.replace(/^・/, "").replace(/。$/, "").trim();
}

function extractAssignee(line: string): string | undefined {
  const match = line.match(/([^\s　、。]+さん|石田|堂本|営業|担当)(?:から|が|に)/);
  return match?.[1]?.replace("さん", "");
}

function extractDue(line: string): string {
  const weekday = line.match(/来週[月火水木金土日]曜/);
  if (weekday) return weekday[0];
  if (line.includes("明日")) return "明日";
  if (line.includes("今日")) return "今日";
  if (line.includes("電話前")) return "電話前";
  const date = line.match(/\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日/);
  return date?.[0] ?? "";
}
