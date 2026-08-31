import { authenticateBusinessRequest, businessFailure, businessSuccess, withBusinessAudit } from "@/lib/server/business/api";
import { generateBusinessTemplateContent } from "@/lib/server/business/template-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request);
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withBusinessAudit(auth, "business_template_generate", () => generateBusinessTemplateContent(auth, body), typeof body.templateId === "string" ? body.templateId : null);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
