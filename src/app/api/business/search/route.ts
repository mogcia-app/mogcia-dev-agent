import { authenticateBusinessRequest, businessFailure, businessSuccess } from "@/lib/server/business/api";
import { searchKnowledgeNodes } from "@/lib/server/agent-knowledge";

export const runtime = "nodejs";

type SearchResult = { id: string; type: "lead" | "company" | "product" | "knowledge" | "template"; title: string; subtitle: string; href: string };

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase() ?? "";
    if (query.length < 1) return businessSuccess({ results: [] });
    const specs = [
      { collection: "leads", type: "lead" as const, fields: ["companyName", "contactName", "productName", "nextActionTitle"], href: (id: string) => `/leads?leadId=${id}` },
      { collection: "companies", type: "company" as const, fields: ["name", "industry", "primaryContactName", "notes"], href: (id: string) => `/sales/companies?id=${id}` },
      { collection: "products", type: "product" as const, fields: ["name", "displayName", "tagline", "summary"], href: (id: string) => `/products?id=${id}` },
      { collection: "businessTemplates", type: "template" as const, fields: ["title", "subject", "description", "content"], href: (id: string) => `/templates?id=${id}` }
    ];
    const groups = await Promise.all(specs.map(async (spec) => {
      const snapshot = await auth.db.collection(spec.collection).limit(500).get();
      return snapshot.docs.flatMap((entry): SearchResult[] => {
        const data = entry.data();
        const values = spec.fields.map((field) => typeof data[field] === "string" ? data[field] as string : "");
        if (!values.join("\n").toLocaleLowerCase().includes(query)) return [];
        return [{ id: entry.id, type: spec.type, title: values[0] || "名称未設定", subtitle: values.slice(1).find(Boolean) || "", href: spec.href(entry.id) }];
      }).slice(0, 8);
    }));
    const knowledge = (await searchKnowledgeNodes(query, 8)).map((item): SearchResult => ({ id: item.id, type: "knowledge", title: item.title, subtitle: item.path, href: `/knowledge?nodeId=${item.id}` }));
    return businessSuccess({ results: [...groups.flat(), ...knowledge] });
  } catch (error) { return businessFailure(error); }
}
