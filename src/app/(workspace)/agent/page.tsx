import { KnowledgeWorkspace } from "@/components/agent/knowledge/KnowledgeWorkspace";

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ query?: string }> }) {
  const { query } = await searchParams;
  return <KnowledgeWorkspace initialQuery={query} />;
}
