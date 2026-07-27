const sentenceBlockPattern = /[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g;

export function splitTextIntoConversationBlocks(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const blocks = normalized.match(sentenceBlockPattern)?.map((block) => block.trim()).filter(Boolean) ?? [];
  return blocks.length ? blocks : [normalized];
}
