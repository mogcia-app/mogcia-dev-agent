export type KnowledgeNodeType = "folder" | "document";

export interface KnowledgeNode {
  id: string;
  title: string;
  content: string;
  parentId: string | null;
  type: KnowledgeNodeType;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface TreeDraftNode {
  title: string;
  type: KnowledgeNodeType;
  children: TreeDraftNode[];
}
