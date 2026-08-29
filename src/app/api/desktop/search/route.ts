import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireDesktopUserFromRequest } from "@/lib/desktop/auth";

type SearchResult = { id: string; type: "company" | "product" | "lead" | "task" | "calendar"; title: string; subtitle: string; targetURL: string };

export async function GET(request: Request) {
  try {
    const user = await requireDesktopUserFromRequest(request, "readCompanies");
    const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase("ja-JP") ?? "";
    if (query.length < 2) return NextResponse.json({ success: true, data: { results: [] } });
    const db = getAdminDb();
    const [companies, products, leads, tasks, events] = await Promise.all([
      db.collection("companies").orderBy("updatedAt", "desc").limit(150).get(),
      db.collection("products").orderBy("updatedAt", "desc").limit(100).get(),
      db.collection("leads").orderBy("updatedAt", "desc").limit(150).get(),
      db.collection("tasks").where("assigneeId", "==", user.uid).limit(100).get(),
      db.collection("calendarEvents").orderBy("startAt", "desc").limit(100).get()
    ]);
    const results: SearchResult[] = [];
    const add = (result: SearchResult, searchable: unknown[]) => {
      if (searchable.map((value) => String(value ?? "")).join(" ").toLocaleLowerCase("ja-JP").includes(query)) results.push(result);
    };
    companies.docs.forEach((doc) => { const value = doc.data(); add({ id: doc.id, type: "company", title: value.name || "会社名未設定", subtitle: [value.industry, value.prefecture].filter(Boolean).join(" / ") || "Company", targetURL: `/sales/companies?id=${encodeURIComponent(doc.id)}` }, [value.name, value.industry, value.prefecture, value.city, value.website]); });
    products.docs.forEach((doc) => { const value = doc.data(); add({ id: doc.id, type: "product", title: value.displayName || value.name || "商材名未設定", subtitle: value.tagline || "商材", targetURL: `/products?id=${encodeURIComponent(doc.id)}` }, [value.name, value.displayName, value.tagline, value.summary, ...(value.categoryNames ?? [])]); });
    leads.docs.forEach((doc) => { const value = doc.data(); add({ id: doc.id, type: "lead", title: value.companyName || value.name || "営業先未設定", subtitle: [value.contactName, value.productName].filter(Boolean).join(" / ") || "営業リスト", targetURL: `/leads?leadId=${encodeURIComponent(doc.id)}` }, [value.companyName, value.name, value.contactName, value.productName, value.email, value.phone]); });
    tasks.docs.forEach((doc) => { const value = doc.data(); add({ id: doc.id, type: "task", title: value.title || "無題のタスク", subtitle: value.companyName || "タスク", targetURL: "/tasks" }, [value.title, value.companyName, value.description]); });
    events.docs.forEach((doc) => { const value = doc.data(); add({ id: doc.id, type: "calendar", title: value.title || "無題の予定", subtitle: value.companyName || value.productName || "予定", targetURL: "/calendar" }, [value.title, value.companyName, value.productName, value.location, value.description]); });
    return NextResponse.json({ success: true, data: { results: results.slice(0, 12) } });
  } catch (error) {
    return NextResponse.json({ success: false, error: { message: error instanceof Error ? error.message : "search_failed" } }, { status: 401 });
  }
}
