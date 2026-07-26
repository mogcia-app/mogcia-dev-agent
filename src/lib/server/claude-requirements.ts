import "server-only";

import { generateRequirementDraft } from "@/domain/requirements";
import type { Client, MinutesRecord, Project, RequirementDraft, RuleLayer } from "@/domain/types";
import { mergeRules } from "@/domain/rules";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_LOW_COST_MODEL = "claude-haiku-4-5";

interface GenerateRequirementsInput {
  client: Client;
  project: Project;
  minutes: MinutesRecord;
  ruleLayers: RuleLayer[];
}

interface ClaudeMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export async function generateRequirementsWithClaude(input: GenerateRequirementsInput): Promise<RequirementDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return generateRequirementDraft(input);

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_LOW_COST_MODEL;
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model,
      max_tokens: 1400,
      temperature: 0.2,
      system: [
        "あなたはMOGCIA Dev AgentのRequirements Agentです。",
        "営業議事録を、MOGCIAのRule Engineに沿って要件定義ドラフトへ変換してください。",
        "出力はJSONのみ。Markdown、説明文、コードブロックは禁止。",
        "Demoモードでは外部リソース作成、DB作成、API接続、認証実装を含めないでください。",
        "直案件・代理店案件では石田承認前提で、不足確認と承認観点を明確にしてください。"
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: buildPrompt(input)
        }
      ]
    })
  });

  if (!response.ok) {
    return generateRequirementDraft(input);
  }

  const data = (await response.json()) as ClaudeMessageResponse;
  const text = data.content?.find((item) => item.type === "text")?.text;
  if (!text) return generateRequirementDraft(input);

  try {
    const parsed = JSON.parse(extractJson(text)) as Partial<RequirementDraft>;
    return normalizeDraft(parsed, input, "claude");
  } catch {
    return generateRequirementDraft(input);
  }
}

function buildPrompt({ client, project, minutes, ruleLayers }: GenerateRequirementsInput): string {
  const mergedRules = mergeRules(ruleLayers);
  return JSON.stringify(
    {
      output_schema: {
        summary: "string",
        requirements: ["string"],
        missingQuestions: ["string"],
        demoScope: ["string"],
        screens: ["string"],
        features: ["string"],
        productionTasks: ["string"],
        aiRoutes: ["string"]
      },
      client,
      project,
      minutes: minutes.content,
      rules: mergedRules
    },
    null,
    2
  );
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) throw new Error("JSON not found.");
  return trimmed.slice(first, last + 1);
}

function normalizeDraft(
  parsed: Partial<RequirementDraft>,
  { client, project, minutes }: GenerateRequirementsInput,
  generatedBy: RequirementDraft["generatedBy"]
): RequirementDraft {
  const fallback = generateRequirementDraft({ client, project, minutes });
  return {
    ...fallback,
    id: `requirements-${crypto.randomUUID()}`,
    summary: asString(parsed.summary, fallback.summary),
    requirements: asStringArray(parsed.requirements, fallback.requirements),
    missingQuestions: asStringArray(parsed.missingQuestions, fallback.missingQuestions),
    demoScope: asStringArray(parsed.demoScope, fallback.demoScope),
    screens: asStringArray(parsed.screens, fallback.screens),
    features: asStringArray(parsed.features, fallback.features),
    productionTasks: asStringArray(parsed.productionTasks, fallback.productionTasks),
    aiRoutes: asStringArray(parsed.aiRoutes, fallback.aiRoutes),
    generatedBy,
    generatedAt: new Date().toISOString()
  };
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return items.length > 0 ? items : fallback;
}
