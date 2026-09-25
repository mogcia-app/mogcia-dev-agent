"use client";

import { ChevronDown, ChevronRight, FileText, Folder, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import type { KnowledgeNode } from "@/lib/agent-knowledge/types";

export function KnowledgeTree({ nodes, searching = false, selectedId, onSelect, onCreate, onRename, onDelete }: {
  nodes: KnowledgeNode[];
  searching?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (type: "folder" | "document", parentId: string | null) => void;
  onRename: (node: KnowledgeNode) => void;
  onDelete: (node: KnowledgeNode) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const render = (parentId: string | null, depth: number): React.ReactNode => nodes
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => Number(b.type === "folder") - Number(a.type === "folder") || a.title.localeCompare(b.title, "ja"))
    .map((node) => <div key={node.id}>
      <div className={`group flex min-w-0 items-center gap-1 rounded-md pr-1 text-sm ${selectedId === node.id ? "bg-[#FDF0F4] text-[#9B4862]" : "text-[#3F3F3F] hover:bg-[#EDEDED]"}`} style={{ paddingLeft: `${depth * 16 + 4}px` }}>
        {node.type === "folder" ? <button aria-label={collapsed.has(node.id) ? "フォルダを開く" : "フォルダを閉じる"} className="grid h-8 w-5 shrink-0 place-items-center" onClick={() => toggle(node.id)} type="button">{collapsed.has(node.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}</button> : <span className="w-5 shrink-0" />}
        <button className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" onClick={() => node.type === "folder" ? toggle(node.id) : onSelect(node.id)} title={node.title} type="button">{node.type === "folder" ? <Folder className="h-4 w-4 shrink-0 fill-[#FAD9E1] text-[#C95C78]" /> : <FileText className="h-4 w-4 shrink-0 text-[#64748B]" />}<span className="truncate">{node.title}</span></button>
        <div className="relative">
          <button aria-label={`${node.title}の操作`} className="grid h-8 w-7 place-items-center rounded hover:bg-white" onClick={() => setMenuId(menuId === node.id ? null : node.id)} type="button"><MoreHorizontal className="h-4 w-4" /></button>
          {menuId === node.id ? <div className="absolute right-0 top-8 z-20 w-40 rounded-md border border-[#E5E7EB] bg-white p-1 shadow-lg">
            {node.type === "folder" ? <><MenuButton label="子フォルダを作成" onClick={() => { onCreate("folder", node.id); setMenuId(null); }} /><MenuButton label="ドキュメントを作成" onClick={() => { onCreate("document", node.id); setMenuId(null); }} /></> : null}
            <MenuButton label="名前を変更" onClick={() => { onRename(node); setMenuId(null); }} />
            <MenuButton label="削除" onClick={() => { onDelete(node); setMenuId(null); }} />
          </div> : null}
        </div>
      </div>
      {node.type === "folder" && (searching || !collapsed.has(node.id)) ? render(node.id, depth + 1) : null}
    </div>);
  return <div className="min-w-0">
    <div className="mb-3 flex items-center justify-between px-2"><p className="text-xs font-semibold tracking-wide text-[#64748B]">システムツリー</p><button aria-label="ページを追加" className="grid h-8 w-8 place-items-center rounded-md text-[#475569] hover:bg-white" onClick={() => onCreate("document", null)} type="button"><Plus className="h-4 w-4" /></button></div>
    <div className="space-y-0.5">{render(null, 0)}</div>
    {nodes.length === 0 ? <p className="px-3 py-5 text-sm text-[#64748B]">フォルダまたはドキュメントを作成してください。</p> : null}
  </div>;
}
function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button className="block w-full rounded px-2 py-2 text-left text-xs text-[#374151] hover:bg-[#FDF0F4]" onClick={onClick} type="button">{label}</button>;
}
