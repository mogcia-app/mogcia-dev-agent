"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Edit2, Save, X } from "lucide-react";
import type { KnowledgeNode } from "@/lib/agent-knowledge/types";

export function MarkdownBody({ content }: { content: string }) {
  return <div className="max-w-none break-words text-sm leading-7 text-[#374151] [&_a]:text-[#B84563] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#F7CAD2] [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-[#F6F4F4] [&_code]:px-1 [&_h1]:mb-5 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mb-4 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_hr]:my-7 [&_hr]:border-[#E5E7EB] [&_li]:ml-5 [&_li]:list-item [&_ol_li]:list-decimal [&_p]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[#F6F4F4] [&_pre]:p-4 [&_pre_code]:bg-transparent [&_table]:block [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:border [&_td]:border-[#E5E7EB] [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-[#E5E7EB] [&_th]:bg-[#F9FAFB] [&_th]:px-3 [&_th]:py-2 [&_ul_li]:list-disc">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ children, href }) => <a href={href} rel="noopener noreferrer" target="_blank">{children}</a> }}>{content}</ReactMarkdown>
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
      <div className="min-w-0"><h1 className="break-words text-3xl font-semibold tracking-tight text-[#111827]">{node.title}</h1><p className="mt-2 text-xs text-[#8A8186]">更新: {new Date(node.updatedAt).toLocaleString("ja-JP")}</p></div>
      {editing ? <div className="flex gap-2"><button className="inline-flex h-9 items-center gap-1 rounded-md border border-[#E5E7EB] px-3 text-sm" onClick={() => { setContent(node.content); setEditing(false); }} type="button"><X className="h-4 w-4" />キャンセル</button><button className="inline-flex h-9 items-center gap-1 rounded-md bg-[#EC6F8B] px-3 text-sm text-white disabled:opacity-50" disabled={saving || content === node.content} onClick={() => void save()} type="button"><Save className="h-4 w-4" />{saving ? "保存中..." : "保存"}</button></div> : <button className="inline-flex h-9 items-center gap-1 rounded-md border border-[#E5E7EB] px-3 text-sm" onClick={() => setEditing(true)} type="button"><Edit2 className="h-4 w-4" />編集</button>}
    </div>
    {error ? <p className="mb-4 text-sm text-red-600" role="alert">{error}</p> : null}
    {editing ? <><div className="mb-2 flex flex-wrap gap-1">{[["見出し", "## 見出し"], ["太字", "**強調**"], ["箇条書き", "- 項目"], ["番号", "1. 項目"], ["チェック", "- [ ] 項目"], ["引用", "> 引用"], ["コード", "```\nコード\n```"], ["リンク", "[リンク名](https://example.com)"], ["表", "| 項目 | 内容 |\n| --- | --- |\n| 名前 | 値 |"]].map(([label, snippet]) => <button className="rounded border border-[#E5E7EB] px-2 py-1 text-xs text-[#6F676B] hover:bg-[#FFF0F3]" key={label} onClick={() => setContent((current) => `${current}${current && !current.endsWith("\n") ? "\n" : ""}${snippet}\n`)} type="button">{label}</button>)}</div><textarea aria-label="Markdown本文" className="min-h-[55vh] w-full resize-y rounded-md border border-[#E5E7EB] p-4 font-mono text-sm leading-7 outline-none focus:border-[#EC6F8B]" onChange={(event) => setContent(event.target.value)} value={content} /></> : node.content ? <MarkdownBody content={node.content} /> : <p className="text-sm text-[#8A8186]">まだ本文がありません。編集から追加できます。</p>}
  </article>;
}
