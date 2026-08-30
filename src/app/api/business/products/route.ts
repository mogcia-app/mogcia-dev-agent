import { authenticateBusinessRequest, businessFailure, businessSuccess, requireString, withBusinessAudit } from "@/lib/server/business/api";
import { createProduct, deleteProduct, listProducts, reorderProducts, setProductFavorite, updateProduct } from "@/lib/server/business/product-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "readCompanies");
    const data = await withBusinessAudit(auth, "business_product_read", async () => ({ products: await listProducts(auth) }));
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const data = await withBusinessAudit(auth, "business_product_create", () => createProduct(auth, body));
    return businessSuccess(data, data.requiresConfirmation ? 200 : 201);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "reorder") {
      const data = await withBusinessAudit(auth, "business_product_update", () => reorderProducts(auth, Array.isArray(body.products) ? body.products as Array<{ id?: unknown; productId?: unknown }> : []), null);
      return businessSuccess(data);
    }
    const productId = action === "reorder" ? null : requireString(body.id ?? body.productId, "商品ID", 160);
    const data = await withBusinessAudit(auth, "business_product_update", () => {
      if (action === "favorite") return setProductFavorite(auth, productId ?? "", body.favorite === true);
      return updateProduct(auth, body);
    }, productId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authenticateBusinessRequest(request, "createTasks");
    const body = (await request.json()) as Record<string, unknown>;
    const productId = requireString(body.id ?? body.productId, "商品ID", 160);
    const data = await withBusinessAudit(auth, "business_product_delete", () => deleteProduct(auth, productId), productId);
    return businessSuccess(data);
  } catch (error) {
    return businessFailure(error);
  }
}
