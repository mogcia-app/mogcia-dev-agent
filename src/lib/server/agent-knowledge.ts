import "server-only";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { KnowledgeNode, KnowledgeNodeType, TreeDraftNode } from "@/lib/agent-knowledge/types";

const collection = () => getAdminDb().collection("agentKnowledgeNodes");

export function toKnowledgeNode(id: string, data: DocumentData): KnowledgeNode {
  const iso = (value: unknown) => value instanceof Timestamp ? value.toDate().toISOString() : new Date(0).toISOString();
  return {
    id, title: String(data.title ?? ""), content: String(data.content ?? ""),
    parentId: typeof data.parentId === "string" ? data.parentId : null,
    type: data.type === "folder" ? "folder" : "document",
    createdAt: iso(data.createdAt), updatedAt: iso(data.updatedAt),
    createdBy: String(data.createdBy ?? ""), updatedBy: String(data.updatedBy ?? "")
  };
}

export async function listKnowledgeNodes(): Promise<KnowledgeNode[]> {
  const snapshot = await collection().get();
  return snapshot.docs.map((doc) => toKnowledgeNode(doc.id, doc.data()));
}

export function cleanTitle(value: unknown): string {
  const title = typeof value === "string" ? value.trim() : "";
  if (!title || title.length > 160) throw new Error("名前は1〜160文字にしてください。");
  return title;
}

export function cleanContent(value: unknown): string {
  if (typeof value !== "string" || value.length > 200_000) throw new Error("本文は20万文字以内にしてください。");
  return value;
}

export async function createKnowledgeNode(input: { title?: unknown; content?: unknown; parentId?: unknown; type?: unknown }, uid: string): Promise<string> {
  const title = cleanTitle(input.title);
  const type: KnowledgeNodeType = input.type === "folder" ? "folder" : "document";
  const parentId = typeof input.parentId === "string" && input.parentId ? input.parentId : null;
  if (parentId) {
    const parent = await collection().doc(parentId).get();
    if (!parent.exists || parent.data()?.type !== "folder") throw new Error("保存先フォルダが見つかりません。");
  }
  const ref = await collection().add({ title, content: type === "folder" ? "" : cleanContent(input.content ?? ""), parentId, type, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: uid, updatedBy: uid });
  return ref.id;
}

export async function updateKnowledgeNode(id: string, input: { title?: unknown; content?: unknown; expectedUpdatedAt?: unknown }, uid: string): Promise<void> {
  const ref = collection().doc(id);
  await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new Error("項目が見つかりません。");
    const data = snapshot.data()!;
    if (input.expectedUpdatedAt && data.updatedAt instanceof Timestamp && data.updatedAt.toDate().toISOString() !== input.expectedUpdatedAt) throw new Error("他の変更が保存されています。再読み込みして確認してください。");
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: uid };
    if (input.title !== undefined) patch.title = cleanTitle(input.title);
    if (input.content !== undefined) {
      if (data.type !== "document") throw new Error("フォルダに本文は保存できません。");
      patch.content = cleanContent(input.content);
    }
    transaction.update(ref, patch);
  });
}

export async function deleteKnowledgeNode(id: string): Promise<number> {
  const nodes = await listKnowledgeNodes();
  if (!nodes.some((node) => node.id === id)) throw new Error("項目が見つかりません。");
  const ids = [id];
  for (let i = 0; i < ids.length; i++) nodes.filter((node) => node.parentId === ids[i]).forEach((node) => ids.push(node.id));
  const writer = getAdminDb().bulkWriter();
  const deletions = ids.map((nodeId) => writer.delete(collection().doc(nodeId)));
  await writer.close();
  await Promise.all(deletions);
  return ids.length;
}

export async function createKnowledgeTree(roots: TreeDraftNode[], uid: string, parentId: string | null): Promise<number> {
  if (parentId) {
    const parent = await collection().doc(parentId).get();
    if (!parent.exists || parent.data()?.type !== "folder") throw new Error("保存先フォルダが見つかりません。");
  }
  const batch = getAdminDb().batch();
  let count = 0;
  const visit = (nodes: TreeDraftNode[], parent: string | null, depth: number) => {
    if (depth > 12 || !Array.isArray(nodes)) throw new Error("ツリーの階層が不正です。");
    for (const node of nodes) {
      if (++count > 200) throw new Error("一度に作成できる項目は200件までです。");
      const title = cleanTitle(node.title);
      const children = Array.isArray(node.children) ? node.children : [];
      const type = children.length || node.type === "folder" ? "folder" : "document";
      const ref = collection().doc();
      batch.set(ref, { title, content: "", parentId: parent, type, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: uid, updatedBy: uid });
      visit(children, ref.id, depth + 1);
    }
  };
  visit(roots, parentId, 0);
  if (!count) throw new Error("作成する項目がありません。");
  await batch.commit();
  return count;
}

export async function createKnowledgePaths(input: unknown, uid: string): Promise<number> {
  if (!Array.isArray(input)) throw new Error("パスを入力してください。");
  const rawPaths = input.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean);
  if (!rawPaths.length || rawPaths.length > 200) throw new Error("パスは1〜200行で入力してください。");
  const snapshot = await collection().get();
  const known = new Map<string, { id: string; type: KnowledgeNodeType }>();
  snapshot.docs.forEach((entry) => {
    const data = entry.data();
    known.set(`${typeof data.parentId === "string" ? data.parentId : "root"}\u0000${String(data.title ?? "")}`, { id: entry.id, type: data.type === "folder" ? "folder" : "document" });
  });
  const batch = getAdminDb().batch();
  let count = 0;
  for (const rawPath of rawPaths) {
    const folderOnly = /[\\/]$/.test(rawPath);
    const segments = rawPath.replaceAll("\\", "/").replace(/^\.\//, "").split("/").map((value) => value.trim()).filter(Boolean);
    if (!segments.length || segments.length > 20) throw new Error(`パスが不正です: ${rawPath}`);
    let parentId: string | null = null;
    for (let index = 0; index < segments.length; index += 1) {
      const isLast = index === segments.length - 1;
      const type: KnowledgeNodeType = isLast && !folderOnly ? "document" : "folder";
      const rawTitle = segments[index];
      const title = cleanTitle(type === "document" ? rawTitle.replace(/\.md$/i, "") : rawTitle);
      const key = `${parentId ?? "root"}\u0000${title}`;
      const existing = known.get(key);
      if (existing) {
        if (type === "folder" && existing.type !== "folder") throw new Error(`${title} はドキュメントとして登録済みです。`);
        parentId = existing.id;
        continue;
      }
      if (++count > 200) throw new Error("一度に作成できる項目は200件までです。");
      const ref = collection().doc();
      batch.set(ref, { title, content: "", parentId, type, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: uid, updatedBy: uid });
      known.set(key, { id: ref.id, type });
      parentId = ref.id;
    }
  }
  if (count) await batch.commit();
  return count;
}
