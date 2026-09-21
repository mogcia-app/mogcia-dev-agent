"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { FilePlus2, FolderPlus, Menu, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { countDraft, descendants, parseTree } from "@/lib/agent-knowledge/tree";
import type { KnowledgeNode, TreeDraftNode } from "@/lib/agent-knowledge/types";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { KnowledgeDocument } from "./KnowledgeDocument";
import { KnowledgeTree } from "./KnowledgeTree";

export function KnowledgeWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobilePanel, setMobilePanel] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pathOpen, setPathOpen] = useState(false);
  const [pathText, setPathText] = useState("");
  const [aiCreate, setAiCreate] = useState(false);
  const [treeText, setTreeText] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [preview, setPreview] = useState<TreeDraftNode[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) { window.setTimeout(() => { setError("Firebaseが未設定です。"); setLoading(false); }, 0); return; }
    return onAuthStateChanged(auth, setUser);
  }, []);

  const api = useCallback(async <T,>(path: string, method: string, body?: unknown): Promise<T> => {
    if (!user) throw new Error("ログインしてください。");
    const token = await user.getIdToken();
    const response = await fetch(path, { method, headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = await response.json() as { data?: T; error?: string };
    if (!response.ok || json.data === undefined) throw new Error(json.error || "処理に失敗しました。");
    return json.data;
  }, [user]);

  const reload = useCallback(async () => {
    const items = await api<KnowledgeNode[]>("/api/agent/knowledge", "GET");
    setNodes(items);
    setSelectedId((current) => current && items.some((item) => item.id === current) ? current : items.find((item) => item.type === "document")?.id ?? null);
  }, [api]);

  useEffect(() => {
    if (!user) return;
    void Promise.resolve().then(reload).catch((nextError) => setError(nextError instanceof Error ? nextError.message : "読み込めませんでした。")).finally(() => setLoading(false));
  }, [reload, user]);

  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  useEffect(() => {
    if (!user || !selected || selected.type !== "document") return;
    void api("/api/agent/knowledge/recent", "POST", { nodeId: selected.id }).catch(() => undefined);
  }, [api, selected, user]);
  const searchResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? nodes.filter((node) => `${node.title}\n${node.content}`.toLocaleLowerCase().includes(needle)).slice(0, 30) : [];
  }, [nodes, query]);

  const runMutation = async (operation: () => Promise<void>, success: string) => {
    setSaving(true); setError("");
    try { await operation(); await reload(); setNotice(success); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "処理に失敗しました。"); throw nextError; }
    finally { setSaving(false); }
  };

  const create = async (type: "folder" | "document", parentId: string | null) => {
    const title = window.prompt(type === "folder" ? "フォルダ名" : "ドキュメント名");
    if (!title?.trim()) return;
    await runMutation(async () => {
      const result = await api<{ id: string }>("/api/agent/knowledge", "POST", { title, type, parentId, content: "" });
      if (type === "document") setSelectedId(result.id);
    }, `${type === "folder" ? "フォルダ" : "ドキュメント"}を作成しました。`).catch(() => undefined);
  };

  const rename = async (node: KnowledgeNode) => {
    const title = window.prompt("新しい名前", node.title);
    if (!title?.trim() || title.trim() === node.title) return;
    await runMutation(() => api("/api/agent/knowledge", "PATCH", { id: node.id, title, expectedUpdatedAt: node.updatedAt }), "名前を変更しました。" ).catch(() => undefined);
  };

  const remove = async (node: KnowledgeNode) => {
    const childCount = descendants(nodes, node.id).length;
    if (!window.confirm(`${node.title}を削除しますか？${childCount ? ` 子項目${childCount}件も削除されます。` : ""}`)) return;
    await runMutation(() => api("/api/agent/knowledge", "DELETE", { id: node.id }), "削除しました。" ).catch(() => undefined);
  };

  const saveDocument = async (content: string, expectedUpdatedAt: string) => runMutation(() => api("/api/agent/knowledge", "PATCH", { id: selectedId, content, expectedUpdatedAt }), "保存しました。" );

  const openImport = (ai: boolean) => { setAiCreate(ai); setImportOpen(true); setPreview(null); setTreeText(""); setAiPrompt(""); setError(""); };
  const prepareTree = () => { try { setPreview(parseTree(treeText)); setError(""); } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "ツリーを解析できませんでした。"); } };
  const generateTree = async () => {
    setAiBusy(true); setError("");
    try {
      const result = await api<{ roots: TreeDraftNode[] }>("/api/agent/knowledge/ai", "POST", { mode: "create", prompt: aiPrompt });
      setPreview(result.roots);
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : "構成を生成できませんでした。"); }
    finally { setAiBusy(false); }
  };
  const applyTree = async () => {
    if (!preview) return;
    await runMutation(() => api("/api/agent/knowledge", "POST", { action: "bulk", roots: preview, parentId: null }), `${countDraft(preview)}件を作成しました。`).then(() => setImportOpen(false)).catch(() => undefined);
  };
  const applyPaths = async () => {
    const paths = pathText.split("\n").map((value) => value.trim()).filter(Boolean);
    if (!paths.length) return;
    await runMutation(async () => {
      const result = await api<{ count: number }>("/api/agent/knowledge", "POST", { action: "paths", paths });
      setNotice(result.count ? `${result.count}件を作成しました。` : "すでに同じ構成が登録されています。");
    }, "構成を作成しました。").then(() => { setPathOpen(false); setPathText(""); }).catch(() => undefined);
  };

  const tree = <KnowledgeTree nodes={nodes} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setMobilePanel(false); }} onCreate={(type, parentId) => void create(type, parentId)} onRename={(node) => void rename(node)} onDelete={(node) => void remove(node)} />;
  const controls = <div className="space-y-3"><div className="grid grid-cols-2 gap-2"><button className="h-8 rounded-md bg-[#EC6F8B] px-2 text-xs font-medium text-white" onClick={() => setPathOpen(true)} type="button">パスから作成</button><button className="h-8 rounded-md border border-[#E5E7EB] bg-white px-2 text-xs" onClick={() => openImport(false)} type="button">treeを貼り付け</button><button className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[#E5E7EB] bg-white px-2 text-xs" onClick={() => void create("folder", null)} type="button"><FolderPlus className="h-3.5 w-3.5" />フォルダ</button><button className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[#E5E7EB] bg-white px-2 text-xs" onClick={() => void create("document", null)} type="button"><FilePlus2 className="h-3.5 w-3.5" />ページ</button></div><div className="flex items-center gap-2 rounded-md border border-[#E5E7EB] bg-white px-2"><Search className="h-3.5 w-3.5 text-[#8A8186]" /><input aria-label="Agentを検索" className="h-9 min-w-0 flex-1 bg-transparent text-xs outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="ツリーを検索" value={query} />{query ? <button aria-label="検索をクリア" onClick={() => setQuery("")} type="button"><X className="h-3.5 w-3.5" /></button> : null}</div>{query ? <div className="max-h-52 overflow-y-auto rounded-md border border-[#E5E7EB] bg-white p-1">{searchResults.length ? searchResults.map((node) => <button className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-[#FFF0F3]" key={node.id} onClick={() => { setSelectedId(node.id); setQuery(""); }} type="button">{node.type === "folder" ? <FolderPlus className="h-3.5 w-3.5" /> : <FilePlus2 className="h-3.5 w-3.5" />}<span className="truncate">{node.title}</span></button>) : <p className="px-2 py-2 text-xs text-[#8A8186]">見つかりませんでした。</p>}</div> : null}</div>;

  return <section className="min-h-[calc(100vh-120px)]">
    <PageHeader title="Agent" description="システム構成と開発ドキュメントをツリーで管理します" actions={<button className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#EC6F8B] px-4 text-sm font-medium text-white" onClick={() => openImport(true)} type="button"><Sparkles className="h-4 w-4" />AIで構成を作成</button>} />
    {error ? <p className="mb-3 mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}{notice ? <p className="mb-3 mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700" role="status">{notice}</p> : null}
    <div className="mb-3 mt-4 flex items-center justify-between lg:hidden"><button className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-xs" onClick={() => setMobilePanel(true)} type="button"><Menu className="h-4 w-4" />システムツリー</button></div>
    <div className="mt-5 grid min-h-[72vh] min-w-0 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]"><aside className="hidden min-w-0 overflow-y-auto border-r border-[#E5E7EB] bg-[#FCFBFA] lg:block"><div className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-[#FCFBFA] p-3">{controls}</div><div className="p-3">{tree}</div></aside><main className="min-w-0 overflow-y-auto bg-white">{loading ? <p className="p-8 text-sm text-[#8A8186]">読み込み中...</p> : <KnowledgeDocument key={`${selected?.id ?? "none"}:${selected?.updatedAt ?? ""}`} node={selected} onSave={saveDocument} saving={saving} />}</main></div>
    {mobilePanel ? <div className="fixed inset-0 z-50 bg-black/30" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobilePanel(false); }}><aside className="h-full w-[min(90vw,360px)] overflow-y-auto bg-[#FCFBFA] shadow-xl"><div className="flex justify-end border-b p-2"><button aria-label="閉じる" onClick={() => setMobilePanel(false)} type="button"><X className="h-5 w-5" /></button></div><div className="border-b p-3">{controls}</div><div className="p-3">{tree}</div></aside></div> : null}
    {importOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"><div className="flex items-start justify-between"><h2 className="text-lg font-semibold">{aiCreate ? "AI Create" : "ツリー構造から一括作成"}</h2><button aria-label="閉じる" onClick={() => setImportOpen(false)} type="button"><X className="h-5 w-5" /></button></div>{error ? <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700" role="alert">{error}</p> : null}{!preview ? <><p className="mt-3 text-sm text-[#6F676B]">{aiCreate ? "作りたい内容を入力してください。生成後に構成を確認できます。" : "├── と └── を使ったツリーを貼り付けてください。"}</p><textarea className="mt-4 min-h-44 w-full rounded-md border border-[#E5E7EB] p-3 font-mono text-sm" onChange={(event) => aiCreate ? setAiPrompt(event.target.value) : setTreeText(event.target.value)} placeholder={aiCreate ? "新しいシステム開発案件の構成を作って" : "Project\n├── Overview\n└── Requirements"} value={aiCreate ? aiPrompt : treeText} /><div className="mt-4 flex justify-end gap-2"><button className="rounded-md border px-4 py-2 text-sm" onClick={() => setImportOpen(false)} type="button">キャンセル</button><button className="rounded-md bg-[#EC6F8B] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={aiBusy || !(aiCreate ? aiPrompt : treeText).trim()} onClick={() => aiCreate ? void generateTree() : prepareTree()} type="button">{aiBusy ? "生成中..." : "構成を確認"}</button></div></> : <><p className="mt-3 text-sm text-[#6F676B]">以下の{countDraft(preview)}件を作成します。</p><div className="mt-4 max-h-80 overflow-auto rounded-md border border-[#E5E7EB] p-3">{renderPreview(preview)}</div><div className="mt-4 flex justify-end gap-2"><button className="rounded-md border px-4 py-2 text-sm" onClick={() => setPreview(null)} type="button">戻る</button><button className="rounded-md bg-[#EC6F8B] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={saving} onClick={() => void applyTree()} type="button">{saving ? "作成中..." : "作成する"}</button></div></>}</div></div> : null}
    {pathOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPathOpen(false); }}><div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">パスから一括作成</h2><button aria-label="閉じる" onClick={() => setPathOpen(false)} type="button"><X className="h-5 w-5" /></button></div><p className="mt-3 text-sm leading-6 text-[#6F676B]">CLIのパスと同じ形で1行ずつ入力します。末尾が <code>/</code> ならフォルダ、それ以外はページとして作成します。<code>.md</code> は省略できます。</p><textarea autoFocus className="mt-4 min-h-48 w-full rounded-md border border-[#E5E7EB] p-3 font-mono text-sm leading-6 outline-none focus:border-[#EC6F8B]" onChange={(event) => setPathText(event.target.value)} placeholder={"systems/mogcia/README.md\nsystems/mogcia/frontend/components.md\nsystems/mogcia/api/auth.md\nsystems/mogcia/infrastructure/"} value={pathText} /><div className="mt-4 flex justify-end gap-2"><button className="h-9 rounded-md border px-4 text-sm" onClick={() => setPathOpen(false)} type="button">キャンセル</button><button className="h-9 rounded-md bg-[#EC6F8B] px-4 text-sm text-white disabled:opacity-50" disabled={saving || !pathText.trim()} onClick={() => void applyPaths()} type="button">{saving ? "作成中..." : "一括作成"}</button></div></div></div> : null}

  </section>;
}

function renderPreview(nodes: TreeDraftNode[], depth = 0): React.ReactNode {
  return nodes.map((node, index) => <div key={`${depth}-${index}-${node.title}`}><div className="truncate py-1 text-sm" style={{ paddingLeft: depth * 18 }}>{node.type === "folder" ? "▾ 📁" : "  📄"} {node.title}</div>{renderPreview(node.children, depth + 1)}</div>);
}
