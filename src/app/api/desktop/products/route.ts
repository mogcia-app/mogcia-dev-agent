import { desktopFailure, desktopSuccess } from "@/lib/desktop/api";
import { authenticateDesktopRequest, withDesktopAudit } from "@/lib/desktop/auth";
import { createProduct, listProducts, toDesktopProductPayload, updateProduct } from "@/lib/server/business/product-service";
import { getUserDisplayNameById } from "@/lib/user-display";

export async function GET(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "readCompanies");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const data = await withDesktopAudit(context, "product_read", async () => {
      const products = await listProducts(toBusinessAuth(auth), { limit: 400 });
      return { products: products.map(toDesktopProductPayload) };
    });
    return desktopSuccess(data);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit(context, "product_create", () => createProduct(toBusinessAuth(auth), body));
    return desktopSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return desktopFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateDesktopRequest(request, "createTasks");
    const context = { userId: auth.userId, deviceId: auth.device.id };
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withDesktopAudit(context, "product_update", () => updateProduct(toBusinessAuth(auth), body), String(body.id ?? body.productId ?? ""));
    return desktopSuccess({ product: toDesktopProductPayload(data.product) });
  } catch (error) {
    return desktopFailure(error);
  }
}

function toBusinessAuth(auth: Awaited<ReturnType<typeof authenticateDesktopRequest>>) {
  return {
    db: auth.db,
    userId: auth.userId,
    userName: getUserDisplayNameById(auth.userId),
    source: "desktop" as const,
    deviceId: auth.device.id
  };
}
