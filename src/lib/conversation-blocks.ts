import type { ConversationLog } from "@/types/teleapo";

const sentenceBlockPattern = /[^。｡！？!?]+[。｡！？!?]+|[^。｡！？!?]+$/g;

export function splitTextIntoConversationBlocks(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const blocks = normalized.match(sentenceBlockPattern)?.map((block) => block.trim()).filter(Boolean) ?? [];
  return blocks.length ? blocks : [normalized];
}

export function splitConversationLogsIntoBlocks(logs: ConversationLog[]): ConversationLog[] {
  return logs
    .flatMap((log, logIndex) => {
      const blocks = splitTextIntoConversationBlocks(log.text);
      if (blocks.length <= 1) {
        return [{ ...log, id: log.id || `log-${logIndex + 1}`, text: log.text.trim() }];
      }
      return blocks.map((block, blockIndex) => ({
        ...log,
        id: `${log.id || `log-${logIndex + 1}`}-block-${blockIndex + 1}`,
        text: block,
        startSec: blockIndex === 0 ? log.startSec ?? null : null,
        endSec: blockIndex === blocks.length - 1 ? log.endSec ?? null : null
      }));
    })
    .filter((log) => log.text.trim().length > 0);
}
