import type { KnowledgeNode, TreeDraftNode } from "./types";

export function parseTree(text: string): TreeDraftNode[] {
  const roots: TreeDraftNode[] = [];
  const stack: Array<{ depth: number; node: TreeDraftNode }> = [];
  let count = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const branch = raw.match(/^(.*?)(?:├──|└──|\+--|\|--|[-*])\s*(.+)$/);
    const prefix = branch?.[1] ?? "";
    const title = (branch?.[2] ?? raw.trim()).trim().replace(/\/$/, "");
    if (!title || title.length > 160) throw new Error("各項目の名前は1〜160文字にしてください。");
    const depth = branch ? Math.floor(prefix.replace(/\t/g, "    ").length / 4) + 1 : 0;
    if (depth > 12) throw new Error("階層は12段までにしてください。");
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (depth > 0 && !stack.length) throw new Error("先頭の項目から階層を作成してください。");
    const node: TreeDraftNode = { title, type: "document", children: [] };
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
    stack.push({ depth, node });
    if (++count > 200) throw new Error("一度に作成できる項目は200件までです。");
  }
  if (!roots.length) throw new Error("ツリー構造を入力してください。");
  const markFolders = (nodes: TreeDraftNode[]) => nodes.forEach((node) => {
    if (node.children.length) node.type = "folder";
    markFolders(node.children);
  });
  markFolders(roots);
  return roots;
}

export function descendants(nodes: KnowledgeNode[], id: string): string[] {
  const result: string[] = [];
  const visit = (parentId: string) => nodes.filter((node) => node.parentId === parentId).forEach((node) => {
    result.push(node.id);
    visit(node.id);
  });
  visit(id);
  return result;
}

export function countDraft(nodes: TreeDraftNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countDraft(node.children), 0);
}
