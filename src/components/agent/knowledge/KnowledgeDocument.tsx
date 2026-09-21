"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Edit2, Save, X } from "lucide-react";
import type { KnowledgeNode } from "@/lib/agent-knowledge/types";

const alertStyles = {
  note: { label: "NOTE", className: "border-[#60A5FA] bg-[#EFF6FF] text-[#1E40AF]" },
  tip: { label: "TIP", className: "border-[#34D399] bg-[#ECFDF5] text-[#065F46]" },
  important: { label: "IMPORTANT", className: "border-[#EC6F8B] bg-[#FFF0F3] text-[#9F1239]" },
  warning: { label: "WARNING", className: "border-[#FBBF24] bg-[#FFFBEB] text-[#92400E]" },
  caution: { label: "CAUTION", className: "border-[#F87171] bg-[#FEF2F2] text-[#991B1B]" }
} as const;

type AlertKind = keyof typeof alertStyles;
type MarkdownNode = { type?: string; value?: string; children?: MarkdownNode[]; data?: { hProperties?: Record<string, string> } };

function remarkGithubAlerts() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.type === "blockquote") {
        const firstText = node.children?.[0]?.children?.[0];
        const match = firstText?.type === "text" ? firstText.value?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n)?/i) : null;
        if (match && firstText?.value !== undefined) {
          const kind = match[1].toLowerCase() as AlertKind;
          firstText.value = firstText.value.slice(match[0].length);
          node.data = { ...(node.data ?? {}), hProperties: { ...(node.data?.hProperties ?? {}), "data-alert": kind } };
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

export function MarkdownBody({ content }: { content: string }) {
  return <div className="max-w-none break-words text-sm leading-7 text-[#374151] [&_a]:text-[#B84563] [&_a]:underline [&_code]:rounded [&_code]:bg-[#F6F4F4] [&_code]:px-1 [&_h1]:mb-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_hr]:my-7 [&_hr]:border-[#E5E7EB] [&_li]:ml-5 [&_li]:list-item [&_ol_li]:list-decimal [&_p]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[#F6F4F4] [&_pre]:p-4 [&_pre_code]:bg-transparent [&_table]:block [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-[#E5E7EB] [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-[#E5E7EB] [&_th]:bg-[#F9FAFB] [&_th]:px-3 [&_th]:py-2 [&_ul_li]:list-disc">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkGithubAlerts]} components={{
      a: ({ children, href }) => <a href={href} rel="noopener noreferrer" target="_blank">{children}</a>,
      blockquote: ({ children, node }) => {
        const kind = String(node?.properties?.dataAlert ?? node?.properties?.["data-alert"] ?? "") as AlertKind;
        const alert = alertStyles[kind];
        return alert
          ? <aside className={`my-5 rounded-lg border-l-4 px-4 py-3 [&_p]:my-1 ${alert.className}`}><p className="text-xs font-semibold tracking-wide">{alert.label}</p><div className="text-[#374151]">{children}</div></aside>
          : <blockquote className="my-4 border-l-2 border-[#F7CAD2] pl-4 text-[#6F676B]">{children}</blockquote>;
      }
    }}>{content}</ReactMarkdown>
  </div>;
}

export function KnowledgeDocument({ node, saving, onSave }: { node: KnowledgeNode | null; saving: boolean; onSave: (content: string, expectedUpdatedAt: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(node?.content ?? "");
  const [error, setError] = useState("");
  if (!node || node.type !== "document") return <div className="flex min-h-80 items-center justify-center p-8 text-center text-sm text-[#8A8186]">左のツリーからドキュメントを選択してください。</div>;
  const save = async () => {
    setError("");
    try { await onSave(content, node.updatedAt); setEditing(false); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "保存できませんでした。"); }
  };
  return <article className="mx-auto min-w-0 max-w-5xl px-5 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-[#E5E7EB] pb-5">
      <div className="min-w-0"><h1 className="break-words text-3xl font-semibold tracking-tight text-[#111827]">{node.title}</h1></div>
      {editing ? <div className="flex gap-2"><button className="inline-flex h-9 items-center gap-1 rounded-md border border-[#E5E7EB] px-3 text-sm" onClick={() => { setContent(node.content); setEditing(false); }} type="button"><X className="h-4 w-4" />キャンセル</button><button className="inline-flex h-9 items-center gap-1 rounded-md bg-[#EC6F8B] px-3 text-sm text-white disabled:opacity-50" disabled={saving || content === node.content} onClick={() => void save()} type="button"><Save className="h-4 w-4" />{saving ? "保存中..." : "保存"}</button></div> : <button className="inline-flex h-9 items-center gap-1 rounded-md border border-[#E5E7EB] px-3 text-sm" onClick={() => setEditing(true)} type="button"><Edit2 className="h-4 w-4" />編集</button>}
    </div>
    {error ? <p className="mb-4 text-sm text-red-600" role="alert">{error}</p> : null}
    {editing ? <><div className="mb-2 flex flex-wrap gap-1">{[["見出し", "## 見出し"], ["太字", "**強調**"], ["箇条書き", "- 項目"], ["番号", "1. 項目"], ["チェック", "- [ ] 項目"], ["引用", "> 引用"], ["重要", "> [!IMPORTANT]\n> 重要な内容"], ["コード", "```\nコード\n```"], ["リンク", "[リンク名](https://example.com)"], ["表", "| 項目 | 内容 |\n| --- | --- |\n| 名前 | 値 |"]].map(([label, snippet]) => <button className="rounded border border-[#E5E7EB] px-2 py-1 text-xs text-[#6F676B] hover:bg-[#FFF0F3]" key={label} onClick={() => setContent((current) => `${current}${current && !current.endsWith("\n") ? "\n" : ""}${snippet}\n`)} type="button">{label}</button>)}</div><textarea aria-label="Markdown本文" className="min-h-[55vh] w-full resize-y rounded-md border border-[#E5E7EB] p-4 font-mono text-sm leading-7 outline-none focus:border-[#EC6F8B]" onChange={(event) => setContent(event.target.value)} value={content} /></> : node.content ? <MarkdownBody content={node.content} /> : <p className="text-sm text-[#8A8186]">まだ本文がありません。編集から追加できます。</p>}
  </article>;
}
