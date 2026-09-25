import { KnowledgeWorkspace } from "@/components/agent/knowledge/KnowledgeWorkspace";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ query?: string; nodeId?: string }> }) {
  const { query, nodeId } = await searchParams;
  return <KnowledgeWorkspace initialNodeId={nodeId} initialQuery={query} />;
}
